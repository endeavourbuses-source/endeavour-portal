'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link, { useLinkStatus } from 'next/link';

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navbar-progress" aria-hidden /> : null;
}

type Item = [href: string, label: string, icon: string];
const GROUPS: [string, Item[]][] = [
  ['', [['/', 'Dashboard', '📊']]],
  ['Sales / CRM', [['/crm', 'Pipeline', '🎯'], ['/crm/enquiries/new', 'New enquiry', '➕'], ['/quotes', 'Quotes', '📝'], ['/clients', 'Clients', '🏫'], ['/crm/tasks', 'Follow-ups', '🔔'], ['/crm/reports', 'Sales reports', '📈']]],
  ['Operations', [['/calendar', 'Calendar', '🗓️'], ['/jobs', 'Jobs', '🚌'], ['/jobs/new', 'New job', '➕'], ['/driver', 'Driver app view', '📱']]],
  ['People', [['/staff', 'Staff', '👥'], ['/staff/leave', 'Leave', '🌴'], ['/staff/timesheets', 'Timesheets', '⏱️']]],
  ['Fleet', [['/fleet', 'Buses', '🚍'], ['/fleet/defects', 'Defects', '🔧']]],
  ['Finance', [['/finance', 'Invoices', '💵'], ['/finance/expenses', 'Expenses', '🧾'], ['/finance/reports', 'Profit reports', '💹']]],
  ['Admin', [['/settings', 'Settings & rates', '⚙️'], ['/settings/audit', 'Audit log', '📜']]],
];
const TABS: Item[] = [['/', 'Home', '📊'], ['/calendar', 'Calendar', '🗓️'], ['/jobs', 'Jobs', '🚌'], ['/crm', 'Sales', '🎯'], ['/finance', 'Invoices', '💵']];

function active(path: string, href: string) {
  if (href === '/') return path === '/';
  // most specific match wins (e.g. /crm/tasks shouldn't light up /crm)
  const all = GROUPS.flatMap(([, i]) => i.map((x) => x[0]));
  const best = all.filter((h) => h !== '/' && (path === h || path.startsWith(h + '/'))).sort((a, b) => b.length - a.length)[0];
  return best === href;
}

export function Nav({ company, user }: { company: string; user: { name: string; role: string } }) {
  const path = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const [first, ...rest] = company.split(' ');
  const current = GROUPS.flatMap(([, i]) => i).find(([h]) => active(path, h));
  const links = (
    <>
      {GROUPS.map(([g, items]) => (
        <div key={g || 'top'}>
          {g && <div className="grp">{g}</div>}
          {items.map(([href, label, icon]) => (
            <Link key={href} href={href} prefetch={false} className={active(path, href) ? 'on' : ''}><span className="ic">{icon}</span>{label}<Pending /></Link>
          ))}
        </div>
      ))}
      <div className="me">
        {user.name} · {user.role}
        <br />
        <a href="/login?logout=1" className="out">Sign out</a>
      </div>
    </>
  );
  return (
    <>
      {/* desktop sidebar */}
      <nav className="side">
        <div className="brand">{first} <span>{rest.join(' ')}</span></div>
        {links}
      </nav>
      {/* mobile top bar */}
      <header className="mtop">
        <div className="brand">{first} <span>{rest.join(' ')}</span></div>
        <div className="mtitle">{current?.[1] || ''}</div>
        <button className="burger" onClick={() => setOpen(!open)} aria-label="Menu">{open ? '✕' : '☰'}</button>
      </header>
      {open && <div className="mdrawer" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}><nav className="mpanel">{links}</nav></div>}
      {/* mobile bottom tabs */}
      <nav className="mtabs">
        {TABS.map(([href, label, icon]) => (
          <Link key={href} href={href} className={active(path, href) ? 'on' : ''}><span className="ti">{icon}</span>{label}<Pending /></Link>
        ))}
      </nav>
    </>
  );
}
