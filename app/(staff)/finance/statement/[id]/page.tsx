import { sql, getSettings } from '@/lib/db';
import { money, fmtDate, today } from '@/lib/util';

export default async function Statement({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const s = await getSettings();
  const [c] = await sql`select * from clients where id = ${id}`;
  const invs = await sql`select i.*, (select coalesce(sum(amount),0) from payments p where p.invoice_id = i.id)::numeric paid
    from invoices i where client_id = ${id} and status in ('sent','paid') and kind = 'invoice' order by issue_date`;
  const open = invs.filter((i: any) => Number(i.total) - Number(i.paid) > 0.005);
  const total = open.reduce((a: number, i: any) => a + Number(i.total) - Number(i.paid), 0);
  return (
    <div className="doc" style={{ margin: 0 }}>
      <div className="top">
        <div><div className="co">{s.company_name}</div><div className="small muted pre">{[s.address, s.phone, s.email].filter(Boolean).join('\n')}</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 20, fontWeight: 700 }}>STATEMENT</div><div>{fmtDate(today(), { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
      </div>
      <p><b>{c.name}</b><br />{c.address}</p>
      <table>
        <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th className="r">Total</th><th className="r">Paid</th><th className="r">Balance</th></tr></thead>
        <tbody>
          {open.map((i: any) => <tr key={i.id}><td>{i.number}</td><td>{fmtDate(i.issue_date)}</td><td>{fmtDate(i.due_date)}</td><td className="r">{money(i.total)}</td><td className="r">{money(i.paid)}</td><td className="r">{money(Number(i.total) - Number(i.paid))}</td></tr>)}
          <tr><td colSpan={5} className="r"><b>Total outstanding</b></td><td className="r"><b>{money(total)}</b></td></tr>
        </tbody>
      </table>
      {s.bank_details && <p className="pre small" style={{ marginTop: 16 }}>{s.bank_details}</p>}
      <p className="noprint"><button className="btn sec" type="button" id="pr">Print / PDF</button></p>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('pr').onclick=()=>window.print()" }} />
    </div>
  );
}
