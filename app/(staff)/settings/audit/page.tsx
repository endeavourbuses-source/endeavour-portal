import { sql } from '@/lib/db';
import { fmtTs } from '@/lib/util';
import { Head } from '@/components/ui';

export default async function Audit() {
  const rows = await sql`select * from audit order by at desc limit 500`;
  return (
    <>
      <Head title="Audit log" sub="Every sign-in, change, assignment override, payment and deletion." />
      <div className="card">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((r: any) => <tr key={r.id}><td className="small">{fmtTs(r.at)}</td><td>{r.user_name}</td><td>{r.action}</td><td>{r.entity}{r.entity_id ? ` #${r.entity_id}` : ''}</td><td className="small">{r.detail}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
