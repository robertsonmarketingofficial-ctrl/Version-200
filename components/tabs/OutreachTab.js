import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'
import { EmailModal, ResearchModal, LovableModal, fmtWA } from './modals'


function OutreachTab({ pipeline }) {
  const [sel, setSel] = useState(null)
  const [emails, setEmails] = useState({ email1:{subject:'',body:''}, email2:{subject:'',body:''} })
  const [loading, setLoading] = useState(false)
  const [bulkEmail, setBulkEmail] = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [seqLoading, setSeqLoading] = useState(false)
  const [sequence, setSequence] = useState(null)
  const [seqStart, setSeqStart] = useState(new Date().toISOString().slice(0,10))
  const [objection, setObjection] = useState('')
  const [objResult, setObjResult] = useState('')
  const [objLoading, setObjLoading] = useState(false)
  const handleObjection = async () => {
    if(!objection.trim()) return
    setObjLoading(true); setObjResult('')
    const data = await callAI('objection', { objection, lead: sel })
    setObjResult(data.result||''); setObjLoading(false)
  }

  const genEmails = async (lead) => {
    setSel(lead); setLoading(true)
    setEmails({ email1:{subject:'',body:''}, email2:{subject:'',body:''} })
    const data = await callAI('emails', { lead })
    if (data.result) setEmails(parseEmails(data.result))
    setLoading(false)
  }
  const genBulk = async () => {
    setBulkLoading(true); setBulkEmail(null)
    const data = await callAI('bulk_emails', { leads: pipeline })
    if (data.result) {
      const m = data.result.match(/---EMAIL---([\s\S]*?)---END---/)
      if (m) { const lines=m[1].trim().split('\n'); const si=lines.findIndex(l=>l.startsWith('Subject:')); setBulkEmail({subject:lines[si]?.replace('Subject:','').trim()||'',body:lines.slice(si+1).join('\n').trim()}) }
    }
    setBulkLoading(false)
  }
  const genSequence = async () => {
    if (!sel) return
    setSeqLoading(true); setSequence(null)
    const data = await callAI('sequence', { lead: sel })
    if (data.result) {
      // Parse 3 emails from result
      const parts = data.result.split(/---EMAIL\d+---/).filter(Boolean)
      const parsed = parts.map(part => {
        const lines = part.trim().split('\n')
        const si = lines.findIndex(l => l.startsWith('Subject:'))
        return { subject: lines[si]?.replace('Subject:','').trim()||'', body: lines.slice(si+1).join('\n').trim() }
      })
      setSequence([
        { delay:0, ...( parsed[0]||{subject:'',body:''} ) },
        { delay:4, ...( parsed[1]||{subject:'',body:''} ) },
        { delay:7, ...( parsed[2]||{subject:'',body:''} ) },
      ])
    } else {
      // Fallback: generate from existing emails
      setSequence([
        { delay:0, subject:`Quick question about ${sel.name}'s online presence`, body:`Hi there,\n\nI noticed ${sel.name} while searching for ${sel.category||'businesses'} in the area.\n\nWould you be open to a quick 10-minute chat about growing your customer base online?\n\nCallum Robertson\nRobertson Marketing\n📞 0405 866 392` },
        { delay:4, subject:`Following up — ${sel.name}`, body:`Hi,\n\nJust following up on my last message. I know things get busy — I'd love to show you what I can do for ${sel.name} in just 10 minutes.\n\nWorth a quick chat?\n\nCallum Robertson\nRobertson Marketing` },
        { delay:7, subject:`Last follow-up — ${sel.name}`, body:`Hi,\n\nI don't want to keep bothering you, so this will be my last message. If now isn't the right time, no worries at all.\n\nIf you ever want to chat about getting more customers online, I'm here.\n\nCallum Robertson\nRobertson Marketing` },
      ])
    }
    setSeqLoading(false)
  }

  const seqDate = (delay) => {
    const d = new Date(seqStart)
    d.setDate(d.getDate() + delay)
    return d.toLocaleDateString('en-AU',{weekday:'short',day:'2-digit',month:'short'})
  }

  return (
    <div>
      <PageHeader title="Outreach & Email" sub="AI-powered personalised email drafts, sequences, and bulk sending" />
      <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 1fr' : '1fr', gap: 16 }}>
        <div>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 }}>
            <div className="section-header" style={{margin:0}}>Select a lead to draft emails</div>
            <button onClick={genBulk} disabled={bulkLoading||pipeline.length===0} className="btn btn-ghost btn-sm">{bulkLoading?<Spinner size={12}/>:'✉ Bulk Template'}</button>
          </div>
          {pipeline.length===0&&<EmptyState icon="✉" title="No leads in pipeline" sub="Add leads from the Lead Finder first." />}
          {pipeline.map(lead=>(
            <div key={lead.id} onClick={()=>genEmails(lead)} style={{padding:'12px 16px',marginBottom:6,background:sel?.id===lead.id?'rgba(109,138,64,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${sel?.id===lead.id?'rgba(109,138,64,0.35)':'var(--border)'}`,borderRadius:10,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:34,height:34,borderRadius:7,background:'rgba(109,138,64,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'var(--olive)'}}>{(lead.name||'?')[0].toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{lead.name}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{lead.category} · {lead.websiteSignal}</div>
              </div>
              <div style={{display:'flex',gap:5,alignItems:'center'}}>
                {lead.phone && <a href={`https://wa.me/${fmtWA(lead.phone)}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:'#25d366',textDecoration:'none',border:'1px solid rgba(37,211,102,0.3)',borderRadius:5,padding:'2px 7px'}}>💬</a>}
                <TierTag tier={lead.tier}/>
              </div>
            </div>
          ))}
        </div>
        {sel&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div className="section-header" style={{margin:0}}>Emails for {sel.name}</div>
              <button onClick={genSequence} disabled={seqLoading} className="btn btn-ghost btn-sm">{seqLoading?<Spinner size={12}/>:'↻ 3-Email Sequence'}</button>
            </div>
            {loading?<div style={{textAlign:'center',padding:'40px 0'}}><Spinner size={28}/><p style={{color:'var(--text3)',fontSize:13,marginTop:10}}>Generating personalised emails...</p></div>:(
              [{key:'email1',label:'Email 1 — Website / Marketing pitch'},{key:'email2',label:'Email 2 — General intro pitch'}].map(({key,label})=>{
                const email=emails[key]
                return(
                  <div key={key} className="card card-p" style={{marginBottom:14}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <div style={{fontSize:12,fontWeight:600,color:'var(--olive2)'}}>{label}</div>
                      <div style={{display:'flex',gap:6}}>
                        <CopyBtn text={`Subject: ${email.subject}\n\n${email.body}`} label="Copy"/>
                        {sel.phone&&<a href={`https://wa.me/${fmtWA(sel.phone)}?text=${encodeURIComponent(email.body.substring(0,300))}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{textDecoration:'none',color:'#25d366',borderColor:'rgba(37,211,102,0.3)'}}>💬</a>}
                        {sel.email&&<a href={`mailto:${sel.email}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`} className="btn btn-primary btn-sm" style={{textDecoration:'none'}}>Send →</a>}
                      </div>
                    </div>
                    {email.subject&&<div style={{background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'7px 10px',marginBottom:8,fontSize:12}}><strong style={{color:'var(--text3)'}}>Subject:</strong> {email.subject}</div>}
                    <div style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'12px',fontSize:13,color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{email.body}</div>
                  </div>
                )
              })
            )}

            {/* SEQUENCE BUILDER */}
            {sequence && (
              <div style={{marginTop:8}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>↻ Follow-Up Sequence</div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <label style={{fontSize:11,color:'var(--text3)'}}>Start:</label>
                    <input type="date" value={seqStart} onChange={e=>setSeqStart(e.target.value)} style={{padding:'4px 8px',borderRadius:6,fontSize:12,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)'}}/>
                  </div>
                </div>
                {sequence.map((email,i)=>(
                  <div key={i} className="card card-p" style={{marginBottom:12,borderLeft:`3px solid ${i===0?'var(--olive)':i===1?'#f97316':'#6b7280'}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div>
                        <span style={{fontSize:12,fontWeight:700,color:i===0?'var(--olive)':i===1?'#f97316':'#6b7280'}}>
                          {i===0?'📧 Email 1 — Day 1':i===1?'📧 Email 2 — Follow-up':'📧 Email 3 — Final'}
                        </span>
                        <span style={{fontSize:11,color:'var(--text3)',marginLeft:8}}>Send on {seqDate(email.delay)}</span>
                      </div>
                      <div style={{display:'flex',gap:5}}>
                        <CopyBtn text={`Subject: ${email.subject}\n\n${email.body}`} label="Copy"/>
                        {sel.phone&&<a href={`https://wa.me/${fmtWA(sel.phone)}?text=${encodeURIComponent(email.body.substring(0,300))}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{textDecoration:'none',color:'#25d366',borderColor:'rgba(37,211,102,0.3)'}}>💬</a>}
                        {sel.email&&<a href={`mailto:${sel.email}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`} className="btn btn-primary btn-sm" style={{textDecoration:'none',fontSize:11}}>Send →</a>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:6}}>
                      <label style={{fontSize:10,color:'var(--text3)',fontWeight:600,whiteSpace:'nowrap'}}>Day offset:</label>
                      <input type="number" value={email.delay} min={0} onChange={e=>setSequence(prev=>prev.map((s,j)=>j===i?{...s,delay:+e.target.value}:s))} style={{width:56,padding:'3px 7px',borderRadius:6,fontSize:12}}/>
                    </div>
                    <input value={email.subject} onChange={e=>setSequence(prev=>prev.map((s,j)=>j===i?{...s,subject:e.target.value}:s))} style={{width:'100%',padding:'6px 10px',borderRadius:7,fontSize:12,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--text)',boxSizing:'border-box',marginBottom:6}}/>
                    <textarea value={email.body} onChange={e=>setSequence(prev=>prev.map((s,j)=>j===i?{...s,body:e.target.value}:s))} rows={5} style={{width:'100%',padding:'8px 10px',borderRadius:7,fontSize:12,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--text)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* OBJECTION HANDLER */}
      <div className="card card-p" style={{marginTop:20}}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:12}}>🛡 Objection Handler</div>
        <div style={{display:'flex',gap:8,marginBottom:objResult?12:0}}>
          <input value={objection} onChange={e=>setObjection(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleObjection()} placeholder='Type the objection e.g. "We already have someone"...' style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)'}}/>
          <button onClick={handleObjection} disabled={!objection.trim()||objLoading} className="btn btn-primary btn-sm">{objLoading?<Spinner size={12}/>:'↩ Handle it'}</button>
        </div>
        {objResult&&(
          <div style={{background:'rgba(122,158,73,0.07)',border:'1px solid rgba(122,158,73,0.18)',borderRadius:9,padding:'12px 14px',fontSize:13,lineHeight:1.7,color:'var(--text)',whiteSpace:'pre-wrap'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--olive)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.07em'}}>Comeback Scripts</div>
            {objResult}
            <div style={{marginTop:8}}><CopyBtn text={objResult} label="Copy"/></div>
          </div>
        )}
      </div>

      {/* BULK EMAIL */}
      {bulkEmail&&(
        <div className="card card-p" style={{marginTop:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>Bulk Template — edit & send</div>
            <CopyBtn text={`Subject: ${bulkEmail.subject}\n\n${bulkEmail.body}`} label="Copy"/>
          </div>
          <div style={{marginBottom:8}}>
            <label style={{fontSize:11,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:5}}>Subject</label>
            <input value={bulkEmail.subject} onChange={e=>setBulkEmail(prev=>({...prev,subject:e.target.value}))} style={{width:'100%',padding:'8px 12px',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)',boxSizing:'border-box'}}/>
          </div>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,color:'var(--text3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:5}}>Body</label>
            <textarea value={bulkEmail.body} onChange={e=>setBulkEmail(prev=>({...prev,body:e.target.value}))} rows={10} style={{width:'100%',padding:'10px 12px',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)',lineHeight:1.7,resize:'vertical',boxSizing:'border-box'}}/>
          </div>
          {(()=>{
            const emailLeads=pipeline.filter(l=>l.email)
            const sendAll=()=>{
              if(!emailLeads.length)return
              const bcc=emailLeads.map(l=>l.email).join(',')
              window.open(`mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(bulkEmail.subject)}&body=${encodeURIComponent(bulkEmail.body)}`)
            }
            return(
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
                <span style={{fontSize:12,color:'var(--text3)'}}>{emailLeads.length===0?'⚠ No leads have emails yet':`✉ ${emailLeads.length} of ${pipeline.length} leads have emails`}</span>
                <button onClick={sendAll} disabled={!emailLeads.length||!bulkEmail.subject||!bulkEmail.body} className="btn btn-primary" style={{padding:'8px 20px',fontSize:13}}>✉ Send to All {emailLeads.length>0?`(${emailLeads.length})`:''}</button>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

// ═══ SMS ═══
export { OutreachTab }
