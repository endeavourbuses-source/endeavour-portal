import { sql } from '@/lib/db';
import { Head } from '@/components/ui';
import { QuoteForm } from '@/components/quote-form';

export default async function NewQuote({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  let q: any = {};
  if (sp.enquiry) {
    const [e] = await sql`select * from enquiries where id = ${Number(sp.enquiry)}`;
    if (e) q = { enquiry_id: e.id, client_id: e.client_id, trip_date: e.trip_date, start_time: e.start_time, end_time: e.end_time, pickup: e.pickup, dropoff: e.dropoff, passengers: e.passengers, notes: '' };
  }
  if (sp.client) q.client_id = Number(sp.client);
  return (
    <>
      <Head title="New quote" sub={q.enquiry_id ? `For enquiry #${q.enquiry_id}` : 'Standalone quote'} />
      <QuoteForm q={q} />
    </>
  );
}
