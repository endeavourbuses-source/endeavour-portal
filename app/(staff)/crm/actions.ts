'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { str, int, num, audit, logActivity } from '@/lib/util';

export async function saveEnquiry(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id');
  let client_id = int(fd, 'client_id');
  if (!client_id && fd.get('make_client') === 'on' && (str(fd, 'organisation') || str(fd, 'contact_name'))) {
    const [c] = await sql`insert into clients (name, email, phone, lead_source) values
      (${str(fd, 'organisation') || str(fd, 'contact_name')}, ${str(fd, 'contact_email')}, ${str(fd, 'contact_phone')}, ${str(fd, 'source')}) returning id`;
    client_id = c.id;
    if (str(fd, 'contact_name')) await sql`insert into contacts (client_id, name, email, phone) values (${c.id}, ${str(fd, 'contact_name')}, ${str(fd, 'contact_email')}, ${str(fd, 'contact_phone')})`;
  }
  const v = {
    client_id, contact_name: str(fd, 'contact_name'), contact_email: str(fd, 'contact_email'), contact_phone: str(fd, 'contact_phone'),
    organisation: str(fd, 'organisation'), source: str(fd, 'source') || 'phone', trip_date: str(fd, 'trip_date'),
    start_time: str(fd, 'start_time'), end_time: str(fd, 'end_time'), pickup: str(fd, 'pickup'), dropoff: str(fd, 'dropoff'),
    passengers: int(fd, 'passengers'), details: str(fd, 'details'),
  };
  if (id) {
    await sql`update enquiries set ${sql(v as any)}, updated_at = now() where id = ${id}`;
    await audit(u, 'update', 'enquiry', id);
    redirect(`/crm/enquiries/${id}`);
  }
  const [e] = await sql`insert into enquiries ${sql({ ...v, channel: 'office' } as any)} returning id`;
  await logActivity('enquiry', e.id, `Enquiry entered by ${u.name}`, u.id);
  await audit(u, 'create', 'enquiry', e.id);
  redirect(`/crm/enquiries/${e.id}`);
}

export async function setEnquiryStatus(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const status = str(fd, 'status')!;
  const reason = str(fd, 'reason');
  await sql`update enquiries set status = ${status}, outcome_reason = coalesce(${reason}, outcome_reason), updated_at = now() where id = ${id}`;
  await logActivity('enquiry', id, `Status → ${status}${reason ? ` (${reason})` : ''}`, u.id);
  await audit(u, 'status', 'enquiry', id, status);
  if (status === 'lost') await sql`update quotes set status = 'declined' where enquiry_id = ${id} and status in ('draft','sent')`;
  revalidatePath('/crm');
  redirect(str(fd, 'back') || `/crm/enquiries/${id}`);
}

export async function addActivity(fd: FormData) {
  const u = await requireStaff();
  const entity = str(fd, 'entity')!, entity_id = int(fd, 'entity_id')!;
  await sql`insert into activities (entity, entity_id, user_id, kind, text, due_date)
    values (${entity}, ${entity_id}, ${u.id}, ${str(fd, 'kind') || 'note'}, ${str(fd, 'text')}, ${str(fd, 'due_date')})`;
  redirect(str(fd, 'back') || '/');
}

export async function completeTask(fd: FormData) {
  await requireStaff();
  await sql`update activities set done = true where id = ${int(fd, 'id')}`;
  redirect(str(fd, 'back') || '/crm/tasks');
}

export async function saveClient(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id');
  const v = {
    name: str(fd, 'name') || 'Unnamed', type: str(fd, 'type'), abn: str(fd, 'abn'), email: str(fd, 'email'), phone: str(fd, 'phone'),
    address: str(fd, 'address'), payment_terms_days: int(fd, 'payment_terms_days') ?? 14, lead_source: str(fd, 'lead_source'), notes: str(fd, 'notes'),
  };
  if (id) {
    await sql`update clients set ${sql(v as any)} where id = ${id}`;
    await audit(u, 'update', 'client', id);
    redirect(`/clients/${id}`);
  }
  const [c] = await sql`insert into clients ${sql(v as any)} returning id`;
  await audit(u, 'create', 'client', c.id);
  redirect(`/clients/${c.id}`);
}

export async function addContact(fd: FormData) {
  await requireStaff();
  const cid = int(fd, 'client_id');
  await sql`insert into contacts (client_id, name, role, email, phone) values (${cid}, ${str(fd, 'name')}, ${str(fd, 'role')}, ${str(fd, 'email')}, ${str(fd, 'phone')})`;
  redirect(`/clients/${cid}`);
}

export async function deleteContact(fd: FormData) {
  await requireStaff();
  await sql`delete from contacts where id = ${int(fd, 'id')}`;
  redirect(`/clients/${int(fd, 'client_id')}`);
}

export async function deleteClient(fd: FormData) {
  const u = await requireStaff(['admin']);
  const id = int(fd, 'id')!;
  const [c] = await sql`select name from clients where id = ${id}`;
  if (!c) redirect('/clients');
  if ((str(fd, 'confirm') || '').toUpperCase() !== 'DELETE') redirect(`/clients/${id}?err=${encodeURIComponent('Type DELETE in the box to confirm')}`);
  const everything = fd.get('everything') === 'on';
  const [cnt] = await sql`select (select count(*) from jobs where client_id = ${id})::int jobs, (select count(*) from invoices where client_id = ${id})::int invs`;
  if (!everything && (cnt.jobs > 0 || cnt.invs > 0))
    redirect(`/clients/${id}?err=${encodeURIComponent(`This client has ${cnt.jobs} job(s) and ${cnt.invs} invoice(s). Tick "also delete their jobs, quotes, enquiries and invoices" to remove everything.`)}`);
  await sql.begin(async (tx: any) => {
    if (everything) {
      const jobs = await tx`select id from jobs where client_id = ${id}`;
      const jids = jobs.map((j: any) => j.id);
      const invs = await tx`select id from invoices where client_id = ${id} or job_id = any(${jids})`;
      const iids = invs.map((i: any) => i.id);
      const qs = await tx`select id from quotes where client_id = ${id}`;
      const qids = qs.map((q: any) => q.id);
      const es = await tx`select id from enquiries where client_id = ${id}`;
      const eids = es.map((e: any) => e.id);
      await tx`delete from activities where (entity = 'job' and entity_id = any(${jids})) or (entity = 'invoice' and entity_id = any(${iids}))
        or (entity = 'quote' and entity_id = any(${qids})) or (entity = 'enquiry' and entity_id = any(${eids}))`;
      await tx`delete from invoices where id = any(${iids})`;
      await tx`delete from defects where job_id = any(${jids})`;
      await tx`update expenses set job_id = null where job_id = any(${jids})`;
      await tx`delete from jobs where id = any(${jids})`;
      await tx`delete from quotes where id = any(${qids})`;
      await tx`delete from enquiries where id = any(${eids})`;
    }
    await tx`delete from activities where entity = 'client' and entity_id = ${id}`;
    await tx`delete from clients where id = ${id}`;
  });
  await audit(u, 'delete', 'client', id, `${c.name}${everything ? ' (with all jobs/quotes/invoices)' : ''}`);
  redirect(`/clients?msg=${encodeURIComponent(`${c.name} deleted`)}`);
}
