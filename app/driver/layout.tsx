import { requireDriver } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const u = await requireDriver();
  return (
    <>
      <div className="dtop">
        <div><b>Endeavour</b> · {u.name.split(' ')[0]}</div>
        <div className="actions" style={{ fontSize: 13 }}>
          <a href="/driver">Jobs</a>
          <a href="/driver/leave">Leave</a>
          <a href="/driver/hours">Hours</a>
          {u.role !== 'driver' && <a href="/">Office</a>}
          <a href="/login?logout=1">Exit</a>
        </div>
      </div>
      <div className="dwrap">{children}</div>
    </>
  );
}
