import { notFound } from 'next/navigation';
import { sql, getSettings, ensureDb } from '@/lib/db';
import { money, fmtDateLong } from '@/lib/util';
import { invoicePaid, invoiceState } from '@/lib/logic';

export const dynamic = 'force-dynamic';

export default async function PublicInvoice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await ensureDb();
  const s = await getSettings();
  const [i] = await sql`select i.*, c.name client, c.address caddr, c.abn cabn from invoices i left join clients c on c.id = i.client_id where i.token = ${token}`;
  if (!i || i.status === 'draft') notFound();
  const paid = await invoicePaid(i.id);
  const state = invoiceState(i, paid);
  const payLink = process.env.PAYMENT_LINK_URL;
  return (
    <div className="doc">
      <div className="top">
        <div>
          <div className="co">{s.company_name}</div>
          <div className="small muted pre">{[s.address, s.phone, s.email, s.abn && `ABN ${s.abn}`].filter(Boolean).join('\n')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{i.kind === 'credit' ? 'CREDIT NOTE' : s.gst_registered ? 'TAX INVOICE' : 'INVOICE'}</div>
          <div>{i.number}</div>
          <div className="small">Issued {fmtDateLong(i.issue_date)}</div>
          {i.kind !== 'credit' && <div className="small"><b>Due {fmtDateLong(i.due_date)}</b></div>}
        </div>
      </div>
      <p><b>Bill to:</b> {i.client}<br /><span className="small muted">{i.caddr}{i.cabn ? ` · ABN ${i.cabn}` : ''}</span></p>
      <table>
        <thead><tr><th>Description</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {i.lines.map((l: any, k: number) => <tr key={k}><td>{l.description}</td><td className="r">{money(l.amount)}</td></tr>)}
          <tr><td className="r">Subtotal</td><td className="r">{money(i.subtotal)}</td></tr>
          <tr><td className="r">GST</td><td className="r">{money(i.gst)}</td></tr>
          <tr><td className="r"><b>Total</b></td><td className="r"><b>{money(i.total)}</b></td></tr>
          {paid > 0 && <tr><td className="r">Paid</td><td className="r">-{money(paid)}</td></tr>}
          {i.kind !== 'credit' && <tr><td className="r"><b>Balance due</b></td><td className="r"><b>{money(Math.max(0, i.total - paid))}</b></td></tr>}
        </tbody>
      </table>
      {state === 'paid' && <div className="alert green" style={{ marginTop: 16 }}>Paid in full – thank you.</div>}
      {state === 'overdue' && <div className="alert red" style={{ marginTop: 16 }}>This invoice is overdue.</div>}
      {i.kind !== 'credit' && state !== 'paid' && (
        <div style={{ marginTop: 16 }}>
          {s.bank_details && <p className="pre"><b>Pay by bank transfer</b> (reference {i.number}):<br />{s.bank_details}</p>}
          {payLink && <p className="noprint"><a className="btn warn" href={payLink}>Pay online by card</a></p>}
        </div>
      )}
      {i.notes && <p className="pre">{i.notes}</p>}
      <p className="noprint"><button className="btn sec" type="button" id="pr">Print / save as PDF</button></p>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('pr').onclick=()=>window.print()" }} />
    </div>
  );
}
