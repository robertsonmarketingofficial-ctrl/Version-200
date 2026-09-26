export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { website } = req.body
  if (!website) return res.status(200).json({ email: null })
  let parsed
  try {
    parsed = new URL(website)
    if (!['http:','https:'].includes(parsed.protocol)) return res.status(200).json({ email: null })
  } catch { return res.status(200).json({ email: null }) }

  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const scrape = async (url) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } })
      clearTimeout(t)
      if (!r.ok) return []
      const html = await r.text()
      return (html.match(emailRegex) || []).filter(e => {
        const l = e.toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false
        const junk = ['noreply','no-reply','donotreply','example.','sentry.','wixpress.',
          'schema.org','w3.org','wordpress.','shopify.','squarespace.','cloudflare.']
        if (junk.some(j => l.includes(j))) return false
        if (l.endsWith('.png')||l.endsWith('.jpg')||l.endsWith('.js')||l.endsWith('.css')) return false
        return true
      })
    } catch { clearTimeout(t); return [] }
  }

  const home = await scrape(website)
  if (home.length) return res.status(200).json({ email: home[0] })
  for (const path of ['/contact', '/contact-us', '/about']) {
    const found = await scrape(`${parsed.origin}${path}`)
    if (found.length) return res.status(200).json({ email: found[0] })
  }
  return res.status(200).json({ email: null })
}
