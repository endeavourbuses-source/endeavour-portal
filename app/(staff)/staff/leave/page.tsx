import { sql } from '@/lib/db';
import { fmtDate, today } from '@/lib/util';
import { Head, Badge, Field, Select } from '@/components/ui';
import { decideLeave, addLeave } from '../actions';

export default async function Leave() {
  const t = today();
  const [pending, upcoming, staff] = await Promise.all([
    sql`select l.*, u.name, u.leave_balance_hours from leave l join users u on u.id = l.user_id where l.status = 'pending' order by start_date`,
    sql`select l.*, u.name from leave l join users u on u.id = l.user_id where l.status <> 'pending' and end_date >= ${t} order by start_date`,
    sql`select id, name, leave_balance_hours from users where active order by name`,
  ]);
  const clashes = async (l: any) => (await sql`select count(*)::int n from jobs where driver_id = ${l.user_id} and date between ${l.start_date} and ${l.end_date} and status not in ('cancelled','completed')`)[0].n;
  const pend = await Promise.all(pending.map(async (l: any) => ({ ...l, clash: await clashes(l) })));
  return (
    <>
      <Head title="Leave" sub="Approved leave blocks drivers from being assigned." />
      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Waiting for approval</h2>
            {pend.length === 0 && <p className="muted">None.</p>}
            {pend.map((l: any) => (
              <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <b>{l.name}</b> · {l.type} · {fmtDate(l.start_date)} – {fmtDate(l.end_date)} {l.hours > 0 && `(${l.hours}h, balance ${Number(l.leave_balance_hours).toFixed(1)}h)`}
                {l.note && <div className="small muted">{l.note}</div>}
                {l.clash > 0 && <div className="small" style={{ color: 'var(--red)' }}>⚠️ Assigned to {l.clash} job(s) in this period – reassign after approving.</div>}
                <div className="actions" style={{ marginTop: 6 }}>
                  {['approved', 'declined'].map((s) => (
                    <form key={s} action={decideLeave}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value={s} />
                      <button className={`btn sm ${s === 'declined' ? 'sec' : ''}`}>{s === 'approved' ? 'Approve' : 'Decline'}</button></form>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Leave calendar (current & upcoming)</h2>
            <table><tbody>
              {upcoming.map((l: any) => <tr key={l.id}><td>{l.name}</td><td>{fmtDate(l.start_date)} – {fmtDate(l.end_date)}</td><td>{l.type}</td><td><Badge s={l.status} /></td></tr>)}
            </tbody></table>
          </div>
        </div>
        <div>
          <form action={addLeave} className="card">
            <h2>Enter leave for someone</h2>
            <Select label="Staff" name="user_id" options={staff.map((s: any) => ({ value: s.id, label: s.name }))} />
            <div className="row"><Field label="From" name="start_date" type="date" required /><Field label="To" name="end_date" type="date" required /></div>
            <div className="row"><Select label="Type" name="type" options={['annual', 'sick', 'unpaid', 'unavailable', 'long service']} /><Field label="Hours" name="hours" type="number" step="0.5" /></div>
            <Field label="Note" name="note" />
            <button className="btn">Add (pending)</button>
          </form>
          <div className="card">
            <h2>Balances</h2>
            <table><tbody>{staff.map((s: any) => <tr key={s.id}><td>{s.name}</td><td className="r">{Number(s.leave_balance_hours).toFixed(1)} h</td></tr>)}</tbody></table>
          </div>
        </div>
      </div>
    </>
  );
}
