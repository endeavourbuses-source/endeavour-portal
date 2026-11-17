import { sql } from '@/lib/db';
import { Field, Select } from './ui';
import { saveQuote } from '@/app/(staff)/quotes/actions';

export async function QuoteForm({ q }: { q: any }) {
  const [clients, rates] = await Promise.all([
    sql`select id, name from clients order by name`,
    sql`select * from rate_cards where active order by id`,
  ]);
  return (
    <form action={saveQuote} className="card">
      {q.id && <input type="hidden" name="id" value={q.id} />}
      {q.enquiry_id && <input type="hidden" name="enquiry_id" value={q.enquiry_id} />}
      <div className="row">
        <Select label="Client" name="client_id" value={q.client_id} blank="—" options={clients.map((c: any) => ({ value: c.id, label: c.name }))} />
        <Field label="Trip date" name="trip_date" type="date" value={q.trip_date} />
        <Field label="Start" name="start_time" type="time" value={q.start_time} />
        <Field label="Finish" name="end_time" type="time" value={q.end_time} />
      </div>
      <div className="row">
        <Field label="Pickup" name="pickup" value={q.pickup} />
        <Field label="Destination" name="dropoff" value={q.dropoff} />
        <Field label="Passengers" name="passengers" type="number" value={q.passengers} />
      </div>
      <h2 style={{ marginTop: 8 }}>Pricing</h2>
      <div className="row">
        <Select label="Rate card" name="rate_card_id" value={q.rate_card_id || rates[0]?.id}
          options={rates.map((r: any) => ({ value: r.id, label: `${r.name} – $${r.per_km}/km${r.per_hour ? ` + $${r.per_hour}/h` : ''}` }))} />
        <Field label="Total km (return)" name="km" type="number" step="0.1" value={q.km || ''} />
        <Field label="Hours" name="hours" type="number" step="0.25" value={q.hours || ''} />
      </div>
      <Field label="Extra lines – one per line as “description | amount” (e.g. Tolls | 45, Driver accommodation | 180)" name="extras" type="textarea" value={q.extras} />
      <div className="row">
        <Field label="Override total ex GST (optional)" name="override_total" type="number" step="0.01" placeholder="leave blank to use calculator" />
        <Field label="Deposit %" name="deposit_pct" type="number" value={q.deposit_pct || 0} />
        <Field label="Valid until" name="expiry_date" type="date" value={q.expiry_date} />
      </div>
      <Field label="Notes shown on quote (inclusions, conditions)" name="notes" type="textarea" value={q.notes} />
      <p className="small muted">Weekend and public-holiday loadings are added automatically from the rate card and the holiday list in Settings.</p>
      <button className="btn">{q.id ? 'Recalculate & save' : 'Calculate & save draft'}</button>
    </form>
  );
}
