import { sql, getSettings } from '@/lib/db';
import { money, fmtDate, today } from '@/lib/util';
import { Head, Field, Select } from '@/components/ui';
import { saveExpense, deleteExpense } from '../actions';

export default async function Expenses({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const month = sp.m || today().slice(0, 7);
  const [rows, buses, jobs] = await Promise.all([
    sql`select e.*, b.fleet_no, b.rego from expenses e left join buses b on b.id = e.bus_id where to_char(e.date, 'YYYY-MM') = ${month} order by date desc`,
    sql`select id, fleet_no, rego from buses order by fleet_no`,
    sql`select id, date, title from jobs where date >= current_date - 60 order by date desc limit 200`,
  ]);
  const cats = String(s.expense_categories).split('\n').map((x) => x.trim()).filter(Boolean);
  const byCat: Record<string, number> = {};
  for (const r of rows) byCat[r.category || 'Other'] = (byCat[r.category || 'Other'] || 0) + Number(r.amount);
  const prev = new Date(month + '-01T00:00:00Z'); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const next = new Date(month + '-01T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1);
  const csv = ['Date,Category,Supplier,Description,Amount,GST,Bus,Job,Receipt', ...rows.map((r: any) => [r.date, r.category, `"${r.supplier || ''}"`, `"${(r.description || '').replace(/"/g, '')}"`, r.amount, r.gst, r.fleet_no || r.rego || '', r.job_id || '', r.receipt_url || ''].join(','))].join('\n');
  return (
    <>
      <Head title="Expenses" sub={`${month} · total ${money(rows.reduce((a: number, r: any) => a + Number(r.amount), 0))} inc GST`}>
        <a className="btn sec" href={`/finance/expenses?m=${prev.toISOString().slice(0, 7)}`}>← Prev</a>
        <a className="btn sec" href={`/finance/expenses?m=${next.toISOString().slice(0, 7)}`}>Next →</a>
        <a className="btn sec" download={`expenses-${month}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>Export CSV</a>
      </Head>
      {sp.msg && <div className="alert green">{sp.msg}</div>}
      <div className="grid g2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div>
          <div className="card">
            <table>
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Tagged to</th><th className="r">Amount</th><th></th></tr></thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td><td>{r.category}{r.recurring !== 'none' && <span className="b blue" style={{ marginLeft: 4 }}>{r.recurring}</span>}</td>
                    <td>{r.description}<div className="small muted">{r.supplier} {r.receipt_url && <a href={r.receipt_url} target="_blank">📎 receipt</a>}</div></td>
                    <td>{r.bus_id ? <a href={`/fleet/${r.bus_id}`}>Bus {r.fleet_no || r.rego}</a> : r.job_id ? <a href={`/jobs/${r.job_id}`}>Job #{r.job_id}</a> : <span className="muted">Overhead</span>}</td>
                    <td className="r">{money(r.amount)}</td>
                    <td><form action={deleteExpense}><input type="hidden" name="id" value={r.id} /><button className="btn sm sec">✕</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card"><h2>By category</h2><table><tbody>{Object.entries(byCat).map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{money(v)}</td></tr>)}</tbody></table></div>
        </div>
        <form action={saveExpense} className="card">
          <h2>Add expense</h2>
          <div className="row"><Field label="Date" name="date" type="date" value={today()} /><Field label="Amount (inc GST)" name="amount" type="number" step="0.01" required /></div>
          <label style={{ display: 'flex', gap: 6, fontWeight: 500, marginBottom: 10 }}><input type="checkbox" name="has_gst" defaultChecked /> Includes GST</label>
          <Select label="Category" name="category" options={cats} />
          <Field label="Supplier" name="supplier" />
          <Field label="Description" name="description" />
          <Select label="Tag to bus" name="bus_id" blank="— not a bus cost —" options={buses.map((b: any) => ({ value: b.id, label: `${b.fleet_no || ''} ${b.rego}` }))} />
          <Select label="…or tag to a job" name="job_id" blank="— none (overhead) —" options={jobs.map((j: any) => ({ value: j.id, label: `#${j.id} ${j.date} ${j.title || ''}` }))} />
          <Select label="Repeats" name="recurring" options={[{ value: 'none', label: 'One-off' }, { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'yearly', label: 'Yearly' }]} />
          <Field label="Receipt link (Drive/Dropbox photo)" name="receipt_url" />
          <button className="btn">Add expense</button>
          <p className="small muted">Fuel card CSV import and Xero/MYOB sync are Phase 2.</p>
        </form>
      </div>
    </>
  );
}
