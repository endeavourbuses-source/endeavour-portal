# Endeavour Buses – Operations Portal

One web app for the whole business: CRM → quotes → jobs → driver app → invoices, plus staff, fleet and finance.
Built with Next.js + Postgres and made to run on Vercel (the same setup as the Learnify portal).

---

## Put it online (about 15 minutes, no coding)

You need a free **GitHub** account and a **Vercel** account (sign in to Vercel with GitHub).

### 1. Put the code on GitHub
1. Go to github.com → **New repository** → name it `endeavour-portal` → **Private** → Create.
2. On the new repo page click **uploading an existing file**.
3. Unzip `endeavour-portal.zip` on your computer, then drag **everything inside the folder** into the upload box → **Commit changes**.

### 2. Create the project on Vercel
1. vercel.com → **Add New… → Project** → pick `endeavour-portal` → **Import**.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | any long random text (e.g. mash the keyboard for 40+ characters) |
   | `CRON_SECRET` | another long random text |

3. Click **Deploy**. (The first deploy may fail because there's no database yet. That's fine, it gets fixed in step 3.)

### 3. Add the database
1. In the Vercel project → **Storage** tab → **Create Database** → choose **Neon (Postgres)** → region **Sydney (syd1)** → Create → **Connect** to this project.
   This adds `DATABASE_URL` for you automatically.
2. Go to **Deployments** → on the latest one click **⋯ → Redeploy**.

### 4. First login
1. Open your site (e.g. `https://endeavour-portal.vercel.app`). It takes you to **Setup**.
2. Create the admin account (you or Idris). The database tables are created automatically.
3. Go to **Settings** and fill in the ABN, phone, address and bank details, then click **Add Victorian holidays**.
4. Check the **rate cards** ($/km, minimum charge, weekend % and holiday %).
5. Add your **buses** (Fleet → Add bus) and **drivers** (Staff → Add staff). Give each driver a 4–6 digit **PIN**.
6. Send drivers the link. On their phone they tap **Driver**, pick their name and enter their PIN. Tip: tell them to use *Add to Home Screen* so it works like an app.

### Optional extras (add in Vercel → Settings → Environment Variables, then redeploy)
| Name | What it does |
|---|---|
| `APP_URL` | Your site address, used in links inside emails (e.g. `https://portal.endeavourbuses.com.au`) |
| `RESEND_API_KEY` + `EMAIL_FROM` | Sends quotes, invoices and overdue reminders by email (free account at resend.com; verify your domain) |
| `PAYMENT_LINK_URL` | Adds a "Pay by card" button to invoices (e.g. a Stripe or Square payment link) |

Without email set up, everything still works. You copy the client link and send it yourself.

Custom domain: Vercel → Settings → Domains → add `portal.endeavourbuses.com.au`.

---

## How it fits together

**Sales / CRM**
- Enquiries come in from the office (*+ New enquiry*) or online from the public form at `/enquire` (put that link on your website).
- **Pipeline** board: enquiry → quoted → follow-up → won / lost. Lead source is tracked, and won/lost reasons feed the **Sales reports**.
- **Quotes** are calculated from a rate card: km × $/km, plus hours, extras such as tolls, the minimum charge, and automatic weekend or public-holiday loading. You can override the total. Quotes have versions, expiry dates and a deposit %.
- The client gets a link where they can view, print or save a PDF and **accept online**. Accepting turns the quote into a job automatically and raises a deposit invoice.
- Follow-up tasks are created automatically 3 and 7 days after a quote is sent with no reply (see **Follow-ups**).

**Operations**
- Job: pickup, drop-off, stops and times, passengers, special needs, driver notes and price.
- Status: scheduled → assigned → route approved → in progress → completed (or cancelled, with an optional fee that is invoiced automatically).
- **Calendar** by driver, by bus or by day. School runs and contracts are set up as **recurring** jobs (pick the weekdays and an end date).
- **Assign** a bus and driver as provisional or confirmed. Clash checks run automatically:
  - double-bookings
  - expired licence, WWCC, medical or DA accreditation
  - licence class too low for the bus
  - approved leave
  - fatigue (hours per day, rest between days, 7-day total)
  - not enough seats
  - service overdue, expired rego/insurance/inspection, or critical defects

  "Who's available?" lists everyone and every bus ranked by best fit. Blocks can be overridden, and the override is logged.
- **Route**: opens a suggested route in Google Maps. You edit the notes, then approve.
- **Subcontract** a job when the fleet is full.

**Driver app** (`/driver`, on their phone)
- The week's jobs and a "Seen & accepted" button.
- Pre-trip checklist. Any problem goes straight into the **defect queue**.
- Sign on with the start odometer, log breaks, report incidents, then sign off with the end odometer and client sign-off.
- Signing off completes the job, updates the bus odometer and drafts the invoice.
- Leave requests and "my hours".

**HR**
- Staff records, emergency contacts and employment type.
- Licence, WWCC, medical and DA expiries, with alerts 30 days ahead.
- Documents, training, inductions, performance notes and incidents (linked as Drive/Dropbox links).
- Leave requests, approvals, balances and a calendar.
- **Timesheets** built from sign on/off, with flags for weekends, long shifts, missed breaks and overtime, plus a CSV export for payroll.

**Fleet**
- Bus register and odometer history (driver and manual readings).
- Service due by km *or* date. An overdue bus is blocked from jobs.
- Rego, insurance and inspection expiries.
- Workshop log. Costs flow into expenses, and logging a service resets the counter.
- Defect queue and cost per km.

**Finance**
- When a job completes, its invoice is drafted automatically (any deposit invoiced is deducted). You check it and press **Approve & send**.
- Client invoice link with bank details and an optional card-payment button.
- Payments, part-payments, credit notes and client statements.
- Debtor aging. Automatic reminders go out at 7, 14 and 30 days overdue.
- Expenses tagged to a bus, a job or overhead, with recurring expenses (insurance, leases) and receipt links.
- **Profit reports** per job, client and bus, plus fleet utilisation.
- CSV exports for Xero/MYOB.

**Dashboard**
- Today and this week, unassigned jobs and buses out.
- Alerts: services due, expiring licences and rego, overdue invoices, stale quotes, leave waiting for approval, and tasks due.
- Sales, revenue, debtors and staff hours.

**Admin**
- Roles:
  - **Admin**: everything
  - **Office**: everything except settings, voids and deletes
  - **Driver**: their own jobs only
- Company details, depots, rate cards, holidays, reminder schedules, fatigue limits, email templates and the integrations panel.
- **Audit log** of every change.

Daily automations run on Vercel at about 8am Melbourne time. They expire old quotes and create follow-ups, send overdue reminders and add recurring expenses. You can also run them any time from Settings.

---

## Phase 2 (needs your accounts with these providers)
- **Live GPS map, trip replay, ETA sharing, geofence alerts.** Needs a telematics provider with an API (e.g. Teletrac Navman, MiX, EROAD, or a cheap plug-in tracker).
- **Automatic routing with maps.** Needs a Google Maps Platform API key.
- **Xero or MYOB two-way sync.** Needs a Xero/MYOB developer app connected to your file.
- **Payroll** (pay runs, STP, super, payslips). Connect to Employment Hero/KeyPay or Xero Payroll.
- **SMS notifications** to drivers and clients (Twilio, MessageMedia).
- **Fuel card import** (e.g. a Shell/BP/Ampol CSV format).
- **Document uploads** stored in the app instead of links (Vercel Blob).

---

## Running it on a computer (for a developer)
```
npm install
cp .env.example .env.local   # set DATABASE_URL to any Postgres
npm run dev                  # http://localhost:3000
```
