import { sql } from './db';
import crypto from 'crypto';

export const TZ = 'Australia/Melbourne';

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
export function addDays(d: string, n: number): string {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
export function weekStart(d: string): string {
  const day = new Date(d + 'T00:00:00Z').getUTCDay(); // 0 Sun
  return addDays(d, day === 0 ? -6 : 1 - day); // Monday
}
export function dow(d: string): number {
  return new Date(d + 'T00:00:00Z').getUTCDay();
}
export function fmtDate(d?: string | null, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!d) return '';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' });
}
export function fmtDateLong(d?: string | null) {
  return fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtTs(t?: Date | string | null) {
  if (!t) return '';
  return new Date(t).toLocaleString('en-AU', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
export function money(n: any) {
  const v = Number(n || 0);
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}
export function token() {
  return crypto.randomBytes(18).toString('base64url');
}
export function timeToMin(t?: string | null) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function hoursBetweenTimes(a?: string, b?: string) {
  const x = timeToMin(a), y = timeToMin(b);
  if (x == null || y == null) return 0;
  return Math.max(0, (y - x) / 60);
}

export function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
export function num(fd: FormData, k: string): number | null {
  const s = str(fd, k);
  if (s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}
export function int(fd: FormData, k: string): number | null {
  const n = num(fd, k);
  return n == null ? null : Math.round(n);
}

export async function audit(user: { id: number; name: string } | null, action: string, entity: string, entity_id: number | null, detail = '') {
  await sql`insert into audit (user_id, user_name, action, entity, entity_id, detail)
    values (${user?.id ?? null}, ${user?.name ?? 'system'}, ${action}, ${entity}, ${entity_id}, ${detail})`;
}

export async function logActivity(entity: string, entity_id: number, text: string, user_id: number | null = null, kind = 'system') {
  await sql`insert into activities (entity, entity_id, user_id, kind, text) values (${entity}, ${entity_id}, ${user_id}, ${kind}, ${text})`;
}

export function baseUrl() {
  return process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
}

export function fillTemplate(t: string, vars: Record<string, any>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString());
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', assigned: 'Assigned', route_approved: 'Route approved', in_progress: 'In progress',
  completed: 'Completed', cancelled: 'Cancelled', enquiry: 'Enquiry', quoted: 'Quoted', follow_up: 'Follow-up',
  won: 'Won', lost: 'Lost', draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined',
  expired: 'Expired', superseded: 'Superseded', paid: 'Paid', void: 'Void', overdue: 'Overdue', partial: 'Part-paid',
  pending: 'Pending', approved: 'Approved', open: 'Open', fixed: 'Fixed',
};
