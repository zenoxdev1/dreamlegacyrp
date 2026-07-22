import { getProfileByToken, getDiscordMemberRoles, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { resolveDepartment, isAdminRole, DEPARTMENTS } from "../../_lib/hq-config.js";

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
        const isSuperAdmin = isAdminRole(roleIds);
        const match = resolveDepartment(roleIds);

        const baseInfo = {
            ok: true,
            rpName: profile.rp_name || profile.discord_username,
            discordId: profile.discord_id,
            discordAvatar: profile.discord_avatar,
            bank: profile.bank,
            cash: profile.cash,
            isSuperAdmin: isSuperAdmin
        };

        if (isSuperAdmin) {
            // Acceso total: puede elegir cualquier departamento, con
            // rango de jefe en todos, sin necesitar el rol especifico.
            const allDepartments = Object.keys(DEPARTMENTS).map((key) => ({ key: key, label: DEPARTMENTS[key].label }));
            return jsonResponse(request, Object.assign(baseInfo, {
                department: match ? match.department : allDepartments[0].key,
                departmentLabel: match ? match.label : allDepartments[0].label,
                roleName: match ? match.roleName : "Staff Override",
                rank: "chief",
                allDepartments: allDepartments
            }));
        }

        return jsonResponse(request, Object.assign(baseInfo, {
            department: match ? match.department : null,
            departmentLabel: match ? match.label : null,
            roleName: match ? match.roleName : null,
            rank: match ? match.rank : null,
            allDepartments: []
        }));
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}