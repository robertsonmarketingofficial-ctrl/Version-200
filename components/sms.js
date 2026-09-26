// Server-side only — sends real SMS via Twilio. Mirrors mailer.js's shape
// (never throws, returns { success, error }) so calling code handles both
// channels identically.

import twilio from 'twilio'

let client = null

function getClient() {
  if (client) return client
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  return client
}

// Leads are stored in normal AU format (e.g. "0412 345 678" or "(08) 8123 4567")
// but Twilio requires strict E.164 (+614...). Converts, or returns null if it
// doesn't look like a valid AU mobile/landline.
export function toE164AU(phone) {
  if (!phone) return null
  const digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+61')) return digits
  if (digits.startsWith('61')) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+61' + digits.slice(1)
  return null
}

export async function sendSms({ to, body }) {
  const c = getClient()
  if (!c) {
    return { success: false, error: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set in environment variables' }
  }
  if (!process.env.TWILIO_PHONE_NUMBER) {
    return { success: false, error: 'TWILIO_PHONE_NUMBER not set in environment variables' }
  }
  const formatted = toE164AU(to)
  if (!formatted) {
    return { success: false, error: `Phone number "${to}" doesn't look like a valid AU number` }
  }
  try {
    const msg = await c.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formatted,
      body: body + '\n\nReply STOP to opt out.',
    })
    return { success: true, messageId: msg.sid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
