import { sql, getSettings } from './db';
import { today, addDays, daysBetween, dow, timeToMin, hoursBetweenTimes, token, logActivity, baseUrl, fillTemplate, money, fmtDateLong } from './util';

/* ---------------- Pricing ---------------- */
export type QuoteLine = { description: string; qty: number; unit: number; amount: number };

export async function calcQuote(opts: { rate_card_id: number; km: number; hours: number; trip_date?: string | null; extras?: QuoteLine[] }) {
  const [rc] = await sql`select * from rate_cards where id = ${opts.rate_card_id}`;
  const lines: QuoteLine[] = [];
  if (!rc) return { lines, subtotal: 0, gst: 0, total: 0, loading: null as string | null };
  if (opts.km > 0 && rc.per_km > 0) lines.push({ description: `${rc.name} – distance`, qty: opts.km, unit: rc.per_km, amount: round(opts.km * rc.per_km) });
  if (opts.hours > 0 && rc.per_hour > 0) lines.push({ description: `${rc.name} – time`, qty: opts.hours, unit: rc.per_hour, amount: round(opts.hours * rc.per_hour) });
  let base = lines.reduce((s, l) => s + l.amount, 0);
  if (base < rc.min_charge) {
    lines.push({ description: 'Minimum charge adjustment', qty: 1, unit: round(rc.min_charge - base), amount: round(rc.min_charge - base) });
    base = rc.min_charge;
  }
  let loading: string | null = null;
  if (opts.trip_date) {
    const [hol] = await sql`select name from holidays where day = ${opts.trip_date}`;
    const d = dow(opts.trip_date);
    if (hol && rc.holiday_pct > 0) {
      loading = `Public holiday loading (${hol.name || 'holiday'}) ${rc.holiday_pct}%`;
      lines.push({ description: loading, qty: 1, unit: round(base * rc.holiday_pct / 100), amount: round(base * rc.holiday_pct / 100) });
    } else if ((d === 0 || d === 6) && rc.weekend_pct > 0) {
      loading = `Weekend loading ${rc.weekend_pct}%`;
      lines.push({ description: loading, qty: 1, unit: round(base * rc.weekend_pct / 100), amount: round(base * rc.weekend_pct / 100) });
    }
  }
  for (const e of opts.extras || []) lines.push(e);
  return { ...totals(lines), lines, loading };
}

export function totals(lines: QuoteLine[], gstRegistered = true) {
  const subtotal = round(lines.reduce((s, l) => s + Number(l.amount || 0), 0));
  const gst = gstRegistered ? round(subtotal * 0.1) : 0;
  return { subtotal, gst, total: round(subtotal + gst) };
}
export const round = (n: number) => Math.round(n * 100) / 100;

/* ---------------- Assignment checks ---------------- */
export type Check = { level: 'block' | 'warn'; msg: string };

function overlaps(aS?: string, aE?: string, bS?: string, bE?: string) {
  const a1 = timeToMin(aS) ?? 0, a2 = timeToMin(aE) ?? 24 * 60, b1 = timeToMin(bS) ?? 0, b2 = timeToMin(bE) ?? 24 * 60;
  return a1 < b2 && b1 < a2;
}

