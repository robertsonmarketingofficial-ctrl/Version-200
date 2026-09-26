// End-to-end test of the real mailer (real nodemailer, real SMTP protocol)
// against a local SMTP server — no Gmail credentials or network needed.
// Run: npm test
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { SMTPServer } from 'smtp-server'

const GOOD_PASS = 'abcdefghijklmnop'
const received = [] // { from, to, authUser, body }
let server

before(async () => {
  server = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    authOptional: false,
    logger: false,
    onAuth(auth, session, cb) {
      if (auth.password === GOOD_PASS) return cb(null, { user: auth.username })
      const err = new Error('5.7.8 Username and Password not accepted'); err.responseCode = 535
      cb(err)
    },
    onRcptTo(addr, session, cb) {
      if (addr.address.startsWith('bounce@')) {
        const err = new Error('5.1.1 Recipient address rejected: no such user'); err.responseCode = 550
        return cb(err)
      }
      cb()
    },
    onData(stream, session, cb) {
      let body = ''
      stream.on('data', c => { body += c })
      stream.on('end', () => {
        received.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map(r => r.address), authUser: session.user, body })
        cb()
      })
    },
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(server.server.address().port)
  process.env.SMTP_SECURE = 'false'
  // Pasted exactly how Google displays them: groups of four, plus quotes on one.
  process.env.GMAIL_USERS = 'one@gmail.com, two@gmail.com ,"three@gmail.com"'
  process.env.GMAIL_APP_PASSWORDS = 'abcd efgh ijkl mnop,"abcd efgh ijkl mnop",abcdefghijklmnop'
})

after(() => new Promise(r => server.close(r)))

const load = () => import('../components/mailer.js')

test('parses accounts and strips spaces/quotes from app passwords', async () => {
  const { getAccounts } = await load()
  assert.deepEqual(getAccounts(), [
    { user: 'one@gmail.com', pass: GOOD_PASS },
    { user: 'two@gmail.com', pass: GOOD_PASS },
    { user: 'three@gmail.com', pass: GOOD_PASS },
  ])
})

test('verifyAccounts logs in to every account', async () => {
  const { verifyAccounts } = await load()
  const v = await verifyAccounts()
  assert.equal(v.okCount, 3)
  assert.deepEqual(v.passwordLengths, [16, 16, 16])
})

test('sends a real message from the first account with capacity', async () => {
  const { sendMail } = await load()
  received.length = 0
  const r = await sendMail({ to: 'lead@example.com', subject: 'Hi', text: 'Hello there', counts: {} })
  assert.equal(r.success, true, r.error)
  assert.equal(r.sentFrom, 'one@gmail.com')
  assert.equal(received.length, 1)
  assert.equal(received[0].authUser, 'one@gmail.com')
  assert.deepEqual(received[0].to, ['lead@example.com'])
  assert.match(received[0].body, /Hello there/)
  assert.match(received[0].body, /Callum @ Robertson Marketing/)
})

test('rolls to the next account when one is at the daily cap', async () => {
  const { sendMail, DAILY_CAP_PER_ACCOUNT } = await load()
  const r = await sendMail({ to: 'lead@example.com', subject: 'Hi', text: 'x', counts: { 'one@gmail.com': DAILY_CAP_PER_ACCOUNT } })
  assert.equal(r.success, true, r.error)
  assert.equal(r.sentFrom, 'two@gmail.com')
})

test('honours the preferred account', async () => {
  const { sendMail } = await load()
  const r = await sendMail({ to: 'lead@example.com', subject: 'Hi', text: 'x', counts: {}, preferredAccount: 'three@gmail.com' })
  assert.equal(r.sentFrom, 'three@gmail.com')
})

test('stops with allExhausted when every account is capped', async () => {
  const { sendMail, DAILY_CAP_PER_ACCOUNT: cap } = await load()
  const r = await sendMail({ to: 'lead@example.com', subject: 'Hi', text: 'x', counts: { 'one@gmail.com': cap, 'two@gmail.com': cap, 'three@gmail.com': cap } })
  assert.equal(r.success, false)
  assert.equal(r.allExhausted, true)
})

test('a rejected recipient fails fast without burning other accounts', async () => {
  const { sendMail } = await load()
  received.length = 0
  const r = await sendMail({ to: 'bounce@example.com', subject: 'Hi', text: 'x', counts: {} })
  assert.equal(r.success, false)
  assert.equal(r.allExhausted, false)
  assert.match(r.error, /rejected/i)
  assert.equal(received.length, 0)
})

test('invalid address is refused before touching SMTP', async () => {
  const { sendMail } = await load()
  const r = await sendMail({ to: 'not-an-email', subject: 'Hi', text: 'x', counts: {} })
  assert.equal(r.success, false)
  assert.match(r.error, /not a valid email/)
})

test('a wrong app password is explained, marked broken, and the next account is used', async () => {
  process.env.GMAIL_USERS = 'bad@gmail.com,good@gmail.com'
  process.env.GMAIL_APP_PASSWORDS = 'wrongpassword123,abcd efgh ijkl mnop'
  const { sendMail, verifyAccounts, getConfigStatus } = await load()

  const v = await verifyAccounts()
  assert.equal(v.okCount, 1)
  const bad = v.accounts.find(a => a.user === 'bad@gmail.com')
  assert.equal(bad.ok, false)
  assert.match(bad.error, /App Password/)

  const r = await sendMail({ to: 'lead@example.com', subject: 'Hi', text: 'x', counts: {} })
  assert.equal(r.success, true, r.error)
  assert.equal(r.sentFrom, 'good@gmail.com')
  assert.equal(getConfigStatus().accounts.find(a => a.user === 'bad@gmail.com').broken, true)
})

test('all accounts failing login reports allExhausted with a clear reason', async () => {
  process.env.GMAIL_USERS = 'bad1@gmail.com,bad2@gmail.com'
  process.env.GMAIL_APP_PASSWORDS = 'nope,nope'
  const { sendMail } = await load()
  const first = await sendMail({ to: 'lead@example.com', subject: 'Hi', text: 'x', counts: {} })
  assert.equal(first.success, false)
  assert.equal(first.allExhausted, true)
  assert.match(first.error, /Gmail rejected the login/)
})
