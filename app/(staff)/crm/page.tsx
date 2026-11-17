import { sql } from '@/lib/db';
import { money, fmtDate } from '@/lib/util';
import { Head } from '@/components/ui';
import { setEnquiryStatus } from './actions';

const COLS = [
  ['enquiry', 'Enquiry'],
  ['quoted', 'Quoted'],
  ['follow_up', 'Follow-up'],
  ['won', 'Won'],
  ['lost', 'Lost'],
] as const;
const NEXT: Record<string, string[]> = { enquiry: ['quoted', 'lost'], quoted: ['follow_up', 'won', 'lost'], follow_up: ['won', 'lost'], won: [], lost: ['enquiry'] };

export default async function Pipeline({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  const days = Number(sp.days || 90);
  const rows = await sql`select e.*, c.name client,
      (select max(total) from quotes q where q.enquiry_id = e.id and q.status not in ('superseded')) quote_total
    from enquiries e left join clients c on c.id = e.client_id
    where e.status in ('enquiry','quoted','follow_up') or e.updated_at > now() - make_interval(days => ${days})
    order by e.updated_at desc`;
  return (
    <>
      <Head title="Sales pipeline" sub="Enquiry → quoted → follow-up → won / lost">
        <a className="btn" href="/crm/enquiries/new">+ New enquiry</a>
      </Head>
      <div className="board">
        {COLS.map(([k, label]) => {
          const items = rows.filter((r: any) => r.status === k);
          const val = items.reduce((s: number, r: any) => s + Number(r.quote_total || 0), 0);
          return (
            <div className="col" key={k}>
              <h3>{label} <span className="muted">{items.length}{val ? ` · ${money(val)}` : ''}</span></h3>
              {items.map((r: any) => (
                <div className="tile" key={r.id}>
                  <a className="t" href={`/crm/enquiries/${r.id}`}>{r.organisation || r.client || r.contact_name || `Enquiry #${r.id}`}</a>
                  <div className="small muted">{r.trip_date ? fmtDate(r.trip_date) : 'No date'} · {r.passengers || '?'} pax · {r.source}</div>
                  <div className="small">{r.pickup}{r.dropoff ? ` → ${r.dropoff}` : ''}</div>
                  {r.quote_total && <div className="small"><b>{money(r.quote_total)}</b></div>}
                  {r.outcome_reason && <div className="small muted">“{r.outcome_reason}”</div>}
                  <div className="actions" style={{ marginTop: 6 }}>
                    {k === 'enquiry' && <a className="btn sm" href={`/quotes/new?enquiry=${r.id}`}>Quote</a>}
                    {NEXT[k].filter((n) => n !== 'lost' && n !== 'won').map((n) => (
                      <form key={n} action={setEnquiryStatus} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value={n} />
                        <input type="hidden" name="back" value="/crm" />
                        <button className="btn sm sec">→ {COLS.find((c) => c[0] === n)?.[1]}</button>
                      </form>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="small muted">Won and lost show the last {days} days. Mark won/lost with a reason from the enquiry page so it counts in the win/loss report.</p>
    </>
  );
}
