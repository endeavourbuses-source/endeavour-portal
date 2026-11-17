import { sql } from '@/lib/db';
import { fmtDate, today } from '@/lib/util';
import { Head, Empty } from '@/components/ui';
import { completeTask } from '../actions';

const link = (e: string, id: number) =>
  ({ enquiry: `/crm/enquiries/${id}`, quote: `/quotes/${id}`, invoice: `/finance/${id}`, client: `/clients/${id}`, job: `/jobs/${id}` } as any)[e] || '#';

export default async function Tasks() {
  const rows = await sql`select a.*, u.name uname from activities a left join users u on u.id = a.user_id
    where kind = 'task' and not done order by due_date nulls last, created_at`;
  const t = today();
  return (
    <>
      <Head title="Follow-ups & tasks" sub="Automatic quote follow-ups (3 and 7 days after sending) and invoice reminders land here, plus any task you add." />
      <div className="card">
        {rows.length === 0 ? <Empty>Nothing to follow up 🎉</Empty> : (
          <table>
            <thead><tr><th>Due</th><th>Task</th><th>For</th><th></th></tr></thead>
            <tbody>
              {rows.map((a: any) => (
                <tr key={a.id}>
                  <td><span className={`b ${a.due_date && a.due_date <= t ? 'red' : ''}`}>{a.due_date ? fmtDate(a.due_date) : '—'}</span></td>
                  <td>{a.text}</td>
                  <td><a href={link(a.entity, a.entity_id)}>{a.entity} #{a.entity_id}</a></td>
                  <td><form action={completeTask}><input type="hidden" name="id" value={a.id} /><button className="btn sm sec">Done</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
