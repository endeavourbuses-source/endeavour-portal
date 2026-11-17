import { STATUS_LABEL } from '@/lib/util';

export function Badge({ s, children }: { s: string; children?: React.ReactNode }) {
  return <span className={`b ${s}`}>{children ?? STATUS_LABEL[s] ?? s}</span>;
}

export function Field({ label, name, type = 'text', value, ...rest }: any) {
  return (
    <div className="f">
      <label>{label}</label>
      {type === 'textarea' ? (
        <textarea name={name} defaultValue={value ?? ''} {...rest} />
      ) : (
        <input name={name} type={type} defaultValue={value ?? ''} {...rest} />
      )}
    </div>
  );
}

export function Select({ label, name, value, options, blank, ...rest }: any) {
  return (
    <div className="f">
      <label>{label}</label>
      <select name={name} defaultValue={value ?? ''} {...rest}>
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map((o: any) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>{STATUS_LABEL[o] ?? o}</option>
          ) : (
            <option key={o.value} value={o.value}>{o.label}</option>
          )
        )}
      </select>
    </div>
  );
}

export function Head({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="muted">{sub}</div>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}

export function SubNav({ items, on }: { items: [string, string][]; on: string }) {
  return (
    <div className="subnav">
      {items.map(([href, label]) => (
        <a key={href} href={href} className={on === href ? 'on' : ''}>{label}</a>
      ))}
    </div>
  );
}

export function Checks({ checks }: { checks: { level: string; msg: string }[] }) {
  if (!checks?.length) return <span className="b green">OK</span>;
  return (
    <>
      {checks.map((c, i) => (
        <div key={i} className={`small`} style={{ color: c.level === 'block' ? 'var(--red)' : 'var(--amber)' }}>
          {c.level === 'block' ? '⛔' : '⚠️'} {c.msg}
        </div>
      ))}
    </>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="muted" style={{ padding: 16, textAlign: 'center' }}>{children}</div>;
}
