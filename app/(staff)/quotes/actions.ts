'use server';
import { redirect } from 'next/navigation';
import { sql, getSettings } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { str, int, num, audit, logActivity, today, addDays, token } from '@/lib/util';
import { calcQuote, convertQuoteToJob, emailQuote, QuoteLine } from '@/lib/logic';

function parseExtras(txt: string | null): QuoteLine[] {
  if (!txt) return [];
  return txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [d, a] = l.split('|').map((x) => x.trim());
    const amt = Number((a || '0').replace(/[$,]/g, '')) || 0;
    return { description: d, qty: 1, unit: amt, amount: amt };
  });
}

export async function saveQuote(fd: FormData) {
  const u = await requireStaff();
  const s = await getSettings();
  const id = int(fd, 'id');
  const rate_card_id = int(fd, 'rate_card_id')!;
  const km = num(fd, 'km') || 0, hours = num(fd, 'hours') || 0;
  const trip_date = str(fd, 'trip_date');
  const extrasTxt = str(fd, 'extras');
  const calc = await calcQuote({ rate_card_id, km, hours, trip_date, extras: parseExtras(extrasTxt) });
  const override = num(fd, 'override_total'); // optional ex-GST override
  let lines = calc.lines, subtotal = calc.subtotal, gst = calc.gst, total = calc.total;
  if (override && override > 0) {
    const adj = Math.round((override - calc.subtotal) * 100) / 100;
    if (adj !== 0) lines = [...lines, { description: adj < 0 ? 'Discount' : 'Adjustment', qty: 1, unit: adj, amount: adj }];
    subtotal = override; gst = s.gst_registered ? Math.round(override * 10) / 100 : 0; total = subtotal + gst;
  }
  if (!s.gst_registered) { gst = 0; total = subtotal; }
  const v: any = {
    client_id: int(fd, 'client_id'), trip_date, start_time: str(fd, 'start_time'), end_time: str(fd, 'end_time'),
    pickup: str(fd, 'pickup'), dropoff: str(fd, 'dropoff'), passengers: int(fd, 'passengers'), km, hours, rate_card_id,
    lines: sql.json(lines as any), subtotal, gst, total, deposit_pct: num(fd, 'deposit_pct') || 0,
    expiry_date: str(fd, 'expiry_date') || addDays(today(), Number(s.quote_expiry_days) || 14), notes: str(fd, 'notes'), extras: extrasTxt,
  };
  if (id) {
    await sql`update quotes set ${sql(v)} where id = ${id}`;
    await audit(u, 'update', 'quote', id);
    redirect(`/quotes/${id}`);
  }
  const [q] = await sql`insert into quotes ${sql({ ...v, enquiry_id: int(fd, 'enquiry_id'), token: token(), status: 'draft' })} returning id`;
  await logActivity('quote', q.id, `Quote created by ${u.name}`, u.id);
  if (v.enquiry_id) await logActivity('enquiry', v.enquiry_id, `Quote Q${q.id} drafted`, u.id);
  await audit(u, 'create', 'quote', q.id);
  redirect(`/quotes/${q.id}`);
}

export async function sendQuote(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const [q] = await sql`update quotes set status = 'sent', sent_at = now() where id = ${id} returning *`;
  if (q.enquiry_id) await sql`update enquiries set status = 'quoted', updated_at = now() where id = ${q.enquiry_id} and status in ('enquiry','follow_up')`;
  const r = fd.get('email') === 'on' ? await emailQuote(id) : { ok: false, info: 'Marked as sent (not emailed)' };
  await logActivity('quote', id, `Quote sent – ${r.info}`, u.id, 'email');
  await audit(u, 'send', 'quote', id, r.info);
  redirect(`/quotes/${id}?msg=${encodeURIComponent(r.info)}`);
}

export async function newVersion(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const [q] = await sql`select * from quotes where id = ${id}`;
  const { id: _i, created_at, sent_at, accepted_at, accepted_name, job_id, token: _t, status, ...rest } = q;
  const [n] = await sql`insert into quotes ${sql({ ...rest, lines: sql.json(q.lines), parent_id: q.parent_id || q.id, version: q.version + 1, status: 'draft', token: token() } as any)} returning id`;
  await sql`update quotes set status = 'superseded' where id = ${id} and status in ('draft','sent','expired')`;
  await logActivity('quote', n.id, `Version ${q.version + 1} created from Q${id}`, u.id);
  redirect(`/quotes/${n.id}`);
}

export async function convertQuote(fd: FormData) {
  const u = await requireStaff();
  const jobId = await convertQuoteToJob(int(fd, 'id')!, u.id);
  await audit(u, 'convert', 'quote', int(fd, 'id'), `job ${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function declineQuote(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const [q] = await sql`update quotes set status = 'declined' where id = ${id} returning enquiry_id`;
  if (q.enquiry_id) await sql`update enquiries set status = 'lost', outcome_reason = ${str(fd, 'reason')}, updated_at = now() where id = ${q.enquiry_id}`;
  await logActivity('quote', id, `Declined${str(fd, 'reason') ? `: ${str(fd, 'reason')}` : ''}`, u.id);
  redirect(`/quotes/${id}`);
}
