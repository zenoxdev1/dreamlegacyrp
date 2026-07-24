-- ============================================================
-- MIGRACIÓN: DreamGram real (posts, likes y DMs en el servidor,
-- no en el navegador local de cada uno)
-- ============================================================

create table if not exists public.dreamgram_posts (
    id            uuid primary key default gen_random_uuid(),
    profile_id    uuid not null references public.profiles(id) on delete cascade,
    rp_name       text not null,
    display_name  text,
    body          text,
    image_data    text,
    created_at    timestamptz not null default now()
);

create index if not exists idx_dreamgram_posts_created on public.dreamgram_posts(created_at desc);
alter table public.dreamgram_posts enable row level security;

create table if not exists public.dreamgram_post_likes (
    post_id       uuid not null references public.dreamgram_posts(id) on delete cascade,
    profile_id    uuid not null references public.profiles(id) on delete cascade,
    rp_name       text not null,
    created_at    timestamptz not null default now(),
    primary key (post_id, profile_id)
);

alter table public.dreamgram_post_likes enable row level security;

create table if not exists public.dreamgram_dms (
    id            uuid primary key default gen_random_uuid(),
    from_rp_name  text not null,
    to_rp_name    text not null,
    body          text not null,
    created_at    timestamptz not null default now(),
    read_at       timestamptz
);

create index if not exists idx_dreamgram_dms_participants on public.dreamgram_dms(from_rp_name, to_rp_name, created_at desc);
alter table public.dreamgram_dms enable row level security;

-- ---------- RPC: DREAMGRAM ----------

create or replace function public.dlrp_gram_create_post(p_token uuid, p_body text, p_image_data text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if (p_body is null or length(trim(p_body)) = 0) and (p_image_data is null or length(p_image_data) = 0) then
        raise exception 'Add text or a photo.';
    end if;

    insert into public.dreamgram_posts (profile_id, rp_name, display_name, body, image_data)
    values (v_profile.id, v_profile.rp_name, coalesce(v_profile.phone_data->>'displayName', v_profile.rp_name), p_body, p_image_data);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_gram_list_feed(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" desc), '[]'::jsonb)
        from (
            select
                p.id, p.rp_name as "authorRpName", p.display_name as "displayName",
                p.body, p.image_data as "imageData", p.created_at as "createdAt",
                case
                    when pr.phone_data->>'pfp' like 'data:%' then pr.phone_data->>'pfp'
                    else pr.discord_avatar
                end as "authorAvatar",
                (p.profile_id = v_profile.id) as "isOwn",
                (select count(*) from public.dreamgram_post_likes l where l.post_id = p.id) as "likeCount",
                exists(select 1 from public.dreamgram_post_likes l2 where l2.post_id = p.id and l2.profile_id = v_profile.id) as "likedByMe"
            from public.dreamgram_posts p
            join public.profiles pr on pr.id = p.profile_id
            order by p.created_at desc
            limit 60
        ) t
    );
end;
$$;

create or replace function public.dlrp_gram_toggle_like(p_token uuid, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    if exists (select 1 from public.dreamgram_post_likes where post_id = p_post_id and profile_id = v_profile.id) then
        delete from public.dreamgram_post_likes where post_id = p_post_id and profile_id = v_profile.id;
    else
        insert into public.dreamgram_post_likes (post_id, profile_id, rp_name) values (p_post_id, v_profile.id, v_profile.rp_name);
    end if;

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_gram_delete_post(p_token uuid, p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    delete from public.dreamgram_posts where id = p_post_id and profile_id = v_profile.id;
    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_gram_send_dm(p_token uuid, p_to_rp_name text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;
    if p_body is null or length(trim(p_body)) = 0 then raise exception 'Message is empty.'; end if;
    if not exists (select 1 from public.profiles where rp_name = p_to_rp_name) then
        raise exception 'User "%" not found.', p_to_rp_name;
    end if;

    insert into public.dreamgram_dms (from_rp_name, to_rp_name, body)
    values (v_profile.rp_name, p_to_rp_name, p_body);

    return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.dlrp_gram_get_dm_thread(p_token uuid, p_other_rp_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.profiles;
begin
    v_profile := public._dlrp_profile_from_token(p_token);
    if v_profile.id is null then raise exception 'Session expired.'; end if;

    update public.dreamgram_dms set read_at = now()
    where to_rp_name = v_profile.rp_name and from_rp_name = p_other_rp_name and read_at is null;

    return (
        select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt" asc), '[]'::jsonb)
        from (
            select id, from_rp_name as "fromRpName", to_rp_name as "toRpName", body, created_at as "createdAt"
            from public.dreamgram_dms
            where (from_rp_name = v_profile.rp_name and to_rp_name = p_other_rp_name)
               or (from_rp_name = p_other_rp_name and to_rp_name = v_profile.rp_name)
            order by created_at asc
            limit 200
        ) t
    );
end;
$$;

grant execute on function
    public.dlrp_gram_create_post(uuid,text,text),
    public.dlrp_gram_list_feed(uuid),
    public.dlrp_gram_toggle_like(uuid,uuid),
    public.dlrp_gram_delete_post(uuid,uuid),
    public.dlrp_gram_send_dm(uuid,text,text),
    public.dlrp_gram_get_dm_thread(uuid,text)
to anon, authenticated;