-- =============================================================================
-- Migration: community feed "posts" table
-- Run this in Supabase -> SQL Editor -> New query -> Run (once).
-- =============================================================================

create table if not exists posts (
    id         bigint generated always as identity primary key,
    user_id    bigint not null references users(id) on delete cascade,
    caption    text not null,
    image_url  varchar(500),
    state      varchar(50),                          -- location tag
    district   varchar(50),
    event_id   bigint references events(id) on delete set null,   -- "joining this event"
    likes      int not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_posts_created on posts(created_at desc);
create index if not exists idx_posts_user on posts(user_id);
create index if not exists idx_posts_event on posts(event_id);
