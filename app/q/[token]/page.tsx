import { notFound, redirect } from 'next/navigation';
import { sql, getSettings, ensureDb } from '@/lib/db';
import { money, fmtDateLong, today, logActivity, audit } from '@/lib/util';
import { convertQuoteToJob } from '@/lib/logic';

export const dynamic = 'force-dynamic';

async function accept(fd: FormData) {
  'use server';
  const tok = String(fd.get('token'));
  const name = String(fd.get('name') || '').trim();
  const [q] = await sql`select * from quotes where token = ${tok}`;
  if (!q || q.status !== 'sent' || (q.expiry_date && q.expiry_date < today()) || !name) redirect(`/q/${tok}`);
  await sql`update quotes set accepted_at = now(), accepted_name = ${name} where id = ${q.id}`;
  await logActivity('quote', q.id, `Accepted online by ${name}`);
  await audit(null, 'accept', 'quote', q.id, `online by ${name}`);
  await convertQuoteToJob(q.id, null);
  redirect(`/q/${tok}?ok=1`);
}

export default async function PublicQuote({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<any> }) {
  const { token } = await params;
  const sp = await searchParams;
  await ensureDb();
  const s = await getSettings();
  const [q] = await sql`select q.*, c.name client, c.address caddr, e.contact_name, e.organisation from quotes q
    left join clients c on c.id = q.client_id left join enquiries e on e.id = q.enquiry_id where q.token = ${token}`;
  if (!q) notFound();
  const expired = q.status === 'expired' || (q.status === 'sent' && q.expiry_date && q.expiry_date < today());
  const deposit = q.deposit_pct > 0 ? (q.total * q.deposit_pct) / 100 : 0;
  const [depInv] = q.job_id ? await sql`select token from invoices where job_id = ${q.job_id} and lines::text like '%Deposit %' limit 1` : [null];
  return (
    <div className="doc">
      <div className="top">
        <div>
          <div className="co">{s.company_name}</div>
          <div className="small muted pre">{[s.address, s.phone, s.email, s.abn && `ABN ${s.abn}`].filter(Boolean).join('\n')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>QUOTE</div>
          <div>Q{q.id}{q.version > 1 ? `-v${q.version}` : ''}</div>
          <div className="small muted">Valid until {fmtDateLong(q.expiry_date)}</div>
        </div>
      </div>
      {sp.ok && <div className="alert green noprint">Thank you – your booking is confirmed. We'll be in touch with driver details closer to the date.{depInv && <> Please pay your deposit here: <a href={`/i/${depInv.token}`}>deposit invoice</a>.</>}</div>}
      <p><b>Prepared for:</b> {q.client || q.organisation || q.contact_name}{q.contact_name && q.client ? ` (attn ${q.contact_name})` : ''}</p>
      <table style={{ marginBottom: 16 }}>
        <tbody>
          <tr><th style={{ width: 160 }}>Date</th><td>{fmtDateLong(q.trip_date)}</td></tr>
          <tr><th>Time</th><td>{q.start_time || 'TBC'} – {q.end_time || 'TBC'}</td></tr>
          <tr><th>Pickup</th><td>{q.pickup}</td></tr>
          <tr><th>Destination</th><td>{q.dropoff}</td></tr>
          <tr><th>Passengers</th><td>{q.passengers}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Description</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {q.lines.map((l: any, i: number) => <tr key={i}><td>{l.description}</td><td className="r">{money(l.amount)}</td></tr>)}
          <tr><td className="r">Subtotal</td><td className="r">{money(q.subtotal)}</td></tr>
          <tr><td className="r">GST</td><td className="r">{money(q.gst)}</td></tr>
          <tr><td className="r"><b>Total (inc GST)</b></td><td className="r"><b>{money(q.total)}</b></td></tr>
          {deposit > 0 && <tr><td className="r">Deposit required to confirm ({q.deposit_pct}%)</td><td className="r">{money(deposit)}</td></tr>}
        </tbody>
      </table>
      {q.notes && <p className="pre" style={{ marginTop: 16 }}>{q.notes}</p>}
      <div className="noprint" style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        {q.status === 'accepted' || q.job_id ? (
          <div className="alert green">Accepted{q.accepted_name ? ` by ${q.accepted_name}` : ''}. Thank you!</div>
        ) : expired ? (
          <div className="alert amber">This quote has expired. Please contact us for an updated price.</div>
        ) : q.status === 'sent' ? (
          <form action={accept} className="row">
            <input type="hidden" name="token" value={token} />
            <div style={{ flex: 2 }}><label>Your name</label><input name="name" required /></div>
            <div className="auto"><button className="btn warn">Accept quote & book</button></div>
          </form>
        ) : q.status === 'superseded' ? (
          <div className="alert amber">This quote has been replaced by a newer version.</div>
        ) : q.status === 'declined' ? (
          <div className="alert amber">This quote was declined.</div>
        ) : <div className="alert blue">Draft – not yet issued.</div>}
        <p><button className="btn sec" type="button" id="pr">Print / save as PDF</button></p>
        <script dangerouslySetInnerHTML={{ __html: "document.getElementById('pr').onclick=()=>window.print()" }} />
      </div>
    </div>
  );
}
