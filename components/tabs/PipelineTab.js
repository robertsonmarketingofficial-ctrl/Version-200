import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'
import { EmailModal, ResearchModal, LovableModal, fmtWA } from './modals'

const fmtTime = (iso) => { try { const d=new Date(iso); return d.toLocaleDateString('en-AU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) } catch{return iso} }

const fireConfetti = () => {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  canvas.width = window.innerWidth; canvas.height = window.innerHeight
  const cols = ['#7a9e49','#b8cf96','#f97316','#f59e0b','#10b981','#3b82f6','#f43f5e','#a855f7']
  const pieces = Array.from({length:130},()=>({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height*0.4-canvas.height*0.4,
    w:Math.random()*13+6, h:Math.random()*7+4, r:Math.random()*Math.PI,
    vx:Math.random()*5-2.5, vy:Math.random()*4+2, vr:Math.random()*0.14-0.07,
    color:cols[Math.floor(Math.random()*cols.length)], alpha:1
  }))
  let raf
  const draw = () => {
    ctx.clearRect(0,0,canvas.width,canvas.height)
    let alive = false
    for (const p of pieces) {
      p.x+=p.vx; p.y+=p.vy; p.r+=p.vr; p.alpha-=0.007
      if (p.alpha<=0||p.y>canvas.height+20) continue
      alive=true
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.globalAlpha=p.alpha
      ctx.fillStyle=p.color;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore()
    }
    if (alive) raf=requestAnimationFrame(draw)
    else { try{document.body.removeChild(canvas)}catch{} cancelAnimationFrame(raf) }
  }
  draw()
}
function AussieClocks({ stateFilter }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const fmt = (tz) => now.toLocaleTimeString('en-AU', { timeZone:tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true })
  const unique = [
    { state:'WA', tz:'Australia/Perth', color:'#3b82f6' },
    { state:'NT', tz:'Australia/Darwin', color:'#f97316' },
    { state:'SA', tz:'Australia/Adelaide', color:'#a855f7' },
    { state:'QLD', tz:'Australia/Brisbane', color:'#f59e0b' },
    { state:'NSW/ACT', tz:'Australia/Sydney',color:'#10b981' },
    { state:'VIC/TAS', tz:'Australia/Melbourne',color:'#6ee7b7' },
  ]
  return (
    <div style={{display:'flex',gap:0,background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)',borderRadius:10,marginBottom:14,overflow:'hidden',flexWrap:'wrap'}}>
      {unique.map((z,i) => {
        const time = fmt(z.tz)
        const isActive = stateFilter !== 'All' && z.state.includes(stateFilter)
        return (
          <div key={z.state} style={{flex:1,minWidth:90,padding:'8px 10px',borderRight:i<unique.length-1?'1px solid var(--border)':'none',background:isActive?'rgba(109,138,64,0.08)':'transparent',transition:'background 0.2s'}}>
            <div style={{fontSize:10,fontWeight:700,color:isActive?'var(--olive)':z.color,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{z.state}</div>
            <div style={{fontSize:13,fontWeight:700,color:isActive?'var(--olive2)':'var(--text)',fontVariantNumeric:'tabular-nums',letterSpacing:'-0.01em'}}>{time.replace(':00 ',' ').replace(':00 ',' ')}</div>
          </div>
        )
      })}
    </div>
  )
}

function ActivityLogModal({ lead, onClose, onSave }) {
  const [note, setNote] = useState('')
  const log = lead.activityLog || []
  const addNote = () => {
    if (!note.trim()) return
    onSave(lead.id, { type:'note', text:note.trim(), at:new Date().toISOString() })
    setNote('')
  }
  const logCall = () => onSave(lead.id, { type:'call', text:'Called', at:new Date().toISOString() })
  const logEmail = () => onSave(lead.id, { type:'email', text:'Sent email', at:new Date().toISOString() })
  const icons = { call:'📞', note:'📝', email:'✉' }
  const [callScript, setCallScript] = useState('')
  const [scriptLoading, setScriptLoading] = useState(false)
  const genScript = async () => {
    setScriptLoading(true); setCallScript('')
    const data = await callAI('callscript', { lead })
    setCallScript(data.result || ''); setScriptLoading(false)
  }
  return (
    <Modal title={`Activity — ${lead.name}`} onClose={onClose}>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <button onClick={logCall} className="btn btn-ghost btn-sm">📞 Log Call</button>
        <button onClick={logEmail} className="btn btn-ghost btn-sm">✉ Log Email</button>
        <button onClick={genScript} disabled={scriptLoading} className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}}>{scriptLoading?<Spinner size={10}/>:'🎯 Call Script'}</button>
      </div>
      {callScript&&<div style={{background:'rgba(122,158,73,0.07)',border:'1px solid rgba(122,158,73,0.18)',borderRadius:9,padding:'12px 14px',marginBottom:14,fontSize:13,lineHeight:1.7,color:'var(--text)',whiteSpace:'pre-wrap'}}><div style={{fontSize:10,fontWeight:700,color:'var(--olive)',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.07em'}}>Call Opening Script</div>{callScript}<div style={{marginTop:8}}><CopyBtn text={callScript} label="Copy script"/></div></div>}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input value={note} onChange={e=>setNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addNote()} placeholder="Add a note..." style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13}}/>
        <button onClick={addNote} disabled={!note.trim()} className="btn btn-primary btn-sm">Add</button>
      </div>
      {log.length===0 ? <div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No activity yet</div> : (
        <div style={{maxHeight:300,overflowY:'auto'}}>
          {[...log].reverse().map((entry,i)=>(
            <div key={i} style={{display:'flex',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
              <span style={{fontSize:16,flexShrink:0}}>{icons[entry.type]||'📌'}</span>
              <div style={{flex:1}}>
                <div style={{color:'var(--text)'}}>{entry.text}</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{fmtTime(entry.at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function QuickAddModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:'',phone:'',email:'',category:'Roofer',address:'',notes:'' })
  const set = (k,v) => setForm(p=>({...p,[k]:v}))
  const submit = () => {
    if (!form.name.trim()) return
    onAdd({ id:Date.now().toString(), name:form.name.trim(), phone:form.phone.trim(), email:form.email.trim(), category:form.category, address:form.address.trim(), notes:form.notes.trim(), score:50, tier:'Warm', websiteSignal:'Unknown', website:'' })
    onClose()
  }
  return (
    <Modal title="Quick-Add Lead" onClose={onClose}>
      <div style={{display:'grid',gap:10}}>
        {[['name','Business Name *'],['phone','Phone'],['email','Email'],['address','Address']].map(([k,label])=>(
          <div key={k}>
            <label style={{fontSize:11,color:'var(--text3)',fontWeight:600,display:'block',marginBottom:4}}>{label}</label>
            <input value={form[k]} onChange={e=>set(k,e.target.value)} onKeyDown={e=>e.key==='Enter'&&k==='name'&&submit()} style={{width:'100%',padding:'8px 12px',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)',boxSizing:'border-box'}}/>
          </div>
        ))}
        <div>
          <label style={{fontSize:11,color:'var(--text3)',fontWeight:600,display:'block',marginBottom:4}}>Category</label>
          <select value={form.category} onChange={e=>set('category',e.target.value)} style={{width:'100%',padding:'8px 12px',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)'}}>
            {CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:11,color:'var(--text3)',fontWeight:600,display:'block',marginBottom:4}}>Notes</label>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={2} style={{width:'100%',padding:'8px 12px',borderRadius:8,fontSize:13,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text)',boxSizing:'border-box',resize:'none'}}/>
        </div>
        <button onClick={submit} disabled={!form.name.trim()} className="btn btn-primary" style={{width:'100%',padding:'10px',fontSize:13}}>＋ Add to Pipeline</button>
      </div>
    </Modal>
  )
}

function PipelineTab({ pipeline, savePipeline, addToPipeline, showToast, setTab }) {
  const [filter, setFilter] = useState('All')
  const [stateFilter, setStateFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [maxRating, setMaxRating] = useState(0) // 0 = off; otherwise only show leads rated below this
  const [modal, setModal] = useState(null)
  const [sel, setSel] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [bulkEmail, setBulkEmail] = useState({subject:'',body:''})
  const [researchQ, setResearchQ] = useState('')
  const [aiResult, setAiResult] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'kanban'
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [draggedId, setDraggedId] = useState(null)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const goingCold = (lead) => {
    if (['Closed','Not interested'].includes(lead.stage)) return false
    if (!['Hot','Warm'].includes(lead.tier)) return false
    const log = lead.activityLog||[]
    const last = log.length>0 ? new Date(log[log.length-1].at) : new Date(lead.addedAt||0)
    return (Date.now()-last.getTime())/86400000 > 3
  }
  const lastContacted = (lead) => {
    const log = lead.activityLog||[]
    if (log.length===0) return null
    const days = Math.floor((Date.now()-new Date(log[log.length-1].at).getTime())/86400000)
    return days===0 ? 'today' : days===1 ? 'yesterday' : `${days}d ago`
  }
  const extractState = (lead) => {
    const addr = (lead.address||'').toUpperCase()
    for (const s of ['NSW','VIC','QLD','SA','WA','TAS','NT','ACT']) {
      if (new RegExp(`\\b${s}\\b`).test(addr)) return s
    }
    return null
  }
  const presentStates = ['All', ...['NSW','VIC','QLD','SA','WA','TAS','NT','ACT'].filter(s => pipeline.some(l => extractState(l)===s))]

  const filtered = pipeline
    .filter(p => filter === 'All' || p.stage === filter)
    .filter(p => stateFilter === 'All' || extractState(p) === stateFilter)
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => !maxRating || (p.rating && p.rating < maxRating))
    // Bad-review leads (rating under 4, but they do have a rating) float to
    // the top — a bad public reputation is a strong, specific pain point
    // worth leading your pitch with, so these are worth seeing first.
    .sort((a,b) => {
      const aBad = a.rating && a.rating < 4 ? 1 : 0
      const bBad = b.rating && b.rating < 4 ? 1 : 0
      return bBad - aBad
    })

  const updateStage = (id, stage) => { if(stage==='Closed') fireConfetti(); savePipeline(pipeline.map(p => p.id === id ? {...p,stage} : p)) }
  const updateNotes = (id, notes) => savePipeline(pipeline.map(p => p.id === id ? {...p,notes} : p))
  const updateFollowUp = (id, followUpDate) => savePipeline(pipeline.map(p => p.id === id ? {...p,followUpDate} : p))
  const updateDealValue = (id, dealValue) => savePipeline(pipeline.map(p => p.id === id ? {...p,dealValue:+dealValue||0} : p))
  const updateScore = (id, delta) => savePipeline(pipeline.map(p => p.id === id ? {...p,score:Math.max(0,Math.min(100,(p.score||0)+delta))} : p))
  const remove = (id) => { savePipeline(pipeline.filter(p => p.id !== id)); showToast('Lead removed') }

  const addActivity = (id, entry) => {
    savePipeline(pipeline.map(p => p.id === id ? {...p, activityLog:[...(p.activityLog||[]),entry]} : p))
    showToast(entry.type === 'call' ? '📞 Call logged' : entry.type === 'email' ? '✉ Email logged' : '📝 Note saved')
  }

  const toggleSelect = (id) => setSelectedIds(prev => { const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s })
  const selectAll = () => setSelectedIds(new Set(filtered.map(l=>l.id)))
  const selectAllNoWebsite = () => setSelectedIds(new Set(filtered.filter(l=>!l.website).map(l=>l.id)))
  const selectAllMobile = () => setSelectedIds(new Set(filtered.filter(l=>l.phone && l.phone.replace(/\D/g,'').startsWith('04')).map(l=>l.id)))
  const selectAllBadReviews = () => setSelectedIds(new Set(filtered.filter(l=>l.rating && l.rating < 4).map(l=>l.id)))
  const clearSelect = () => setSelectedIds(new Set())
  const bulkSetStage = (stage) => { savePipeline(pipeline.map(p=>selectedIds.has(p.id)?{...p,stage}:p)); showToast(`${selectedIds.size} leads → ${stage}`); clearSelect() }
  const bulkDelete = () => { if(!confirm(`Delete ${selectedIds.size} leads?`))return; savePipeline(pipeline.filter(p=>!selectedIds.has(p.id))); showToast(`${selectedIds.size} leads deleted`); clearSelect() }
  const sendSelectedToQueue = () => {
    const eligible = pipeline.filter(p => selectedIds.has(p.id) && p.email && !p.contacted)
    if (!eligible.length) { showToast('None of the selected leads have an email, or are already contacted'); return }
    savePipeline(pipeline.map(p => selectedIds.has(p.id) && p.email && !p.contacted ? { ...p, queuedForApproval: true } : p))
    showToast(`${eligible.length} lead${eligible.length===1?'':'s'} sent to Approval Queue ✓`)
    setTab?.('approval')
    clearSelect()
  }
  const openSelectedEmails = () => {
    const addrs = pipeline.filter(p => selectedIds.has(p.id) && p.email).map(p => p.email)
    if (!addrs.length) { showToast('No emails in selection'); return }
    window.location.href = `mailto:${addrs.join(',')}`
  }
  const bulkExport = () => {
    const sel = pipeline.filter(p=>selectedIds.has(p.id))
    const headers = ['Name','Category','Phone','Email','Website','Score','Tier','Stage','Notes','Follow Up']
    const rows = sel.map(l=>[l.name||'',l.category||'',l.phone||'',l.email||'',l.website||'',l.score||'',l.tier||'',l.stage||'',l.notes||'',l.followUpDate||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))
    const csv=[headers.join(','),...rows].join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='selected-leads.csv';a.click()
    showToast('Exported ✓')
  }

  const exportCSV = () => {
    const headers = ['Name','Category','Phone','Email','Website','Score','Tier','Stage','Notes','Follow Up','Address']
    const rows = pipeline.map(l => [l.name||'',l.category||'',l.phone||'',l.email||'',l.website||'',l.score||'',l.tier||'',l.stage||'',l.notes||'',l.followUpDate||'',l.address||''].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
    const csv = [headers.join(','),...rows].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = 'robertson-leads.csv'; a.click()
    showToast('CSV exported ✓')
  }

  const openEmails = (lead) => { setSel(lead); setModal('emails') }
  const openResearch = (lead) => { setSel(lead); setResearchQ(''); setAiResult(''); setModal('research') }
  const doResearch = async () => {
    if (!researchQ.trim()) return
    setAiLoading(true); setAiResult('')
    const data = await callAI('research', { lead: sel, question: researchQ })
    setAiResult(data.result || ''); setAiLoading(false)
  }
  const openLovable = (lead) => { setSel(lead); setModal('lovable') }
  const openActivity = (lead) => { setSel(lead); setModal('activity') }
  const openBulk = async () => {
    setModal('bulk'); setAiLoading(true); setBulkEmail({subject:'',body:''})
    const data = await callAI('bulk_emails', { leads: pipeline })
    if (data.result) {
      const m = data.result.match(/---EMAIL---([\s\S]*?)---END---/)
      if (m) { const lines = m[1].trim().split('\n'); const si = lines.findIndex(l => l.startsWith('Subject:')); setBulkEmail({ subject: lines[si]?.replace('Subject:','').trim()||'', body: lines.slice(si+1).join('\n').trim() }) }
    }
    setAiLoading(false)
  }

  // Kanban drag handlers
  const onDragStart = (e, id) => { setDraggedId(id); e.dataTransfer.effectAllowed='move' }
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect='move' }
  const onDrop = (e, stage) => { e.preventDefault(); if(draggedId) { updateStage(draggedId, stage); setDraggedId(null) } }

  const LeadCard = ({ lead, compact=false }) => (
    <div
      className="card lead-card"
      style={{ padding: compact?'10px 12px':'16px 20px', marginBottom:8, opacity: draggedId===lead.id ? 0.4 : 1, cursor: viewMode==='kanban'?'grab':'default' }}
      draggable={viewMode==='kanban'}
      onDragStart={e=>onDragStart(e,lead.id)}
    >
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, flexWrap:'wrap' }}>
        {!compact && (
          <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={()=>toggleSelect(lead.id)}
            style={{marginTop:4,accentColor:'var(--olive)',flexShrink:0,cursor:'pointer'}} onClick={e=>e.stopPropagation()}/>
        )}
        <div style={{ width:34, height:34, borderRadius:7, background:'rgba(109,138,64,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'var(--olive)', flexShrink:0 }}>{(lead.name||'?')[0].toUpperCase()}</div>
        <div style={{ flex:1, minWidth:compact?120:160 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:3 }}>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{lead.name}</span>
            <TierTag tier={lead.tier}/>
            <span style={{ fontSize:11, color:'var(--text3)' }}>{lead.score}</span>
            {lead.contacted && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:'rgba(16,185,129,0.15)', color:'#10b981' }}>✓ Contacted via email</span>}
            {!lead.contacted && lead.queuedForApproval && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:'rgba(234,179,8,0.15)', color:'#eab308' }}>⏳ Queued for approval</span>}
            {lead.rating && lead.rating < 4 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:'rgba(239,68,68,0.15)', color:'#ef4444' }}>⭐ {lead.rating}★ ({lead.reviewCount||0} reviews)</span>}
            {!compact && (
              <span style={{ display:'flex', gap:2 }}>
                <button onClick={()=>updateScore(lead.id,-5)} style={{background:'rgba(255,255,255,0.06)',border:'none',borderRadius:4,color:'var(--text3)',cursor:'pointer',fontSize:10,padding:'1px 4px',lineHeight:1.4}}>−</button>
                <button onClick={()=>updateScore(lead.id,+5)} style={{background:'rgba(255,255,255,0.06)',border:'none',borderRadius:4,color:'var(--olive)',cursor:'pointer',fontSize:10,padding:'1px 4px',lineHeight:1.4}}>+</button>
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', display:'flex', gap:8, flexWrap:'wrap', marginBottom:compact?0:5 }}>
            {lead.phone && <a href={`tel:${lead.phone}`} style={{color:'var(--text3)',textDecoration:'none'}} onClick={e=>e.stopPropagation()}>📞 {lead.phone}</a>}
            {lead.phone && <a href={`https://wa.me/${fmtWA(lead.phone)}`} target="_blank" rel="noreferrer" style={{color:'#25d366',textDecoration:'none',fontWeight:600}} onClick={e=>e.stopPropagation()}>💬 WA</a>}
            {lead.email && <span>✉ {lead.email}</span>}
            {!compact && lead.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`} target="_blank" rel="noreferrer" style={{color:'var(--olive2)',textDecoration:'none'}}>📍 Maps</a>}
          </div>
          {!compact && (
            <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:4}}>
              {goingCold(lead)&&<span style={{fontSize:10,fontWeight:700,color:'#f97316',background:'rgba(249,115,22,0.12)',border:'1px solid rgba(249,115,22,0.25)',borderRadius:5,padding:'2px 7px'}}>🧊 Going cold</span>}
              {lastContacted(lead)&&<span style={{fontSize:10,color:'var(--text3)'}}>Last contact: {lastContacted(lead)}</span>}
              <span style={{fontSize:10,color:'var(--text3)',marginLeft:'auto'}}>Deal: $<input type="number" value={lead.dealValue||1500} onChange={e=>{e.stopPropagation();updateDealValue(lead.id,e.target.value)}} onClick={e=>e.stopPropagation()} style={{width:60,background:'transparent',border:'none',color:'var(--olive2)',fontSize:10,fontWeight:600,outline:'none'}}/></span>
            </div>
          )}
          {!compact && (
            <div style={{ display:'flex', gap:7, flexWrap:'wrap', alignItems:'center' }}>
              <select value={lead.stage} onChange={e=>{e.stopPropagation();updateStage(lead.id,e.target.value)}} style={{padding:'4px 8px',borderRadius:7,fontSize:11,minWidth:130}}>
                {STAGES.map(s=><option key={s}>{s}</option>)}
              </select>
              <input value={lead.notes||''} onChange={e=>updateNotes(lead.id,e.target.value)} placeholder="Notes..." style={{flex:1,minWidth:100,padding:'4px 8px',borderRadius:7,fontSize:11}}/>
              <input type="date" value={lead.followUpDate||''} onChange={e=>updateFollowUp(lead.id,e.target.value)} style={{padding:'4px 8px',borderRadius:7,fontSize:11}}/>
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', flexShrink:0 }}>
          <button onClick={()=>openActivity(lead)} className="btn btn-ghost btn-sm" title="Activity log">
            📋{(lead.activityLog||[]).length>0&&<span style={{marginLeft:2,fontSize:10,color:'var(--olive)'}}>{(lead.activityLog||[]).length}</span>}
          </button>
          {lead.email && <a href={`mailto:${lead.email}`} onClick={e=>e.stopPropagation()} className="btn btn-sm" style={{background:'rgba(122,158,73,0.18)',color:'var(--olive)',border:'1px solid rgba(122,158,73,0.35)',textDecoration:'none',fontWeight:700}}>✉ Email Now</a>}
          <button onClick={()=>openEmails(lead)} className="btn btn-ghost btn-sm" title="Email templates">✉ Templates</button>
          <button onClick={()=>openResearch(lead)} className="btn btn-ghost btn-sm" title="AI research">🤖</button>
          {!compact && <button onClick={()=>openLovable(lead)} className="btn btn-ghost btn-sm" title="Lovable brief">⚡</button>}
          <button onClick={()=>remove(lead.id)} className="btn btn-danger btn-sm">×</button>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <PageHeader title="Pipeline" sub={`${pipeline.length} leads tracked`} noMargin />
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {[{v:'list',l:'☰ List'},{v:'kanban',l:'⊞ Kanban'}].map(({v,l})=>(
              <button key={v} onClick={()=>setViewMode(v)} style={{padding:'5px 12px',background:viewMode===v?'rgba(109,138,64,0.2)':'transparent',border:'none',color:viewMode===v?'var(--olive2)':'var(--text3)',cursor:'pointer',fontSize:12,fontWeight:viewMode===v?600:400}}>{l}</button>
            ))}
          </div>
          <button onClick={() => setShowQuickAdd(true)} className="btn btn-ghost btn-sm">＋ Quick Add</button>
          {pipeline.length > 0 && <button onClick={exportCSV} className="btn btn-ghost btn-sm">⬇ CSV</button>}
          {pipeline.length > 0 && <button onClick={openBulk} className="btn btn-ghost btn-sm">✉ Bulk Email</button>}
        </div>
      </div>

      {/* AUSSIE STATE CLOCKS */}
      <AussieClocks stateFilter={stateFilter} />

      {/* BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div style={{background:'rgba(109,138,64,0.12)',border:'1px solid rgba(109,138,64,0.3)',borderRadius:10,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <span style={{fontSize:13,fontWeight:600,color:'var(--olive2)'}}>{selectedIds.size} selected</span>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {STAGES.map(s=><button key={s} onClick={()=>bulkSetStage(s)} className="btn btn-ghost btn-sm" style={{fontSize:11}}>{s}</button>)}
          </div>
          <button onClick={bulkExport} className="btn btn-ghost btn-sm">⬇ Export</button>
          <button onClick={sendSelectedToQueue} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:8,background:'rgba(234,179,8,0.18)',color:'#eab308',border:'1px solid rgba(234,179,8,0.35)',cursor:'pointer',fontSize:12,fontWeight:700}}>✓ Send to Approval Queue</button>
          <button onClick={openSelectedEmails} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:8,background:'rgba(122,158,73,0.18)',color:'var(--olive2)',border:'1px solid rgba(122,158,73,0.35)',cursor:'pointer',fontSize:12,fontWeight:700}}>✉ Open All Emails</button>
          <button onClick={bulkDelete} className="btn btn-danger btn-sm">🗑 Delete</button>
          <button onClick={clearSelect} style={{marginLeft:'auto',background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:12}}>✕ Clear</button>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <input type="checkbox" onChange={e=>e.target.checked?selectAll():clearSelect()} checked={selectedIds.size===filtered.length&&filtered.length>0} style={{accentColor:'var(--olive)',cursor:'pointer'}}/>
              <span style={{fontSize:11,color:'var(--text3)'}}>All</span>
            </div>
            <button onClick={selectAllNoWebsite} style={{padding:'4px 10px',borderRadius:7,border:'1px solid rgba(244,63,94,0.4)',background:'rgba(244,63,94,0.08)',color:'#f43f5e',cursor:'pointer',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
              🔴 Select No Website ({filtered.filter(l=>!l.website).length})
            </button>
            <button onClick={selectAllMobile} style={{padding:'4px 10px',borderRadius:7,border:'1px solid rgba(59,130,246,0.4)',background:'rgba(59,130,246,0.08)',color:'#3b82f6',cursor:'pointer',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
              📱 Select Mobile (04) ({filtered.filter(l=>l.phone && l.phone.replace(/\D/g,'').startsWith('04')).length})
            </button>
            <button onClick={selectAllBadReviews} style={{padding:'4px 10px',borderRadius:7,border:'1px solid rgba(239,68,68,0.4)',background:'rgba(239,68,68,0.08)',color:'#ef4444',cursor:'pointer',fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>
              ⭐ Select Bad Reviews ({filtered.filter(l=>l.rating && l.rating < 4).length})
            </button>
            <select value={maxRating} onChange={e=>setMaxRating(Number(e.target.value))}
              style={{padding:'4px 10px',borderRadius:7,fontSize:11,fontWeight:700,border:`1px solid ${maxRating?'rgba(239,68,68,0.4)':'var(--border)'}`,background:maxRating?'rgba(239,68,68,0.08)':'rgba(255,255,255,0.04)',color:maxRating?'#ef4444':'var(--text2)',cursor:'pointer'}}>
              <option value={0}>All ratings</option>
              <option value={4.5}>Only below 4.5★</option>
              <option value={4}>Only below 4★</option>
              <option value={3.5}>Only below 3.5★</option>
              <option value={3}>Only below 3★</option>
            </select>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search leads..." style={{padding:'5px 10px',borderRadius:7,fontSize:12,minWidth:160}}/>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {['All',...STAGES].map(s=><button key={s} onClick={()=>setFilter(s)} style={{padding:'4px 10px',borderRadius:7,border:`1px solid ${filter===s?'rgba(109,138,64,0.5)':'var(--border)'}`,background:filter===s?'rgba(109,138,64,0.12)':'transparent',color:filter===s?'var(--olive2)':'var(--text3)',cursor:'pointer',fontSize:11,fontWeight:filter===s?600:400}}>{s}</button>)}
            </div>
            {presentStates.length > 1 && (
              <div style={{display:'flex',gap:5,flexWrap:'wrap',paddingTop:4,borderTop:'1px solid var(--border)',width:'100%'}}>
                <span style={{fontSize:10,color:'var(--text3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',alignSelf:'center',marginRight:2}}>State:</span>
                {presentStates.map(s=><button key={s} onClick={()=>setStateFilter(s)} style={{padding:'3px 9px',borderRadius:6,border:`1px solid ${stateFilter===s?'rgba(109,138,64,0.5)':'var(--border)'}`,background:stateFilter===s?'rgba(109,138,64,0.12)':'transparent',color:stateFilter===s?'var(--olive2)':'var(--text3)',cursor:'pointer',fontSize:11,fontWeight:stateFilter===s?600:400}}>{s}</button>)}
              </div>
            )}
          </div>
          {filtered.length===0&&<EmptyState icon="◫" title="No leads here" sub={filter==='All'?'Add leads from the Lead Finder':`No leads in "${filter}" stage`}/>}
          {filtered.map(lead=><LeadCard key={lead.id} lead={lead}/>)}
        </>
      )}

      {/* KANBAN VIEW */}
      {viewMode === 'kanban' && (
        <div style={{overflowX:'auto',paddingBottom:12}}>
          <div style={{display:'flex',gap:12,minWidth:'max-content'}}>
            {STAGES.map(stage=>{
              const stageLeads = pipeline.filter(p=>p.stage===stage)
              return (
                <div key={stage}
                  onDragOver={onDragOver}
                  onDrop={e=>onDrop(e,stage)}
                  style={{width:230,flexShrink:0,background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 8px',minHeight:300}}
                >
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,padding:'0 4px'}}>
                    <span style={{fontSize:12,fontWeight:700,color:'var(--text2)'}}>{stage}</span>
                    <span style={{fontSize:11,color:'var(--text3)',background:'rgba(255,255,255,0.06)',borderRadius:10,padding:'1px 7px'}}>{stageLeads.length}</span>
                  </div>
                  {stageLeads.map(lead=><LeadCard key={lead.id} lead={lead} compact/>)}
                  {stageLeads.length===0&&<div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:12}}>Drop here</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showQuickAdd && <QuickAddModal onAdd={(lead)=>{ if (addToPipeline) { addToPipeline(lead) } else { savePipeline([...pipeline,{...lead,stage:'New',notes:'',activityLog:[],followUpDate:'',dealValue:1500,addedAt:new Date().toISOString()}]) } setShowQuickAdd(false)}} onClose={()=>setShowQuickAdd(false)}/>}
      {modal==='emails' && <EmailModal lead={sel} onClose={()=>setModal(null)}/>}
      {modal==='research' && <ResearchModal lead={sel} result={aiResult} loading={aiLoading} question={researchQ} setQuestion={setResearchQ} onAsk={doResearch} onClose={()=>setModal(null)}/>}
      {modal==='lovable' && <LovableModal lead={sel} onClose={()=>setModal(null)}/>}
      {modal==='activity' && sel && <ActivityLogModal lead={sel} onClose={()=>setModal(null)} onSave={(id,entry)=>{addActivity(id,entry);setSel(pipeline.find(p=>p.id===id)||sel)}}/>}
      {modal === 'bulk' && (() => {
        const emailLeads = pipeline.filter(l => l.email)
        const sendAll = () => {
          if (!emailLeads.length) return
          const bcc = emailLeads.map(l => l.email).join(',')
          window.open(`mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(bulkEmail.subject)}&body=${encodeURIComponent(bulkEmail.body)}`)
        }
        return (
          <Modal title={`Bulk email — ${pipeline.length} leads`} onClose={() => setModal(null)}>
            {aiLoading ? <div style={{ textAlign: 'center', padding: '30px 0' }}><Spinner size={28} /></div> : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>Edit below, then send to <strong style={{ color: 'var(--olive2)' }}>{emailLeads.length} leads with emails</strong> in one click.</p>
                  <CopyBtn text={`Subject: ${bulkEmail.subject}\n\n${bulkEmail.body}`} label="Copy" />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Subject</label>
                  <input value={bulkEmail.subject} onChange={e => setBulkEmail(prev => ({ ...prev, subject: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', boxSizing: 'border-box' }}/>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Body</label>
                  <textarea value={bulkEmail.body} onChange={e => setBulkEmail(prev => ({ ...prev, body: e.target.value }))} rows={10} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', lineHeight: 1.7, resize: 'vertical', boxSizing: 'border-box' }}/>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>{emailLeads.length === 0 ? '⚠ No leads have emails yet' : `✉ ${emailLeads.length} of ${pipeline.length} leads have emails`}</span>
                  <button onClick={sendAll} disabled={!emailLeads.length || !bulkEmail.subject || !bulkEmail.body} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: 13 }}>✉ Send to All {emailLeads.length > 0 ? `(${emailLeads.length})` : ''}</button>
                </div>
              </div>
            )}
          </Modal>
        )
      })()}
    </div>
  )
}

// ═══ ANALYTICS ═══
export { PipelineTab, AussieClocks, ActivityLogModal, QuickAddModal }
