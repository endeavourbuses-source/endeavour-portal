import { sql } from '@/lib/db';
import { money } from '@/lib/util';
import { Head, Field, Select } from '@/components/ui';
import { saveClient } from '../crm/actions';
import { SOURCES } from '@/components/enquiry-form';

export default async function Clients({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const q = sp.q ? `%${sp.q}%` : '%';
  const rows = await sql`select c.*,
      (select count(*) from jobs j where j.client_id = c.id and j.status <> 'cancelled')::int jobs,
      (select coalesce(sum(subtotal),0) from invoices i where i.client_id = c.id and i.kind='invoice' and i.status not in ('void','draft'))::numeric revenue
    from clients c where c.name ilike ${q} or coalesce(c.email,'') ilike ${q} order by c.name`;
  return (
    <>
      <Head title="Clients" sub={`${rows.length} clients`}>
        <form className="row"><input name="q" placeholder="Search…" defaultValue={sp.q} /><button className="btn sec auto">Search</button></form>
      </Head>
      <div className="grid g2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <div className="mlist">
            {rows.map((c: any) => (
              <a key={c.id} href={`/clients/${c.id}`} className="mitem">
                <div className="mrow"><b>{c.name}</b><span className="small">{money(c.revenue)}</span></div>
                <div className="small muted">{c.type} · {c.jobs} jobs · {c.phone || c.email || ''}</div>
              </a>
            ))}
          </div>
          <table className="desk">
            <thead><tr><th>Name</th><th>Type</th><th>Contact</th><th>Terms</th><th className="r">Jobs</th><th className="r">Revenue</th></tr></thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id}>
                  <td><a href={`/clients/${c.id}`}>{c.name}</a><div className="small muted">{c.lead_source}</div></td>
                  <td>{c.type}</td><td className="small">{c.phone}<br />{c.email}</td><td>{c.payment_terms_days}d</td>
                  <td className="r">{c.jobs}</td><td className="r">{money(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={saveClient} className="card">
          <h2>Add client</h2>
          <Field label="Name" name="name" required />
          <Select label="Type" name="type" options={['school', 'business', 'sports club', 'community group', 'government', 'individual', 'tour operator']} />
          <div className="row"><Field label="Email" name="email" type="email" /><Field label="Phone" name="phone" /></div>
          <Field label="Address" name="address" />
          <div className="row"><Field label="ABN" name="abn" /><Field label="Payment terms (days)" name="payment_terms_days" type="number" value={14} /></div>
          <Select label="Lead source" name="lead_source" options={SOURCES} />
          <button className="btn">Add client</button>
        </form>
      </div>
    </>
  );
}
