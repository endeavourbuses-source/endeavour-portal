import { sql } from '@/lib/db';
import { Field, Select } from './ui';
import { saveJob } from '@/app/(staff)/jobs/actions';

export async function JobForm({ j }: { j: any }) {
  const clients = await sql`select id, name from clients order by name`;
  return (
    <form action={saveJob} className="card">
      {j.id && <input type="hidden" name="id" value={j.id} />}
      <div className="row">
        <Select label="Client" name="client_id" value={j.client_id} blank="—" options={clients.map((c: any) => ({ value: c.id, label: c.name }))} />
        <Field label="Job title" name="title" value={j.title} placeholder="e.g. St Mary's AM school run" />
      </div>
      <div className="row">
        <Field label="Date" name="date" type="date" value={j.date} required />
        <Field label="Start (depot out)" name="start_time" type="time" value={j.start_time} />
        <Field label="Finish (depot in)" name="end_time" type="time" value={j.end_time} />
        <Field label="Passengers" name="passengers" type="number" value={j.passengers} />
      </div>
      <div className="row">
        <Field label="Pickup" name="pickup" value={j.pickup} />
        <Field label="Drop-off" name="dropoff" value={j.dropoff} />
      </div>
      <Field label="Stops & times (one per line, e.g. 7:45 Cnr Smith & Main St)" name="stops" type="textarea" value={j.stops} />
      <Field label="Special needs (wheelchair, child seats, medical, supervision…)" name="special_needs" value={j.special_needs} />
      <div className="row">
        <Field label="Price ex GST" name="price" type="number" step="0.01" value={j.price} />
      </div>
      <Field label="Notes for driver" name="notes" type="textarea" value={j.notes} />
      {!j.id && (
        <details style={{ marginBottom: 12 }}>
          <summary>Repeat (school runs, contracts)</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <div>
              <label>Repeat on</label>
              <div className="actions">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                  <label key={d} style={{ display: 'flex', gap: 4, fontWeight: 500 }}><input type="checkbox" name="repeat_days" value={i} defaultChecked={i >= 1 && i <= 5} />{d}</label>
                ))}
              </div>
            </div>
            <Field label="Until (leave blank for a one-off job)" name="repeat_until" type="date" />
          </div>
        </details>
      )}
      <button className="btn">{j.id ? 'Save job' : 'Create job'}</button>
    </form>
  );
}
