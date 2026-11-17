import { sql } from '@/lib/db';
import { fmtTs } from '@/lib/util';
import { Head, Badge, Field, Select } from '@/components/ui';
import { resolveDefect, addDefect } from '../actions';

export default async function Defects() {
  const [open, buses] = await Promise.all([
    sql`select d.*, b.fleet_no, b.rego, u.name reporter from defects d join buses b on b.id = d.bus_id left join users u on u.id = d.reported_by
      where d.status = 'open' order by case severity when 'critical' then 0 when 'major' then 1 else 2 end, created_at`,
    sql`select id, fleet_no, rego from buses where active order by fleet_no`,
  ]);
  return (
    <>
      <Head title="Defect queue" sub="Defects from driver pre-trip checks. Critical defects block the bus from jobs until fixed." />
      <div className="grid g2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          {open.length === 0 && <p className="muted">No open defects 👍</p>}
          <table><tbody>
            {open.map((d: any) => (
              <tr key={d.id}>
                <td><Badge s={d.severity} /></td>
                <td><a href={`/fleet/${d.bus_id}`}><b>{d.fleet_no || d.rego}</b></a> – {d.description}<div className="small muted">{d.reporter} · {fmtTs(d.created_at)}{d.job_id ? <> · <a href={`/jobs/${d.job_id}`}>job #{d.job_id}</a></> : ''}</div></td>
                <td><form action={resolveDefect} className="row"><input type="hidden" name="id" value={d.id} /><input name="resolution" placeholder="How fixed" /><button className="btn sm auto">Fixed</button></form></td>
              </tr>
            ))}
          </tbody></table>
        </div>
        <form action={addDefect} className="card">
          <h2>Log a defect</h2>
          <Select label="Bus" name="bus_id" options={buses.map((b: any) => ({ value: b.id, label: `${b.fleet_no || ''} ${b.rego}` }))} />
          <Field label="Description" name="description" required />
          <Select label="Severity" name="severity" options={['minor', 'major', 'critical']} />
          <button className="btn">Add</button>
        </form>
      </div>
    </>
  );
}
