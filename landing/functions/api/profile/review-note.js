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

        return jsonResponse(request, { reviewNote: profile.review_note || null });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}