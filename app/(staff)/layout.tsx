import { requireStaff } from '@/lib/auth';
import { getSettings } from '@/lib/db';
import { Nav } from '@/components/nav';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStaff();
  const s = await getSettings();
  return (
    <div className="shell">
      <Nav company={String(s.company_name)} user={{ name: u.name, role: u.role }} />
      <main className="main">{children}</main>
    </div>
  );
}
