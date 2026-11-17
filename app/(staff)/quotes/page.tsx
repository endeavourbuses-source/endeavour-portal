import { sql } from '@/lib/db';
import { money, fmtDate, fmtTs } from '@/lib/util';
import { Badge, Head, SubNav } from '@/components/ui';

export default async function Quotes({ searchParams }: { searchParams: Promise<any> }) {
  const f = (await searchParams).f || 'all';
  const rows = await sql`select q.*, c.name client, e.organisation from quotes q left join clients c on c.id = q.client_id
    left join enquiries e on e.id = q.enquiry_id
    where (${f} = 'all' and q.status <> 'superseded') or q.status = ${f} order by q.id desc limit 300`;
  return (
    <>
      <Head title="Quotes"><a className="btn" href="/quotes/new">+ New quote</a></Head>
      <SubNav on={`/quotes?f=${f}`} items={[['/quotes?f=all', 'All'], ['/quotes?f=draft', 'Draft'], ['/quotes?f=sent', 'Sent'], ['/quotes?f=accepted', 'Accepted'], ['/quotes?f=declined', 'Declined'], ['/quotes?f=expired', 'Expired']]} />
      <div className="card">
        <div className="mlist">
          {rows.map((q: any) => (
            <a key={q.id} href={`/quotes/${q.id}`} className="mitem">
              <div className="mrow"><b>Q{q.id}{q.version > 1 ? ` v${q.version}` : ''} · {money(q.total)}</b><Badge s={q.status} /></div>
              <div className="mt">{q.client || q.organisation || '—'}</div>
              <div className="small muted">{fmtDate(q.trip_date)} · {q.pickup} → {q.dropoff}</div>
            </a>
          ))}
        </div>
        <table className="desk">
          <thead><tr><th>Quote</th><th>Client</th><th>Trip</th><th className="r">Total</th><th>Status</th><th>Sent</th><th>Expires</th></tr></thead>
          <tbody>
            {rows.map((q: any) => (
              <tr key={q.id}>
                <td><a href={`/quotes/${q.id}`}>Q{q.id}</a>{q.version > 1 && <span className="muted"> v{q.version}</span>}</td>
                <td>{q.client || q.organisation || '—'}</td>
                <td>{fmtDate(q.trip_date)}<div className="small muted">{q.pickup} → {q.dropoff}</div></td>
                <td className="r">{money(q.total)}</td>
                <td><Badge s={q.status} /></td>
                <td className="small">{fmtTs(q.sent_at)}</td>
                <td className="small">{fmtDate(q.expiry_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
