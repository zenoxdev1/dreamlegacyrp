var tabs = ["rrp", "whitelist", "profile", "jobs", "settings"];
var SESSION_KEY = "rrp_session";
function getSessionKey() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { var parsed = JSON.parse(raw); if (parsed && parsed.key) return parsed.key; } catch(e) {}
    return raw;
}

var jobsList = [
    { id: "policeman",      emoji: "👮", name: "Policeman",      desc: "Enforce the law and keep the streets safe.", longDesc: "Patrol the city, respond to emergency calls, manage traffic, and investigate crimes. Maintain order and serve the community." },
    { id: "taxi",           emoji: "🚕", name: "Taxi Driver",    desc: "Drive passengers across Los Santos.", longDesc: "Pick up fares, navigate the city, and provide reliable transportation. Earn tips for good service and quick routes." },
    { id: "dealership",     emoji: "🚗", name: "Dealership",     desc: "Sell and trade vehicles.", longDesc: "Manage vehicle inventory, negotiate sales, and help citizens find the perfect ride. Knowledge of cars is a plus." },
    { id: "ems",            emoji: "🚑", name: "EMS",            desc: "Save lives as an emergency medic.", longDesc: "Respond to medical emergencies, treat injuries, and transport patients to hospitals. Every second counts." },
    { id: "soldier",        emoji: "🎖", name: "Soldier",        desc: "Defend the state as a trained operative.", longDesc: "Undergo combat training, participate in operations, and protect the city from threats. Discipline and teamwork are essential." },
    { id: "pilot",          emoji: "✈",  name: "Pilot",          desc: "Fly aircraft across the state.", longDesc: "Operate planes and helicopters for transport, cargo, and emergency response. A pilot's license is verified." },
    { id: "mechanic",       emoji: "🔧", name: "Mechanic",       desc: "Repair and tune vehicles.", longDesc: "Diagnose issues, perform repairs, and customize vehicles. Keep Los Santos moving from the garage." },
    { id: "more-starters",  emoji: "💡", name: "More Starter Jobs\u2026", desc: "Entry-level roles for new arrivals.", longDesc: "" }
];

var starterJobsList = [
    { id: "trashman",   emoji: "🧹", name: "Trashman",    desc: "Collect waste and keep the city clean.", longDesc: "Drive garbage routes, collect refuse, and maintain sanitation across the city. An honest day's work." },
    { id: "uber",       emoji: "🚘", name: "Uber",        desc: "Ride-share driver for quick fares.", longDesc: "Use your own vehicle to transport passengers around town. Flexible hours, instant pay." },
    { id: "cashier",    emoji: "🧾", name: "Cashier",     desc: "Ring up sales at local stores.", longDesc: "Process transactions, stock shelves, and assist customers. A great way to start your career." },
    { id: "delivery",   emoji: "🚚", name: "Delivery Man", desc: "Deliver goods across the city.", longDesc: "Pick up packages and deliver them promptly. Reliable transportation required." }
];

var allJobNames = {};
function buildJobNameMap() {
    for (var i = 0; i < jobsList.length; i++) allJobNames[jobsList[i].id] = jobsList[i].name;
    for (var i = 0; i < starterJobsList.length; i++) allJobNames[starterJobsList[i].id] = starterJobsList[i].name;
}
buildJobNameMap();

function storageKey(name) { return "rrp_" + name.toLowerCase().replace(/[^a-z0-9]/g, ""); }

