/* ============================================================
   Dream Legacy RP — Panel (panel.dreamlegacyrp.xyz)
   ------------------------------------------------------------
   El Panel ya NO tiene su propio formulario de login. El unico
   punto de entrada es Discord, en la landing (dreamlegacyrp.xyz):
     1) El usuario inicia sesion con Discord ahi.
     2) Envia su solicitud de whitelist (queda "pending").
     3) Cuando se aprueba (Table Editor de Supabase, o tu panel de
        administracion si lo añades), el usuario recibe un DM y un
        boton "Go to Panel" que le trae aqui con el token de sesion
        en la URL (?dlrp_session=...), recogido por session-handoff.js.
   Aqui solo comprobamos: hay sesion? -> esta aprobada? -> dashboard.
   Si no hay sesion: pantalla "inicia sesion en la landing".
   Si hay sesion pero no esta aprobada: pantalla de "pendiente".
   ============================================================ */

// SESSION_KEY ya esta declarado en session-handoff.js (se carga antes).

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

    api("/api/profile/" + encodeURIComponent(key), "GET").then(function (profile) {
        if (profile.status !== "approved") {
            var titleEl = document.getElementById("pending-title");
            var descEl = document.getElementById("pending-desc");
            if (profile.status === "denied") {
                titleEl.textContent = DLRP_I18N.t("panel.deniedTitle", "Application not approved");
                descEl.textContent = DLRP_I18N.t("panel.deniedDesc", "Your whitelist application wasn't approved. Reach out on Discord if you have questions.");
            } else {
                titleEl.textContent = DLRP_I18N.t("panel.pendingTitle", "Application pending");
                descEl.textContent = DLRP_I18N.t("panel.pendingDesc", "Your whitelist application hasn't been approved yet. You'll get a DM on Discord once it's reviewed.");
            }
            showScreen("pending-screen");
            return;
        }
        showScreen("dashboard");
        renderProfile(profile);
    }).catch(function () {
        localStorage.removeItem(SESSION_KEY);
        showScreen("auth-screen");
    });
});