import { useState, useRef, useEffect } from 'react'
import { Spinner } from '../shared'
import { PageHeader, AU_STATES } from './helpers'
import { getTodaySentCount, recordSend, getAccountCounts, buildCapacityView, hasBeenContacted, markContacted } from '../sendTracker'
import { apiJSON } from '../api'

// AFK Mode: pick a state + niche, hit Start, walk away. Finds businesses
// across that state's suburbs, gets contact info, and emails/texts them
// immediately — fully automatic, no review step.

const DAILY_EMAIL_CAP = 490 // fallback only; real per-account cap comes from the server config

// "All of Australia" is a virtual state that interleaves suburbs from every
// state (SA #1, VIC #1, NSW #1, SA #2, VIC #2, ...) rather than concatenating
// them. That matters because a run stops once it hits its target count — with
// plain concatenation you'd only ever get South Australian leads.
function interleaveAllSuburbs() {
  const lists = AU_STATES.map(s => s.suburbs)
  const max = Math.max(...lists.map(l => l.length))
  const out = []
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      if (list[i]) out.push(list[i])
    }
  }
  return out
}

const ALL_AUSTRALIA = {
  label: '🇦🇺 All of Australia',
  short: 'AUS',
  get suburbs() { return interleaveAllSuburbs() },
}

const SWEEP_TARGETS = [ALL_AUSTRALIA, ...AU_STATES]

const LOG_COLORS = { sent: '#10b981', failed: '#ef4444', info: 'var(--text2)', warn: '#eab308' }
const LOG_ICONS = { sent: '✓', failed: '✗', info: '—', warn: '⚠' }

