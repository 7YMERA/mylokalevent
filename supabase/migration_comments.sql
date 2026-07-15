-- =============================================================================
-- Migration: comments on community feed posts
-- Run this in Supabase -> SQL Editor -> New query -> Run (once).
-- =============================================================================

create table if not exists post_comments (
    id         bigint generated always as identity primary key,
    post_id    bigint not null references posts(id) on delete cascade,
    user_id    bigint not null references users(id) on delete cascade,
    body       text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_comments_post on post_comments(post_id, created_at);
