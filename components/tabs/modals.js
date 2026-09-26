import { useState } from 'react'
import { Spinner, CopyBtn, Modal } from '../shared'
import { InfoItem } from './helpers'

// ═══ HELPERS ═══
export const fmtWA = (phone) => phone ? phone.replace(/^0/,'+61').replace(/\s/g,'') : ''

// ═══ EMAIL MODAL ═══
export function EmailModal({ lead, onClose }) {
  const name = lead?.name || '[Business Name]'
  const hasNoWebsite = !lead?.website || lead?.websiteSignal === 'No website'
  const isBadSite = lead?.websiteSignal === 'Social only' || lead?.websiteSignal === 'Basic builder'

  const email1 = {
    subject: `Quick question about ${name}'s online presence`,
    body: `Hi there,\n\nI was searching for ${lead?.category || 'businesses'} in ${lead?.address?.split(',').slice(0,1).join('') || 'your area'} and noticed that ${name} doesn't appear to have a website yet.\n\nMost customers these days search Google before deciding who to call — without a website, you could be missing out on a lot of new business.\n\nI build professional websites for local businesses starting from $1,500, with hosting from $100/month. I can have you live within 2 weeks.\n\nWould you be open to a quick 10-minute chat to see if it's a good fit?\n\nCallum Robertson\nRobertson Marketing\n📞 0405 866 392\n✉ robertsonmarketingofficial@gmail.com`
  }

  const email2 = {
    subject: `Helping ${name} get more customers online`,
    body: `Hi there,\n\nI came across ${name} while researching ${lead?.category || 'businesses'} in the area${lead?.address ? ` — ${lead.address.split(',').slice(0,2).join(',')}` : ''}.\n\n${isBadSite ? "I noticed your current web presence could be doing a lot more for you — a modern, mobile-friendly site can make a huge difference in how many enquiries you get." : "I work with local businesses to improve their online presence and get more customers finding them on Google."}\n\nI specialise in websites and digital marketing for local businesses — fast turnaround, affordable pricing, and real results.\n\nIf you've got 10 minutes for a quick call, I'd love to show you what I can do.\n\nCallum Robertson\nRobertson Marketing\n📞 0405 866 392\n✉ robertsonmarketingofficial@gmail.com`
  }

  const emails = hasNoWebsite
    ? [{ label: 'Email 1 — No Website Pitch', e: email1 }, { label: 'Email 2 — General Outreach', e: email2 }]
    : [{ label: 'Email 1 — Improve Online Presence', e: email2 }, { label: 'Email 2 — General Outreach', e: { subject: `Growing ${name}'s customer base`, body: `Hi there,\n\nI help local ${lead?.category || 'businesses'} in ${lead?.address?.split(',').slice(0,1).join('') || 'your area'} get more customers through better online marketing.\n\nWould you be open to a quick chat about what's possible?\n\nCallum Robertson\nRobertson Marketing\n📞 0405 866 392\n✉ robertsonmarketingofficial@gmail.com` } }]

  return (
    <Modal title={`Outreach emails — ${name}`} onClose={onClose}>
      <div style={{background:'rgba(122,158,73,0.08)',border:'1px solid rgba(122,158,73,0.2)',borderRadius:8,padding:'10px 14px',fontSize:12,color:'var(--olive2)',marginBottom:16}}>
        💡 Generic templates — ready to copy and send instantly. No AI needed.
      </div>
      {emails.map(({label, e}) => (
        <div key={label} style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{fontSize:12,fontWeight:600,color:'var(--olive2)'}}>{label}</div>
            <div style={{display:'flex',gap:6}}>
              <CopyBtn text={`Subject: ${e.subject}\n\n${e.body}`} label="Copy"/>
              {lead?.phone&&<a href={`https://wa.me/${fmtWA(lead.phone)}?text=${encodeURIComponent(e.body.substring(0,300))}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{textDecoration:'none',color:'#25d366',borderColor:'rgba(37,211,102,0.3)'}}>💬 WA</a>}
              {lead?.email&&<a href={`mailto:${lead.email}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(e.body)}`} className="btn btn-primary btn-sm" style={{textDecoration:'none'}}>Send →</a>}
            </div>
          </div>
          <div style={{background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'7px 10px',marginBottom:6,fontSize:12}}><strong style={{color:'var(--text3)'}}>Subject:</strong> {e.subject}</div>
          <div style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'12px',fontSize:13,color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{e.body}</div>
        </div>
      ))}
    </Modal>
  )
}

// ═══ RESEARCH MODAL ═══
export function ResearchModal({ lead, result, loading, question, setQuestion, onAsk, onClose }) {
  return (
    <Modal title={`AI Researcher — ${lead?.name}`} onClose={onClose}>
      <div style={{background:'rgba(109,138,64,0.07)',borderRadius:8,padding:'10px 12px',fontSize:12,color:'var(--text2)',marginBottom:14}}>
        {lead?.name} · {lead?.address?.split(',').slice(0,2).join(',')} · {lead?.websiteSignal}
      </div>
      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onAsk()} placeholder="Ask anything about this business..." style={{flex:1,padding:'9px 12px',borderRadius:8,fontSize:13}}/>
        <button onClick={onAsk} disabled={loading||!question.trim()} className="btn btn-primary">{loading?<Spinner size={14}/>:'Ask'}</button>
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        {['Best pitch angle?','What do they need?','How to open the conversation?','Common objections?'].map(q=>(
          <button key={q} onClick={()=>setQuestion(q)} style={{padding:'4px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text3)',cursor:'pointer',fontSize:11}}>{q}</button>
        ))}
      </div>
      {result&&<div style={{background: result.startsWith('Error') || result.includes('failed') ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)',border: result.startsWith('Error') || result.includes('failed') ? '1px solid rgba(239,68,68,0.2)' : 'none',borderRadius:10,padding:'14px',fontSize:13,color: result.startsWith('Error') || result.includes('failed') ? '#ef4444' : 'var(--text)',lineHeight:1.75,whiteSpace:'pre-wrap'}} className="fade-up">{result}</div>}
    </Modal>
  )
}

// ═══ LOVABLE MODAL ═══
export function LovableModal({ lead, onClose }) {
  const name = lead?.name || '[Business Name]'
  const category = lead?.category || 'local business'
  const suburb = lead?.address?.split(',').slice(0,1).join('').trim() || 'local area'

  const prompt = `Build a professional, modern website for ${name}, a ${category} based in ${suburb}, Australia.\n\nPAGES NEEDED:\n- Home: Hero with headline "Your trusted ${category} in ${suburb}" + call to action button (Call Now / Book Online)\n- Services: List of services offered with brief descriptions and pricing if applicable\n- About: Story of the business, years of experience, team/owner photo placeholder\n- Contact: Phone number, email, address, contact form, embedded Google Map, trading hours\n\nDESIGN:\n- Clean, professional, mobile-first\n- Colour scheme: use colours appropriate for a ${category} (trustworthy, professional)\n- Large hero image with overlay text\n- Prominent phone number in header on every page\n- Google reviews section / testimonials\n- Fast loading, SEO-optimised\n\nFEATURES:\n- Click-to-call phone button (prominent, especially on mobile)\n- Contact form that sends enquiries to email\n- Trading hours display\n- Google Maps embed\n- Social media links section\n\nMake it look like a $5,000 custom website. The business name to use throughout is: ${name}`

  return (
    <Modal title={`Lovable.dev prompt — ${name}`} onClose={onClose}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div>
          <p style={{margin:'0 0 4px',fontSize:13,color:'var(--text2)'}}>Copy this prompt and paste it into <a href="https://lovable.dev" target="_blank" rel="noreferrer" style={{color:'var(--olive2)',fontWeight:600}}>lovable.dev</a></p>
          <p style={{margin:0,fontSize:11,color:'var(--text3)'}}>The business name is pre-filled — just copy and go.</p>
        </div>
        <CopyBtn text={prompt} label="Copy prompt"/>
      </div>
      <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10,padding:'14px',fontSize:13,color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap',maxHeight:440,overflowY:'auto'}}>{prompt}</div>
      <a href="https://lovable.dev" target="_blank" rel="noreferrer" className="btn btn-primary" style={{textDecoration:'none',marginTop:14,display:'inline-flex'}}>Open Lovable.dev →</a>
    </Modal>
  )
}
