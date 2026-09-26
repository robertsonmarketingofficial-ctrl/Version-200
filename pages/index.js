import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Index() {
  const router = useRouter()
  useEffect(() => { router.replace('/app') }, [])
  return (
    <>
      <Head><title>Robertson Marketing CRM</title></Head>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0f0a', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg,#6d8a40,#afc28a)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, color: '#0a0f0a' }}>R</div>
        <div style={{ color: '#afc28a', fontSize: 14, fontWeight: 500 }}>Loading Robertson Marketing...</div>
        <div style={{ width: 24, height: 24, border: '2px solid rgba(109,138,64,0.25)', borderTopColor: '#6d8a40', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  )
}
