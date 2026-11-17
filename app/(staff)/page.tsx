import { sql } from '@/lib/db';
import { getAlerts } from '@/lib/logic';
import { today, addDays, weekStart, money, fmtDate, hoursBetweenTimes } from '@/lib/util';
import { Badge, Head, Empty } from '@/components/ui';

export default async function Dashboard() {
  const t = today();
  const ws = weekStart(t), we = addDays(ws, 6);
  const monthStart = t.slice(0, 8) + '01';
  const [todayJobs, alerts, weekStats, sales, rev, debt, util, leaveNow, staffHours] = await Promise.all([
    sql`select j.*, c.name client, u.name driver, b.fleet_no, b.rego from jobs j left join clients c on c.id=j.client_id
        left join users u on u.id=j.driver_id left join buses b on b.id=j.bus_id where j.date = ${t} order by j.start_time`,
    getAlerts(),
    sql`select count(*)::int total, count(*) filter (where driver_id is null or bus_id is null)::int unassigned,
        count(*) filter (where status='completed')::int done from jobs where date between ${ws} and ${we} and status<>'cancelled'`,
    sql`select count(*) filter (where sent_at >= ${monthStart})::int sent,
        count(*) filter (where status='accepted' and accepted_at >= ${monthStart})::int won,
        coalesce(sum(subtotal) filter (where status in ('sent')),0)::numeric pipeline from quotes`,
    sql`select coalesce(sum(subtotal),0)::numeric rev from invoices where kind='invoice' and status<>'void' and status<>'draft' and issue_date >= ${monthStart}`,
    sql`select coalesce(sum(i.total - coalesce((select sum(amount) from payments p where p.invoice_id=i.id),0)),0)::numeric owing
        from invoices i where status='sent'`,
    sql`select count(distinct bus_id)::int used, (select count(*)::int from buses where active) total from jobs where date = ${t} and status <> 'cancelled' and bus_id is not null`,
    sql`select u.name, l.type, l.end_date from leave l join users u on u.id=l.user_id where l.status='approved' and ${t} between l.start_date and l.end_date`,
    sql`select u.name, j.start_time, j.end_time from jobs j join users u on u.id=j.driver_id where j.date between ${ws} and ${we} and j.status<>'cancelled'`,
  ]);
  const enq = await sql`select status, count(*)::int n from enquiries group by status`;
  const enqN = (s: string) => enq.find((e: any) => e.status === s)?.n || 0;
  const conv = enqN('won') + enqN('lost') > 0 ? Math.round((enqN('won') / (enqN('won') + enqN('lost'))) * 100) : 0;
  const hours: Record<string, number> = {};
  for (const r of staffHours) hours[r.name] = (hours[r.name] || 0) + hoursBetweenTimes(r.start_time, r.end_time);
  const busesOut = todayJobs.filter((j: any) => j.status === 'in_progress').length;

  return (
    <>
      <Head title="Dashboard" sub={fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
        <a className="btn" href="/crm/enquiries/new">+ Enquiry</a>
        <a className="btn sec" href="/jobs/new">+ Job</a>
      </Head>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="n">{todayJobs.filter((j: any) => j.status !== 'cancelled').length}</div><div className="l">Jobs today · {busesOut} bus(es) out now</div></div>
        <div className="stat"><div className="n">{weekStats[0].total}</div><div className="l">Jobs this week · {weekStats[0].done} done</div></div>
        <div className="stat"><div className="n" style={{ color: weekStats[0].unassigned ? 'var(--red)' : undefined }}>{weekStats[0].unassigned}</div><div className="l">Unassigned this week</div></div>
        <div className="stat"><div className="n">{util[0].used}/{util[0].total}</div><div className="l">Fleet in use today</div></div>
      </div>
      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Today's jobs</h2>
            {todayJobs.length === 0 ? <Empty>No jobs today.</Empty> : (
              <table>
                <tbody>
                  {todayJobs.map((j: any) => (
                    <tr key={j.id}>
                      <td><b>{j.start_time}</b>–{j.end_time}</td>
                      <td><a href={`/jobs/${j.id}`}>{j.title || j.client || `Job #${j.id}`}</a><div className="small muted">{j.pickup} → {j.dropoff}</div></td>
                      <td>{j.driver || <span className="b red">No driver</span>}<div className="small muted">{j.fleet_no || j.rego || 'No bus'}</div></td>
                      <td><Badge s={j.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2>Sales (this month)</h2>
            <div className="grid g3">
              <div><div className="stat-n" style={{ fontSize: 22, fontWeight: 700 }}>{sales[0].sent}</div><div className="small muted">Quotes sent</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700 }}>{conv}%</div><div className="small muted">Win rate (all time)</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(sales[0].pipeline)}</div><div className="small muted">Open pipeline (ex GST)</div></div>
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              Pipeline: {enqN('enquiry')} enquiries · {enqN('quoted')} quoted · {enqN('follow_up')} follow-up · {enqN('won')} won · {enqN('lost')} lost
            </div>
          </div>
          <div className="card">
            <h2>Money</h2>
            <div className="grid g2">
              <div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(rev[0].rev)}</div><div className="small muted">Invoiced this month (ex GST)</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(debt[0].owing)}</div><div className="small muted">Owed by clients (debtors)</div></div>
            </div>
            <div style={{ marginTop: 8 }}><a href="/finance/reports">Profit by job / client / bus →</a></div>
          </div>
        </div>
        <div>
          <div className="card">
            <h2>Alerts</h2>
            {alerts.length === 0 ? <div className="alert green">All clear ✅</div> : alerts.map((a, i) => (
              <a key={i} href={a.href} className={`alert ${a.level}`}>{a.text}</a>
            ))}
          </div>
          <div className="card">
            <h2>Staff this week</h2>
            {leaveNow.length > 0 && <div className="small" style={{ marginBottom: 8 }}>On leave today: {leaveNow.map((l: any) => `${l.name} (${l.type}, back after ${fmtDate(l.end_date)})`).join(', ')}</div>}
            <table>
              <thead><tr><th>Driver</th><th className="r">Rostered hours</th></tr></thead>
              <tbody>
                {Object.entries(hours).sort((a, b) => b[1] - a[1]).map(([n, h]) => (
                  <tr key={n}><td>{n}</td><td className="r">{h.toFixed(1)}</td></tr>
                ))}
              </tbody>
            </table>
            {Object.keys(hours).length === 0 && <Empty>No rostered hours yet.</Empty>}
          </div>
        </div>
      </div>
    </>
  );
}
