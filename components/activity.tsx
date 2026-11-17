import { sql } from '@/lib/db';
import { fmtTs, fmtDate } from '@/lib/util';
import { addActivity, completeTask } from '@/app/(staff)/crm/actions';

export async function ActivityLog({ entity, id, back }: { entity: string; id: number; back: string }) {
  const rows = await sql`select a.*, u.name uname from activities a left join users u on u.id = a.user_id
    where entity = ${entity} and entity_id = ${id} order by created_at desc`;
  const icon: Record<string, string> = { call: '📞', email: '✉️', note: '📝', task: '✅', system: '⚙️' };
  return (
    <div className="card">
      <h2>Activity & follow-ups</h2>
      <form action={addActivity}>
        <input type="hidden" name="entity" value={entity} />
        <input type="hidden" name="entity_id" value={id} />
        <input type="hidden" name="back" value={back} />
        <div className="row">
          <div className="auto" style={{ width: 110 }}>
            <label>Type</label>
            <select name="kind" defaultValue="note">
              <option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="task">Task</option>
            </select>
          </div>
          <div style={{ flex: 3 }}><label>Details</label><input name="text" required placeholder="e.g. Called Sarah, she's checking numbers" /></div>
          <div className="auto" style={{ width: 150 }}><label>Due (tasks)</label><input name="due_date" type="date" /></div>
          <div className="auto"><button className="btn">Add</button></div>
        </div>
      </form>
      <table style={{ marginTop: 10 }}>
        <tbody>
          {rows.map((a: any) => (
            <tr key={a.id}>
              <td style={{ width: 28 }}>{icon[a.kind] || '•'}</td>
              <td>
                <span style={{ textDecoration: a.done ? 'line-through' : undefined }}>{a.text}</span>
                {a.kind === 'task' && a.due_date && <span className={`b ${a.done ? 'green' : 'amber'}`} style={{ marginLeft: 6 }}>due {fmtDate(a.due_date)}</span>}
              </td>
              <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{a.uname || 'system'} · {fmtTs(a.created_at)}</td>
              <td>
                {a.kind === 'task' && !a.done && (
                  <form action={completeTask}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} /><button className="btn sm sec">Done</button></form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
