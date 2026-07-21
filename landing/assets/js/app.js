var tabs = ["rrp", "profile", "settings"];
var SESSION_KEY = "rrp_session";

function getSessionKey() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { var parsed = JSON.parse(raw); if (parsed && parsed.key) return parsed.key; } catch(e) {}
    return raw;
}

// Nota: la función api(path, method, body) vive en supabase-client.js.
// El login/registro con nombre de usuario+contraseña (whitelist) se
// eliminó; ahora la única forma de entrar es con Discord (ver
// discord-auth.js y functions/api/discord/callback.js).

/* ---- Music Player ---- */

var ytPlayer = null;
var ytReady = false;
var MUSIC_KEY = "rrp_music_url";
var MUSIC_VOL_KEY = "rrp_music_vol";

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player("youtube-player", {
        height: "1", width: "1",
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0 },
        events: {
            onReady: function() { ytReady = true; restoreMusic(); },
            onStateChange: function(e) { musicStateChange(e.data); }
        }
    });
}

function extractVideoId(url) {
    var m;
    m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

function playMusic(url) {
    if (url) {
        document.getElementById("music-url").value = url;
    }
    var inputUrl = document.getElementById("music-url").value.trim();
    if (!inputUrl) { notify("Music", "Paste a YouTube link first."); return; }
    var id = extractVideoId(inputUrl);
    if (!id) { notify("Music", "Invalid YouTube link."); return; }
    if (!ytReady || !ytPlayer) { notify("Music", "Player not ready yet."); return; }
    localStorage.setItem(MUSIC_KEY, inputUrl);
    ytPlayer.loadVideoById(id);
}

function musicStateChange(state) {
    var status = document.getElementById("music-status");
    var controls = document.getElementById("music-controls");
    var btn = document.getElementById("music-toggle-btn");
    if (state === YT.PlayerState.PLAYING) {
        status.textContent = "Playing";
        status.style.borderColor = "var(--mint)"; status.style.color = "var(--mint)";
        controls.style.display = "grid";
        btn.innerHTML = "&#9646;&#9646;";
        var data = ytPlayer.getVideoData();
        document.getElementById("music-title").textContent = data.title || "Unknown";
    } else if (state === YT.PlayerState.PAUSED) {
        status.textContent = "Paused";
        status.style.borderColor = "var(--amber)"; status.style.color = "var(--amber)";
        btn.innerHTML = "&#9654;";
    } else if (state === YT.PlayerState.ENDED || state === YT.PlayerState.UNSTARTED) {
        status.textContent = "Stopped";
        status.style.borderColor = "var(--line)"; status.style.color = "var(--muted)";
        if (state === YT.PlayerState.ENDED) controls.style.display = "none";
    }
}

function toggleMusic() {
    if (!ytPlayer) return;
    var state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) { ytPlayer.pauseVideo(); }
    else { ytPlayer.playVideo(); }
}

function stopMusic() {
    if (!ytPlayer) return;
    ytPlayer.stopVideo();
    document.getElementById("music-controls").style.display = "none";
    document.getElementById("music-status").textContent = "Stopped";
    document.getElementById("music-status").style.borderColor = "var(--line)";
    document.getElementById("music-status").style.color = "var(--muted)";
}

function setMusicVolume(val) {
    if (ytPlayer) ytPlayer.setVolume(parseInt(val));
    localStorage.setItem(MUSIC_VOL_KEY, val);
}

function restoreMusic() {
    var vol = localStorage.getItem(MUSIC_VOL_KEY);
    if (vol) { document.getElementById("music-volume").value = vol; if (ytPlayer) ytPlayer.setVolume(parseInt(vol)); }
    var url = localStorage.getItem(MUSIC_KEY);
    if (url) {
        document.getElementById("music-url").value = url;
        var id = extractVideoId(url);
        if (id && ytPlayer) {
            ytPlayer.cueVideoById(id);
            document.getElementById("music-controls").style.display = "grid";
        }
    }
    var key = getSessionKey();
    if (key) { loadFavorites(key); }
}

/* ---- Favorites ---- */

