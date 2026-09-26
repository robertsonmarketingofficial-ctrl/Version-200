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
//   App passwords may be pasted with or without the spaces Google shows
//   ("abcd efgh ijkl mnop") — spaces and stray quotes are stripped.
//
//   Optional SMTP override (Google Workspace relay, Outlook, a test server):
//     SMTP_HOST=smtp.example.com  SMTP_PORT=587  SMTP_SECURE=false
//
// NOTE: Google can flag linked accounts doing automated outbound sending.
// Rotation raises total capacity but does not remove that risk — a Google
// Workspace account (2,000/day on one legitimate account) is the lower-risk
// path to the same volume.

import nodemailer from 'nodemailer'

export const DAILY_CAP_PER_ACCOUNT = 490 // Google hard-blocks at ~500/day per account; 490 leaves a small buffer
const SEND_BUDGET_MS = Number(process.env.SEND_BUDGET_MS || 35000)

const transporters = new Map()      // email -> nodemailer transporter
const fallbackCounts = new Map()    // email -> { date, count } (only used if client sends no counts)
const brokenAccounts = new Map()    // email -> { reason, at } — auth failures, skipped until redeploy

// Auth/config failures are permanent until fixed — no point retrying these
// on every single send. Rate limits and network blips are NOT permanent.
function isPermanentFailure(err) {
  const m = (err?.message || String(err || '')).toLowerCase()
  return err?.code === 'EAUTH' || err?.responseCode === 535 || err?.responseCode === 534 ||
         m.includes('invalid login') || m.includes('username and password not accepted') ||
         m.includes('authentication failed') || m.includes('application-specific password required')
}

// Turn nodemailer/Gmail errors into something actionable in the UI log.
export function explainError(err) {
  const raw = err?.message || String(err || 'Unknown error')
  const m = raw.toLowerCase()
  if (m.includes('application-specific password required') || err?.responseCode === 534)
    return `Gmail requires an App Password, not your normal password (turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords). [${raw}]`
  if (isPermanentFailure(err))
    return `Gmail rejected the login — check the address and 16-character App Password for this account. [${raw}]`
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNECTION' || m.includes('timeout') || m.includes('greeting never received'))
    return `Could not reach Gmail's SMTP server in time (${err?.code || 'timeout'}). Usually temporary — it will be retried. [${raw}]`
  if (err?.responseCode === 550 || err?.responseCode === 553 || m.includes('recipient address rejected') || m.includes('no such user'))
    return `Recipient address rejected: ${raw}`
  if (err?.responseCode === 421 || err?.responseCode === 454 || m.includes('daily user sending limit') || m.includes('rate limit'))
    return `Gmail is rate-limiting this account: ${raw}`
  return raw
}

// Recipient-side problems (bad address) — trying another account won't help.
function isRecipientFailure(err) {
  const m = (err?.message || '').toLowerCase()
  return err?.code === 'EENVELOPE' || err?.responseCode === 550 || err?.responseCode === 553 ||
         m.includes('recipient address rejected') || m.includes('no such user')
}

// Gmail's own "you've sent too much today" — treat the account as full.
function isQuotaFailure(err) {
  const m = (err?.message || '').toLowerCase()
  return m.includes('daily user sending limit') || m.includes('sending limit exceeded') ||
         (err?.responseCode === 550 && m.includes('5.4.5'))
}

// Use Adelaide time for the daily reset, not UTC — otherwise the counter
// rolls over mid-workday instead of overnight.
export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Adelaide' })
}

