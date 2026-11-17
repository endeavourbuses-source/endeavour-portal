// Database schema. Applied automatically (idempotent) on first request.
export const SCHEMA = `
create table if not exists settings (key text primary key, value jsonb not null);

create table if not exists users (
  id serial primary key,
  name text not null,
  email text unique,
  role text not null default 'driver' check (role in ('admin','office','driver')),
  password_hash text,
  pin_hash text,
  active boolean not null default true,
  phone text, address text,
  employment_type text default 'casual',
  emergency_name text, emergency_phone text,
  licence_no text, licence_class text, licence_expiry date,
  medical_expiry date, wwcc_no text, wwcc_expiry date, accreditation_expiry date,
  start_date date,
  leave_balance_hours numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists staff_notes (
  id serial primary key, user_id int references users(id) on delete cascade,
  kind text not null default 'note', -- performance | training | induction | document | incident | note
  title text, note text, doc_url text, expiry date,
  created_by int references users(id), created_at timestamptz default now()
);

create table if not exists leave (
  id serial primary key, user_id int references users(id) on delete cascade,
  start_date date not null, end_date date not null, type text default 'annual',
  hours numeric default 0,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  note text, created_at timestamptz default now()
);

create table if not exists clients (
  id serial primary key, name text not null, type text default 'business',
  abn text, email text, phone text, address text,
  payment_terms_days int default 14, lead_source text, notes text,
  created_at timestamptz default now()
);

create table if not exists contacts (
  id serial primary key, client_id int references clients(id) on delete cascade,
  name text not null, role text, email text, phone text
);

create table if not exists enquiries (
  id serial primary key, client_id int references clients(id) on delete set null,
  contact_name text, contact_email text, contact_phone text, organisation text,
  source text default 'phone', channel text default 'office',
  trip_date date, start_time text, end_time text, pickup text, dropoff text, passengers int,
  details text,
  status text not null default 'enquiry' check (status in ('enquiry','quoted','follow_up','won','lost')),
  outcome_reason text, value numeric default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists rate_cards (
  id serial primary key, name text not null, bus_class text,
  per_km numeric default 5, per_hour numeric default 0, min_charge numeric default 0,
  weekend_pct numeric default 15, holiday_pct numeric default 25, active boolean default true
);

create table if not exists holidays (day date primary key, name text);

create table if not exists quotes (
  id serial primary key, enquiry_id int references enquiries(id) on delete set null,
  client_id int references clients(id) on delete set null,
  parent_id int references quotes(id), version int default 1,
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired','superseded')),
  trip_date date, start_time text, end_time text, pickup text, dropoff text, passengers int,
  km numeric default 0, hours numeric default 0, rate_card_id int references rate_cards(id),
  lines jsonb default '[]', subtotal numeric default 0, gst numeric default 0, total numeric default 0,
  deposit_pct numeric default 0, expiry_date date, notes text, extras text,
  token text unique, sent_at timestamptz, accepted_at timestamptz, accepted_name text,
  job_id int, created_at timestamptz default now()
);

create table if not exists activities (
  id serial primary key, entity text not null, entity_id int not null,
  user_id int references users(id), kind text default 'note', -- call|email|note|task|system
  text text, due_date date, done boolean default false, created_at timestamptz default now()
);

create table if not exists buses (
  id serial primary key, fleet_no text, rego text, vin text, make_model text,
  seats int default 0, bus_class text, features text,
  odometer int default 0,
  service_interval_km int default 15000, service_interval_days int default 180,
  last_service_km int default 0, last_service_date date,
  rego_expiry date, insurance_expiry date, inspection_expiry date,
  active boolean default true, notes text
);

create table if not exists odometer_log (
  id serial primary key, bus_id int references buses(id) on delete cascade,
  reading int not null, source text default 'manual', job_id int, at timestamptz default now()
);

create table if not exists workshop (
  id serial primary key, bus_id int references buses(id) on delete cascade,
  date date default current_date, kind text default 'repair', -- service|repair|inspection
  description text, parts_cost numeric default 0, labour_cost numeric default 0,
  supplier text, odometer int, created_at timestamptz default now()
);

create table if not exists defects (
  id serial primary key, bus_id int references buses(id) on delete cascade,
  reported_by int references users(id), job_id int,
  description text, severity text default 'minor', -- minor|major|critical
  status text default 'open', resolution text,
  created_at timestamptz default now(), fixed_at timestamptz
);

create table if not exists jobs (
  id serial primary key, client_id int references clients(id) on delete set null,
  quote_id int, title text,
  date date not null, start_time text, end_time text,
  pickup text, dropoff text, stops text, passengers int default 0, special_needs text, notes text,
  route text, route_approved boolean default false,
  bus_id int references buses(id) on delete set null,
  driver_id int references users(id) on delete set null,
  assignment text default 'provisional',
  status text not null default 'scheduled'
    check (status in ('scheduled','assigned','route_approved','in_progress','completed','cancelled')),
  price numeric default 0, cancel_fee numeric default 0, cancel_reason text,
  recurring_group text, subcontractor text, subcontract_cost numeric default 0,
  driver_ack_at timestamptz, signon_at timestamptz, signoff_at timestamptz,
  break_minutes int default 0, odo_start int, odo_end int,
  pretrip jsonb, client_signoff text, created_at timestamptz default now()
);

create table if not exists incidents (
  id serial primary key, job_id int references jobs(id) on delete set null,
  user_id int references users(id), bus_id int references buses(id),
  description text, severity text default 'minor', created_at timestamptz default now()
);

create table if not exists invoices (
  id serial primary key, number text unique, kind text default 'invoice', -- invoice|credit
  client_id int references clients(id) on delete set null, job_id int references jobs(id) on delete set null,
  quote_id int, issue_date date default current_date, due_date date,
  lines jsonb default '[]', subtotal numeric default 0, gst numeric default 0, total numeric default 0,
  status text default 'draft', -- draft|sent|paid|void
  notes text, token text unique, sent_at timestamptz, last_reminder_days int default 0,
  created_at timestamptz default now()
);

create table if not exists payments (
  id serial primary key, invoice_id int references invoices(id) on delete cascade,
  amount numeric not null, date date default current_date, method text default 'bank transfer', note text
);

create table if not exists expenses (
  id serial primary key, date date default current_date, category text, supplier text, description text,
  amount numeric default 0, gst numeric default 0,
  bus_id int references buses(id) on delete set null, job_id int references jobs(id) on delete set null,
  recurring text default 'none', -- none|monthly|quarterly|yearly
  receipt_url text, created_at timestamptz default now()
);

create table if not exists audit (
  id serial primary key, user_id int, user_name text, action text, entity text, entity_id int,
  detail text, at timestamptz default now()
);

create index if not exists jobs_date_idx on jobs(date);
create index if not exists activities_entity_idx on activities(entity, entity_id);
`;
