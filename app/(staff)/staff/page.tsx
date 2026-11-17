import { sql, getSettings } from '@/lib/db';
import { today, addDays } from '@/lib/util';
import { Head } from '@/components/ui';

function Exp({ d }: { d?: string }) {
  if (!d) return <span className="muted">—</span>;
  const t = today();
  return <span className={`b ${d < t ? 'red' : d <= addDays(t, 30) ? 'amber' : 'green'}`}>{d}</span>;
}

export default async function Staff({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const rows = await sql`select * from users where active = ${sp.inactive ? false : true} order by role, name`;
  return (
    <>
      <Head title="Staff" sub="Licence, medical, WWCC and accreditation expiries are flagged 30 days ahead.">
        <a className="btn" href="/staff/new">+ Add staff</a>
        <a className="btn sec" href={sp.inactive ? '/staff' : '/staff?inactive=1'}>{sp.inactive ? 'Active staff' : 'Inactive'}</a>
      </Head>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Type</th><th>Phone</th><th>Licence</th><th>Medical</th><th>WWCC</th><th>DA accred.</th><th>Login</th></tr></thead>
          <tbody>
            {rows.map((u: any) => (
              <tr key={u.id}>
                <td><a href={`/staff/${u.id}`}>{u.name}</a></td>
                <td>{u.role}</td><td>{u.employment_type}</td><td>{u.phone}</td>
                <td>{u.licence_class} <Exp d={u.licence_expiry} /></td><td><Exp d={u.medical_expiry} /></td>
                <td><Exp d={u.wwcc_expiry} /></td><td><Exp d={u.accreditation_expiry} /></td>
                <td className="small">{u.pin_hash ? 'PIN ✓' : ''} {u.password_hash ? 'password ✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
