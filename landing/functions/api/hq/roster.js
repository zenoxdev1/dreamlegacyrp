import { getProfileByToken, getDiscordMemberRoles, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { DEPARTMENTS, resolveDepartment } from "../../_lib/hq-config.js";

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

        const callerRoleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const callerMatch = resolveDepartment(callerRoleIds);
        if (!callerMatch || callerMatch.department !== body.department || callerMatch.rank !== "chief") {
            return jsonResponse(request, { error: "Only the department chief can view the roster." }, 403);
        }

        const dept = DEPARTMENTS[body.department];
        if (!dept) return jsonResponse(request, { error: "Unknown department." }, 400);
        const deptRoleIds = dept.roles.map((r) => r.id);

        // Trae los miembros del servidor de Discord (paginado hasta 1000,
        // de sobra para un servidor de este tamano) y se queda solo con
        // los que tengan algun rol de este departamento.
        const res = await fetch(
            "https://discord.com/api/v10/guilds/" + env.DISCORD_GUILD_ID + "/members?limit=1000",
            { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } }
        );
        if (!res.ok) throw new Error("Discord member list failed: " + (await res.text()));
        const members = await res.json();

        const roster = [];
        for (const m of members) {
            const memberDeptRoles = (m.roles || []).filter((r) => deptRoleIds.includes(r));
            if (memberDeptRoles.length === 0) continue;
            // Se queda con el rango mas alto que tenga en este departamento.
            let bestIndex = dept.roles.length;
            for (const roleId of memberDeptRoles) {
                const idx = dept.roles.findIndex((r) => r.id === roleId);
                if (idx !== -1 && idx < bestIndex) bestIndex = idx;
            }
            roster.push({
                discordId: m.user.id,
                username: m.user.username,
                avatar: m.user.avatar
                    ? "https://cdn.discordapp.com/avatars/" + m.user.id + "/" + m.user.avatar + ".png"
                    : null,
                roleIndex: bestIndex,
                roleName: dept.roles[bestIndex].name
            });
        }

        roster.sort((a, b) => a.roleIndex - b.roleIndex);

        return jsonResponse(request, { ok: true, roster: roster, roles: dept.roles });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}