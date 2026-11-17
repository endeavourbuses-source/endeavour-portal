import { sql } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { fmtDate, today, addDays, weekStart } from '@/lib/util';

export default async function DriverHours() {
  const u = (await getUser())!;
  const ws = weekStart(today());
  const rows = await sql`select date, title, signon_at, signoff_at, break_minutes from jobs where driver_id = ${u.id}
    and signon_at is not null and date between ${addDays(ws, -14)} and ${addDays(ws, 6)} order by date desc`;
  const hrs = (r: any) => r.signoff_at ? Math.max(0, (new Date(r.signoff_at).getTime() - new Date(r.signon_at).getTime()) / 3600000 - (r.break_minutes || 0) / 60) : 0;
  const thisWeek = rows.filter((r: any) => r.date >= ws).reduce((s: number, r: any) => s + hrs(r), 0);
  return (
    <div className="card">
      <h2>My hours</h2>
      <p>This week: <b>{thisWeek.toFixed(2)} h</b></p>
      <table><tbody>
        {rows.map((r: any, i: number) => <tr key={i}><td>{fmtDate(r.date)}</td><td>{r.title}</td><td className="r">{r.signoff_at ? hrs(r).toFixed(2) + ' h' : 'in progress'}</td></tr>)}
      </tbody></table>
    </div>
  );
}
