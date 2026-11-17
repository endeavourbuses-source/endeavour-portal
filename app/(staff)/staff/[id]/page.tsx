import { sql } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { fmtDate, fmtTs } from '@/lib/util';
import { Head, Field, Select, Badge } from '@/components/ui';
import { saveStaff, addStaffNote, deleteStaffNote } from '../actions';

export default async function StaffMember({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const pid = (await params).id;
  const sp = await searchParams;
  const me = (await getUser())!;
  const isNew = pid === 'new';
  const [s] = isNew ? [{ role: 'driver', employment_type: 'casual', active: true }] : await sql`select * from users where id = ${Number(pid)}`;
  if (!s) return <p>Not found</p>;
  const [notes, leave, jobs] = isNew ? [[], [], []] : await Promise.all([
    sql`select n.*, u.name author from staff_notes n left join users u on u.id = n.created_by where n.user_id = ${s.id} order by created_at desc`,
    sql`select * from leave where user_id = ${s.id} order by start_date desc limit 10`,
    sql`select id, date, title, status from jobs where driver_id = ${s.id} order by date desc limit 10`,
  ]);
  return (
    <>
      <Head title={isNew ? 'Add staff member' : s.name} sub={isNew ? '' : `${s.role} · ${s.employment_type || ''}${s.active ? '' : ' · INACTIVE'}`} />
      {sp.msg && <div className="alert green">{sp.msg}</div>}
      {sp.err && <div className="alert red">{sp.err}</div>}
      <div className="grid g2">
        <form action={saveStaff} className="card">
          {!isNew && <input type="hidden" name="id" value={s.id} />}
          <h2>Details</h2>
          <div className="row"><Field label="Full name" name="name" value={s.name} required />
            <Select label="Role" name="role" value={s.role} options={me.role === 'admin' ? ['driver', 'office', 'admin'] : ['driver']} /></div>
          <div className="row"><Field label="Phone" name="phone" value={s.phone} /><Field label="Email" name="email" type="email" value={s.email} /></div>
          <Field label="Address" name="address" value={s.address} />
          <div className="row">
            <Select label="Employment type" name="employment_type" value={s.employment_type} options={['casual', 'part-time', 'full-time', 'contractor']} />
            <Field label="Start date" name="start_date" type="date" value={s.start_date} />
            <Field label="Leave balance (hrs)" name="leave_balance_hours" type="number" step="0.5" value={s.leave_balance_hours} />
          </div>
          <div className="row"><Field label="Emergency contact" name="emergency_name" value={s.emergency_name} /><Field label="Emergency phone" name="emergency_phone" value={s.emergency_phone} /></div>
          <h2 style={{ marginTop: 10 }}>Licences & checks</h2>
          <div className="row">
            <Field label="Licence no." name="licence_no" value={s.licence_no} />
            <Select label="Class" name="licence_class" value={s.licence_class} blank="—" options={['C', 'LR', 'MR', 'HR', 'HC', 'MC']} />
            <Field label="Licence expiry" name="licence_expiry" type="date" value={s.licence_expiry} />
          </div>
          <div className="row">
            <Field label="WWCC no." name="wwcc_no" value={s.wwcc_no} />
            <Field label="WWCC expiry" name="wwcc_expiry" type="date" value={s.wwcc_expiry} />
          </div>
          <div className="row">
            <Field label="Medical expiry" name="medical_expiry" type="date" value={s.medical_expiry} />
            <Field label="Driver accreditation (DA) expiry" name="accreditation_expiry" type="date" value={s.accreditation_expiry} />
          </div>
          <h2 style={{ marginTop: 10 }}>Login</h2>
          <div className="row">
            <Field label={s.pin_hash ? 'Reset driver PIN (4–6 digits)' : 'Driver PIN (4–6 digits)'} name="pin" inputMode="numeric" placeholder={s.pin_hash ? '•••• set' : ''} />
            {me.role === 'admin' && <Field label="Office password (admin/office only)" name="password" type="password" placeholder={s.password_hash ? '•••• set' : ''} />}
          </div>
          <Field label="Notes" name="notes" type="textarea" value={s.notes} />
          {!isNew && <Select label="Status" name="active" value={s.active ? 'on' : 'off'} options={[{ value: 'on', label: 'Active' }, { value: 'off', label: 'Inactive (can’t log in)' }]} />}
          <button className="btn">{isNew ? 'Create' : 'Save'}</button>
        </form>
        {!isNew && (
          <div>
            <div className="card">
              <h2>Documents, training, performance & incidents</h2>
              <table><tbody>
                {notes.map((n: any) => (
                  <tr key={n.id}>
                    <td><Badge s={n.kind === 'incident' ? 'red' : n.kind === 'performance' ? 'amber' : 'blue'}>{n.kind}</Badge></td>
                    <td><b>{n.title}</b> {n.doc_url && <a href={n.doc_url} target="_blank">📎 file</a>}<div className="small pre">{n.note}</div>{n.expiry && <div className="small">expires {n.expiry}</div>}</td>
                    <td className="small muted">{n.author} {fmtTs(n.created_at)}</td>
                    <td><form action={deleteStaffNote}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="user_id" value={s.id} /><button className="btn sm sec">✕</button></form></td>
                  </tr>
                ))}
              </tbody></table>
              <form action={addStaffNote} style={{ marginTop: 10 }}>
                <input type="hidden" name="user_id" value={s.id} />
                <div className="row">
                  <Select label="Kind" name="kind" options={['document', 'contract', 'induction', 'training', 'performance', 'incident', 'note']} />
                  <Field label="Title" name="title" required />
                </div>
                <Field label="Details" name="note" type="textarea" />
                <div className="row"><Field label="Link to file (Google Drive / Dropbox)" name="doc_url" /><Field label="Expiry (optional)" name="expiry" type="date" /></div>
                <button className="btn sec">Add record</button>
              </form>
            </div>
            <div className="card"><h2>Leave</h2>{leave.map((l: any) => <div key={l.id}>{fmtDate(l.start_date)} – {fmtDate(l.end_date)} · {l.type} <Badge s={l.status} /></div>)}</div>
            <div className="card"><h2>Recent jobs</h2>{jobs.map((j: any) => <div key={j.id}><a href={`/jobs/${j.id}`}>{fmtDate(j.date)} {j.title}</a> <Badge s={j.status} /></div>)}</div>
          </div>
        )}
      </div>
    </>
  );
}
