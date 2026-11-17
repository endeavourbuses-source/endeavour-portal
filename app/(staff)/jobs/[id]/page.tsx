import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { money, fmtDateLong, fmtTs } from '@/lib/util';
import { availability } from '@/lib/logic';
import { Badge, Head, Checks } from '@/components/ui';
import { JobForm } from '@/components/job-form';
import { ActivityLog } from '@/components/activity';
import { assignJob, setJobStatus, cancelJob, saveRoute, subcontractJob, deleteJob } from '../actions';

const FLOW = ['scheduled', 'assigned', 'route_approved', 'in_progress', 'completed'];

function mapsUrl(j: any) {
  const stops = (j.stops || '').split('\n').map((s: string) => s.replace(/^\s*\d{1,2}[:.]\d{2}\s*(am|pm)?\s*[-–]?\s*/i, '').trim()).filter(Boolean);
  const pts = [j.pickup, ...stops, j.dropoff].filter(Boolean).map((p: string) => encodeURIComponent(p + ', VIC, Australia'));
  return pts.length >= 2 ? `https://www.google.com/maps/dir/${pts.join('/')}` : null;
}

export default async function Job({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const [j] = await sql`select j.*, c.name client, c.phone cphone, u.name driver, b.fleet_no, b.rego, b.seats from jobs j left join clients c on c.id = j.client_id
    left join users u on u.id = j.driver_id left join buses b on b.id = j.bus_id where j.id = ${id}`;
  if (!j) notFound();
  const av = await availability(j);
  const incidents = await sql`select i.*, u.name from incidents i left join users u on u.id = i.user_id where job_id = ${id}`;
  const invs = await sql`select id, number, total, status from invoices where job_id = ${id}`;
  const maps = mapsUrl(j);
  const idx = FLOW.indexOf(j.status);
  const open = !['completed', 'cancelled'].includes(j.status);
  const label = (x: any) => `${x.checks.some((c: any) => c.level === 'block') ? '⛔' : x.checks.length ? '⚠️' : '✅'} `;
  return (
    <>
      <Head title={j.title || j.client || `Job #${j.id}`} sub={<>Job #{j.id} · {fmtDateLong(j.date)} · {j.start_time}–{j.end_time} <Badge s={j.status} /> {j.recurring_group && <a href={`/jobs?group=${j.recurring_group}`}>🔁 series</a>}</>}>
        {open && FLOW[idx + 1] && (
          <form action={setJobStatus}><input type="hidden" name="id" value={j.id} /><input type="hidden" name="status" value={FLOW[idx + 1]} />
            <button className="btn">→ {FLOW[idx + 1].replace('_', ' ')}</button></form>
        )}
        {j.quote_id && <a className="btn sec" href={`/quotes/${j.quote_id}`}>Quote</a>}
      </Head>
      {sp.err && <div className="alert red">{sp.err}</div>}
      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Assignment</h2>
            <p>
              Driver: <b>{j.driver || '—'}</b> {j.driver_ack_at ? <span className="b green">confirmed by driver {fmtTs(j.driver_ack_at)}</span> : j.driver ? <span className="b amber">not yet seen</span> : null}<br />
              Bus: <b>{j.fleet_no || j.rego || '—'}</b> {j.seats ? `(${j.seats} seats)` : ''} · {j.passengers} passengers · <Badge s={j.assignment} />
            </p>
            {open && (
              <form action={assignJob}>
                <input type="hidden" name="id" value={j.id} />
                <div className="row">
                  <div className="f"><label>Driver</label>
                    <select name="driver_id" defaultValue={j.driver_id || ''}>
                      <option value="">— none —</option>
                      {av.drivers.map((d: any) => <option key={d.id} value={d.id}>{label(d)}{d.name}</option>)}
                    </select></div>
                  <div className="f"><label>Bus</label>
                    <select name="bus_id" defaultValue={j.bus_id || ''}>
                      <option value="">— none —</option>
                      {av.buses.map((b: any) => <option key={b.id} value={b.id}>{label(b)}{b.fleet_no || b.rego} ({b.seats} seats)</option>)}
                    </select></div>
                  <div className="f auto" style={{ width: 140 }}><label>Status</label>
                    <select name="assignment" defaultValue={j.assignment === 'confirmed' ? 'confirmed' : 'provisional'}>
                      <option value="provisional">Provisional</option><option value="confirmed">Confirmed</option></select></div>
                </div>
                <div className="actions">
                  <button className="btn">Save assignment</button>
                  <label style={{ display: 'flex', gap: 5, fontWeight: 500 }}><input type="checkbox" name="override" /> Override blocks (logged)</label>
                  {j.recurring_group && <label style={{ display: 'flex', gap: 5, fontWeight: 500 }}><input type="checkbox" name="apply_group" /> Apply to rest of series</label>}
                </div>
              </form>
            )}
            <details style={{ marginTop: 12 }} open={!j.driver_id || !j.bus_id}>
              <summary>Who's available? (clash checks)</summary>
              <div className="grid g2" style={{ marginTop: 8 }}>
                <table><thead><tr><th>Driver</th><th>Checks</th></tr></thead><tbody>
                  {av.drivers.map((d: any) => <tr key={d.id}><td>{d.name}</td><td><Checks checks={d.checks} /></td></tr>)}
                </tbody></table>
                <table><thead><tr><th>Bus</th><th>Checks</th></tr></thead><tbody>
                  {av.buses.map((b: any) => <tr key={b.id}><td>{b.fleet_no || b.rego}<div className="small muted">{b.seats} seats</div></td><td><Checks checks={b.checks} /></td></tr>)}
                </tbody></table>
              </div>
            </details>
          </div>
          <div className="card">
            <h2>Route</h2>
            {maps && <p><a className="btn sec sm" href={maps} target="_blank">Open suggested route in Google Maps ↗</a></p>}
            <form action={saveRoute}>
              <input type="hidden" name="id" value={j.id} />
              <textarea name="route" defaultValue={j.route || ''} placeholder="Route notes / turn-by-turn / paste Google Maps link. Edit as needed, then approve." />
              <div className="actions" style={{ marginTop: 8 }}>
                <button className="btn sec" name="approve" value="0">Save</button>
                <button className="btn" name="approve" value="1">Save & approve route</button>
                {j.route_approved && <span className="b green">Approved</span>}
              </div>
            </form>
          </div>
          <div className="card">
            <h2>Trip record (from driver app)</h2>
            <table><tbody>
              <tr><th>Signed on</th><td>{fmtTs(j.signon_at) || '—'}</td><th>Signed off</th><td>{fmtTs(j.signoff_at) || '—'}</td></tr>
              <tr><th>Odometer</th><td>{j.odo_start ?? '—'} → {j.odo_end ?? '—'}</td><th>Km</th><td>{j.odo_end && j.odo_start ? j.odo_end - j.odo_start : '—'}</td></tr>
              <tr><th>Breaks</th><td>{j.break_minutes || 0} min</td><th>Client sign-off</th><td>{j.client_signoff || '—'}</td></tr>
              <tr><th>Pre-trip</th><td colSpan={3}>{j.pretrip ? (j.pretrip.ok ? <span className="b green">All OK</span> : <span className="b red">Issues: {j.pretrip.issues}</span>) : '—'}</td></tr>
            </tbody></table>
            {incidents.map((i: any) => <div key={i.id} className="alert red" style={{ marginTop: 8 }}>Incident ({i.severity}) by {i.name}: {i.description}</div>)}
          </div>
          {invs.length > 0 && (
            <div className="card"><h2>Invoices</h2>{invs.map((i: any) => <div key={i.id}><a href={`/finance/${i.id}`}>{i.number}</a> · {money(i.total)} · <Badge s={i.status} /></div>)}</div>
          )}
          <ActivityLog entity="job" id={j.id} back={`/jobs/${j.id}`} />
        </div>
        <div>
          <div className="card">
            <h2>Details</h2>
            <p style={{ margin: 0 }}>{j.client && <><a href={`/clients/${j.client_id}`}>{j.client}</a> {j.cphone}<br /></>}
              <b>{j.pickup}</b> → <b>{j.dropoff}</b></p>
            {j.stops && <p className="pre">{j.stops}</p>}
            {j.special_needs && <div className="alert amber">Special needs: {j.special_needs}</div>}
            {j.notes && <p className="pre muted">{j.notes}</p>}
            <p>Price: <b>{money(j.price)}</b> ex GST</p>
          </div>
          {open && (
            <>
              <form action={subcontractJob} className="card">
                <h2>Fleet full? Subcontract</h2>
                <div className="row">
                  <div className="f"><label>Subcontractor</label><input name="subcontractor" defaultValue={j.subcontractor || ''} placeholder="Operator name" /></div>
                  <div className="f"><label>Their cost (ex GST)</label><input name="subcontract_cost" type="number" step="0.01" defaultValue={j.subcontract_cost || ''} /></div>
                  <div className="f auto"><button className="btn sec">Save</button></div>
                </div>
              </form>
              <form action={cancelJob} className="card">
                <h2>Cancel job</h2>
                <div className="row">
                  <div className="f" style={{ flex: 2 }}><label>Reason</label><input name="cancel_reason" /></div>
                  <div className="f"><label>Cancellation fee ex GST</label><input name="cancel_fee" type="number" step="0.01" defaultValue="0" /></div>
                  <div className="f auto"><button className="btn danger">Cancel job</button></div>
                </div>
                <p className="small muted">A fee creates a cancellation invoice automatically.</p>
              </form>
            </>
          )}
          {j.status === 'cancelled' && <div className="alert red">Cancelled: {j.cancel_reason} {j.cancel_fee ? `(fee ${money(j.cancel_fee)})` : ''}</div>}
          <details><summary>Edit job details</summary><JobForm j={j} /></details>
          <form action={deleteJob} style={{ marginTop: 20 }}><input type="hidden" name="id" value={j.id} /><button className="btn sm sec">Delete job (admin only)</button></form>
        </div>
      </div>
    </>
  );
}
