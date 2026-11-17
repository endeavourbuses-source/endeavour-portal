'use server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireDriver } from '@/lib/auth';
import { str, int, num, logActivity, audit } from '@/lib/util';
import { invoiceCompletedJob } from '@/lib/logic';
import { PRETRIP } from '@/lib/constants';

async function myJob(id: number) {
  const u = await requireDriver();
  const [j] = await sql`select * from jobs where id = ${id}`;
  if (!j || (u.role === 'driver' && j.driver_id !== u.id)) redirect('/driver');
  return { u, j };
}

export async function ackJob(fd: FormData) {
  const { u, j } = await myJob(int(fd, 'id')!);
  await sql`update jobs set driver_ack_at = now() where id = ${j.id}`;
  await logActivity('job', j.id, `Driver ${u.name} confirmed job`, u.id);
  redirect(str(fd, 'back') || `/driver/job/${j.id}`);
}


export async function pretrip(fd: FormData) {
  const { u, j } = await myJob(int(fd, 'id')!);
  const failed = PRETRIP.filter((_, i) => fd.get('c' + i) !== 'on');
  const notes = str(fd, 'notes');
  const severity = str(fd, 'severity') || 'minor';
  const ok = failed.length === 0 && !notes;
  await sql`update jobs set pretrip = ${sql.json({ ok, issues: [failed.join(', '), notes].filter(Boolean).join(' – '), by: u.name, at: new Date().toISOString() })} where id = ${j.id}`;
  if (!ok && j.bus_id) {
    await sql`insert into defects (bus_id, reported_by, job_id, description, severity) values (${j.bus_id}, ${u.id}, ${j.id},
      ${[failed.length ? 'Failed: ' + failed.join(', ') : '', notes].filter(Boolean).join(' – ')}, ${severity})`;
  }
  await logActivity('job', j.id, ok ? 'Pre-trip check passed' : 'Pre-trip check: issues reported', u.id);
  redirect(`/driver/job/${j.id}`);
}

export async function signOn(fd: FormData) {
  const { u, j } = await myJob(int(fd, 'id')!);
  const odo = int(fd, 'odo_start');
  await sql`update jobs set signon_at = now(), odo_start = ${odo}, status = 'in_progress', driver_ack_at = coalesce(driver_ack_at, now()) where id = ${j.id}`;
  if (odo && j.bus_id) {
    await sql`insert into odometer_log (bus_id, reading, source, job_id) values (${j.bus_id}, ${odo}, 'driver', ${j.id})`;
    await sql`update buses set odometer = greatest(odometer, ${odo}) where id = ${j.bus_id}`;
  }
  await logActivity('job', j.id, `${u.name} signed on${odo ? ` (odo ${odo})` : ''}`, u.id);
  redirect(`/driver/job/${j.id}`);
}

export async function addBreak(fd: FormData) {
  const { u, j } = await myJob(int(fd, 'id')!);
  const m = int(fd, 'minutes') || 0;
  await sql`update jobs set break_minutes = coalesce(break_minutes,0) + ${m} where id = ${j.id}`;
  await logActivity('job', j.id, `${u.name} logged ${m} min break`, u.id);
  redirect(`/driver/job/${j.id}`);
}

export async function reportIncident(fd: FormData) {
  const { u, j } = await myJob(int(fd, 'id')!);
  await sql`insert into incidents (job_id, user_id, bus_id, description, severity) values (${j.id}, ${u.id}, ${j.bus_id}, ${str(fd, 'description')}, ${str(fd, 'severity') || 'minor'})`;
  await sql`insert into staff_notes (user_id, kind, title, note, created_by) values (${u.id}, 'incident', ${'Incident on job #' + j.id}, ${str(fd, 'description')}, ${u.id})`;
  await sql`insert into activities (entity, entity_id, kind, text, due_date) values ('job', ${j.id}, 'task', ${'Review incident reported by ' + u.name}, current_date)`;
  await audit(u, 'incident', 'job', j.id, str(fd, 'description') || '');
  redirect(`/driver/job/${j.id}?msg=Incident+reported`);
}

export async function signOff(fd: FormData) {
  const { u, j } = await myJob(int(fd, 'id')!);
  const odo = int(fd, 'odo_end');
  await sql`update jobs set signoff_at = now(), odo_end = ${odo}, client_signoff = ${str(fd, 'client_signoff')}, status = 'completed' where id = ${j.id}`;
  if (odo && j.bus_id) {
    await sql`insert into odometer_log (bus_id, reading, source, job_id) values (${j.bus_id}, ${odo}, 'driver', ${j.id})`;
    await sql`update buses set odometer = greatest(odometer, ${odo}) where id = ${j.bus_id}`;
  }
  await logActivity('job', j.id, `${u.name} signed off – job completed${odo ? ` (odo ${odo})` : ''}`, u.id);
  await invoiceCompletedJob(j.id);
  redirect(`/driver?msg=Job+completed+-+thanks!`);
}

export async function requestLeave(fd: FormData) {
  const u = await requireDriver();
  await sql`insert into leave (user_id, start_date, end_date, type, hours, note) values (${u.id}, ${str(fd, 'start_date')}, ${str(fd, 'end_date')},
    ${str(fd, 'type') || 'annual'}, ${num(fd, 'hours') || 0}, ${str(fd, 'note')})`;
  redirect('/driver/leave?msg=Request+sent');
}