export async function checkDriver(driverId: number, job: any): Promise<Check[]> {
  const out: Check[] = [];
  const s = await getSettings();
  const [d] = await sql`select * from users where id = ${driverId}`;
  if (!d) return [{ level: 'block', msg: 'Driver not found' }];
  if (!d.active) out.push({ level: 'block', msg: `${d.name} is inactive` });
  for (const [f, label] of [['licence_expiry', 'Licence'], ['medical_expiry', 'Medical'], ['wwcc_expiry', 'WWCC'], ['accreditation_expiry', 'DA accreditation']] as const) {
    if (d[f] && d[f] < job.date) out.push({ level: 'block', msg: `${label} expired ${d[f]}` });
    else if (!d[f] && (f === 'licence_expiry' || f === 'wwcc_expiry')) out.push({ level: 'warn', msg: `${label} expiry not recorded` });
  }
  const [lv] = await sql`select type from leave where user_id = ${driverId} and status = 'approved' and ${job.date} between start_date and end_date limit 1`;
  if (lv) out.push({ level: 'block', msg: `On approved ${lv.type} leave` });
  const [pl] = await sql`select type from leave where user_id = ${driverId} and status = 'pending' and ${job.date} between start_date and end_date limit 1`;
  if (pl) out.push({ level: 'warn', msg: `Has a pending leave request` });
  if (job.bus_id) {
    const [b] = await sql`select bus_class from buses where id = ${job.bus_id}`;
    if (b?.bus_class && d.licence_class && !licenceOk(d.licence_class, b.bus_class))
      out.push({ level: 'block', msg: `Licence class ${d.licence_class} may not cover a ${b.bus_class}` });
  }
  const same = await sql`select id, title, start_time, end_time from jobs where driver_id = ${driverId} and date = ${job.date}
    and status <> 'cancelled' and id <> ${job.id || 0}`;
  for (const j of same) if (overlaps(job.start_time, job.end_time, j.start_time, j.end_time))
    out.push({ level: 'block', msg: `Double-booked with job #${j.id} ${j.title || ''} (${j.start_time}–${j.end_time})` });
  const dayHours = same.reduce((h: number, j: any) => h + hoursBetweenTimes(j.start_time, j.end_time), 0) + hoursBetweenTimes(job.start_time, job.end_time);
  if (dayHours > Number(s.max_shift_hours)) out.push({ level: 'warn', msg: `Fatigue: ${dayHours.toFixed(1)}h rostered this day (limit ${s.max_shift_hours}h)` });
  // rest from previous day
  const [prev] = await sql`select max(end_time) as e from jobs where driver_id = ${driverId} and date = ${addDays(job.date, -1)} and status <> 'cancelled'`;
  if (prev?.e && job.start_time) {
    const rest = (24 * 60 - (timeToMin(prev.e) ?? 0) + (timeToMin(job.start_time) ?? 0)) / 60;
    if (rest < Number(s.min_rest_hours)) out.push({ level: 'warn', msg: `Fatigue: only ${rest.toFixed(1)}h rest since previous day` });
  }
  const wk = await sql`select start_time, end_time from jobs where driver_id = ${driverId} and status <> 'cancelled'
     and date between ${addDays(job.date, -6)} and ${job.date} and id <> ${job.id || 0}`;
  const wkH = wk.reduce((h: number, j: any) => h + hoursBetweenTimes(j.start_time, j.end_time), 0) + hoursBetweenTimes(job.start_time, job.end_time);
  if (wkH > Number(s.max_week_hours)) out.push({ level: 'warn', msg: `Fatigue: ${wkH.toFixed(1)}h in 7 days (limit ${s.max_week_hours}h)` });
  return out;
}

function licenceOk(lic: string, busClass: string) {
  const rank: Record<string, number> = { C: 1, LR: 2, MR: 3, HR: 4, HC: 5, MC: 6 };
  const need: Record<string, string> = { mini: 'LR', midi: 'MR', coach: 'HR' };
  const r = rank[lic.toUpperCase()], n = rank[need[busClass] || ''];
  if (!r || !n) return true;
  return r >= n;
}

export async function busServiceStatus(b: any) {
  const kmLeft = b.last_service_km != null && b.service_interval_km ? b.last_service_km + b.service_interval_km - b.odometer : null;
  const dueDate = b.last_service_date && b.service_interval_days ? addDays(b.last_service_date, b.service_interval_days) : null;
  const daysLeft = dueDate ? daysBetween(today(), dueDate) : null;
  const overdue = (kmLeft != null && kmLeft < 0) || (daysLeft != null && daysLeft < 0);
  const dueSoon = !overdue && ((kmLeft != null && kmLeft < 1000) || (daysLeft != null && daysLeft < 14));
  return { kmLeft, dueDate, daysLeft, overdue, dueSoon };
}

