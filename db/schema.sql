-- AgentPurse schema. Idempotent: safe to run repeatedly (scripts/migrate.ts).
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  role text not null check (role in ('owner','approver','viewer')),
  password_hash text not null,
  totp_secret_enc text,
  created_at timestamptz not null default now()
);

create table if not exists mandates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null check (status in ('pending_activation','active','suspended')),
  currency char(3) not null,
  budget_cents bigint not null check (budget_cents > 0),
  per_payment_cap_cents bigint not null check (per_payment_cap_cents > 0),
  approval_threshold_cents bigint not null check (approval_threshold_cents >= 0),
  velocity_max_per_hour int not null check (velocity_max_per_hour > 0),
  expires_at timestamptz not null,
  created_by uuid references users(id),
  activated_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,
  payee_email_enc text not null,          -- the ONLY place a payout destination lives
  payee_email_hash text not null,
  status text not null check (status in ('pending','verified','blocked')),
  created_by uuid references users(id),
  verified_by uuid references users(id),
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now()
);

create table if not exists mandate_vendors (
  mandate_id uuid references mandates(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  primary key (mandate_id, vendor_id)
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  mandate_id uuid not null references mandates(id),
  status text not null default 'active' check (status in ('active','revoked')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null references mandates(id),
  source text not null check (source in ('paste','upload','agent','fixture')),
  submitted_by_kind text not null check (submitted_by_kind in ('user','agent')),
  submitted_by uuid not null,
  content_hash text not null,
  raw_enc text,                            -- encrypted original text (AES-256-GCM)
  vendor_id uuid references vendors(id),
  vendor_name text,
  invoice_number text,
  amount_cents bigint,
  currency char(3),
  due_date date,
  extracted jsonb,                         -- emails masked
  status text not null check (status in ('NEEDS_REVIEW','REJECTED','AWAITING_APPROVAL','PAYMENT_PENDING','PAID','PAYMENT_FAILED','CANCELED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_hash_idx on invoices(content_hash);
create index if not exists invoices_vendor_idx on invoices(vendor_id, created_at desc);
create index if not exists invoices_status_idx on invoices(status, created_at desc);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  verdict text not null check (verdict in ('ALLOW','ESCALATE','DENY')),
  reasons jsonb not null,
  trace jsonb not null,
  proposal jsonb not null,
  vendor_facts jsonb not null,
  decision_hash text not null,
  explanation text,
  policy_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists decisions_invoice_idx on decisions(invoice_id);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references invoices(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  token_nonce text,
  token_used boolean not null default false,
  decided_by uuid references users(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

-- The payments table doubles as the transactional outbox: a row is written in the same
-- transaction as the decision, and a worker submits it to PayPal later with a stable idempotency key.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references invoices(id),
  mandate_id uuid not null references mandates(id),
  vendor_id uuid not null references vendors(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null,
  status text not null check (status in ('QUEUED','SUBMITTING','UNKNOWN','SUBMITTED','PAID','FAILED','BLOCKED','RETURNED','CANCELED')),
  sender_batch_id text not null unique,
  idempotency_key text not null unique,
  release_at timestamptz not null,
  attempts int not null default 0,
  paypal_batch_id text,
  paypal_item_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_due_idx on payments(status, release_at);
create index if not exists payments_mandate_idx on payments(mandate_id, created_at desc);

create table if not exists webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  outcome text
);

create table if not exists system_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  seq bigserial primary key,
  id uuid not null,
  ts timestamptz not null,
  actor_kind text not null,
  actor_id uuid,
  action text not null,
  subject_type text,
  subject_id uuid,
  detail jsonb not null,
  prev_hash text not null,
  hash text not null
);
create index if not exists audit_subject_idx on audit_events(subject_id, seq);

-- Audit rows are append-only at the database level, whoever the app connects as.
create or replace function audit_events_immutable() returns trigger as $$
begin
  raise exception 'audit_events is append-only';
end; $$ language plpgsql;

drop trigger if exists audit_no_update on audit_events;
create trigger audit_no_update before update or delete on audit_events
  for each row execute function audit_events_immutable();
drop trigger if exists audit_no_truncate on audit_events;
create trigger audit_no_truncate before truncate on audit_events
  for each statement execute function audit_events_immutable();
