import { sql, getSettings } from '@/lib/db';
import { today, addDays, weekStart, fmtDate, fmtTs, dow } from '@/lib/util';
import { Head } from '@/components/ui';

export default async function Timesheets({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const ws = weekStart(sp.week || today());
  const we = addDays(ws, 6);
  const rows = await sql`select j.id, j.date, j.title, j.signon_at, j.signoff_at, j.break_minutes, u.id uid, u.name, u.employment_type
    from jobs j join users u on u.id = j.driver_id where j.date between ${ws} and ${we} and j.signon_at is not null order by u.name, j.date, j.signon_at`;
  const hrs = (r: any) => (r.signoff_at ? Math.max(0, (new Date(r.signoff_at).getTime() - new Date(r.signon_at).getTime()) / 3600000 - (r.break_minutes || 0) / 60) : 0);
  const byDriver: Record<string, any[]> = {};
  for (const r of rows) (byDriver[r.name] ||= []).push(r);
  const csv = ['Driver,Date,Job,Sign on,Sign off,Break (min),Hours,Flags', ...rows.map((r: any) => [r.name, r.date, `"${(r.title || '').replace(/"/g, '')}"`, fmtTs(r.signon_at), fmtTs(r.signoff_at), r.break_minutes || 0, hrs(r).toFixed(2), flags(r).join(' ')].join(','))].join('\n');
  function flags(r: any) {
    const f: string[] = [];
    const d = dow(r.date);
    if (d === 6) f.push('Saturday');
    if (d === 0) f.push('Sunday');
    if (hrs(r) > Number(s.max_shift_hours)) f.push('Over max shift');
    if (hrs(r) > 5 && !(r.break_minutes > 0)) f.push('No break >5h');
    if (!r.signoff_at) f.push('Not signed off');
    return f;
  }
  return (
    <>
      <Head title="Timesheets" sub={`From driver sign on/off · week of ${fmtDate(ws, { day: 'numeric', month: 'long' })}`}>
        <a className="btn sec" href={`/staff/timesheets?week=${addDays(ws, -7)}`}>← Prev</a>
        <a className="btn sec" href={`/staff/timesheets?week=${addDays(ws, 7)}`}>Next →</a>
        <a className="btn" download={`timesheets-${ws}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>Export CSV for payroll</a>
      </Head>
      {Object.keys(byDriver).length === 0 && <div className="card muted">No signed-on jobs this week.</div>}
      {Object.entries(byDriver).map(([name, list]) => {
        const total = list.reduce((a, r) => a + hrs(r), 0);
        const ot = Math.max(0, total - 38);
        const dayTotals: Record<string, number> = {};
        for (const r of list) dayTotals[r.date] = (dayTotals[r.date] || 0) + hrs(r);
        return (
          <div className="card" key={name}>
            <h2>{name} <span className="muted">· {total.toFixed(2)} h{list[0].employment_type === 'full-time' && ot > 0 ? ` · overtime ${ot.toFixed(2)} h` : ''}{total > Number(s.max_week_hours) ? ' · ⚠️ over weekly fatigue limit' : ''}</span></h2>
            <table>
              <thead><tr><th>Date</th><th>Job</th><th>On</th><th>Off</th><th className="r">Break</th><th className="r">Hours</th><th>Flags</th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.id}><td>{fmtDate(r.date)}</td><td><a href={`/jobs/${r.id}`}>{r.title}</a></td><td>{fmtTs(r.signon_at)}</td><td>{fmtTs(r.signoff_at)}</td>
                  <td className="r">{r.break_minutes || 0}m</td><td className="r">{hrs(r).toFixed(2)}</td>
                  <td>{[...flags(r), ...(dayTotals[r.date] > Number(s.max_shift_hours) ? ['Day over limit'] : [])].map((f) => <span key={f} className="b amber" style={{ marginRight: 4 }}>{f}</span>)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        );
      })}
      <p className="small muted">Penalty-rate flags (weekend, long shifts, missed breaks) are for checking before payroll. Overtime assumes a 38-hour week for full-time staff. Payroll provider sync (pay runs, STP, super, payslips) is Phase 2 – for now export the CSV.</p>
    </>
  );
}
