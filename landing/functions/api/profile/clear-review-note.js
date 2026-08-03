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

        const res = await fetch(
            env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + encodeURIComponent(profile.id),
            {
                method: "PATCH",
                headers: { ...supabaseHeaders(env), Prefer: "return=minimal" },
                body: JSON.stringify({ review_note: null })
            }
        );
        if (!res.ok) throw new Error("Could not clear the review note: " + (await res.text()));

        return jsonResponse(request, { ok: true });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}