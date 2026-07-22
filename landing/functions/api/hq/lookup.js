import { getProfileByToken, getDiscordMemberRoles, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { resolveAccess } from "../../_lib/hq-config.js";

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); } catch (e) { return jsonResponse(request, { error: "Invalid body." }, 400); }

    if (!body.query || !body.query.trim()) {
        return jsonResponse(request, { error: "Enter a name or PSN to search." }, 400);
    }

    try {
        const profile = await getProfileByToken(env, body.key);
        if (!profile) return jsonResponse(request, { error: "Session expired." }, 401);

        const roleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const access = resolveAccess(roleIds, body.department);
        if (!access.allowed) {
            return jsonResponse(request, { error: "You don't have access to this department." }, 403);
        }

        const res = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/dlrp_hq_lookup_citizen", {
            method: "POST",
            headers: supabaseHeaders(env),
            body: JSON.stringify({ p_query: body.query.trim() })
        });
        if (!res.ok) throw new Error("Lookup failed: " + (await res.text()));
        const result = await res.json();

        return jsonResponse(request, result);
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}