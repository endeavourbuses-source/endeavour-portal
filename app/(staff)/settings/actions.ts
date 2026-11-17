'use server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireAdmin, requireStaff } from '@/lib/auth';
import { str, int, num, audit } from '@/lib/util';
import { runAutomations } from '@/lib/logic';

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
  const list: [string, string][] = [
    ['2026-01-01', "New Year's Day"], ['2026-01-26', 'Australia Day'], ['2026-03-09', 'Labour Day'], ['2026-04-03', 'Good Friday'],
    ['2026-04-04', 'Easter Saturday'], ['2026-04-05', 'Easter Sunday'], ['2026-04-06', 'Easter Monday'], ['2026-04-25', 'Anzac Day'],
    ['2026-06-08', "King's Birthday"], ['2026-11-03', 'Melbourne Cup'], ['2026-12-25', 'Christmas Day'], ['2026-12-26', 'Boxing Day'], ['2026-12-28', 'Boxing Day (additional)'],
    ['2027-01-01', "New Year's Day"], ['2027-01-26', 'Australia Day'], ['2027-03-08', 'Labour Day'], ['2027-03-26', 'Good Friday'],
    ['2027-03-27', 'Easter Saturday'], ['2027-03-28', 'Easter Sunday'], ['2027-03-29', 'Easter Monday'], ['2027-04-25', 'Anzac Day'],
    ['2027-06-14', "King's Birthday"], ['2027-11-02', 'Melbourne Cup'], ['2027-12-25', 'Christmas Day'], ['2027-12-26', 'Boxing Day'], ['2027-12-27', 'Christmas Day (additional)'], ['2027-12-28', 'Boxing Day (additional)'],
  ];
  for (const [d, n] of list) await sql`insert into holidays (day, name) values (${d}, ${n}) on conflict (day) do nothing`;
  redirect('/settings?msg=Holidays+added+-+please+double-check+the+dates#holidays');
}

export async function runNow() {
  const u = await requireStaff();
  const log = await runAutomations();
  await audit(u, 'run automations', 'system', null, log.join('; '));
  redirect(`/settings?msg=${encodeURIComponent(log.length ? log.join(' · ') : 'Automations ran – nothing to do')}`);
}
