import { useState, useEffect, useMemo } from 'react'
import { Spinner, TierTag, ScoreRing, CopyBtn, Modal, EmptyState, CATEGORIES, STAGES, parseEmails, callAI } from '../shared'
import { PageHeader, InfoItem, WebsiteStrengthBar, ScoreBar } from './helpers'
import { ChartsLoader } from './AnalyticsTab'

function PerformanceTab({ pipeline, appointments, performance, savePerformance, analyticsOverrides, saveAnalyticsOverrides }) {
  const closed = pipeline.filter(p=>p.stage==='Closed').length
  const contacted = pipeline.filter(p=>p.stage!=='New').length
  const meetings = appointments.filter(a=>['In-person meeting','Video call','Demo'].includes(a.type)).length
  const convRate = pipeline.length>0?((closed/pipeline.length)*100).toFixed(1):0
  const update = (field,val) => savePerformance({...performance,[field]:Math.max(0,Number(val)||0)})
  const [editRev,setEditRev] = useState(false)
  const [customRev,setCustomRev] = useState('')

  // FIX: useMemo prevents re-randomising on every render
  const weeklyData = useMemo(()=>[
    {day:'Mon',calls:Math.floor(Math.random()*8+2),emails:Math.floor(Math.random()*10+3)},
    {day:'Tue',calls:Math.floor(Math.random()*8+2),emails:Math.floor(Math.random()*10+3)},
    {day:'Wed',calls:Math.floor(Math.random()*8+2),emails:Math.floor(Math.random()*10+3)},
    {day:'Thu',calls:Math.floor(Math.random()*8+2),emails:Math.floor(Math.random()*10+3)},
    {day:'Fri',calls:Math.floor(Math.random()*8+2),emails:Math.floor(Math.random()*10+3)},
  ],[])

  return (
    <div>
      <PageHeader title="Sales Performance" sub="Your personal metrics and revenue projections" />
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:24}}>
        {[
          {l:'Leads in Pipeline',v:pipeline.length},{l:'Contacted',v:contacted},{l:'Meetings Held',v:meetings},
          {l:'Deals Closed',v:closed},{l:'Conversion Rate',v:convRate+'%'},
          {l:'Est. Revenue',v:analyticsOverrides['perf_revenue']||`$${(closed*1500).toLocaleString()}`}
        ].map((s,i)=>(
          <div key={s.l} className="stat-card" style={{cursor:i===5?'pointer':'default'}} onClick={()=>i===5&&setEditRev(true)}>
            <div className="stat-label">{s.l}</div><div className="stat-val">{s.v}</div>
            {i===5&&<div className="stat-sub">Click to edit</div>}
          </div>
        ))}
      </div>
      {editRev&&(
        <div className="card card-p" style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:8}}>Set custom revenue figure</div>
          <div style={{display:'flex',gap:8}}>
            <input value={customRev} onChange={e=>setCustomRev(e.target.value)} placeholder="e.g. $12,500" style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13}}/>
            <button onClick={()=>{saveAnalyticsOverrides({...analyticsOverrides,perf_revenue:customRev});setEditRev(false)}} className="btn btn-primary btn-sm">Save</button>
            <button onClick={()=>{const u={...analyticsOverrides};delete u.perf_revenue;saveAnalyticsOverrides(u);setEditRev(false)}} className="btn btn-ghost btn-sm">Reset</button>
          </div>
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        <div className="card card-p">
          <div className="section-header">Manual Activity Tracker</div>
          {[{label:'Cold calls made',field:'calls'},{label:'Emails sent',field:'emails'},{label:'Meetings booked',field:'meetings'},{label:'Deals closed',field:'closed'}].map(({label,field})=>(
            <div key={field} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <label style={{fontSize:13,color:'var(--text2)'}}>{label}</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>update(field,(performance[field]||0)-1)} style={{width:28,height:28,borderRadius:6,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--text)',cursor:'pointer',fontSize:16}}>−</button>
                <span style={{fontSize:16,fontWeight:700,color:'var(--olive2)',minWidth:32,textAlign:'center'}}>{performance[field]||0}</span>
                <button onClick={()=>update(field,(performance[field]||0)+1)} style={{width:28,height:28,borderRadius:6,background:'rgba(109,138,64,0.15)',border:'1px solid rgba(109,138,64,0.3)',color:'var(--olive2)',cursor:'pointer',fontSize:16}}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="card card-p">
          <div className="section-header">Revenue Projection</div>
          {[{service:'Website build ($1,500)',val:closed*1500},{service:'Hosting ($100/mo)',val:closed*100},{service:'Local SEO ($250/mo)',val:closed*250},{service:'Meta Ads ($400/mo)',val:closed*400}].map(r=>(
            <div key={r.service} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
              <span style={{color:'var(--text2)'}}>{r.service}</span><span style={{color:'var(--olive2)',fontWeight:600}}>${r.val.toLocaleString()}</span>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontSize:14,fontWeight:700}}>
            <span style={{color:'var(--text)'}}>Total (all upsold)</span><span style={{color:'var(--olive)'}}>${(closed*2250).toLocaleString()}/mo</span>
          </div>
          <div style={{background:'rgba(109,138,64,0.08)',border:'1px solid rgba(109,138,64,0.15)',borderRadius:8,padding:'10px 12px',fontSize:12,color:'var(--olive2)'}}>🎯 5 retainer clients = $52,500/year recurring</div>
        </div>
      </div>
      <div className="card card-p">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div className="section-header" style={{margin:0}}>Simulated Weekly Activity</div>
          <span style={{fontSize:11,color:'var(--text3)'}}>Example data</span>
        </div>
        <ChartsLoader type="activity" data={weeklyData}/>
      </div>
    </div>
  )
}

// ═══ TRAINING ═══
const MODULES = [
  {num:1,title:'Sales Mindset',content:`The foundation of everything.\n\nKey principles:\n• Rejection is data, not failure. Every "no" tells you something.\n• You are solving a real problem. Most local businesses genuinely need better marketing.\n• Confidence comes from preparation, not personality.\n• Sales is a skill that is learned, not a talent you're born with.\n\nMindset reframe: You're not "selling" — you're offering a business a genuine opportunity to get more customers. If they say no, that's their loss.\n\nDaily habit: Before any outreach session, remind yourself: "I'm here to help businesses grow. Some will see it, some won't. That's fine."`},
  {num:2,title:'Understanding Tradies & Local Business',content:`Who you're selling to matters more than what you're selling.\n\nLocal business owners (especially tradies) are:\n• Time-poor — they're on tools, not on screens\n• Skeptical of salespeople — they've been burned before\n• Results-focused — they want more calls, more jobs\n• Relationship-driven — they buy from people they trust\n\nWhat they actually want:\n• More enquiries (not "a website")\n• To look professional to new customers\n• To beat the competitor down the road\n• To stop relying only on word-of-mouth\n\nSell the outcome, not the product. Don't say "I'll build you a website." Say "I'll help you show up when someone in [suburb] searches for [trade]."`},
  {num:3,title:'Building Your Offer',content:`Your core offer needs to be simple, clear, and compelling.\n\nStarter offer (easy yes):\n• Professional website for $1,500 one-off\n• Hosting + maintenance for $100/month\n• Guarantee: live within 2 weeks\n\nUpsell path:\nWebsite → Local SEO ($250/mo) → Meta Ads ($400/mo) → Full retainer\n\nDemo sites: Build 2-3 demo sites for different trades before you start outreach. When you find a lead, say "I built a demo for a plumber last week — want to see it?" This is incredibly powerful.`},
  {num:4,title:'Prospecting & Lead Generation',content:`Use Robertson Marketing to find leads automatically.\n\nBest categories to start with:\n• Tradies (plumbers, electricians, roofers, painters) — high value, low digital sophistication\n• Health (dentists, physios, chiros) — high income, care about reputation\n• Hospitality (cafes, restaurants) — visible, easy to research\n\nScoring your leads:\n• No website = hottest opportunity\n• Social-only (Facebook page) = very strong lead\n• Wix/Squarespace = solid opportunity\n• Custom website = harder pitch, focus elsewhere\n\nTarget: Find 30 new leads per week minimum.`},
  {num:5,title:'Pre-Approach Research',content:`Before you contact any lead, spend 3-5 minutes researching them.\n\nCheck:\n1. Google their business name — what comes up?\n2. Do they have a website? What does it look like on mobile?\n3. How are their Google reviews? How many?\n4. Are they on Facebook/Instagram? When did they last post?\n5. Who is the owner? (Often on their website or LinkedIn)\n\nUse Robertson Marketing's AI Researcher to speed this up.\n\nConversation openers: "I noticed you've got 47 great reviews but no website — that's a lot of social proof going to waste."`},
  {num:6,title:'Cold Calling',content:`The fastest way to get results. Most people avoid it — less competition for you.\n\nScript:\n"Hey [Name], my name's Callum, I'm a web designer based in Adelaide. I was looking at your Google listing and noticed you've got [X reviews / no website] — I've been helping tradies in the area get a proper online presence. Is that something you've thought about at all?"\n\nHandle the first objection:\n"Not interested" → "No worries. Can I ask — is it because timing isn't right, or you're happy with where things are online?"\n\nKey: Your goal on a cold call is NOT to sell. It's to book a conversation.`},
  {num:7,title:'Walk-In Approach',content:`Walking into a business is one of the most underrated tactics. Almost no one does it.\n\nWhen to use it:\n• Local tradies with a physical shopfront or yard\n• Cafes, restaurants, retail shops\n• Any business you drive past regularly\n\nScript:\n"Hey, is the owner around? ... Hi [Name], I'm Callum, I do web design for local businesses. I was driving past and noticed you didn't have a website listed on Google — I thought I'd pop in. Do you have 2 minutes?"\n\nPro tip: Show them their Google listing on your phone. Then show them a competitor's website. The contrast does the selling for you.`},
  {num:8,title:'Cold Email & DM',content:`Email and DMs work best as follow-up to cold calling.\n\nEmail principles:\n• Subject line is everything — be specific\n• First line should reference something about THEIR business\n• Keep it under 150 words\n• One clear call to action\n• Don't attach anything in the first email\n\nDM (Instagram/Facebook):\n"Hey [Name] — love what you're doing with [X]. I noticed you don't have a website though — I build sites for local businesses and thought I'd reach out. Would you be open to a quick chat?"\n\nUse Robertson Marketing to generate personalised email and SMS drafts automatically.`},
  {num:9,title:'The Discovery Meeting',content:`When you get a meeting, your job is to listen, not pitch.\n\n5-phase structure:\n1. Build rapport (5 min)\n2. Identify pain (10 min) — "Where do most of your customers come from right now?"\n3. Vision (5 min) — "If we could get you showing up when someone in [suburb] searches for [trade], what would that be worth to you?"\n4. Present (10 min) — show your demo\n5. Close (5 min) — ask for the sale\n\nGolden rule: Let them talk 70% of the time. The more they talk, the more they sell themselves.`},
  {num:10,title:'Presenting the Demo',content:`The demo is your most powerful sales tool. Done right, it closes deals on the spot.\n\nHow to present it:\n1. Hand them your phone\n2. Let them scroll in silence for 30 seconds\n3. Ask: "What do you think?"\n4. Then: "Imagine your customers seeing this when they search for [trade] in [suburb]"\n\nUse Robertson Marketing's Lovable prompt generator to build these demos faster.`},
  {num:11,title:'Objection Handling',content:`Every objection is a question in disguise.\n\n"I'll think about it"\n→ "Totally fair. What specifically would you need to feel confident moving forward?"\n\n"It's too expensive"\n→ "I get that. If this brought you even 2 extra jobs a month, would that cover it?"\n\n"I already have someone doing my marketing"\n→ "Great — are you happy with the results you're getting from them?"\n\n"I don't need a website, I get all my work through referrals"\n→ "That's amazing — the website just makes sure that reputation is working for you 24/7."\n\n"Let me talk to my partner"\n→ "Of course. Would it help if I put together a quick summary you could show them?"`},
  {num:12,title:'Closing Techniques',content:`Closing is just asking clearly and confidently.\n\nThe Assumptive Close:\n"So shall we get started this week? I can have a draft ready in 5 days."\n\nThe Choice Close:\n"Would you prefer to do the full package today, or start with just the website?"\n\nThe Urgency Close (use sparingly):\n"I've actually got another [trade] in your area I'm speaking to this week — I wanted to come to you first."\n\nThe Summary Close:\n"So we've agreed on the website for $1,500 and $100/month after that, live within 2 weeks. Are you happy to get started?"\n\nRule: After you ask the closing question, stop talking. The first person to speak loses.`},
  {num:13,title:'Pricing & Negotiation',content:`Don't apologise for your prices. Confidence in pricing = confidence in your value.\n\nPricing anchoring: Always present your highest package first.\n\nWhen they push back on price:\n• Ask "What were you thinking?" — sometimes they'll name a number higher than your discount\n• Offer to remove something rather than discount: "I could do the site without the contact form for $1,200 — but I wouldn't recommend it"\n• Offer a payment split: "$750 now, $750 on delivery"\n\nNever go below your floor price.`},
  {num:14,title:'Follow-Up & Referrals',content:`Most sales happen on follow-up. Most salespeople give up after one contact.\n\nFollow-up timeline:\n• Day 0 (within 1 hour): Thank you + demo link\n• Day 4: Check in\n• Day 9: Value add — share a relevant stat or competitor insight\n• Day 18: Break-up message — "I don't want to keep bothering you..."\n\nThe break-up message often generates a reply.\n\nReferrals: Ask at the moment of highest satisfaction — when they see their finished website live for the first time.\n\nRevenue goal: 5 full retainer clients = $52,500/year recurring.`},
]

function TrainingTab() {
  const [active, setActive] = useState(0)
  const [completed, setCompleted] = useState(()=>{ try{return JSON.parse(localStorage.getItem('rmv2_training')||'[]')}catch{return[]} })
  const mod = MODULES[active]
  const markDone = () => {
    const updated = completed.includes(active)?completed:[...completed,active]
    setCompleted(updated); try{localStorage.setItem('rmv2_training',JSON.stringify(updated))}catch{}
    if (active<MODULES.length-1) setActive(active+1)
  }
  return (
    <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:20,minHeight:'80vh'}}>
      <div className="card" style={{padding:'16px 0',position:'sticky',top:20,maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{padding:'0 16px 12px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--olive)',marginBottom:4}}>SALES TRAINING</div>
          <div style={{height:4,background:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',background:'var(--olive)',borderRadius:2,width:`${(completed.length/MODULES.length)*100}%`,transition:'width 0.4s'}}/></div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{completed.length}/{MODULES.length} modules complete</div>
        </div>
        {MODULES.map((m,i)=>(
          <button key={i} onClick={()=>setActive(i)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 16px',background:active===i?'rgba(109,138,64,0.12)':'transparent',border:'none',borderLeft:`3px solid ${active===i?'var(--olive)':'transparent'}`,color:active===i?'var(--olive2)':completed.includes(i)?'var(--text3)':'var(--text2)',cursor:'pointer',textAlign:'left',fontSize:12,fontWeight:active===i?600:400}}>
            <span style={{width:20,height:20,borderRadius:'50%',background:completed.includes(i)?'var(--olive)':active===i?'rgba(109,138,64,0.2)':'rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:completed.includes(i)?'#fff':'var(--text3)',flexShrink:0}}>
              {completed.includes(i)?'✓':m.num}
            </span>
            <span style={{lineHeight:1.3}}>{m.title}</span>
          </button>
        ))}
      </div>
      <div className="card card-p fade-up">
        <div style={{fontSize:11,color:'var(--olive)',fontWeight:600,marginBottom:6}}>MODULE {mod.num} OF {MODULES.length}</div>
        <h1 style={{fontSize:24,fontWeight:800,color:'var(--text)',margin:'0 0 20px',letterSpacing:'-0.02em'}}>{mod.title}</h1>
        <div style={{fontSize:14,color:'var(--text2)',lineHeight:1.85,whiteSpace:'pre-wrap',borderLeft:'3px solid rgba(109,138,64,0.25)',paddingLeft:16}}>{mod.content}</div>
        <div style={{marginTop:28,display:'flex',gap:10}}>
          {active>0&&<button onClick={()=>setActive(active-1)} className="btn btn-ghost">← Previous</button>}
          <button onClick={markDone} className="btn btn-primary">{active===MODULES.length-1?'🏆 Complete Course':'Mark Done & Next →'}</button>
        </div>
        {completed.length===MODULES.length&&(
          <div style={{marginTop:20,background:'rgba(109,138,64,0.1)',border:'1px solid rgba(109,138,64,0.25)',borderRadius:10,padding:'16px 18px',fontSize:14,color:'var(--olive2)',lineHeight:1.6}}>
            🏆 <strong>Course Complete!</strong> All 14 modules done. Now execute: 20 new prospects per week, 10 cold contacts, 3+ meetings. Review your metrics every Sunday.
          </div>
        )}
      </div>
    </div>
  )
}

// ═══ PAYMENTS ═══
function PaymentsTab() {
  return (
    <div>
      <PageHeader title="Payments" sub="Manage invoices and Stripe payments" />
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16,marginBottom:24}}>
        {[{icon:'💳',title:'Stripe Dashboard',desc:'View payments, manage subscriptions, and process refunds.',link:'https://dashboard.stripe.com',label:'Open Stripe →'},{icon:'📄',title:'Create Invoice',desc:'Send professional invoices through Stripe Invoicing.',link:'https://dashboard.stripe.com/invoices/create',label:'New Invoice →'},{icon:'🔗',title:'Payment Links',desc:'Create a no-code payment link to send to clients.',link:'https://dashboard.stripe.com/payment-links',label:'Create Link →'},{icon:'📊',title:'Stripe Reports',desc:'View revenue, payouts, and financial reports.',link:'https://dashboard.stripe.com/reports',label:'View Reports →'}].map(c=>(
          <div key={c.title} className="card card-p">
            <div style={{fontSize:28,marginBottom:10}}>{c.icon}</div>
            <h3 style={{fontSize:15,fontWeight:700,color:'var(--text)',margin:'0 0 6px'}}>{c.title}</h3>
            <p style={{fontSize:13,color:'var(--text3)',margin:'0 0 14px',lineHeight:1.5}}>{c.desc}</p>
            <a href={c.link} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" style={{textDecoration:'none'}}>{c.label}</a>
          </div>
        ))}
      </div>
      <div className="card card-p">
        <div className="section-header">Pricing Reference</div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Service</th><th>Price</th><th>Type</th><th>Annual per client</th></tr></thead>
            <tbody>
              {[['Website build','$1,500','One-off','$1,500'],['Hosting & maintenance','$100/mo','Monthly','$1,200'],['Local SEO','$250/mo','Monthly','$3,000'],['Meta Ads management','$400/mo','Monthly','$4,800'],['Full retainer (Year 1)','—','—','$10,500+']].map(([s,p,t,a])=>(
                <tr key={s}><td>{s}</td><td style={{color:'var(--olive2)',fontWeight:600}}>{p}</td><td style={{color:'var(--text3)'}}>{t}</td><td style={{color:'var(--olive)',fontWeight:700}}>{a}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{marginTop:14,background:'rgba(109,138,64,0.08)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'var(--olive2)'}}>🎯 5 clients on full retainers = $52,500/year recurring</div>
      </div>
    </div>
  )
}

export { PerformanceTab, TrainingTab, PaymentsTab }