export async function checkBus(busId: number, job: any): Promise<Check[]> {
  const out: Check[] = [];
  const [b] = await sql`select * from buses where id = ${busId}`;
  if (!b) return [{ level: 'block', msg: 'Bus not found' }];
  if (!b.active) out.push({ level: 'block', msg: 'Bus is inactive' });
  if (job.passengers && b.seats && job.passengers > b.seats) out.push({ level: 'block', msg: `Only ${b.seats} seats for ${job.passengers} passengers` });
  const st = await busServiceStatus(b);
  if (st.overdue) out.push({ level: 'block', msg: `Service overdue${st.kmLeft != null && st.kmLeft < 0 ? ` by ${-st.kmLeft} km` : ''}${st.dueDate ? ` (due ${st.dueDate})` : ''}` });
  else if (st.dueSoon) out.push({ level: 'warn', msg: `Service due soon` });
  for (const [f, label] of [['rego_expiry', 'Registration'], ['insurance_expiry', 'Insurance'], ['inspection_expiry', 'Inspection/roadworthy']] as const)
    if (b[f] && b[f] < job.date) out.push({ level: 'block', msg: `${label} expired ${b[f]}` });
  const [crit] = await sql`select count(*)::int n from defects where bus_id = ${busId} and status = 'open' and severity = 'critical'`;
  if (crit.n > 0) out.push({ level: 'block', msg: `${crit.n} open critical defect(s)` });
  const [maj] = await sql`select count(*)::int n from defects where bus_id = ${busId} and status = 'open' and severity = 'major'`;
  if (maj.n > 0) out.push({ level: 'warn', msg: `${maj.n} open major defect(s)` });
  const same = await sql`select id, title, start_time, end_time from jobs where bus_id = ${busId} and date = ${job.date}
    and status <> 'cancelled' and id <> ${job.id || 0}`;
  for (const j of same) if (overlaps(job.start_time, job.end_time, j.start_time, j.end_time))
    out.push({ level: 'block', msg: `Bus already on job #${j.id} ${j.title || ''} (${j.start_time}–${j.end_time})` });
  return out;
}

export async function availability(job: any) {
  const drivers = await sql`select id, name from users where role = 'driver' and active order by name`;
  const buses = await sql`select id, fleet_no, rego, seats, bus_class from buses where active order by fleet_no`;
  const d = await Promise.all(drivers.map(async (x: any) => ({ ...x, checks: await checkDriver(x.id, job) })));
  const b = await Promise.all(buses.map(async (x: any) => ({ ...x, checks: await checkBus(x.id, job) })));
  const score = (c: Check[]) => c.filter((x) => x.level === 'block').length * 10 + c.filter((x) => x.level === 'warn').length;
  d.sort((a, b2) => score(a.checks) - score(b2.checks));
  b.sort((a, b2) => score(a.checks) - score(b2.checks) || (a.seats || 0) - (b2.seats || 0));
  return { drivers: d, buses: b };
}

/* ---------------- Quote → Job ---------------- */
export async function convertQuoteToJob(quoteId: number, userId: number | null) {
  const [q] = await sql`select * from quotes where id = ${quoteId}`;
  if (!q) throw new Error('Quote not found');
  if (q.job_id) return q.job_id;
  const [e] = q.enquiry_id ? await sql`select * from enquiries where id = ${q.enquiry_id}` : [null];
  const [job] = await sql`insert into jobs (client_id, quote_id, title, date, start_time, end_time, pickup, dropoff, passengers, notes, price)
    values (${q.client_id}, ${q.id}, ${e?.organisation || 'Charter'} , ${q.trip_date || today()}, ${q.start_time}, ${q.end_time},
      ${q.pickup}, ${q.dropoff}, ${q.passengers || 0}, ${e?.details || q.notes}, ${q.subtotal}) returning id`;
  await sql`update quotes set job_id = ${job.id}, status = 'accepted', accepted_at = coalesce(accepted_at, now()) where id = ${q.id}`;
  if (q.enquiry_id) await sql`update enquiries set status = 'won', updated_at = now() where id = ${q.enquiry_id}`;
  await logActivity('quote', q.id, `Converted to job #${job.id}`, userId);
  if (q.enquiry_id) await logActivity('enquiry', q.enquiry_id, `Won – job #${job.id} created`, userId);
  // deposit invoice
  if (Number(q.deposit_pct) > 0) {
    const amt = round((q.subtotal * q.deposit_pct) / 100);
    await createInvoice({ client_id: q.client_id, job_id: job.id, quote_id: q.id, lines: [{ description: `Deposit ${q.deposit_pct}% – quote Q${q.id}`, qty: 1, unit: amt, amount: amt }], status: 'sent', dueDays: 7 });
  }
  return job.id;
}