function addFavorite() {
    var key = getSessionKey();
    if (!key) { notify("Favorites", "Log in to save favorites."); return; }
    var url = document.getElementById("music-url").value.trim();
    if (!url) { notify("Favorites", "No song playing."); return; }
    var title = document.getElementById("music-title").textContent;
    api("/api/profile/favorites/add", "POST", { key: key, url: url, title: title }).then(function(res) {
        notify("Favorites", "Added to favorites.");
        renderFavorites(res.favorites);
    }).catch(function(err) { notify("Favorites", err.message); });
}

function removeFavorite(url) {
    var key = getSessionKey();
    if (!key) return;
    api("/api/profile/favorites/remove", "POST", { key: key, url: url }).then(function(res) {
        renderFavorites(res.favorites);
    }).catch(function(err) { notify("Favorites", err.message); });
}

function loadFavorites(key) {
    api("/api/profile/" + encodeURIComponent(key), "GET").then(function(profile) {
        if (profile.musicFavorites && profile.musicFavorites.length > 0) {
            renderFavorites(profile.musicFavorites);
        }
    }).catch(function() {});
}

function renderFavorites(favorites) {
    var section = document.getElementById("favorites-section");
    var list = document.getElementById("favorites-list");
    if (!favorites || favorites.length === 0) { section.style.display = "none"; return; }
    section.style.display = "block";
    var html = "";
    for (var i = 0; i < favorites.length; i++) {
        var f = favorites[i];
        html += '<div class="fav-entry" onclick="playMusic(\'' + escapeHtml(f.url) + '\')">' +
            '<span class="fav-play">&#9654;</span>' +
            '<span class="fav-title">' + escapeHtml(f.title || f.url) + '</span>' +
            '<span class="fav-remove" onclick="event.stopPropagation();removeFavorite(\'' + escapeHtml(f.url) + '\')" title="Remove">&#10005;</span>' +
            '</div>';
    }
    list.innerHTML = html;
}

// Load YouTube IFrame API
var tag = document.createElement("script");
tag.src = "https://www.youtube.com/iframe_api";
var firstScript = document.getElementsByTagName("script")[0];
firstScript.parentNode.insertBefore(tag, firstScript);

