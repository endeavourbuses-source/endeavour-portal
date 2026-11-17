import { requireStaff } from '@/lib/auth';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStaff();
  const s = await getSettings();
  const [first, ...rest] = String(s.company_name).split(' ');
  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">{first} <span>{rest.join(' ')}</span></div>
        <a href="/">📊 Dashboard</a>
        <div className="grp">Sales / CRM</div>
        <a href="/crm">Pipeline</a>
        <a href="/crm/enquiries/new">+ New enquiry</a>
        <a href="/quotes">Quotes</a>
        <a href="/clients">Clients</a>
        <a href="/crm/tasks">Follow-ups</a>
        <a href="/crm/reports">Sales reports</a>
        <div className="grp">Operations</div>
        <a href="/calendar">Calendar</a>
        <a href="/jobs">Jobs</a>
        <a href="/jobs/new">+ New job</a>
        <a href="/driver">Driver app view</a>
        <div className="grp">People</div>
        <a href="/staff">Staff</a>
        <a href="/staff/leave">Leave</a>
        <a href="/staff/timesheets">Timesheets</a>
        <div className="grp">Fleet</div>
        <a href="/fleet">Buses</a>
        <a href="/fleet/defects">Defects</a>
        <div className="grp">Finance</div>
        <a href="/finance">Invoices</a>
        <a href="/finance/expenses">Expenses</a>
        <a href="/finance/reports">Profit reports</a>
        <div className="grp">Admin</div>
        <a href="/settings">Settings & rates</a>
        <a href="/settings/audit">Audit log</a>
        <div className="me">
          {u.name} · {u.role}
          <br />
          <a href="/login?logout=1" style={{ padding: 0, color: 'var(--accent)' }}>Sign out</a>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
