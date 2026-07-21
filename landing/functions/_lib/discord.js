/* ============================================================
   Dream Legacy RP — Utilidades compartidas para las Functions
   ------------------------------------------------------------
   Todo lo de aqui corre en el servidor de Cloudflare, nunca en
   el navegador. Aqui es seguro usar el Bot Token de Discord y la
   Service Role Key de Supabase.
   ============================================================ */

/** Envia un mensaje directo (DM) a un usuario de Discord usando el bot.
 *  Requiere que el bot comparta al menos un servidor con ese usuario
 *  (por eso el bot debe estar añadido al servidor de Dream Legacy RP)
 *  y que el usuario permita DMs de miembros del servidor. */
export async function sendDiscordDM(env, discordUserId, content) {
    if (!env.DISCORD_BOT_TOKEN) {
        console.error("DISCORD_BOT_TOKEN no configurado; no se puede enviar DM.");
        return { ok: false, reason: "missing_bot_token" };
    }
    try {
        const dmChannelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
            method: "POST",
            headers: {
                Authorization: "Bot " + env.DISCORD_BOT_TOKEN,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ recipient_id: discordUserId })
        });
        if (!dmChannelRes.ok) {
            const errText = await dmChannelRes.text();
            console.error("No se pudo abrir el canal de DM:", errText);
            return { ok: false, reason: "dm_channel_failed", detail: errText };
        }
        const dmChannel = await dmChannelRes.json();

        const msgRes = await fetch("https://discord.com/api/v10/channels/" + dmChannel.id + "/messages", {
            method: "POST",
            headers: {
                Authorization: "Bot " + env.DISCORD_BOT_TOKEN,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ content })
        });
        if (!msgRes.ok) {
            const errText = await msgRes.text();
            console.error("No se pudo enviar el DM:", errText);
            return { ok: false, reason: "send_failed", detail: errText };
        }
        return { ok: true };
    } catch (err) {
        console.error("sendDiscordDM error:", err.message);
        return { ok: false, reason: "exception", detail: err.message };
    }
}

/** Publica un mensaje en un canal de Discord usando el bot (para
 *  avisar a los admins de una solicitud nueva). Requiere que el bot
 *  tenga permiso de "Send Messages" en ese canal. */
export async function sendDiscordChannelMessage(env, channelId, content) {
    if (!env.DISCORD_BOT_TOKEN || !channelId) return { ok: false, reason: "missing_config" };
    try {
        const res = await fetch("https://discord.com/api/v10/channels/" + channelId + "/messages", {
            method: "POST",
            headers: {
                Authorization: "Bot " + env.DISCORD_BOT_TOKEN,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(content)
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error("No se pudo publicar en el canal:", errText);
            return { ok: false, reason: "send_failed", detail: errText };
        }
        return { ok: true };
    } catch (err) {
        console.error("sendDiscordChannelMessage error:", err.message);
        return { ok: false, reason: "exception", detail: err.message };
    }
}

/** Cabeceras estandar para hablar con la API REST de Supabase usando
 *  la Service Role Key (bypassa RLS; solo usar server-side). */
/** Consulta los roles ACTUALES de una persona en el servidor de Discord
 *  (en vivo, no algo guardado -- asi un ascenso/descenso/despido en
 *  Discord se refleja al instante en HQ, sin depender de que nadie
 *  sincronice nada a mano). */
export async function getDiscordMemberRoles(env, discordUserId) {
    const res = await fetch(
        "https://discord.com/api/v10/guilds/" + env.DISCORD_GUILD_ID + "/members/" + discordUserId,
        { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } }
    );
    if (res.status === 404) return []; // ya no esta en el servidor
    if (!res.ok) throw new Error("Discord member lookup failed: " + (await res.text()));
    const member = await res.json();
    return member.roles || [];
}

export function supabaseHeaders(env, extra) {
    return Object.assign({
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY
    }, extra || {});
}

/** Busca el perfil asociado a un token de sesion (valido y no caducado). */
export async function getProfileByToken(env, token) {
    const url = env.SUPABASE_URL + "/rest/v1/sessions" +
        "?token=eq." + encodeURIComponent(token) +
        "&select=profile_id,expires_at,profiles(*)";
    const res = await fetch(url, { headers: supabaseHeaders(env) });
    if (!res.ok) throw new Error("Supabase session lookup failed: " + (await res.text()));
    const rows = await res.json();
    if (!rows.length) return null;
    const row = rows[0];
    if (new Date(row.expires_at) < new Date()) return null;
    return row.profiles;
}

/** Cabeceras CORS: el Panel (panel.dreamlegacyrp.xyz) es un origen
 *  distinto a la landing (dreamlegacyrp.xyz) y necesita poder llamar
 *  a algunas de estas Functions (p.ej. para revalidar la membresia
 *  del servidor de Discord al entrar a DreamOS). */
const ALLOWED_ORIGINS = [
    "https://dreamlegacyrp.xyz",
    "https://www.dreamlegacyrp.xyz",
    "https://panel.dreamlegacyrp.xyz",
    "https://hq.dreamlegacyrp.xyz",
    "https://admin.dreamlegacyrp.xyz"
];

export function corsHeaders(request) {
    const origin = request.headers.get("Origin");
    const allowOrigin = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin"
    };
}

export function jsonResponse(request, data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(request))
    });
}