/* ---------------- Invoicing ---------------- */
export async function nextInvoiceNumber(kind = 'invoice') {
  const [r] = await sql`select count(*)::int n from invoices where kind = ${kind}`;
  return (kind === 'credit' ? 'CN-' : 'INV-') + String(1001 + r.n);
}

export async function createInvoice(o: { client_id: number | null; job_id?: number | null; quote_id?: number | null; lines: QuoteLine[]; status?: string; dueDays?: number; kind?: string; notes?: string }) {
  const s = await getSettings();
  const [c] = o.client_id ? await sql`select payment_terms_days from clients where id = ${o.client_id}` : [null];
  const terms = o.dueDays ?? c?.payment_terms_days ?? Number(s.default_payment_terms) ?? 14;
  const t = totals(o.lines, !!s.gst_registered);
  const number = await nextInvoiceNumber(o.kind || 'invoice');
  const [inv] = await sql`insert into invoices (number, kind, client_id, job_id, quote_id, issue_date, due_date, lines, subtotal, gst, total, status, token, notes, sent_at)
    values (${number}, ${o.kind || 'invoice'}, ${o.client_id}, ${o.job_id ?? null}, ${o.quote_id ?? null}, ${today()}, ${addDays(today(), terms)},
      ${sql.json(o.lines as any)}, ${t.subtotal}, ${t.gst}, ${t.total}, ${o.status || 'draft'}, ${token()}, ${o.notes || null},
      ${o.status === 'sent' ? new Date() : null}) returning *`;
  return inv;
}

/** Called when a job is marked complete: Finance takes over. */
export async function invoiceCompletedJob(jobId: number) {
  const [j] = await sql`select * from jobs where id = ${jobId}`;
  if (!j) return null;
  const [existing] = await sql`select * from invoices where job_id = ${jobId} and kind = 'invoice' and status <> 'void'
     and lines::text not like '%Deposit %'`;
  if (existing) return existing;
  const lines: QuoteLine[] = [];
  if (j.quote_id) {
    const [q] = await sql`select lines from quotes where id = ${j.quote_id}`;
    for (const l of q?.lines || []) lines.push(l);
  }
  if (!lines.length) lines.push({ description: `${j.title || 'Charter'} – ${j.pickup || ''} to ${j.dropoff || ''} (${j.date})`, qty: 1, unit: Number(j.price), amount: Number(j.price) });
  // deduct any deposit already invoiced for this job (the deposit invoice stays its own receivable)
  const deps = await sql`select number, subtotal from invoices where job_id = ${jobId} and kind = 'invoice' and status <> 'void' and lines::text like '%Deposit %'`;
  for (const d of deps) lines.push({ description: `Less deposit invoiced (${d.number})`, qty: 1, unit: -Number(d.subtotal), amount: -Number(d.subtotal) });
  const inv = await createInvoice({ client_id: j.client_id, job_id: j.id, lines, status: 'draft' });
  await logActivity('job', j.id, `Invoice ${inv.number} created automatically`);
  return inv;
}

export async function invoicePaid(invId: number) {
  const [r] = await sql`select coalesce(sum(amount),0)::numeric paid from payments where invoice_id = ${invId}`;
  return Number(r.paid);
}

export function invoiceState(inv: any, paid: number) {
  if (inv.status === 'void') return 'void';
  if (inv.status === 'draft') return 'draft';
  if (paid >= Number(inv.total) - 0.005) return 'paid';
  if (inv.due_date && inv.due_date < today()) return 'overdue';
  if (paid > 0) return 'partial';
  return 'sent';
}

/* ---------------- Email (optional, via Resend) ---------------- */
export async function sendEmail(to: string | null, subject: string, text: string): Promise<{ ok: boolean; info: string }> {
  if (!to) return { ok: false, info: 'No email address' };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, info: 'Email not configured (add RESEND_API_KEY) – copy the link manually' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Endeavour Buses <onboarding@resend.dev>', to: [to], subject, text }),
    });
    return r.ok ? { ok: true, info: `Emailed ${to}` } : { ok: false, info: `Email failed: ${await r.text()}` };
  } catch (e: any) {
    return { ok: false, info: `Email failed: ${e.message}` };
  }
}