// Env values are often pasted with surrounding quotes, and Google displays
// app passwords as four groups of four ("abcd efgh ijkl mnop"). App
// passwords never contain spaces, so strip all whitespace from them.
const cleanUser = (v = '') => v.trim().replace(/^["']|["']$/g, '').trim()
const cleanPass = (v = '') => v.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '')

export function getAccounts() {
  const multiUsers = (process.env.GMAIL_USERS || '').split(',').map(cleanUser).filter(Boolean)
  const multiPasses = (process.env.GMAIL_APP_PASSWORDS || '').split(',').map(cleanPass).filter(Boolean)

  if (multiUsers.length && multiUsers.length === multiPasses.length) {
    return multiUsers.map((user, i) => ({ user, pass: multiPasses[i] }))
  }
  if (multiUsers.length && multiUsers.length !== multiPasses.length) {
    console.error(`GMAIL_USERS has ${multiUsers.length} entries but GMAIL_APP_PASSWORDS has ${multiPasses.length} — they must match. Falling back to single-account config.`)
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return [{ user: cleanUser(process.env.GMAIL_USER), pass: cleanPass(process.env.GMAIL_APP_PASSWORD) }]
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

// WHY NO CONNECTION POOL: on Vercel the function is frozen between
// requests. A pooled SMTP socket left open across a freeze is dead when the
// function thaws, and the next send fails with "Connection closed" or hangs
// until Vercel's 60s limit kills the request (the browser then gets an HTML
// 504 page instead of JSON). A fresh connection per send costs ~1s and is
// reliable.
//
// Explicit timeouts keep one slow/unreachable account from eating the whole
// 60s budget — it fails fast and the next account is tried instead.
function smtpOptions(account) {
  const host = process.env.SMTP_HOST
  if (host) {
    const port = Number(process.env.SMTP_PORT || 587)
    return {
      host, port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user: account.user, pass: account.pass },
    }
  }
  return {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: account.user, pass: account.pass },
  }
}

function getTransporter(account) {
  if (transporters.has(account.user)) return transporters.get(account.user)
  const t = nodemailer.createTransport({
    ...smtpOptions(account),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    dnsTimeout: 8000,
  })
  transporters.set(account.user, t)
  return t
}

/**
 * Actually log in to every configured account (SMTP AUTH, no email sent).
 * Server memory is wiped between invocations, so "broken" flags alone can't
 * tell the UI whether a password is wrong — this can.
 */
export async function verifyAccounts() {
  const accounts = getAccounts()
  const results = await Promise.all(accounts.map(async (a) => {
    const started = Date.now()
    try {
      await getTransporter(a).verify()
      brokenAccounts.delete(a.user)
      return { user: a.user, ok: true, ms: Date.now() - started }
    } catch (err) {
      transporters.delete(a.user)
      if (isPermanentFailure(err)) brokenAccounts.set(a.user, { reason: err.message, at: Date.now() })
      return { user: a.user, ok: false, error: explainError(err), code: err.code || null, ms: Date.now() - started }
    }
  }))
  return {
    accountCount: accounts.length,
    okCount: results.filter(r => r.ok).length,
    accounts: results,
    passwordLengths: accounts.map(a => a.pass.length), // 16 expected for Gmail App Passwords
  }
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

  const recipient = String(to || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { success: false, error: `"${to}" is not a valid email address`, allExhausted: false }
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'Callum @ Robertson Marketing'
  const errors = []
  let quotaHits = 0
  // Vercel kills the function at 60s. Stop trying further accounts once
  // ~35s have gone, so the caller always gets a real JSON answer back.
  const deadline = Date.now() + SEND_BUDGET_MS
  for (const account of eligible) {
    if (errors.length && Date.now() > deadline) {
      errors.push('Stopped trying other accounts to stay inside the server time limit — will retry.')
      break
    }
    try {
      const info = await getTransporter(account).sendMail({
        from: { name: fromName, address: account.user },
        to: recipient, subject, text,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
      })
      recordFallbackSend(account.user)
      // Gmail can accept the message but reject every recipient
      if (info.rejected?.length && !info.accepted?.length) {
        return { success: false, error: `Recipient rejected by Gmail: ${info.rejected.join(', ')}`, allExhausted: false }
      }
      return { success: true, messageId: info.messageId, sentFrom: account.user }
    } catch (err) {
      transporters.delete(account.user)
      const msg = explainError(err)
      console.error(`[mailer] send via ${account.user} to ${recipient} failed:`, err.code, err.responseCode, err.message)
      errors.push(`${account.user}: ${msg}`)
      if (isRecipientFailure(err)) {
        // The address itself is bad — another account would fail the same way.
        return { success: false, error: msg, allExhausted: false }
      }
      if (isPermanentFailure(err)) {
        // Mark it broken so we stop wasting attempts on it every send
        brokenAccounts.set(account.user, { reason: msg, at: Date.now() })
      }
      if (isQuotaFailure(err)) {
        quotaHits++
        fallbackCounts.set(account.user, { date: todayStr(), count: DAILY_CAP_PER_ACCOUNT })
      }
      continue // fall through to the next account
    }
  }
  const everyAccountDead = accounts.every(a => brokenAccounts.has(a.user)) || quotaHits === eligible.length
  return {
    success: false,
    error: errors.join(' | ') || 'All configured accounts failed to send',
    allExhausted: everyAccountDead,
  }
}
