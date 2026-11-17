import { sql } from '@/lib/db';
import { Field, Select } from './ui';
import { saveEnquiry } from '@/app/(staff)/crm/actions';

export const SOURCES = ['phone', 'website', 'referral', 'repeat client', 'email', 'tender', 'walk-in', 'social media', 'other'];

export async function EnquiryForm({ e = {} as any }) {
  const clients = await sql`select id, name from clients order by name`;
  return (
    <form action={saveEnquiry} className="card">
      {e.id && <input type="hidden" name="id" value={e.id} />}
      <h2>Who</h2>
      <div className="row">
        <Select label="Existing client" name="client_id" value={e.client_id} blank="— new / not yet a client —" options={clients.map((c: any) => ({ value: c.id, label: c.name }))} />
        <Field label="Organisation (school, club, company)" name="organisation" value={e.organisation} />
        <Select label="Lead source" name="source" value={e.source} options={SOURCES} />
      </div>
      <div className="row">
        <Field label="Contact name" name="contact_name" value={e.contact_name} />
        <Field label="Email" name="contact_email" type="email" value={e.contact_email} />
        <Field label="Phone" name="contact_phone" value={e.contact_phone} />
      </div>
      {!e.id && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 500 }}>
          <input type="checkbox" name="make_client" defaultChecked /> Create a client record if not an existing client
        </label>
      )}
      <h2 style={{ marginTop: 14 }}>Trip</h2>
      <div className="row">
        <Field label="Date" name="trip_date" type="date" value={e.trip_date} />
        <Field label="Start" name="start_time" type="time" value={e.start_time} />
        <Field label="Finish" name="end_time" type="time" value={e.end_time} />
        <Field label="Passengers" name="passengers" type="number" value={e.passengers} />
      </div>
      <div className="row">
        <Field label="Pickup" name="pickup" value={e.pickup} />
        <Field label="Destination / drop-off" name="dropoff" value={e.dropoff} />
      </div>
      <Field label="Details (stops, special needs, luggage, accessibility…)" name="details" type="textarea" value={e.details} />
      <button className="btn">{e.id ? 'Save changes' : 'Save enquiry'}</button>
    </form>
  );
}
