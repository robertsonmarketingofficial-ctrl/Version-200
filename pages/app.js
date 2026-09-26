import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Toast, useToast } from '../components/shared'

import { DashboardTab } from '../components/tabs/DashboardTab'
import { FinderTab } from '../components/tabs/FinderTab'
import { WorkspaceTab } from '../components/tabs/WorkspaceTab'
import { PipelineTab } from '../components/tabs/PipelineTab'
import { ApprovalTab } from '../components/tabs/ApprovalTab'
import { AFKTab } from '../components/tabs/AFKTab'
import { AnalyticsTab } from '../components/tabs/AnalyticsTab'
import { OutreachTab } from '../components/tabs/OutreachTab'
import { SMSTab } from '../components/tabs/SMSTab'
import { FollowUpTab, AppointmentsTab, CallQueueTab, ProposalsTab, ScoringTab } from '../components/tabs/MiscTabs'
import { PerformanceTab, TrainingTab, PaymentsTab } from '../components/tabs/PerformanceTabs'
import { SettingsTab } from '../components/tabs/SettingsTab'

const load = (key, def) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def } }
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

const NAV = [
  { id: 'dashboard', icon: '⊞', label: 'Dashboard' },
  { id: 'finder', icon: '🔍', label: 'Lead Finder' },
  { id: 'workspace', icon: '◈', label: 'Preview Workspace' },
  { id: 'pipeline', icon: '◫', label: 'Pipeline' },
  { id: 'approval', icon: '✓', label: 'Approval Queue' },
  { id: 'afk', icon: '⚡', label: 'AFK Mode' },
  { id: 'analytics', icon: '◑', label: 'Analytics' },
  { id: 'outreach', icon: '✉', label: 'Outreach & Email' },
  { id: 'sms', icon: '💬', label: 'SMS Templates' },
  { id: 'followup', icon: '↻', label: 'Follow-Up' },
  { id: 'appointments', icon: '◷', label: 'Appointments' },
  { id: 'callqueue', icon: '☏', label: 'Call Queue' },
  { id: 'proposals', icon: '📄', label: 'Proposals' },
  { id: 'scoring', icon: '◈', label: 'Lead Scoring' },
  { id: 'performance', icon: '📊', label: 'Sales Performance' },
  { id: 'training', icon: '◎', label: 'Sales Training' },
  { id: 'payments', icon: '$', label: 'Payments' },
  { id: 'settings', icon: '⚙', label: 'Settings & Debug' },
]

const STAGE_WEIGHTS = { 'New':0.05,'Contacted':0.15,'Replied':0.3,'Meeting booked':0.5,'Proposal sent':0.7,'Closed':1.0,'Not interested':0 }

const SALES_QUOTES = [
  "The fortune is in the follow-up.",
  "Every no is one step closer to yes.",
  "Discipline equals freedom. — Jocko Willink",
  "Work while they sleep. Learn while they party.",
  "Sales is the transfer of enthusiasm.",
  "Your network is your net worth.",
  "Don't count the days — make the days count.",
  "The best salespeople listen more than they talk.",
  "Comfort is the enemy of progress.",
  "One more call. Always one more call.",
  "You eat what you kill.",
  "Outwork everyone in the room.",
  "Fortune favours the bold.",
  "The harder you work, the luckier you get.",
  "Done is better than perfect.",
  "Rejection is redirection.",
  "Stop waiting for the right moment. Start now.",
  "A year from now you'll wish you started today.",
  "Build the business you wish existed.",
  "Revenue solves most problems.",
  "The world's best closer follows up relentlessly.",
  "If it doesn't challenge you, it won't change you.",
  "Move fast. Win fast. Learn fast.",
  "Your mindset is your competitive advantage.",
  "Be the person who makes the call others won't.",
  "Every champion was once a contender who refused to quit.",
  "First in, last out.",
  "Think big. Start small. Act now.",
  "The market rewards execution, not ideas.",
  "Keep going. You're closer than you think.",
  "Losers make excuses. Winners make it happen.",
  "You become what you consistently do.",
  "Talk less. Close more.",
  "Your future is created by what you do today.",
]

