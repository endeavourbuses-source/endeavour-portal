'use server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { str, int, num, audit, logActivity, addDays, dow, token } from '@/lib/util';
import { checkDriver, checkBus, invoiceCompletedJob, createInvoice } from '@/lib/logic';

function jobFields(fd: FormData) {
  return {
    client_id: int(fd, 'client_id'), title: str(fd, 'title'), date: str(fd, 'date')!, start_time: str(fd, 'start_time'), end_time: str(fd, 'end_time'),
    pickup: str(fd, 'pickup'), dropoff: str(fd, 'dropoff'), stops: str(fd, 'stops'), passengers: int(fd, 'passengers') || 0,
    special_needs: str(fd, 'special_needs'), notes: str(fd, 'notes'), price: num(fd, 'price') || 0,
  };
}

export async function saveJob(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id');
  const v: any = jobFields(fd);
  if (id) {
    await sql`update jobs set ${sql(v)} where id = ${id}`;
    await audit(u, 'update', 'job', id);
    await logActivity('job', id, `Job details edited by ${u.name}`, u.id);
    redirect(`/jobs/${id}`);
  }
  const repeatUntil = str(fd, 'repeat_until');
  const days = fd.getAll('repeat_days').map(Number);
  if (repeatUntil && days.length) {
    const group = 'R' + token().slice(0, 8);
    let d = v.date, n = 0, first: number | null = null;
    while (d <= repeatUntil && n < 400) {
      if (days.includes(dow(d))) {
        const [j] = await sql`insert into jobs ${sql({ ...v, date: d, recurring_group: group })} returning id`;
        first ??= j.id; n++;
      }
      d = addDays(d, 1);
    }
    await audit(u, 'create', 'job', first, `${n} recurring jobs (${group})`);
    redirect(`/jobs?group=${group}`);
  }
  const [j] = await sql`insert into jobs ${sql(v)} returning id`;
  await logActivity('job', j.id, `Job created by ${u.name}`, u.id);
  await audit(u, 'create', 'job', j.id);
  redirect(`/jobs/${j.id}`);
}

export async function assignJob(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const driver_id = int(fd, 'driver_id');
  const bus_id = int(fd, 'bus_id');
  const assignment = str(fd, 'assignment') || 'provisional';
  const override = fd.get('override') === 'on';
  const applyGroup = fd.get('apply_group') === 'on';
  const [job] = await sql`select * from jobs where id = ${id}`;
  const targets = applyGroup && job.recurring_group
    ? await sql`select * from jobs where recurring_group = ${job.recurring_group} and date >= ${job.date} and status not in ('cancelled','completed') order by date`
    : [job];
  const problems: string[] = [];
  const [dn] = driver_id ? await sql`select name from users where id = ${driver_id}` : [null];
  const [bn] = bus_id ? await sql`select coalesce(fleet_no, rego) n from buses where id = ${bus_id}` : [null];
  for (const t of targets) {
    const probe = { ...t, bus_id: bus_id ?? t.bus_id };
    const checks = [...(driver_id ? await checkDriver(driver_id, probe) : []), ...(bus_id ? await checkBus(bus_id, probe) : [])];
    const blocks = checks.filter((c) => c.level === 'block');
    if (blocks.length && !override) { problems.push(`${t.date}: ${blocks.map((b) => b.msg).join('; ')}`); continue; }
    const status = driver_id && bus_id && t.status === 'scheduled' ? 'assigned' : (!driver_id || !bus_id) && t.status === 'assigned' ? 'scheduled' : t.status;
    const changed = t.driver_id !== driver_id;
    await sql`update jobs set driver_id = ${driver_id}, bus_id = ${bus_id}, assignment = ${assignment}, status = ${status},
      driver_ack_at = ${changed ? null : t.driver_ack_at} where id = ${t.id}`;
    await logActivity('job', t.id, `Assigned (${assignment}): driver ${dn?.name ?? '–'}, bus ${bn?.n ?? '–'}${blocks.length ? ' (override: ' + blocks.map((b) => b.msg).join('; ') + ')' : ''}`, u.id);
  }
  await audit(u, 'assign', 'job', id, `driver ${driver_id} bus ${bus_id} ${assignment}${override ? ' OVERRIDE' : ''}`);
  if (problems.length) redirect(`/jobs/${id}?err=${encodeURIComponent('Not assigned (blocked): ' + problems.join(' | '))}`);
  redirect(`/jobs/${id}`);
}

export async function saveRoute(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const approve = fd.get('approve') === '1';
  await sql`update jobs set route = ${str(fd, 'route')}, route_approved = ${approve},
    status = case when ${approve} and status = 'assigned' then 'route_approved' else status end where id = ${id}`;
  await logActivity('job', id, approve ? 'Route approved' : 'Route saved', u.id);
  redirect(`/jobs/${id}`);
}

export async function setJobStatus(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const status = str(fd, 'status')!;
  await sql`update jobs set status = ${status},
    signon_at = case when ${status} = 'in_progress' and signon_at is null then now() else signon_at end,
    signoff_at = case when ${status} = 'completed' and signoff_at is null then now() else signoff_at end where id = ${id}`;
  await logActivity('job', id, `Status → ${status}`, u.id);
  await audit(u, 'status', 'job', id, status);
  if (status === 'completed') {
    const inv = await invoiceCompletedJob(id);
    if (inv) redirect(`/finance/${inv.id}?msg=${encodeURIComponent('Job completed – invoice drafted. Check it and send.')}`);
  }
  redirect(`/jobs/${id}`);
}

export async function cancelJob(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const fee = num(fd, 'cancel_fee') || 0;
  const reason = str(fd, 'cancel_reason');
  const [j] = await sql`update jobs set status = 'cancelled', cancel_fee = ${fee}, cancel_reason = ${reason} where id = ${id} returning *`;
  await logActivity('job', id, `Cancelled${reason ? `: ${reason}` : ''}${fee ? ` – fee $${fee}` : ''}`, u.id);
  await audit(u, 'cancel', 'job', id, reason || '');
  if (fee > 0) {
    const inv = await createInvoice({ client_id: j.client_id, job_id: id, lines: [{ description: `Cancellation fee – ${j.title || 'job #' + id} (${j.date})`, qty: 1, unit: fee, amount: fee }] });
    redirect(`/finance/${inv.id}`);
  }
  redirect(`/jobs/${id}`);
}

export async function subcontractJob(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  await sql`update jobs set subcontractor = ${str(fd, 'subcontractor')}, subcontract_cost = ${num(fd, 'subcontract_cost') || 0},
    status = case when ${str(fd, 'subcontractor')}::text is not null and status = 'scheduled' then 'assigned' else status end where id = ${id}`;
  await logActivity('job', id, `Subcontracted to ${str(fd, 'subcontractor') || '—'}`, u.id);
  redirect(`/jobs/${id}`);
}

export async function deleteJob(fd: FormData) {
  const u = await requireStaff(['admin']);
  const id = int(fd, 'id')!;
  await sql`delete from jobs where id = ${id}`;
  await audit(u, 'delete', 'job', id);
  redirect('/jobs');
}
