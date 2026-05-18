-- Add missing columns to issues_ci so the app's category/description/raised/rag fields persist.
-- Safe to run on an existing database without losing data.

alter table public.issues_ci add column if not exists category    text default 'Other';
alter table public.issues_ci add column if not exists description text default '';
alter table public.issues_ci add column if not exists raised      date;
alter table public.issues_ci add column if not exists rag         text default 'Amber';
