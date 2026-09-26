import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'
import { EmailModal, ResearchModal, LovableModal, fmtWA } from './modals'
import { apiJSON } from '../api'
import { getAccountCounts, recordSend, markContacted } from '../sendTracker'


function FollowUpTab({ pipeline, savePipeline, showToast }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1)
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate()+7)
  // Only surface leads still sitting at 'Contacted' — once a lead moves to
  // Replied/Meeting booked/Closed/Not interested, it's been handled and
  // doesn't need a follow-up nag anymore, even if a date is still set.
  const withDates = pipeline.filter(l=>l.followUpDate && l.stage==='Contacted')
  const overdue = withDates.filter(l=>new Date(l.followUpDate)<today)
  const dueToday = withDates.filter(l=>{const d=new Date(l.followUpDate);return d>=today&&d<tomorrow})
  const upcoming = withDates.filter(l=>{const d=new Date(l.followUpDate);return d>=tomorrow&&d<=nextWeek})
  const later = withDates.filter(l=>new Date(l.followUpDate)>nextWeek)
  const none = pipeline.filter(l=>!l.followUpDate)
  const updateFollowUp = (id,followUpDate) => savePipeline(pipeline.map(p=>p.id===id?{...p,followUpDate}:p))

  const sendFollowUp = async (lead) => {
    if (!lead.email) { showToast?.('No email on file for this lead'); return }
    try {
      // Pass the rolling per-account counts like every other send path, so
      // follow-ups respect the daily cap and count toward it.
      const d = await apiJSON('/api/leads/send', {
        method: 'POST',
        body: {
          leads: [lead], channel: 'email', counts: getAccountCounts(),
          subject: `Following up, {{name}}`,
          body: `Hi {{name}},\n\nJust following up on my last email — totally understand if you're busy. Still happy to chat whenever suits.\n\nCallum\nRobertson Marketing`
        }
      })
      const ok = d.results?.[0]?.status === 'sent'
      if (ok) {
        recordSend(d.results[0].sentFrom); markContacted(lead.email)
        const nextDate = new Date(Date.now() + 5*24*60*60*1000).toISOString().slice(0,10)
        savePipeline(pipeline.map(p => p.id === lead.id ? { ...p, followUpDate: nextDate, activityLog: [...(p.activityLog||[]), { type: 'follow-up sent', date: new Date().toISOString() }] } : p))
        showToast?.('Follow-up sent ✓')
      } else {
        showToast?.(`Follow-up failed: ${d.results?.[0]?.error || d.error || 'unknown error'}`)
      }
    } catch (err) {
      showToast?.('Follow-up failed: ' + err.message)
    }
  }

  const Section = ({title,leads,color,showFollowUpBtn}) => leads.length===0?null:(
    <div style={{marginBottom:24}}>
      <div style={{fontSize:12,fontWeight:600,color,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>{title} ({leads.length})</div>
      {leads.map(lead=>(
        <div key={lead.id} className="card" style={{padding:'12px 16px',marginBottom:6,borderLeft:`3px solid ${color}`}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{lead.name}</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>{lead.stage} · {lead.phone||'No phone'}</div>
            </div>
            {showFollowUpBtn && lead.email && <button onClick={()=>sendFollowUp(lead)} className="btn btn-primary btn-sm">✉ Send Follow-up</button>}
            {lead.phone&&<a href={`tel:${lead.phone}`} className="btn btn-ghost btn-sm" style={{textDecoration:'none'}}>📞 Call</a>}
            <input type="date" value={lead.followUpDate||''} onChange={e=>updateFollowUp(lead.id,e.target.value)} style={{padding:'4px 8px',borderRadius:7,fontSize:12}}/>
            <TierTag tier={lead.tier}/>
          </div>
          {lead.notes&&<div style={{fontSize:12,color:'var(--text3)',marginTop:6,fontStyle:'italic'}}>"{lead.notes}"</div>}
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader title="Follow-Up Tracker" sub="Never let a lead go cold" />
      {pipeline.length===0?<EmptyState icon="↻" title="No leads yet" sub="Add leads to your pipeline and set follow-up dates." />:(
        <>
          <Section title="⚠ Overdue" leads={overdue} color="#ef4444" showFollowUpBtn/>
          <Section title="📅 Due Today" leads={dueToday} color="#f97316" showFollowUpBtn/>
          <Section title="🔜 This Week" leads={upcoming} color="#6d8a40"/>
          <Section title="📆 Later" leads={later} color="#6b7280"/>
          {none.length>0&&(
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>No follow-up set ({none.length})</div>
              {none.map(lead=>(
                <div key={lead.id} className="card" style={{padding:'12px 16px',marginBottom:6}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1,fontSize:13,color:'var(--text)'}}>{lead.name} <span style={{color:'var(--text3)',fontSize:11}}>— {lead.stage}</span></div>
                    <input type="date" value="" onChange={e=>updateFollowUp(lead.id,e.target.value)} style={{padding:'4px 8px',borderRadius:7,fontSize:12}}/>
                  </div>
                </div>
              ))}
            </div>
          )}
          {withDates.length===0&&none.length>0&&<div style={{background:'rgba(109,138,64,0.08)',border:'1px solid rgba(109,138,64,0.2)',borderRadius:10,padding:'14px 16px',fontSize:13,color:'var(--text2)',marginTop:8}}>💡 Set follow-up dates on leads above to track them here</div>}
        </>
      )}
    </div>
  )
}

// ═══ APPOINTMENTS ═══
function AppointmentsTab({ pipeline, appointments, saveAppointments, showToast }) {
  const [form, setForm] = useState({leadId:'',date:'',time:'',type:'Call',notes:''})
  const [showForm, setShowForm] = useState(false)

  const addAppt = () => {
    if (!form.leadId||!form.date) { showToast('Select a lead and date'); return }
    const lead = pipeline.find(p=>p.id===form.leadId)
    saveAppointments([...appointments,{...form,id:Date.now().toString(),leadName:lead?.name||'',outcome:'',createdAt:new Date().toISOString()}])
    setForm({leadId:'',date:'',time:'',type:'Call',notes:''}); setShowForm(false); showToast('Appointment logged ✓')
  }
  const updateOutcome = (id,outcome) => saveAppointments(appointments.map(a=>a.id===id?{...a,outcome}:a))
  const remove = (id) => { saveAppointments(appointments.filter(a=>a.id!==id)); showToast('Removed') }
  const upcoming = appointments.filter(a=>!a.outcome&&new Date(`${a.date}T${a.time||'00:00'}`)>=new Date())
  const past = appointments.filter(a=>a.outcome||new Date(`${a.date}T${a.time||'00:00'}`)<new Date())

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <PageHeader title="Appointments" sub="Log calls, meetings and track outcomes" noMargin/>
        <button onClick={()=>setShowForm(!showForm)} className="btn btn-primary btn-sm">+ Log Appointment</button>
      </div>
      {showForm&&(
        <div className="card card-p" style={{marginBottom:20}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:12}}>
            <div><label style={{fontSize:11,color:'var(--text3)',display:'block',marginBottom:4}}>LEAD</label>
              <select value={form.leadId} onChange={e=>setForm({...form,leadId:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:7,fontSize:13}}>
                <option value="">Select lead...</option>
                {pipeline.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div><label style={{fontSize:11,color:'var(--text3)',display:'block',marginBottom:4}}>DATE</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:7,fontSize:13}}/></div>
            <div><label style={{fontSize:11,color:'var(--text3)',display:'block',marginBottom:4}}>TIME</label><input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:7,fontSize:13}}/></div>
            <div><label style={{fontSize:11,color:'var(--text3)',display:'block',marginBottom:4}}>TYPE</label>
              <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:7,fontSize:13}}>
                {['Call','In-person meeting','Video call','Demo','Follow-up call'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:10}}><label style={{fontSize:11,color:'var(--text3)',display:'block',marginBottom:4}}>NOTES</label><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Agenda / what happened..." style={{width:'100%',padding:'8px 10px',borderRadius:7,fontSize:13}}/></div>
          <div style={{display:'flex',gap:8}}><button onClick={addAppt} className="btn btn-primary btn-sm">Save</button><button onClick={()=>setShowForm(false)} className="btn btn-ghost btn-sm">Cancel</button></div>
        </div>
      )}
      {appointments.length===0&&!showForm&&<EmptyState icon="◷" title="No appointments yet" sub="Log calls and meetings to track outreach." action="Log First Appointment" onAction={()=>setShowForm(true)}/>}
      {upcoming.length>0&&<div style={{marginBottom:24}}><div className="section-header">Upcoming ({upcoming.length})</div>{upcoming.map(a=><AppointmentCard key={a.id} appt={a} onOutcome={updateOutcome} onRemove={remove}/>)}</div>}
      {past.length>0&&<div><div className="section-header">Past ({past.length})</div>{past.map(a=><AppointmentCard key={a.id} appt={a} onOutcome={updateOutcome} onRemove={remove}/>)}</div>}
    </div>
  )
}

