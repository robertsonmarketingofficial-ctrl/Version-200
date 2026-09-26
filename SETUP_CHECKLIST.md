# Approval Queue + Real Outreach — Setup Checklist

## What's already built (in this branch/folder)
- `sql/001_leads_and_outreach.sql` — DB schema
- `lib/db.js` — DB helper functions
- `pages/api/leads/sync.js` — pushes your localStorage pipeline into the server DB
- `pages/api/leads/unreviewed.js` — feeds the Approval tab
- `pages/api/leads/approve.js` — batch send via Resend (email) + Twilio (SMS)
- `pages/api/leads/sms-reply.js` — Twilio webhook, marks leads RESPONDED
- `components/tabs/ApprovalTab.js` — new "Approval Queue" tab, wired into the sidebar

## Steps once you have the 3 accounts

### 1. Database
- Vercel dashboard → your project → Storage tab → Create Database → Postgres
- This automatically adds `POSTGRES_URL` (and related) env vars to your project — no manual copy-paste needed
- Run the SQL in `sql/001_leads_and_outreach.sql` once, via the Query tab in Vercel's Postgres dashboard

### 2. Resend (email)
- Sign up at resend.com, verify a sending domain (or use their test domain to start)
- Vercel → Project Settings → Environment Variables → add `RESEND_API_KEY`
- In `pages/api/leads/approve.js`, replace `callum@YOURDOMAIN.com` with your real verified sending address

### 3. Twilio (SMS)
- Sign up, buy an AU number
- Vercel → Environment Variables → add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- In Twilio Console → Phone Numbers → your number → set "A MESSAGE COMES IN" webhook to:
  `https://<your-vercel-domain>/api/leads/sms-reply`

### 4. Install + deploy
```
npm install
git add .
git commit -m "Add approval queue + real email/SMS outreach"
git push
```
Vercel auto-deploys on push.

### 5. Test before real use
- Add yourself as a test lead in the Pipeline tab (your own email/phone)
- Go to the new "Approval Queue" tab, select yourself, hit Approve & Send
- Confirm you actually receive the email/SMS
- Text back "test" and confirm the lead flips to responded (check via `/api/leads/unreviewed` — it should disappear once responded, or query the DB directly)

## Known limitations of this first version
- No unsubscribe/suppression list yet — you mentioned legal is sorted, but flagging: repeat opt-outs aren't automatically blocked from future sends yet, worth adding once volume ramps up
- Approval queue shows ALL unreviewed leads, not filtered by a rating threshold — matches what you said ("a bad lead getting an email is better than 0")
- Email "from" address needs a real verified domain in Resend before it'll send to non-test addresses
