import { verifyAccounts } from '../../components/mailer'

// Logs in to every configured Gmail account over SMTP (no email is sent) and
// reports which ones actually work. /api/email-capacity only reports what is
// CONFIGURED; this reports what can actually SEND.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()
  try {
    res.status(200).json(await verifyAccounts())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
