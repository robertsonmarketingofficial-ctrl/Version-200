// Step 2 of AFK mode: called once per business, in a loop, from the client.
// For email: scrapes the website for an email if not already known, then
// sends via Gmail SMTP. For SMS: uses the phone number Google Places already
// returned, sends via Twilio. Fully self-contained so a single slow/broken
// website can't hold up the whole run.

import { sendMail } from '../../components/mailer'
import { sendSms } from '../../components/sms'

function fillTemplate(text, lead) {
  return (text || '')
    .replaceAll('{{name}}', lead.name || '')
    .replaceAll('{{category}}', lead.category || 'business')
    .replaceAll('{{rating}}', lead.rating ? String(lead.rating) : '')
    .replaceAll('{{reviewCount}}', lead.reviewCount ? String(lead.reviewCount) : '')
}

async function scrapeEmail(website) {
  if (!website) return null
  let parsed
  try {
    parsed = new URL(website)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
  } catch { return null }

  // Social-only pages can't be scraped for a contact address this way.
  const host = parsed.hostname.toLowerCase()
  if (['facebook.com','www.facebook.com','instagram.com','www.instagram.com','linkedin.com','www.linkedin.com','tiktok.com','youtube.com']
      .some(h => host === h || host.endsWith('.' + h))) return null

  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

  const isJunk = (e) => {
    const l = e.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return true
    const junk = ['noreply','no-reply','donotreply','do-not-reply','example.','test@','sentry.','wixpress.',
      'schema.org','w3.org','wordpress.','shopify.','squarespace.','cloudflare.','godaddy.','.png','.jpg','.jpeg',
      '.gif','.svg','.webp','.js','.css','@2x','sentry-next','yourdomain','domain.com','email.com','user@']
    return junk.some(j => l.includes(j))
  }

  // Prefer a real business inbox over a random staff/webmaster address.
  const rank = (e) => {
    const l = e.toLowerCase()
    if (/^(info|enquiries|enquiry|contact|admin|office|hello|sales|bookings|quotes)@/.test(l)) return 0
    if (/^(accounts|support|service|mail)@/.test(l)) return 1
    if (/(webmaster|postmaster|hostmaster|abuse)@/.test(l)) return 3
    return 2
  }

  const extract = (html) => {
    const found = new Set()

    // mailto: links are the most reliable signal — check them first.
    for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
      const e = decodeURIComponent(m[1]).trim()
      if (e && !isJunk(e)) found.add(e)
    }

    // Decode common HTML entity obfuscation (&#64; / &commat; for @)
    const decoded = html
      .replace(/&#0*64;|&#x0*40;|&commat;/gi, '@')
      .replace(/&#0*46;|&#x0*2e;|&period;/gi, '.')

    for (const e of (decoded.match(emailRegex) || [])) {
      if (!isJunk(e)) found.add(e.trim())
    }

    // Text obfuscation: "info [at] example [dot] com" / "info (at) example.com"
    for (const m of decoded.matchAll(/([a-zA-Z0-9._%+\-]+)\s*[\[\(]\s*(?:at|@)\s*[\]\)]\s*([a-zA-Z0-9.\-]+)\s*(?:[\[\(]\s*(?:dot|\.)\s*[\]\)]\s*([a-zA-Z]{2,}))?/gi)) {
      const e = m[3] ? `${m[1]}@${m[2]}.${m[3]}` : `${m[1]}@${m[2]}`
      if (!isJunk(e)) found.add(e)
    }

    return Array.from(found)
  }

  const fetchPage = async (url, timeoutMs = 10000) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-AU,en;q=0.9',
        },
      })
      clearTimeout(t)
      if (!r.ok) return ''
      return await r.text()
    } catch { clearTimeout(t); return '' }
  }

  const best = (emails) => emails.length ? emails.sort((a, b) => rank(a) - rank(b))[0] : null

  // 1. Homepage
  const homeHtml = await fetchPage(website)
  const fromHome = extract(homeHtml)
  if (fromHome.length) return best(fromHome)

  // 2. Follow contact-ish links actually present on the homepage, rather than
  //    only guessing at fixed paths.
  const linked = new Set()
  if (homeHtml) {
    for (const m of homeHtml.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = m[1]
      if (/contact|about|enquir|quote|get-in-touch|reach-us/i.test(href)) {
        try { linked.add(new URL(href, parsed.origin).href) } catch {}
      }
      if (linked.size >= 5) break
    }
  }

  const guesses = ['/contact', '/contact-us', '/contact.html', '/contact-us.html', '/about',
                   '/about-us', '/get-a-quote', '/enquiry', '/contacts']
    .map(p => `${parsed.origin}${p}`)

  // Check discovered links first, then common guesses — in parallel batches
  // so one slow page doesn't stall everything.
  const candidates = [...linked, ...guesses].slice(0, 10)
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = candidates.slice(i, i + 4)
    const pages = await Promise.all(batch.map(u => fetchPage(u, 8000)))
    const emails = pages.flatMap(extract)
    if (emails.length) return best(emails)
  }

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { lead, subject, body, channel, counts, preferredAccount, scrapeOnly } = req.body
  if (!lead) return res.status(400).json({ error: 'lead required' })

  // scrapeOnly: find the contact address but DON'T send. Lets the client
  // check its permanent contacted-history before anything goes out — the
  // address usually isn't known until scraping, so this is the only point
  // a duplicate can actually be caught.
  if (scrapeOnly) {
    if (channel === 'sms') {
      return res.status(200).json({ id: lead.id, phone: lead.phone || null, status: lead.phone ? 'found' : 'no_phone' })
    }
    const found = lead.email || await scrapeEmail(lead.website)
    return res.status(200).json({
      id: lead.id,
      email: found,
      status: found ? 'found' : 'no_email',
      reason: lead.website ? 'no_email_on_site' : 'no_website',
    })
  }

  if (channel === 'sms') {
    if (!lead.phone) {
      return res.status(200).json({ id: lead.id, phone: null, status: 'no_phone' })
    }
    const result = await sendSms({ to: lead.phone, body: fillTemplate(body, lead) })
    if (result.success) {
      return res.status(200).json({ id: lead.id, phone: lead.phone, status: 'sent', providerId: result.messageId })
    }
    return res.status(200).json({ id: lead.id, phone: lead.phone, status: 'failed', error: result.error })
  }

  const email = lead.email || await scrapeEmail(lead.website)
  if (!email) {
    // Distinguish "never had a site to check" from "site had no address on it"
    return res.status(200).json({
      id: lead.id,
      email: null,
      status: 'no_email',
      reason: lead.website ? 'no_email_on_site' : 'no_website',
      website: lead.website || null,
    })
  }

  const result = await sendMail({
    to: email,
    subject: fillTemplate(subject, lead) || 'Quick note',
    text: fillTemplate(body, lead),
    counts,
    preferredAccount,
  })
  if (result.success) {
    return res.status(200).json({ id: lead.id, email, status: 'sent', providerId: result.messageId, sentFrom: result.sentFrom })
  }
  return res.status(200).json({ id: lead.id, email, status: 'failed', error: result.error, allExhausted: result.allExhausted })
}
