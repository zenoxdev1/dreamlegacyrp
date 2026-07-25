import { getProfileByToken, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";

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
        if (!profile.psn) return jsonResponse(request, { error: "No PSN on file for this account." }, 400);

        if (body.action === "delete") {
            if (!body.photoId) return jsonResponse(request, { error: "photoId is required." }, 400);
            const delRes = await fetch(
                env.SUPABASE_URL + "/rest/v1/game_photos?id=eq." + encodeURIComponent(body.photoId) +
                "&gamertag=eq." + encodeURIComponent(profile.psn),
                { method: "DELETE", headers: supabaseHeaders(env) }
            );
            if (!delRes.ok) throw new Error("Could not delete the photo: " + (await delRes.text()));
            return jsonResponse(request, { ok: true });
        }

        // Listar (por defecto)
        const res = await fetch(
            env.SUPABASE_URL + "/rest/v1/game_photos?gamertag=eq." + encodeURIComponent(profile.psn) +
            "&order=created_at.desc&limit=100",
            { headers: supabaseHeaders(env) }
        );
        if (!res.ok) throw new Error("Could not load the gallery: " + (await res.text()));
        const rows = await res.json();

        return jsonResponse(request, {
            ok: true,
            photos: rows.map((r) => ({ id: r.id, imageData: r.image_data, createdAt: r.created_at }))
        });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}