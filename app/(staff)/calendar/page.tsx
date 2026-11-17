import { Fragment } from 'react';
import { sql } from '@/lib/db';
import { today, addDays, weekStart, fmtDate } from '@/lib/util';
import { Head, SubNav } from '@/components/ui';

export default async function Calendar({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const view = sp.view || 'driver';
  const t = today();
  const ws = weekStart(sp.week || t);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const jobs = await sql`select j.*, c.name client, u.name driver, b.fleet_no, b.rego from jobs j left join clients c on c.id=j.client_id
    left join users u on u.id=j.driver_id left join buses b on b.id=j.bus_id where date between ${days[0]} and ${days[6]} order by start_time`;
  const leave = await sql`select user_id, start_date, end_date, type from leave where status='approved' and end_date >= ${days[0]} and start_date <= ${days[6]}`;
  let rows: { key: any; label: string }[] = [];
  if (view === 'driver') rows = (await sql`select id, name from users where role='driver' and active order by name`).map((d: any) => ({ key: d.id, label: d.name }));
  else if (view === 'bus') rows = (await sql`select id, fleet_no, rego, seats from buses where active order by fleet_no`).map((b: any) => ({ key: b.id, label: `${b.fleet_no || b.rego} (${b.seats})` }));
  else rows = [{ key: 'all', label: 'All jobs' }];
  if (view !== 'day') rows.push({ key: null, label: view === 'driver' ? 'No driver' : 'No bus' });
  const field = view === 'driver' ? 'driver_id' : 'bus_id';
  const cell = (key: any, d: string) =>
    jobs.filter((j: any) => j.date === d && (view === 'day' || (j[field] ?? null) === key));
  const qs = (o: any) => `/calendar?${new URLSearchParams({ view, week: ws, ...o })}`;
  return (
    <>
      <Head title="Calendar" sub={`Week of ${fmtDate(ws, { day: 'numeric', month: 'long', year: 'numeric' })}`}>
        <a className="btn sec" href={qs({ week: addDays(ws, -7) })}>← Prev</a>
        <a className="btn sec" href={qs({ week: t })}>This week</a>
        <a className="btn sec" href={qs({ week: addDays(ws, 7) })}>Next →</a>
      </Head>
      <SubNav on={view} items={[['driver', 'By driver'], ['bus', 'By bus'], ['day', 'By day']].map(([v, l]) => [qs({ view: v }), l]) as any} />
      <div className="cal">
        <div className="ch"></div>
        {days.map((d) => <div key={d} className={`ch ${d === t ? 'today' : ''}`}><a href={`/jobs/new?date=${d}`} title="Add job">{fmtDate(d)}</a></div>)}
        {rows.map((r) => (
          <Fragment key={'r' + r.key}>
            <div className="rh">{r.label}</div>
            {days.map((d) => {
              const onLeave = view === 'driver' && leave.find((l: any) => l.user_id === r.key && d >= l.start_date && d <= l.end_date);
              return (
                <div key={r.key + d} className={d === t ? 'today' : ''}>
                  {onLeave && <span className="b amber">{onLeave.type} leave</span>}
                  {cell(r.key, d).map((j: any) => (
                    <a key={j.id} href={`/jobs/${j.id}`} className={`chip ${j.status} ${(!j.driver_id || !j.bus_id) && !j.subcontractor && j.status !== 'cancelled' ? 'unassigned' : ''} ${j.assignment}`}>
                      <b>{j.start_time}</b> {j.title || j.client || '#' + j.id}
                      <br />{view === 'driver' ? j.fleet_no || j.rego || 'no bus' : view === 'bus' ? j.driver || 'no driver' : `${j.driver || 'no driver'} · ${j.fleet_no || 'no bus'}`}
                      {j.driver_ack_at && ' ✓'}
                    </a>
                  ))}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="small muted">Red = missing driver/bus · dashed edge = provisional · ✓ = driver has confirmed · click a date to add a job.</p>
    </>
  );
}
