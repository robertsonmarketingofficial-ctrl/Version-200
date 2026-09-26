export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }

const CALLUM = {
  name: 'Callum Robertson',
  email: 'robertsonmarketingofficial@gmail.com',
  phone: '0405 866 392'
}

function businessCtx(lead) {
  if (!lead) return ''
  return `Business: ${lead.name || 'Unknown'}
Address: ${lead.address || 'Unknown'}
Phone: ${lead.phone || 'Not listed'}
Website: ${lead.website || 'None'}
Website Status: ${lead.websiteSignal || 'Unknown'}
Rating: ${lead.rating ? `${lead.rating}/5 (${lead.reviewCount || 0} reviews)` : 'Not rated'}
Category: ${lead.category || 'Local business'}`
}

function buildPrompt(type, lead, question) {
  if (type === 'research') return `You are a sharp sales research assistant for ${CALLUM.name}, a marketing consultant.
${businessCtx(lead)}
Question: ${question}
Answer concisely and practically. Actionable insights only. Max 200 words.`

  if (type === 'auto_research') return `You are a sales intelligence assistant for ${CALLUM.name}.
${businessCtx(lead)}
Give a quick 3-point sales brief: 1) What opportunity exists here 2) Best pitch angle 3) One thing to say to open the conversation. Max 150 words.`

  if (type === 'emails') return `Write two outreach emails for ${CALLUM.name} (${CALLUM.email}, ${CALLUM.phone}).
${businessCtx(lead)}
Rules: Sound human not AI. Concise and confident. Reference something specific. Clear CTA. Include contact info at end.
EMAIL 1: Focus on their ${lead?.websiteSignal || 'online presence'} gap.
EMAIL 2: Broader intro pitch relevant to their business type.
Format EXACTLY like this:
---EMAIL1---
Subject: [subject line here]
[email body here]
---EMAIL2---
Subject: [subject line here]
[email body here]
---END---`

  if (type === 'lovable') return `Create a Lovable.dev website brief for this local business.
${businessCtx(lead)}
Include: business type, target customers, pages needed, design direction, key content per page, specific features, mobile-first. Make it specific to THIS business. Ready to paste into Lovable.dev.`

  if (type === 'bulk_emails') return `Write a bulk outreach email template for ${CALLUM.name} (${CALLUM.email}, ${CALLUM.phone}).
Use [BUSINESS_NAME] as placeholder. Sound personal not mass-email. Focus on local business marketing. Under 150 words.
Format:
---EMAIL---
Subject: [subject]
[body with [BUSINESS_NAME]]
---END---`

  if (type === 'sequence') return `Write a 3-email follow-up sequence for ${CALLUM.name} (${CALLUM.email}, ${CALLUM.phone}) targeting this business.
${businessCtx(lead)}
Rules: Each email shorter and more direct than last. Sound human. Vary the angle. Never desperate.
Email 1 (Day 1): Cold intro, reference something specific about their business.
Email 2 (Day 4): Brief follow-up, add one new value point.
Email 3 (Day 7): Final short message, leave door open.
Format EXACTLY:
---EMAIL1---
Subject: [subject]
[body]
---EMAIL2---
Subject: [subject]
[body]
---EMAIL3---
Subject: [subject]
[body]
---END---`

  if (type === 'callscript') return `Write a short cold call opening script for ${CALLUM.name} calling this business.
${businessCtx(lead)}
Format: 3-5 sentence opening. Natural and conversational. Australian. Include: greeting, who you are, why you're calling, one hook question to keep them talking.
No pressure, no cringe. Sound like a real person not a robot.`

  if (type === 'objection') return `${CALLUM.name} got this objection from a potential client: "${objection || 'objection'}".
${lead ? `Business context: ${businessCtx(lead)}` : ''}
Give 3 short, natural comeback scripts. Each one sentence or two. Acknowledge then pivot. Australian tone. Number them 1. 2. 3.`

  if (type === 'sms_sequence') return `Write a 3-message WhatsApp/SMS follow-up sequence for ${CALLUM.name} targeting this business.
${businessCtx(lead)}
Rules: Each message under 160 chars. Casual, Australian, never pushy. Natural gaps between.
Message 1 (Day 1): Friendly intro, one specific observation about their business.
Message 2 (Day 3): Brief follow-up, new angle.
Message 3 (Day 7): Final casual check-in, leave door open.
Format EXACTLY:
---MSG1---
[message]
---MSG2---
[message]
---MSG3---
[message]`

  if (type === 'quote') return `Give one short punchy motivational quote for a young sales entrepreneur. 1-2 sentences max. No attribution needed. Just the quote itself.`

  if (type === 'score_explanation') return `Explain this lead score for ${CALLUM.name}.
${businessCtx(lead)}
Score: ${lead?.score}/99, Tier: ${lead?.tier}
3 bullet points: what drove the score up, what the opportunity is, what to say first. Keep it tight.`

  if (type === 'sms') return `Write 3 SMS templates for ${CALLUM.name} to send to local Australian businesses.
${businessCtx(lead)}
Rules: Australian casual tone, under 160 chars each, sound like a real person texting, include a CTA, vary the opening line.
Format exactly:
SMS 1: [text]
SMS 2: [text]
SMS 3: [text]`

  if (type === 'proposal') return `Write a professional email proposal for ${CALLUM.name} to send to this business.
${businessCtx(lead)}
Include: brief Robertson Marketing intro, the specific opportunity for this business, 3 pricing tiers:
- Starter: Website $1,500 + hosting $100/mo
- Growth: Above + Local SEO $250/mo  
- Full Service: Above + Meta Ads $400/mo
End with a clear next step (15-min call) and Callum's contact details: ${CALLUM.email} | ${CALLUM.phone}
Format:
Subject: [subject line]
[email body]`

  if (type === 'competitor_insight') return `Help ${CALLUM.name} prepare to pitch this business:
${businessCtx(lead)}
Write a brief competitor context: 1) What online presence do competitors in this niche typically have? 2) What does a good version of this business's website look like? 3) One specific thing Callum can say about competitors in the pitch. Under 200 words.`

  return null
}

