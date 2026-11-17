import { Head } from '@/components/ui';
import { JobForm } from '@/components/job-form';
import { today } from '@/lib/util';

export default async function NewJob({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  return (
    <>
      <Head title="New job" sub="Quoted charters become jobs automatically when won. Use this for contract work, school runs and phone bookings." />
      <JobForm j={{ date: sp.date || today(), client_id: sp.client ? Number(sp.client) : null }} />
    </>
  );
}