/* ---- Notifications ---- */
function notify(title, msg) {
    var container = document.getElementById("notif-container");
    var el = document.createElement("div");
    el.className = "notif";
    el.innerHTML = '<div class="notif-title">' + escapeHtml(title) + '</div><div class="notif-msg">' + escapeHtml(msg) + '</div>';
    container.appendChild(el);
    setTimeout(function() {
        el.classList.add("out");
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---- Theme ---- */

var themeNames = { michael: "Michael", trevor: "Trevor", franklin: "Franklin" };

function applyTheme(name) {
    var valid = ["michael", "trevor", "franklin"];
    if (valid.indexOf(name) === -1) name = "michael";
    var body = document.body;
    body.classList.remove("theme-michael", "theme-trevor", "theme-franklin");
    if (name !== "michael") body.classList.add("theme-" + name);
    var label = document.getElementById("current-theme-label");
    if (label) label.textContent = themeNames[name];
    var opts = document.querySelectorAll(".theme-option");
    for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle("active", opts[i].getAttribute("data-theme") === name);
    }
}

function setTheme(name) {
    applyTheme(name);
    document.getElementById("current-theme-label").textContent = themeNames[name];
    var key = getSessionKey();
    if (!key) { notify("Not Logged In", "Log in with Discord to save your theme preference."); return; }
    api("/api/profile/theme", "POST", { key: key, theme: name }).then(function() {
        notify("Theme Saved", "Theme set to " + themeNames[name] + ".");
    }).catch(function(err) {
        notify("Error", err.message);
    });
}

/* ---- Server Status ---- */

function checkServer() {
    var dot = document.getElementById("status-dot");
    api("/api/health", "GET").then(function() {
        dot.className = "status-dot online";
        dot.title = "Server online";
    }).catch(function() {
        dot.className = "status-dot offline";
        dot.title = "Server offline";
    });
}

setInterval(checkServer, 15000);
setTimeout(checkServer, 500);

/* ---- Tab system ---- */

function setTab(tab) {
    for (var i = 0; i < tabs.length; i++) {
        var ct = tabs[i];
        var panel = document.getElementById("tab-" + ct);
        if (panel) panel.classList.toggle("hidden", ct !== tab);
        var btn = document.getElementById("btn-" + ct);
        if (btn) { btn.classList.toggle("active", ct === tab); btn.setAttribute("aria-selected", String(ct === tab)); }
    }
    var reveals = document.querySelectorAll(".reveal");
    for (var i = 0; i < reveals.length; i++) {
        if (reveals[i].closest("#tab-" + tab)) reveals[i].classList.add("visible");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---- Discord login / session ---- */
// loginWithDiscord() vive en discord-auth.js. Aqui solo gestionamos
// lo que pasa una vez que ya tenemos un token de sesion guardado
// (localStorage), venga de un login nuevo o de una sesion anterior.

function restoreSession() {
    var key = getSessionKey();
    if (!key) return;
    api("/api/profile/" + encodeURIComponent(key), "GET").then(function(profile) {
        onAuthenticated(profile);
    }).catch(function() {
        localStorage.removeItem(SESSION_KEY);
    });
}

function onAuthenticated(profile) {
    applyTheme(profile.theme || "michael");
    document.getElementById("btn-profile").classList.remove("hidden");
    document.getElementById("ready-card").classList.add("hidden");
    if (profile.musicFavorites && profile.musicFavorites.length > 0) renderFavorites(profile.musicFavorites);
    showDiscordChip(profile);
    showProfile(profile);
    if (window.DLRP_FRESH_LOGIN) {
        window.DLRP_FRESH_LOGIN = false;
        setTab("profile");
    }
}

function showDiscordChip(profile) {
    document.getElementById("discord-login-btn").classList.add("hidden");
    var chip = document.getElementById("discord-user-menu");
    chip.classList.remove("hidden");
    document.getElementById("discord-user-avatar").src = profile.discordAvatar || "";
    document.getElementById("discord-user-name").textContent = profile.discordUsername || "Discord user";
}

/* ---- Perfil / estado de la solicitud de whitelist ---- */

var CARD_IDS = ["join-server-card", "application-form-card", "application-pending-card", "application-approved-card", "application-denied-card"];

function showApplicationCard(id) {
    for (var i = 0; i < CARD_IDS.length; i++) {
        document.getElementById(CARD_IDS[i]).classList.toggle("hidden", CARD_IDS[i] !== id);
    }
}

function showProfile(data) {
    document.getElementById("profile-rpname").textContent = data.rpName || data.discordUsername || "-";
    document.getElementById("profile-avatar").src = data.discordAvatar || "";

    // Primero que nada: tiene que estar en el servidor de Discord.
    // Sin esto, ni siquiera puede ver el formulario de solicitud.
    if (!data.discordInGuild) {
        showApplicationCard("join-server-card");
        return;
    }

    var status = data.status || "pending";
    var hasApplied = !!data.appliedAt;

    if (!hasApplied) {
        document.getElementById("apply-rp-name").value = data.rpName || "";
        document.getElementById("apply-psn").value = data.psn || "";
        document.getElementById("apply-story").value = data.story || "";
        document.getElementById("apply-extra").value = data.extraInfo || "";
        showApplicationCard("application-form-card");
        return;
    }

    if (status === "approved") {
        showApplicationCard("application-approved-card");
        var panelLink = document.getElementById("go-to-panel-link");
        var hqLink = document.getElementById("go-to-hq-link");
        var adminLink = document.getElementById("go-to-admin-link");
        var key = getSessionKey();
        if (panelLink && key) {
            panelLink.href = "https://panel.dreamlegacyrp.xyz/?dlrp_session=" + encodeURIComponent(key);
        }
        if (key) {
            if (hqLink) hqLink.href = "https://hq.dreamlegacyrp.xyz/?dlrp_session=" + encodeURIComponent(key);
            if (adminLink) adminLink.href = "https://admin.dreamlegacyrp.xyz/?dlrp_session=" + encodeURIComponent(key);

            fetch("/api/hq/whoami", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: key })
            }).then(function(r) { return r.json(); }).then(function(res) {
                if (hqLink) hqLink.classList.toggle("hidden", !res.department);
            }).catch(function() {});

            fetch("/api/admin/whoami", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: key })
            }).then(function(r) { return r.json(); }).then(function(res) {
                if (adminLink) adminLink.classList.toggle("hidden", !res.isAdmin);
            }).catch(function() {});
        }
    } else if (status === "denied") {
        showApplicationCard("application-denied-card");
        var reasonEl = document.getElementById("denied-reason-text");
        if (data.denyReason) {
            reasonEl.textContent = DLRP_I18N.t("apply.reasonLabel", "Reason given: ") + data.denyReason;
            reasonEl.style.display = "block";
        } else {
            reasonEl.style.display = "none";
        }
    } else {
        showApplicationCard("application-pending-card");
    }
}

