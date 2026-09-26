import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader } from './helpers'
import { getContactedCount, exportContacted, importContacted, clearContacted, getAccountCounts, recordSend } from '../sendTracker'
import { apiJSON } from '../api'
function SettingsTab({ pipeline, savePipeline, showToast }) {
  const [status, setStatus] = useState(null)
  const [testing, setTesting] = useState(false)
  const [contactedCount, setContactedCount] = useState(0)
  const [gmail, setGmail] = useState(null)
  const [gmailChecking, setGmailChecking] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const checkGmail = async () => {
    setGmailChecking(true); setGmail(null)
    const [cfg, verify] = await Promise.all([apiJSON('/api/email-capacity'), apiJSON('/api/email-verify')])
    setGmail({ cfg, verify })
    setGmailChecking(false)
  }

  const sendTestEmail = async () => {
    if (!testTo.trim()) { showToast?.('Enter an email address to send the test to'); return }
    setTestSending(true); setTestResult(null)
    const d = await apiJSON('/api/leads/send', {
      method: 'POST',
      body: {
        channel: 'email', counts: getAccountCounts(),
        leads: [{ id: 'settings-test', name: 'Test', email: testTo.trim(), category: 'test' }],
        subject: 'Robertson CRM test email',
        body: 'If you can read this, email sending from the CRM is working.\n\n— Robertson CRM',
      }
    })
    const r = d.results?.[0] || { status: 'failed', error: d.error || 'No result returned' }
    if (r.status === 'sent') recordSend(r.sentFrom)
    setTestResult(r)
    setTestSending(false)
  }

  useEffect(() => { setContactedCount(getContactedCount()) }, [])

  const backupContacted = () => {
    const blob = new Blob([JSON.stringify(exportContacted(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `robertson-contacted-history-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    showToast?.(`Backed up ${contactedCount} contacted addresses`)
  }

  const restoreContacted = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const total = importContacted(JSON.parse(reader.result))
        setContactedCount(total)
        showToast?.(`Contact history restored — ${total} addresses on file`)
      } catch (err) { showToast?.('Restore failed: ' + err.message) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const wipeContacted = () => {
    if (!confirm(`Clear all ${contactedCount} contacted addresses?\n\nThis removes the protection that stops the same business being emailed twice. Only do this if you genuinely want to be able to re-contact everyone.`)) return
    clearContacted()
    setContactedCount(0)
    showToast?.('Contact history cleared')
  }

  const backupPipeline = () => {
    const blob = new Blob([JSON.stringify(pipeline, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `robertson-pipeline-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    showToast?.(`Backed up ${pipeline.length} leads ✓`)
  }

  const restorePipeline = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const restored = JSON.parse(reader.result)
        if (!Array.isArray(restored)) throw new Error('File does not contain a valid pipeline backup')
        const existingIds = new Set(pipeline.map(l => l.id))
        const merged = [...pipeline, ...restored.filter(l => !existingIds.has(l.id))]
        savePipeline(merged)
        showToast?.(`Restored — added ${merged.length - pipeline.length} new leads (duplicates skipped)`)
      } catch (err) {
        showToast?.('Restore failed: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = '' // allow re-selecting the same file later
  }

  const testKeys = async () => {
    setTesting(true); setStatus(null)
    try {
      setStatus(await apiJSON('/api/test-keys'))
    } catch (e) {
      setStatus({ error: e.message })
    }
    setTesting(false)
  }

  const StatusBadge = ({ s }) => {
    if (!s) return null
    const map = {
      working:      { color: '#7a9e49', bg: 'rgba(122,158,73,0.12)', label: '✓ Working' },
      error:        { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  label: '✗ Error' },
      missing:      { color: '#6b7280', bg: 'rgba(107,114,128,0.12)',label: '— Not set' },
    }
    const { color, bg, label } = map[s.status] || map.error
    return <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: bg, color }}>{label}</span>
  }

  return (
    <div>
      <PageHeader title="Settings & Debug" sub="Test your API keys and diagnose AI issues" />

      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>✉ Email Sending (Gmail)</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Logs in to every configured Gmail account without sending anything, so a wrong App Password shows up here instead of halfway through a run.</div>
          </div>
          <button onClick={checkGmail} disabled={gmailChecking} className="btn btn-primary btn-sm">
            {gmailChecking ? <><Spinner size={12} /> Checking...</> : 'Test Gmail Login'}
          </button>
        </div>

        {gmail && (
          <div style={{ marginTop: 14, fontSize: 13 }}>
            {!gmail.cfg?.accountCount ? (
              <div style={{ padding: 12, borderRadius: 8, background: 'rgba(244,63,94,0.1)', color: '#f43f5e' }}>
                No Gmail accounts configured. In Vercel → Settings → Environment Variables add <b>GMAIL_USERS</b> and <b>GMAIL_APP_PASSWORDS</b> (comma-separated, same order), or <b>GMAIL_USER</b> + <b>GMAIL_APP_PASSWORD</b> for one account — then redeploy.
              </div>
            ) : (
              <>
                {(gmail.verify?.accounts || []).map((a, i) => (
                  <div key={a.user} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 100, fontSize: 12, fontWeight: 700, flexShrink: 0, background: a.ok ? 'rgba(122,158,73,0.12)' : 'rgba(244,63,94,0.12)', color: a.ok ? '#7a9e49' : '#f43f5e' }}>{a.ok ? '✓ Login OK' : '✗ Failed'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{a.user}</div>
                      {!a.ok && <div style={{ color: 'var(--text3)', fontSize: 12, wordBreak: 'break-word' }}>{a.error}</div>}
                      {gmail.verify.passwordLengths?.[i] !== undefined && gmail.verify.passwordLengths[i] !== 16 && (
                        <div style={{ color: '#eab308', fontSize: 12 }}>⚠ Password is {gmail.verify.passwordLengths[i]} characters — Gmail App Passwords are 16 letters.</div>
                      )}
                    </div>
                  </div>
                ))}
                {gmail.verify?.error && <div style={{ color: '#f43f5e' }}>{gmail.verify.error}</div>}
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="your@email.com" type="email" style={{ flex: 1, minWidth: 200, padding: '7px 10px', borderRadius: 8, fontSize: 13 }} />
          <button onClick={sendTestEmail} disabled={testSending} className="btn btn-ghost btn-sm">
            {testSending ? <><Spinner size={12} /> Sending...</> : 'Send Test Email'}
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 8, fontSize: 13, color: testResult.status === 'sent' ? '#7a9e49' : '#f43f5e', wordBreak: 'break-word' }}>
            {testResult.status === 'sent' ? `✓ Sent via ${testResult.sentFrom} — check the inbox (and spam folder).` : `✗ ${testResult.error || testResult.reason || testResult.status}`}
          </div>
        )}
      </div>

      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Contact History <span style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>({contactedCount} addresses)</span></div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Every address ever emailed is remembered permanently so the same business is never contacted twice across different sweeps. Back this up — losing it means duplicates.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={backupContacted} className="btn btn-primary btn-sm">⬇ Backup History</button>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              ⬆ Restore
              <input type="file" accept=".json" onChange={restoreContacted} style={{ display: 'none' }} />
            </label>
            <button onClick={wipeContacted} className="btn btn-danger btn-sm">Clear</button>
          </div>
        </div>
      </div>

      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Backup & Restore</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Your {pipeline?.length || 0} leads live only in this browser — back them up so a cleared cache or new device doesn't lose them.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={backupPipeline} className="btn btn-primary btn-sm">⬇ Backup Pipeline</button>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              ⬆ Restore from File
              <input type="file" accept=".json" onChange={restorePipeline} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </div>

      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>API Key Status</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Click to test whether your Gemini and Google Places keys are working correctly.</div>
          </div>
          <button onClick={testKeys} disabled={testing} className="btn btn-primary">{testing ? <Spinner size={14} /> : '🔍 Test Keys'}</button>
        </div>
        {status && (
          <div className="fade-up">
            {status.error && <div style={{ color: '#ef4444', fontSize: 13, padding: '10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>Error: {status.error}</div>}
            {status.gemini && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Gemini AI (for emails, research, SMS, proposals)</div>
                  {status.gemini.model && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Using model: {status.gemini.model}</div>}
                  {status.gemini.error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>{status.gemini.error}</div>}
                </div>
                <StatusBadge s={status.gemini} />
              </div>
            )}
            {status.places && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Google Places (for lead searching)</div>
                  {status.places.error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2 }}>{status.places.error}{status.places.details ? ` — ${status.places.details}` : ''}</div>}
                </div>
                <StatusBadge s={status.places} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card card-p" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>If AI isn't working</div>
        {[
          { n: '1', t: 'Check your Gemini key', d: 'Go to aistudio.google.com/apikey — make sure the key exists and hasn\'t been deleted. Generate a new one if needed.' },
          { n: '2', t: 'Add it to Vercel', d: 'Go to your Vercel project → Settings → Environment Variables. The key name must be exactly: GEMINI_API_KEY' },
          { n: '3', t: 'Redeploy after adding', d: 'Vercel requires a redeploy after adding environment variables. Go to Deployments → click the three dots → Redeploy.' },
          { n: '4', t: 'Check the key has no spaces', d: 'When pasting your key into Vercel, make sure there are no leading or trailing spaces.' },
        ].map(s => (
          <div key={s.n} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(109,138,64,0.15)', color: 'var(--olive)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</div>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{s.t}</div><div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{s.d}</div></div>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', marginRight: 8 }}>Get Gemini Key →</a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Open Vercel →</a>
        </div>
      </div>

      <div className="card card-p">
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Your environment</div>
        {[
          { l: 'App version', v: 'Robertson Marketing CRM v2' },
          { l: 'AI models tried', v: 'gemini-2.0-flash → gemini-1.5-flash-latest → gemini-1.5-flash' },
          { l: 'Data storage', v: 'Browser localStorage (stays in this browser)' },
          { l: 'Hosting', v: 'Vercel (free tier)' },
        ].map(r => (
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ color: 'var(--text3)' }}>{r.l}</span>
            <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
export { SettingsTab }
