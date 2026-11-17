import { Head } from '@/components/ui';
import { EnquiryForm } from '@/components/enquiry-form';

export default async function NewEnquiry({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  return (
    <>
      <Head title="New enquiry" sub="Phone, email or walk-in. Online enquiries arrive automatically from the public form at /enquire." />
      <EnquiryForm e={sp.client ? { client_id: Number(sp.client), source: 'repeat client' } : {}} />
    </>
  );
}
