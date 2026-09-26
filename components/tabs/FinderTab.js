import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar, AU_STATES } from './helpers'
import { EmailModal, ResearchModal, LovableModal, fmtWA } from './modals'

const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }
function FinderTab({ pipeline = [], addToPipeline, addManyToPipeline, searchHistory, setSearchHistory, showToast }) {
  const [category, setCategory] = useState('Dentist')
  const [location, setLocation] = useState('')
  const [leads, setLeads] = useState([])
  const [allLeads, setAllLeads] = useState([]) // unfiltered
  const [searching, setSearching] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [sweepProgress, setSweepProgress] = useState({ done: 0, total: 0, current: '' })
  const [error, setError] = useState('')
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(false)
  const [maxRating, setMaxRating] = useState(0) // 0 = off; otherwise only show leads rated below this
  const [selectedState, setSelectedState] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [emails, setEmails] = useState({ email1: { subject: '', body: '' }, email2: { subject: '', body: '' } })
  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [researchQ, setResearchQ] = useState('')
  const [lovablePrompt, setLovablePrompt] = useState('')
  const [selectedFinderIds, setSelectedFinderIds] = useState(new Set())
  const [addedLeadIds, setAddedLeadIds] = useState(new Set()) // Track which leads have been added
  const [emailScrapeProgress, setEmailScrapeProgress] = useState({ total: 0, done: 0, active: false })

  // Apply no-website filter to leads
  const displayLeads = (noWebsiteOnly ? allLeads.filter(l => l.websiteSignal === 'No website') : allLeads)
    .filter(l => !maxRating || (l.rating && l.rating < maxRating))
    // Bad-review leads float to the top — a poor public reputation is a
    // specific, strong pain point worth leading a pitch with.
    .sort((a, b) => {
      const aBad = a.rating && a.rating < 4 ? 1 : 0
      const bBad = b.rating && b.rating < 4 ? 1 : 0
      return bBad - aBad
    })

  const toggleFinderSelect = (id) => setSelectedFinderIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selectAllFinder = () => setSelectedFinderIds(new Set(displayLeads.filter(l => l.email).map(l => l.id)))
  const selectAllNoWebsiteFinder = () => setSelectedFinderIds(new Set(displayLeads.filter(l => !l.website).map(l => l.id)))
  const selectAllMobileFinder = () => setSelectedFinderIds(new Set(displayLeads.filter(l => l.phone && l.phone.replace(/\D/g,'').startsWith('04')).map(l => l.id)))
  const selectAllBadReviewsFinder = () => setSelectedFinderIds(new Set(displayLeads.filter(l => l.rating && l.rating < 4).map(l => l.id)))
  const clearFinderSelect = () => setSelectedFinderIds(new Set())
  const openSelectedEmails = () => {
    const emails = displayLeads.filter(l => selectedFinderIds.has(l.id) && l.email).map(l => l.email)
    if (!emails.length) { showToast('No emails in selection'); return }
    window.location.href = `mailto:${emails.join(',')}`
  }
  const addSelectedToPipeline = () => {
    const selected = displayLeads.filter(l => selectedFinderIds.has(l.id))
    if (!selected.length) { showToast('Nothing selected'); return }
    addManyToPipeline(selected)
    setAddedLeadIds(prev => new Set([...prev, ...selected.map(l => l.id)]))
    clearFinderSelect()
  }
  const exportSelectedFinder = () => {
    const selected = displayLeads.filter(l => selectedFinderIds.has(l.id))
    if (!selected.length) { showToast('Nothing selected'); return }
    const headers = ['Name','Category','Phone','Email','Website','Score','Tier','Address']
    const rows = selected.map(l => [l.name||'',l.category||'',l.phone||'',l.email||'',l.website||'',l.score||'',l.tier||'',l.address||'']
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `finder-selected-leads-${Date.now()}.csv`
    a.click()
    showToast(`Exported ${selected.length} leads ✓`)
  }

  // Add single lead to pipeline and mark as added
  const handleAddToPipeline = (lead) => {
    const added = addToPipeline(lead)
    if (added !== false) setAddedLeadIds(prev => new Set([...prev, lead.id]))
  }

  // Add all HOT leads to pipeline (single state update — no stale-state overwrites)
  const addAllHotToPipeline = () => {
    const hotLeads = displayLeads.filter(l => l.tier === 'Hot')
    if (hotLeads.length === 0) { showToast('No HOT leads found'); return }
    addManyToPipeline(hotLeads)
    setAddedLeadIds(prev => new Set([...prev, ...hotLeads.map(l => l.id)]))
  }

  // Add every business from this search that has NO website at all (not
  // even a Facebook/Instagram page) in one click. Uses the full result set,
  // not just what the current filters show. Duplicates already in the
  // Pipeline are skipped by addManyToPipeline.
  const pipelineIds = new Set(pipeline.map(l => l.id))
  const noWebsiteNotAdded = allLeads.filter(l => !l.website && !pipelineIds.has(l.id))
  const addAllNoWebsiteToPipeline = () => {
    if (!noWebsiteNotAdded.length) {
      showToast(allLeads.some(l => !l.website) ? 'All no-website businesses are already in your Pipeline' : 'No businesses without a website in these results')
      return
    }
    addManyToPipeline(noWebsiteNotAdded)
    setAddedLeadIds(prev => new Set([...prev, ...noWebsiteNotAdded.map(l => l.id)]))
  }

  const doSearch = async (loc, maxPages = 2, state = null) => {
    const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: category, location: loc, maxPages, state }) })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return (data.leads || []).map(l => ({ ...l, category }))
  }

  // Normal single search
  const search = async () => {
    if (!location.trim()) { setError('Enter a location'); return }
    setSearching(true); setError(''); setAllLeads([]); setLeads([]); setEmailScrapeProgress({ total: 0, done: 0, active: false })
    try {
      const tagged = await doSearch(location)
      setAllLeads(tagged)
      const hist = [{ category, location, count: tagged.length, date: new Date().toISOString() }, ...searchHistory].slice(0, 50)
      setSearchHistory(hist); save('rmv2_searches', hist)
      scrapeEmails(tagged)
    } catch (e) { setError(e.message || 'Search failed') }
    setSearching(false)
  }

  // State sweep — searches every suburb in the state one by one
  const stateSweep = async (state) => {
    setSelectedState(state)
    setSweeping(true); setError(''); setAllLeads([]); setLeads([]); setEmailScrapeProgress({ total: 0, done: 0, active: false })
    const suburbs = state.suburbs
    setSweepProgress({ done: 0, total: suburbs.length, current: suburbs[0] })
    let combined = []
    const seen = new Set()
    for (let i = 0; i < suburbs.length; i++) {
      const suburb = suburbs[i]
      setSweepProgress({ done: i, total: suburbs.length, current: suburb })
      try {
        const results = await doSearch(suburb, 3, state.short)
        const fresh = results.filter(l => !seen.has(l.id))
        fresh.forEach(l => seen.add(l.id))
        combined = [...combined, ...fresh].sort((a,b) => b.score - a.score)
        setAllLeads([...combined])
      } catch {}
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 400))
    }
    setSweepProgress({ done: suburbs.length, total: suburbs.length, current: '' })
    const hist = [{ category, location: state.label, count: combined.length, date: new Date().toISOString() }, ...searchHistory].slice(0, 50)
    setSearchHistory(hist); save('rmv2_searches', hist)
    scrapeEmails(combined)
    setSweeping(false)
  }

  const scrapeEmails = (tagged) => {
    const toScrape = tagged.filter(l => l.website && !l.website.includes('facebook'))
    if (!toScrape.length) return
    setEmailScrapeProgress({ total: toScrape.length, done: 0, active: true })

    toScrape.forEach(async lead => {
      try {
        const r = await fetch('/api/scrape-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ website: lead.website }) })
        const d = await r.json()
        if (d.email) setAllLeads(prev => prev.map(l => l.id === lead.id ? { ...l, email: d.email } : l))
      } catch {}
      setEmailScrapeProgress(prev => {
        const done = prev.done + 1
        return { total: prev.total, done, active: done < prev.total }
      })
    })
  }

  const openEmails = (lead) => { setSelectedLead(lead); setModal('emails') }
  const openResearch = (lead) => { setSelectedLead(lead); setResearchQ(''); setAiResult(''); setModal('research') }
  const doResearch = async () => {
    if (!researchQ.trim()) return
    setAiLoading(true); setAiResult('')
    const data = await callAI('research', { lead: selectedLead, question: researchQ })
    setAiResult(data.result || data.error || ''); setAiLoading(false)
  }
  const openLovable = (lead) => { setSelectedLead(lead); setModal('lovable') }

  const isLoading = searching || sweeping

  return (
    <div>
      <PageHeader title="Lead Finder" sub="Search by suburb, or sweep an entire state" />

      {/* SEARCH BAR */}
      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 5 }}>CATEGORY</label>
            <input list="category-presets" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Roofer, or type your own" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13 }} />
            <datalist id="category-presets">
              {CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div style={{ flex: '2 1 240px' }}>
            <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 5 }}>SUBURB / CITY</label>
            <input value={location} onChange={e => setLocation(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="e.g. Norwood SA, Melbourne CBD" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13 }} disabled={isLoading} />
          </div>
          <button onClick={search} disabled={isLoading} className="btn btn-primary" style={{ height: 38 }}>{searching ? <Spinner size={14} /> : '🔍 Search'}</button>
        </div>
        {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {/* STATE SWEEP */}
      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>🗺 State Sweep</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Find ALL {category}s across an entire state</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {AU_STATES.map(state => (
              <button key={state.short} onClick={() => !isLoading && stateSweep(state)} disabled={isLoading}
                style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${selectedState?.short === state.short ? 'var(--olive)' : 'var(--border)'}`, background: selectedState?.short === state.short ? 'rgba(122,158,73,0.15)' : 'rgba(255,255,255,0.03)', color: selectedState?.short === state.short ? 'var(--olive2)' : 'var(--text2)', cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, opacity: isLoading ? 0.5 : 1, transition: 'all 0.15s' }}>
                {state.short}
              </button>
            ))}
          </div>
        </div>
        {sweeping && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
              <span>Searching: <strong style={{ color: 'var(--olive2)' }}>{sweepProgress.current}</strong></span>
              <span>{sweepProgress.done}/{sweepProgress.total} suburbs · <strong style={{ color: 'var(--olive2)' }}>{allLeads.length} found so far</strong></span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--olive), var(--olive2))', borderRadius: 3, width: `${sweepProgress.total > 0 ? (sweepProgress.done/sweepProgress.total)*100 : 0}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* FILTERS */}
      {allLeads.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, flex: 1 }}>
            {[{l:'Found',v:allLeads.length},{l:'No Website',v:allLeads.filter(l=>l.websiteSignal==='No website').length},{l:'Hot',v:allLeads.filter(l=>l.tier==='Hot').length},{l:'With Phone',v:allLeads.filter(l=>l.phone).length},{l:'With Email',v:allLeads.filter(l=>l.email).length}].map(s => (
              <div key={s.l} className="stat-card"><div className="stat-label">{s.l}</div><div className="stat-val">{s.v}</div></div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* ADD ALL HOT TO PIPELINE */}
            <button onClick={addAllHotToPipeline}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: '2px solid var(--olive)', background: 'rgba(122,158,73,0.15)', color: 'var(--olive2)', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              Add All HOT
            </button>
            {/* ADD ALL NO-WEBSITE TO PIPELINE */}
            <button onClick={addAllNoWebsiteToPipeline}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: '2px solid #f43f5e', background: 'rgba(244,63,94,0.15)', color: '#f43f5e', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16 }}>➕</span>
              Add All With No Website to Pipeline
              <span style={{ background: '#f43f5e', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 7px' }}>{noWebsiteNotAdded.length}</span>
            </button>
            {/* NO WEBSITE TOGGLE */}
            <button onClick={() => setNoWebsiteOnly(!noWebsiteOnly)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: `2px solid ${noWebsiteOnly ? '#f43f5e' : 'var(--border)'}`, background: noWebsiteOnly ? 'rgba(244,63,94,0.1)' : 'rgba(255,255,255,0.03)', color: noWebsiteOnly ? '#f43f5e' : 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16 }}>{noWebsiteOnly ? '🔴' : '⭕'}</span>
              No Website Only
              {noWebsiteOnly && <span style={{ background: '#f43f5e', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 7px' }}>{allLeads.filter(l=>l.websiteSignal==='No website').length}</span>}
            </button>
            {/* SELECT ALL NO-WEBSITE — one click, no need to toggle the filter first */}
            <button onClick={selectAllNoWebsiteFinder}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: '2px solid rgba(244,63,94,0.4)', background: 'rgba(244,63,94,0.08)', color: '#f43f5e', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16 }}>✓</span>
              Select No Website
              <span style={{ background: '#f43f5e', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 7px' }}>{displayLeads.filter(l=>!l.website).length}</span>
            </button>
            <button onClick={selectAllMobileFinder}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: '2px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.08)', color: '#3b82f6', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16 }}>📱</span>
              Select Mobile (04)
              <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 7px' }}>{displayLeads.filter(l=>l.phone && l.phone.replace(/\D/g,'').startsWith('04')).length}</span>
            </button>
            <button onClick={selectAllBadReviewsFinder}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, border: '2px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16 }}>⭐</span>
              Select Bad Reviews
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 100, fontSize: 10, padding: '1px 7px' }}>{displayLeads.filter(l=>l.rating && l.rating < 4).length}</span>
            </button>
            {/* ONLY SHOW BELOW X STARS */}
            <select value={maxRating} onChange={e => setMaxRating(Number(e.target.value))}
              style={{ padding: '10px 14px', borderRadius: 10, border: `2px solid ${maxRating ? '#ef4444' : 'var(--border)'}`, background: maxRating ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)', color: maxRating ? '#ef4444' : 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              <option value={0}>All ratings</option>
              <option value={4.5}>Only below 4.5★</option>
              <option value={4}>Only below 4★</option>
              <option value={3.5}>Only below 3.5★</option>
              <option value={3}>Only below 3★</option>
            </select>
          </div>
        </div>
      )}

      {/* EMAIL SCRAPE PROGRESS — makes it obvious when it's actually safe to select/move leads */}
      {emailScrapeProgress.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: emailScrapeProgress.active ? 'rgba(234,179,8,0.08)' : 'rgba(16,185,129,0.08)', border: `1px solid ${emailScrapeProgress.active ? 'rgba(234,179,8,0.3)' : 'rgba(16,185,129,0.3)'}` }}>
          {emailScrapeProgress.active ? <Spinner size={14} /> : <span style={{ fontSize: 14 }}>✓</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: emailScrapeProgress.active ? '#eab308' : '#10b981' }}>
            {emailScrapeProgress.active
              ? `Checking websites for emails... ${emailScrapeProgress.done}/${emailScrapeProgress.total}`
              : `Done — checked ${emailScrapeProgress.total} websites for emails. Safe to select and move leads now.`}
          </span>
          {emailScrapeProgress.active && (
            <div style={{ flex: 1, maxWidth: 200, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginLeft: 8 }}>
              <div style={{ height: '100%', background: '#eab308', borderRadius: 2, width: `${(emailScrapeProgress.done/emailScrapeProgress.total)*100}%`, transition: 'width 0.3s ease' }} />
            </div>
          )}
        </div>
      )}

      {searching && <div style={{ textAlign: 'center', padding: '60px 0' }}><Spinner size={32} /><p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 12 }}>Searching for {category}s in {location}...</p></div>}

      {!isLoading && displayLeads.length === 0 && allLeads.length === 0 && <EmptyState icon="🔍" title="Search for leads above" sub="Search a suburb, or click a state button to sweep the entire state." />}
      {!isLoading && displayLeads.length === 0 && allLeads.length > 0 && noWebsiteOnly && <EmptyState icon="🌐" title="No leads without a website" sub="All leads in this search have some web presence." />}

      {displayLeads.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
            <input type="checkbox" style={{ accentColor: 'var(--olive)', cursor: 'pointer' }}
              checked={selectedFinderIds.size > 0 && selectedFinderIds.size === displayLeads.filter(l => l.email).length}
              onChange={e => e.target.checked ? selectAllFinder() : clearFinderSelect()} />
            Select All ({displayLeads.filter(l => l.email).length} with email)
          </label>
          {selectedFinderIds.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: 'var(--olive2)', fontWeight: 700 }}>{selectedFinderIds.size} selected</span>
              <button onClick={openSelectedEmails} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(122,158,73,0.2)', color: 'var(--olive2)', border: '1px solid rgba(122,158,73,0.4)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✉ Open All Emails</button>
              <button onClick={addSelectedToPipeline} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'var(--olive)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>+ Add Selected to Pipeline</button>
              <button onClick={exportSelectedFinder} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>⬇ Export Selected</button>
              <button onClick={clearFinderSelect} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>✕ Clear</button>
            </>
          )}
        </div>
      )}

      {displayLeads.map(lead => (
        <div key={lead.id} className="card lead-card fade-up" style={{ padding: '14px 18px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {lead.email && <input type="checkbox" checked={selectedFinderIds.has(lead.id)} onChange={() => toggleFinderSelect(lead.id)} style={{ accentColor: 'var(--olive)', cursor: 'pointer', flexShrink: 0 }} />}
          <div style={{ width: 40, height: 40, borderRadius: 9, background: 'rgba(122,158,73,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--olive)', flexShrink: 0 }}>{(lead.name||'?')[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{lead.name}</span>
              <TierTag tier={lead.tier} />
              {lead.websiteSignal === 'No website' && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 100, background: 'rgba(244,63,94,0.15)', color: '#f43f5e', fontWeight: 700 }}>NO SITE</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {lead.phone && <span style={{ cursor: 'pointer' }} onClick={() => { navigator.clipboard.writeText(lead.phone); showToast('Phone copied!') }}>📞 {lead.phone} ✂</span>}
              {lead.email && <span>✉ {lead.email}</span>}
              {lead.email && <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(122,158,73,0.18)', color: 'var(--olive)', textDecoration: 'none', fontSize: 11, fontWeight: 700, border: '1px solid rgba(122,158,73,0.3)' }}>✉ Email Now</a>}
              {lead.rating && <span>⭐ {lead.rating}</span>}
              <span style={{ color: lead.websiteSignal === 'No website' ? '#f43f5e' : 'var(--text3)' }}>{lead.websiteSignal}</span>
              {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: 'var(--olive)', textDecoration: 'none' }}>🌐</a>}
              {lead.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(lead.address)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--olive2)', textDecoration: 'none' }}>📍 Maps</a>}
            </div>
          </div>
          <ScoreRing score={lead.score} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => openEmails(lead)} className="btn btn-ghost btn-sm">✉ Emails</button>
            <button onClick={() => openResearch(lead)} className="btn btn-ghost btn-sm">🤖 Research</button>
            <button onClick={() => openLovable(lead)} className="btn btn-ghost btn-sm">⚡ Lovable</button>
            {(addedLeadIds.has(lead.id) || pipeline.some(p => p.id === lead.id)) ? (
              <button disabled style={{ padding: '6px 14px', borderRadius: 8, background: '#f43f5e', color: '#fff', border: 'none', cursor: 'not-allowed', fontSize: 13, fontWeight: 700 }}>✓ Added</button>
            ) : (
              <button onClick={() => handleAddToPipeline(lead)} className="btn btn-primary btn-sm">+ Pipeline</button>
            )}
          </div>
        </div>
      ))}
      {modal === 'emails' && <EmailModal lead={selectedLead} onClose={() => setModal(null)} />}
      {modal === 'research' && <ResearchModal lead={selectedLead} result={aiResult} loading={aiLoading} question={researchQ} setQuestion={setResearchQ} onAsk={doResearch} onClose={() => setModal(null)} />}
      {modal === 'lovable' && <LovableModal lead={selectedLead} onClose={() => setModal(null)} />}
    </div>
  )
}

// ═══ WORKSPACE ═══
export { FinderTab }