function AppointmentCard({ appt, onOutcome, onRemove }) {
  const colors = {'Won':'#6d8a40','No show':'#ef4444','Follow-up needed':'#f97316','Not interested':'#6b7280','Meeting booked':'#3b82f6'}
  return (
    <div className="card" style={{padding:'14px 18px',marginBottom:8,borderLeft:`3px solid ${appt.outcome?(colors[appt.outcome]||'#6b7280'):'#6d8a40'}`}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:3}}>{appt.leadName}</div>
          <div style={{fontSize:12,color:'var(--text3)'}}>{appt.type} · {appt.date}{appt.time?` at ${appt.time}`:''}</div>
          {appt.notes&&<div style={{fontSize:12,color:'var(--text2)',marginTop:4,fontStyle:'italic'}}>"{appt.notes}"</div>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <select value={appt.outcome||''} onChange={e=>onOutcome(appt.id,e.target.value)} style={{padding:'4px 8px',borderRadius:7,fontSize:12}}>
            <option value="">Set outcome...</option>
            {Object.keys(colors).map(o=><option key={o}>{o}</option>)}
          </select>
          <button onClick={()=>onRemove(appt.id)} className="btn btn-danger btn-sm">×</button>
        </div>
      </div>
      {appt.outcome&&<div style={{marginTop:8,display:'inline-block',padding:'2px 10px',borderRadius:100,fontSize:11,fontWeight:700,background:`${colors[appt.outcome]}22`,color:colors[appt.outcome]}}>{appt.outcome}</div>}
    </div>
  )
}

