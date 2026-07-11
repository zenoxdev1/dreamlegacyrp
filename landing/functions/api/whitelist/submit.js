/* ============================================================
   Dream Legacy RP — Enviar solicitud de whitelist
   Ruta: POST /api/whitelist/submit
   Body JSON: { key: sessionToken, rpName, psn, story, extraInfo }
   ============================================================ */
import { sendDiscordDM, sendDiscordChannelMessage, supabaseHeaders, getProfileByToken } from "../../_lib/discord.js";

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try { body = await request.json(); } catch (e) {
        return json({ error: "Invalid request body." }, 400);
    }

    const token = body.key;
    if (!token) return json({ error: "Missing session token." }, 401);

    const rpName = (body.rpName || "").trim();
    const psn = (body.psn || "").trim();
    const story = (body.story || "").trim();
    const extraInfo = (body.extraInfo || "").trim();

    if (!rpName || !psn || !story) {
        return json({ error: "RP Name, PSN and Story are required." }, 400);
    }

    try {
        const profile = await getProfileByToken(env, token);
        if (!profile) return json({ error: "Session expired." }, 401);

        const updateRes = await fetch(
            env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + profile.id,
            {
                method: "PATCH",
                headers: supabaseHeaders(env, { Prefer: "return=representation" }),
                body: JSON.stringify({
                    rp_name: rpName,
                    psn: psn,
                    story: story,
                    extra_info: extraInfo,
                    status: "pending",
                    applied_at: new Date().toISOString()
                })
            }
        );
        if (!updateRes.ok) throw new Error("Supabase update failed: " + (await updateRes.text()));
        const rows = await updateRes.json();
        const updated = rows[0];

        if (profile.discord_id) {
            await sendDiscordDM(
                env,
                profile.discord_id,
                "**Dream Legacy RP** — We've received your whitelist application, " + rpName +
                ". We'll DM you here as soon as it's reviewed. Thanks for applying!"
            );
        }

        if (env.ADMIN_NOTIFY_CHANNEL_ID) {
            await sendDiscordChannelMessage(env, env.ADMIN_NOTIFY_CHANNEL_ID, {
                embeds: [{
                    title: "New whitelist application",
                    color: 0x2f73ff,
                    fields: [
                        { name: "RP Name", value: rpName, inline: true },
                        { name: "PSN", value: psn, inline: true },
                        { name: "Discord", value: profile.discord_username ? "@" + profile.discord_username : "-", inline: true },
                        { name: "Story", value: story.length > 500 ? story.slice(0, 500) + "..." : story }
                    ],
                    footer: { text: "Review it at dreamlegacyrp.xyz -> Admin" }
                }]
            });
        }

        return json({
            profile: {
                rpName: updated.rp_name,
                psn: updated.psn,
                story: updated.story,
                extraInfo: updated.extra_info,
                status: updated.status,
                appliedAt: updated.applied_at
            }
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