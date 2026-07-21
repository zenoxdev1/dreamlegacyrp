import { getProfileByToken, getDiscordMemberRoles, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { resolveDepartment } from "../../_lib/hq-config.js";

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); } catch (e) { return jsonResponse(request, { error: "Invalid body." }, 400); }

    try {
        const profile = await getProfileByToken(env, body.key);
        if (!profile) return jsonResponse(request, { error: "Session expired." }, 401);
        if (profile.is_banned) return jsonResponse(request, { error: "Account banned." }, 403);

        const roleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const match = resolveDepartment(roleIds);

        return jsonResponse(request, {
            ok: true,
            rpName: profile.rp_name || profile.discord_username,
            discordId: profile.discord_id,
            discordAvatar: profile.discord_avatar,
            bank: profile.bank,
            cash: profile.cash,
            department: match ? match.department : null,
            departmentLabel: match ? match.label : null,
            roleName: match ? match.roleName : null,
            rank: match ? match.rank : null
        });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}