async function callGemini(prompt, apiKey) {
  const models = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.0-pro',
  ]

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.75, maxOutputTokens: 1500 }
  })

  let lastError = ''
  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
      )
      const data = await r.json()
      if (data.error) {
        lastError = `${model}: ${data.error.message}`
        console.warn('Gemini model failed:', lastError)
        continue
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) return { text, model }
    } catch (e) {
      lastError = `${model}: ${e.message}`
      console.warn('Gemini threw:', lastError)
    }
  }
  return { error: true, message: `All Gemini models failed. Last error: ${lastError}` }
}

async function callOpenRouter(prompt, apiKey) {
  if (!apiKey) return null
  const models = [
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemma-2-9b-it:free',
  ]
  for (const model of models) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://robertson-marketing.vercel.app',
          'X-Title': 'Robertson Marketing CRM'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
          temperature: 0.75
        })
      })
      const data = await r.json()
      if (data.error) { console.warn(`OpenRouter ${model}:`, data.error.message); continue }
      const text = data.choices?.[0]?.message?.content
      if (text) return { text, model }
    } catch (e) { console.warn(`OpenRouter ${model} threw:`, e.message) }
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { type, lead, question, objection, leads } = req.body
  const geminiKey = process.env.GEMINI_API_KEY
  const openRouterKey = process.env.OPENROUTER_API_KEY

  // Clear diagnosis if no keys
  if (!geminiKey && !openRouterKey) {
    return res.status(500).json({
      error: 'No AI key found. Add GEMINI_API_KEY in Vercel → Project Settings → Environment Variables → Redeploy. Get key at aistudio.google.com/apikey'
    })
  }

  const prompt = buildPrompt(type, lead, question)
  if (!prompt) return res.status(400).json({ error: `Unknown type: ${type}` })

  // Try Gemini first
  if (geminiKey) {
    const result = await callGemini(prompt, geminiKey)
    if (!result.error) {
      return res.status(200).json({ result: result.text, source: `gemini/${result.model}` })
    }
    // If wrong key format, return the specific fix instruction immediately
    if (result.message?.includes('Invalid Gemini key format')) {
      if (!openRouterKey) return res.status(500).json({ error: result.message })
      // Fall through to OpenRouter
    }
  }

  // Try OpenRouter as fallback
  if (openRouterKey) {
    const result = await callOpenRouter(prompt, openRouterKey)
    if (result) return res.status(200).json({ result: result.text, source: `openrouter/${result.model}` })
  }

  // Both failed — give clear instructions
  const keyIssue = 'AI request failed. Go to Settings & Debug tab and click Test Keys for diagnosis.'

  return res.status(500).json({ error: keyIssue })
}
