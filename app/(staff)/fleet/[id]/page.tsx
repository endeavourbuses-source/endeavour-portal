import { sql } from '@/lib/db';
import { busServiceStatus } from '@/lib/logic';
import { money, fmtDate, fmtTs, today } from '@/lib/util';
import { Head, Field, Select, Badge } from '@/components/ui';
import { saveBus, addOdometer, addWorkshop, resolveDefect } from '../actions';

export default async function Bus({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const pid = (await params).id;
  const sp = await searchParams;
  const isNew = pid === 'new';
  const [b] = isNew ? [{ service_interval_km: 15000, service_interval_days: 180, active: true }] : await sql`select * from buses where id = ${Number(pid)}`;
  if (!b) return <p>Not found</p>;
  const [odo, work, defects, exps, jobs] = isNew ? [[], [], [], [], []] : await Promise.all([
    sql`select * from odometer_log where bus_id = ${b.id} order by at desc limit 15`,
    sql`select * from workshop where bus_id = ${b.id} order by date desc`,
    sql`select d.*, u.name reporter from defects d left join users u on u.id = d.reported_by where bus_id = ${b.id} order by status desc, created_at desc limit 30`,
    sql`select category, sum(amount)::numeric total from expenses where bus_id = ${b.id} group by category order by total desc`,
    sql`select count(*)::int n, coalesce(sum(price),0)::numeric rev, coalesce(sum(odo_end - odo_start) filter (where odo_end > odo_start),0)::int km from jobs where bus_id = ${b.id} and status = 'completed'`,
  ]);
  const st = isNew ? null : await busServiceStatus(b);
  const totalCost = exps.reduce((s: number, e: any) => s + Number(e.total), 0);
  const kmTracked = odo.length > 1 ? Math.max(...odo.map((o: any) => o.reading)) - Math.min(...odo.map((o: any) => o.reading)) : jobs[0]?.km || 0;
  const openDefects = defects.filter((d: any) => d.status === 'open');
  return (
    <>
      <Head title={isNew ? 'Add bus' : `Bus ${b.fleet_no || ''} ${b.rego || ''}`} sub={isNew ? '' : `${b.make_model || ''} · ${b.seats} seats · ${b.bus_class || ''}`} />
      {sp.msg && <div className="alert green">{sp.msg}</div>}
      {st?.overdue && <div className="alert red">Service overdue – this bus is blocked from new job assignments.</div>}
      <div className="grid g2">
        <div>
          {!isNew && (
            <div className="grid g3" style={{ marginBottom: 16 }}>
              <div className="stat"><div className="n">{Number(b.odometer).toLocaleString()}</div><div className="l">Odometer (km)</div></div>
              <div className="stat"><div className="n">{st!.kmLeft != null ? st!.kmLeft.toLocaleString() : '—'}</div><div className="l">km to service {st!.dueDate ? `· or by ${st!.dueDate}` : ''}</div></div>
              <div className="stat"><div className="n">{kmTracked > 0 ? money(totalCost / kmTracked) : '—'}</div><div className="l">Cost per km ({money(totalCost)} / {kmTracked.toLocaleString()} km)</div></div>
            </div>
          )}
          {!isNew && (
            <div className="card">
              <h2>Defects ({openDefects.length} open)</h2>
              <table><tbody>
                {defects.map((d: any) => (
                  <tr key={d.id}><td><Badge s={d.severity} /></td><td>{d.description}<div className="small muted">{d.reporter} · {fmtTs(d.created_at)} {d.job_id && <a href={`/jobs/${d.job_id}`}>job #{d.job_id}</a>}</div></td>
                    <td>{d.status === 'open' ? (
                      <form action={resolveDefect} className="row"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={`/fleet/${b.id}`} />
                        <input name="resolution" placeholder="How fixed" /><button className="btn sm auto">Fixed</button></form>
                    ) : <span className="b green">fixed {d.resolution}</span>}</td></tr>
                ))}
              </tbody></table>
            </div>
          )}
          {!isNew && (
            <form action={addWorkshop} className="card">
              <h2>Workshop log – add service / repair</h2>
              <input type="hidden" name="bus_id" value={b.id} />
              <div className="row">
                <Select label="Type" name="kind" options={['service', 'repair', 'inspection', 'tyres', 'other']} />
                <Field label="Date" name="date" type="date" value={today()} />
                <Field label="Odometer" name="odometer" type="number" value={b.odometer} />
              </div>
              <Field label="Work done / parts" name="description" />
              <div className="row"><Field label="Parts $ (inc GST)" name="parts_cost" type="number" step="0.01" /><Field label="Labour $ (inc GST)" name="labour_cost" type="number" step="0.01" /><Field label="Supplier / mechanic" name="supplier" /></div>
              {openDefects.length > 0 && <div className="f"><label>Fixes these defects</label>{openDefects.map((d: any) => <label key={d.id} style={{ fontWeight: 500, display: 'flex', gap: 6 }}><input type="checkbox" name="fix_defect" value={d.id} /> {d.description}</label>)}</div>}
              <p className="small muted">A “service” resets the service counter. Costs are added to expenses against this bus.</p>
              <button className="btn">Add to log</button>
              <table style={{ marginTop: 12 }}><tbody>
                {work.map((w: any) => <tr key={w.id}><td>{fmtDate(w.date)}</td><td><Badge s="blue">{w.kind}</Badge></td><td>{w.description}<div className="small muted">{w.supplier} · {w.odometer?.toLocaleString()} km</div></td><td className="r">{money(Number(w.parts_cost) + Number(w.labour_cost))}</td></tr>)}
              </tbody></table>
            </form>
          )}
          {!isNew && (
            <div className="card">
              <h2>Odometer history</h2>
              <form action={addOdometer} className="row"><input type="hidden" name="bus_id" value={b.id} />
                <div className="f"><label>New reading</label><input name="reading" type="number" required /></div><div className="f auto"><button className="btn sec">Add</button></div></form>
              <table><tbody>{odo.map((o: any) => <tr key={o.id}><td>{fmtTs(o.at)}</td><td>{o.reading.toLocaleString()} km</td><td className="small muted">{o.source}{o.job_id ? ` · job #${o.job_id}` : ''}</td></tr>)}</tbody></table>
              <p className="small muted">Driver sign on/off readings are added automatically. GPS odometer feed is Phase 2.</p>
            </div>
          )}
          {!isNew && (
            <div className="card"><h2>Costs by category</h2><table><tbody>{exps.map((e: any) => <tr key={e.category}><td>{e.category}</td><td className="r">{money(e.total)}</td></tr>)}</tbody></table>
              <p className="small">Completed jobs: {jobs[0].n} · revenue {money(jobs[0].rev)}</p></div>
          )}
        </div>
        <form action={saveBus} className="card">
          {!isNew && <input type="hidden" name="id" value={b.id} />}
          <h2>Bus register</h2>
          <div className="row"><Field label="Fleet no." name="fleet_no" value={b.fleet_no} /><Field label="Rego" name="rego" value={b.rego} required /></div>
          <div className="row"><Field label="VIN" name="vin" value={b.vin} /><Field label="Make / model" name="make_model" value={b.make_model} /></div>
          <div className="row">
            <Field label="Seats" name="seats" type="number" value={b.seats} required />
            <Select label="Class" name="bus_class" value={b.bus_class} options={[{ value: 'mini', label: 'Minibus (LR)' }, { value: 'midi', label: 'Midi (MR)' }, { value: 'coach', label: 'Coach (HR)' }]} />
            {isNew && <Field label="Current odometer" name="odometer" type="number" />}
          </div>
          <Field label="Features (wheelchair lift, seatbelts, AC, toilet, USB…)" name="features" value={b.features} />
          <h3 style={{ marginTop: 10 }}>Service schedule</h3>
          <div className="row"><Field label="Every (km)" name="service_interval_km" type="number" value={b.service_interval_km} /><Field label="or every (days)" name="service_interval_days" type="number" value={b.service_interval_days} /></div>
          <div className="row"><Field label="Last service km" name="last_service_km" type="number" value={b.last_service_km} /><Field label="Last service date" name="last_service_date" type="date" value={b.last_service_date} /></div>
          <h3 style={{ marginTop: 10 }}>Expiries</h3>
          <div className="row"><Field label="Rego" name="rego_expiry" type="date" value={b.rego_expiry} /><Field label="Insurance" name="insurance_expiry" type="date" value={b.insurance_expiry} /><Field label="Inspection / RWC" name="inspection_expiry" type="date" value={b.inspection_expiry} /></div>
          <Field label="Notes" name="notes" type="textarea" value={b.notes} />
          {!isNew && <Select label="Status" name="active" value={b.active ? 'on' : 'off'} options={[{ value: 'on', label: 'Active' }, { value: 'off', label: 'Off road / sold' }]} />}
          <button className="btn">{isNew ? 'Add bus' : 'Save'}</button>
        </form>
      </div>
    </>
  );
}