export async function emailQuote(qid: number) {
  const s = await getSettings();
  const [q] = await sql`select q.*, e.contact_name, e.contact_email, c.email cemail, c.name cname from quotes q
    left join enquiries e on e.id = q.enquiry_id left join clients c on c.id = q.client_id where q.id = ${qid}`;
  const body = fillTemplate(s.email_quote_template, {
    name: q.contact_name || q.cname || 'there', number: `Q${q.id}${q.version > 1 ? '-v' + q.version : ''}`,
    date: fmtDateLong(q.trip_date), link: `${baseUrl()}/q/${q.token}`, expiry: fmtDateLong(q.expiry_date), company: s.company_name,
  });
  return sendEmail(q.contact_email || q.cemail, `Your quote from ${s.company_name}`, body);
}

export async function emailInvoice(iid: number) {
  const s = await getSettings();
  const [i] = await sql`select i.*, c.email, c.name from invoices i left join clients c on c.id = i.client_id where i.id = ${iid}`;
  const body = fillTemplate(s.email_invoice_template, {
    name: i.name || 'there', number: i.number, total: money(i.total), due: fmtDateLong(i.due_date),
    link: `${baseUrl()}/i/${i.token}`, company: s.company_name,
  });
  return sendEmail(i.email, `Invoice ${i.number} from ${s.company_name}`, body);
}

