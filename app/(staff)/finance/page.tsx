import { sql } from '@/lib/db';
import { money, fmtDate, daysBetween, today } from '@/lib/util';
import { invoiceState } from '@/lib/logic';
import { Head, Badge, SubNav, Field, Select } from '@/components/ui';
import { newInvoice } from './actions';

export default async function Invoices({ searchParams }: { searchParams: Promise<any> }) {
  const f = (await searchParams).f || 'open';
  const t = today();
  const rows = await sql`select i.*, c.name client, (select coalesce(sum(amount),0) from payments p where p.invoice_id = i.id)::numeric paid
    from invoices i left join clients c on c.id = i.client_id order by i.id desc limit 500`;
  const list = rows.map((i: any) => ({ ...i, state: invoiceState(i, Number(i.paid)) })).filter((i: any) =>
    f === 'all' ? true : f === 'open' ? ['draft', 'sent', 'overdue', 'partial'].includes(i.state) : i.state === f);
  const clients = await sql`select id, name from clients order by name`;
  const aging = { cur: 0, d30: 0, d60: 0, d90: 0 };
  for (const i of rows.map((i: any) => ({ ...i, state: invoiceState(i, Number(i.paid)) }))) {
    if (!['sent', 'overdue', 'partial'].includes(i.state) || i.kind !== 'invoice') continue;
    const owe = Number(i.total) - Number(i.paid);
    const od = daysBetween(i.due_date, t);
    if (od <= 0) aging.cur += owe; else if (od <= 30) aging.d30 += owe; else if (od <= 60) aging.d60 += owe; else aging.d90 += owe;
  }
  const csv = ['Number,Kind,Client,Issue date,Due date,Subtotal,GST,Total,Paid,Status', ...rows.map((i: any) => [i.number, i.kind, `"${i.client || ''}"`, i.issue_date, i.due_date, i.subtotal, i.gst, i.total, i.paid, invoiceState(i, Number(i.paid))].join(','))].join('\n');
  return (
    <>
      <Head title="Invoices" sub="Invoices are drafted automatically when a job is completed. Reminders go out at 7/14/30 days overdue.">
        <a className="btn sec" download="invoices.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>Export CSV (Xero/MYOB import)</a>
      </Head>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat"><div className="n">{money(aging.cur)}</div><div className="l">Not yet due</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--amber)' }}>{money(aging.d30)}</div><div className="l">1–30 days overdue</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--red)' }}>{money(aging.d60)}</div><div className="l">31–60 days overdue</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--red)' }}>{money(aging.d90)}</div><div className="l">60+ days overdue</div></div>
      </div>
      <SubNav on={`/finance?f=${f}`} items={[['/finance?f=open', 'Open'], ['/finance?f=draft', 'Draft'], ['/finance?f=overdue', 'Overdue'], ['/finance?f=paid', 'Paid'], ['/finance?f=all', 'All']]} />
      <div className="grid g2" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <div className="mlist">
            {list.map((i: any) => (
              <a key={i.id} href={`/finance/${i.id}`} className="mitem">
                <div className="mrow"><b>{i.number}</b><Badge s={i.state} /></div>
                <div className="mt">{i.client || '—'}</div>
                <div className="mrow small muted"><span>Due {fmtDate(i.due_date)}</span><span>Total {money(i.total)}</span>{i.kind === 'invoice' && <span><b>Owing {money(Number(i.total) - Number(i.paid))}</b></span>}</div>
              </a>
            ))}
          </div>
          <table className="desk">
            <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th>Due</th><th className="r">Total</th><th className="r">Owing</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((i: any) => (
                <tr key={i.id}>
                  <td><a href={`/finance/${i.id}`}>{i.number}</a></td><td>{i.client}</td><td>{fmtDate(i.issue_date)}</td><td>{fmtDate(i.due_date)}</td>
                  <td className="r">{money(i.total)}</td><td className="r">{i.kind === 'invoice' ? money(Number(i.total) - Number(i.paid)) : ''}</td><td><Badge s={i.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={newInvoice} className="card">
          <h2>Manual invoice</h2>
          <Select label="Client" name="client_id" options={clients.map((c: any) => ({ value: c.id, label: c.name }))} />
          <Field label="Lines – “description | amount ex GST”" name="lines" type="textarea" required />
          <button className="btn">Create draft</button>
        </form>
      </div>
    </>
  );
}
