import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { money, fmtDateLong, fmtTs } from '@/lib/util';
import { Badge, Head } from '@/components/ui';
import { EnquiryForm } from '@/components/enquiry-form';
import { ActivityLog } from '@/components/activity';
import { setEnquiryStatus } from '../../actions';

export default async function Enquiry({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [e] = await sql`select e.*, c.name client from enquiries e left join clients c on c.id = e.client_id where e.id = ${Number(id)}`;
  if (!e) notFound();
  const quotes = await sql`select * from quotes where enquiry_id = ${e.id} order by id desc`;
  return (
    <>
      <Head title={e.organisation || e.client || e.contact_name || `Enquiry #${e.id}`} sub={<>Enquiry #{e.id} · {e.channel === 'online' ? 'online form' : 'office'} · {e.source} · received {fmtTs(e.created_at)} <Badge s={e.status} /></>}>
        <a className="btn" href={`/quotes/new?enquiry=${e.id}`}>{quotes.length ? 'New quote version' : 'Create quote'}</a>
      </Head>
      <div className="grid g2">
        <div>
          <div className="card">
            <h2>Summary</h2>
            <p style={{ margin: 0 }}>
              <b>{e.trip_date ? fmtDateLong(e.trip_date) : 'Date TBC'}</b> {e.start_time && `${e.start_time}–${e.end_time || '?'}`}<br />
              {e.pickup} → {e.dropoff} · {e.passengers || '?'} passengers<br />
              {e.contact_name} · {e.contact_phone} · {e.contact_email}
              {e.client_id && <> · <a href={`/clients/${e.client_id}`}>client record</a></>}
            </p>
            {e.details && <p className="pre">{e.details}</p>}
            {e.outcome_reason && <p><b>Outcome reason:</b> {e.outcome_reason}</p>}
          </div>
          <div className="card">
            <h2>Quotes</h2>
            {quotes.length === 0 ? <p className="muted">No quotes yet.</p> : (
              <table><tbody>
                {quotes.map((q: any) => (
                  <tr key={q.id}><td><a href={`/quotes/${q.id}`}>Q{q.id} v{q.version}</a></td><td>{money(q.total)}</td><td><Badge s={q.status} /></td><td className="small muted">{q.sent_at ? `sent ${fmtTs(q.sent_at)}` : ''}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div className="card">
            <h2>Mark outcome</h2>
            <form action={setEnquiryStatus} className="row">
              <input type="hidden" name="id" value={e.id} />
              <div className="auto" style={{ width: 140 }}>
                <label>Status</label>
                <select name="status" defaultValue={e.status}>
                  <option value="enquiry">Enquiry</option><option value="quoted">Quoted</option><option value="follow_up">Follow-up</option>
                  <option value="won">Won</option><option value="lost">Lost</option>
                </select>
              </div>
              <div style={{ flex: 3 }}>
                <label>Reason (for won/lost)</label>
                <input name="reason" list="reasons" placeholder="e.g. Price too high, went with competitor" />
                <datalist id="reasons">
                  <option>Price too high</option><option>Went with competitor</option><option>Trip cancelled</option><option>No bus available</option>
                  <option>No response</option><option>Best price</option><option>Repeat client / relationship</option><option>Availability</option><option>Bus quality / safety record</option>
                </datalist>
              </div>
              <div className="auto"><button className="btn">Update</button></div>
            </form>
            <p className="small muted">Tip: accepting a quote (or converting it) marks this enquiry as won automatically.</p>
          </div>
          <ActivityLog entity="enquiry" id={e.id} back={`/crm/enquiries/${e.id}`} />
        </div>
        <div>
          <details>
            <summary>Edit enquiry</summary>
            <EnquiryForm e={e} />
          </details>
        </div>
      </div>
    </>
  );
}
