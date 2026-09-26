import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'
import { EmailModal, ResearchModal, LovableModal, fmtWA } from './modals'


function WorkspaceTab({ pipeline, showToast }) {
  const [sel, setSel] = useState(null)
  const [autoRes, setAutoRes] = useState('')
  const [autoLoading, setAutoLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [emails, setEmails] = useState({ email1:{subject:'',body:''}, email2:{subject:'',body:''} })
  const [aiLoading, setAiLoading] = useState(false)
  const [researchQ, setResearchQ] = useState('')
  const [aiResult, setAiResult] = useState('')
  const [lovablePrompt, setLovablePrompt] = useState('')

  const openLead = async (lead) => {
    setSel(lead); setAutoRes(''); setAutoLoading(true)
    const data = await callAI('auto_research', { lead })
    setAutoRes(data.result || ''); setAutoLoading(false)
  }
  const openEmails = (lead) => { setSel(lead); setModal('emails') }
  const doResearch = async () => {
    if (!researchQ.trim()) return
    setAiLoading(true); setAiResult('')
    const data = await callAI('research', { lead: sel, question: researchQ })
    setAiResult(data.result || ''); setAiLoading(false)
  }
  const openLovable = (lead) => { setSel(lead); setModal('lovable') }

  if (pipeline.length === 0) return <div><PageHeader title="Preview Workspace" sub="Visual overview of all your pipeline leads" /><EmptyState icon="◈" title="No leads in pipeline yet" sub="Add leads from the Lead Finder to see them here." /></div>

  return (
    <div>
      <PageHeader title="Preview Workspace" sub={`${pipeline.length} leads — click any card to expand`} />
      <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 1fr' : 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
        <div style={{ display: sel ? 'flex' : 'contents', flexDirection: 'column', gap: 14 }}>
          {pipeline.map(lead => {
            const isSel = sel?.id === lead.id
            return (
              <div key={lead.id} onClick={() => openLead(lead)} style={{ background: isSel ? 'rgba(109,138,64,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isSel ? 'rgba(109,138,64,0.4)' : 'var(--border)'}`, borderRadius: 14, padding: 16, cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(109,138,64,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--olive)' }}>{(lead.name||'?')[0].toUpperCase()}</div>
                  <div style={{ textAlign: 'right' }}><ScoreRing score={lead.score} /><TierTag tier={lead.tier} /></div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{lead.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{lead.category} · {lead.address?.split(',').slice(0,2).join(',')}</div>
                <WebsiteStrengthBar signal={lead.websiteSignal} />
                <div style={{ marginTop: 8, display: 'flex', gap: 8, fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap' }}>
                  {lead.phone && <span style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(lead.phone); showToast('Copied!') }}>📞 {lead.phone} ✂</span>}
                  {lead.rating && <span>⭐ {lead.rating}</span>}
                  {lead.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--olive2)', textDecoration: 'none' }}>📍 Maps</a>}
                  {lead.email && <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(122,158,73,0.18)', color: 'var(--olive)', textDecoration: 'none', fontSize: 11, fontWeight: 700, border: '1px solid rgba(122,158,73,0.3)' }}>✉ Email Now</a>}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 500, color: 'var(--text3)', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '3px 8px', display: 'inline-block' }}>{lead.stage}</div>
              </div>
            )
          })}
        </div>
        {sel && (
          <div className="card card-p fade-up" style={{ position: 'sticky', top: 20, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div><h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{sel.name}</h2><div style={{ fontSize: 12, color: 'var(--text3)' }}>{sel.category} · {sel.address?.split(',').slice(0,2).join(',')}</div></div>
              <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <InfoItem label="Score" val={sel.score + '/99'} /><InfoItem label="Tier" val={sel.tier} />
              <InfoItem label="Phone" val={sel.phone || '—'} /><InfoItem label="Email" val={sel.email || '—'} />
              <InfoItem label="Website" val={sel.websiteSignal} /><InfoItem label="Rating" val={sel.rating ? `${sel.rating} ⭐` : '—'} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div className="section-header">AI Sales Brief</div>
              {autoLoading ? <div style={{ textAlign: 'center', padding: '20px 0' }}><Spinner /><div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Generating brief...</div></div>
                : <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{autoRes}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sel.email && <a href={`mailto:${sel.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: 'rgba(122,158,73,0.2)', color: 'var(--olive2)', border: '1px solid rgba(122,158,73,0.4)', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>✉ Email Now</a>}
              <button onClick={() => openEmails(sel)} className="btn btn-primary btn-sm">✉ Templates</button>
              <button onClick={() => { setResearchQ(''); setAiResult(''); setModal('research') }} className="btn btn-ghost btn-sm">🤖 Research</button>
              <button onClick={() => openLovable(sel)} className="btn btn-ghost btn-sm">⚡ Lovable</button>
              {sel.website && <a href={sel.website} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">🌐</a>}
              {sel.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(sel.address)}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📍 Maps</a>}
            </div>
          </div>
        )}
      </div>
      {modal === 'emails' && <EmailModal lead={sel} onClose={() => setModal(null)} />}
      {modal === 'research' && <ResearchModal lead={sel} result={aiResult} loading={aiLoading} question={researchQ} setQuestion={setResearchQ} onAsk={doResearch} onClose={() => setModal(null)} />}
      {modal === 'lovable' && <LovableModal lead={sel} onClose={() => setModal(null)} />}
    </div>
  )
}

// ═══ PIPELINE ═══
const fmtTime = (iso) => { try { const d=new Date(iso); return d.toLocaleDateString('en-AU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) } catch{return iso} }

const AU_ZONES = [
  { state:'WA', tz:'Australia/Perth', color:'#3b82f6' },
  { state:'NT', tz:'Australia/Darwin', color:'#f97316' },
  { state:'SA', tz:'Australia/Adelaide', color:'#a855f7' },
  { state:'QLD', tz:'Australia/Brisbane', color:'#f59e0b' },
  { state:'NSW', tz:'Australia/Sydney', color:'#10b981' },
  { state:'VIC', tz:'Australia/Melbourne',color:'#10b981' },
  { state:'TAS', tz:'Australia/Hobart', color:'#10b981' },
  { state:'ACT', tz:'Australia/Sydney', color:'#10b981' },
]

export { WorkspaceTab }
