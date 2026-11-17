import { sql, getSettings } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { fmtDate, baseUrl } from '@/lib/util';
import { Head, Field } from '@/components/ui';
import { saveSettings, saveRate, addHoliday, deleteHoliday, addVicHolidays, runNow } from './actions';

export default async function Settings({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const me = (await getUser())!;
  const s = await getSettings();
  const [rates, hols, users] = await Promise.all([
    sql`select * from rate_cards order by id`,
    sql`select * from holidays where day >= current_date - 30 order by day`,
    sql`select id, name, role, email from users where role in ('admin','office') and active order by role, name`,
  ]);
  const admin = me.role === 'admin';
  const integ = [
    ['Email (quotes, invoices, reminders)', !!process.env.RESEND_API_KEY, 'Add RESEND_API_KEY + EMAIL_FROM in Vercel'],
    ['Card payment link on invoices', !!process.env.PAYMENT_LINK_URL, 'Add PAYMENT_LINK_URL (e.g. Stripe/Square payment link)'],
    ['Daily automations (cron)', !!process.env.CRON_SECRET, 'Add CRON_SECRET – runs daily via vercel.json'],
    ['Xero / MYOB sync', false, 'Phase 2 – use CSV export for now'],
    ['Payroll (pay runs, STP, super)', false, 'Phase 2 – use timesheet CSV export for now'],
    ['GPS tracking & live map', false, 'Phase 2 – needs a GPS provider account'],
    ['SMS notifications', false, 'Phase 2 – needs an SMS provider (e.g. Twilio, MessageMedia)'],
  ] as const;
  return (
    <>
      <Head title="Settings" sub={admin ? '' : 'Only admins can change settings.'}>
        <form action={runNow}><button className="btn sec">Run daily automations now</button></form>
      </Head>
      {sp.msg && <div className="alert green">{sp.msg}</div>}
      <div className="grid g2">
        <form action={saveSettings} className="card">
          <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
            <h2>Company</h2>
            <div className="row"><Field label="Company name" name="company_name" value={s.company_name} /><Field label="ABN" name="abn" value={s.abn} /></div>
            <div className="row"><Field label="Phone" name="phone" value={s.phone} /><Field label="Email" name="email" value={s.email} /></div>
            <Field label="Address" name="address" value={s.address} />
            <Field label="Depots (one per line)" name="depots" type="textarea" value={s.depots} />
            <Field label="Bank details (shown on invoices)" name="bank_details" type="textarea" value={s.bank_details} />
            <label style={{ display: 'flex', gap: 6, fontWeight: 500, marginBottom: 10 }}><input type="checkbox" name="gst_registered" defaultChecked={!!s.gst_registered} /> Registered for GST (adds 10%)</label>
            <h2 style={{ marginTop: 10 }}>Reminders & rules</h2>
            <div className="row">
              <Field label="Quote valid for (days)" name="quote_expiry_days" type="number" value={s.quote_expiry_days} />
              <Field label="Quote follow-up after (days)" name="quote_followup_days" value={s.quote_followup_days} />
            </div>
            <div className="row">
              <Field label="Default payment terms (days)" name="default_payment_terms" type="number" value={s.default_payment_terms} />
              <Field label="Invoice reminders (days overdue)" name="invoice_reminder_days" value={s.invoice_reminder_days} />
            </div>
            <div className="row">
              <Field label="Max shift (hrs)" name="max_shift_hours" type="number" value={s.max_shift_hours} />
              <Field label="Min rest between days (hrs)" name="min_rest_hours" type="number" value={s.min_rest_hours} />
              <Field label="Max 7-day hours" name="max_week_hours" type="number" value={s.max_week_hours} />
              <Field label="Alert expiries (days ahead)" name="alert_days" type="number" value={s.alert_days} />
            </div>
            <p className="small muted">Fatigue limits are a guide only – set them to match your accreditation and the Bus Safety Act obligations that apply to you.</p>
            <Field label="Expense categories (one per line)" name="expense_categories" type="textarea" value={s.expense_categories} />
            <h2 style={{ marginTop: 10 }}>Email templates</h2>
            <Field label="Quote email – {name} {number} {date} {link} {expiry} {company}" name="email_quote_template" type="textarea" value={s.email_quote_template} style={{ minHeight: 120 }} />
            <Field label="Invoice email – {name} {number} {total} {due} {link} {company}" name="email_invoice_template" type="textarea" value={s.email_invoice_template} style={{ minHeight: 120 }} />
            <button className="btn">Save settings</button>
          </fieldset>
        </form>
        <div>
          <div className="card" id="rates">
            <h2>Rate cards</h2>
            {[...rates, {}].map((r: any, i: number) => (
              <form key={r.id || 'new'} action={saveRate} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 8 }}>
                <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
                  {r.id && <input type="hidden" name="id" value={r.id} />}
                  {!r.id && <h3>Add rate card</h3>}
                  <div className="row"><Field label="Name" name="name" value={r.name} required />
                    <div className="f"><label>Class</label><select name="bus_class" defaultValue={r.bus_class || 'coach'}><option value="mini">mini</option><option value="midi">midi</option><option value="coach">coach</option></select></div></div>
                  <div className="row">
                    <Field label="$/km" name="per_km" type="number" step="0.01" value={r.per_km} />
                    <Field label="$/hour" name="per_hour" type="number" step="0.01" value={r.per_hour} />
                    <Field label="Min charge" name="min_charge" type="number" value={r.min_charge} />
                    <Field label="Weekend %" name="weekend_pct" type="number" value={r.weekend_pct ?? 15} />
                    <Field label="Holiday %" name="holiday_pct" type="number" value={r.holiday_pct ?? 25} />
                  </div>
                  <div className="actions"><label style={{ display: 'flex', gap: 5, fontWeight: 500 }}><input type="checkbox" name="active" defaultChecked={r.active ?? true} /> Active</label><button className="btn sm">{r.id ? 'Save' : 'Add'}</button></div>
                </fieldset>
              </form>
            ))}
          </div>
          <div className="card" id="holidays">
            <h2>Public holidays (for holiday loadings)</h2>
            {admin && <form action={addVicHolidays} style={{ marginBottom: 8 }}><button className="btn sm sec">Add Victorian holidays 2026–27</button></form>}
            <table><tbody>{hols.map((h: any) => <tr key={h.day}><td>{fmtDate(h.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td>{h.name}</td>
              <td>{admin && <form action={deleteHoliday}><input type="hidden" name="day" value={h.day} /><button className="btn sm sec">✕</button></form>}</td></tr>)}</tbody></table>
            {admin && <form action={addHoliday} className="row" style={{ marginTop: 8 }}><input type="date" name="day" required /><input name="name" placeholder="Name" /><button className="btn sm auto">Add</button></form>}
          </div>
          <div className="card">
            <h2>Users & permissions</h2>
            <p className="small muted"><b>Admin</b>: everything incl. settings, voids, deletes. <b>Office</b>: CRM, operations, HR, fleet, finance. <b>Driver</b>: driver app only (their own jobs).</p>
            <table><tbody>{users.map((u: any) => <tr key={u.id}><td><a href={`/staff/${u.id}`}>{u.name}</a></td><td>{u.role}</td><td className="small">{u.email}</td></tr>)}</tbody></table>
            <a className="btn sm sec" href="/staff/new">+ Add user</a>
          </div>
          <div className="card">
            <h2>Integrations</h2>
            <table><tbody>{integ.map(([n, on, how]) => <tr key={n}><td>{n}</td><td>{on ? <span className="b green">Connected</span> : <span className="b">Off</span>}</td><td className="small muted">{on ? '' : how}</td></tr>)}</tbody></table>
            <p className="small">Public enquiry form for your website: <a href="/enquire" target="_blank">{baseUrl()}/enquire</a></p>
          </div>
        </div>
      </div>
    </>
  );
}
