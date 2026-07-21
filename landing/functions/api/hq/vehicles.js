import { getProfileByToken, getDiscordMemberRoles, supabaseHeaders, corsHeaders, jsonResponse } from "../../_lib/discord.js";
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

        const roleIds = await getDiscordMemberRoles(env, profile.discord_id);
        const match = resolveDepartment(roleIds);
        if (!match || match.department !== body.department) {
            return jsonResponse(request, { error: "You don't have access to this department." }, 403);
        }

        const dept = DEPARTMENTS[body.department];
        const isChief = match.rank === "chief";

        const unlocksRes = await fetch(
            env.SUPABASE_URL + "/rest/v1/hq_vehicle_unlocks?profile_id=eq." + profile.id +
            "&department=eq." + encodeURIComponent(body.department),
            { headers: supabaseHeaders(env) }
        );
        if (!unlocksRes.ok) throw new Error("Could not load vehicle unlocks: " + (await unlocksRes.text()));
        const unlockedIds = (await unlocksRes.json()).map((u) => u.vehicle_id);

        if (body.action === "unlock") {
            const vehicle = dept.vehicles.find((v) => v.id === body.vehicleId);
            if (!vehicle) return jsonResponse(request, { error: "Unknown vehicle." }, 400);
            if (!isChief && match.roleIndex > vehicle.minRoleIndex) {
                return jsonResponse(request, { error: "Your rank doesn't qualify for this vehicle yet." }, 403);
            }
            if (unlockedIds.includes(vehicle.id)) return jsonResponse(request, { ok: true, alreadyUnlocked: true });
            if (isChief || vehicle.price === 0) {
                // Gratis o el jefe -- se desbloquea sin cobrar.
            } else {
                if ((profile.bank || 0) < vehicle.price) {
                    return jsonResponse(request, { error: "Not enough money in your bank." }, 400);
                }
                const payRes = await fetch(env.SUPABASE_URL + "/rest/v1/profiles?id=eq." + profile.id, {
                    method: "PATCH",
                    headers: supabaseHeaders(env),
                    body: JSON.stringify({ bank: profile.bank - vehicle.price })
                });
                if (!payRes.ok) throw new Error("Could not charge for the vehicle: " + (await payRes.text()));
            }

            const insertRes = await fetch(env.SUPABASE_URL + "/rest/v1/hq_vehicle_unlocks", {
                method: "POST",
                headers: supabaseHeaders(env),
                body: JSON.stringify({ profile_id: profile.id, department: body.department, vehicle_id: vehicle.id })
            });
            if (!insertRes.ok) throw new Error("Could not save the unlock: " + (await insertRes.text()));

            return jsonResponse(request, { ok: true });
        }

        // Listar catalogo con estado.
        const vehicles = dept.vehicles.map((v) => ({
            id: v.id,
            name: v.name,
            price: v.price,
            rankRequired: dept.roles[v.minRoleIndex] ? dept.roles[v.minRoleIndex].name : "-",
            rankQualifies: isChief || match.roleIndex <= v.minRoleIndex,
            unlocked: isChief || v.price === 0 || unlockedIds.includes(v.id)
        }));

        return jsonResponse(request, { ok: true, vehicles: vehicles });
    } catch (err) {
        return jsonResponse(request, { error: err.message }, 500);
    }
}