import { redirect } from 'next/navigation';
import { sql, getSettings, ensureDb } from '@/lib/db';
import { logActivity } from '@/lib/util';

export const dynamic = 'force-dynamic';

async function submit(fd: FormData) {
  'use server';
  await ensureDb();
  if (String(fd.get('website') || '')) redirect('/enquire?ok=1'); // honeypot for bots
  const g = (k: string) => { const v = String(fd.get(k) || '').trim(); return v || null; };
  const email = g('email');
  const [client] = email ? await sql`select id from clients where lower(email) = lower(${email}) limit 1` : [null];
  const [e] = await sql`insert into enquiries (client_id, contact_name, contact_email, contact_phone, organisation, source, channel,
      trip_date, start_time, end_time, pickup, dropoff, passengers, details)
    values (${client?.id ?? null}, ${g('name')}, ${email}, ${g('phone')}, ${g('organisation')}, ${client ? 'repeat client' : g('heard') || 'website'}, 'online',
      ${g('trip_date')}, ${g('start_time')}, ${g('end_time')}, ${g('pickup')}, ${g('dropoff')}, ${Number(g('passengers')) || null}, ${g('details')}) returning id`;
  await logActivity('enquiry', e.id, 'Received via online enquiry form');
  await sql`insert into activities (entity, entity_id, kind, text, due_date) values ('enquiry', ${e.id}, 'task', 'New online enquiry – quote it', current_date)`;
  redirect('/enquire?ok=1');
}

export default async function Enquire({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await ensureDb();
  const s = await getSettings();
  return (
    <div className="center">
      <div className="loginbox" style={{ maxWidth: 620 }}>
        <h1 style={{ color: 'var(--navy)' }}>{s.company_name}</h1>
        <p className="muted">Request a quote for a charter, school excursion or transfer.</p>
        {sp.ok ? (
          <div className="alert green">Thanks! We've received your enquiry and will be in touch shortly with a quote.</div>
        ) : (
          <form action={submit}>
            <input name="website" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
            <div className="row"><div className="f"><label>Your name *</label><input name="name" required /></div><div className="f"><label>School / organisation</label><input name="organisation" /></div></div>
            <div className="row"><div className="f"><label>Email *</label><input name="email" type="email" required /></div><div className="f"><label>Phone *</label><input name="phone" required /></div></div>
            <div className="row">
              <div className="f"><label>Date</label><input name="trip_date" type="date" /></div>
              <div className="f"><label>Pickup time</label><input name="start_time" type="time" /></div>
              <div className="f"><label>Return time</label><input name="end_time" type="time" /></div>
            </div>
            <div className="row"><div className="f"><label>Pickup address</label><input name="pickup" /></div><div className="f"><label>Destination</label><input name="dropoff" /></div></div>
            <div className="row">
              <div className="f"><label>Passengers</label><input name="passengers" type="number" min="1" /></div>
              <div className="f"><label>How did you hear about us?</label>
                <select name="heard"><option value="website">Website / Google</option><option value="referral">Referral</option><option value="social media">Social media</option><option value="other">Other</option></select></div>
            </div>
            <div className="f"><label>Anything else? (stops, wheelchair access, luggage…)</label><textarea name="details" /></div>
            <button className="btn big">Send enquiry</button>
          </form>
        )}
      </div>
    </div>
  );
}
