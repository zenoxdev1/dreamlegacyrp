/* ============================================================
   Dream Legacy RP — Alertas de Emergencia (Police/EMS)
   Ruta: POST /api/emergency/alert
   Body: { key: sessionToken, type: "police"|"ems"|"test", title, color, caller, phone, location }
   ------------------------------------------------------------
   Reemplaza los webhooks de Discord que antes estaban escritos
   directamente en emergency.html (visibles para cualquier
   jugador con las herramientas de desarrollador del navegador).
   Aquí, el bot manda el mensaje usando IDs de canal guardados
   como variables de entorno -- nunca visibles para el cliente.
   ============================================================ */
import { getProfileByToken, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";

export async function onRequestOptions(context) {
    return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try { body = await request.json(); } catch (e) {
        return jsonResponse(request, { error: "Invalid request body." }, 400);
    }

    const token = body.key;
    if (!token) return jsonResponse(request, { error: "Missing session token." }, 401);

    try {
        const profile = await getProfileByToken(env, token);
        if (!profile) return jsonResponse(request, { error: "Session expired." }, 401);

        const webhookUrl = body.type === "ems" ? env.EMS_WEBHOOK_URL : env.POLICE_WEBHOOK_URL;
        if (!webhookUrl) {
            return jsonResponse(request, { error: "This department's alert channel isn't configured yet." }, 400);
        }

        const embed = {
            title: body.title || "Emergency Alert",
            color: typeof body.color === "number" ? body.color : 0x64748b,
            fields: [
                { name: "Caller", value: String(body.caller || "Unknown"), inline: true },
                { name: "Phone", value: String(body.phone || "Unknown"), inline: true },
                { name: "Location", value: String(body.location || "Unknown"), inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error("Discord rejected the alert: " + errText);
        }

        if (body.type === "police" || body.type === "ems") {
            try {
                await fetch(env.SUPABASE_URL + "/rest/v1/emergency_alerts", {
                    method: "POST",
                    headers: supabaseHeaders(env),
                    body: JSON.stringify({
                        department: body.type,
                        caller_name: body.caller || null,
                        caller_phone: body.phone || null,
                        location: body.location || null
                    })
                });
            } catch (logErr) {
                console.error("Failed to log emergency alert:", logErr.message);
            }
        }

        return jsonResponse(request, { ok: true });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}