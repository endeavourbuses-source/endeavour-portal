import postgres from 'postgres';
import { SCHEMA } from './schema';
import { VIC_HOLIDAYS } from './constants';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

const g = globalThis as any;
export const sql: any =
  g.__sql ||
  (g.__sql = postgres(url, {
    ssl: /localhost|127\.0\.0\.1|host=\/|@\/|\?host=/.test(url) ? false : 'require',
    prepare: false,
    max: 5,
    idle_timeout: 20,
    types: {
      // keep DATE as 'YYYY-MM-DD' strings and NUMERIC as JS numbers
      date: { to: 1082, from: [1082], serialize: (x: any) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: any) => String(x), parse: (x: string) => parseFloat(x) },
    } as any,
  }));

let ready: Promise<void> | null = g.__ready || null;
export function ensureDb() {
  if (!ready) {
    ready = g.__ready = (async () => {
      await sql.unsafe(SCHEMA);
      const rc = await sql`select count(*)::int as n from rate_cards`;
      if (rc[0].n === 0) {
        await sql`insert into rate_cards (name, bus_class, per_km, per_hour, min_charge, weekend_pct, holiday_pct)
          values ('Big coach (57 seat)', 'coach', 5, 0, 450, 15, 25),
                 ('Midi bus (33 seat)', 'midi', 4, 0, 350, 15, 25),
                 ('Minibus (22 seat)', 'mini', 3.2, 0, 300, 15, 25)`;
      }
      const hol = await sql`select count(*)::int as n from holidays`;
      if (hol[0].n === 0) for (const [d, n] of VIC_HOLIDAYS) await sql`insert into holidays (day, name) values (${d}, ${n}) on conflict do nothing`;
    })().catch((e) => {
      ready = g.__ready = null;
      throw e;
    });
  }
  return ready;
}

export async function getSettings(): Promise<Record<string, any>> {
  await ensureDb();
  const rows = await sql`select key, value from settings`;
  const s: Record<string, any> = {
    company_name: 'Endeavour Buses',
    abn: '',
    phone: '',
    email: '',
    address: '',
    depots: 'South-East depot\nNorthern depot',
    bank_details: '',
    quote_expiry_days: 14,
    quote_followup_days: '3,7',
    invoice_reminder_days: '7,14,30',
    default_payment_terms: 14,
    gst_registered: true,
    max_shift_hours: 12,
    min_rest_hours: 10,
    max_week_hours: 72,
    alert_days: 30,
    expense_categories: 'Fuel\nRepairs & maintenance\nInsurance\nRegistration\nTolls\nWages\nLeases\nOffice\nOther',
    email_quote_template:
      'Hi {name},\n\nThanks for your enquiry. Your quote {number} for {date} is ready: {link}\n\nIt is valid until {expiry}.\n\nKind regards,\n{company}',
    email_invoice_template:
      'Hi {name},\n\nPlease find invoice {number} for {total}, due {due}: {link}\n\nKind regards,\n{company}',
  };
  for (const r of rows) s[r.key] = r.value;
  return s;
}
