import { sql } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { fmtDate } from '@/lib/util';
import { Badge } from '@/components/ui';
import { requestLeave } from '../actions';

export default async function DriverLeave({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const u = (await getUser())!;
  const rows = await sql`select * from leave where user_id = ${u.id} order by start_date desc limit 20`;
  const [me] = await sql`select leave_balance_hours from users where id = ${u.id}`;
  return (
    <>
      {sp.msg && <div className="alert green">{sp.msg}</div>}
      <form action={requestLeave} className="card">
        <h2>Request leave</h2>
        <p className="small muted">Balance: {Number(me?.leave_balance_hours || 0).toFixed(1)} hours</p>
        <div className="row"><div className="f"><label>From</label><input name="start_date" type="date" required /></div><div className="f"><label>To</label><input name="end_date" type="date" required /></div></div>
        <div className="row">
          <div className="f"><label>Type</label><select name="type"><option value="annual">Annual</option><option value="sick">Sick / personal</option><option value="unpaid">Unpaid</option><option value="unavailable">Unavailable (casual)</option></select></div>
          <div className="f"><label>Hours (if paid)</label><input name="hours" type="number" step="0.5" /></div>
        </div>
        <div className="f"><label>Note</label><input name="note" /></div>
        <button className="btn big">Send request</button>
      </form>
      <div className="card">
        <h2>My requests</h2>
        {rows.map((l: any) => <div key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>{fmtDate(l.start_date)} – {fmtDate(l.end_date)} · {l.type} <Badge s={l.status} /></div>)}
      </div>
    </>
  );
}
