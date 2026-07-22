import { getProfileByToken, getDiscordMemberRoles, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";
import { isAdminRole } from "../../_lib/hq-config.js";
import { STAT_HASHES } from "../../_lib/stat-hashes.js";

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
        if (!isAdminRole(roleIds)) return jsonResponse(request, { error: "Staff access required." }, 403);

        if (!body.psn) return jsonResponse(request, { error: "psn is required." }, 400);

        const res = await fetch(
            env.SUPABASE_URL + "/rest/v1/player_game_stats?gamertag=ilike." + encodeURIComponent(body.psn) + "&limit=1",
            { headers: supabaseHeaders(env) }
        );
        if (!res.ok) throw new Error("Could not load stats: " + (await res.text()));
        const rows = await res.json();

        if (!rows.length) {
            return jsonResponse(request, { found: false });
        }

        const row = rows[0];
        const rawStats = Array.isArray(row.stats) ? row.stats : [];
        const decoded = rawStats.map((s) => ({
            name: STAT_HASHES[s.HashKey] || null,
            hash: s.HashKey,
            type: s.Type,
            value: s.Value
        }));

        // Los que ya tenemos nombre van primero y ordenados, para que
        // lo util se vea de un vistazo antes que el resto de hashes
        // sin descifrar.
        decoded.sort((a, b) => {
            if (!!a.name === !!b.name) return (a.name || a.hash).localeCompare(b.name || b.hash);
            return a.name ? -1 : 1;
        });

        return jsonResponse(request, {
            found: true,
            gamertag: row.gamertag,
            updatedAt: row.updated_at,
            totalStats: decoded.length,
            decodedCount: decoded.filter((d) => d.name).length,
            stats: decoded
        });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}