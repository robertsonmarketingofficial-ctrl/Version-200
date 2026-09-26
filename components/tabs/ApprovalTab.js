import { useState, useRef, useEffect } from 'react'
import { Spinner, TierTag, ScoreRing, EmptyState } from '../shared'
import { PageHeader } from './helpers'
import { getTodaySentCount, recordSend, getAccountCounts, buildCapacityView, hasBeenContacted, markContacted, whenContacted } from '../sendTracker'
import { apiJSON } from '../api'

const LOG_COLORS = { sent: '#10b981', failed: '#ef4444', info: 'var(--text2)' }
const LOG_ICONS = { sent: '✓', failed: '✗', info: '—' }

// No database — reads straight from the pipeline already stored in your
// browser (localStorage, via the `pipeline` prop every tab gets). Sending
// an email marks the lead as contacted directly on the pipeline itself.

function ApprovalTab({ pipeline, savePipeline, showToast }) {
  const [selected, setSelected] = useState(new Set())
  const [tradeFilter, setTradeFilter] = useState('all')
  const [channel, setChannel] = useState('email')
  const [subject, setSubject] = useState('Quick note for {{name}}')
  const [body, setBody] = useState(`Hi {{name}},\n\nI run Robertson Marketing — we help {{category}} businesses get more enquiries through Facebook/Instagram ads.\n\nWorth a quick chat?\n\nCallum\nRobertson Marketing`)
  const [sending, setSending] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [showTestForm, setShowTestForm] = useState(false)
  const [todayCount, setTodayCount] = useState(getTodaySentCount())
  const [sendLog, setSendLog] = useState([])
  const [sendTally, setSendTally] = useState({ total: 0, sent: 0, failed: 0 })
  const [capacity, setCapacity] = useState(null)
  const [preferredAccount, setPreferredAccount] = useState(null) // null = auto (first with capacity)
  const logBoxRef = useRef(null)
  const stickToBottomRef = useRef(true)

  // Only auto-scroll if the user is already at the bottom of the log. If
  // they've scrolled up to read something, leave them alone — previously
  // this yanked them back down on every single log line.
  useEffect(() => {
    const box = logBoxRef.current
    if (box && stickToBottomRef.current) box.scrollTop = box.scrollHeight
  }, [sendLog])

  const onLogScroll = () => {
    const box = logBoxRef.current
    if (!box) return
    // 40px of slack so it still counts as "at the bottom" when close
    stickToBottomRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40
  }
  const refreshCapacity = async () => {
    try {
      const config = await apiJSON('/api/email-capacity')
      setCapacity(buildCapacityView(config))
    } catch {}
  }
  useEffect(() => { refreshCapacity() }, [])
  const addSendLog = (text, type = 'info') => setSendLog(prev => [...prev.slice(-200), { text, type }])

  const addTestLead = () => {
    if (!testEmail.trim()) { showToast?.('Enter an email first'); return }
    const testLead = {
      id: 'test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      name: 'Test', email: testEmail.trim(), category: 'test', tier: 'Hot', score: 99, stage: 'New',
      queuedForApproval: true, contacted: false,
      notes: '', activityLog: [], followUpDate: '', dealValue: 0, addedAt: new Date().toISOString()
    }
    savePipeline([...pipeline, testLead])
    showToast?.('Test lead added to queue ✓')
    setTestEmail('')
    setShowTestForm(false)
  }

  const uncontacted = pipeline.filter(l => l.queuedForApproval && !l.contacted)
  const trades = Array.from(new Set(uncontacted.map(l => l.category).filter(Boolean)))
  const filtered = tradeFilter === 'all' ? uncontacted : uncontacted.filter(l => l.category === tradeFilter)

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const selectAll = () => setSelected(new Set(filtered.map(l => l.id)))
  const clearAll = () => setSelected(new Set())
  const removeFromQueue = (id) => {
    savePipeline(pipeline.map(l => l.id === id ? { ...l, queuedForApproval: false } : l))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    showToast?.('Removed from queue')
  }
  const removeSelectedFromQueue = () => {
    if (!selected.size) return
    savePipeline(pipeline.map(l => selected.has(l.id) ? { ...l, queuedForApproval: false } : l))
    showToast?.(`Removed ${selected.size} lead${selected.size===1?'':'s'} from queue`)
    setSelected(new Set())
  }

  const approveSend = async () => {
    if (!selected.size) return

    // Dedupe by email within this batch only, so the same inbox doesn't
    // get hit twice from one click if two queued leads share an address.
    setSending(true)
    setSendLog([])

    const candidates = pipeline.filter(l => selected.has(l.id))
    const seenEmails = new Set()
    const toSend = [], duplicatesInBatch = [], alreadyContacted = [], skippedNoAddress = []
    const addressOf = (l) => channel === 'sms' ? (l.phone || '') : (l.email || '')
    for (const lead of candidates) {
      const email = addressOf(lead).toLowerCase()
      if (!email) { skippedNoAddress.push(lead); continue }
      // Never email an address that has EVER been emailed before, even from
      // a different sweep months ago. Protects sender reputation.
      if (hasBeenContacted(email)) { alreadyContacted.push(lead); continue }
      if (seenEmails.has(email)) { duplicatesInBatch.push(lead); continue }
      seenEmails.add(email)
      toSend.push(lead)
    }
    if (alreadyContacted.length) {
      addSendLog(`Skipped ${alreadyContacted.length} already contacted previously:`, 'warn')
      alreadyContacted.slice(0, 10).forEach(l => {
        const when = whenContacted(addressOf(l))
        addSendLog(`  ${l.name} — last contacted ${when ? new Date(when).toLocaleDateString('en-AU') : 'previously'}`, 'warn')
      })
      if (alreadyContacted.length > 10) addSendLog(`  ...and ${alreadyContacted.length - 10} more`, 'warn')
    }
    if (skippedNoAddress.length) addSendLog(`Skipped ${skippedNoAddress.length} with no ${channel === 'sms' ? 'phone number' : 'email address'}`, 'warn')
    if (duplicatesInBatch.length) addSendLog(`Skipped ${duplicatesInBatch.length} duplicate address within this batch`, 'warn')
    if (!toSend.length) {
      addSendLog('Nothing left to send — every selected lead has already been contacted.', 'warn')
      showToast?.('All selected leads were already contacted')
      setSending(false)
      return
    }

    setSendTally({ total: toSend.length, sent: 0, failed: 0 })

    const sentIds = new Set()
    const followUpDate = new Date(Date.now() + 3*24*60*60*1000).toISOString().slice(0,10)

    const attemptSend = async (lead) => {
      const d = await apiJSON('/api/leads/send', {
        method: 'POST',
        body: { leads: [lead], subject, body, channel, counts: getAccountCounts(), preferredAccount }
      })
      return d.results?.[0] || { status: 'failed', error: d.error || 'no result returned' }
    }

    // Send one at a time (not one batch call) so you can watch each result
    // land live, instead of staring at a spinner until the whole thing finishes.
    const failedFirstPass = []
    let exhausted = false
    for (const lead of toSend) {
      const result = await attemptSend(lead)

      // Every account is at its cap (or all failed auth) — stop the run
      // cleanly instead of attempting every remaining lead and logging an
      // identical failure for each one.
      if (result.allExhausted) {
        exhausted = true
        addSendLog(result.error, 'failed')
        addSendLog(`Stopped — ${toSend.length - sentIds.size} leads not sent. They stay in the queue for tomorrow.`, 'failed')
        break
      }

      if (result.status === 'sent') {
        sentIds.add(lead.id)
        if (channel === 'email') recordSend(result.sentFrom); markContacted(addressOf(lead)); setTodayCount(getTodaySentCount()); refreshCapacity()
        addSendLog(`Sent — ${lead.name} (${channel === 'sms' ? lead.phone : lead.email})${result.sentFrom ? ` via ${result.sentFrom}` : ''}`, 'sent')
        setSendTally(t => ({ ...t, sent: t.sent + 1 }))
      } else {
        addSendLog(`Failed — ${lead.name}: ${result.error || 'unknown error'}`, 'failed')
        setSendTally(t => ({ ...t, failed: t.failed + 1 }))
        failedFirstPass.push(lead)
      }
    }

    // Automatically retry anything that failed, once, before finishing —
    // a lot of failures are transient (a slow website, a brief network
    // hiccup), so one retry at the end recovers a real chunk of them for
    // free without you having to notice and re-send manually.
    if (failedFirstPass.length) {
      addSendLog(`Retrying ${failedFirstPass.length} failed send${failedFirstPass.length===1?'':'s'}...`)
      for (const lead of failedFirstPass) {
        const result = await attemptSend(lead)
        if (result.status === 'sent') {
          sentIds.add(lead.id)
          if (channel === 'email') recordSend(result.sentFrom); markContacted(addressOf(lead)); setTodayCount(getTodaySentCount()); refreshCapacity()
          addSendLog(`Sent on retry — ${lead.name} (${channel === 'sms' ? lead.phone : lead.email})${result.sentFrom ? ` via ${result.sentFrom}` : ''}`, 'sent')
          setSendTally(t => ({ ...t, sent: t.sent + 1, failed: t.failed - 1 }))
        } else {
          addSendLog(`Failed again — ${lead.name}: ${result.error || 'unknown error'}`, 'failed')
        }
      }
    }

    const updated = pipeline.map(l => sentIds.has(l.id) ? { ...l, contacted: true, stage: 'Contacted', contactedAt: new Date().toISOString(), followUpDate: l.followUpDate || followUpDate } : l)
    savePipeline(updated)

    addSendLog(`Done — ${sentIds.size}/${toSend.length} sent successfully.`, sentIds.size === toSend.length ? 'sent' : 'info')
    showToast?.(`Sent to ${sentIds.size} lead${sentIds.size === 1 ? '' : 's'} ✓${toSend.length - sentIds.size ? ` — ${toSend.length - sentIds.size} failed` : ''}`)
    setSelected(new Set())
    setSending(false)
    refreshCapacity()
  }

  return (
    <div>
      <PageHeader title="Approval Queue" sub="Leads sent here from the Pipeline — batch-approve to send a real email to all of them" />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {capacity && capacity.accounts?.length > 0 ? (
          <>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
              background: capacity.totalRemaining === 0 ? 'rgba(239,68,68,0.15)' : capacity.totalRemaining < capacity.totalCapacity * 0.25 ? 'rgba(234,179,8,0.15)' : 'rgba(16,185,129,0.15)',
              color: capacity.totalRemaining === 0 ? '#ef4444' : capacity.totalRemaining < capacity.totalCapacity * 0.25 ? '#eab308' : '#10b981'
            }}>
              ✉ {capacity.totalSent}/{capacity.totalCapacity} sent today across {capacity.accounts.length} account{capacity.accounts.length === 1 ? '' : 's'}
            </span>
            {capacity.accounts.length > 1 && capacity.accounts.map(a => {
              const full = a.remaining <= 0
              const active = preferredAccount === a.user
              return (
                <button
                  key={a.user}
                  title={a.broken ? `${a.user} — login failed` : full ? `${a.user} — daily cap reached` : `Click to send from ${a.user} first`}
                  onClick={() => setPreferredAccount(active ? null : a.user)}
                  disabled={a.broken || full}
                  style={{
                    fontSize: 10, padding: '3px 9px', borderRadius: 6, fontWeight: 700,
                    cursor: (a.broken || full) ? 'not-allowed' : 'pointer',
                    border: active ? '1px solid var(--olive2)' : '1px solid transparent',
                    background: a.broken ? 'rgba(239,68,68,0.15)' : full ? 'rgba(234,179,8,0.12)' : active ? 'rgba(109,138,64,0.22)' : 'rgba(255,255,255,0.05)',
                    color: a.broken ? '#ef4444' : full ? '#eab308' : active ? 'var(--olive2)' : 'var(--text3)',
                    opacity: (a.broken || full) ? 0.7 : 1,
                  }}>
                  {a.broken ? '⚠ ' : full ? '🚫 ' : active ? '▶ ' : ''}{a.user.split('@')[0]}: {a.sent}/{a.sent + a.remaining}
                </button>
              )
            })}
            {capacity.accounts.length > 1 && (
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                {preferredAccount ? `starting from ${preferredAccount.split('@')[0]}` : 'auto — first with capacity'}
              </span>
            )}
            {capacity.anyBroken && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                ⚠ Login failed on {capacity.accounts.filter(a => a.broken).length} account(s) — check GMAIL_APP_PASSWORDS
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'var(--text3)' }}>
            Checking email capacity...
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
      <div style={{ marginBottom: 12 }}>
        {!showTestForm ? (
          <button onClick={() => setShowTestForm(true)} className="btn btn-ghost btn-sm">🧪 Add Test Lead (verify sending works)</button>
        ) : (
          <div className="card card-p" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Your email address" type="email"
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', flex: 1, minWidth: 200 }} />
            <button onClick={addTestLead} className="btn btn-primary btn-sm">Add "Test" to Queue</button>
            <button onClick={() => setShowTestForm(false)} className="btn btn-ghost btn-sm">Cancel</button>
          </div>
        )}
      </div>

      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="all">All trades</option>
            {trades.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={channel} onChange={e => setChannel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
          <button onClick={selectAll} className="btn btn-ghost btn-sm">Select all ({filtered.length})</button>
          <button onClick={clearAll} className="btn btn-ghost btn-sm">Clear</button>
          <button onClick={removeSelectedFromQueue} disabled={!selected.size} style={{padding:'5px 12px',borderRadius:8,border:'1px solid rgba(239,68,68,0.4)',background:'rgba(239,68,68,0.08)',color:'#ef4444',cursor:selected.size?'pointer':'not-allowed',fontSize:12,fontWeight:700,opacity:selected.size?1:0.4}}>🗑 Remove Selected from Queue</button>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text3)', alignSelf: 'center' }}>{selected.size} selected</span>
        </div>

        {channel === 'email' && (
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', boxSizing: 'border-box', marginBottom: 8 }} />
        )}
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="Message — use {{name}}, {{category}}, {{rating}}, {{reviewCount}} tokens" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text)', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }} />

        <button onClick={approveSend} disabled={!selected.size || sending} className="btn btn-primary" style={{ marginTop: 10 }}>
          {sending ? <Spinner size={12} /> : `Approve & Send (${selected.size})`}
        </button>
      </div>

      {/* LIVE SEND PROGRESS */}
      {(sendLog.length > 0 || sending) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 12 }}>
            <div className="stat-card"><div className="stat-label">Sending</div><div className="stat-val">{sendTally.total}</div></div>
            <div className="stat-card"><div className="stat-label">Sent</div><div className="stat-val" style={{ color: '#10b981' }}>{sendTally.sent}</div></div>
            <div className="stat-card"><div className="stat-label">Failed</div><div className="stat-val" style={{ color: sendTally.failed > 0 ? '#ef4444' : 'inherit' }}>{sendTally.failed}</div></div>
          </div>
          {sending && sendTally.total > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 5 }}>
                <span>{sendTally.sent + sendTally.failed}/{sendTally.total} processed</span>
                <span>{Math.round(((sendTally.sent + sendTally.failed) / sendTally.total) * 100)}%</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--olive), var(--olive2))', borderRadius: 3, width: `${((sendTally.sent + sendTally.failed) / sendTally.total) * 100}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
          <div className="card card-p" style={{ marginBottom: 16 }}>
            <div ref={logBoxRef} onScroll={onLogScroll} style={{ maxHeight: 260, overflowY: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.9 }}>
              {sendLog.map((entry, i) => (
                <div key={i} style={{ color: LOG_COLORS[entry.type] || LOG_COLORS.info, display: 'flex', gap: 8 }}>
                  <span style={{ opacity: 0.7, flexShrink: 0 }}>{LOG_ICONS[entry.type] || LOG_ICONS.info}</span>
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="✓" title="Nothing pending approval" sub="Select leads in Pipeline and click 'Send to Approval Queue' to add them here." />
      ) : (
        filtered.map(lead => (
          <div key={lead.id} onClick={() => toggle(lead.id)} style={{ padding: '12px 16px', marginBottom: 6, background: selected.has(lead.id) ? 'rgba(109,138,64,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected.has(lead.id) ? 'rgba(109,138,64,0.35)' : 'var(--border)'}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} onClick={e => e.stopPropagation()} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{lead.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{lead.category} · {lead.email || 'no email'}</div>
            </div>
            <TierTag tier={lead.tier} />
            <ScoreRing score={lead.score} />
            <button onClick={(e) => { e.stopPropagation(); removeFromQueue(lead.id) }} title="Remove from queue (stays in Pipeline)"
              style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>✕</button>
          </div>
        ))
      )}
    </div>
  )
}

export { ApprovalTab }