// Nota: la función api(path, method, body) ya no vive aquí.
// La implementa assets/js/supabase-client.js llamando a Supabase (RPC),
// que se carga ANTES que este archivo y expone window.api con la
// misma firma que el fetch() original.

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
    api("/api/profile/" + key, "GET").then(function(profile) {
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
    el.innerHTML = '<div class="notif-title">' + title + '</div><div class="notif-msg">' + msg + '</div>';
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
    if (!key) { notify("Not Logged In", "Log in to save your theme preference."); return; }
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
    if (tab === "jobs") { backToJobs(); renderJobsGrid(); }
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

/* ---- Whitelist ---- */

document.getElementById("whitelist-form").addEventListener("submit", function(e) {
    e.preventDefault();
    var data = {
        rpName: document.getElementById("rp-name").value.trim(),
        discordUser: document.getElementById("discord-user").value.trim(),
        psn: document.getElementById("psn").value.trim(),
        password: document.getElementById("password").value,
        story: document.getElementById("story").value.trim(),
        extraInfo: document.getElementById("extra-info").value.trim()
    };
    api("/api/whitelist", "POST", data).then(function() {
        document.getElementById("whitelist-form").reset();
        notify("Whitelisted", "Successfully whitelisted! You can now log in with your RP Name and password.");
        setTab("rrp");
    }).catch(function(err) { notify("Error", err.message); });
});

/* ---- Login / Session ---- */

function openLogin() {
    document.getElementById("login-overlay").classList.remove("hidden");
    document.getElementById("login-error").classList.add("hidden");
    document.getElementById("login-form").reset();
}

function closeLogin() {
    document.getElementById("login-overlay").classList.add("hidden");
}

function doLogin() {
    var username = document.getElementById("login-username").value.trim();
    var password = document.getElementById("login-password").value;
    api("/api/login", "POST", { username: username, password: password }).then(function(res) {
        document.getElementById("login-error").classList.add("hidden");
        closeLogin();
        // El token real lo genera el servidor (Supabase RPC dlrp_login);
        // ya no se deriva del nombre de usuario en el cliente (inseguro).
        localStorage.setItem(SESSION_KEY, JSON.stringify({ key: res.token, username: res.profile.rpName }));
        applyTheme(res.profile.theme || "michael");
        document.getElementById("btn-whitelist").classList.add("hidden");
        document.getElementById("btn-profile").classList.remove("hidden");
        if (res.profile.musicFavorites && res.profile.musicFavorites.length > 0) renderFavorites(res.profile.musicFavorites);
        showProfile(res.profile);
        notify("Welcome", "Logged in as " + res.profile.rpName);
    }).catch(function(err) {
        document.getElementById("login-error").classList.remove("hidden");
    });
}

function restoreSession() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    var session;
    try { session = JSON.parse(raw); } catch(e) { session = { key: raw }; }
    if (!session || !session.key) return;
    api("/api/profile/" + encodeURIComponent(session.key), "GET").then(function(profile) {
        applyTheme(profile.theme || "michael");
        document.getElementById("btn-whitelist").classList.add("hidden");
        document.getElementById("btn-profile").classList.remove("hidden");
        if (profile.musicFavorites && profile.musicFavorites.length > 0) renderFavorites(profile.musicFavorites);
        showProfile(profile);
    }).catch(function() {
        localStorage.removeItem(SESSION_KEY);
    });
}

function showProfile(data) {
    document.getElementById("profile-rpname").textContent = data.rpName;
    document.getElementById("profile-discord").textContent = data.discordUser;
    document.getElementById("profile-psn").textContent = data.psn;
    document.getElementById("profile-story").textContent = data.story;

    var badge = document.getElementById("profile-status-badge");
    var status = data.status || "pending";
    badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    badge.className = "profile-badge " + status;

    var extraRow = document.getElementById("profile-extra-row");
    if (data.extraInfo) {
        document.getElementById("profile-extra").textContent = data.extraInfo;
        extraRow.style.display = "";
    } else { extraRow.style.display = "none"; }

    var jobRow = document.getElementById("profile-job-row");
    if (data.job && allJobNames[data.job]) {
        document.getElementById("profile-job").textContent = allJobNames[data.job];
        jobRow.style.display = "";
    } else { jobRow.style.display = "none"; }

    var bank = data.bank || 0;
    var cash = data.cash || 0;
    document.getElementById("profile-money").textContent = "$" + (bank + cash);

    setTab("profile");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function logout() {
    var key = getSessionKey();
    if (key) api("/api/logout", "POST", { key: key }).catch(function() {});
    localStorage.removeItem(SESSION_KEY);
    document.getElementById("btn-profile").classList.add("hidden");
    document.getElementById("btn-whitelist").classList.remove("hidden");
    document.getElementById("edit-profile-overlay").classList.add("hidden");
    setTab("rrp");
}

/* ---- Edit Profile ---- */

function toggleEditProfile() {
    var overlay = document.getElementById("edit-profile-overlay");
    if (overlay.classList.contains("hidden")) {
        document.getElementById("edit-psn").value = document.getElementById("profile-psn").textContent;
        document.getElementById("edit-story").value = document.getElementById("profile-story").textContent;
        var extra = document.getElementById("profile-extra");
        document.getElementById("edit-extra").value = extra && extra.textContent !== "-" ? extra.textContent : "";
        document.getElementById("edit-profile-error").classList.add("hidden");
        overlay.classList.remove("hidden");
    } else { overlay.classList.add("hidden"); }
}

function closeEditProfile() {
    document.getElementById("edit-profile-overlay").classList.add("hidden");
}

function saveEditProfile() {
    var key = getSessionKey();
    if (!key) { notify("Error", "Not logged in."); return; }
    var data = { key: key };
    var psn = document.getElementById("edit-psn").value.trim();
    var story = document.getElementById("edit-story").value.trim();
    var extra = document.getElementById("edit-extra").value.trim();
    if (psn) data.psn = psn;
    if (story) data.story = story;
    data.extraInfo = extra;
    api("/api/profile/update", "POST", data).then(function(res) {
        closeEditProfile();
        showProfile(res.profile);
        notify("Profile Updated", "Your profile has been saved.");
    }).catch(function(err) {
        document.getElementById("edit-profile-error").textContent = err.message;
        document.getElementById("edit-profile-error").classList.remove("hidden");
    });
}

/* ---- Jobs ---- */

function renderJobCard(job) {
    return '<div class="job-card reveal" onclick="openJobDetail(\'' + job.id + '\')">' +
        '<div class="job-emoji">' + job.emoji + '</div><h3>' + job.name + '</h3><p>' + job.desc + '</p></div>';
}

function renderJobsGrid() {
    var html = "";
    for (var i = 0; i < jobsList.length; i++) html += renderJobCard(jobsList[i]);
    document.getElementById("jobs-grid").innerHTML = html;
}

function openJobDetail(jobId) {
    if (jobId === "more-starters") {
        renderStarterJobsGrid();
        document.getElementById("jobs-grid").classList.add("hidden");
        document.getElementById("job-detail").classList.add("hidden");
        document.getElementById("starter-jobs").classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }
    var job = null;
    for (var i = 0; i < jobsList.length; i++) { if (jobsList[i].id === jobId) { job = jobsList[i]; break; } }
    if (!job) return;
    document.getElementById("job-detail-eyebrow").textContent = job.emoji + " " + job.name;
    document.getElementById("job-detail-title").textContent = job.name;
    document.getElementById("job-detail-desc").textContent = job.longDesc;
    api("/api/jobs/" + jobId, "GET").then(function(res) {
        var people = res.people || [];
        document.getElementById("job-detail-people-heading").textContent = "People with this job (" + people.length + ")";
        if (people.length === 0) {
            document.getElementById("job-people-list").innerHTML = '<p style="color:var(--muted);">No one has this job yet. Be the first!</p>';
        } else {
            var h = "";
            for (var j = 0; j < people.length; j++) h += '<div class="people-entry"><div class="job-emoji">' + job.emoji + '</div><strong>' + people[j] + '</strong><span>' + job.name + '</span></div>';
            document.getElementById("job-people-list").innerHTML = h;
        }
    });
    document.getElementById("job-apply-btn").setAttribute("data-job-id", jobId);
    document.getElementById("jobs-grid").classList.add("hidden");
    document.getElementById("job-detail").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function backToJobs() {
    document.getElementById("jobs-grid").classList.remove("hidden");
    document.getElementById("job-detail").classList.add("hidden");
    document.getElementById("starter-jobs").classList.add("hidden");
    document.getElementById("starter-detail").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function applyForJob() {
    doApply(document.getElementById("job-apply-btn").getAttribute("data-job-id"));
}

function renderStarterJobsGrid() {
    var html = "";
    for (var i = 0; i < starterJobsList.length; i++) {
        html += '<div class="job-card reveal" onclick="openStarterDetail(\'' + starterJobsList[i].id + '\')">' +
            '<div class="job-emoji">' + starterJobsList[i].emoji + '</div><h3>' + starterJobsList[i].name + '</h3><p>' + starterJobsList[i].desc + '</p></div>';
    }
    html += '<div class="job-card reveal" onclick="window.open(\'https://discord.gg/RAephXGHg6\',\'_blank\')" style="border-color:rgba(88,101,242,.3);">' +
        '<div class="job-emoji" style="font-size:32px;">💬</div><h3>Suggest More</h3><p>Suggest new starter jobs on the official Discord.</p></div>';
    document.getElementById("starter-jobs-grid").innerHTML = html;
}

function openStarterDetail(jobId) {
    var job = null;
    for (var i = 0; i < starterJobsList.length; i++) { if (starterJobsList[i].id === jobId) { job = starterJobsList[i]; break; } }
    if (!job) return;
    document.getElementById("starter-detail-eyebrow").textContent = job.emoji + " " + job.name;
    document.getElementById("starter-detail-title").textContent = job.name;
    document.getElementById("starter-detail-desc").textContent = job.longDesc;
    api("/api/jobs/" + jobId, "GET").then(function(res) {
        var people = res.people || [];
        document.getElementById("starter-detail-people-heading").textContent = "People with this job (" + people.length + ")";
        if (people.length === 0) {
            document.getElementById("starter-people-list").innerHTML = '<p style="color:var(--muted);">No one has this job yet. Be the first!</p>';
        } else {
            var h = "";
            for (var j = 0; j < people.length; j++) h += '<div class="people-entry"><div class="job-emoji">' + job.emoji + '</div><strong>' + people[j] + '</strong><span>' + job.name + '</span></div>';
            document.getElementById("starter-people-list").innerHTML = h;
        }
    });
    document.getElementById("starter-apply-btn").setAttribute("data-job-id", jobId);
    document.getElementById("starter-jobs-grid").classList.add("hidden");
    document.getElementById("starter-detail").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function backToStarterJobs() {
    document.getElementById("starter-jobs-grid").classList.remove("hidden");
    document.getElementById("starter-detail").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function doApply(jobId) {
    var name = prompt("Enter your RP Name to apply for this job:");
    if (!name || name.trim() === "") return;
    api("/api/jobs/apply", "POST", { rpName: name.trim(), jobId: jobId }).then(function() {
        var jobName = allJobNames[jobId] || jobId;
        notify("Job Center", jobName + " job has been applied to, waiting for approval.");
        if (!document.getElementById("jobs-grid").classList.contains("hidden")) {
            backToJobs(); renderJobsGrid();
        } else if (!document.getElementById("starter-detail").classList.contains("hidden")) {
            openStarterDetail(document.getElementById("starter-apply-btn").getAttribute("data-job-id"));
        } else {
            var cid = document.getElementById("job-apply-btn").getAttribute("data-job-id");
            if (cid) openJobDetail(cid);
        }
    }).catch(function(err) { notify("Error", err.message); });
}

function applyForStarterJob() {
    doApply(document.getElementById("starter-apply-btn").getAttribute("data-job-id"));
}

/* ---- Reveal & Tilt ---- */

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

document.addEventListener("DOMContentLoaded", function() {
    setupReveals();
    setupTilt();
    restoreSession();
});

/* ---- Whiplist Form ---- */

/* ---- Misc ---- */
(function setFooterYear() {
    var el = document.getElementById("footer-year");
    if (el) el.textContent = new Date().getFullYear();
})();
