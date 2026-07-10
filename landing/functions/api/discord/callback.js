/* ============================================================
   Dream Legacy RP — Callback de Discord OAuth
   ------------------------------------------------------------
   Esto es una Cloudflare Pages Function (Worker), se ejecuta en
   el servidor de Cloudflare, NUNCA en el navegador. Por eso es el
   único sitio donde es seguro usar el Client Secret de Discord y
   la Service Role Key de Supabase — ninguna de las dos llega
   jamás al código que ve el navegador.

   Ruta: /api/discord/callback  (por la ubicación de este archivo:
   landing/functions/api/discord/callback.js)

   Variables de entorno necesarias (Cloudflare Pages -> Settings
   -> Environment variables -> Production, marcadas como Secret):
     DISCORD_CLIENT_ID
     DISCORD_CLIENT_SECRET
     DISCORD_REDIRECT_URI       (ej: https://dreamlegacyrp.xyz/api/discord/callback)
     DISCORD_GUILD_ID           (1508290225741234238)
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY  (la clave "service_role", NO la anon)
     SITE_URL                   (ej: https://dreamlegacyrp.xyz)
   ============================================================ */

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const errorParam = url.searchParams.get("error");
    const siteUrl = env.SITE_URL || "https://dreamlegacyrp.xyz";

    if (errorParam) {
        return Response.redirect(siteUrl + "/?discord_error=" + encodeURIComponent(errorParam), 302);
    }
    if (!code) {
        return Response.redirect(siteUrl + "/?discord_error=missing_code", 302);
    }

    try {
        // 1) Intercambia el "code" por un access_token de Discord
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: env.DISCORD_CLIENT_ID,
                client_secret: env.DISCORD_CLIENT_SECRET,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: env.DISCORD_REDIRECT_URI
            })
        });
        if (!tokenRes.ok) throw new Error("Discord token exchange failed: " + (await tokenRes.text()));
        const tokenData = await tokenRes.json();

        // 2) Datos del usuario (scope "identify")
        const userRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: "Bearer " + tokenData.access_token }
        });
        if (!userRes.ok) throw new Error("Discord user fetch failed: " + (await userRes.text()));
        const discordUser = await userRes.json();

        // 3) Servidores del usuario (scope "guilds"), para comprobar si
        //    está en el servidor de Dream Legacy RP
        let inGuild = false;
        const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: "Bearer " + tokenData.access_token }
        });
        if (guildsRes.ok) {
            const guilds = await guildsRes.json();
            const targetGuildId = env.DISCORD_GUILD_ID || "1508290225741234238";
            inGuild = Array.isArray(guilds) && guilds.some((g) => g.id === targetGuildId);
        }

        const avatarUrl = discordUser.avatar
            ? "https://cdn.discordapp.com/avatars/" + discordUser.id + "/" + discordUser.avatar + ".png?size=128"
            : "https://cdn.discordapp.com/embed/avatars/" + ((BigInt(discordUser.id) >> 22n) % 6n) + ".png";

        const displayName = discordUser.global_name || discordUser.username;

        // 4) Crea/actualiza el perfil en Supabase usando la Service Role
        //    (bypassa RLS; por eso esta clave SOLO puede vivir aquí, en
        //    una Function server-side, nunca en el frontend).
        const sbHeaders = {
            "Content-Type": "application/json",
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
            Prefer: "resolution=merge-duplicates,return=representation"
        };

        const upsertRes = await fetch(env.SUPABASE_URL + "/rest/v1/profiles?on_conflict=discord_id", {
            method: "POST",
            headers: sbHeaders,
            body: JSON.stringify([{
                discord_id: discordUser.id,
                discord_username: displayName,
                discord_avatar: avatarUrl,
                discord_in_guild: inGuild
            }])
        });
        if (!upsertRes.ok) throw new Error("Supabase upsert failed: " + (await upsertRes.text()));
        const rows = await upsertRes.json();
        const profileId = rows[0].id;

        // 5) Crea una sesion (misma tabla `sessions` que ya usa el resto del sitio)
        const sessionRes = await fetch(env.SUPABASE_URL + "/rest/v1/sessions", {
            method: "POST",
            headers: { ...sbHeaders, Prefer: "return=representation" },
            body: JSON.stringify([{ profile_id: profileId }])
        });
        if (!sessionRes.ok) throw new Error("Supabase session creation failed: " + (await sessionRes.text()));
        const sessionRows = await sessionRes.json();
        const token = sessionRows[0].token;

        // 6) Vuelve al sitio con el token en la URL; app.js lo recoge y
        //    lo mueve a localStorage inmediatamente, luego limpia la URL.
        return Response.redirect(siteUrl + "/?dlrp_session=" + encodeURIComponent(token), 302);
    } catch (err) {
        return Response.redirect(siteUrl + "/?discord_error=" + encodeURIComponent(err.message), 302);
    }
}