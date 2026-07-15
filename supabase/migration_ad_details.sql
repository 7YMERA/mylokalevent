-- =============================================================================
-- Migration: extra advertisement campaign detail fields
-- Run this in Supabase -> SQL Editor -> New query -> Run (once).
-- =============================================================================

alter table advertisements add column if not exists description   text;
alter table advertisements add column if not exists contact_email varchar(150);
alter table advertisements add column if not exists contact_phone varchar(30);
