/* ============================================================
   Dream Legacy RP — Reverificar membresia del servidor de Discord
   Ruta: POST /api/discord/recheck
   Body JSON: { key: sessionToken }
   ------------------------------------------------------------
   Se usa cuando el usuario dice "ya me uni, comprueba otra vez"
   en la pantalla de "debes unirte al servidor". Usa el Bot Token
   (no hace falta que el usuario vuelva a pasar por el OAuth).
   ============================================================ */
import { supabaseHeaders, getProfileByToken } from "../../_lib/discord.js";

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try { body = await request.json(); } catch (e) {
        return json({ error: "Invalid request body." }, 400);
    }
    const token = body.key;
    if (!token) return json({ error: "Missing session token." }, 401);

    try {
        const profile = await getProfileByToken(env, token);
        if (!profile) return json({ error: "Session expired." }, 401);
        if (!profile.discord_id) return json({ error: "No Discord account linked." }, 400);

        const guildId = env.DISCORD_GUILD_ID || "1508290225741234238";
        const memberRes = await fetch(
            "https://discord.com/api/v10/guilds/" + guildId + "/members/" + profile.discord_id,
            { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } }
        );
        const inGuild = memberRes.status === 200;

        const updateRes = await fetch(
            env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + profile.id,
            {
                method: "PATCH",
                headers: supabaseHeaders(env, { Prefer: "return=representation" }),
                body: JSON.stringify({ discord_in_guild: inGuild })
            }
        );
        if (!updateRes.ok) throw new Error("Supabase update failed: " + (await updateRes.text()));
        const rows = await updateRes.json();
        const updated = rows[0];

        return json({
            discordInGuild: updated.discord_in_guild,
            status: updated.status,
            appliedAt: updated.applied_at,
            rpName: updated.rp_name,
            psn: updated.psn,
            story: updated.story,
            extraInfo: updated.extra_info
        });
    } catch (err) {
        return json({ error: err.message }, 500);
    }
}

function json(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: { "Content-Type": "application/json" }
    });
}