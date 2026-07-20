/* ============================================================
   Dream Legacy RP — Adaptador de base de datos (Supabase)
   ------------------------------------------------------------
   Sustituye al backend REST que nunca se llegó a construir
   (Phonesite/Database estaba "Coming Soon"). En vez de montar
   y mantener un servidor Node/Express aparte, usamos Supabase:
   Postgres gratis y estable, con funciones RPC seguras
   (ver /database/schema.sql).

   Expone la misma firma que usaba el código original:
       api(path, method, body) -> Promise
   así que app.js casi no cambia.

   CONFIGURA AQUÍ tu proyecto de Supabase (Project Settings -> API):
   ============================================================ */

var SUPABASE_URL = "https://cpdljnqhuealpxhpwsqk.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwZGxqbnFodWVhbHB4aHB3c3FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MjYzNjksImV4cCI6MjA5OTIwMjM2OX0.7Mkz8nOL35iOI9M55zq-CnCOd88Skc_2-voqG3c8UlE";

var _sb = null;
function getSupabase() {
    if (!_sb) {
        if (!window.supabase) throw new Error("Supabase JS no se ha cargado todavía.");
        _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _sb;
}

function rpcFail(err) {
    throw new Error((err && err.message) || "Database error.");
}

/**
 * api(path, method, body)
 * Traduce cada "endpoint" antiguo a una función RPC de Supabase.
 */
function api(path, method, body) {
    var sb = getSupabase();
    body = body || {};

    if (path === "/api/health") {
        return sb.rpc("dlrp_health").then(function (r) {
            if (r.error) rpcFail(r.error);
            return { ok: true };
        });
    }

    if (path === "/api/whitelist") {
        return sb.rpc("dlrp_whitelist_signup", {
            p_rp_name: body.rpName,
            p_discord_user: body.discordUser,
            p_psn: body.psn,
            p_password: body.password,
            p_story: body.story,
            p_extra_info: body.extraInfo || ""
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/login") {
        return sb.rpc("dlrp_login", {
            p_rp_name: body.username,
            p_password: body.password
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data; // { token, profile }
        });
    }

    if (path === "/api/logout") {
        return sb.rpc("dlrp_logout", { p_token: body.key }).then(function () {
            return { ok: true };
        });
    }

    if (path === "/api/profile/update") {
        return sb.rpc("dlrp_update_profile", {
            p_token: body.key, p_psn: body.psn || "", p_story: body.story || "", p_extra_info: body.extraInfo || ""
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data; // { profile }
        });
    }

    if (path === "/api/profile/theme") {
        return sb.rpc("dlrp_set_theme", { p_token: body.key, p_theme: body.theme }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return { ok: true };
        });
    }

    if (path === "/api/profile/favorites/add") {
        return sb.rpc("dlrp_add_favorite", { p_token: body.key, p_url: body.url, p_title: body.title }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return { favorites: r.data };
        });
    }

    if (path === "/api/profile/favorites/remove") {
        return sb.rpc("dlrp_remove_favorite", { p_token: body.key, p_url: body.url }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return { favorites: r.data };
        });
    }

    if (path.indexOf("/api/profile/") === 0) {
        var token = decodeURIComponent(path.slice("/api/profile/".length));
        return sb.rpc("dlrp_get_profile", { p_token: token }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path.indexOf("/api/jobs/") === 0 && path !== "/api/jobs/apply") {
        var jobId = decodeURIComponent(path.slice("/api/jobs/".length));
        return sb.rpc("dlrp_get_job_people", { p_job_id: jobId }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data; // { people: [...] }
        });
    }

    if (path === "/api/jobs/apply") {
        return sb.rpc("dlrp_apply_job", { p_rp_name: body.rpName, p_job_id: body.jobId }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/phone/sync") {
        return sb.rpc("dlrp_sync_phone_profile", {
            p_token: body.key, p_bank: body.bank, p_cash: body.cash,
            p_phone_owned: body.phoneOwned, p_phone_number: body.phoneNumber, p_phone_data: body.phoneData
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/phone/buy") {
        return sb.rpc("dlrp_buy_phone", {
            p_token: body.key, p_model: body.model, p_price: body.price
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/bank/transfer") {
        return sb.rpc("dlrp_transfer_bank", {
            p_token: body.key, p_to_rp_name: body.toRpName, p_amount: body.amount
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/reports/submit") {
        return sb.rpc("dlrp_submit_report", {
            p_token: body.key, p_reported_name: body.reportedName || null, p_category: body.category || "other", p_message: body.message
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/id/submit") {
        return sb.rpc("dlrp_submit_id_request", {
            p_token: body.key, p_full_name: body.fullName, p_dob: body.dob, p_pob: body.pob, p_gender: body.gender
        }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/id/status") {
        return sb.rpc("dlrp_get_id_status", { p_token: body.key }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/messages/send") {
        return sb.rpc("dlrp_send_message", { p_token: body.key, p_to_number: body.toNumber, p_body: body.body }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/messages/threads") {
        return sb.rpc("dlrp_get_message_threads", { p_token: body.key }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return { threads: r.data };
        });
    }

    if (path === "/api/messages/thread") {
        return sb.rpc("dlrp_get_thread_messages", { p_token: body.key, p_other_number: body.otherNumber }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return { messages: r.data };
        });
    }

    if (path === "/api/calls/place") {
        return sb.rpc("dlrp_place_call", { p_token: body.key, p_to_number: body.toNumber }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/calls/recent") {
        return sb.rpc("dlrp_get_recent_calls", { p_token: body.key }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return { calls: r.data };
        });
    }

    if (path === "/api/calls/incoming") {
        return sb.rpc("dlrp_check_incoming_call", { p_token: body.key }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/calls/respond") {
        return sb.rpc("dlrp_respond_call", { p_token: body.key, p_call_id: body.callId, p_answer: body.answer }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    if (path === "/api/calls/outcome") {
        return sb.rpc("dlrp_get_call_outcome", { p_token: body.key, p_call_id: body.callId }).then(function (r) {
            if (r.error) rpcFail(r.error);
            return r.data;
        });
    }

    return Promise.reject(new Error("Unknown endpoint: " + path));
}

window.api = api;