'use server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireAdmin, requireStaff } from '@/lib/auth';
import { str, int, num, audit } from '@/lib/util';
import { runAutomations } from '@/lib/logic';
import { VIC_HOLIDAYS } from '@/lib/constants';

const KEYS = ['company_name', 'abn', 'phone', 'email', 'address', 'depots', 'bank_details', 'quote_expiry_days', 'quote_followup_days',
  'invoice_reminder_days', 'default_payment_terms', 'max_shift_hours', 'min_rest_hours', 'max_week_hours', 'alert_days',
  'expense_categories', 'email_quote_template', 'email_invoice_template'];

export async function saveSettings(fd: FormData) {
  const u = await requireAdmin();
  for (const k of KEYS) {
    if (!fd.has(k)) continue;
    const v = String(fd.get(k) ?? '');
    await sql`insert into settings (key, value) values (${k}, ${sql.json(v)}) on conflict (key) do update set value = excluded.value`;
  }
  await sql`insert into settings (key, value) values ('gst_registered', ${sql.json(fd.get('gst_registered') === 'on')}) on conflict (key) do update set value = excluded.value`;
  await audit(u, 'update', 'settings', null);
  redirect('/settings?msg=Saved');
}

export async function saveRate(fd: FormData) {
  const u = await requireAdmin();
  const id = int(fd, 'id');
  const v: any = { name: str(fd, 'name'), bus_class: str(fd, 'bus_class'), per_km: num(fd, 'per_km') || 0, per_hour: num(fd, 'per_hour') || 0,
    min_charge: num(fd, 'min_charge') || 0, weekend_pct: num(fd, 'weekend_pct') || 0, holiday_pct: num(fd, 'holiday_pct') || 0, active: fd.get('active') === 'on' };
  if (id) await sql`update rate_cards set ${sql(v)} where id = ${id}`;
  else await sql`insert into rate_cards ${sql(v)}`;
  await audit(u, 'rate card', 'rate_card', id);
  redirect('/settings?msg=Rate+card+saved#rates');
}

export async function addHoliday(fd: FormData) {
  await requireAdmin();
  await sql`insert into holidays (day, name) values (${str(fd, 'day')}, ${str(fd, 'name')}) on conflict (day) do update set name = excluded.name`;
  redirect('/settings#holidays');
}

export async function deleteHoliday(fd: FormData) {
  await requireAdmin();
  await sql`delete from holidays where day = ${str(fd, 'day')}`;
  redirect('/settings#holidays');
}

export async function addVicHolidays() {
  await requireAdmin();
  // Victorian public holidays 2026–2027 (check against business.vic.gov.au each year; AFL GF Friday is set late)
  const list = VIC_HOLIDAYS;
  for (const [d, n] of list) await sql`insert into holidays (day, name) values (${d}, ${n}) on conflict (day) do nothing`;
  redirect('/settings?msg=Holidays+added+-+please+double-check+the+dates#holidays');
}

export async function runNow() {
  const u = await requireStaff();
  const log = await runAutomations();
  await audit(u, 'run automations', 'system', null, log.join('; '));
  redirect(`/settings?msg=${encodeURIComponent(log.length ? log.join(' · ') : 'Automations ran – nothing to do')}`);
}
