import React from 'react'

// Matches Rwandan mobile numbers:
//   0788123456   (10 digits, leading 0)
//   250788123456 (country code, no +)
//   +250788123456 (country code with +)
//
// Prefix is required (either 0 or +250/250) so we don't accidentally match
// random 9-digit sequences.
const PHONE_REGEX = /(\+?250|0)7[2389]\d{7}/g

export function linkPhoneNumbers(text) {
  if (!text || typeof text !== 'string') return text

  const parts = []
  let lastIndex = 0
  let match
  const regex = new RegExp(PHONE_REGEX.source, 'g')

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const phone = match[0]
    parts.push(
      <a
        key={`tel-${match.index}`}
        href={`tel:${phone.replace(/\s/g, '')}`}
        className="underline text-accent hover:opacity-80 transition"
        aria-label={`Call ${phone}`}
      >
        {phone}
      </a>
    )
    lastIndex = match.index + phone.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}