function recheckGuildMembership() {
    var key = getSessionKey();
    if (!key) return;
    var btn = document.getElementById("recheck-btn");
    btn.disabled = true;
    fetch("/api/discord/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key })
    }).then(function(r) {
        return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || "Request failed"); return d; });
    }).then(function(res) {
        if (!res.discordInGuild) {
            notify("Discord", "Still not seeing you in the server. Make sure you joined, then try again.");
        } else {
            notify("Discord", "You're in! You can now apply.");
        }
        showProfile({
            rpName: res.rpName,
            discordAvatar: document.getElementById("profile-avatar").src,
            discordUsername: document.getElementById("discord-user-name").textContent,
            discordInGuild: res.discordInGuild,
            status: res.status,
            appliedAt: res.appliedAt,
            psn: res.psn,
            story: res.story,
            extraInfo: res.extraInfo
        });
    }).catch(function(err) {
        notify("Error", err.message);
    }).finally(function() {
        btn.disabled = false;
    });
}

var applicationForm = document.getElementById("application-form");
if (applicationForm) {
    applicationForm.addEventListener("submit", function(e) {
        e.preventDefault();
        var key = getSessionKey();
        if (!key) { notify("Error", "You need to log in with Discord first."); return; }

        var data = {
            key: key,
            rpName: document.getElementById("apply-rp-name").value.trim(),
            psn: document.getElementById("apply-psn").value.trim(),
            story: document.getElementById("apply-story").value.trim(),
            extraInfo: document.getElementById("apply-extra").value.trim()
        };

        var btn = document.getElementById("application-submit-btn");
        var errBox = document.getElementById("application-error");
        errBox.classList.add("hidden");
        btn.disabled = true;

        fetch("/api/whitelist/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        }).then(function(r) {
            return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || "Request failed"); return d; });
        }).then(function(res) {
            notify("Application Sent", "Check your Discord DMs for confirmation.");
            showProfile({
                rpName: res.profile.rpName,
                discordAvatar: document.getElementById("profile-avatar").src,
                discordUsername: document.getElementById("discord-user-name").textContent,
                discordInGuild: true,
                status: res.profile.status,
                appliedAt: res.profile.appliedAt
            });
        }).catch(function(err) {
            errBox.textContent = err.message;
            errBox.classList.remove("hidden");
        }).finally(function() {
            btn.disabled = false;
        });
    });
}

function logout() {
    var key = getSessionKey();
    if (key) api("/api/logout", "POST", { key: key }).catch(function() {});
    localStorage.removeItem(SESSION_KEY);
    document.getElementById("btn-profile").classList.add("hidden");
    document.getElementById("discord-login-btn").classList.remove("hidden");
    document.getElementById("discord-user-menu").classList.add("hidden");
    document.getElementById("ready-card").classList.remove("hidden");
    DLRP_IS_ADMIN = false;
    setTab("rrp");
}

/* ---- Reveal / tilt animations ---- */

function setupReveals() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
        for (var i = 0; i < items.length; i++) items[i].classList.add("visible");
        return;
    }
    var observer = new IntersectionObserver(function(entries) {
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) { entries[i].target.classList.add("visible"); observer.unobserve(entries[i].target); }
        }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    for (var i = 0; i < items.length; i++) observer.observe(items[i]);
}

