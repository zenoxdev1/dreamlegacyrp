import { getProfileByToken, getDiscordMemberRoles, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";
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

        const roleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const match = resolveDepartment(roleIds);
        if (!match || match.department !== body.department) {
            return jsonResponse(request, { error: "You don't have access to this department." }, 403);
        }

        if (body.action === "post") {
            if (match.rank !== "chief") return jsonResponse(request, { error: "Only the chief can post announcements." }, 403);
            if (!body.title || !body.body) return jsonResponse(request, { error: "Title and body are required." }, 400);

            const res = await fetch(env.SUPABASE_URL + "/rest/v1/hq_announcements", {
                method: "POST",
                headers: supabaseHeaders(env, { Prefer: "return=representation" }),
                body: JSON.stringify({
                    department: body.department,
                    title: body.title,
                    body: body.body,
                    posted_by_username: profile.discord_username
                })
            });
            if (!res.ok) throw new Error("Could not save the announcement: " + (await res.text()));
            return jsonResponse(request, { ok: true });
        }

        // Listar (cualquier miembro del departamento)
        const listRes = await fetch(
            env.SUPABASE_URL + "/rest/v1/hq_announcements?department=eq." + encodeURIComponent(body.department) +
            "&order=created_at.desc&limit=30",
            { headers: supabaseHeaders(env) }
        );
        if (!listRes.ok) throw new Error("Could not load announcements: " + (await listRes.text()));
        const rows = await listRes.json();

        return jsonResponse(request, {
            ok: true,
            announcements: rows.map((r) => ({
                id: r.id, title: r.title, body: r.body,
                postedByUsername: r.posted_by_username, createdAt: r.created_at
            }))
        });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}