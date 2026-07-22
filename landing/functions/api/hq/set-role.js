import { getProfileByToken, getDiscordMemberRoles, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { DEPARTMENTS, resolveAccess } from "../../_lib/hq-config.js";

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

async function discordRoleAction(env, targetDiscordId, roleId, add) {
    const url = "https://discord.com/api/v10/guilds/" + env.DISCORD_GUILD_ID + "/members/" + targetDiscordId + "/roles/" + roleId;
    const res = await fetch(url, {
        method: add ? "PUT" : "DELETE",
        headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN }
    });
    if (!res.ok && res.status !== 204) {
        throw new Error("Discord role update failed (" + res.status + "): " + (await res.text()));
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); } catch (e) { return jsonResponse(request, { error: "Invalid body." }, 400); }

    const { department, targetDiscordId, action } = body;
    if (!department || !targetDiscordId || !["promote", "demote", "fire"].includes(action)) {
        return jsonResponse(request, { error: "Missing or invalid parameters." }, 400);
    }

    try {
        const profile = await getProfileByToken(env, body.key);
        if (!profile) return jsonResponse(request, { error: "Session expired." }, 401);

        const callerRoleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const access = resolveAccess(callerRoleIds, department);
        if (!access.allowed || access.rank !== "chief") {
            return jsonResponse(request, { error: "Only the department chief can manage staff." }, 403);
        }

        const dept = DEPARTMENTS[department];
        if (!dept) return jsonResponse(request, { error: "Unknown department." }, 400);

        const targetRoleIds = await getDiscordMemberRoles(env, targetDiscordId);
        const deptRoleIds = dept.roles.map((r) => r.id);
        const currentDeptRoles = targetRoleIds.filter((r) => deptRoleIds.includes(r));

        if (action === "fire") {
            for (const roleId of currentDeptRoles) {
                await discordRoleAction(env, targetDiscordId, roleId, false);
            }
            return jsonResponse(request, { ok: true });
        }

        if (currentDeptRoles.length === 0) {
            return jsonResponse(request, { error: "This person doesn't currently hold a role in this department." }, 400);
        }

        // Se queda con el indice de rango mas alto que tenga (el numero
        // mas bajo = rango mas alto, por como esta ordenado hq-config.js).
        let currentIndex = dept.roles.length;
        for (const roleId of currentDeptRoles) {
            const idx = dept.roles.findIndex((r) => r.id === roleId);
            if (idx !== -1 && idx < currentIndex) currentIndex = idx;
        }

        const newIndex = action === "promote" ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0) return jsonResponse(request, { error: "Already at the highest rank." }, 400);
        if (newIndex >= dept.roles.length) return jsonResponse(request, { error: "Already at the lowest rank." }, 400);

        // Quita todos los roles del departamento que tenga ahora y le
        // pone solo el del rango nuevo (evita que se quede con dos a
        // la vez si alguien tenia mas de uno por error).
        for (const roleId of currentDeptRoles) {
            await discordRoleAction(env, targetDiscordId, roleId, false);
        }
        await discordRoleAction(env, targetDiscordId, dept.roles[newIndex].id, true);

        return jsonResponse(request, { ok: true, newRoleName: dept.roles[newIndex].name });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}