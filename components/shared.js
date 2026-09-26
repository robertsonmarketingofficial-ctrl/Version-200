import { useState } from 'react'

export function Spinner({ size = 18 }) {
  return <span className="spinner" style={{ width: size, height: size }} />
}

export function TierTag({ tier }) {
  return <span className={`tag tag-${tier?.toLowerCase() || 'cold'}`}>{tier || 'Cold'}</span>
}

export function ScoreRing({ score }) {
  const color = score >= 75 ? '#ef4444' : score >= 50 ? '#f97316' : '#6b7280'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
      <span style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
      <span style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>score</span>
    </div>
  )
}

export function CopyBtn({ text, label = 'Copy', size = 'sm' }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className={`btn btn-ghost btn-${size}`}
      style={{ minWidth: 60 }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: wide ? 860 : 700 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toast({ msg }) {
  if (!msg) return null
  return <div className="toast-msg">{msg}</div>
}

export function EmptyState({ icon, title, sub, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>{icon}</div>
      <h3 style={{ color: 'var(--text)', fontSize: 17, fontWeight: 600, margin: '0 0 8px' }}>{title}</h3>
      <p style={{ color: 'var(--text3)', fontSize: 14, margin: '0 0 20px' }}>{sub}</p>
      {action && <button className="btn btn-primary" onClick={onAction}>{action}</button>}
    </div>
  )
}

export const CATEGORIES = [
  'Dentist','Plumber','Electrician','Roofer','Accountant','Lawyer','Real estate agent',
  'Landscaper','Painter','Mechanic','Gym','Personal trainer','Physiotherapist',
  'Chiropractor','Optometrist','Restaurant','Cafe','Bakery','Hair salon','Barber',
  'Nail salon','Massage therapist','Cleaning service','Pest control','Fencing contractor',
  'Concreter','Builder','Architect','Interior designer','Photographer','Videographer',
  'Marketing agency','Graphic designer','IT support','Web designer','Financial advisor',
  'Mortgage broker','Insurance broker','Travel agent','Event planner','Florist',
  'Vet','Childcare','Tutoring','Music teacher','Driving instructor','Pool installer',
  'Solar installer','Security installer','Locksmith','Tiler'
]

export const STAGES = ['New','Contacted','Replied','Meeting booked','Proposal sent','Closed','Not interested']

export function useToast() {
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }
  return [toast, showToast]
}

export function parseEmails(text) {
  const e1 = text.match(/---EMAIL1---([\s\S]*?)---EMAIL2---/)
  const e2 = text.match(/---EMAIL2---([\s\S]*?)---END---/)
  const parse = (raw) => {
    if (!raw) return { subject: '', body: '' }
    const lines = raw.trim().split('\n')
    const si = lines.findIndex(l => l.startsWith('Subject:'))
    const subject = si >= 0 ? lines[si].replace('Subject:', '').trim() : ''
    const body = lines.slice(si + 1).join('\n').trim()
    return { subject, body }
  }
  return { email1: parse(e1?.[1]), email2: parse(e2?.[1]) }
}

export async function callAI(type, payload) {
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload })
    })
    if (!res.ok) throw new Error('API error ' + res.status)
    return res.json()
  } catch (err) {
    console.error('callAI error:', err)
    return { error: err.message, result: '' }
  }
}
