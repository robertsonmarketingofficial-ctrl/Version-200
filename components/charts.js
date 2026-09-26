import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const TOOLTIP_STYLE = { background: '#111a0e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f4ed', fontSize: 12 }
const CHART_COLORS = ['#6d8a40','#afc28a','#ef4444','#f97316','#3b82f6','#a855f7']

export function StageBarChart({ data }) {
  if (!data || data.length === 0) return <p style={{ color: '#6b7280', fontSize: 13 }}>No data yet — add leads to your pipeline.</p>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 50 }}>
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" fill="#6d8a40" radius={[4,4,0,0]} name="Leads" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TierPieChart({ data }) {
  if (!data || data.length === 0) return <p style={{ color: '#6b7280', fontSize: 13 }}>No data yet.</p>
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
          {data.map((e, i) => <Cell key={i} fill={e.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function WebsitePieChart({ data }) {
  if (!data || data.length === 0) return <p style={{ color: '#6b7280', fontSize: 13 }}>No data yet.</p>
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" fontSize={11}>
          {data.map((e, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca88e' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function ScoreBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" fill="#afc28a" radius={[4,4,0,0]} name="Leads" />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ActivityBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca88e' }} />
        <Bar dataKey="calls" fill="#6d8a40" radius={[3,3,0,0]} name="Calls" />
        <Bar dataKey="emails" fill="#afc28a" radius={[3,3,0,0]} name="Emails" />
      </BarChart>
    </ResponsiveContainer>
  )
}
