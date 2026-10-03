// Renders explainer.html to MP4, frame by frame (deterministic, no screen recording).
//
// Usage (from the repo root; uses the Playwright already in devDependencies + system ffmpeg):
//   node docs/video-explainer/render.mjs                       # both formats
//   node docs/video-explainer/render.mjs --format vertical     # 1080x1920 only
//   node docs/video-explainer/render.mjs --format landscape    # 1920x1080 only
//   node docs/video-explainer/render.mjs --stills 2,8,15,22,29 # PNG stills at those seconds
//
// If Playwright's browser isn't installed, set CHROMIUM_PATH=/path/to/chrome.
// Outputs land next to this script.
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { mkdirSync } from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const page_url = pathToFileURL(path.join(here, 'explainer.html')).href
const FPS = 30
const DURATION_S = 30

const formats = {
  vertical: { w: 1080, h: 1920, out: 'unipicks-explainer.mp4' },
  landscape: { w: 1920, h: 1080, out: 'unipicks-explainer-16x9.mp4' },
}

const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : null
}

async function openPage(browser, { w, h }) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await page.goto(`${page_url}?w=${w}&h=${h}`)
  await page.evaluate(() => window.ready)
  return page
}

async function renderVideo(browser, name) {
  const fmt = formats[name]
  const page = await openPage(browser, fmt)
  const outPath = path.join(here, fmt.out)
  const ffmpeg = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-movflags', '+faststart',
    outPath,
  ], { stdio: ['pipe', 'inherit', 'inherit'] })

  const total = FPS * DURATION_S
  for (let f = 0; f < total; f++) {
    await page.evaluate((ms) => window.seek(ms), (f * 1000) / FPS)
    const png = await page.screenshot({ type: 'png' })
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r))
    if (f % 150 === 0) console.log(`[${name}] frame ${f}/${total}`)
  }
  ffmpeg.stdin.end()
  await new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))))
  await page.close()
  console.log(`[${name}] wrote ${outPath}`)
}

async function renderStills(browser, seconds) {
  mkdirSync(path.join(here, 'stills'), { recursive: true })
  for (const name of Object.keys(formats)) {
    const page = await openPage(browser, formats[name])
    for (const s of seconds) {
      await page.evaluate((ms) => window.seek(ms), s * 1000)
      const file = path.join(here, 'stills', `${name}-${String(s).replace('.', '_')}s.png`)
      await page.screenshot({ path: file })
      console.log(`wrote ${file}`)
    }
    await page.close()
  }
}

// CHROMIUM_PATH lets you point at an existing Chromium if Playwright's bundled one isn't installed.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
try {
  const stills = arg('stills')
  if (stills) {
    await renderStills(browser, stills.split(',').map(Number))
  } else {
    const which = arg('format')
    for (const name of which ? [which] : Object.keys(formats)) await renderVideo(browser, name)
  }
} finally {
  await browser.close()
}