/* ---------------- Daily automations (cron) ---------------- */
export async function runAutomations() {
  const s = await getSettings();
  const t = today();
  const log: string[] = [];
  // 1. Expire quotes
  const exp = await sql`update quotes set status = 'expired' where status = 'sent' and expiry_date < ${t} returning id`;
  if (exp.length) log.push(`Expired ${exp.length} quote(s)`);
  // 2. Quote follow-up tasks (e.g. 3 and 7 days after sending)
  const fdays = String(s.quote_followup_days).split(',').map((x) => parseInt(x)).filter((x) => x > 0);
  const sent = await sql`select id, enquiry_id, sent_at from quotes where status = 'sent' and sent_at is not null`;
  for (const q of sent) {
    const age = daysBetween(new Date(q.sent_at).toISOString().slice(0, 10), t);
    for (const d of fdays) {
      if (age >= d) {
        const marker = `Follow up quote Q${q.id} (${d}-day)`;
        const [ex] = await sql`select id from activities where entity = 'quote' and entity_id = ${q.id} and text = ${marker}`;
        if (!ex) {
          await sql`insert into activities (entity, entity_id, kind, text, due_date) values ('quote', ${q.id}, 'task', ${marker}, ${t})`;
          if (q.enquiry_id) await sql`update enquiries set status = 'follow_up', updated_at = now() where id = ${q.enquiry_id} and status = 'quoted'`;
          log.push(marker);
        }
      }
    }
  }
  // 3. Overdue invoice reminders (7/14/30 days overdue)
  const rdays = String(s.invoice_reminder_days).split(',').map((x) => parseInt(x)).filter((x) => x > 0).sort((a, b) => a - b);
  const invs = await sql`select * from invoices where status = 'sent' and kind = 'invoice' and due_date < ${t}`;
  for (const i of invs) {
    if ((await invoicePaid(i.id)) >= Number(i.total) - 0.005) {
      await sql`update invoices set status = 'paid' where id = ${i.id}`;
      continue;
    }
    const over = daysBetween(i.due_date, t);
    const step = rdays.filter((d) => over >= d).pop();
    if (step && step > (i.last_reminder_days || 0)) {
      const r = await emailInvoice(i.id);
      await sql`update invoices set last_reminder_days = ${step} where id = ${i.id}`;
      await sql`insert into activities (entity, entity_id, kind, text, due_date) values ('invoice', ${i.id}, 'task',
        ${`Overdue ${step}+ days – reminder ${r.ok ? 'emailed' : 'due (send manually)'}`}, ${t})`;
      log.push(`Reminder ${i.number} (${step}d)`);
    }
  }
  // 4. Recurring expenses
  const rec = await sql`select * from expenses where recurring <> 'none'`;
  for (const e of rec) {
    const months = e.recurring === 'monthly' ? 1 : e.recurring === 'quarterly' ? 3 : 12;
    const next = new Date(e.date + 'T00:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + months);
    const nd = next.toISOString().slice(0, 10);
    if (nd <= t) {
      await sql`insert into expenses (date, category, supplier, description, amount, gst, bus_id, recurring)
        values (${nd}, ${e.category}, ${e.supplier}, ${e.description}, ${e.amount}, ${e.gst}, ${e.bus_id}, ${e.recurring})`;
      await sql`update expenses set recurring = 'none' where id = ${e.id}`; // the new row carries the schedule
      log.push(`Recurring expense: ${e.description}`);
    }
  }
  return log;
}

/* ---------------- Alerts ---------------- */
export async function getAlerts() {
  const s = await getSettings();
  const t = today();
  const horizon = addDays(t, Number(s.alert_days) || 30);
  const alerts: { level: 'red' | 'amber'; text: string; href: string }[] = [];
  const staff = await sql`select * from users where active`;
  for (const u of staff)
    for (const [f, label] of [['licence_expiry', 'Licence'], ['medical_expiry', 'Medical'], ['wwcc_expiry', 'WWCC'], ['accreditation_expiry', 'DA accreditation']])
      if (u[f] && u[f] <= horizon) alerts.push({ level: u[f] < t ? 'red' : 'amber', text: `${u.name}: ${label} ${u[f] < t ? 'expired' : 'expires'} ${u[f]}`, href: `/staff/${u.id}` });
  const buses = await sql`select * from buses where active`;
  for (const b of buses) {
    const st = await busServiceStatus(b);
    if (st.overdue) alerts.push({ level: 'red', text: `Bus ${b.fleet_no || b.rego}: service overdue – blocked from jobs`, href: `/fleet/${b.id}` });
    else if (st.dueSoon) alerts.push({ level: 'amber', text: `Bus ${b.fleet_no || b.rego}: service due ${st.kmLeft != null && st.kmLeft < 1000 ? `in ${st.kmLeft} km` : st.dueDate}`, href: `/fleet/${b.id}` });
    for (const [f, label] of [['rego_expiry', 'Rego'], ['insurance_expiry', 'Insurance'], ['inspection_expiry', 'Inspection']])
      if (b[f] && b[f] <= horizon) alerts.push({ level: b[f] < t ? 'red' : 'amber', text: `Bus ${b.fleet_no || b.rego}: ${label} ${b[f] < t ? 'expired' : 'expires'} ${b[f]}`, href: `/fleet/${b.id}` });
  }
  const [def] = await sql`select count(*)::int n from defects where status = 'open'`;
  if (def.n) alerts.push({ level: 'amber', text: `${def.n} open defect(s) in the queue`, href: '/fleet/defects' });
  const invs = await sql`select i.*, (select coalesce(sum(amount),0) from payments p where p.invoice_id = i.id)::numeric paid from invoices i where status = 'sent' and kind='invoice' and due_date < ${t}`;
  const od = invs.filter((i: any) => Number(i.paid) < Number(i.total) - 0.005);
  if (od.length) alerts.push({ level: 'red', text: `${od.length} overdue invoice(s) – ${money(od.reduce((a: number, i: any) => a + Number(i.total) - Number(i.paid), 0))}`, href: '/finance?f=overdue' });
  const [stale] = await sql`select count(*)::int n from quotes where status = 'sent' and sent_at < now() - interval '3 days'`;
  if (stale.n) alerts.push({ level: 'amber', text: `${stale.n} quote(s) sent 3+ days ago with no response`, href: '/quotes?f=sent' });
  const [un] = await sql`select count(*)::int n from jobs where date between ${t} and ${addDays(t, 7)} and status not in ('cancelled','completed') and (driver_id is null or bus_id is null)`;
  if (un.n) alerts.push({ level: 'red', text: `${un.n} job(s) in the next 7 days missing a driver or bus`, href: '/jobs?f=unassigned' });
  const [lv] = await sql`select count(*)::int n from leave where status = 'pending'`;
  if (lv.n) alerts.push({ level: 'amber', text: `${lv.n} leave request(s) waiting for approval`, href: '/staff/leave' });
  const [tasks] = await sql`select count(*)::int n from activities where kind = 'task' and not done and due_date <= ${t}`;
  if (tasks.n) alerts.push({ level: 'amber', text: `${tasks.n} follow-up task(s) due`, href: '/crm/tasks' });
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  return alerts;
}
