-- ============================================
-- PANEL PR · Supabase Schema
-- Rulează în Supabase → SQL Editor
-- ============================================

-- Tabelul whitelist (cine are voie să se logheze)
create table if not exists whitelist (
  id          uuid default gen_random_uuid() primary key,
  discord_id  text unique not null,
  full_name   text not null,
  rank        text not null,
  is_admin    boolean default false,
  added_by    text,
  created_at  timestamptz default now()
);

-- Tabelul members (userul creat după primul login)
create table if not exists members (
  id             uuid default gen_random_uuid() primary key,
  discord_id     text unique not null,
  discord_tag    text,
  discord_avatar text,
  full_name      text not null,
  rank           text not null,
  status         text default 'activ',
  is_admin       boolean default false,
  activities     int default 0,
  notes          text default '',
  callsign       text default '',
  employee_id    text default '',
  join_date      timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Tabelul logs
create table if not exists logs (
  id          uuid default gen_random_uuid() primary key,
  action      text not null,
  message     text not null,
  discord_id  text,
  created_at  timestamptz default now()
);

-- Tabelul events
create table if not exists events (
  id          uuid default gen_random_uuid() primary key,
  title       text not null,
  description text default '',
  date        timestamptz not null,
  created_by  text,
  created_at  timestamptz default now()
);

-- Tabelul announcements
create table if not exists announcements (
  id          uuid default gen_random_uuid() primary key,
  title       text not null,
  body        text not null,
  author      text not null,
  author_rank text not null,
  created_at  timestamptz default now()
);

-- Tabelul system_updates
create table if not exists system_updates (
  id         uuid default gen_random_uuid() primary key,
  title      text not null,
  body       text not null,
  author     text not null,
  created_at timestamptz default now()
);

-- ============================================
-- RLS (Row Level Security)
-- ============================================
alter table whitelist      enable row level security;
alter table members        enable row level security;
alter table logs           enable row level security;
alter table events         enable row level security;
alter table announcements  enable row level security;
alter table system_updates enable row level security;

-- Service role bypass (API-ul folosește service role)
-- Nu e nevoie de policies suplimentare pentru service role

-- ============================================
-- ADAUGĂ-TE PE TINE CA PRIM ADMIN
-- Înlocuiește valorile de mai jos
-- ============================================
insert into whitelist (discord_id, full_name, rank, is_admin)
values (
  'DISCORD_ID_TÂU',        -- ex: '123456789012345678'
  'Numele Tău',
  'Gradul Tău',
  true
);


-- ============================================
-- EVENTS SYSTEM
-- ============================================

-- Rescrie tabelul events complet
drop table if exists events cascade;

create table events (
  id              uuid default gen_random_uuid() primary key,
  date            date not null,
  time            text not null,
  type            text not null,
  organizer_name  text not null,
  location        text not null,
  phone           text not null,
  assistance_type text not null,  -- 'medical_1' | 'medical_2'
  responsible_callsign text,
  responsible_name     text,
  responsible_rank     text,
  image_url       text,
  event_status    text default 'in_asteptare',  -- 'in_asteptare' | 'finalizat'
  event_status_set_by  text,
  event_status_set_at  timestamptz,
  financial_status     text default 'neincasat', -- 'neincasat' | 'incasat'
  financial_status_set_by text,
  financial_status_set_at timestamptz,
  created_by      text,
  created_at      timestamptz default now()
);

-- Reactii la evenimente (prezenta membri)
create table event_reactions (
  id          uuid default gen_random_uuid() primary key,
  event_id    uuid references events(id) on delete cascade,
  discord_id  text not null,
  full_name   text not null,
  callsign    text,
  rank        text,
  reaction    text not null,  -- 'bifa' | 'thumbs' | 'x' | 'plaja'
  created_at  timestamptz default now(),
  unique(event_id, discord_id, reaction)
);

-- Evenimente oferite unui membru
create table member_events (
  id          uuid default gen_random_uuid() primary key,
  event_id    uuid references events(id) on delete cascade,
  member_id   uuid references members(id) on delete cascade,
  member_name text,
  event_date  date,
  offered_by  text,
  created_at  timestamptz default now()
);

alter table events          enable row level security;
alter table event_reactions enable row level security;
alter table member_events   enable row level security;

-- Policies read pentru toti
create policy "read events"    on events          for select using (true);
create policy "read reactions" on event_reactions for select using (true);
create policy "read member_events" on member_events for select using (true);
