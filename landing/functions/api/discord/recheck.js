/* ============================================================
   Dream Legacy RP — Reverificar membresia del servidor de Discord
   Ruta: POST /api/discord/recheck
   Body JSON: { key: sessionToken }
   ------------------------------------------------------------
   Se usa desde dos sitios:
   1) La landing, cuando el usuario dice "ya me uni, comprueba otra vez".
   2) El Panel / DreamOS (panel.dreamlegacyrp.xyz), cada vez que alguien
      intenta entrar, para asegurarse de que sigue en el servidor de
      Discord (no solo confiar en el valor guardado en la ultima vez
      que inicio sesion). Por eso lleva cabeceras CORS: el Panel es
      un origen distinto a la landing.
   ============================================================ */
import { supabaseHeaders, getProfileByToken, jsonResponse, corsHeaders } from "../../_lib/discord.js";

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try { body = await request.json(); } catch (e) {
        return jsonResponse(request, { error: "Invalid request body." }, 400);
    }
    const token = body.key;
    if (!token) return jsonResponse(request, { error: "Missing session token." }, 401);

    try {
        const profile = await getProfileByToken(env, token);
        if (!profile) return jsonResponse(request, { error: "Session expired." }, 401);
        if (!profile.discord_id) return jsonResponse(request, { error: "No Discord account linked." }, 400);

        const guildId = env.DISCORD_GUILD_ID || "1508290225741234238";
        const memberRes = await fetch(
            "https://discord.com/api/v10/guilds/" + guildId + "/members/" + profile.discord_id,
            { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } }
        );
        const inGuild = memberRes.status === 200;

        // Si ya no esta en el servidor y tenia una solicitud aprobada,
        // le retiramos el acceso (vuelve a "pending"): no borramos su
        // historia/datos, pero ya no puede entrar al Panel hasta que
        // vuelva a unirse y un admin lo revise otra vez.
        const patchBody = { discord_in_guild: inGuild };
        if (!inGuild && profile.status === "approved") {
            patchBody.status = "pending";
        }

        const updateRes = await fetch(
            env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + profile.id,
            {
                method: "PATCH",
                headers: supabaseHeaders(env, { Prefer: "return=representation" }),
                body: JSON.stringify(patchBody)
            }
        );
        if (!updateRes.ok) throw new Error("Supabase update failed: " + (await updateRes.text()));
        const rows = await updateRes.json();
        const updated = rows[0];

        return jsonResponse(request, {
            discordInGuild: updated.discord_in_guild,
            status: updated.status,
            appliedAt: updated.applied_at,
            rpName: updated.rp_name,
            psn: updated.psn,
            story: updated.story,
            extraInfo: updated.extra_info,
            bank: updated.bank,
            cash: updated.cash,
            phoneOwned: updated.phone_owned,
            phoneNumber: updated.phone_number,
            phoneData: updated.phone_data,
            discordUsername: updated.discord_username,
            discordAvatar: updated.discord_avatar
        });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}