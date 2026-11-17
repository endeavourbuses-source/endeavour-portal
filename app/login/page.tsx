import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { sql, ensureDb, getSettings } from '@/lib/db';
import { createSession, destroySession, getUser } from '@/lib/auth';
import { audit } from '@/lib/util';

async function staffLogin(fd: FormData) {
  'use server';
  await ensureDb();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const pw = String(fd.get('password') || '');
  const [u] = await sql`select * from users where lower(email) = ${email} and active and role in ('admin','office')`;
  if (!u || !u.password_hash || !(await bcrypt.compare(pw, u.password_hash))) redirect('/login?e=1');
  await createSession({ id: u.id, name: u.name, role: u.role });
  await audit(u, 'login', 'user', u.id);
  redirect('/');
}

async function driverLogin(fd: FormData) {
  'use server';
  await ensureDb();
  const id = Number(fd.get('driver'));
  const pin = String(fd.get('pin') || '');
  const [u] = await sql`select * from users where id = ${id} and active`;
  if (!u || !u.pin_hash || !(await bcrypt.compare(pin, u.pin_hash))) redirect('/login?t=driver&e=1');
  await createSession({ id: u.id, name: u.name, role: u.role });
  await audit(u, 'login', 'user', u.id, 'driver app');
  redirect('/driver');
}

async function logout() {
  'use server';
  await destroySession();
  redirect('/login');
}

export default async function Login({ searchParams }: { searchParams: Promise<any> }) {
  const sp = await searchParams;
  if (sp.logout) {
    return (
      <form action={logout} className="center">
        <button className="btn">Sign out</button>
      </form>
    );
  }
  await ensureDb();
  const [{ n }] = await sql`select count(*)::int n from users where role = 'admin'`;
  if (n === 0) redirect('/setup');
  const me = await getUser();
  if (me) redirect(me.role === 'driver' ? '/driver' : '/');
  const s = await getSettings();
  const driverTab = sp.t === 'driver';
  const drivers = driverTab ? await sql`select id, name from users where active and pin_hash is not null order by name` : [];
  return (
    <div className="center">
      <div className="loginbox">
        <h1 style={{ color: 'var(--navy)' }}>{s.company_name}</h1>
        <p className="muted" style={{ marginTop: 0 }}>Operations portal</p>
        <div className="tabs">
          <a href="/login?t=driver" className={driverTab ? 'on' : ''}>Driver</a>
          <a href="/login" className={!driverTab ? 'on' : ''}>Office</a>
        </div>
        {sp.e && <div className="alert red">{driverTab ? 'Wrong PIN, try again.' : 'Email or password is incorrect.'}</div>}
        {driverTab ? (
          <form action={driverLogin}>
            <div className="f">
              <label>Your name</label>
              <select name="driver" required>
                <option value="">Select…</option>
                {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="f">
              <label>PIN</label>
              <input name="pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required style={{ fontSize: 22, letterSpacing: 6 }} />
            </div>
            <button className="btn big">Sign in</button>
          </form>
        ) : (
          <form action={staffLogin}>
            <div className="f"><label>Email</label><input name="email" type="email" required /></div>
            <div className="f"><label>Password</label><input name="password" type="password" required /></div>
            <button className="btn big">Sign in</button>
          </form>
        )}
      </div>
    </div>
  );
}