function fireConfetti() {
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


function MotivationalBanner({ quotes }) {
  const doubled = [...quotes, ...quotes]
  return (
    <div style={{
      background: 'linear-gradient(90deg, rgba(122,158,73,0.06) 0%, rgba(184,207,150,0.04) 50%, rgba(122,158,73,0.06) 100%)',
      borderBottom: '1px solid rgba(122,158,73,0.12)',
      padding: '8px 0',
      position: 'relative',
    }}>
      <div className="ticker-wrap">
        <div className="ticker-track">
          {doubled.map((q, i) => (
            <span key={i} className="ticker-item">
              <span style={{ color: 'var(--olive)', fontSize: 13 }}>✦</span>
              {q}
              <span className="ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function PowerHourWidget({ pipeline, onClose }) {
  const [secs, setSecs] = useState(25*60)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [startTime] = useState(Date.now())
  useEffect(() => {
    if (!running||secs<=0) return
    const t = setInterval(()=>setSecs(s=>{ if(s<=1){setRunning(false);setDone(true);fireConfetti();return 0} return s-1 }),1000)
    return ()=>clearInterval(t)
  },[running])
  const mm=String(Math.floor(secs/60)).padStart(2,'0'), ss=String(secs%60).padStart(2,'0')
  const pct=(secs/(25*60))*100
  const sessionActivity=pipeline.flatMap(l=>(l.activityLog||[]).filter(e=>new Date(e.at).getTime()>startTime)).length
  return (
    <div style={{position:'fixed',bottom:80,right:24,background:'var(--card)',border:'1px solid var(--border)',borderRadius:18,padding:'18px 22px',width:244,zIndex:300,boxShadow:'0 12px 48px rgba(0,0,0,0.5)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:800,color:'var(--text)'}}>⚡ Power Hour</div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
      </div>
      {done?(
        <div style={{textAlign:'center',padding:'8px 0 4px'}}>
          <div style={{fontSize:34,marginBottom:6}}>🎉</div>
          <div style={{fontSize:15,fontWeight:800,color:'var(--olive)',marginBottom:4}}>Session complete!</div>
          <div style={{fontSize:12,color:'var(--text3)',marginBottom:14}}>{sessionActivity} activities logged</div>
          <button onClick={()=>{setSecs(25*60);setDone(false)}} className="btn btn-ghost btn-sm">↩ New session</button>
        </div>
      ):(
        <>
          <div style={{textAlign:'center',marginBottom:14}}>
            <div style={{fontSize:46,fontWeight:900,color:secs<300?'#ef4444':'var(--olive2)',fontVariantNumeric:'tabular-nums',letterSpacing:'-0.03em',lineHeight:1}}>{mm}:{ss}</div>
            <div style={{height:5,background:'rgba(255,255,255,0.08)',borderRadius:3,marginTop:12}}>
              <div style={{height:'100%',width:`${pct}%`,background:secs<300?'linear-gradient(90deg,#ef4444,#f97316)':'linear-gradient(90deg,#7a9e49,#b8cf96)',borderRadius:3,transition:'width 1s linear'}}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:12}}>
            <button onClick={()=>setRunning(r=>!r)} className="btn btn-primary" style={{padding:'7px 20px',fontSize:13}}>{running?'⏸ Pause':'▶ Start'}</button>
            <button onClick={()=>{setSecs(25*60);setRunning(false)}} className="btn btn-ghost btn-sm">↩</button>
          </div>
          <div style={{textAlign:'center',fontSize:11,color:'var(--text3)'}}>⚡ {sessionActivity} activities this session</div>
        </>
      )}
    </div>
  )
}


export default function AppV2() {
  const [tab, setTab] = useState('dashboard')
  const [pipeline, setPipeline] = useState([])
  const [searchHistory, setSearchHistory] = useState([])
  const [appointments, setAppointments] = useState([])
  const [performance, setPerformance] = useState({ calls: 0, emails: 0, meetings: 0, closed: 0 })
  const [analyticsOverrides, setAnalyticsOverrides] = useState({})
  const [toast, showToast] = useToast()
  const [pipelineJustAdded, setPipelineJustAdded] = useState(false)
  const [powerHour, setPowerHour] = useState(false)
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * 34))

  useEffect(() => {
    setPipeline(load('rmv2_pipeline', []))
    setSearchHistory(load('rmv2_searches', []))
    setAppointments(load('rmv2_appointments', []))
    setPerformance(load('rmv2_performance', { calls: 0, emails: 0, meetings: 0, closed: 0 }))
    setAnalyticsOverrides(load('rmv2_analytics_overrides', {}))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setQuoteIdx(i => (i+1) % SALES_QUOTES.length), 28000)
    return () => clearInterval(t)
  }, [])

  // Ref mirrors pipeline state so rapid consecutive adds never read stale data
  const pipelineRef = useRef(pipeline)
  useEffect(() => { pipelineRef.current = pipeline }, [pipeline])

  const savePipeline = (p) => { pipelineRef.current = p; setPipeline(p); save('rmv2_pipeline', p) }
  const saveAppointments = (a) => { setAppointments(a); save('rmv2_appointments', a) }
  const savePerformance = (p) => { setPerformance(p); save('rmv2_performance', p) }
  const saveAnalyticsOverrides = (o) => { setAnalyticsOverrides(o); save('rmv2_analytics_overrides', o) }

  const buildPipelineLead = (lead) => ({ ...lead, stage: lead.stage || 'New', notes: '', activityLog: [], followUpDate: '', dealValue: 1500, addedAt: new Date().toISOString() })

  const autoScrapeEmail = async (lead) => {
    if (!lead.website || lead.email) return
    try {
      const r = await fetch('/api/scrape-email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ website: lead.website }) })
      const d = await r.json()
      if (d.email) {
        const u = pipelineRef.current.map(p => p.id === lead.id ? {...p, email: d.email} : p)
        savePipeline(u)
        showToast(`✉ Email auto-found for ${lead.name}`)
      }
    } catch {}
  }

  const addToPipeline = (lead) => {
    const current = pipelineRef.current
    if (current.find(p => p.id === lead.id)) { showToast('Already in pipeline'); return false }
    const similar = current.find(p => p.id !== lead.id && p.name && lead.name &&
      (p.name.toLowerCase().includes(lead.name.toLowerCase().slice(0,8)) || lead.name.toLowerCase().includes(p.name.toLowerCase().slice(0,8))))
    if (similar) showToast(`⚠ Similar lead exists: "${similar.name}"`)
    savePipeline([...current, buildPipelineLead(lead)])
    showToast(`${lead.name} added ✓`)
    setPipelineJustAdded(true)
    setTimeout(() => setPipelineJustAdded(false), 1200)
    autoScrapeEmail(lead)
    return true
  }

  // Bulk add — single state update, skips duplicates, one toast
  const addManyToPipeline = (leads) => {
    const current = pipelineRef.current
    const existing = new Set(current.map(p => p.id))
    const fresh = leads.filter(l => !existing.has(l.id))
    if (fresh.length === 0) { showToast('All already in pipeline'); return 0 }
    savePipeline([...current, ...fresh.map(buildPipelineLead)])
    showToast(`${fresh.length} lead${fresh.length > 1 ? 's' : ''} added to pipeline ✓`)
    setPipelineJustAdded(true)
    setTimeout(() => setPipelineJustAdded(false), 1200)
    fresh.forEach(autoScrapeEmail)
    return fresh.length
  }

  const overdueCount = pipeline.filter(l => l.followUpDate && new Date(l.followUpDate) < new Date()).length
  const tabProps = { pipeline, savePipeline, addToPipeline, addManyToPipeline, searchHistory, setSearchHistory, appointments, saveAppointments, performance, savePerformance, analyticsOverrides, saveAnalyticsOverrides, showToast, setTab }

  return (
    <>
      <Head><title>Robertson Marketing — CRM</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside style={{ width: 'var(--sidebar-w)', background: 'linear-gradient(180deg, #0a1008 0%, #060908 100%)', borderRight: '1px solid rgba(255,255,255,0.06)', position: 'fixed', top: 0, left: 0, bottom: 0, overflowY: 'auto', zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '4px 0 24px rgba(0,0,0,0.4)' }}>
          <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(122,158,73,0.04)' }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#7a9e49,#b8cf96)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: '#060908', flexShrink: 0, boxShadow: '0 2px 10px rgba(122,158,73,0.4)' }}>R</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>Robertson</div>
                <div style={{ fontSize: 10, color: 'var(--olive)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Marketing CRM</div>
              </div>
            </Link>
          </div>
          <nav style={{ flex: 1, padding: '8px 0' }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setTab(n.id)} className={`sidebar-item${pipelineJustAdded && n.id === 'pipeline' ? ' pipeline-glow' : ''}`} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: tab === n.id ? 'rgba(122,158,73,0.14)' : 'transparent', border: 'none', borderLeft: `3px solid ${tab === n.id ? 'var(--olive)' : 'transparent'}`, color: tab === n.id ? 'var(--olive3)' : 'var(--text3)', cursor: 'pointer', fontSize: 13, fontWeight: tab === n.id ? 600 : 400, textAlign: 'left', borderRadius: '0 6px 6px 0', marginRight: 8 }}>
                <span style={{ fontSize: 14, opacity: tab === n.id ? 1 : 0.7 }}>{n.icon}</span>
                {n.label}
                {n.id === 'pipeline' && pipeline.length > 0 && <span className={pipelineJustAdded && n.id === 'pipeline' ? 'badge-new' : ''} style={{ marginLeft: 'auto', background: pipelineJustAdded && n.id === 'pipeline' ? '#f97316' : 'var(--olive)', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 6px', fontWeight: 700, transition: 'background 0.3s' }}>{pipeline.length}</span>}
                {n.id === 'followup' && overdueCount > 0 && <span style={{ marginLeft: 'auto', background: '#ef4444', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>{overdueCount}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(122,158,73,0.02)' }}>
            <div style={{ background: 'rgba(122,158,73,0.07)', border: '1px solid rgba(122,158,73,0.14)', borderRadius: 9, padding: '9px 11px', marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: 'var(--olive)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Daily Fuel</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, fontStyle: 'italic', transition: 'opacity 0.5s' }}>"{SALES_QUOTES[quoteIdx]}"</div>
            </div>
            <button onClick={() => setPowerHour(true)} style={{ width:'100%', padding:'7px', borderRadius:8, background:'rgba(249,115,22,0.1)', border:'1px solid rgba(249,115,22,0.2)', color:'#f97316', cursor:'pointer', fontSize:12, fontWeight:700, marginBottom:10, letterSpacing:'0.01em' }}>⚡ Power Hour</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#7a9e49,#b8cf96)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#060908', flexShrink: 0 }}>C</div>
              <div style={{ fontWeight: 700, color: 'var(--text2)', fontSize: 11 }}>Callum Robertson</div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.5 }}>robertsonmarketingofficial@gmail.com<br/>0405 866 392</div>
          </div>
        </aside>
        <div style={{ marginLeft: 'var(--sidebar-w)', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 50 }}>
            <MotivationalBanner quotes={SALES_QUOTES} quoteIdx={quoteIdx} />
          </div>
        <main style={{ flex: 1, minHeight: '100vh', padding: '32px 32px 80px', background: 'var(--bg)' }}>
          {tab === 'dashboard' && <DashboardTab {...tabProps} />}
          {tab === 'finder' && <FinderTab {...tabProps} />}
          {tab === 'workspace' && <WorkspaceTab {...tabProps} />}
          {tab === 'pipeline' && <PipelineTab {...tabProps} />}
          {tab === 'approval' && <ApprovalTab {...tabProps} />}
          {tab === 'afk' && <AFKTab {...tabProps} />}
          {tab === 'analytics' && <AnalyticsTab {...tabProps} />}
          {tab === 'outreach' && <OutreachTab {...tabProps} />}
          {tab === 'sms' && <SMSTab {...tabProps} />}
          {tab === 'followup' && <FollowUpTab {...tabProps} />}
          {tab === 'appointments' && <AppointmentsTab {...tabProps} />}
          {tab === 'callqueue' && <CallQueueTab {...tabProps} />}
          {tab === 'proposals' && <ProposalsTab {...tabProps} />}
          {tab === 'scoring' && <ScoringTab {...tabProps} />}
          {tab === 'performance' && <PerformanceTab {...tabProps} />}
          {tab === 'training' && <TrainingTab />}
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'settings' && <SettingsTab {...tabProps} />}
        </main>
        </div>
      </div>
      {powerHour && <PowerHourWidget pipeline={pipeline} onClose={() => setPowerHour(false)} />}
      <Toast msg={toast} />
    </>
  )
}

