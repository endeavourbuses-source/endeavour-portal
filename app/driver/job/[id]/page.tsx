import { notFound, redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { fmtDateLong, fmtTs } from '@/lib/util';
import { Badge } from '@/components/ui';
import { ackJob, pretrip, signOn, addBreak, reportIncident, signOff } from '../../actions';
import { PRETRIP } from '@/lib/constants';

export default async function DriverJob({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const u = (await getUser())!;
  const [j] = await sql`select j.*, c.name client, c.phone cphone, b.fleet_no, b.rego, b.odometer from jobs j
    left join clients c on c.id = j.client_id left join buses b on b.id = j.bus_id where j.id = ${id}`;
  if (!j) notFound();
  if (u.role === 'driver' && j.driver_id !== u.id) redirect('/driver');
  const maps = [j.pickup, j.dropoff].every(Boolean) ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(j.pickup)}&destination=${encodeURIComponent(j.dropoff)}` : null;
  const done = j.status === 'completed';
  return (
    <>
      <p><a href="/driver">← All jobs</a></p>
      {sp.msg && <div className="alert green">{sp.msg}</div>}
      <div className="jobcard">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="time">{j.start_time} – {j.end_time}</span><Badge s={j.status} /></div>
        <div className="muted">{fmtDateLong(j.date)}</div>
        <h2 style={{ margin: '8px 0 4px' }}>{j.title}</h2>
        <p style={{ margin: 0 }}><b>Pickup:</b> {j.pickup}<br /><b>Drop-off:</b> {j.dropoff}</p>
        {j.stops && <div className="pre" style={{ marginTop: 8, background: '#f6f8fb', padding: 8, borderRadius: 6 }}>{j.stops}</div>}
        <p className="small" style={{ marginBottom: 0 }}>{j.passengers} passengers · Bus <b>{j.fleet_no || j.rego || 'TBC'}</b> · Client {j.client} {j.cphone && <a href={`tel:${j.cphone}`}>{j.cphone}</a>}</p>
        {j.special_needs && <div className="alert amber" style={{ marginTop: 8 }}>⚠️ {j.special_needs}</div>}
        {j.notes && <p className="pre small">{j.notes}</p>}
        {j.route && <details><summary>Route</summary><p className="pre small">{j.route}</p></details>}
        {maps && <a className="btn sec" style={{ marginTop: 8 }} href={maps} target="_blank">🧭 Navigate</a>}
      </div>

      {!j.driver_ack_at && !done && (
        <form action={ackJob}><input type="hidden" name="id" value={j.id} /><button className="btn big warn">👍 Seen & accepted</button></form>
      )}

      {!done && (
        <div className="card">
          <h2>1. Pre-trip check {j.pretrip && (j.pretrip.ok ? <span className="b green">Done ✓</span> : <span className="b red">Issues reported</span>)}</h2>
          {!j.pretrip ? (
            <form action={pretrip} className="checklist">
              <input type="hidden" name="id" value={j.id} />
              {PRETRIP.map((c, i) => <label key={i}><input type="checkbox" name={'c' + i} /> {c}</label>)}
              <div className="f" style={{ marginTop: 10 }}><label>Defects / notes (leave empty if none)</label><textarea name="notes" /></div>
              <div className="f"><label>If there's a defect, how bad?</label>
                <select name="severity"><option value="minor">Minor – OK to drive</option><option value="major">Major – needs fixing soon</option><option value="critical">Critical – NOT safe to drive</option></select></div>
              <button className="btn big">Submit check</button>
            </form>
          ) : <p className="small muted">{j.pretrip.issues || 'All items OK'} · {j.pretrip.by}</p>}
        </div>
      )}

      {!done && !j.signon_at && (
        <form action={signOn} className="card">
          <h2>2. Sign on</h2>
          <input type="hidden" name="id" value={j.id} />
          <div className="f"><label>Odometer at start</label><input name="odo_start" type="number" inputMode="numeric" defaultValue={j.odometer || ''} required /></div>
          <button className="btn big">▶️ Sign on & start job</button>
        </form>
      )}

      {j.signon_at && !done && (
        <>
          <div className="alert blue">Signed on {fmtTs(j.signon_at)} · odo {j.odo_start} · breaks {j.break_minutes || 0} min</div>
          <form action={addBreak} className="card row">
            <input type="hidden" name="id" value={j.id} />
            <div className="f"><label>Log a break (minutes)</label><input name="minutes" type="number" defaultValue={30} /></div>
            <div className="f auto"><button className="btn sec">☕ Add break</button></div>
          </form>
          <form action={signOff} className="card">
            <h2>3. Finish & sign off</h2>
            <input type="hidden" name="id" value={j.id} />
            <div className="f"><label>Odometer at end</label><input name="odo_end" type="number" inputMode="numeric" required min={j.odo_start || 0} /></div>
            <div className="f"><label>Client sign-off (name of teacher / group leader)</label><input name="client_signoff" /></div>
            <button className="btn big">✅ Complete job</button>
          </form>
        </>
      )}

      {done && <div className="alert green">Completed {fmtTs(j.signoff_at)} · {j.odo_end && j.odo_start ? `${j.odo_end - j.odo_start} km` : ''}</div>}

      <details className="card">
        <summary>🚨 Report an incident</summary>
        <form action={reportIncident} style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={j.id} />
          <div className="f"><label>What happened?</label><textarea name="description" required /></div>
          <div className="f"><label>Severity</label><select name="severity"><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical / injury</option></select></div>
          <button className="btn danger big">Send to office</button>
        </form>
        <p className="small muted">In an emergency call 000 first.</p>
      </details>
    </>
  );
}
