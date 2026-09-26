import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'

function ChartsLoader({ type, data }) {
  const [Mod, setMod] = useState(null)
  useEffect(() => { import('../charts').then(m => setMod(m)) }, [])
  if (!Mod) return <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 12 }}>Loading chart...</div>
  if (type === 'stage') return <Mod.StageBarChart data={data} />
  if (type === 'tier') return <Mod.TierPieChart data={data} />
  if (type === 'website') return <Mod.WebsitePieChart data={data} />
  if (type === 'score') return <Mod.ScoreBarChart data={data} />
  if (type === 'activity') return <Mod.ActivityBarChart data={data} />
  return null
}

function EditableStat({ label, realVal, overrides, field, onSave, editMode }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const display = overrides[field] !== undefined ? overrides[field] : realVal
  if (editing) return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onBlur={() => { onSave(field, val); setEditing(false) }}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(field, val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        style={{ width: '100%', fontSize: 22, fontWeight: 800, background: 'transparent', border: 'none', borderBottom: '1px solid var(--olive)', color: 'var(--olive2)', padding: '2px 0', outline: 'none' }} />
      <div className="stat-sub">Enter to save · Esc to cancel</div>
    </div>
  )
  return (
    <div className="stat-card" style={{ cursor: editMode ? 'pointer' : 'default' }} onClick={() => editMode && (setVal(String(display)), setEditing(true))}>
      <div className="stat-label">{label}</div>
      <div className="stat-val">{display}{overrides[field] !== undefined && <span style={{ fontSize: 10, color: 'var(--olive)', marginLeft: 4 }}>✏</span>}</div>
      {editMode && <div className="stat-sub">Click to edit</div>}
    </div>
  )
}

function AnalyticsTab({ pipeline, searchHistory, analyticsOverrides, saveAnalyticsOverrides }) {
  const [editMode, setEditMode] = useState(false)
  const stageData = STAGES.map(s => ({ name: s, value: pipeline.filter(p => p.stage === s).length })).filter(d => d.value > 0)
  const tierData = [{name:'Hot',value:pipeline.filter(l=>l.tier==='Hot').length,color:'#ef4444'},{name:'Warm',value:pipeline.filter(l=>l.tier==='Warm').length,color:'#f97316'},{name:'Cold',value:pipeline.filter(l=>l.tier==='Cold').length,color:'#6b7280'}].filter(d=>d.value>0)
  const websiteData = [{name:'No website',value:pipeline.filter(l=>l.websiteSignal==='No website').length},{name:'Social only',value:pipeline.filter(l=>l.websiteSignal==='Social only').length},{name:'Basic builder',value:pipeline.filter(l=>l.websiteSignal==='Basic builder').length},{name:'Has website',value:pipeline.filter(l=>l.websiteSignal==='Has website').length}].filter(d=>d.value>0)
  const scoreRanges = [{name:'90-99',value:pipeline.filter(l=>l.score>=90).length},{name:'75-89',value:pipeline.filter(l=>l.score>=75&&l.score<90).length},{name:'50-74',value:pipeline.filter(l=>l.score>=50&&l.score<75).length},{name:'0-49',value:pipeline.filter(l=>l.score<50).length}]
  const CHART_COLORS = ['#6d8a40','#afc28a','#ef4444','#f97316','#3b82f6','#a855f7']
  const topCats = Object.entries(pipeline.reduce((acc,l)=>{acc[l.category||'Unknown']=(acc[l.category||'Unknown']||0)+1;return acc},{})).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,6)
  const convRate = pipeline.length>0?((pipeline.filter(p=>p.stage==='Closed').length/pipeline.length)*100).toFixed(1):0
  const stats = [
    {label:'Total in Pipeline',field:'total',real:pipeline.length},
    {label:'Avg Lead Score',field:'avgScore',real:pipeline.length?Math.round(pipeline.reduce((s,l)=>s+l.score,0)/pipeline.length):0},
    {label:'Conversion Rate',field:'convRate',real:convRate+'%'},
    {label:'Total Searches',field:'searches',real:searchHistory.length},
    {label:'Phones Found',field:'phones',real:pipeline.filter(l=>l.phone).length},
    {label:'Emails Found',field:'emails',real:pipeline.filter(l=>l.email).length},
  ]
  const updateOverride = (field, val) => saveAnalyticsOverrides({...analyticsOverrides,[field]:val})

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <PageHeader title="Analytics" sub="Real data — enable Edit Mode to manually adjust any number" noMargin />
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.keys(analyticsOverrides).length > 0 && <button onClick={() => saveAnalyticsOverrides({})} className="btn btn-danger btn-sm">↺ Reset</button>}
          <button onClick={() => setEditMode(!editMode)} className={`btn btn-sm ${editMode?'btn-primary':'btn-ghost'}`}>{editMode?'✓ Done':'✏ Edit Mode'}</button>
        </div>
      </div>
      {editMode && <div style={{ background: 'rgba(109,138,64,0.08)', border: '1px solid rgba(109,138,64,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--olive2)', marginBottom: 16 }}>✏ Click any stat card to edit its value — great for presentations or setting goals.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 24 }}>
        {stats.map(s => <EditableStat key={s.field} label={s.label} realVal={s.real} overrides={analyticsOverrides} field={s.field} onSave={updateOverride} editMode={editMode} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card card-p"><div className="section-header">Pipeline Stage Breakdown</div><ChartsLoader type="stage" data={stageData} /></div>
        <div className="card card-p"><div className="section-header">Lead Tier Distribution</div><ChartsLoader type="tier" data={tierData} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card card-p"><div className="section-header">Website Strength Breakdown</div><ChartsLoader type="website" data={websiteData} /></div>
        <div className="card card-p"><div className="section-header">Score Distribution</div><ChartsLoader type="score" data={scoreRanges} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card card-p">
          <div className="section-header">Top Categories in Pipeline</div>
          {topCats.length === 0 ? <p style={{ color:'var(--text3)',fontSize:13 }}>No data yet</p> : topCats.map((c,i) => (
            <div key={c.name} style={{ display:'flex',alignItems:'center',gap:10,marginBottom:8 }}>
              <div style={{ flex:1,fontSize:13,color:'var(--text)' }}>{c.name}</div>
              <div style={{ height:8,width:`${Math.max(8,(c.value/topCats[0].value)*120)}px`,background:CHART_COLORS[i%CHART_COLORS.length],borderRadius:4 }} />
              <div style={{ fontSize:12,color:'var(--text3)',minWidth:20,textAlign:'right' }}>{c.value}</div>
            </div>
          ))}
        </div>
        <div className="card card-p">
          <div className="section-header">Recent Search History</div>
          {searchHistory.length===0?<p style={{color:'var(--text3)',fontSize:13}}>No searches yet</p>:searchHistory.slice(0,10).map((s,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
              <span style={{color:'var(--text)'}}>{s.category} in {s.location}</span><span style={{color:'var(--olive)'}}>{s.count} leads</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══ OUTREACH ═══
export { AnalyticsTab, ChartsLoader }
