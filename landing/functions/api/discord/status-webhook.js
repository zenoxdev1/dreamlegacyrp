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
import { sendDiscordDM } from "../../_lib/discord.js";

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
    if (!statusChanged) return new Response("ok (no status change)", { status: 200 });

    let message = null;
    if (record.status === "approved") {
        message = "**Dream Legacy RP** — Your whitelist application has been **approved**! " +
            "You can now log in at https://panel.dreamlegacyrp.xyz to access the Panel and DreamOS. Welcome to DLRP!";
    } else if (record.status === "denied") {
        message = "**Dream Legacy RP** — Your whitelist application was **not approved** this time." +
            (record.deny_reason ? "\n\n**Reason:** " + record.deny_reason : "") +
            "\n\nYou're welcome to reach out on our Discord server if you have questions or want to re-apply.";
    } else if (record.status === "pending" && oldRecord.status === "approved") {
        message = "**Dream Legacy RP** — Your Panel access was put back on hold because you're no longer a " +
            "member of our Discord server. Rejoin the server and your access will be reviewed again.";
    }

    if (message) {
        await sendDiscordDM(env, record.discord_id, message);
    }

    return new Response("ok", { status: 200 });
}