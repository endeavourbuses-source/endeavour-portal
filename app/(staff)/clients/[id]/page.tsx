import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { money, fmtDate } from '@/lib/util';
import { invoiceState } from '@/lib/logic';
import { Badge, Head, Field, Select } from '@/components/ui';
import { ActivityLog } from '@/components/activity';
import { saveClient, addContact, deleteContact } from '../../crm/actions';
import { SOURCES } from '@/components/enquiry-form';

export default async function Client({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [c] = await sql`select * from clients where id = ${id}`;
  if (!c) notFound();
  const [contacts, enqs, quotes, jobs, invs] = await Promise.all([
    sql`select * from contacts where client_id = ${id} order by name`,
    sql`select * from enquiries where client_id = ${id} order by created_at desc`,
    sql`select * from quotes where client_id = ${id} order by id desc`,
    sql`select j.*, u.name driver from jobs j left join users u on u.id = j.driver_id where client_id = ${id} order by date desc limit 50`,
    sql`select i.*, (select coalesce(sum(amount),0) from payments p where p.invoice_id = i.id)::numeric paid from invoices i where client_id = ${id} order by issue_date desc`,
  ]);
  const owing = invs.filter((i: any) => i.status === 'sent').reduce((s: number, i: any) => s + Number(i.total) - Number(i.paid), 0);
  return (
    <>
      <Head title={c.name} sub={`${c.type || ''} · terms ${c.payment_terms_days} days · ${c.lead_source || 'source unknown'}`}>
        <a className="btn" href={`/crm/enquiries/new?client=${c.id}`}>+ Enquiry</a>
        <a className="btn sec" href={`/jobs/new?client=${c.id}`}>+ Job</a>
        <a className="btn sec" href={`/finance/statement/${c.id}`}>Statement</a>
      </Head>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="n">{jobs.filter((j: any) => j.status === 'completed').length}</div><div className="l">Completed jobs</div></div>
        <div className="stat"><div className="n">{quotes.length}</div><div className="l">Quotes</div></div>
        <div className="stat"><div className="n">{money(invs.filter((i: any) => i.kind === 'invoice' && i.status !== 'void' && i.status !== 'draft').reduce((s: number, i: any) => s + Number(i.subtotal), 0))}</div><div className="l">Lifetime revenue (ex GST)</div></div>
        <div className="stat"><div className="n" style={{ color: owing > 0 ? 'var(--red)' : undefined }}>{money(owing)}</div><div className="l">Currently owing</div></div>
      </div>
      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Jobs</h2>
            <table><tbody>
              {jobs.map((j: any) => (
                <tr key={j.id}><td>{fmtDate(j.date)}</td><td><a href={`/jobs/${j.id}`}>{j.title || `#${j.id}`}</a><div className="small muted">{j.pickup} → {j.dropoff}</div></td><td>{j.driver}</td><td><Badge s={j.status} /></td></tr>
              ))}
            </tbody></table>
          </div>
          <div className="card">
            <h2>Quotes & enquiries</h2>
            <table><tbody>
              {quotes.map((q: any) => <tr key={'q' + q.id}><td><a href={`/quotes/${q.id}`}>Q{q.id} v{q.version}</a></td><td>{fmtDate(q.trip_date)}</td><td>{money(q.total)}</td><td><Badge s={q.status} /></td></tr>)}
              {enqs.map((e: any) => <tr key={'e' + e.id}><td><a href={`/crm/enquiries/${e.id}`}>Enquiry #{e.id}</a></td><td>{fmtDate(e.trip_date)}</td><td>{e.source}</td><td><Badge s={e.status} /></td></tr>)}
            </tbody></table>
          </div>
          <div className="card">
            <h2>Invoices</h2>
            <table><tbody>
              {invs.map((i: any) => <tr key={i.id}><td><a href={`/finance/${i.id}`}>{i.number}</a></td><td>{fmtDate(i.issue_date)}</td><td className="r">{money(i.total)}</td><td><Badge s={invoiceState(i, Number(i.paid))} /></td></tr>)}
            </tbody></table>
          </div>
          <ActivityLog entity="client" id={c.id} back={`/clients/${c.id}`} />
        </div>
        <div>
          <div className="card">
            <h2>Contacts</h2>
            <table><tbody>
              {contacts.map((p: any) => (
                <tr key={p.id}><td><b>{p.name}</b><div className="small muted">{p.role}</div></td><td className="small">{p.phone}<br />{p.email}</td>
                  <td><form action={deleteContact}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="client_id" value={c.id} /><button className="btn sm sec">✕</button></form></td></tr>
              ))}
            </tbody></table>
            <form action={addContact} style={{ marginTop: 10 }}>
              <input type="hidden" name="client_id" value={c.id} />
              <div className="row"><Field label="Name" name="name" required /><Field label="Role" name="role" /></div>
              <div className="row"><Field label="Email" name="email" /><Field label="Phone" name="phone" /><div className="auto f"><button className="btn sec">Add</button></div></div>
            </form>
          </div>
          <form action={saveClient} className="card">
            <h2>Details</h2>
            <input type="hidden" name="id" value={c.id} />
            <Field label="Name" name="name" value={c.name} required />
            <Select label="Type" name="type" value={c.type} options={['school', 'business', 'sports club', 'community group', 'government', 'individual', 'tour operator']} />
            <div className="row"><Field label="Email (invoices go here)" name="email" type="email" value={c.email} /><Field label="Phone" name="phone" value={c.phone} /></div>
            <Field label="Address" name="address" value={c.address} />
            <div className="row"><Field label="ABN" name="abn" value={c.abn} /><Field label="Payment terms (days)" name="payment_terms_days" type="number" value={c.payment_terms_days} /></div>
            <Select label="Lead source" name="lead_source" value={c.lead_source} options={SOURCES} />
            <Field label="Notes" name="notes" type="textarea" value={c.notes} />
            <button className="btn">Save</button>
          </form>
        </div>
      </div>
    </>
  );
}
