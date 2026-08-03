/* ============================================================
   Dream Legacy RP — Notificar por Discord cuando cambia el
   estado de una solicitud (pending -> approved / denied).
   ------------------------------------------------------------
   Esto NO lo llama el frontend. Lo llama un Database Webhook de
   Supabase cada vez que se actualiza una fila de `profiles`
   (Supabase -> Database -> Webhooks -> New webhook):
     Table: profiles
     Events: Update
     Type: HTTP Request
     URL: https://dreamlegacyrp.xyz/api/discord/status-webhook
     HTTP Headers: x-webhook-secret: <el mismo valor que
       DLRP_WEBHOOK_SECRET en las variables de entorno de Cloudflare>

   Así, cuando apruebas o rechazas a alguien desde el Table Editor
   de Supabase, este endpoint se dispara solo y manda el DM.
   ============================================================ */
import { sendDiscordDM, dlrpEmbed, DLRP_COLORS, dmText, supabaseHeaders } from "../../_lib/discord.js";

export async function onRequestPost(context) {
    const { request, env } = context;

    const secret = request.headers.get("x-webhook-secret");
    if (!env.DLRP_WEBHOOK_SECRET || secret !== env.DLRP_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
    }

    let payload;
    try { payload = await request.json(); } catch (e) {
        return new Response("Bad Request", { status: 400 });
    }

    const record = payload.record;
    const oldRecord = payload.old_record;
    if (!record || !record.discord_id) {
        return new Response("ok (nothing to do)", { status: 200 });
    }

    const statusChanged = oldRecord && oldRecord.status !== record.status;
    const banChanged = oldRecord && oldRecord.is_banned !== record.is_banned;

    if (!statusChanged && !banChanged) return new Response("ok (nothing relevant changed)", { status: 200 });

    // Sincroniza con la base de datos del servidor de juego (VPS de
    // Contabo) a traves del Worker dedicado. Si esto falla, no debe
    // impedir que el DM de Discord se siga mandando -- por eso va en
    // su propio try/catch, sin usar `await` bloqueante del resto.
    if (env.GAME_SYNC_URL && env.GAME_SYNC_SECRET) {
        if (statusChanged) {
            await syncGameServer(env, "/sync-whitelist", { discordId: record.discord_id, psn: record.psn, whitelisted: record.status === "approved" });
        }
        if (banChanged) {
            await syncGameServer(env, "/ban", { discordId: record.discord_id, psn: record.psn, banned: record.is_banned });
        }
    }

    if (statusChanged) {
        let embed = null;
        const t = dmText(record.preferred_language);

        if (record.status === "approved") {
            // Balance inicial de $10,000, solo la primera vez que se
            // aprueba a alguien en toda su vida (no cada vez que se
            // reaprueba tras salir/reentrar en Discord).
            if (!record.starter_balance_given) {
                await grantStarterBalance(env, record.id, record.bank || 0);
            }

            embed = dlrpEmbed({
                title: t.approvedTitle,
                description: t.approvedDesc,
                color: DLRP_COLORS.success,
                fields: [
                    { name: t.approvedNextStep, value: t.approvedLink }
                ],
                footer: t.approvedFooter
            });
        } else if (record.status === "denied") {
            embed = dlrpEmbed({
                title: t.deniedTitle,
                description: t.deniedDesc,
                color: DLRP_COLORS.danger,
                fields: record.deny_reason ? [{ name: t.deniedReason, value: record.deny_reason }] : undefined,
                footer: t.deniedFooter
            });
        } else if (record.status === "pending" && oldRecord.status === "approved") {
            embed = dlrpEmbed({
                title: t.holdTitle,
                description: t.holdDesc,
                color: DLRP_COLORS.warning,
                footer: t.holdFooter
            });
        }
        if (embed) await sendDiscordDM(env, record.discord_id, embed);
    }

    if (banChanged && record.is_banned) {
        const t = dmText(record.preferred_language);
        await sendDiscordDM(env, record.discord_id, dlrpEmbed({
            title: t.revokedTitle,
            description: t.revokedDesc,
            color: DLRP_COLORS.danger,
            fields: record.ban_reason ? [{ name: t.revokedReason, value: record.ban_reason }] : undefined,
            footer: t.revokedFooter
        }));
    } else if (banChanged && !record.is_banned) {
        const t = dmText(record.preferred_language);
        await sendDiscordDM(env, record.discord_id, dlrpEmbed({
            title: t.restoredTitle,
            description: t.restoredDesc,
            color: DLRP_COLORS.success,
            footer: t.restoredFooter
        }));
    }

    return new Response("ok", { status: 200 });
}

async function syncGameServer(env, path, body) {
    try {
        await fetch(env.GAME_SYNC_URL + path, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-sync-secret": env.GAME_SYNC_SECRET },
            body: JSON.stringify(body)
        });
    } catch (err) {
        console.error("Game server sync failed:", err.message);
    }
}

async function grantStarterBalance(env, profileId, currentBank) {
    const STARTER_BALANCE = 5000;
    try {
        const res = await fetch(
            env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + profileId,
            {
                method: "PATCH",
                headers: { ...supabaseHeaders(env), Prefer: "return=minimal" },
                body: JSON.stringify({
                    bank: currentBank + STARTER_BALANCE,
                    starter_balance_given: true
                })
            }
        );
        if (!res.ok) console.error("Could not grant starter balance:", await res.text());
    } catch (err) {
        console.error("grantStarterBalance error:", err.message);
    }
}