// ═══ CALL QUEUE ═══
function CallQueueTab({ pipeline, savePipeline }) {
  const leads = pipeline.filter(l=>l.phone).sort((a,b)=>b.score-a.score)
  const [idx, setIdx] = useState(0)
  const [notes, setNotes] = useState({})
  const [called, setCalled] = useState([])
  const cur = leads[idx]
  const markCalled = (id,outcome) => {
    setCalled(prev=>[...prev,id])
    savePipeline(pipeline.map(p=>p.id===id?{...p,stage:outcome==='Answered'?'Contacted':p.stage,notes:(p.notes?p.notes+' | ':'')+`Called: ${outcome}`}:p))
    if (idx<leads.length-1) setIdx(prev=>prev+1)
  }
  return (
    <div>
      <PageHeader title="Call Queue" sub="Work through leads by phone, highest score first" />
      {leads.length===0?<EmptyState icon="☏" title="No leads with phone numbers" sub="Add leads from the Lead Finder — most include phone numbers." />:(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div>
            <div className="section-header">Queue ({leads.length} leads with phones)</div>
            {leads.map((lead,i)=>(
              <div key={lead.id} onClick={()=>setIdx(i)} style={{padding:'10px 14px',marginBottom:6,background:i===idx?'rgba(109,138,64,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${i===idx?'rgba(109,138,64,0.35)':'var(--border)'}`,borderRadius:9,cursor:'pointer',opacity:called.includes(lead.id)?0.4:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:'var(--text3)',minWidth:22}}>#{i+1}</span>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{lead.name}</div><div style={{fontSize:11,color:'var(--text3)'}}>{lead.phone}</div></div>
                  <ScoreRing score={lead.score}/><TierTag tier={lead.tier}/>
                  {called.includes(lead.id)&&<span style={{fontSize:10,color:'#6d8a40'}}>✓</span>}
                </div>
              </div>
            ))}
          </div>
          {cur&&(
            <div className="card card-p fade-up">
              <div className="section-header">Now Calling</div>
              <div style={{textAlign:'center',marginBottom:20}}>
                <div style={{width:56,height:56,borderRadius:14,background:'rgba(109,138,64,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:800,color:'var(--olive)',margin:'0 auto 12px'}}>{(cur.name||'?')[0].toUpperCase()}</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--text)',marginBottom:4}}>{cur.name}</div>
                <a href={`tel:${cur.phone}`} style={{fontSize:22,fontWeight:800,color:'var(--olive2)',textDecoration:'none',display:'block',marginBottom:6}}>{cur.phone}</a>
                <div style={{fontSize:12,color:'var(--text3)'}}>{cur.address?.split(',').slice(0,2).join(',')}</div>
                <div style={{marginTop:8}}><TierTag tier={cur.tier}/><span style={{fontSize:12,color:'var(--text3)',marginLeft:6}}>{cur.websiteSignal}</span></div>
                {cur.address&&<a href={`https://maps.google.com/?q=${encodeURIComponent(cur.address)}`} target="_blank" rel="noreferrer" style={{display:'inline-block',marginTop:8,fontSize:12,color:'var(--olive2)',textDecoration:'none'}}>📍 View on Maps</a>}
              </div>
              <textarea value={notes[cur.id]||''} onChange={e=>setNotes({...notes,[cur.id]:e.target.value})} placeholder="Call notes..." style={{width:'100%',padding:'10px 12px',borderRadius:8,fontSize:13,minHeight:80,resize:'vertical',marginBottom:12}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {['Answered','No answer','Voicemail','Wrong number'].map(o=>(
                  <button key={o} onClick={()=>markCalled(cur.id,o)} className={`btn ${o==='Answered'?'btn-primary':'btn-ghost'} btn-sm`}>{o}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══ PROPOSALS ═══
function ProposalsTab({ pipeline }) {
  const [sel, setSel] = useState(null)
  const [proposal, setProposal] = useState('')
  const [competitor, setCompetitor] = useState('')
  const [loading, setLoading] = useState(false)

  const gen = async (lead) => {
    setSel(lead); setLoading(true); setProposal(''); setCompetitor('')
    const [p, c] = await Promise.all([callAI('proposal',{lead}), callAI('competitor_insight',{lead})])
    setProposal(p.result||''); setCompetitor(c.result||''); setLoading(false)
  }

  const subjectLine = proposal.split('\n').find(l=>l.startsWith('Subject:'))?.replace('Subject:','').trim()||''
  const body = proposal.split('\n').slice(proposal.split('\n').findIndex(l=>l.startsWith('Subject:'))+1).join('\n').trim()

  return (
    <div>
      <PageHeader title="Proposals" sub="AI-generated email proposals + competitor context" />
      <div style={{display:'grid',gridTemplateColumns:sel?'1fr 1fr':'1fr',gap:16}}>
        <div>
          <div className="section-header">Select a lead to generate a proposal</div>
          {pipeline.length===0&&<EmptyState icon="📄" title="No leads in pipeline" sub="Add leads from the Lead Finder first." />}
          {pipeline.map(lead=>(
            <div key={lead.id} onClick={()=>gen(lead)} style={{padding:'12px 16px',marginBottom:6,background:sel?.id===lead.id?'rgba(109,138,64,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${sel?.id===lead.id?'rgba(109,138,64,0.35)':'var(--border)'}`,borderRadius:10,cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:34,height:34,borderRadius:7,background:'rgba(109,138,64,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'var(--olive)'}}>{(lead.name||'?')[0].toUpperCase()}</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{lead.name}</div><div style={{fontSize:11,color:'var(--text3)'}}>{lead.category} · {lead.websiteSignal}</div></div>
              <TierTag tier={lead.tier}/>
            </div>
          ))}
        </div>
        {sel&&(
          <div>
            {loading?<div style={{textAlign:'center',padding:'40px 0'}}><Spinner size={28}/><p style={{color:'var(--text3)',fontSize:13,marginTop:10}}>Generating proposal + competitor briefing...</p></div>:(
              <>
                {competitor&&<div className="card card-p" style={{marginBottom:14,borderLeft:'3px solid var(--olive)'}}>
                  <div style={{fontSize:12,fontWeight:600,color:'var(--olive2)',marginBottom:8}}>🏆 Competitor Context</div>
                  <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{competitor}</div>
                </div>}
                {proposal&&<div className="card card-p">
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--olive2)'}}>📄 Proposal Email</div>
                    <div style={{display:'flex',gap:6}}>
                      <CopyBtn text={proposal} label="Copy all"/>
                      {sel.email&&<a href={`mailto:${sel.email}?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(body)}`} className="btn btn-primary btn-sm" style={{textDecoration:'none'}}>Send →</a>}
                    </div>
                  </div>
                  {subjectLine&&<div style={{background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'7px 10px',marginBottom:8,fontSize:12}}><strong style={{color:'var(--text3)'}}>Subject:</strong> {subjectLine}</div>}
                  <div style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'12px',fontSize:13,color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap',maxHeight:500,overflowY:'auto'}}>{body}</div>
                </div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ LEAD SCORING ═══
function ScoringTab({ pipeline }) {
  const [sel, setSel] = useState(null)
  const [explanation, setExplanation] = useState('')
  const [loading, setLoading] = useState(false)
  const sorted = [...pipeline].sort((a,b)=>b.score-a.score)
  const explain = async (lead) => {
    setSel(lead); setLoading(true); setExplanation('')
    const data = await callAI('score_explanation',{lead})
    setExplanation(data.result||''); setLoading(false)
  }
  return (
    <div>
      <PageHeader title="Lead Scoring" sub="Understand why each lead is scored the way it is" />
      <div className="card card-p" style={{marginBottom:20,fontSize:13,color:'var(--text2)',lineHeight:1.7}}>
        <strong style={{color:'var(--olive2)'}}>How scoring works:</strong> Leads start at 50. No website +40. Social only +25. Basic builder site +15. Low reviews add small bonuses. Max 99.
        <div style={{marginTop:10,display:'flex',gap:10,flexWrap:'wrap'}}>
          <span style={{padding:'3px 10px',borderRadius:100,fontSize:11,fontWeight:700,background:'#ef4444',color:'#fff'}}>Hot = 75+</span>
          <span style={{padding:'3px 10px',borderRadius:100,fontSize:11,fontWeight:700,background:'#f97316',color:'#fff'}}>Warm = 50–74</span>
          <span style={{padding:'3px 10px',borderRadius:100,fontSize:11,fontWeight:700,background:'#6b7280',color:'#fff'}}>Cold = under 50</span>
        </div>
      </div>
      {pipeline.length===0?<EmptyState icon="◈" title="No leads to score" sub="Add leads from the Lead Finder." />:(
        <div style={{display:'grid',gridTemplateColumns:sel?'1fr 1fr':'1fr',gap:16}}>
          <div>
            {sorted.map(lead=>(
              <div key={lead.id} onClick={()=>explain(lead)} style={{padding:'14px 18px',marginBottom:8,background:sel?.id===lead.id?'rgba(109,138,64,0.08)':'rgba(255,255,255,0.03)',border:`1px solid ${sel?.id===lead.id?'rgba(109,138,64,0.3)':'var(--border)'}`,borderRadius:10,cursor:'pointer'}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <ScoreRing score={lead.score}/>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{lead.name}</div><div style={{fontSize:11,color:'var(--text3)'}}>{lead.websiteSignal} · {lead.category}</div></div>
                  <TierTag tier={lead.tier}/>
                </div>
                <div style={{marginTop:10}}><ScoreBar score={lead.score}/></div>
              </div>
            ))}
          </div>
          {sel&&(
            <div className="card card-p fade-up">
              <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:4}}>{sel.name}</div>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:16}}><ScoreRing score={sel.score}/><TierTag tier={sel.tier}/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
                <InfoItem label="Website" val={sel.websiteSignal}/><InfoItem label="Rating" val={sel.rating?`${sel.rating}/5`:'None'}/>
                <InfoItem label="Reviews" val={sel.reviewCount||0}/><InfoItem label="Phone" val={sel.phone?'Listed':'None'}/>
              </div>
              <div className="section-header">AI Score Explanation</div>
              {loading?<div style={{textAlign:'center',padding:'20px 0'}}><Spinner/></div>:<div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,whiteSpace:'pre-wrap'}}>{explanation}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ═══ PERFORMANCE ═══
export { FollowUpTab, AppointmentsTab, AppointmentCard, CallQueueTab, ProposalsTab, ScoringTab }
