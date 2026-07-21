import { getProfileByToken, getDiscordMemberRoles, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { isAdminRole } from "../../_lib/hq-config.js";

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

        const roleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const isAdmin = isAdminRole(roleIds);

        // Mantiene sincronizada la columna is_admin (la usan todas las
        // funciones RPC del panel por dentro) con el rol real de
        // Discord -- si alguien pierde el rol, tambien pierde el
        // acceso a las funciones de admin, sin que nadie tenga que
        // acordarse de tocar la base de datos a mano.
        if (!!profile.is_admin !== isAdmin) {
            await fetch(env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + profile.id, {
                method: "PATCH",
                headers: supabaseHeaders(env),
                body: JSON.stringify({ is_admin: isAdmin })
            });
        }

        return jsonResponse(request, { ok: true, isAdmin: isAdmin });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}