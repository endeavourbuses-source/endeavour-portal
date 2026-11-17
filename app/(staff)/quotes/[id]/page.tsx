import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { money, fmtDateLong, fmtTs, baseUrl } from '@/lib/util';
import { Badge, Head } from '@/components/ui';
import { QuoteForm } from '@/components/quote-form';
import { ActivityLog } from '@/components/activity';
import { sendQuote, newVersion, convertQuote, declineQuote } from '../actions';

export default async function Quote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<any> }) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const [q] = await sql`select q.*, c.name client, c.email cemail, e.contact_email, e.contact_name from quotes q left join clients c on c.id = q.client_id
    left join enquiries e on e.id = q.enquiry_id where q.id = ${id}`;
  if (!q) notFound();
  const versions = await sql`select id, version, status, total from quotes where id = ${q.parent_id || q.id} or parent_id = ${q.parent_id || q.id} order by version`;
  const link = `${baseUrl()}/q/${q.token}`;
  const editable = ['draft', 'sent', 'expired'].includes(q.status);
  return (
    <>
      <Head title={`Quote Q${q.id}${q.version > 1 ? ` (v${q.version})` : ''}`} sub={<>{q.client || q.contact_name || 'No client'} · {fmtDateLong(q.trip_date)} <Badge s={q.status} /></>}>
        <a className="btn sec" href={`/q/${q.token}`} target="_blank">View / PDF</a>
        {q.job_id ? <a className="btn" href={`/jobs/${q.job_id}`}>Open job #{q.job_id}</a> : (
          <form action={convertQuote}><input type="hidden" name="id" value={q.id} /><button className="btn warn">Won → create job</button></form>
        )}
      </Head>
      {sp.msg && <div className="alert blue">{sp.msg}</div>}
      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Price</h2>
            <table>
              <tbody>
                {q.lines.map((l: any, i: number) => <tr key={i}><td>{l.description}</td><td className="r">{money(l.amount)}</td></tr>)}
                <tr><td><b>Subtotal</b></td><td className="r"><b>{money(q.subtotal)}</b></td></tr>
                <tr><td>GST</td><td className="r">{money(q.gst)}</td></tr>
                <tr><td><b>Total</b></td><td className="r"><b>{money(q.total)}</b></td></tr>
                {q.deposit_pct > 0 && <tr><td>Deposit {q.deposit_pct}% (inc GST)</td><td className="r">{money((q.total * q.deposit_pct) / 100)}</td></tr>}
              </tbody>
            </table>
            <p className="small muted">Valid until {fmtDateLong(q.expiry_date)}{q.sent_at && ` · sent ${fmtTs(q.sent_at)}`}{q.accepted_at && ` · accepted ${fmtTs(q.accepted_at)} by ${q.accepted_name || 'client'}`}</p>
          </div>
          <div className="card">
            <h2>Send to client</h2>
            <p className="small">Client link (they can view, print and accept online):<br /><input readOnly value={link} /></p>
            {editable && (
              <form action={sendQuote} className="actions">
                <input type="hidden" name="id" value={q.id} />
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 500 }}>
                  <input type="checkbox" name="email" defaultChecked /> Email it to {q.contact_email || q.cemail || '(no email on file)'}
                </label>
                <button className="btn">{q.status === 'sent' ? 'Re-send' : 'Mark as sent'}</button>
              </form>
            )}
            <p className="small muted">Follow-up tasks are created automatically 3 and 7 days after sending if there's no response (change in Settings).</p>
          </div>
          <div className="card">
            <h2>Versions</h2>
            <div className="actions">
              {versions.map((v: any) => <a key={v.id} href={`/quotes/${v.id}`} className={`b ${v.id === q.id ? 'blue' : ''}`}>v{v.version} · {money(v.total)} · {v.status}</a>)}
            </div>
            {!q.job_id && <form action={newVersion} style={{ marginTop: 10 }}><input type="hidden" name="id" value={q.id} /><button className="btn sec sm">Create new version</button></form>}
          </div>
          {editable && (
            <form action={declineQuote} className="card row">
              <input type="hidden" name="id" value={q.id} />
              <div style={{ flex: 3 }}><label>Client said no – reason</label><input name="reason" placeholder="e.g. Price too high" /></div>
              <div className="auto"><button className="btn danger">Mark declined / lost</button></div>
            </form>
          )}
          <ActivityLog entity="quote" id={q.id} back={`/quotes/${q.id}`} />
        </div>
        <div>
          {q.enquiry_id && <p><a href={`/crm/enquiries/${q.enquiry_id}`}>← Enquiry #{q.enquiry_id}</a></p>}
          {editable ? <QuoteForm q={q} /> : <div className="card muted">This quote is {q.status} and can't be edited. Create a new version to change it.</div>}
        </div>
      </div>
    </>
  );
}
