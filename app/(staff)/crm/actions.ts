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
