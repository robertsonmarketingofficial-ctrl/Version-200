import { getConfigStatus } from '../../components/mailer'

// Returns the server's account CONFIG (how many accounts, which ones are
// broken, the per-account cap). Actual usage counts come from the client,
// since serverless memory can't hold them reliably.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  try {
    res.status(200).json(getConfigStatus())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
