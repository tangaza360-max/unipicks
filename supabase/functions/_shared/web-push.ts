// Phone alerts (Web Push), sent from Edge Functions with Web Crypto only:
//   * RFC 8291 message encryption (aes128gcm, RFC 8188), so only the phone
//     can read the alert; the push service (Google/Apple/Mozilla) cannot.
//   * RFC 8292 VAPID: a signed token proves the alert comes from Unipicks.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (base64url, from
// `web-push generate-vapid-keys`), VAPID_SUBJECT (mailto: contact).
// Missing secrets = alerts are skipped (logged), never an error.
//
// sendPushToUser never throws and never blocks the caller for more than a
// few seconds: an alert is a bonus on top of the in-app notification.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export type PushMessage = {
  title: string
  body: string
  url: string // a Unipicks path, e.g. "/dashboard/orders"
  tag?: string // a newer alert with the same tag replaces the older one
  ttlSeconds?: number // how long the push service keeps it if the phone is off
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
}

export type PushResult = { sent: number; removed: number; failed: number; skipped?: string }

const encoder = new TextEncoder()
// Bytes backed by a plain ArrayBuffer (what Web Crypto and fetch accept).
type Bytes = Uint8Array<ArrayBuffer>
const REQUEST_TIMEOUT_MS = 5000

export function base64UrlToBytes(value: string): Bytes {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8)
  return new Uint8Array(bits)
}

// RFC 8291 §3.4 + RFC 8188: one record, no padding.
export async function encryptPayload(
  payload: Bytes,
  uaPublicB64: string,
  authSecretB64: string,
  // For tests only (fixed vectors); normally random.
  fixed?: { salt: Bytes; serverKeys: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = base64UrlToBytes(uaPublicB64)
  const authSecret = base64UrlToBytes(authSecretB64)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh key')
  if (authSecret.length < 16) throw new Error('bad auth secret')

  const serverKeys = fixed?.serverKeys ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256),
  )

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const plaintext = concat(payload, new Uint8Array([2])) // 0x02 = last record
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext))

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

// RFC 8292: "vapid t=<ES256 JWT>, k=<public key>".
export async function vapidAuthorization(
  endpoint: string,
  publicKeyB64: string,
  privateKeyB64: string,
  subject: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const publicKey = base64UrlToBytes(publicKeyB64)
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('bad VAPID public key')
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: privateKeyB64,
      x: bytesToBase64Url(publicKey.slice(1, 33)),
      y: bytesToBase64Url(publicKey.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const part = (o: unknown) => bytesToBase64Url(encoder.encode(JSON.stringify(o)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: nowSeconds + 12 * 60 * 60,
    sub: subject,
  })}`
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, encoder.encode(unsigned)),
  )
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${publicKeyB64}`
}

function vapidConfig() {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:unipicks.team@gmail.com'
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null
}

function shorten(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export async function sendPushToUser(
  supabaseAdmin: SupabaseClient,
  userId: string | null | undefined,
  message: PushMessage,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 }
  try {
    if (!userId) return { ...result, skipped: 'no user' }
    const vapid = vapidConfig()
    if (!vapid) {
      console.warn('[web-push] VAPID secrets not set; alert skipped')
      return { ...result, skipped: 'not configured' }
    }

    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (error) throw new Error(`load subscriptions: ${error.message}`)
    if (!subscriptions?.length) return { ...result, skipped: 'no phones' }

    const payload = encoder.encode(JSON.stringify({
      title: shorten(message.title, 80),
      body: shorten(message.body, 200),
      url: message.url,
      tag: message.tag,
    }))

    await Promise.all(subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            Authorization: await vapidAuthorization(sub.endpoint, vapid.publicKey, vapid.privateKey, vapid.subject),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(message.ttlSeconds ?? 3600),
            Urgency: message.urgency ?? 'normal',
          },
          body: await encryptPayload(payload, sub.p256dh, sub.auth),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        await response.body?.cancel()
        if (response.status === 404 || response.status === 410) {
          // The phone unsubscribed or the browser was reset: forget it.
          await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          result.removed += 1
        } else if (response.ok) {
          result.sent += 1
        } else {
          result.failed += 1
          console.error(`[web-push] push service answered ${response.status} (${new URL(sub.endpoint).host})`)
        }
      } catch (sendError) {
        result.failed += 1
        console.error(`[web-push] send failed: ${sendError instanceof Error ? sendError.message : sendError}`)
      }
    }))
  } catch (error) {
    console.error(`[web-push] ${error instanceof Error ? error.message : error}`)
  }
  return result
}
