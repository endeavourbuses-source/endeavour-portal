import { sql } from '@/lib/db';
import { money, today } from '@/lib/util';
import { Head } from '@/components/ui';

export default async function Profit({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const from = sp.from || today().slice(0, 4) + '-01-01';
  const to = sp.to || today();
  // revenue per job = invoiced ex GST (non-void, non-draft); cost = expenses tagged to the job + subcontract + km x bus cost/km
  const busCpk = await sql`select b.id, b.fleet_no, b.rego,
      coalesce((select sum(amount - gst) from expenses e where e.bus_id = b.id and e.date between ${from} and ${to}),0)::numeric cost,
      coalesce((select max(reading)-min(reading) from odometer_log o where o.bus_id = b.id and o.at::date between ${from} and ${to}),0)::int km,
      coalesce((select sum(i.subtotal) from invoices i join jobs j on j.id = i.job_id where j.bus_id = b.id and i.status in ('sent','paid') and i.issue_date between ${from} and ${to}),0)::numeric rev,
      (select count(*) from jobs j where j.bus_id = b.id and j.status='completed' and j.date between ${from} and ${to})::int jobs,
      (select count(distinct date) from jobs j where j.bus_id = b.id and j.status <> 'cancelled' and j.date between ${from} and ${to})::int days_used
    from buses b order by b.fleet_no`;
  const cpk: Record<number, number> = {};
  for (const b of busCpk) cpk[b.id] = b.km > 0 ? Number(b.cost) / b.km : 0;
  const jobs = await sql`select j.id, j.date, j.title, j.bus_id, j.client_id, c.name client, j.subcontract_cost,
      coalesce(j.odo_end - j.odo_start, 0)::int km,
      coalesce((select sum(subtotal) from invoices i where i.job_id = j.id and i.status in ('sent','paid')),0)::numeric rev,
      coalesce((select sum(amount - gst) from expenses e where e.job_id = j.id),0)::numeric direct
    from jobs j left join clients c on c.id = j.client_id where j.status = 'completed' and j.date between ${from} and ${to} order by j.date desc`;
  const jp = jobs.map((j: any) => {
    const cost = Number(j.direct) + Number(j.subcontract_cost || 0) + (j.bus_id ? cpk[j.bus_id] * Math.max(0, j.km) : 0);
    return { ...j, cost, profit: Number(j.rev) - cost };
  });
  const byClient: Record<string, { rev: number; cost: number; n: number }> = {};
  for (const j of jp) { const k = j.client || 'No client'; byClient[k] ||= { rev: 0, cost: 0, n: 0 }; byClient[k].rev += Number(j.rev); byClient[k].cost += j.cost; byClient[k].n++; }
  const [over] = await sql`select coalesce(sum(amount - gst),0)::numeric v from expenses where bus_id is null and job_id is null and date between ${from} and ${to}`;
  const [rev] = await sql`select coalesce(sum(subtotal),0)::numeric v from invoices where status in ('sent','paid') and issue_date between ${from} and ${to}`;
  const [allCost] = await sql`select coalesce(sum(amount - gst),0)::numeric v from expenses where date between ${from} and ${to}`;
  const totalDays = Math.max(1, (Date.parse(to) - Date.parse(from)) / 86400000 + 1);
  return (
    <>
      <Head title="Profit reports" sub="All figures ex GST. Job cost = expenses tagged to the job + subcontract + km × that bus's cost per km.">
        <form className="row"><input type="date" name="from" defaultValue={from} /><input type="date" name="to" defaultValue={to} /><button className="btn sec auto">Apply</button></form>
      </Head>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="n">{money(rev.v)}</div><div className="l">Revenue</div></div>
        <div className="stat"><div className="n">{money(allCost.v)}</div><div className="l">All expenses</div></div>
        <div className="stat"><div className="n" style={{ color: Number(rev.v) - Number(allCost.v) < 0 ? 'var(--red)' : 'var(--green)' }}>{money(Number(rev.v) - Number(allCost.v))}</div><div className="l">Net (before wages if not entered)</div></div>
        <div className="stat"><div className="n">{money(over.v)}</div><div className="l">Overheads</div></div>
      </div>
      <div className="card">
        <h2>Per bus – utilisation & cost per km</h2>
        <table>
          <thead><tr><th>Bus</th><th className="r">Jobs</th><th className="r">Days used</th><th className="r">Utilisation</th><th className="r">Km</th><th className="r">Costs</th><th className="r">Cost/km</th><th className="r">Revenue</th><th className="r">Profit</th></tr></thead>
          <tbody>{busCpk.map((b: any) => (
            <tr key={b.id}><td>{b.fleet_no || b.rego}</td><td className="r">{b.jobs}</td><td className="r">{b.days_used}</td><td className="r">{Math.round((b.days_used / totalDays) * 100)}%</td>
              <td className="r">{b.km.toLocaleString()}</td><td className="r">{money(b.cost)}</td><td className="r">{b.km ? money(cpk[b.id]) : '—'}</td><td className="r">{money(b.rev)}</td><td className="r">{money(Number(b.rev) - Number(b.cost))}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>Per client</h2>
          <table><thead><tr><th>Client</th><th className="r">Jobs</th><th className="r">Revenue</th><th className="r">Profit</th></tr></thead>
            <tbody>{Object.entries(byClient).sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{v.n}</td><td className="r">{money(v.rev)}</td><td className="r">{money(v.rev - v.cost)}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Per job</h2>
          <table><thead><tr><th>Job</th><th className="r">Revenue</th><th className="r">Cost</th><th className="r">Profit</th></tr></thead>
            <tbody>{jp.slice(0, 100).map((j: any) => <tr key={j.id}><td><a href={`/jobs/${j.id}`}>{j.date} {j.title || '#' + j.id}</a></td><td className="r">{money(j.rev)}</td><td className="r">{money(j.cost)}</td><td className="r" style={{ color: j.profit < 0 ? 'var(--red)' : undefined }}>{money(j.profit)}</td></tr>)}</tbody></table>
        </div>
      </div>
    </>
  );
}
