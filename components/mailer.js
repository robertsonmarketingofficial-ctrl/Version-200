// Server-side only — sends real email via Gmail SMTP using nodemailer.
//
// MULTI-ACCOUNT ROTATION
// Supports several Gmail accounts, used in configured order: account 1 sends
// until it hits the daily cap, then sending moves to account 2, and so on.
//
// NOTE ON LIMITS: the cap below is OUR tally, not Google's rule. Google
// enforces roughly 500 sends/day per free Gmail account on their own servers
// and will reject sends past it regardless of what this app thinks. The
// local counter exists so the app can stop cleanly (and roll to the next
// account) instead of hitting Google's wall blind mid-run.
//
// IMPORTANT — why counts come from the client:
// This runs on Vercel serverless, where in-memory state is wiped between
// invocations. Server-side counters therefore reset constantly and can't be
// trusted. The client (which has persistent localStorage) tracks per-account
// counts and passes them in with each send; the server uses those to decide
// which account to use. Server-side counts are kept only as a fallback for
// when the client doesn't supply them.
//
// CONFIG — two supported formats:
//   Single account (backwards compatible):
//     GMAIL_USER=you@gmail.com
//     GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
//
//   Multiple accounts (comma-separated, order must match):
//     GMAIL_USERS=one@gmail.com,two@gmail.com,three@gmail.com
//     GMAIL_APP_PASSWORDS=pass one,pass two,pass three
//
// NOTE: Google can flag linked accounts doing automated outbound sending.
// Rotation raises total capacity but does not remove that risk — a Google
// Workspace account (2,000/day on one legitimate account) is the lower-risk
// path to the same volume.

import nodemailer from 'nodemailer'

export const DAILY_CAP_PER_ACCOUNT = 490 // Google hard-blocks at ~500/day per account; 490 leaves a small buffer

const transporters = new Map()      // email -> nodemailer transporter
const fallbackCounts = new Map()    // email -> { date, count } (only used if client sends no counts)
const brokenAccounts = new Map()    // email -> { reason, at } — auth failures, skipped until redeploy

// Auth/config failures are permanent until fixed — no point retrying these
// on every single send. Rate limits and network blips are NOT permanent.
function isPermanentFailure(msg = '') {
  const m = msg.toLowerCase()
  return m.includes('invalid login') || m.includes('username and password not accepted') ||
         m.includes('authentication failed') || m.includes('535')
}

// Use Adelaide time for the daily reset, not UTC — otherwise the counter
// rolls over mid-workday instead of overnight.
export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Adelaide' })
}

export function getAccounts() {
  const multiUsers = (process.env.GMAIL_USERS || '').split(',').map(s => s.trim()).filter(Boolean)
  const multiPasses = (process.env.GMAIL_APP_PASSWORDS || '').split(',').map(s => s.trim()).filter(Boolean)

  if (multiUsers.length && multiUsers.length === multiPasses.length) {
    return multiUsers.map((user, i) => ({ user, pass: multiPasses[i] }))
  }
  if (multiUsers.length && multiUsers.length !== multiPasses.length) {
    console.error(`GMAIL_USERS has ${multiUsers.length} entries but GMAIL_APP_PASSWORDS has ${multiPasses.length} — they must match. Falling back to single-account config.`)
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return [{ user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }]
  }
  return []
}

function getFallbackCount(email) {
  const rec = fallbackCounts.get(email)
  if (!rec || rec.date !== todayStr()) return 0
  return rec.count
}

function recordFallbackSend(email) {
  const rec = fallbackCounts.get(email)
  if (!rec || rec.date !== todayStr()) fallbackCounts.set(email, { date: todayStr(), count: 1 })
  else rec.count++
}

function getTransporter(account) {
  if (transporters.has(account.user)) return transporters.get(account.user)
  const t = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: account.user, pass: account.pass },
    pool: true,            // reuse connections instead of reconnecting per email
    maxConnections: 1,
    maxMessages: 100,
  })
  transporters.set(account.user, t)
  return t
}

export function getConfigStatus() {
  const accounts = getAccounts()
  return {
    accountCount: accounts.length,
    accounts: accounts.map(a => ({
      user: a.user,
      broken: brokenAccounts.has(a.user),
      brokenReason: brokenAccounts.get(a.user)?.reason || null,
    })),
    capPerAccount: DAILY_CAP_PER_ACCOUNT,
    totalDailyCapacity: accounts.length * DAILY_CAP_PER_ACCOUNT,
    today: todayStr(),
  }
}

/**
 * Send one email, choosing an account via round-robin across whichever
 * accounts still have capacity.
 *
 * @param counts - optional { "email@gmail.com": 12, ... } of today's sends
 *                 per account, tracked by the client. Strongly preferred,
 *                 since serverless memory can't be trusted.
 */
export async function sendMail({ to, subject, text, counts, preferredAccount }) {
  const accounts = getAccounts()
  if (!accounts.length) {
    return { success: false, error: 'No Gmail accounts configured. Set GMAIL_USERS + GMAIL_APP_PASSWORDS (or GMAIL_USER + GMAIL_APP_PASSWORD for one account).', allExhausted: false }
  }

  const countFor = (email) =>
    (counts && typeof counts[email] === 'number') ? counts[email] : getFallbackCount(email)

  // Eligible = has capacity left today, and isn't known-broken
  let eligible = accounts.filter(a => countFor(a.user) < DAILY_CAP_PER_ACCOUNT && !brokenAccounts.has(a.user))

  if (!eligible.length) {
    const allBroken = accounts.every(a => brokenAccounts.has(a.user))
    return {
      success: false,
      // allExhausted tells the caller to stop the whole run rather than
      // burning through every remaining lead logging identical failures.
      allExhausted: true,
      error: allBroken
        ? `All ${accounts.length} account(s) failed authentication — check your GMAIL_APP_PASSWORDS values.`
        : `All ${accounts.length} account(s) have hit the daily cap of ${DAILY_CAP_PER_ACCOUNT} (${accounts.length * DAILY_CAP_PER_ACCOUNT} total). Try again tomorrow or add another account.`
    }
  }

  // If a specific account was requested, try it first — but still fall back
  // to the others if it's full or fails, rather than giving up.
  if (preferredAccount) {
    const preferred = eligible.find(a => a.user === preferredAccount)
    if (preferred) {
      eligible = [preferred, ...eligible.filter(a => a.user !== preferredAccount)]
    }
  }

  // SEQUENTIAL FILL: use accounts in configured order — fill account 1 to
  // its cap, then move to account 2, and so on.

  let lastError = null
  for (const account of eligible) {
    try {
      const info = await getTransporter(account).sendMail({
        from: `"Callum @ Robertson Marketing" <${account.user}>`,
        to, subject, text,
      })
      recordFallbackSend(account.user)
      return { success: true, messageId: info.messageId, sentFrom: account.user }
    } catch (err) {
      lastError = err.message
      transporters.delete(account.user)
      if (isPermanentFailure(err.message)) {
        // Mark it broken so we stop wasting attempts on it every send
        brokenAccounts.set(account.user, { reason: err.message, at: Date.now() })
      }
      continue // fall through to the next account
    }
  }
  return { success: false, error: lastError || 'All configured accounts failed to send', allExhausted: false }
}
