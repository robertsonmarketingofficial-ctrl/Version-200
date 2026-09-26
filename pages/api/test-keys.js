export default async function handler(req, res) {
  const geminiKey = process.env.GEMINI_API_KEY
  const placesKey = process.env.GOOGLE_PLACES_API_KEY

  const results = { gemini: {}, places: {} }

  // GEMINI
  if (!geminiKey) {
    results.gemini = { status: 'missing', error: 'GEMINI_API_KEY not set in Vercel environment variables.' }
  } else {
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash']
    let worked = false
    for (const model of models) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK' }] }], generationConfig: { maxOutputTokens: 5 } }) }
        )
        const data = await r.json()
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          results.gemini = { status: 'working', model, keyPreview: geminiKey.slice(0,8)+'...' }
          worked = true; break
        } else {
          results.gemini = { status: 'error', error: data.error?.message || 'No response', model, keyPreview: geminiKey.slice(0,8)+'...' }
        }
      } catch (e) { results.gemini = { status: 'error', error: e.message } }
    }
  }

  // PLACES
  if (!placesKey) {
    results.places = { status: 'missing', error: 'GOOGLE_PLACES_API_KEY not set.' }
  } else {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'places.id,places.displayName'
        },
        body: JSON.stringify({ textQuery: 'dentist sydney', regionCode: 'AU' })
      })
      const data = await r.json()
      results.places = (!data.error)
        ? { status: 'working', keyPreview: placesKey.slice(0,8)+'...' }
        : { status: 'error', error: (data.error.status || r.status) + (data.error.message ? ': ' + data.error.message : '') }
    } catch (e) { results.places = { status: 'error', error: e.message } }
  }

  return res.status(200).json(results)
}
