'use server';
import { redirect } from 'next/navigation';
import { sql, getSettings } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { str, int, num, audit, logActivity } from '@/lib/util';
import { totals, emailInvoice, createInvoice, invoicePaid } from '@/lib/logic';

function parseLines(txt: string | null) {
  return (txt || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [d, a] = l.split('|').map((x) => x.trim());
    const amt = Number((a || '0').replace(/[$,]/g, '')) || 0;
    return { description: d, qty: 1, unit: amt, amount: amt };
  });
}

export async function saveInvoice(fd: FormData) {
  const u = await requireStaff();
  const s = await getSettings();
  const id = int(fd, 'id')!;
  const lines = parseLines(str(fd, 'lines'));
  const t = totals(lines, !!s.gst_registered);
  await sql`update invoices set lines = ${sql.json(lines as any)}, subtotal = ${t.subtotal}, gst = ${t.gst}, total = ${t.total},
    due_date = ${str(fd, 'due_date')}, notes = ${str(fd, 'notes')}, client_id = ${int(fd, 'client_id')} where id = ${id} and status = 'draft'`;
  await audit(u, 'update', 'invoice', id);
  redirect(`/finance/${id}?msg=Saved`);
}

export async function sendInvoice(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  await sql`update invoices set status = 'sent', sent_at = now() where id = ${id} and status in ('draft','sent')`;
  const r = fd.get('email') === 'on' ? await emailInvoice(id) : { ok: false, info: 'Marked as sent (not emailed)' };
  await logActivity('invoice', id, `Invoice sent – ${r.info}`, u.id, 'email');
  await audit(u, 'send', 'invoice', id, r.info);
  redirect(`/finance/${id}?msg=${encodeURIComponent(r.info)}`);
}

export async function addPayment(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'invoice_id')!;
  await sql`insert into payments (invoice_id, amount, date, method, note) values (${id}, ${num(fd, 'amount')}, ${str(fd, 'date')}, ${str(fd, 'method')}, ${str(fd, 'note')})`;
  const [inv] = await sql`select * from invoices where id = ${id}`;
  if ((await invoicePaid(id)) >= Number(inv.total) - 0.005) await sql`update invoices set status = 'paid' where id = ${id}`;
  else if (inv.status === 'draft') await sql`update invoices set status = 'sent' where id = ${id}`;
  await logActivity('invoice', id, `Payment ${num(fd, 'amount')} received (${str(fd, 'method')})`, u.id);
  await audit(u, 'payment', 'invoice', id, String(num(fd, 'amount')));
  redirect(`/finance/${id}`);
}

export async function deletePayment(fd: FormData) {
  const u = await requireStaff(['admin']);
  const id = int(fd, 'invoice_id')!;
  await sql`delete from payments where id = ${int(fd, 'id')}`;
  await sql`update invoices set status = 'sent' where id = ${id} and status = 'paid'`;
  await audit(u, 'delete payment', 'invoice', id);
  redirect(`/finance/${id}`);
}

export async function voidInvoice(fd: FormData) {
  const u = await requireStaff(['admin']);
  const id = int(fd, 'id')!;
  await sql`update invoices set status = 'void' where id = ${id}`;
  await audit(u, 'void', 'invoice', id);
  redirect(`/finance/${id}`);
}

export async function creditNote(fd: FormData) {
  const u = await requireStaff();
  const id = int(fd, 'id')!;
  const amt = num(fd, 'amount') || 0; // ex GST
  const [inv] = await sql`select * from invoices where id = ${id}`;
  const cn = await createInvoice({ client_id: inv.client_id, job_id: inv.job_id, kind: 'credit', status: 'sent', dueDays: 0,
    lines: [{ description: `Credit against ${inv.number}: ${str(fd, 'reason') || ''}`, qty: 1, unit: -amt, amount: -amt }] });
  // apply credit to the original invoice as a payment
  await sql`insert into payments (invoice_id, amount, method, note) values (${id}, ${-Number(cn.total)}, 'credit note', ${cn.number})`;
  if ((await invoicePaid(id)) >= Number(inv.total) - 0.005) await sql`update invoices set status = 'paid' where id = ${id}`;
  await audit(u, 'credit', 'invoice', id, cn.number);
  redirect(`/finance/${cn.id}`);
}

export async function newInvoice(fd: FormData) {
  const u = await requireStaff();
  const inv = await createInvoice({ client_id: int(fd, 'client_id'), lines: parseLines(str(fd, 'lines')) });
  await audit(u, 'create', 'invoice', inv.id);
  redirect(`/finance/${inv.id}`);
}

export async function saveExpense(fd: FormData) {
  const u = await requireStaff();
  const amount = num(fd, 'amount') || 0;
  const v: any = {
    date: str(fd, 'date'), category: str(fd, 'category'), supplier: str(fd, 'supplier'), description: str(fd, 'description'), amount,
    gst: fd.get('has_gst') === 'on' ? Math.round((amount / 11) * 100) / 100 : 0, bus_id: int(fd, 'bus_id'), job_id: int(fd, 'job_id'),
    recurring: str(fd, 'recurring') || 'none', receipt_url: str(fd, 'receipt_url'),
  };
  const [e] = await sql`insert into expenses ${sql(v)} returning id`;
  await audit(u, 'create', 'expense', e.id);
  redirect('/finance/expenses?msg=Added');
}

export async function deleteExpense(fd: FormData) {
  const u = await requireStaff();
  await sql`delete from expenses where id = ${int(fd, 'id')}`;
  await audit(u, 'delete', 'expense', int(fd, 'id'));
  redirect('/finance/expenses');
}
