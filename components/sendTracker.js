// Client-side send tracking. Lives in localStorage on purpose: the app runs
// on Vercel serverless where server memory is wiped between invocations, so
// the browser is the only place a reliable running count can live. Counts
// are passed to the server with each send request.
//
// TWO JOBS:
//  1. Rolling 24-hour send counts per account, matching how Google actually
//     enforces its limit (NOT a calendar-day reset — Gmail uses a rolling
//     window, so 490 sent at 11pm doesn't free up at midnight).
//  2. A permanent record of every address ever emailed, so the same business
//     never gets contacted twice across separate runs, niches or months.

const SENDS_KEY = 'rmv2_send_events'        // [{ account, at }] rolling window
const CONTACTED_KEY = 'rmv2_contacted_emails' // { "email": firstContactedISO }

const DAY_MS = 24 * 60 * 60 * 1000

function readSends() {
  try {
    const raw = JSON.parse(localStorage.getItem(SENDS_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

// Drop anything older than 24h — that capacity has genuinely freed up.
function pruneSends(events) {
  const cutoff = Date.now() - DAY_MS
  return events.filter(e => e && typeof e.at === 'number' && e.at > cutoff)
}

function writeSends(events) {
  try { localStorage.setItem(SENDS_KEY, JSON.stringify(events)) } catch {}
}

// { "email@gmail.com": 12, ... } — sends in the last rolling 24 hours.
export function getAccountCounts() {
  const events = pruneSends(readSends())
  const counts = {}
  for (const e of events) counts[e.account] = (counts[e.account] || 0) + 1
  return counts
}

export function getTodaySentCount() {
  return pruneSends(readSends()).length
}

export function recordSend(account) {
  const events = pruneSends(readSends())
  events.push({ account: account || 'unknown', at: Date.now() })
  writeSends(events)
}

// When does the oldest send in the window expire? Lets the UI say
// "capacity frees up at 9:42pm" instead of implying a midnight reset.
export function getNextCapacityFreeUp(account) {
  const events = pruneSends(readSends()).filter(e => !account || e.account === account)
  if (!events.length) return null
  const oldest = Math.min(...events.map(e => e.at))
  return new Date(oldest + DAY_MS)
}

// ---------- PERMANENT CONTACT HISTORY ----------
// Deliberately never expires. A business emailed in a Victorian plumber
// sweep must not be emailed again in a nationwide sweep months later.

function readContacted() {
  try {
    const raw = JSON.parse(localStorage.getItem(CONTACTED_KEY) || '{}')
    return (raw && typeof raw === 'object') ? raw : {}
  } catch { return {} }
}

export function hasBeenContacted(email) {
  if (!email) return false
  return !!readContacted()[email.trim().toLowerCase()]
}

export function whenContacted(email) {
  if (!email) return null
  return readContacted()[email.trim().toLowerCase()] || null
}

export function markContacted(email) {
  if (!email) return
  try {
    const all = readContacted()
    const key = email.trim().toLowerCase()
    if (!all[key]) {
      all[key] = new Date().toISOString()
      localStorage.setItem(CONTACTED_KEY, JSON.stringify(all))
    }
  } catch {}
}

export function getContactedCount() {
  return Object.keys(readContacted()).length
}

// Exported so Settings can back up / restore / clear the history.
export function exportContacted() { return readContacted() }
export function importContacted(obj) {
  try {
    const existing = readContacted()
    const merged = { ...obj, ...existing } // keep earliest known contact date
    localStorage.setItem(CONTACTED_KEY, JSON.stringify(merged))
    return Object.keys(merged).length
  } catch { return 0 }
}
export function clearContacted() {
  try { localStorage.removeItem(CONTACTED_KEY) } catch {}
}

// Combines rolling counts with the server's account config for the UI.
export function buildCapacityView(config) {
  const counts = getAccountCounts()
  if (!config?.accounts?.length) return null
  const accounts = config.accounts.map(a => {
    const sent = counts[a.user] || 0
    return {
      user: a.user,
      sent,
      remaining: Math.max(0, config.capPerAccount - sent),
      broken: a.broken,
      brokenReason: a.brokenReason,
      freesUpAt: sent >= config.capPerAccount ? getNextCapacityFreeUp(a.user) : null,
    }
  })
  return {
    accounts,
    totalSent: accounts.reduce((s, a) => s + a.sent, 0),
    totalCapacity: config.totalDailyCapacity,
    totalRemaining: accounts.reduce((s, a) => s + (a.broken ? 0 : a.remaining), 0),
    anyBroken: accounts.some(a => a.broken),
  }
}
