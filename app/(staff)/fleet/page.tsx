import { sql } from '@/lib/db';
import { busServiceStatus } from '@/lib/logic';
import { today, addDays, money } from '@/lib/util';
import { Head } from '@/components/ui';

function Exp({ d }: { d?: string }) {
  if (!d) return <span className="muted">—</span>;
  const t = today();
  return <span className={`b ${d < t ? 'red' : d <= addDays(t, 30) ? 'amber' : 'green'}`}>{d}</span>;
}

export default async function Fleet() {
  const buses = await sql`select b.*,
      (select count(*) from defects d where d.bus_id = b.id and d.status = 'open')::int defects,
      (select coalesce(sum(amount),0) from expenses e where e.bus_id = b.id)::numeric cost,
      (select max(reading) - min(reading) from odometer_log o where o.bus_id = b.id)::int km
    from buses b order by active desc, fleet_no`;
  const withStatus = await Promise.all(buses.map(async (b: any) => ({ ...b, st: await busServiceStatus(b) })));
  return (
    <>
      <Head title="Fleet" sub="Buses with an overdue service, expired rego/insurance/inspection or a critical defect are blocked from jobs.">
        <a className="btn" href="/fleet/new">+ Add bus</a>
        <a className="btn sec" href="/fleet/defects">Defect queue</a>
      </Head>
      <div className="card">
        <table>
          <thead><tr><th>Bus</th><th>Seats</th><th>Odometer</th><th>Next service</th><th>Rego</th><th>Insurance</th><th>Inspection</th><th>Defects</th><th className="r">Cost/km</th></tr></thead>
          <tbody>
            {withStatus.map((b: any) => (
              <tr key={b.id} style={{ opacity: b.active ? 1 : 0.5 }}>
                <td><a href={`/fleet/${b.id}`}><b>{b.fleet_no || '—'}</b> {b.rego}</a><div className="small muted">{b.make_model} · {b.bus_class}</div></td>
                <td>{b.seats}</td>
                <td>{Number(b.odometer).toLocaleString()} km</td>
                <td><span className={`b ${b.st.overdue ? 'red' : b.st.dueSoon ? 'amber' : 'green'}`}>{b.st.overdue ? 'OVERDUE' : `${b.st.kmLeft != null ? b.st.kmLeft.toLocaleString() + ' km' : ''}${b.st.dueDate ? ' / ' + b.st.dueDate : ''}`}</span></td>
                <td><Exp d={b.rego_expiry} /></td><td><Exp d={b.insurance_expiry} /></td><td><Exp d={b.inspection_expiry} /></td>
                <td>{b.defects ? <span className="b amber">{b.defects} open</span> : ''}</td>
                <td className="r">{b.km > 0 ? money(b.cost / b.km) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