function setupTilt() {
    var canHover = window.matchMedia("(hover: hover)").matches;
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canHover || reducedMotion) return;
    var cards = document.querySelectorAll("[data-tilt]");
    for (var i = 0; i < cards.length; i++) {
        (function(card) {
            card.addEventListener("mousemove", function(event) {
                var rect = card.getBoundingClientRect();
                var x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
                var y = ((event.clientY - rect.top) / rect.height - 0.5) * -8;
                card.style.setProperty("--tilt-x", x.toFixed(2) + "deg");
                card.style.setProperty("--tilt-y", y.toFixed(2) + "deg");
            });
            card.addEventListener("mouseleave", function() {
                card.style.setProperty("--tilt-x", "0deg");
                card.style.setProperty("--tilt-y", "0deg");
            });
        })(cards[i]);
    }
}

/* ---- Custom language dropdown ---- */

function setupLangSwitch() {
    var wrap = document.getElementById("lang-switch");
    var btn = document.getElementById("lang-switch-btn");
    var menu = document.getElementById("lang-switch-menu");
    var current = document.getElementById("lang-switch-current");
    if (!wrap || !btn || !menu) return;

    function close() {
        menu.classList.add("hidden");
        btn.setAttribute("aria-expanded", "false");
    }
    function open() {
        menu.classList.remove("hidden");
        btn.setAttribute("aria-expanded", "true");
    }

    btn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (menu.classList.contains("hidden")) open(); else close();
    });

    var options = menu.querySelectorAll("[data-lang]");
    for (var i = 0; i < options.length; i++) {
        options[i].addEventListener("click", function() {
            var lang = this.getAttribute("data-lang");
            DLRP_I18N.setLang(lang);
            close();
        });
    }

    document.addEventListener("click", function(e) {
        if (!wrap.contains(e.target)) close();
    });
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") close();
    });

    DLRP_I18N.onChange(function(lang) {
        current.textContent = lang.toUpperCase();
        var opts = menu.querySelectorAll("[data-lang]");
        for (var j = 0; j < opts.length; j++) {
            opts[j].classList.toggle("active", opts[j].getAttribute("data-lang") === lang);
        }
    });

    // El idioma puede haberse detectado/aplicado ANTES de que este
    // desplegable terminara de montarse (init() de i18n.js arranca en
    // cuanto se carga el script, no espera a DOMContentLoaded), asi
    // que sincronizamos el estado visible ya mismo en vez de esperar
    // a un futuro cambio que quiza no llegue.
    var syncedLang = DLRP_I18N.getLang();
    current.textContent = syncedLang.toUpperCase();
    var initialOpts = menu.querySelectorAll("[data-lang]");
    for (var k = 0; k < initialOpts.length; k++) {
        initialOpts[k].classList.toggle("active", initialOpts[k].getAttribute("data-lang") === syncedLang);
    }
}

/* ---- Menu de usuario (burbuja Discord arriba a la derecha) ---- */

function setupUserMenu() {
    var wrap = document.getElementById("discord-user-menu");
    var chip = document.getElementById("discord-user-chip");
    var dropdown = document.getElementById("discord-user-dropdown");
    if (!wrap || !chip || !dropdown) return;

    chip.addEventListener("click", function(e) {
        e.stopPropagation();
        var isOpen = !dropdown.classList.contains("hidden");
        if (isOpen) closeUserMenu(); else openUserMenu();
    });

    document.addEventListener("click", function(e) {
        if (!wrap.contains(e.target)) closeUserMenu();
    });
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") closeUserMenu();
    });
}

function openUserMenu() {
    document.getElementById("discord-user-dropdown").classList.remove("hidden");
    document.getElementById("discord-user-chip").setAttribute("aria-expanded", "true");
}

function closeUserMenu() {
    document.getElementById("discord-user-dropdown").classList.add("hidden");
    document.getElementById("discord-user-chip").setAttribute("aria-expanded", "false");
}

/* ============================================================
   Panel de administración
   ============================================================ */

document.addEventListener("DOMContentLoaded", function() {
    setupReveals();
    setupTilt();
    setupLangSwitch();
    setupUserMenu();
    restoreSession();

    if (window.DLRP_DISCORD_ERROR) {
        notify("Discord Login", "Something went wrong logging in with Discord. Please try again.");
    }
});

/* ---- Misc ---- */
(function setFooterYear() {
    var el = document.getElementById("footer-year");
    if (el) el.textContent = new Date().getFullYear();
})();