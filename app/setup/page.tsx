import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { sql, ensureDb } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { audit } from '@/lib/util';

async function setup(fd: FormData) {
  'use server';
  await ensureDb();
  const [{ n }] = await sql`select count(*)::int n from users where role = 'admin'`;
  if (n > 0) redirect('/login');
  if (process.env.SETUP_CODE && String(fd.get('code') || '').trim() !== process.env.SETUP_CODE) redirect('/setup?e=2');
  const name = String(fd.get('name')).trim();
  const email = String(fd.get('email')).trim().toLowerCase();
  const pw = String(fd.get('password'));
  if (pw.length < 8) redirect('/setup?e=1');
  const company = String(fd.get('company') || 'Endeavour Buses');
  await sql`insert into settings (key, value) values ('company_name', ${sql.json(company)}) on conflict (key) do update set value = excluded.value`;
  const [u] = await sql`insert into users (name, email, role, password_hash) values (${name}, ${email}, 'admin', ${await bcrypt.hash(pw, 10)}) returning id, name, role`;
  await audit(u, 'setup', 'user', u.id, 'First admin created');
  await createSession(u as any);
  redirect('/');
}

export default async function Setup({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  await ensureDb();
  const [{ n }] = await sql`select count(*)::int n from users where role = 'admin'`;
  if (n > 0) redirect('/login');
  return (
    <div className="center">
      <form action={setup} className="loginbox">
        <h1>Welcome 👋</h1>
        <p className="muted">Create the first admin account. You can add office staff and drivers after this.</p>
        {sp.e === '1' && <div className="alert red">Password must be at least 8 characters.</div>}
        {sp.e === '2' && <div className="alert red">Setup code is wrong.</div>}
        {process.env.SETUP_CODE && <div className="f"><label>Setup code (from Claude)</label><input name="code" required autoComplete="off" /></div>}
        <div className="f"><label>Company name</label><input name="company" defaultValue="Endeavour Buses" required /></div>
        <div className="f"><label>Your name</label><input name="name" required /></div>
        <div className="f"><label>Email</label><input name="email" type="email" required /></div>
        <div className="f"><label>Password (8+ characters)</label><input name="password" type="password" required minLength={8} /></div>
        <button className="btn big">Create admin & start</button>
      </form>
    </div>
  );
}
