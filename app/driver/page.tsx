import { sql } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { today, addDays, weekStart, fmtDate } from '@/lib/util';
import { Badge } from '@/components/ui';
import { ackJob } from './actions';

export default async function DriverHome({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = (await getUser())!;
  const t = today();
  const ws = weekStart(sp.week || t);
  const we = addDays(ws, 6);
  const driverId = u.role === 'driver' ? u.id : Number(sp.as || 0) || null;
  const drivers = u.role !== 'driver' ? await sql`select id, name from users where role='driver' and active order by name` : [];
  const jobs = driverId
    ? await sql`select j.*, b.fleet_no, b.rego from jobs j left join buses b on b.id = j.bus_id
        where driver_id = ${driverId} and date between ${ws} and ${we} and status <> 'cancelled' order by date, start_time`
    : [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const unseen = jobs.filter((j: any) => !j.driver_ack_at && j.status !== 'completed').length;
  return (
    <>
      {sp.msg && <div className="alert green">{sp.msg}</div>}
      {u.role !== 'driver' && (
        <form className="row" style={{ marginBottom: 10 }}>
          <select name="as" defaultValue={driverId || ''}><option value="">Preview as driver…</option>{drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <button className="btn sec auto">View</button>
        </form>
      )}
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <a className="btn sec sm" href={`/driver?week=${addDays(ws, -7)}${driverId && u.role !== 'driver' ? `&as=${driverId}` : ''}`}>← Prev</a>
        <b>Week of {fmtDate(ws, { day: 'numeric', month: 'short' })}</b>
        <a className="btn sec sm" href={`/driver?week=${addDays(ws, 7)}${driverId && u.role !== 'driver' ? `&as=${driverId}` : ''}`}>Next →</a>
      </div>
      {unseen > 0 && <div className="alert amber" style={{ marginTop: 10 }}>You have {unseen} job(s) to confirm.</div>}
      {days.map((d) => {
        const dj = jobs.filter((j: any) => j.date === d);
        return (
          <div key={d}>
            <div className="dayhead">{fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}{d === t && ' · TODAY'}</div>
            {dj.length === 0 && <div className="muted small">No jobs</div>}
            {dj.map((j: any) => (
              <div className="jobcard" key={j.id}>
                <a href={`/driver/job/${j.id}`} style={{ color: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="time">{j.start_time} – {j.end_time}</span><Badge s={j.status} />
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{j.title}</div>
                  <div>{j.pickup} → {j.dropoff}</div>
                  <div className="small muted">{j.passengers} passengers · Bus {j.fleet_no || j.rego || 'TBC'}{j.assignment === 'provisional' ? ' · provisional' : ''}</div>
                  {j.special_needs && <div className="small" style={{ color: 'var(--amber)' }}>⚠️ {j.special_needs}</div>}
                </a>
                {!j.driver_ack_at && j.status !== 'completed' && (
                  <form action={ackJob} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={j.id} /><input type="hidden" name="back" value="/driver" />
                    <button className="btn warn" style={{ width: '100%' }}>👍 Seen & accepted</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
