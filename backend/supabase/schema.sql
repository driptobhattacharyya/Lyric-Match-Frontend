-- Lyric Match: Supabase schema. Idempotent: safe to run again in the SQL editor.
--
-- Only the backend touches these tables, with the service-role key (which
-- bypasses RLS). RLS is enabled with NO policies, so the anon/authenticated
-- roles (and therefore the public Supabase API keys) can read or write nothing.

create extension if not exists pgcrypto;

-- Persistent snippet cache: generated lyric snippets per catalogue song.
create table if not exists public.snippets (
    id          bigint generated always as identity primary key,
    song_key    text not null check (char_length(song_key) between 3 and 300),  -- "title|artist"
    title       text not null,
    artist      text not null,
    language    text not null check (language in ('en', 'hi')),
    pack_id     text,
    lyrics      text not null check (char_length(lyrics) between 1 and 500),
    lyrics_hash text generated always as (md5(lyrics)) stored,
    provider    text not null default 'unknown',
    created_at  timestamptz not null default now(),
    constraint snippets_song_lyrics_unique unique (song_key, lyrics_hash)
);

create index if not exists snippets_song_key_created_idx
    on public.snippets (song_key, created_at desc);

-- Leaderboard. One row per submitted game; the fingerprint (sha256 of the
-- mode and sorted round ids) makes resubmitting the same game a conflict.
create table if not exists public.scores (
    id          uuid primary key default gen_random_uuid(),
    name        text not null check (char_length(name) between 1 and 20),
    mode        text not null check (mode in ('type', 'choice')),
    score       integer not null check (score >= 0),
    correct     integer not null check (correct >= 0),
    rounds      integer not null check (rounds between 1 and 50),
    fingerprint text not null,
    created_at  timestamptz not null default now(),
    constraint scores_fingerprint_unique unique (fingerprint),
    constraint scores_correct_le_rounds check (correct <= rounds)
);

create index if not exists scores_mode_score_idx
    on public.scores (mode, score desc, created_at asc);
create index if not exists scores_mode_created_idx
    on public.scores (mode, created_at desc);

alter table public.snippets enable row level security;
alter table public.scores enable row level security;

-- Competition rank ("1, 2, 2, 4") of a score within a mode, all time:
-- 1 + number of strictly higher scores. Called as POST /rest/v1/rpc/score_rank.
create or replace function public.score_rank(p_mode text, p_score integer)
returns bigint
language sql
stable
set search_path = public
as $$
    select 1 + count(*) from public.scores where mode = p_mode and score > p_score;
$$;

revoke all on function public.score_rank(text, integer) from public, anon, authenticated;
grant execute on function public.score_rank(text, integer) to service_role;
