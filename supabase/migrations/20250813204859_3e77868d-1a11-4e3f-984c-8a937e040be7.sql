-- Create extensions
create extension if not exists pgcrypto;   -- for gen_random_uuid()
create extension if not exists vector;     -- for pgvector

-- updated_at trigger for items
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Users are handled by Supabase auth.users
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now(),
  display_name text
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  title text,
  category text,            -- e.g. top, bottom, dress, outerwear, shoes, bag, accessory
  subcategory text,         -- e.g. t-shirt, jeans, hoodie, sneakers
  color_hex text,           -- dominant color in hex
  color_name text,          -- human name like "navy"
  image_path text not null, -- Supabase storage path
  mask_path text,           -- optional: binary mask png
  notes text
);

-- Embeddings table; use vector dimension 512
create table if not exists item_embeddings (
  item_id uuid primary key references items(id) on delete cascade,
  embedding vector(512)
);

-- Speed up similarity search
create index if not exists item_embeddings_cosine on item_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Inspiration queries & results logging
create table if not exists inspiration_queries (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  image_path text not null,
  status text default 'queued',  -- queued | processing | done | error
  error text
);

create table if not exists inspiration_detections (
  id uuid primary key default gen_random_uuid(),
  query_id uuid references inspiration_queries(id) on delete cascade,
  bbox float8[] not null,           -- [x1,y1,x2,y2]
  category text,                     -- detected label
  mask_path text,                    -- optional mask
  crop_path text,                    -- saved crop path
  embedding vector(512)
);

-- Create updated_at trigger for items
drop trigger if exists trg_items_updated_at on items;
create trigger trg_items_updated_at before update on items
for each row execute procedure set_updated_at();

-- Create private storage bucket for Sila
insert into storage.buckets (id, name, public) 
values ('sila', 'sila', false)
on conflict (id) do nothing;

-- Storage policies for private bucket
create policy "Users can upload their own files"
on storage.objects for insert
with check (bucket_id = 'sila' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view their own files"
on storage.objects for select
using (bucket_id = 'sila' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can update their own files"
on storage.objects for update
using (bucket_id = 'sila' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own files"
on storage.objects for delete
using (bucket_id = 'sila' and auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies
alter table items enable row level security;
alter table item_embeddings enable row level security;
alter table inspiration_queries enable row level security;
alter table inspiration_detections enable row level security;
alter table profiles enable row level security;

-- Items policies
create policy "items owner can read" on items for select using (auth.uid() = owner);
create policy "items owner can write" on items for all using (auth.uid() = owner);

-- Embeddings policies
create policy "emb owner read" on item_embeddings for select using (exists(select 1 from items i where i.id = item_id and i.owner = auth.uid()));
create policy "emb owner write" on item_embeddings for all using (exists(select 1 from items i where i.id = item_id and i.owner = auth.uid()));

-- Inspiration queries policies
create policy "inq owner read" on inspiration_queries for select using (owner = auth.uid());
create policy "inq owner write" on inspiration_queries for all using (owner = auth.uid());

-- Inspiration detections policies
create policy "idet owner read" on inspiration_detections for select using (exists(select 1 from inspiration_queries q where q.id = query_id and q.owner = auth.uid()));
create policy "idet owner write" on inspiration_detections for all using (exists(select 1 from inspiration_queries q where q.id = query_id and q.owner = auth.uid()));

-- Profiles policies
create policy "profiles owner read" on profiles for select using (auth.uid() = user_id);
create policy "profiles owner write" on profiles for all using (auth.uid() = user_id);