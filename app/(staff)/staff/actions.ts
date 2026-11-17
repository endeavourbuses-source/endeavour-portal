'use server';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { str, int, num, audit } from '@/lib/util';

export async function saveStaff(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id');
  let role = str(fd, 'role') || 'driver';
  if (role !== 'driver' && u.role !== 'admin') role = 'driver'; // only admins can create office/admin users
  const v: any = {
    name: str(fd, 'name'), email: str(fd, 'email')?.toLowerCase() ?? null, role, phone: str(fd, 'phone'), address: str(fd, 'address'),
    employment_type: str(fd, 'employment_type'), emergency_name: str(fd, 'emergency_name'), emergency_phone: str(fd, 'emergency_phone'),
    licence_no: str(fd, 'licence_no'), licence_class: str(fd, 'licence_class'), licence_expiry: str(fd, 'licence_expiry'),
    medical_expiry: str(fd, 'medical_expiry'), wwcc_no: str(fd, 'wwcc_no'), wwcc_expiry: str(fd, 'wwcc_expiry'),
    accreditation_expiry: str(fd, 'accreditation_expiry'), start_date: str(fd, 'start_date'),
    leave_balance_hours: num(fd, 'leave_balance_hours') || 0, notes: str(fd, 'notes'), active: fd.get('active') !== 'off',
  };
  const pin = str(fd, 'pin');
  const pw = str(fd, 'password');
  if (pin) {
    if (!/^\d{4,6}$/.test(pin)) redirect(`/staff/${id || 'new'}?err=PIN+must+be+4-6+digits`);
    v.pin_hash = await bcrypt.hash(pin, 10);
  }
  if (pw) {
    if (u.role !== 'admin' && id !== u.id) redirect(`/staff/${id}?err=Only+admins+can+set+passwords`);
    v.password_hash = await bcrypt.hash(pw, 10);
  }
  if (id) {
    const [cur] = await sql`select role from users where id = ${id}`;
    if (cur.role !== 'driver' && u.role !== 'admin') delete v.role;
    await sql`update users set ${sql(v)} where id = ${id}`;
    await audit(u, 'update', 'staff', id, pin ? 'PIN reset' : '');
    redirect(`/staff/${id}?msg=Saved`);
  }
  const [n] = await sql`insert into users ${sql(v)} returning id`;
  await audit(u, 'create', 'staff', n.id, role);
  redirect(`/staff/${n.id}?msg=Created`);
}

export async function addStaffNote(fd: FormData) {
  const u = await requireStaff();
  const uid = int(fd, 'user_id');
  await sql`insert into staff_notes (user_id, kind, title, note, doc_url, expiry, created_by)
    values (${uid}, ${str(fd, 'kind') || 'note'}, ${str(fd, 'title')}, ${str(fd, 'note')}, ${str(fd, 'doc_url')}, ${str(fd, 'expiry')}, ${u.id})`;
  redirect(`/staff/${uid}`);
}

export async function deleteStaffNote(fd: FormData) {
  await requireStaff();
  await sql`delete from staff_notes where id = ${int(fd, 'id')}`;
  redirect(`/staff/${int(fd, 'user_id')}`);
}

export async function decideLeave(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const status = str(fd, 'status')!;
  const [l] = await sql`select * from leave where id = ${id}`;
  await sql`update leave set status = ${status} where id = ${id}`;
  if (status === 'approved' && l.status !== 'approved' && l.type === 'annual' && Number(l.hours) > 0)
    await sql`update users set leave_balance_hours = leave_balance_hours - ${l.hours} where id = ${l.user_id}`;
  if (l.status === 'approved' && status !== 'approved' && l.type === 'annual' && Number(l.hours) > 0)
    await sql`update users set leave_balance_hours = leave_balance_hours + ${l.hours} where id = ${l.user_id}`;
  await audit(u, 'leave ' + status, 'leave', id);
  redirect('/staff/leave');
}

export async function addLeave(fd: FormData) {
  const u = await requireStaff();
  const [l] = await sql`insert into leave (user_id, start_date, end_date, type, hours, note, status) values (${int(fd, 'user_id')}, ${str(fd, 'start_date')}, ${str(fd, 'end_date')},
    ${str(fd, 'type')}, ${num(fd, 'hours') || 0}, ${str(fd, 'note')}, 'pending') returning id`;
  await audit(u, 'create', 'leave', l.id);
  redirect('/staff/leave');
}
