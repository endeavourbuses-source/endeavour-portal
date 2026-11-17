import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { money, fmtDate, fmtTs, baseUrl, today } from '@/lib/util';
import { invoicePaid, invoiceState } from '@/lib/logic';
import { Head, Badge, Field, Select } from '@/components/ui';
import { ActivityLog } from '@/components/activity';
import { saveInvoice, sendInvoice, addPayment, deletePayment, voidInvoice, creditNote } from '../actions';

export default async function Invoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const [i] = await sql`select i.*, c.name client, c.email from invoices i left join clients c on c.id = i.client_id where i.id = ${id}`;
  if (!i) notFound();
  const payments = await sql`select * from payments where invoice_id = ${id} order by date`;
  const clients = await sql`select id, name from clients order by name`;
  const paid = await invoicePaid(id);
  const state = invoiceState(i, paid);
  const owing = Number(i.total) - paid;
  return (
    <>
      <Head title={`${i.kind === 'credit' ? 'Credit note' : 'Invoice'} ${i.number}`} sub={<>{i.client} · issued {fmtDate(i.issue_date)} · due {fmtDate(i.due_date)} <Badge s={state} /></>}>
        {i.status !== 'draft' && <a className="btn sec" href={`/i/${i.token}`} target="_blank">View / PDF</a>}
        {i.job_id && <a className="btn sec" href={`/jobs/${i.job_id}`}>Job #{i.job_id}</a>}
      </Head>
      {sp.msg && <div className="alert blue">{sp.msg}</div>}
      <div className="grid g2">
        <div>
          <div className="card">
            <table><tbody>
              {i.lines.map((l: any, k: number) => <tr key={k}><td>{l.description}</td><td className="r">{money(l.amount)}</td></tr>)}
              <tr><td>Subtotal</td><td className="r">{money(i.subtotal)}</td></tr>
              <tr><td>GST</td><td className="r">{money(i.gst)}</td></tr>
              <tr><td><b>Total</b></td><td className="r"><b>{money(i.total)}</b></td></tr>
              <tr><td>Paid</td><td className="r">{money(paid)}</td></tr>
              {i.kind === 'invoice' && <tr><td><b>Owing</b></td><td className="r"><b>{money(owing)}</b></td></tr>}
            </tbody></table>
          </div>
          {['draft', 'sent'].includes(i.status) && (
            <div className="card">
              <h2>{i.status === 'draft' ? 'Send invoice' : 'Re-send'}</h2>
              {i.status !== 'draft' && <p className="small">Client link: <input readOnly value={`${baseUrl()}/i/${i.token}`} /></p>}
              <form action={sendInvoice} className="actions">
                <input type="hidden" name="id" value={i.id} />
                <label style={{ display: 'flex', gap: 6, fontWeight: 500 }}><input type="checkbox" name="email" defaultChecked /> Email to {i.email || '(no email on client)'}</label>
                <button className="btn">{i.status === 'draft' ? 'Approve & send' : 'Re-send'}</button>
              </form>
            </div>
          )}
          {i.kind === 'invoice' && i.status !== 'void' && (
            <div className="card">
              <h2>Payments</h2>
              <table><tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}><td>{fmtDate(p.date)}</td><td>{p.method}</td><td className="small muted">{p.note}</td><td className="r">{money(p.amount)}</td>
                    <td><form action={deletePayment}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="invoice_id" value={i.id} /><button className="btn sm sec">✕</button></form></td></tr>
                ))}
              </tbody></table>
              {owing > 0.005 && (
                <form action={addPayment} style={{ marginTop: 10 }}>
                  <input type="hidden" name="invoice_id" value={i.id} />
                  <div className="row">
                    <Field label="Amount" name="amount" type="number" step="0.01" value={owing.toFixed(2)} required />
                    <Field label="Date" name="date" type="date" value={today()} />
                    <Select label="Method" name="method" options={['bank transfer', 'card', 'cash', 'cheque', 'other']} />
                  </div>
                  <Field label="Reference" name="note" />
                  <button className="btn">Record payment</button>
                </form>
              )}
            </div>
          )}
          <ActivityLog entity="invoice" id={i.id} back={`/finance/${i.id}`} />
        </div>
        <div>
          {i.status === 'draft' && (
            <form action={saveInvoice} className="card">
              <h2>Edit draft</h2>
              <input type="hidden" name="id" value={i.id} />
              <Select label="Client" name="client_id" value={i.client_id} options={clients.map((c: any) => ({ value: c.id, label: c.name }))} />
              <Field label="Lines – “description | amount ex GST”" name="lines" type="textarea" style={{ minHeight: 140 }} value={i.lines.map((l: any) => `${l.description} | ${l.amount}`).join('\n')} />
              <Field label="Due date" name="due_date" type="date" value={i.due_date} />
              <Field label="Notes" name="notes" type="textarea" value={i.notes} />
              <button className="btn">Save draft</button>
            </form>
          )}
          {i.kind === 'invoice' && ['sent', 'paid'].includes(i.status) && (
            <form action={creditNote} className="card">
              <h2>Credit note</h2>
              <div className="row"><Field label="Amount ex GST" name="amount" type="number" step="0.01" required /><Field label="Reason" name="reason" /></div>
              <button className="btn sec">Issue credit note</button>
            </form>
          )}
          {i.client_id && <p><a href={`/finance/statement/${i.client_id}`}>Client statement →</a></p>}
          {i.status !== 'void' && <form action={voidInvoice}><input type="hidden" name="id" value={i.id} /><button className="btn sm sec">Void (admin)</button></form>}
          <p className="small muted">Sent {fmtTs(i.sent_at) || '—'}{i.last_reminder_days ? ` · last reminder at ${i.last_reminder_days} days overdue` : ''}</p>
        </div>
      </div>
    </>
  );
}
