process.env.GMAIL_USERS = 'a@gmail.com,b@gmail.com,c@gmail.com,d@gmail.com'
process.env.GMAIL_APP_PASSWORDS = 'p1,p2,p3,p4'

// Mock nodemailer so no real SMTP is attempted
const sent = []
const { default: Module } = await import('module')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (req, ...args) {
  if (req === 'nodemailer') return 'FAKE_NM'
  return origResolve.call(this, req, ...args)
}
const { createRequire } = await import('module')
const require = createRequire(import.meta.url)
require.cache['FAKE_NM'] = { exports: { default: {
  createTransport: (opts) => ({
    sendMail: async (mail) => {
      sent.push(opts.auth.user)
      return { messageId: 'id-' + sent.length }
    }
  })
}}}

const { sendMail, getConfigStatus, todayStr } = await import('./components/mailer.js')

console.log('Config:', JSON.stringify(getConfigStatus(), null, 2))
console.log('Adelaide date:', todayStr(), '| UTC date:', new Date().toISOString().slice(0,10))

// Simulate 12 sends with client-tracked counts (as the real app does)
const counts = {}
for (let i = 0; i < 12; i++) {
  const r = await sendMail({ to: 't@e.com', subject: 's', text: 'b', counts })
  if (!r.success) throw new Error('Send failed: ' + r.error)
  counts[r.sentFrom] = (counts[r.sentFrom] || 0) + 1
}

console.log('\nDistribution after 12 sends:', JSON.stringify(counts))
const values = Object.values(counts)
if (Object.keys(counts).length !== 4) throw new Error(`Expected all 4 accounts used, got ${Object.keys(counts).length}`)
if (Math.max(...values) - Math.min(...values) > 1) throw new Error('Round-robin uneven: ' + JSON.stringify(counts))
console.log('✅ Round-robin works — all 4 accounts used evenly (3 each)')

// Test cap enforcement: mark 3 accounts as full
const nearFull = { 'a@gmail.com': 450, 'b@gmail.com': 450, 'c@gmail.com': 450, 'd@gmail.com': 10 }
const r2 = await sendMail({ to: 't@e.com', subject: 's', text: 'b', counts: nearFull })
if (r2.sentFrom !== 'd@gmail.com') throw new Error(`Should have used the only account with capacity, used ${r2.sentFrom}`)
console.log('✅ Cap enforcement works — correctly skipped the 3 full accounts')

// Test all-full case
const allFull = { 'a@gmail.com': 450, 'b@gmail.com': 450, 'c@gmail.com': 450, 'd@gmail.com': 450 }
const r3 = await sendMail({ to: 't@e.com', subject: 's', text: 'b', counts: allFull })
if (r3.success) throw new Error('Should have refused to send when all accounts are at cap')
if (!r3.error.includes('daily cap')) throw new Error('Wrong error: ' + r3.error)
console.log('✅ All-full case handled:', r3.error)
