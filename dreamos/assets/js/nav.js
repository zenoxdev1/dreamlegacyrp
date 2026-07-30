/* ============================================================
   Dream Legacy RP — Navbar compartida (Shop / DreamOS / Model)
   ------------------------------------------------------------
   Rellena la burbuja de usuario (avatar + nombre, con Logout en
   el desplegable) y conecta el selector de idioma a medida.
   Requiere: session.js, supabase-client.js e i18n.js cargados
   antes que este archivo.
   ============================================================ */

function initSharedNav() {
    var key = getSessionKey();
    var chip = document.getElementById("nav-user-chip");
    var loginLink = document.getElementById("nav-login-link");
    if (!chip) return;

    if (!key) {
        chip.classList.add("hidden");
        if (loginLink) loginLink.classList.remove("hidden");
        return;
    }

    api("/api/profile/" + encodeURIComponent(key), "GET").then(function (profile) {
        chip.classList.remove("hidden");
        if (loginLink) loginLink.classList.add("hidden");
        var avatar = document.getElementById("nav-user-avatar");
        var name = document.getElementById("nav-user-name");
        if (avatar) avatar.src = profile.discordAvatar || "";
        if (name) name.textContent = profile.rpName || profile.discordUsername || "Player";
    }).catch(function () {
        chip.classList.add("hidden");
        if (loginLink) loginLink.classList.remove("hidden");
    });

    var dropdown = document.getElementById("nav-user-dropdown");
    if (dropdown) {
        chip.addEventListener("click", function (e) {
            e.stopPropagation();
            dropdown.classList.toggle("hidden");
        });
        document.addEventListener("click", function (e) {
            if (!chip.contains(e.target)) dropdown.classList.add("hidden");
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") dropdown.classList.add("hidden");
        });
    }
}

function navLogout() {
    var key = getSessionKey();
    if (key) api("/api/logout", "POST", { key: key }).catch(function () {});
    clearSession();
    window.location.href = "index.html";
}

function setupNavLangSwitch() {
    var btn = document.getElementById("lang-switch-btn");
    var menu = document.getElementById("lang-switch-menu");
    var current = document.getElementById("lang-switch-current");
    var wrap = document.getElementById("lang-switch");
    if (!wrap || !btn || !menu) return;

    function close() { menu.classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); }
    function open() { menu.classList.remove("hidden"); btn.setAttribute("aria-expanded", "true"); }

    btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (menu.classList.contains("hidden")) open(); else close();
    });

    var options = menu.querySelectorAll("[data-lang]");
    for (var i = 0; i < options.length; i++) {
        options[i].addEventListener("click", function () {
            DLRP_I18N.setLang(this.getAttribute("data-lang"));
            close();
        });
    }

    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    DLRP_I18N.onChange(function (lang) {
        if (current) current.textContent = lang.toUpperCase();
        var opts = menu.querySelectorAll("[data-lang]");
        for (var j = 0; j < opts.length; j++) opts[j].classList.toggle("active", opts[j].getAttribute("data-lang") === lang);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    initSharedNav();
    setupNavLangSwitch();
});