import { sql } from '@/lib/db';
import { money } from '@/lib/util';
import { Head } from '@/components/ui';

export default async function SalesReports() {
  const bySource = await sql`select coalesce(source,'unknown') source, count(*)::int n,
      count(*) filter (where status='won')::int won, count(*) filter (where status='lost')::int lost
    from enquiries group by 1 order by n desc`;
  const reasons = await sql`select status, coalesce(outcome_reason,'(no reason given)') reason, count(*)::int n
    from enquiries where status in ('won','lost') group by 1,2 order by status, n desc`;
  const quotes = await sql`select count(*)::int sent, count(*) filter (where status='accepted')::int acc,
      coalesce(sum(subtotal) filter (where status='accepted'),0)::numeric won_val,
      coalesce(sum(subtotal) filter (where status='sent'),0)::numeric open_val,
      coalesce(avg(extract(epoch from (accepted_at - sent_at))/86400) filter (where status='accepted'),0)::numeric days
    from quotes where sent_at is not null`;
  const monthly = await sql`select to_char(created_at,'YYYY-MM') m, count(*)::int enq,
      count(*) filter (where status='won')::int won from enquiries group by 1 order by 1 desc limit 12`;
  const q = quotes[0];
  const rate = (w: number, l: number) => (w + l ? Math.round((w / (w + l)) * 100) + '%' : '—');
  return (
    <>
      <Head title="Sales reports" sub="Win/loss reasons, conversion rates and lead sources" />
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="n">{q.sent}</div><div className="l">Quotes sent (all time)</div></div>
        <div className="stat"><div className="n">{q.sent ? Math.round((q.acc / q.sent) * 100) : 0}%</div><div className="l">Quote → accepted</div></div>
        <div className="stat"><div className="n">{money(q.won_val)}</div><div className="l">Won value (ex GST)</div></div>
        <div className="stat"><div className="n">{Number(q.days).toFixed(1)}</div><div className="l">Avg days to accept</div></div>
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>By lead source</h2>
          <table>
            <thead><tr><th>Source</th><th className="r">Enquiries</th><th className="r">Won</th><th className="r">Lost</th><th className="r">Win rate</th></tr></thead>
            <tbody>{bySource.map((r: any) => <tr key={r.source}><td>{r.source}</td><td className="r">{r.n}</td><td className="r">{r.won}</td><td className="r">{r.lost}</td><td className="r">{rate(r.won, r.lost)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <h2>Win / loss reasons</h2>
          <table>
            <tbody>{reasons.map((r: any, i: number) => <tr key={i}><td><span className={`b ${r.status}`}>{r.status}</span></td><td>{r.reason}</td><td className="r">{r.n}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <h2>By month</h2>
          <table>
            <thead><tr><th>Month</th><th className="r">Enquiries</th><th className="r">Won</th></tr></thead>
            <tbody>{monthly.map((r: any) => <tr key={r.m}><td>{r.m}</td><td className="r">{r.enq}</td><td className="r">{r.won}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
