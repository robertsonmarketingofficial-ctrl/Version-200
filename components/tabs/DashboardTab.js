import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import Link from 'next/link'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'
import { ChartsLoader } from './AnalyticsTab'
import { EmailModal, ResearchModal, LovableModal, fmtWA } from './modals'

const STAGE_WEIGHTS = { 'New':0.05,'Contacted':0.15,'Replied':0.3,'Meeting booked':0.5,'Proposal sent':0.7,'Closed':1.0,'Not interested':0 }
function EditableStatCard({ label, value, sub, prefix='', suffix='', color }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [display, setDisplay] = useState(null)
  const shown = display !== null ? display : value

  const startEdit = () => { setDraft(String(display !== null ? display : value)); setEditing(true) }
  const commit = () => {
    const n = draft.trim()
    if (n !== '') setDisplay(n)
    setEditing(false)
  }

  if (editing) return (
    <div className="stat-card" style={{ cursor: 'text' }}>
      <div className="stat-label">{label}</div>
      <input
        autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false) }}
        style={{ width:'100%', fontSize:26, fontWeight:900, background:'transparent', border:'none', borderBottom:'2px solid var(--olive)', color:'var(--olive2)', padding:'2px 0', outline:'none', letterSpacing:'-0.03em' }}
      />
      <div className="stat-sub">Enter to save</div>
    </div>
  )
  return (
    <div className="stat-card" style={{ cursor: 'pointer', position: 'relative' }} onClick={startEdit} title="Click to edit">
      <div className="stat-label">{label}</div>
      <div className="stat-val" style={{ color: color || 'var(--olive2)' }}>{prefix}{shown}{suffix}</div>
      <div className="stat-sub">{sub}</div>
      {display !== null && <div style={{ position:'absolute', top:8, right:10, fontSize:9, color:'var(--olive)', fontWeight:700, background:'rgba(122,158,73,0.15)', padding:'1px 5px', borderRadius:4 }}>EDITED</div>}
      <div style={{ position:'absolute', top:8, right: display !== null ? 58 : 10, fontSize:9, color:'var(--text3)', opacity:0.5 }}>✏</div>
    </div>
  )
}

