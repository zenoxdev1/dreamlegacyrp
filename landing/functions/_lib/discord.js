/* ============================================================
   Dream Legacy RP — Utilidades compartidas para las Functions
   ------------------------------------------------------------
   Todo lo de aqui corre en el servidor de Cloudflare, nunca en
   el navegador. Aqui es seguro usar el Bot Token de Discord y la
   Service Role Key de Supabase.
   ============================================================ */

const DLRP_LOGO_URL = "https://files.dreamlegacyrp.xyz/branding/dlrp-logo.png";

/** Colores estandar para los embeds, por tipo de mensaje. */
export const DLRP_COLORS = {
    info: 0x2f73ff,
    success: 0x34d399,
    warning: 0xffd166,
    danger: 0xff4f64
};

/** Construye un embed de Discord con la misma pinta en todos los DMs:
 *  icono de DLRP, color segun el tipo de mensaje, y pie de pagina
 *  consistente. `fields` es opcional (array de {name, value, inline}). */
export function dlrpEmbed({ title, description, color, fields, footer }) {
    return {
        embeds: [{
            author: { name: "Dream Legacy RP", icon_url: DLRP_LOGO_URL },
            title,
            description,
            color: color || DLRP_COLORS.info,
            fields: fields || undefined,
            footer: { text: footer || "dreamlegacyrp.xyz" },
            timestamp: new Date().toISOString()
        }]
    };
}

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

        // `content` puede ser un string normal (texto plano, como antes)
        // o un objeto ya listo para mandar tal cual a la API de Discord
        // (por ejemplo { embeds: [...] }) para mensajes con formato.
        const payload = typeof content === "string" ? { content } : content;

        const msgRes = await fetch("https://discord.com/api/v10/channels/" + dmChannel.id + "/messages", {
            method: "POST",
            headers: {
                Authorization: "Bot " + env.DISCORD_BOT_TOKEN,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
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
    "https://dreamos.dreamlegacyrp.xyz",
    "https://hq.dreamlegacyrp.xyz",
    "https://admin.dreamlegacyrp.xyz",
    "https://downloads.dreamlegacyrp.xyz",
    "https://links.dreamlegacyrp.xyz",
    "https://donate.dreamlegacyrp.xyz",
    "https://ps3.dreamlegacyrp.xyz"
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
/** Textos de los DMs en los 3 idiomas del sitio. `lang` es el
 *  preferred_language guardado en el perfil (por defecto 'en'
 *  si nunca ha cambiado el idioma en la web). */
export const DM_TEXT = {
    en: {
        receivedTitle: "\u{1F4E8} Application Received",
        receivedDesc: function (rpName) { return "We've received your whitelist application, **" + rpName + "**.\n\nWe'll DM you here as soon as it's reviewed. Thanks for applying!"; },
        receivedFooter: "Status: Pending review",
        approvedTitle: "\u2705 Application Approved!",
        approvedDesc: "Congratulations, your whitelist application has been **approved**!\n\nYou can now log in to access the Panel and DreamOS.",
        approvedNextStep: "Next step",
        approvedLink: "[Log in at dreamos.dreamlegacyrp.xyz](https://dreamos.dreamlegacyrp.xyz)",
        approvedFooter: "Welcome to Dream Legacy RP!",
        deniedTitle: "\u274C Application Not Approved",
        deniedDesc: "Your whitelist application was **not approved** this time.\n\nYou're welcome to reach out on our Discord server if you have questions or want to re-apply.",
        deniedReason: "Reason",
        deniedFooter: "Status: Denied",
        holdTitle: "\u26A0\uFE0F Access On Hold",
        holdDesc: "Your Panel access was put back on hold because you're no longer a member of our Discord server.\n\nRejoin the server and your access will be reviewed again.",
        holdFooter: "Status: On hold",
        revokedTitle: "\u{1F6AB} Access Revoked",
        revokedDesc: "Your access has been **revoked**.\n\nContact staff on Discord if you believe this is a mistake.",
        revokedReason: "Reason",
        revokedFooter: "Status: Banned",
        restoredTitle: "\u2705 Access Restored",
        restoredDesc: "Your access has been **restored**. Welcome back!",
        restoredFooter: "Status: Active"
    },
    fr: {
        receivedTitle: "\u{1F4E8} Candidature re\u00e7ue",
        receivedDesc: function (rpName) { return "Nous avons bien re\u00e7u votre candidature de whitelist, **" + rpName + "**.\n\nNous vous enverrons un message d\u00e8s qu'elle sera examin\u00e9e. Merci de votre candidature !"; },
        receivedFooter: "Statut : En attente",
        approvedTitle: "\u2705 Candidature approuv\u00e9e !",
        approvedDesc: "F\u00e9licitations, votre candidature de whitelist a \u00e9t\u00e9 **approuv\u00e9e** !\n\nVous pouvez maintenant vous connecter pour acc\u00e9der au Panel et \u00e0 DreamOS.",
        approvedNextStep: "Prochaine \u00e9tape",
        approvedLink: "[Connectez-vous sur dreamos.dreamlegacyrp.xyz](https://dreamos.dreamlegacyrp.xyz)",
        approvedFooter: "Bienvenue sur Dream Legacy RP !",
        deniedTitle: "\u274C Candidature non approuv\u00e9e",
        deniedDesc: "Votre candidature de whitelist n'a **pas \u00e9t\u00e9 approuv\u00e9e** cette fois.\n\nN'h\u00e9sitez pas \u00e0 nous contacter sur notre serveur Discord si vous avez des questions ou souhaitez postuler \u00e0 nouveau.",
        deniedReason: "Raison",
        deniedFooter: "Statut : Refus\u00e9e",
        holdTitle: "\u26A0\uFE0F Acc\u00e8s suspendu",
        holdDesc: "Votre acc\u00e8s au Panel a \u00e9t\u00e9 suspendu car vous n'\u00eates plus membre de notre serveur Discord.\n\nRejoignez le serveur et votre acc\u00e8s sera r\u00e9examin\u00e9.",
        holdFooter: "Statut : Suspendu",
        revokedTitle: "\u{1F6AB} Acc\u00e8s r\u00e9voqu\u00e9",
        revokedDesc: "Votre acc\u00e8s a \u00e9t\u00e9 **r\u00e9voqu\u00e9**.\n\nContactez le staff sur Discord si vous pensez qu'il s'agit d'une erreur.",
        revokedReason: "Raison",
        revokedFooter: "Statut : Banni",
        restoredTitle: "\u2705 Acc\u00e8s restaur\u00e9",
        restoredDesc: "Votre acc\u00e8s a \u00e9t\u00e9 **restaur\u00e9**. Bon retour !",
        restoredFooter: "Statut : Actif"
    },
    pt: {
        receivedTitle: "\u{1F4E8} Inscri\u00e7\u00e3o recebida",
        receivedDesc: function (rpName) { return "Recebemos sua inscri\u00e7\u00e3o de whitelist, **" + rpName + "**.\n\nEnviaremos uma mensagem assim que ela for revisada. Obrigado por se inscrever!"; },
        receivedFooter: "Status: Em an\u00e1lise",
        approvedTitle: "\u2705 Inscri\u00e7\u00e3o aprovada!",
        approvedDesc: "Parab\u00e9ns, sua inscri\u00e7\u00e3o de whitelist foi **aprovada**!\n\nAgora voc\u00ea pode fazer login para acessar o Painel e o DreamOS.",
        approvedNextStep: "Pr\u00f3ximo passo",
        approvedLink: "[Fa\u00e7a login em dreamos.dreamlegacyrp.xyz](https://dreamos.dreamlegacyrp.xyz)",
        approvedFooter: "Bem-vindo ao Dream Legacy RP!",
        deniedTitle: "\u274C Inscri\u00e7\u00e3o n\u00e3o aprovada",
        deniedDesc: "Sua inscri\u00e7\u00e3o de whitelist n\u00e3o foi **aprovada** desta vez.\n\nVoc\u00ea pode entrar em contato pelo nosso servidor do Discord se tiver d\u00favidas ou quiser se inscrever novamente.",
        deniedReason: "Motivo",
        deniedFooter: "Status: Negada",
        holdTitle: "\u26A0\uFE0F Acesso em espera",
        holdDesc: "Seu acesso ao Painel foi colocado em espera porque voc\u00ea n\u00e3o \u00e9 mais membro do nosso servidor do Discord.\n\nEntre novamente no servidor e seu acesso ser\u00e1 revisado.",
        holdFooter: "Status: Em espera",
        revokedTitle: "\u{1F6AB} Acesso revogado",
        revokedDesc: "Seu acesso foi **revogado**.\n\nEntre em contato com a equipe no Discord se achar que isso \u00e9 um erro.",
        revokedReason: "Motivo",
        revokedFooter: "Status: Banido",
        restoredTitle: "\u2705 Acesso restaurado",
        restoredDesc: "Seu acesso foi **restaurado**. Bem-vindo de volta!",
        restoredFooter: "Status: Ativo"
    }
};

export function dmText(lang) {
    return DM_TEXT[lang] || DM_TEXT.en;
}