function AFKTab({ pipeline, addManyToPipeline, savePipeline, showToast }) {
  const [stateIdx, setStateIdx] = useState(1) // default to SA; index 0 is All of Australia
  const [niche, setNiche] = useState('')
  const [targetCount, setTargetCount] = useState(300)
  const [channel, setChannel] = useState('email')
  const [subject, setSubject] = useState('Quick note for {{name}}')
  const [body, setBody] = useState(`Hi {{name}},\n\nI run Robertson Marketing — we help {{category}} businesses get more enquiries through Facebook/Instagram ads.\n\nWorth a quick chat?\n\nCallum\nRobertson Marketing`)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState(null) // null | 'searching' | 'contacting' | 'done'
  const [log, setLog] = useState([])
  const [tally, setTally] = useState({ found: 0, sent: 0, noContact: 0, failed: 0 })
  const [todayCount, setTodayCount] = useState(getTodaySentCount())
  const [capacity, setCapacity] = useState(null)
  const [testTo, setTestTo] = useState('')
  const [showTestForm, setShowTestForm] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [lastResults, setLastResults] = useState([])
  const stopRef = useRef(false)
  // The run loop is one long async function, so it would only ever see the
  // `capacity` value from when it started. Read the live value via a ref.
  const capacityRef = useRef(null)
  const logBoxRef = useRef(null)
  const stickToBottomRef = useRef(true)

  // Only auto-scroll if the user is already at the bottom of the log. If
  // they've scrolled up to read something, leave them alone.
  useEffect(() => {
    const box = logBoxRef.current
    if (box && stickToBottomRef.current) box.scrollTop = box.scrollHeight
  }, [log])

  const onLogScroll = () => {
    const box = logBoxRef.current
    if (!box) return
    stickToBottomRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
  }
  const refreshCapacity = async () => {
    try {
      const config = await apiJSON('/api/email-capacity')
      const view = buildCapacityView(config)
      capacityRef.current = view
      setCapacity(view)
    } catch {}
  }
  useEffect(() => { refreshCapacity() }, [])

  const addLog = (text, type = 'info') => setLog(prev => [...prev.slice(-300), { text, type }])

  const sendTest = async () => {
    if (!testTo.trim()) { showToast?.(`Enter your ${channel === 'sms' ? 'phone number' : 'email'} first`); return }
    setTestSending(true)
    try {
      const testLead = { id: 'afk-test-' + Date.now(), name: 'Test', category: 'test' }
      if (channel === 'sms') testLead.phone = testTo.trim()
      else testLead.email = testTo.trim()

      const d = await apiJSON('/api/afk-contact', {
        method: 'POST',
        body: { lead: testLead, subject, body, channel, counts: getAccountCounts() }
      })
      if (d.status === 'sent') {
        if (channel === 'email') { recordSend(d.sentFrom); setTodayCount(getTodaySentCount()); refreshCapacity() }
        showToast?.(`Test ${channel === 'sms' ? 'text' : 'email'} sent ✓`)
      } else {
        showToast?.(`Test failed: ${d.error || d.status}`)
      }
    } catch (err) {
      showToast?.('Test failed: ' + err.message)
    }
    setTestSending(false)
    setShowTestForm(false)
    setTestTo('')
  }

  const start = async () => {
    if (!niche.trim()) { showToast?.('Enter a niche first'); return }

    // PRE-FLIGHT: verify sending is actually configured BEFORE spending
    // several minutes searching. Previously a missing env var wasn't
    // discovered until the contact phase, wasting the entire search.
    if (channel === 'email') {
      try {
        const r = await fetch('/api/email-capacity')
        const cfg = await r.json()
        if (!cfg.accountCount) {
          addLog('Cannot start — no Gmail accounts configured. Set GMAIL_USERS and GMAIL_APP_PASSWORDS in your Vercel environment variables, then redeploy.', 'failed')
          showToast?.('No Gmail accounts configured — check environment variables')
          setPhase(null)
          return
        }
        // Actually log in to Gmail. The config check above only proves the
        // env vars exist — a wrong App Password used to pass it, then every
        // send failed after minutes of searching.
        addLog('Checking Gmail login for each account...')
        const v = await apiJSON('/api/email-verify')
        if (v.error && !v.accounts) {
          addLog(`Cannot verify Gmail login: ${v.error}`, 'failed')
          showToast?.('Could not verify Gmail login')
          setPhase(null)
          return
        }
        for (const a of v.accounts || []) {
          if (!a.ok) addLog(`${a.user}: ${a.error}`, 'failed')
        }
        if (!v.okCount) {
          addLog(`Cannot start — none of the ${cfg.accountCount} Gmail account(s) could log in. Fix the errors above in Vercel → Settings → Environment Variables, then redeploy.`, 'failed')
          showToast?.('No Gmail account could log in')
          setPhase(null)
          return
        }
        addLog(`Gmail ready: ${v.okCount}/${cfg.accountCount} account(s) logged in, ${cfg.totalDailyCapacity} daily capacity.`, 'sent')
        await refreshCapacity()
      } catch (err) {
        addLog(`Cannot verify email setup: ${err.message}`, 'failed')
        showToast?.('Could not verify email configuration')
        setPhase(null)
        return
      }
    }

    if (channel === 'email') {
      const remaining = (capacityRef.current?.totalRemaining ?? DAILY_EMAIL_CAP - getTodaySentCount())
      if (remaining <= 0) {
        showToast?.(`Daily send cap reached (${DAILY_EMAIL_CAP}/day) — try again tomorrow`)
        return
      }
      if (targetCount > remaining) {
        addLog(`Requested ${targetCount} but only ${remaining} sends left today under the safety cap — will stop early once reached.`, 'warn')
      }
    }

    setRunning(true)
    setPhase('searching')
    stopRef.current = false
    setLog([])
    setLastResults([])
    setTally({ found: 0, sent: 0, noContact: 0, failed: 0 })

    const state = SWEEP_TARGETS[stateIdx]
    const excludeIds = new Set(pipeline.map(l => l.id))
    addLog(`Searching ${state.label} for "${niche}" — target ${targetCount} businesses...`)

    // Loop suburbs CLIENT-side, one request each. Doing this server-side in a
    // single request used to hit Vercel's function timeout after a few
    // suburbs, silently capping every run at ~60 leads.
    const foundMap = new Map()
    let suburbsSearched = 0
    let searchError = null
    let discardedDuringSearch = 0
    let skippedAlreadyContacted = 0 // also incremented during the contact phase

    for (const suburb of state.suburbs) {
      if (stopRef.current) { addLog('Search stopped by user.', 'warn'); break }
      if (foundMap.size >= targetCount) break

      try {
        const d = await apiJSON('/api/afk-search', { method: 'POST', body: { niche, suburb } })
        if (d.error && d.status !== 'failed') { searchError = d.error; break }
        if (d.error) { addLog(`Search error in ${suburb}: ${d.error}`, 'failed'); continue }
        let newThisSuburb = 0
        for (const lead of d.leads || []) {
          if (excludeIds.has(lead.id) || foundMap.has(lead.id)) continue
          // Only count leads this channel can actually reach toward the target,
          // otherwise asking for 300 could yield 50 contactable ones and 250
          // that get discarded.
          const canReach = channel === 'sms' ? !!lead.phone : (!!lead.email || !!lead.website)
          if (!canReach) { discardedDuringSearch++; continue }
          // If we already know this address and it's been contacted before,
          // don't even queue it. (Most leads have no email at this stage —
          // those get checked again after scraping, just before sending.)
          if (channel === 'email' && lead.email && hasBeenContacted(lead.email)) { skippedAlreadyContacted++; continue }
          if (channel === 'sms' && lead.phone && hasBeenContacted(lead.phone)) { skippedAlreadyContacted++; continue }
          foundMap.set(lead.id, lead)
          newThisSuburb++
        }
        suburbsSearched++
        if (newThisSuburb) {
          addLog(`${suburb}: +${newThisSuburb} new (${foundMap.size}/${targetCount} total)`)
          setTally(t => ({ ...t, found: foundMap.size }))
        }
      } catch (err) {
        addLog(`Search error in ${suburb}: ${err.message}`, 'failed')
      }
    }

    if (searchError) {
      addLog(searchError, 'failed')
      setRunning(false); setPhase(null)
      return
    }

    const allFound = Array.from(foundMap.values())
    if (!allFound.length) {
      addLog(`No new businesses found across ${suburbsSearched} suburbs.`, 'warn')
      setRunning(false); setPhase('done')
      return
    }

    // Leads with no way to reach them were already filtered out during the
    // search and discarded — they're never contacted and never hit the Pipeline.
    const leads = allFound.sort((a, b) => b.score - a.score)
    if (discardedDuringSearch) {
      addLog(`Discarded ${discardedDuringSearch} businesses with no ${channel === 'sms' ? 'phone number' : 'website'}.`, 'warn')
    }
    if (skippedAlreadyContacted) {
      addLog(`Skipped ${skippedAlreadyContacted} already contacted in a previous run.`, 'warn')
    }
    addLog(`${leads.length} contactable businesses found across ${suburbsSearched} suburbs. Starting contact...`, 'sent')
    setTally(t => ({ ...t, found: leads.length }))
    setPhase('contacting')

    const resultsById = new Map()
    let consecutiveFailures = 0
    let sentThisRun = 0
    const failedLeads = []

    // Step 1: find the contact address WITHOUT sending.
    const findContact = async (lead) => {
      return apiJSON('/api/afk-contact', { method: 'POST', body: { lead, channel, scrapeOnly: true } })
    }

    // Step 2: actually send, with the address already known and checked.
    const sendTo = async (lead, address) => {
      const withAddress = channel === 'sms' ? { ...lead, phone: address } : { ...lead, email: address }
      return apiJSON('/api/afk-contact', {
        method: 'POST',
        body: { lead: withAddress, subject, body, channel, counts: getAccountCounts() }
      })
    }

    // Scrape, check the permanent contacted history, then send only if clean.
    const attemptContact = async (lead) => {
      const found = await findContact(lead)
      if (found.status === 'no_email' || found.status === 'no_phone') return found
      if (found.status === 'failed') return found

      const address = channel === 'sms' ? found.phone : found.email
      if (address && hasBeenContacted(address)) {
        return { status: 'already_contacted', email: found.email, phone: found.phone, address }
      }
      return await sendTo(lead, address)
    }

    const recordResult = (lead, d) => {
      const sent = d.status === 'sent'
      resultsById.set(lead.id, {
        ...lead,
        contacted: sent,
        stage: sent ? 'Contacted' : 'New',
        email: d.email ?? lead.email,
        afkStatus: d.status,
        followUpDate: sent ? new Date(Date.now() + 3*24*60*60*1000).toISOString().slice(0,10) : undefined,
      })
    }

    for (const lead of leads) {
      if (stopRef.current) { addLog('Stopped by user.', 'warn'); break }

      if (channel === 'email' && capacityRef.current && capacityRef.current.totalRemaining <= 0) {
        addLog(`All accounts have hit their daily cap — stopping run. Resume tomorrow.`, 'warn')
        break
      }

      const d = await attemptContact(lead)

      // Server says every account is capped or failed login — stop cleanly.
      if (d.allExhausted) {
        addLog(d.error || 'All email accounts are exhausted.', 'failed')
        addLog('Stopped — no account can send right now.', 'failed')
        break
      }

      // Already emailed this exact address in a previous run — skip silently
      // rather than contacting the same business twice.
      if (d.status === 'already_contacted') {
        addLog(`Skipped — ${lead.name} (${d.address} already contacted previously)`, 'warn')
        skippedAlreadyContacted++
        setTally(t => ({ ...t, noContact: t.noContact + 1 }))
        consecutiveFailures = 0
        continue
      }

      // Website existed but had no email anywhere on it — discard rather than
      // filing a lead we can't actually email.
      if (d.status === 'no_email' || d.status === 'no_phone') {
        addLog(`Discarded — ${lead.name} (${channel === 'sms' ? 'no phone number' : 'no email found on site'})`)
        setTally(t => ({ ...t, noContact: t.noContact + 1 }))
        consecutiveFailures = 0
        continue
      }

      recordResult(lead, d)

      if (d.status === 'sent') {
        addLog(`Sent — ${lead.name} (${channel === 'sms' ? d.phone : d.email})${d.sentFrom ? ` via ${d.sentFrom}` : ''}`, 'sent')
        setTally(t => ({ ...t, sent: t.sent + 1 }))
        if (channel === 'email') { recordSend(d.sentFrom); setTodayCount(getTodaySentCount()); refreshCapacity() }
        markContacted(channel === 'sms' ? d.phone : d.email)
        consecutiveFailures = 0
        sentThisRun++
      } else {
        addLog(`Failed — ${lead.name}: ${d.error || 'unknown error'}`, 'failed')
        setTally(t => ({ ...t, failed: t.failed + 1 }))
        failedLeads.push(lead)
        consecutiveFailures++
      }

      // 5 sends in a row failing almost always means something's actually
      // broken (bad key, config issue) — better to stop and surface that
      // clearly than burn through 50 more businesses failing silently.
      if (consecutiveFailures >= 5) {
        addLog(`Stopped automatically — 5 sends in a row failed. Check your ${channel === 'sms' ? 'Twilio' : 'Gmail'} setup before restarting.`, 'failed')
        break
      }

      // Space sends out with a randomized delay instead of firing as fast
      // as the API allows — looks far more human and is safer for your
      // Gmail account's long-term reputation at real volume.
      if (!stopRef.current) await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000))
    }

    // RETRY PASS — a lot of failures are transient (slow site, brief network
    // blip), so give each failed lead one more go at the end rather than
    // making you spot them and re-run manually.
    if (failedLeads.length && !stopRef.current) {
      addLog(`Retrying ${failedLeads.length} failed send${failedLeads.length === 1 ? '' : 's'}...`, 'warn')
      for (const lead of failedLeads) {
        if (stopRef.current) break
        if (channel === 'email' && capacityRef.current && capacityRef.current.totalRemaining <= 0) break

        const d = await attemptContact(lead)
        if (d.allExhausted) { addLog(d.error || 'All email accounts are exhausted.', 'failed'); break }
        recordResult(lead, d)

        if (d.status === 'sent') {
          addLog(`Sent on retry — ${lead.name} (${channel === 'sms' ? d.phone : d.email})${d.sentFrom ? ` via ${d.sentFrom}` : ''}`, 'sent')
          setTally(t => ({ ...t, sent: t.sent + 1, failed: Math.max(0, t.failed - 1) }))
          if (channel === 'email') { recordSend(d.sentFrom); setTodayCount(getTodaySentCount()); refreshCapacity() }
          markContacted(channel === 'sms' ? d.phone : d.email)
          sentThisRun++
        } else {
          addLog(`Failed again — ${lead.name}: ${d.error || 'unknown error'}`, 'failed')
        }
        if (!stopRef.current) await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000))
      }
    }

    // Only leads we actually reached are filed. Leads that failed purely
    // because sending was misconfigured aren't real outcomes, so they're
    // dropped rather than polluting the Pipeline with phantom entries.
    const results = Array.from(resultsById.values()).filter(r => r.contacted || r.afkStatus === 'failed_permanent')
    addManyToPipeline(results)
    setLastResults(results)
    addLog(`Done. ${sentThisRun} sent, ${skippedAlreadyContacted} skipped as already contacted, ${results.length} added to Pipeline.`, 'sent')
    setRunning(false)
    setPhase('done')
    refreshCapacity()
  }

  const stop = () => { stopRef.current = true }

  const exportResultsCSV = () => {
    if (!lastResults.length) return
    const headers = ['Name', 'Category', 'Phone', 'Email', 'Status', 'Website']
    const rows = lastResults.map(l => [l.name||'', l.category||'', l.phone||'', l.email||'', l.afkStatus||'', l.website||'']
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `afk-run-${niche}-${SWEEP_TARGETS[stateIdx].short}-${Date.now()}.csv`
    a.click()
  }

  const processed = tally.sent + tally.noContact + tally.failed
  const progressPct = tally.found > 0 ? Math.min(100, (processed / tally.found) * 100) : 0

  return (
    <div>
      <PageHeader title="⚡ AFK Mode" sub="Pick a state and niche — finds businesses, gets contact info, and contacts them automatically" />

      {/* STATUS ROW */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {channel === 'email' ? (
          capacity && capacity.accounts?.length > 0 ? (
            <>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8,
                background: capacity.totalRemaining === 0 ? 'rgba(239,68,68,0.15)' : capacity.totalRemaining < capacity.totalCapacity * 0.25 ? 'rgba(234,179,8,0.15)' : 'rgba(16,185,129,0.15)',
                color: capacity.totalRemaining === 0 ? '#ef4444' : capacity.totalRemaining < capacity.totalCapacity * 0.25 ? '#eab308' : '#10b981'
              }}>
                ✉ {capacity.totalSent}/{capacity.totalCapacity} sent today across {capacity.accounts.length} account{capacity.accounts.length === 1 ? '' : 's'}
              </span>
              {capacity.accounts.length > 1 && capacity.accounts.map(a => (
                <span key={a.user} title={a.user} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: a.broken ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: a.broken ? '#ef4444' : 'var(--text3)' }}>
                  {a.broken ? '⚠ ' : ''}{a.user.split('@')[0]}: {a.sent}/{a.sent + a.remaining}
                </span>
              ))}
              {capacity.anyBroken && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                  ⚠ Login failed on {capacity.accounts.filter(a => a.broken).length} account(s) — check GMAIL_APP_PASSWORDS
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'var(--text3)' }}>Checking email capacity...</span>
          )
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(109,138,64,0.12)', color: 'var(--olive2)' }}>
            💬 SMS via Twilio — pay-per-text, no daily cap
          </span>
        )}
        {phase && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {phase === 'searching' && '🔎 Searching'}
            {phase === 'contacting' && '📤 Contacting'}
            {phase === 'done' && '✅ Last run complete'}
          </span>
        )}
      </div>

      {capacity && capacity.accounts?.length === 0 && (
        <div style={{ padding: '12px 16px', marginBottom: 16, borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>⚠ No email accounts configured — sending will fail</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            Add <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>GMAIL_USERS</code> and <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>GMAIL_APP_PASSWORDS</code> to your Vercel environment variables, then redeploy.
          </div>
        </div>
      )}
      {/* TEST SEND */}
      <div style={{ marginBottom: 16 }}>
        {!showTestForm ? (
          <button onClick={() => setShowTestForm(true)} disabled={running} className="btn btn-ghost btn-sm">🧪 Send Test {channel === 'sms' ? 'Text' : 'Email'} (verify sending works)</button>
        ) : (
          <div className="card card-p" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder={channel === 'sms' ? 'Your phone number, e.g. 0412345678' : 'Your email address'} type={channel === 'sms' ? 'tel' : 'email'}
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', flex: 1, minWidth: 200 }} />
            <button onClick={sendTest} disabled={testSending} className="btn btn-primary btn-sm">{testSending ? <Spinner size={12} /> : 'Send Test Now'}</button>
            <button onClick={() => setShowTestForm(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        )}
      </div>

      {/* CONFIG CARD */}
      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Target</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <select value={stateIdx} onChange={e => setStateIdx(Number(e.target.value))} disabled={running}
            style={{ padding: '9px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {SWEEP_TARGETS.map((s, i) => <option key={s.short} value={i}>{s.label}</option>)}
          </select>
          <select value={channel} onChange={e => setChannel(e.target.value)} disabled={running}
            style={{ padding: '9px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="email">✉ Email</option>
            <option value="sms">💬 SMS</option>
          </select>
          <input value={niche} onChange={e => setNiche(e.target.value)} disabled={running} placeholder="Niche, e.g. roofer"
            style={{ flex: 1, minWidth: 160, padding: '9px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          <input type="number" value={targetCount} onChange={e => setTargetCount(Number(e.target.value))} disabled={running} title="Target number of businesses"
            style={{ width: 90, padding: '9px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Message</div>
        {channel === 'email' && (
          <input value={subject} onChange={e => setSubject(e.target.value)} disabled={running} placeholder="Subject"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', boxSizing: 'border-box', marginBottom: 8 }} />
        )}
        <textarea value={body} onChange={e => setBody(e.target.value)} disabled={running} rows={5} placeholder="Message — use {{name}}, {{category}}, {{rating}}, {{reviewCount}} tokens"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }} />

        <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
          {!running ? (
            <button onClick={start} className="btn btn-primary" style={{ fontWeight: 700 }}>▶ Start AFK Run</button>
          ) : (
            <button onClick={stop} className="btn btn-danger">■ Stop</button>
          )}
          {running && <Spinner size={16} />}
          {!running && lastResults.length > 0 && <button onClick={exportResultsCSV} className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>⬇ Export Last Run CSV</button>}
        </div>
      </div>

      {/* LIVE STATS + PROGRESS */}
      {(log.length > 0 || running) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 12 }}>
            <div className="stat-card"><div className="stat-label">Found</div><div className="stat-val">{tally.found}</div></div>
            <div className="stat-card"><div className="stat-label">Sent</div><div className="stat-val" style={{ color: '#10b981' }}>{tally.sent}</div></div>
            <div className="stat-card"><div className="stat-label">No Contact Info</div><div className="stat-val">{tally.noContact}</div></div>
            <div className="stat-card"><div className="stat-label">Failed</div><div className="stat-val" style={{ color: tally.failed > 0 ? '#ef4444' : 'inherit' }}>{tally.failed}</div></div>
          </div>

          {phase === 'searching' && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>
                <span>Searching suburbs — {tally.found}/{targetCount} businesses found</span>
                <span>{Math.round(Math.min(100, (tally.found / targetCount) * 100))}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: 3, width: `${Math.min(100, (tally.found / targetCount) * 100)}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
          {phase === 'contacting' && tally.found > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>
                <span>{processed}/{tally.found} contacted</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--olive), var(--olive2))', borderRadius: 3, width: `${progressPct}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          <div className="card card-p" style={{ marginBottom: 16 }}>
            <div ref={logBoxRef} onScroll={onLogScroll} style={{ maxHeight: 320, overflowY: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.9 }}>
              {log.map((entry, i) => (
                <div key={i} style={{ color: LOG_COLORS[entry.type] || LOG_COLORS.info, display: 'flex', gap: 8 }}>
                  <span style={{ opacity: 0.7, flexShrink: 0 }}>{LOG_ICONS[entry.type] || LOG_ICONS.info}</span>
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export { AFKTab }
