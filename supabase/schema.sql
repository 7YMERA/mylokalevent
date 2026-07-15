-- =============================================================================
-- MyLokalEvent — Database Schema (PostgreSQL / Supabase)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run: drops and recreates everything.
-- =============================================================================

-- ---- Clean slate (dev only) -------------------------------------------------
drop table if exists posts cascade;
drop table if exists saved_events cascade;
drop table if exists notifications cascade;
drop table if exists audit_logs cascade;
drop table if exists payments cascade;
drop table if exists event_images cascade;
drop table if exists fish_catches cascade;
drop table if exists fishing_spots cascade;
drop table if exists news cascade;
drop table if exists advertisements cascade;
drop table if exists events cascade;
drop table if exists categories cascade;
drop table if exists users cascade;

drop type if exists user_role cascade;
drop type if exists user_status cascade;
drop type if exists event_status cascade;
drop type if exists ad_status cascade;
drop type if exists payment_status cascade;

-- ---- Enums ------------------------------------------------------------------
create type user_role     as enum ('user', 'organizer', 'fisherman', 'advertiser', 'admin');
create type user_status   as enum ('active', 'suspended', 'banned');
create type event_status  as enum ('pending', 'approved', 'rejected', 'live', 'expired');
create type ad_status     as enum ('pending', 'active', 'expired', 'rejected');
create type payment_status as enum ('pending', 'success', 'failed', 'refunded');

-- ---- 1. users ---------------------------------------------------------------
create table users (
    id              bigint generated always as identity primary key,
    name            varchar(100) not null,
    email           varchar(150) unique not null,
    password        varchar(255) not null,               -- bcrypt hash
    role            user_role    not null default 'user',
    status          user_status  not null default 'active',
    phone           varchar(20),
    profile_image   varchar(500),
    failed_attempts int          not null default 0,      -- for account lockout
    locked_until    timestamptz,                          -- null = not locked
    created_at      timestamptz  not null default now()
);

-- ---- 2. categories ----------------------------------------------------------
create table categories (
    id    bigint generated always as identity primary key,
    name  varchar(80) unique not null,
    kind  varchar(20) not null default 'event'           -- 'event' | 'news'
);

-- ---- 3. events --------------------------------------------------------------
create table events (
    id            bigint generated always as identity primary key,
    organizer_id  bigint not null references users(id) on delete cascade,
    title         varchar(200) not null,
    description   text,
    category_id   bigint references categories(id) on delete set null,
    state         varchar(50) not null,
    district      varchar(50) not null,
    location_url  text,                                   -- plain Google Maps link
    start_date    timestamptz not null,
    end_date      timestamptz not null,
    entry_fee     numeric(10,2) not null default 0.00,    -- 0 = free
    banner_url    varchar(500),
    status        event_status not null default 'pending',
    payment_id    bigint,                                 -- FK added after payments
    view_count    int not null default 0,
    reject_reason text,
    created_at    timestamptz not null default now()
);

-- ---- 4. event_images (gallery) ---------------------------------------------
create table event_images (
    id        bigint generated always as identity primary key,
    event_id  bigint not null references events(id) on delete cascade,
    image_url varchar(500) not null
);

-- ---- 5. advertisements ------------------------------------------------------
create table advertisements (
    id            bigint generated always as identity primary key,
    advertiser_id bigint not null references users(id) on delete cascade,
    title         varchar(200) not null,
    image_url     varchar(500),
    target_url    varchar(500),
    start_date    date,
    end_date      date,                                   -- start_date + 6 days
    amount_paid   numeric(10,2) not null default 70.00,
    clicks        int not null default 0,
    impressions   int not null default 0,
    status        ad_status not null default 'pending',
    payment_id    bigint,
    reject_reason text,
    created_at    timestamptz not null default now()
);

