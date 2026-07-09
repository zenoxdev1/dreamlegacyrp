/* ============================================================
   Dream Legacy RP — Panel (panel.dreamlegacyrp.xyz)
   ------------------------------------------------------------
   Antes: el Panel dejaba crear cuentas nuevas directamente
   (localStorage, sin whitelist) y era un sistema TOTALMENTE
   separado del formulario de whitelist de la landing.
   Ahora: usa el MISMO login/perfil que la landing (tabla
   `profiles` en Supabase), así que solo entra quien ya fue
   aprobado/whitelisteado. Si quieres permitir registro libre
   en el Panel de nuevo, se puede añadir fácilmente.
   ============================================================ */

var SESSION_KEY = "dlrp_panel_session";

function getSessionKey() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { var parsed = JSON.parse(raw); return parsed && parsed.key ? parsed.key : null; } catch (e) { return null; }
}

function showAuthError(msg) {
    var el = document.getElementById("auth-error");
    el.textContent = msg;
    el.style.display = "block";
}

function authSubmit() {
    var name = document.getElementById("auth-name").value.trim();
    var pass = document.getElementById("auth-pass").value;
    if (!name || !pass) { showAuthError(DLRP_I18N.t("panel.fillFields", "Fill in all fields.")); return; }

    api("/api/login", "POST", { username: name, password: pass }).then(function (res) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ key: res.token, rpName: res.profile.rpName }));
        document.getElementById("auth-error").style.display = "none";
        onLogin(res.profile);
    }).catch(function (err) {
        showAuthError(err.message || DLRP_I18N.t("login.error", "Invalid RP Name or password."));
    });
}

function onLogin(profile) {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("profile-bar").classList.remove("hidden");
    renderProfile(profile);
}

function renderProfile(profile) {
    document.getElementById("prof-name").textContent = profile.rpName;
    document.getElementById("prof-phone").textContent = profile.phoneOwned ? (profile.phoneData && profile.phoneData.purchasedPhone) || "Yes" : "None";
    document.getElementById("prof-num").textContent = profile.phoneNumber || "-";
    document.getElementById("prof-bank").textContent = "$" + ((profile.bank || 0) + (profile.cash || 0)).toLocaleString();
    var pfpEl = document.getElementById("prof-pfp");
    var pfp = profile.phoneData && profile.phoneData.pfp;
    if (pfp) { pfpEl.src = pfp; pfpEl.style.display = "inline"; } else { pfpEl.style.display = "none"; }
}

function logout() {
    var key = getSessionKey();
    if (key) api("/api/logout", "POST", { key: key }).catch(function () {});
    localStorage.removeItem(SESSION_KEY);
    document.getElementById("auth-screen").classList.remove("hidden");
    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("profile-bar").classList.add("hidden");
    document.getElementById("auth-name").value = "";
    document.getElementById("auth-pass").value = "";
    document.getElementById("auth-error").style.display = "none";
}

/* Auto-login al cargar la página, si hay una sesión guardada */
(function restoreSession() {
    var key = getSessionKey();
    if (!key) return;
    document.addEventListener("DOMContentLoaded", function () {
        api("/api/profile/" + encodeURIComponent(key), "GET").then(function (profile) {
            document.getElementById("auth-screen").classList.add("hidden");
            document.getElementById("dashboard").classList.remove("hidden");
            document.getElementById("profile-bar").classList.remove("hidden");
            renderProfile(profile);
        }).catch(function () {
            localStorage.removeItem(SESSION_KEY);
        });
    });
})();
