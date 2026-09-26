# Robertson Marketing CRM (Version 200)

Next.js CRM: lead finder (Google Places), pipeline, Approval Queue, AFK Mode,
follow-ups, SMS (Twilio), AI outreach (Gemini), analytics and more. Includes
every feature through v39 (v37 pre-flight checks, v38 account picker and clean
cap roll-over, v39 rolling 24h limits and permanent contact history), plus the
email fixes below.

## Email setup (Gmail SMTP)

Email goes out through Gmail SMTP using **App Passwords**. It does **not** use
Resend or Postgres (older setup notes said it did; they were wrong).

1. On each Gmail account, turn on **2-Step Verification**.
2. Create an App Password at <https://myaccount.google.com/apppasswords>
   (16 letters; spaces are fine, they are stripped).
3. In Vercel → Project → Settings → Environment Variables, add:

   | Variable | Example |
   |---|---|
   | `GMAIL_USERS` | `one@gmail.com,two@gmail.com` |
   | `GMAIL_APP_PASSWORDS` | `abcd efgh ijkl mnop,qrst uvwx yzab cdef` (same order) |

   For a single account you can use `GMAIL_USER` + `GMAIL_APP_PASSWORD` instead.
4. **Redeploy** (env var changes only apply to new deployments).
5. Open the app → **Settings & Debug** → **Test Gmail Login**, then
   **Send Test Email** to yourself.

Optional variables:

| Variable | Purpose |
|---|---|
| `EMAIL_FROM_NAME` | Display name (default `Callum @ Robertson Marketing`) |
| `EMAIL_REPLY_TO` | Reply-To address |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | Use a non-Gmail SMTP server |

## Other keys

`GOOGLE_PLACES_API_KEY`, `GEMINI_API_KEY`, and for SMS `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`. Check them in Settings → Test API Keys.

## Development

```
npm install
npm run dev     # http://localhost:3000
npm test        # end-to-end email tests against a local SMTP server
npm run build
```

Requires Node 20+ (nodemailer 10).