function DashboardTab({ pipeline, setTab, appointments }) {
  const hot = pipeline.filter(l => l.tier === 'Hot').length
  const warm = pipeline.filter(l => l.tier === 'Warm').length
  const cold = pipeline.filter(l => l.tier === 'Cold').length
  const contacted = pipeline.filter(l => l.stage !== 'New').length
  const closed = pipeline.filter(l => l.stage === 'Closed').length
  const overdue = pipeline.filter(l => l.followUpDate && new Date(l.followUpDate) < new Date()).length
  const recent = [...pipeline].sort((a,b) => new Date(b.addedAt||0) - new Date(a.addedAt||0)).slice(0,5)
  const upcomingAppts = appointments.filter(a => !a.outcome && new Date(`${a.date}T${a.time||'00:00'}`) >= new Date()).slice(0,3)

  // Chart data — live from pipeline
  const stageData = ['New','Contacted','Replied','Meeting booked','Proposal sent','Closed','Not interested']
    .map(s => ({ name: s, value: pipeline.filter(p => p.stage === s).length }))
    .filter(d => d.value > 0)
  const tierData = [
    { name: 'Hot', value: hot, color: '#f43f5e' },
    { name: 'Warm', value: warm, color: '#fb923c' },
    { name: 'Cold', value: cold, color: '#4b5563' },
  ].filter(d => d.value > 0)

  return (
    <div>
      <PageHeader title="Dashboard" sub="Welcome back, Callum. Click any stat to edit it." />

      {/* EDITABLE STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 12, marginBottom: 28 }}>
        <EditableStatCard label="Total Leads"        value={pipeline.length}                         sub="in pipeline" />
        <EditableStatCard label="Hot Leads"           value={hot}                                     sub="score 75+" color="#f43f5e" />
        <EditableStatCard label="Contacted"           value={contacted}                               sub="outreach started" />
        <EditableStatCard label="Closed"              value={closed}                                  sub="won deals" color="#7a9e49" />
        <EditableStatCard label="Overdue Follow-Ups"  value={overdue}                                 sub="need attention" color={overdue > 0 ? "#f43f5e" : undefined} />
        <EditableStatCard label="Pipeline Value"      value={`$${Math.round(pipeline.reduce((s,l)=>s+((l.dealValue||1500)*(STAGE_WEIGHTS[l.stage]||0)),0)).toLocaleString()}`} sub="weighted forecast" color="#b8cf96" />
      </div>

      {/* CHARTS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card card-p">
          <div className="section-header">Pipeline Stages</div>
          {stageData.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text3)', fontSize:13 }}>Add leads to see stage breakdown</div>
            : <ChartsLoader type="stage" data={stageData} />
          }
        </div>
        <div className="card card-p">
          <div className="section-header">Lead Tiers</div>
          {tierData.length === 0
            ? <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text3)', fontSize:13 }}>Add leads to see tier breakdown</div>
            : (
              <div>
                <ChartsLoader type="tier" data={tierData} />
                <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:8 }}>
                  {tierData.map(t => (
                    <div key={t.name} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:t.color }} />
                      <span style={{ color:'var(--text2)' }}>{t.name}: <strong style={{ color:'var(--text)' }}>{t.value}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* RECENT + QUICK ACTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card card-p">
          <div className="section-header">Recent Pipeline Leads</div>
          {recent.length === 0 ? <p style={{ color:'var(--text3)', fontSize:13 }}>No leads yet — go find some!</p> : recent.map(l => (
            <div key={l.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:32, height:32, borderRadius:7, background:'rgba(122,158,73,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'var(--olive)', flexShrink:0 }}>{(l.name||'?')[0].toUpperCase()}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{l.stage} · {l.category}</div>
              </div>
              <TierTag tier={l.tier} />
            </div>
          ))}
          {recent.length > 0 && <button onClick={() => setTab('pipeline')} className="btn btn-ghost btn-sm" style={{ marginTop:12 }}>View all →</button>}
        </div>
        <div className="card card-p">
          <div className="section-header">Quick Actions</div>
          {[{label:'🔍 Find new leads',tab:'finder'},{label:'◈ Browse workspace',tab:'workspace'},{label:'✉ Draft outreach emails',tab:'outreach'},{label:'💬 Generate SMS templates',tab:'sms'},{label:'📄 Create a proposal',tab:'proposals'},{label:'↻ Check follow-ups',tab:'followup'},{label:'◷ Log an appointment',tab:'appointments'},{label:'◎ Study sales training',tab:'training'}].map(a => (
            <button key={a.tab} onClick={() => setTab(a.tab)} style={{ display:'flex', alignItems:'center', width:'100%', padding:'9px 0', background:'none', border:'none', borderBottom:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer', fontSize:13, fontWeight:500, textAlign:'left', gap:8 }}>
              {a.label}<span style={{ marginLeft:'auto', color:'var(--text3)', fontSize:11 }}>→</span>
            </button>
          ))}
        </div>
      </div>

      {upcomingAppts.length > 0 && (
        <div className="card card-p" style={{ marginBottom: 16 }}>
          <div className="section-header">Upcoming Appointments</div>
          {upcomingAppts.map(a => (
            <div key={a.id} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
              <span style={{ color:'var(--olive)', fontWeight:600, minWidth:80 }}>{a.date}</span>
              <span style={{ color:'var(--text)' }}>{a.leadName}</span>
              <span style={{ color:'var(--text3)', marginLeft:'auto' }}>{a.type}</span>
            </div>
          ))}
        </div>
      )}
      {(()=>{
        const coldLeads = pipeline.filter(l => {
          if(['Closed','Not interested'].includes(l.stage)) return false
          if(!['Hot','Warm'].includes(l.tier)) return false
          const log = l.activityLog||[]
          const last = log.length>0 ? new Date(log[log.length-1].at) : new Date(l.addedAt||0)
          return (Date.now()-last.getTime())/86400000 > 3
        })
        if(coldLeads.length===0) return null
        return (
          <div style={{background:'rgba(249,115,22,0.07)',border:'1px solid rgba(249,115,22,0.2)',borderRadius:10,padding:'16px 18px',marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:'#f97316'}}>🧊 {coldLeads.length} lead{coldLeads.length>1?'s':''} going cold</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>No contact in 3+ days — act now</div>
              </div>
              <button onClick={()=>setTab('pipeline')} className="btn btn-ghost btn-sm" style={{borderColor:'rgba(249,115,22,0.3)',color:'#f97316'}}>View →</button>
            </div>
            {coldLeads.slice(0,4).map(l=>{
              const log=l.activityLog||[]; const last=log.length>0?new Date(log[log.length-1].at):new Date(l.addedAt||0)
              const days=Math.floor((Date.now()-last.getTime())/86400000)
              return(
                <div key={l.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:'1px solid rgba(249,115,22,0.15)',fontSize:13}}>
                  <div style={{width:28,height:28,borderRadius:6,background:'rgba(249,115,22,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#f97316',flexShrink:0}}>{(l.name||'?')[0].toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,color:'var(--text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.name}</div>
                    <div style={{fontSize:11,color:'#f97316'}}>{days} days since last contact · {l.stage}</div>
                  </div>
                  {l.phone&&<a href={`tel:${l.phone}`} style={{fontSize:11,color:'var(--olive2)',textDecoration:'none',border:'1px solid rgba(109,138,64,0.3)',borderRadius:6,padding:'3px 8px'}}>📞</a>}
                  {l.phone&&<a href={`https://wa.me/${l.phone.replace(/^0/,'+61').replace(/\s/g,'')}`} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#25d366',textDecoration:'none',border:'1px solid rgba(37,211,102,0.3)',borderRadius:6,padding:'3px 8px'}}>💬</a>}
                </div>
              )
            })}
          </div>
        )
      })()}
      {overdue > 0 && (
        <div style={{ background:'rgba(244,63,94,0.08)', border:'1px solid rgba(244,63,94,0.2)', borderRadius:10, padding:'16px 18px', marginTop: 8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:'#f43f5e' }}>⚠ {overdue} overdue follow-up{overdue>1?'s':''}</div>
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>These leads need attention now</div>
            </div>
            <button onClick={() => setTab('followup')} className="btn btn-danger btn-sm">View all →</button>
          </div>
          {pipeline.filter(l => l.followUpDate && new Date(l.followUpDate) < new Date()).slice(0,4).map(l => (
            <div key={l.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:'1px solid rgba(244,63,94,0.15)', fontSize:13 }}>
              <div style={{ width:28, height:28, borderRadius:6, background:'rgba(244,63,94,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#f43f5e', flexShrink:0 }}>{(l.name||'?')[0].toUpperCase()}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                <div style={{ fontSize:11, color:'#f43f5e' }}>Due {l.followUpDate}</div>
              </div>
              {l.phone && <a href={`tel:${l.phone}`} style={{ fontSize:11, color:'var(--olive2)', textDecoration:'none', border:'1px solid rgba(109,138,64,0.3)', borderRadius:6, padding:'3px 8px' }}>📞 Call</a>}
              {l.phone && <a href={`https://wa.me/${l.phone.replace(/^0/,'+61').replace(/\s/g,'')}`} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#25d366', textDecoration:'none', border:'1px solid rgba(37,211,102,0.3)', borderRadius:6, padding:'3px 8px' }}>💬 WA</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══ LEAD FINDER ═══
const AU_STATES = [
  { label: 'South Australia', short: 'SA', suburbs: ['Adelaide CBD','Glenelg','Norwood','Unley','Prospect','Marion','Salisbury','Port Adelaide','Morphett Vale','Mount Barker','Victor Harbor','Murray Bridge','Whyalla','Mount Gambier','Port Augusta','Port Pirie','Gawler','Elizabeth','Modbury','Tea Tree Gully','Golden Grove','Mawson Lakes','Munno Para','Christies Beach','Noarlunga','Aldinga Beach','Hallett Cove','Westfield Marion','Burnside','Kensington','Payneham','Magill','Campbelltown SA','Newton','Dernancourt','Para Hills','Ingle Farm','Davoren Park','Smithfield SA','Angle Vale','Two Wells','Kapunda','Nuriootpa','Tanunda','Angaston','Clare','Kadina','Wallaroo','Moonta','Port Wakefield','Crystal Brook'] },
  { label: 'Victoria', short: 'VIC', suburbs: ['Melbourne CBD','Richmond','Fitzroy','St Kilda','Prahran','South Yarra','Toorak','Hawthorn','Camberwell','Malvern','Caulfield','Carnegie','Oakleigh','Clayton','Dandenong','Frankston','Moorabbin','Bentleigh','Brighton VIC','Sandringham','Cheltenham VIC','Mentone','Mordialloc','Parkdale','Carrum','Seaford VIC','Geelong','Ballarat','Bendigo','Essendon','Footscray','Sunshine VIC','Werribee','Point Cook','Hoppers Crossing','Williamstown','Newport VIC','Altona','Laverton','Truganina','Melton','Bacchus Marsh','Keilor','Broadmeadows','Coburg','Preston','Northcote','Doncaster','Box Hill','Ringwood','Croydon VIC','Lilydale','Healesville','Mooroolbark','Bayswater','Wantirna','Knox','Rowville','Berwick','Narre Warren','Pakenham','Officer','Cranbourne','Frankston North','Seaford VIC'] },
  { label: 'New South Wales', short: 'NSW', suburbs: ['Sydney CBD','Parramatta','Bondi','Newtown','Manly','Chatswood','Hornsby','Penrith','Liverpool','Blacktown','Campbelltown NSW','Cronulla','Miranda','Sutherland','Hurstville','Kogarah','Rockdale','Bankstown','Lakemba','Strathfield','Burwood','Auburn','Merrylands','Granville','Wentworthville','Seven Hills','Toongabbie','Blacktown West','Mt Druitt','St Marys NSW','Kingswood','Katoomba','Richmond NSW','Windsor NSW','Rouse Hill','Castle Hill','Baulkham Hills','Kellyville','Norwest','Bella Vista','Newcastle','Maitland','Cessnock','Singleton','Muswellbrook','Wollongong','Dapto','Shellharbour','Kiama','Nowra','Albury','Wagga Wagga','Tamworth','Orange NSW','Dubbo','Broken Hill','Coffs Harbour','Port Macquarie','Armidale','Bathurst'] },
  { label: 'Queensland', short: 'QLD', suburbs: ['Brisbane CBD','Fortitude Valley','South Brisbane','West End QLD','Woolloongabba','Carindale','Mount Gravatt','Sunnybank','Moorooka','Rocklea','Acacia Ridge','Inala','Oxley','Darra','Richlands','Springfield QLD','Ipswich','Booval','Goodna','Redbank','Collingwood Park','Redbank Plains','Gold Coast','Surfers Paradise','Broadbeach','Southport','Robina','Burleigh Heads','Miami QLD','Palm Beach QLD','Coolangatta','Tweed Heads','Sunshine Coast','Maroochydore','Mooloolaba','Caloundra','Kawana Waters','Noosa','Toowoomba','Cairns','Townsville','Rockhampton','Bundaberg','Mackay','Hervey Bay','Gladstone','Mount Isa','Toowoomba East','Strathpine','Redcliffe','Deception Bay','Caboolture','Narangba','North Lakes','Mango Hill','Petrie','Brendale'] },
  { label: 'Western Australia', short: 'WA', suburbs: ['Perth CBD','Fremantle','Joondalup','Rockingham','Mandurah','Bunbury','Geraldton','Albany','Kalgoorlie','Northbridge','Subiaco','Cottesloe','Claremont WA','Nedlands','Floreat','Wembley','Osborne Park','Stirling WA','Balcatta','Karrinyup','Duncraig','Hillarys','Currambine','Butler','Clarkson WA','Quinns Rocks','Alkimos','Yanchep','Midland','Swan View','Ellenbrook','Bullsbrook','Armadale','Kelmscott','Byford','Mundijong','Baldivis','Secret Harbour','Golden Bay','Waikiki','Safety Bay','Shoalwater','Singleton WA','Lakelands','Madora Bay','Port Kennedy','Canning Vale','Willetton','Booragoon','Applecross','Brentwood','Murdoch','Winthrop','Kardinya','Spearwood'] },
  { label: 'Tasmania', short: 'TAS', suburbs: ['Hobart CBD','Sandy Bay','Battery Point','South Hobart','West Hobart','North Hobart','Glenorchy','Moonah','Claremont TAS','Rosny Park','Bellerive','Lindisfarne','Montrose','Launceston','Invermay','Newstead TAS','Kings Meadows','Newnham','Prospect TAS','Devonport','Spreyton','Ulverstone','Penguin','Burnie','Somerset','Wynyard','Smithton','Queenstown','Strahan','Huonville','Kingston TAS','Margate TAS','Snug','New Norfolk','Bridgewater','Brighton TAS'] },
  { label: 'Australian Capital Territory', short: 'ACT', suburbs: ['Canberra CBD','Civic','Belconnen','Tuggeranong','Woden','Gungahlin','Weston Creek','Bruce ACT','Charnwood','Florey','Macquarie ACT','Page ACT','Scullin','Weetangera','Calwell','Greenway','Theodore','Kambah','Wanniassa','Erindale','Monash ACT','Fadden','Gowrie','Chisholm','Isabella Plains','Banks','Holt','Higgins','Spence','Latham','Macgregor ACT','Evatt','Giralang','Kaleen','Lyneham','OConnor ACT','Ainslie','Watson','Downer','Hackett'] },
  { label: 'Northern Territory', short: 'NT', suburbs: ['Darwin CBD','Casuarina','Palmerston','Nightcliff','Rapid Creek','Fannie Bay','Stuart Park','Parap','Larrakeyah','Millner','Moil','Malak','Marrara','Berrimah','Humpty Doo','Coolalinga','Virginia NT','Batchelor','Pine Creek','Katherine','Tennant Creek','Alice Springs','Larapinta','Sadadeen','Gillen','Ross','Araluen'] },
]

export { DashboardTab, EditableStatCard }