-- ---- 6. news ----------------------------------------------------------------
create table news (
    id          bigint generated always as identity primary key,
    author_id   bigint not null references users(id) on delete cascade,
    title       varchar(200) not null,
    body        text not null,
    category_id bigint references categories(id) on delete set null,
    image_url   varchar(500),
    published   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- ---- 7. fish_catches --------------------------------------------------------
create table fish_catches (
    id            bigint generated always as identity primary key,
    user_id       bigint not null references users(id) on delete cascade,
    species       varchar(100) not null,
    weight_kg     numeric(8,2) not null,
    price_per_kg  numeric(8,2) not null,
    location      varchar(200),
    catch_date    date,
    image_url     varchar(500),
    is_available  boolean not null default true,
    created_at    timestamptz not null default now()
);

-- ---- 8. fishing_spots (kolam pancing) --------------------------------------
create table fishing_spots (
    id          bigint generated always as identity primary key,
    name        varchar(150) not null,
    description text,
    state       varchar(50),
    district    varchar(50),
    maps_url    text not null,                            -- plain Google Maps link
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

-- ---- 9. payments ------------------------------------------------------------
create table payments (
    id             bigint generated always as identity primary key,
    user_id        bigint not null references users(id) on delete cascade,
    payable_type   varchar(50) not null,                 -- 'event' | 'advertisement'
    payable_id     bigint,
    amount         numeric(10,2) not null,
    method         varchar(50),                          -- online_banking | fpx | card
    status         payment_status not null default 'pending',
    transaction_id varchar(100),                         -- ToyyibPay bill code / ref
    bill_code      varchar(100),
    created_at     timestamptz not null default now()
);

-- Back-references from events / advertisements to their posting-fee payment.
alter table events
    add constraint fk_events_payment foreign key (payment_id) references payments(id) on delete set null;
alter table advertisements
    add constraint fk_ads_payment foreign key (payment_id) references payments(id) on delete set null;

-- ---- 10. audit_logs ---------------------------------------------------------
create table audit_logs (
    id         bigint generated always as identity primary key,
    user_id    bigint references users(id) on delete set null,
    action     varchar(50) not null,                     -- CREATE|UPDATE|DELETE|APPROVE|REJECT|LOGIN|LOGOUT
    table_name varchar(50),
    record_id  bigint,
    old_value  jsonb,
    new_value  jsonb,
    ip_address varchar(45),
    user_agent text,
    created_at timestamptz not null default now()
);

-- ---- 11. notifications ------------------------------------------------------
create table notifications (
    id         bigint generated always as identity primary key,
    user_id    bigint not null references users(id) on delete cascade,
    title      varchar(200) not null,
    body       text,
    is_read    boolean not null default false,
    created_at timestamptz not null default now()
);

-- ---- 12. saved_events (junction, many-to-many bookmarks) -------------------
create table saved_events (
    user_id    bigint not null references users(id) on delete cascade,
    event_id   bigint not null references events(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, event_id)
);

-- ---- 13. posts (community feed) --------------------------------------------
create table posts (
    id         bigint generated always as identity primary key,
    user_id    bigint not null references users(id) on delete cascade,
    caption    text not null,
    image_url  varchar(500),
    state      varchar(50),
    district   varchar(50),
    event_id   bigint references events(id) on delete set null,
    likes      int not null default 0,
    created_at timestamptz not null default now()
);

-- ---- Indexes for search / filtering ----------------------------------------
create index idx_events_state     on events(state);
create index idx_events_district  on events(district);
create index idx_events_status    on events(status);
create index idx_events_category  on events(category_id);
create index idx_events_dates     on events(start_date, end_date);
create index idx_ads_status       on advertisements(status);
create index idx_fish_available   on fish_catches(is_available);
create index idx_audit_user       on audit_logs(user_id);
create index idx_audit_action     on audit_logs(action);
create index idx_audit_created    on audit_logs(created_at);
create index idx_payments_user    on payments(user_id);
create index idx_posts_created     on posts(created_at desc);
create index idx_posts_event       on posts(event_id);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Event & news categories
insert into categories (name, kind) values
    ('Fishing Competition', 'event'),
    ('Coastal Market',      'event'),
    ('Community Gathering',  'event'),
    ('Seminar / Workshop',   'event'),
    ('Cultural Festival',    'event'),
    ('Announcement',         'news'),
    ('Fishery News',         'news');

-- Default admin account.
-- Password below is the bcrypt hash of:  Admin@123
-- CHANGE THIS after first login.
insert into users (name, email, password, role, status) values
    ('Platform Admin', 'admin@mylokalevent.my',
     '$2b$12$OhDb/u8Zqu4EA/h1hs7kL.NGUU50MnyybbvWgVhJzOnxJjJQilDTC', 'admin', 'active');

-- Sample fishing spots (kolam pancing) with plain Google Maps links.
insert into fishing_spots (name, description, state, district, maps_url) values
    ('Kolam Pancing Ah Choong',
     'Family-friendly freshwater fishing pond stocked with patin and tilapia. Shaded huts available.',
     'Perak', 'Tronoh',
     'https://www.google.com/maps/dir//Kolam+Pancing+Ah+Choong,+1,+Kampung+Merbau,+31750+Tronoh,+Perak/'),
    ('Kolam Pancing Air Tawar',
     'Quiet weekday spot popular with local anglers. Bait and drinks sold on-site.',
     'Terengganu', 'Kuala Terengganu',
     'https://www.google.com/maps/search/?api=1&query=kolam+pancing+kuala+terengganu'),
    ('Tasik Pancing Putrajaya',
     'Large lake with catch-and-release pegs. Good for beginners and families.',
     'Putrajaya', 'Putrajaya',
     'https://www.google.com/maps/search/?api=1&query=tasik+putrajaya+memancing');
