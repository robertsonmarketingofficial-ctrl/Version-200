// Uses Places API (New) — a POST request with a JSON body and a required
// "field mask" header telling Google exactly which fields to return.
// Unlike the old Legacy API, this returns full details (phone, website,
// rating) in a single call — no separate "place details" request needed.

function cleanName(name) {
  if (!name) return null
  return name.replace(/\s*[-–|]\s*(Pty Ltd|Pty\. Ltd\.|PTY LTD|LLC|Inc\.|Ltd\.?)$/i, '')
    .replace(/&#\d+;/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ').trim()
}

function isAustralianAddress(addr) {
  if (!addr) return false
  return /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT|New South Wales|Victoria|Queensland|South Australia|Western Australia|Tasmania|Northern Territory|Australian Capital Territory|Australia)\b/i.test(addr)
}

function cleanPhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/[^\d+]/g, '')
  const isAU = (/^(\+?61|0)[2-9]\d{8}$/.test(digits) || /^04\d{8}$/.test(digits) || /^1[38]00\d{6}$/.test(digits) || /^\+614\d{8}$/.test(digits))
  if (!isAU) return null
  if (digits.startsWith('614') || digits.startsWith('61')) return '+' + digits
  if (digits.length === 10 && digits.startsWith('04')) return digits.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')
  if (digits.length === 10 && digits.startsWith('0')) return '(' + digits.slice(0,2) + ') ' + digits.slice(2,6) + ' ' + digits.slice(6)
  if (/^1[38]00/.test(digits)) return digits.replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')
  return null
}

function scoreAndTier(website) {
  let score = 50, websiteSignal = 'No website'
  if (!website) { score += 40; websiteSignal = 'No website' }
  else {
    const url = website.toLowerCase()
    if (url.includes('facebook') || url.includes('instagram')) { score += 25; websiteSignal = 'Social only' }
    else if (url.includes('wix') || url.includes('squarespace') || url.includes('weebly') || url.includes('wordpress.com')) { score += 15; websiteSignal = 'Basic builder' }
    else { score += 5; websiteSignal = 'Has website' }
  }
  score = Math.min(99, score)
  const tier = score >= 75 ? 'Hot' : score >= 50 ? 'Warm' : 'Cold'
  return { score, websiteSignal, tier }
}

// One shared function so search.js and afk-search.js behave identically.
// maxPages controls how many pages of ~20 results to pull per query — Google
// caps each page at 20 and requires a short delay before requesting the
// next one via pageToken, so more pages = more thorough but slower.
export async function searchPlacesNew(query, location, apiKey, maxPages = 2) {
  let allPlaces = []
  let pageToken = null
  let pagesFetched = 0

  do {
    const requestBody = {
      textQuery: `${query} ${location}, Australia`,
      regionCode: 'AU',
      languageCode: 'en'
    }
    if (pageToken) requestBody.pageToken = pageToken

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.types,nextPageToken'
      },
      body: JSON.stringify(requestBody)
    })
    const data = await res.json()
    if (data.error) {
      // Only fail the whole search if the very first page errors — a later
      // page failing just means we stop paginating, not that nothing worked.
      if (pagesFetched === 0) {
        return { error: `Google Places error: ${data.error.status || res.status}${data.error.message ? ' — ' + data.error.message : ''}` }
      }
      break
    }
    if (data.places?.length) allPlaces = allPlaces.concat(data.places)
    pageToken = data.nextPageToken || null
    pagesFetched++

    // Google requires a short delay before a pageToken becomes valid
    if (pageToken && pagesFetched < maxPages) await new Promise(r => setTimeout(r, 2000))
  } while (pageToken && pagesFetched < maxPages)

  if (!allPlaces.length) return { leads: [] }

  const leads = allPlaces.map(p => {
    const name = cleanName(p.displayName?.text)
    if (!name) return null
    const address = p.formattedAddress || ''
    if (!isAustralianAddress(address)) return null
    const phone = cleanPhone(p.nationalPhoneNumber || p.internationalPhoneNumber)
    const { score, websiteSignal, tier } = scoreAndTier(p.websiteUri)
    return {
      id: p.id, name, phone, website: p.websiteUri || null, address,
      rating: p.rating || null, reviewCount: p.userRatingCount || 0,
      websiteSignal, score, tier, types: p.types || [], email: null, category: query
    }
  }).filter(Boolean)

  // Dedupe within this single query's pages (Google occasionally repeats
  // a result across pages)
  const seen = new Set()
  const deduped = leads.filter(l => (seen.has(l.id) ? false : (seen.add(l.id), true)))

  return { leads: deduped.sort((a, b) => b.score - a.score) }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { query, location, maxPages } = req.body
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Google Places API key not configured' })
  if (!query || !location) return res.status(400).json({ error: 'Category and location required' })

  try {
    const result = await searchPlacesNew(query, location, apiKey, maxPages || 2)
    if (result.error) return res.status(200).json({ leads: [], error: result.error })
    return res.status(200).json({ leads: result.leads })
  } catch (err) {
    return res.status(500).json({ error: 'Search failed: ' + err.message })
  }
}
