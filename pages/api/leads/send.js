import { sendMail } from '../../../components/mailer'
import { sendSms } from '../../../components/sms'

function fillTemplate(text, lead) {
  return (text || '')
    .replaceAll('{{name}}', lead.name || '')
    .replaceAll('{{category}}', lead.category || 'business')
    .replaceAll('{{rating}}', lead.rating ? String(lead.rating) : '')
    .replaceAll('{{reviewCount}}', lead.reviewCount ? String(lead.reviewCount) : '')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { leads, subject, body, channel, counts, preferredAccount } = req.body
  // channel: 'email' | 'sms'
  if (!Array.isArray(leads) || !leads.length || !body) {
    return res.status(400).json({ error: 'leads (array) and body are required' })
  }

  const results = []

  for (const lead of leads) {
    if (channel === 'sms') {
      if (!lead.phone) {
        results.push({ id: lead.id, status: 'skipped', reason: 'no phone' })
        continue
      }
      const result = await sendSms({ to: lead.phone, body: fillTemplate(body, lead) })
      results.push(result.success
        ? { id: lead.id, status: 'sent', providerId: result.messageId }
        : { id: lead.id, status: 'failed', error: result.error, allExhausted: result.allExhausted })
    } else {
      if (!lead.email) {
        results.push({ id: lead.id, status: 'skipped', reason: 'no email' })
        continue
      }
      const result = await sendMail({
        to: lead.email,
        subject: fillTemplate(subject, lead) || 'Quick note',
        text: fillTemplate(body, lead),
        counts,
        preferredAccount,
      })
      results.push(result.success
        ? { id: lead.id, status: 'sent', providerId: result.messageId, sentFrom: result.sentFrom }
        : { id: lead.id, status: 'failed', error: result.error, allExhausted: result.allExhausted })
    }
  }

  res.status(200).json({ results })
}
