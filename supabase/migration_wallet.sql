-- =============================================================================
-- Migration: prepaid credit wallet (1 credit = RM1)
-- Run this in Supabase -> SQL Editor -> New query -> Run (once).
-- =============================================================================

-- Credit balance on each user.
alter table users add column if not exists credits numeric(10,2) not null default 0;

-- Auto-renew flag + placement on ad campaigns.
alter table advertisements add column if not exists auto_renew boolean not null default false;
alter table advertisements add column if not exists placement varchar(20) not null default 'featured';
    -- placement: top | side | featured | sponsored

-- Ledger of every credit movement (top-ups, spends, renewals).
create table if not exists credit_transactions (
    id            bigint generated always as identity primary key,
    user_id       bigint not null references users(id) on delete cascade,
    amount        numeric(10,2) not null,          -- +topup, -spend
    type          varchar(30) not null,            -- topup | event | advertisement | ad_renewal
    description   text,
    balance_after numeric(10,2) not null,
    created_at    timestamptz not null default now()
);

create index if not exists idx_credit_txn_user on credit_transactions(user_id, created_at desc);
