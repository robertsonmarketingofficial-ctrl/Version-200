import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'
import { EmailModal, ResearchModal, LovableModal, fmtWA } from './modals'


function SMSTab({ pipeline, showToast }) {
  const [sel, setSel] = useState(null)
  const [smsList, setSmsList] = useState([])
  const [loading, setLoading] = useState(false)
  const [waSeq, setWaSeq] = useState(null)
  const [waSeqLoading, setWaSeqLoading] = useState(false)
  const [seqStart, setSeqStart] = useState(new Date().toISOString().slice(0,10))

  const genSMS = async (lead) => {
    setSel(lead); setLoading(true); setSmsList([]); setWaSeq(null)
    const data = await callAI('sms', { lead })
    if (data.result) {
      const matches = []
      const lines = data.result.split('\n')
      let current = ''
      for (const line of lines) {
        if (/^SMS \d+:/i.test(line)) { if (current.trim()) matches.push(current.trim()); current = line.replace(/^SMS \d+:\s*/i,'') }
        else if (current) current += ' ' + line.trim()
      }
      if (current.trim()) matches.push(current.trim())
      setSmsList(matches.filter(Boolean))
    }
    setLoading(false)
  }

  const genWASeq = async () => {
    if (!sel) return
    setWaSeqLoading(true); setWaSeq(null)
    const data = await callAI('sms_sequence', { lead: sel })
    if (data.result) {
      const parts = data.result.split(/---MSG\d+---/).filter(Boolean)
      setWaSeq([
        { delay:0, text: parts[0]?.trim()||'' },
        { delay:3, text: parts[1]?.trim()||'' },
        { delay:7, text: parts[2]?.trim()||'' },
      ])
    }
    setWaSeqLoading(false)
  }

  const seqDate = (delay) => {
    const d = new Date(seqStart); d.setDate(d.getDate()+delay)
    return d.toLocaleDateString('en-AU',{weekday:'short',day:'2-digit',month:'short'})
  }

  return (
    <div>
      <PageHeader title="SMS & WhatsApp" sub="Short Aussie-style texts + 3-message WA follow-up sequences" />
      <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 1fr' : '1fr', gap: 16 }}>
        <div>
          <div className="section-header">Select a lead</div>
          {pipeline.length===0&&<EmptyState icon="💬" title="No leads in pipeline" sub="Add leads from the Lead Finder first." />}
          {pipeline.map(lead=>(
            <div key={lead.id} onClick={()=>genSMS(lead)} style={{padding:'12px 16px',marginBottom:6,background:sel?.id===lead.id?'rgba(109,138,64,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${sel?.id===lead.id?'rgba(109,138,64,0.35)':'var(--border)'}`,borderRadius:10,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:34,height:34,borderRadius:7,background:'rgba(109,138,64,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'var(--olive)'}}>{(lead.name||'?')[0].toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{lead.name}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>{lead.phone||'No phone'} · {lead.category}</div>
              </div>
              {lead.phone&&<a href={`https://wa.me/${fmtWA(lead.phone)}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:'#25d366',textDecoration:'none',border:'1px solid rgba(37,211,102,0.3)',borderRadius:5,padding:'2px 7px'}}>💬</a>}
              <TierTag tier={lead.tier}/>
            </div>
          ))}
        </div>
        {sel&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div className="section-header" style={{margin:0}}>Templates for {sel.name}</div>
              <button onClick={genWASeq} disabled={waSeqLoading} className="btn btn-ghost btn-sm" style={{color:'#25d366',borderColor:'rgba(37,211,102,0.3)'}}>{waSeqLoading?<Spinner size={12}/>:'💬 WA Sequence'}</button>
            </div>
            {loading?<div style={{textAlign:'center',padding:'40px 0'}}><Spinner size={28}/><p style={{color:'var(--text3)',fontSize:13,marginTop:10}}>Generating Aussie SMS templates...</p></div>:(
              smsList.length>0?smsList.map((sms,i)=>(
                <div key={i} className="card card-p" style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--olive2)'}}>Template {i+1}</div>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <span style={{fontSize:11,color:sms.length>160?'#ef4444':'var(--text3)'}}>{sms.length} chars</span>
                      <CopyBtn text={sms} label="Copy"/>
                      {sel.phone&&<a href={`sms:${sel.phone}?body=${encodeURIComponent(sms)}`} className="btn btn-ghost btn-sm" style={{textDecoration:'none',fontSize:11}}>📲 SMS</a>}
                      {sel.phone&&<a href={`https://wa.me/${fmtWA(sel.phone)}?text=${encodeURIComponent(sms)}`} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{textDecoration:'none',color:'#25d366',background:'rgba(37,211,102,0.1)',border:'1px solid rgba(37,211,102,0.3)',fontSize:11}}>💬 WA</a>}
                    </div>
                  </div>
                  <div style={{background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'10px 12px',fontSize:13,color:'var(--text)',lineHeight:1.6}}>{sms}</div>
                </div>
              )):<p style={{color:'var(--text3)',fontSize:13}}>Click a lead to generate</p>
            )}

            {/* WA SEQUENCE */}
            {waSeq&&(
              <div style={{marginTop:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#25d366'}}>💬 WhatsApp Sequence</div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <label style={{fontSize:11,color:'var(--text3)'}}>Start:</label>
                    <input type="date" value={seqStart} onChange={e=>setSeqStart(e.target.value)} style={{padding:'4px 8px',borderRadius:6,fontSize:12,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)'}}/>
                  </div>
                </div>
                {waSeq.map((msg,i)=>(
                  <div key={i} className="card card-p" style={{marginBottom:10,borderLeft:`3px solid ${['#25d366','#f97316','#6b7280'][i]}`}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div>
                        <span style={{fontSize:12,fontWeight:700,color:['#25d366','#f97316','#6b7280'][i]}}>💬 Message {i+1}</span>
                        <span style={{fontSize:11,color:'var(--text3)',marginLeft:8}}>Send {seqDate(msg.delay)}</span>
                      </div>
                      <div style={{display:'flex',gap:5}}>
                        <CopyBtn text={msg.text} label="Copy"/>
                        {sel.phone&&<a href={`https://wa.me/${fmtWA(sel.phone)}?text=${encodeURIComponent(msg.text)}`} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{textDecoration:'none',color:'#25d366',background:'rgba(37,211,102,0.1)',border:'1px solid rgba(37,211,102,0.3)',fontSize:11}}>Send 💬</a>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6,marginBottom:6,alignItems:'center'}}>
                      <label style={{fontSize:10,color:'var(--text3)',fontWeight:600,whiteSpace:'nowrap'}}>Day:</label>
                      <input type="number" value={msg.delay} min={0} onChange={e=>setWaSeq(prev=>prev.map((s,j)=>j===i?{...s,delay:+e.target.value}:s))} style={{width:50,padding:'3px 7px',borderRadius:6,fontSize:12,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)'}}/>
                    </div>
                    <textarea value={msg.text} onChange={e=>setWaSeq(prev=>prev.map((s,j)=>j===i?{...s,text:e.target.value}:s))} rows={4} style={{width:'100%',padding:'8px 10px',borderRadius:7,fontSize:12,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--text)',lineHeight:1.6,resize:'vertical',boxSizing:'border-box'}}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ FOLLOW-UP ═══
export { SMSTab }
