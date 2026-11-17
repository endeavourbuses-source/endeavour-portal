import { sql } from '@/lib/db';
import { money, fmtDate, today, addDays } from '@/lib/util';
import { Badge, Head, SubNav, Empty } from '@/components/ui';

export default async function Jobs({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const f = sp.f || 'upcoming';
  const t = today();
  const rows = sp.group
    ? await sql`select j.*, c.name client, u.name driver, b.fleet_no, b.rego from jobs j left join clients c on c.id=j.client_id left join users u on u.id=j.driver_id left join buses b on b.id=j.bus_id where recurring_group = ${sp.group} order by date`
    : await sql`select j.*, c.name client, u.name driver, b.fleet_no, b.rego from jobs j left join clients c on c.id=j.client_id
      left join users u on u.id=j.driver_id left join buses b on b.id=j.bus_id
      where case ${f}
        when 'upcoming' then j.date >= ${t} and j.status not in ('cancelled','completed')
        when 'unassigned' then j.date >= ${t} and j.status not in ('cancelled','completed') and (j.driver_id is null or j.bus_id is null) and j.subcontractor is null
        when 'completed' then j.status = 'completed'
        when 'cancelled' then j.status = 'cancelled'
        else true end
      order by case when ${f} in ('completed','cancelled','all') then 0 else 1 end, j.date desc, j.start_time limit 400`;
  const list = f === 'upcoming' || f === 'unassigned' || sp.group ? [...rows].sort((a: any, b: any) => (a.date + a.start_time).localeCompare(b.date + b.start_time)) : rows;
  return (
    <>
      <Head title="Jobs" sub={sp.group ? `Recurring series ${sp.group}` : undefined}>
        <a className="btn" href="/jobs/new">+ New job</a>
        <a className="btn sec" href="/calendar">Calendar</a>
      </Head>
      <SubNav on={`/jobs?f=${f}`} items={[['/jobs?f=upcoming', 'Upcoming'], ['/jobs?f=unassigned', 'Unassigned'], ['/jobs?f=completed', 'Completed'], ['/jobs?f=cancelled', 'Cancelled'], ['/jobs?f=all', 'All']]} />
      <div className="card">
        {list.length === 0 ? <Empty>No jobs here.</Empty> : (<>
          <div className="mlist">
            {list.map((j: any) => (
              <a key={j.id} href={`/jobs/${j.id}`} className="mitem">
                <div className="mrow"><b>{fmtDate(j.date)} · {j.start_time}–{j.end_time}</b><Badge s={j.status} /></div>
                <div className="mt">{j.title || j.client || `Job #${j.id}`}{j.recurring_group && ' 🔁'}</div>
                <div className="small muted">{j.pickup} → {j.dropoff} · {j.passengers} pax</div>
                <div className="mrow small">
                  <span>{j.subcontractor ? `Sub: ${j.subcontractor}` : j.driver ? `👤 ${j.driver}${j.driver_ack_at ? ' ✓' : ''}` : <span className="b red">No driver</span>}</span>
                  <span>{j.fleet_no || j.rego ? `🚌 ${j.fleet_no || j.rego}` : j.subcontractor ? '' : <span className="b red">No bus</span>}</span>
                  <span>{money(j.price)}</span>
                </div>
              </a>
            ))}
          </div>
          <table className="desk">
            <thead><tr><th>Date</th><th>Time</th><th>Job</th><th>Driver</th><th>Bus</th><th>Status</th><th className="r">Price</th></tr></thead>
            <tbody>
              {list.map((j: any) => (
                <tr key={j.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(j.date)}{j.recurring_group && <span title="recurring"> 🔁</span>}</td>
                  <td>{j.start_time}–{j.end_time}</td>
                  <td><a href={`/jobs/${j.id}`}>{j.title || j.client || `Job #${j.id}`}</a><div className="small muted">{j.pickup} → {j.dropoff} · {j.passengers} pax</div></td>
                  <td>{j.subcontractor ? <span className="b">Sub: {j.subcontractor}</span> : j.driver || <span className="b red">—</span>}{j.driver && j.driver_ack_at && ' ✓'}</td>
                  <td>{j.fleet_no || j.rego || (j.subcontractor ? '' : <span className="b red">—</span>)}</td>
                  <td><Badge s={j.status} />{j.assignment === 'provisional' && j.driver_id && <span className="b provisional" style={{ marginLeft: 4 }}>prov.</span>}</td>
                  <td className="r">{money(j.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}
      </div>
    </>
  );
}
