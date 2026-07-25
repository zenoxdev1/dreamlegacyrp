-- ============================================================
-- MIGRACIÓN: fotos de Snapmatic (GTA V) sincronizadas desde el
-- servidor del juego, para la Galería y DreamGram.
-- ============================================================

create table if not exists public.game_photos (
    id            uuid primary key default gen_random_uuid(),
    xuid          text not null,
    gamertag      text,
    content_id    text,
    image_data    text not null,
    created_at    timestamptz not null default now()
);

create index if not exists idx_game_photos_gamertag on public.game_photos(gamertag, created_at desc);
alter table public.game_photos enable row level security;

-- Solo el backend (Service Role Key) puede leer/escribir esta tabla.