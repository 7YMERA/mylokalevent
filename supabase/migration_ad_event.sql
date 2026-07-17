-- =============================================================================
-- Migration: link an advertisement to the event it promotes
-- Run this in Supabase -> SQL Editor -> New query -> Run (once).
-- Clicking an ad redirects to this event's page (Roblox-style: ad -> the thing).
-- =============================================================================

alter table advertisements
    add column if not exists event_id bigint references events(id) on delete set null;
