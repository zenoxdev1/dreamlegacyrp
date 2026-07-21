import { getProfileByToken, getDiscordMemberRoles, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { resolveDepartment } from "../../_lib/hq-config.js";

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

const DEPT_TO_ALERT_TYPE = { police: "police", ems: "ems" };

export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); } catch (e) { return jsonResponse(request, { error: "Invalid body." }, 400); }

    try {
        const profile = await getProfileByToken(env, body.key);
        if (!profile) return jsonResponse(request, { error: "Session expired." }, 401);

        const roleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const match = resolveDepartment(roleIds);
        if (!match || match.department !== body.department) {
            return jsonResponse(request, { error: "You don't have access to this department." }, 403);
        }

        const alertType = DEPT_TO_ALERT_TYPE[body.department];
        const res = await fetch(
            env.SUPABASE_URL + "/rest/v1/emergency_alerts?department=eq." + encodeURIComponent(alertType) +
            "&order=created_at.desc&limit=40",
            { headers: supabaseHeaders(env) }
        );
        if (!res.ok) throw new Error("Could not load the emergency feed: " + (await res.text()));
        const rows = await res.json();

        return jsonResponse(request, {
            ok: true,
            alerts: rows.map((r) => ({
                id: r.id, callerName: r.caller_name, callerPhone: r.caller_phone,
                location: r.location, createdAt: r.created_at
            }))
        });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}