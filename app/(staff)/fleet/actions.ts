'use server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { str, int, num, audit } from '@/lib/util';

export async function saveBus(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id');
  const v: any = {
    fleet_no: str(fd, 'fleet_no'), rego: str(fd, 'rego'), vin: str(fd, 'vin'), make_model: str(fd, 'make_model'), seats: int(fd, 'seats') || 0,
    bus_class: str(fd, 'bus_class'), features: str(fd, 'features'), service_interval_km: int(fd, 'service_interval_km'),
    service_interval_days: int(fd, 'service_interval_days'), last_service_km: int(fd, 'last_service_km') ?? 0, last_service_date: str(fd, 'last_service_date'),
    rego_expiry: str(fd, 'rego_expiry'), insurance_expiry: str(fd, 'insurance_expiry'), inspection_expiry: str(fd, 'inspection_expiry'),
    active: fd.get('active') !== 'off', notes: str(fd, 'notes'),
  };
  const odo = int(fd, 'odometer');
  if (id) {
    await sql`update buses set ${sql(v)} where id = ${id}`;
    await audit(u, 'update', 'bus', id);
    redirect(`/fleet/${id}?msg=Saved`);
  }
  const [b] = await sql`insert into buses ${sql({ ...v, odometer: odo || 0 })} returning id`;
  if (odo) await sql`insert into odometer_log (bus_id, reading, source) values (${b.id}, ${odo}, 'manual')`;
  await audit(u, 'create', 'bus', b.id);
  redirect(`/fleet/${b.id}`);
}

export async function addOdometer(fd: FormData) {
  await requireStaff();
  const id = int(fd, 'bus_id')!, r = int(fd, 'reading')!;
  await sql`insert into odometer_log (bus_id, reading, source) values (${id}, ${r}, ${str(fd, 'source') || 'manual'})`;
  await sql`update buses set odometer = greatest(odometer, ${r}) where id = ${id}`;
  redirect(`/fleet/${id}`);
}

export async function addWorkshop(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'bus_id')!;
  const kind = str(fd, 'kind') || 'repair';
  const odo = int(fd, 'odometer');
  const date = str(fd, 'date');
  const parts = num(fd, 'parts_cost') || 0, labour = num(fd, 'labour_cost') || 0;
  const [w] = await sql`insert into workshop (bus_id, date, kind, description, parts_cost, labour_cost, supplier, odometer)
    values (${id}, ${date}, ${kind}, ${str(fd, 'description')}, ${parts}, ${labour}, ${str(fd, 'supplier')}, ${odo}) returning id`;
  if (kind === 'service') await sql`update buses set last_service_date = ${date}, last_service_km = coalesce(${odo}, odometer) where id = ${id}`;
  if (odo) {
    await sql`insert into odometer_log (bus_id, reading, source) values (${id}, ${odo}, 'workshop')`;
    await sql`update buses set odometer = greatest(odometer, ${odo}) where id = ${id}`;
  }
  if (parts + labour > 0)
    await sql`insert into expenses (date, category, supplier, description, amount, gst, bus_id)
      values (${date}, 'Repairs & maintenance', ${str(fd, 'supplier')}, ${`${kind}: ${str(fd, 'description') || ''}`}, ${parts + labour}, ${Math.round((parts + labour) * 10) / 110}, ${id})`;
  const fix = fd.getAll('fix_defect').map(Number);
  for (const d of fix) await sql`update defects set status = 'fixed', fixed_at = now(), resolution = ${'Workshop #' + w.id} where id = ${d}`;
  await audit(u, 'workshop', 'bus', id, kind);
  redirect(`/fleet/${id}`);
}

export async function resolveDefect(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  await sql`update defects set status = 'fixed', fixed_at = now(), resolution = ${str(fd, 'resolution')} where id = ${id}`;
  await audit(u, 'fix', 'defect', id);
  redirect(str(fd, 'back') || '/fleet/defects');
}

export async function addDefect(fd: FormData) {
  const u = await requireStaff();
  await sql`insert into defects (bus_id, reported_by, description, severity) values (${int(fd, 'bus_id')}, ${u.id}, ${str(fd, 'description')}, ${str(fd, 'severity')})`;
  redirect(str(fd, 'back') || '/fleet/defects');
}
