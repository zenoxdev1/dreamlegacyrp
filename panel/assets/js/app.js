/* ============================================================
   Dream Legacy RP — Panel (panel.dreamlegacyrp.xyz)
   ------------------------------------------------------------
   El Panel ya NO tiene su propio formulario de login. El unico
   punto de entrada es Discord, en la landing (dreamlegacyrp.xyz):
     1) El usuario inicia sesion con Discord ahi.
     2) Envia su solicitud de whitelist (queda "pending").
     3) Cuando se aprueba, el usuario recibe un DM y un boton
        "Go to Panel" que le trae aqui con el token de sesion en la
        URL (?dlrp_session=...), recogido por session-handoff.js.
   Aqui comprobamos, EN CADA CARGA de la pagina: hay sesion? -> sigue
   en el servidor de Discord? -> esta aprobada? -> dashboard.
   La comprobacion de servidor se revalida siempre (no solo se confia
   en lo que se guardo la ultima vez que inicio sesion), llamando a
   la misma Function que usa la landing (es un origen distinto, por
   eso la URL es absoluta y esa Function tiene CORS habilitado).
   ============================================================ */

// SESSION_KEY ya esta declarado en session-handoff.js (se carga antes).

var RECHECK_URL = "https://dreamlegacyrp.xyz/api/discord/recheck";

function getSessionKey() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { var parsed = JSON.parse(raw); return parsed && parsed.key ? parsed.key : null; } catch (e) { return null; }
}

function showScreen(id) {
    var screens = ["auth-screen", "pending-screen", "dashboard"];
    for (var i = 0; i < screens.length; i++) {
        var el = document.getElementById(screens[i]);
        if (el) el.classList.toggle("hidden", screens[i] !== id);
    }
    document.getElementById("profile-bar").classList.toggle("hidden", id !== "dashboard");
}

function renderProfile(profile) {
    document.getElementById("prof-name").textContent = profile.rpName || profile.discordUsername;
    document.getElementById("prof-phone").textContent = profile.phoneOwned ? (profile.phoneData && profile.phoneData.purchasedPhone) || "Yes" : "None";
    document.getElementById("prof-num").textContent = profile.phoneNumber || "-";
    document.getElementById("prof-bank").textContent = "$" + ((profile.bank || 0) + (profile.cash || 0)).toLocaleString();
    var pfpEl = document.getElementById("prof-pfp");
    var pfp = (profile.phoneData && profile.phoneData.pfp) || profile.discordAvatar;
    if (pfp) { pfpEl.src = pfp; pfpEl.style.display = "inline"; } else { pfpEl.style.display = "none"; }
}

function showBlockedScreen(status, discordInGuild, isBanned, banReason) {
    var titleEl = document.getElementById("pending-title");
    var descEl = document.getElementById("pending-desc");
    if (isBanned) {
        titleEl.textContent = DLRP_I18N.t("panel.bannedTitle", "You've been banned");
        descEl.textContent = banReason
            ? DLRP_I18N.t("panel.bannedReasonPrefix", "Reason: ") + banReason
            : DLRP_I18N.t("panel.bannedDesc", "Your access has been revoked. Contact staff on Discord if you believe this is a mistake.");
    } else if (!discordInGuild) {
        titleEl.textContent = DLRP_I18N.t("panel.notInGuildTitle", "You've left the Discord server");
        descEl.textContent = DLRP_I18N.t("panel.notInGuildDesc", "You need to be a member of the Dream Legacy RP Discord server to use the Panel. Rejoin and your access will be reviewed again.");
    } else if (status === "denied") {
        titleEl.textContent = DLRP_I18N.t("panel.deniedTitle", "Application not approved");
        descEl.textContent = DLRP_I18N.t("panel.deniedDesc", "Your whitelist application wasn't approved. Reach out on Discord if you have questions.");
    } else {
        titleEl.textContent = DLRP_I18N.t("panel.pendingTitle", "Application pending");
        descEl.textContent = DLRP_I18N.t("panel.pendingDesc", "Your whitelist application hasn't been approved yet. You'll get a DM on Discord once it's reviewed.");
    }
    showScreen("pending-screen");
}

function logout() {
    var key = getSessionKey();
    if (key) api("/api/logout", "POST", { key: key }).catch(function () {});
    localStorage.removeItem(SESSION_KEY);
    showScreen("auth-screen");
}

/* Se ejecuta al cargar la pagina (session-handoff.js ya recogio el
   token de la URL si venia de la landing, antes de que esto corra). */
document.addEventListener("DOMContentLoaded", function () {
    var key = getSessionKey();
    if (!key) { showScreen("auth-screen"); return; }

    // Paso 1: revalidar membresia del servidor de Discord AHORA (no el
    // valor guardado de la ultima vez), y refrescar datos del perfil.
    fetch(RECHECK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key })
    }).then(function (r) {
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Request failed"); return d; });
    }).then(function (profile) {
        if (profile.isBanned || !profile.discordInGuild || profile.status !== "approved") {
            showBlockedScreen(profile.status, profile.discordInGuild, profile.isBanned, profile.banReason);
            return;
        }
        showScreen("dashboard");
        renderProfile(profile);
    }).catch(function () {
        localStorage.removeItem(SESSION_KEY);
        showScreen("auth-screen");
    });
});