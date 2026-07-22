/* ============================================================
   Dream Legacy RP — admin.dreamlegacyrp.xyz
   ------------------------------------------------------------
   Panel de administracion, extraido de la landing a su propio
   subdominio. Reutiliza session.js (mismo token que panel/hq)
   y supabase-client.js (las mismas rutas /api/admin/* que ya
   existian).
   ============================================================ */

function notify(title, msg) {
    console.log("[" + title + "] " + msg);
    alert(title + ": " + msg);
}

function escapeHtml(str) {
    if (typeof str !== "string") return str;
    var d = document.createElement("div");
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}

var DLRP_IS_ADMIN = false;
var ADMIN_APPLICATIONS = [];
var ADMIN_FILTER = "pending";

function checkAdminStatus() {
    var key = getSessionKey();
    if (!key) { showAdminNoAccess("Log in from the main site first, then come back here."); return; }
    fetch("https://dreamlegacyrp.xyz/api/admin/whoami", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key })
    }).then(function(r) {
        return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || "Request failed"); return d; });
    }).then(function(res) {
        DLRP_IS_ADMIN = !!res.isAdmin;
        if (!DLRP_IS_ADMIN) { showAdminNoAccess("Your account doesn't have staff access."); return; }
        document.getElementById("admin-no-access").classList.add("hidden");
        document.getElementById("admin-app").classList.remove("hidden");
        loadAdminStats();
        loadAdminApplications();
    }).catch(function() { showAdminNoAccess("Could not verify your access."); });
}

function showAdminNoAccess(msg) {
    document.getElementById("admin-no-access-msg").textContent = msg;
    document.getElementById("admin-no-access").classList.remove("hidden");
    document.getElementById("admin-app").classList.add("hidden");
}

function loadAdminStats() {
    if (!DLRP_IS_ADMIN) return;
    var key = getSessionKey();
    if (!key) return;
    api("/api/admin/stats", "POST", { key: key }).then(function(stats) {
        document.getElementById("admin-stat-pending").textContent = stats.pending;
        document.getElementById("admin-stat-approved").textContent = stats.approved;
        document.getElementById("admin-stat-denied").textContent = stats.denied;
        document.getElementById("admin-stat-total").textContent = stats.total;
        document.getElementById("admin-stat-inguild").textContent = stats.inGuild;
    }).catch(function(err) { notify("Admin", err.message); });
}

function loadAdminApplications() {
    if (!DLRP_IS_ADMIN) return;
    var key = getSessionKey();
    if (!key) return;
    document.getElementById("admin-loading").classList.remove("hidden");
    document.getElementById("admin-list").innerHTML = "";
    document.getElementById("admin-empty-msg").classList.add("hidden");

    api("/api/admin/list", "POST", { key: key, status: null }).then(function(res) {
        ADMIN_APPLICATIONS = res.applications || [];
        renderAdminList();
    }).catch(function(err) {
        notify("Admin", err.message);
        document.getElementById("admin-loading").classList.add("hidden");
    });
}

function setAdminFilter(filter) {
    ADMIN_FILTER = filter;
    var btns = document.querySelectorAll(".admin-filter-btn");
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-filter") === filter);
    }
    renderAdminList();
}

function formatAdminDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function renderAdminList() {
    document.getElementById("admin-loading").classList.add("hidden");
    var list = document.getElementById("admin-list");
    var emptyMsg = document.getElementById("admin-empty-msg");
    var search = (document.getElementById("admin-search").value || "").toLowerCase().trim();

    var filtered = ADMIN_APPLICATIONS.filter(function(a) {
        if (ADMIN_FILTER !== "all" && a.status !== ADMIN_FILTER) return false;
        if (!search) return true;
        var haystack = ((a.rpName || "") + " " + (a.discordUsername || "") + " " + (a.psn || "")).toLowerCase();
        return haystack.indexOf(search) !== -1;
    });

    if (filtered.length === 0) {
        list.innerHTML = "";
        emptyMsg.classList.remove("hidden");
        return;
    }
    emptyMsg.classList.add("hidden");

    var html = "";
    for (var i = 0; i < filtered.length; i++) {
        html += adminCardHtml(filtered[i]);
    }
    list.innerHTML = html;
}

function adminCardHtml(a) {
    var statusClass = a.status === "approved" ? "approved" : (a.status === "denied" ? "denied" : "pending");
    var guildBadge = a.discordInGuild
        ? '<span class="admin-mini-badge in-guild">' + DLRP_I18N.t("admin.inGuild", "In server") + '</span>'
        : '<span class="admin-mini-badge not-in-guild">' + DLRP_I18N.t("admin.notInGuild2", "Not in server") + '</span>';
    var avatar = a.discordAvatar ? escapeHtml(a.discordAvatar) : "";
    var story = escapeHtml(a.story || "").replace(/\n/g, "<br>");
    var extra = a.extraInfo ? escapeHtml(a.extraInfo).replace(/\n/g, "<br>") : null;

    var actions = "";
    if (a.status === "pending") {
        actions += '<button type="button" class="btn admin-action-btn approve" onclick="setApplicationStatus(\'' + a.id + '\',\'approved\')">' +
            DLRP_I18N.t("admin.approve", "Approve") + '</button>';
        actions += '<button type="button" class="btn admin-action-btn deny" onclick="setApplicationStatus(\'' + a.id + '\',\'denied\')">' +
            DLRP_I18N.t("admin.deny", "Deny") + '</button>';
    } else {
        actions += '<button type="button" class="btn admin-action-btn reset" onclick="setApplicationStatus(\'' + a.id + '\',\'pending\')">' +
            DLRP_I18N.t("admin.resetPending", "Reset to pending") + '</button>';
    }

    var decidedLine = "";
    if (a.status !== "pending" && a.decidedByUsername) {
        decidedLine = '<div class="admin-card-decided">' +
            DLRP_I18N.t("admin.decidedBy", "Decided by") + ' <strong>' + escapeHtml(a.decidedByUsername) + '</strong>' +
            (a.decidedAt ? ' &middot; ' + formatAdminDate(a.decidedAt) : '') +
            (a.status === "denied" && a.denyReason ? '<br><span class="admin-card-reason">' + DLRP_I18N.t("admin.reason", "Reason") + ': ' + escapeHtml(a.denyReason) + '</span>' : '') +
            '</div>';
    }

    var moneyEditor = "";
    if (a.status === "approved") {
        moneyEditor = '<div class="admin-money-editor">' +
            '<span class="admin-money-label">' + DLRP_I18N.t("admin.money", "Money") + '</span>' +
            '<input type="number" min="0" class="admin-money-input" id="admin-bank-' + a.id + '" value="' + (a.bank || 0) + '" placeholder="' + DLRP_I18N.t("admin.bank", "Bank") + '">' +
            '<input type="number" min="0" class="admin-money-input" id="admin-cash-' + a.id + '" value="' + (a.cash || 0) + '" placeholder="' + DLRP_I18N.t("admin.cash", "Cash") + '">' +
            '<button type="button" class="btn small admin-money-save" onclick="saveAdminMoney(\'' + a.id + '\')">' + DLRP_I18N.t("admin.save", "Save") + '</button>' +
            '</div>';
    }

    return '' +
        '<div class="admin-card" data-id="' + a.id + '">' +
            '<div class="admin-card-head">' +
                '<img class="admin-card-avatar" src="' + avatar + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
                '<div class="admin-card-id">' +
                    '<strong>' + escapeHtml(a.rpName || "-") + '</strong>' +
                    '<span>@' + escapeHtml(a.discordUsername || "-") + '</span>' +
                '</div>' +
                '<span class="profile-badge ' + statusClass + ' admin-card-status">' + escapeHtml(a.status) + '</span>' +
            '</div>' +
            '<div class="admin-card-meta">' +
                '<span>' + DLRP_I18N.t("whitelist.psn", "PSN") + ': <strong>' + escapeHtml(a.psn || "-") + '</strong></span>' +
                guildBadge +
                '<span>' + DLRP_I18N.t("admin.applied", "Applied") + ': ' + formatAdminDate(a.appliedAt) + '</span>' +
            '</div>' +
            '<details class="admin-card-story">' +
                '<summary>' + DLRP_I18N.t("whitelist.story", "Story") + '</summary>' +
                '<p>' + story + '</p>' +
                (extra ? '<p class="admin-card-extra"><strong>' + DLRP_I18N.t("whitelist.extraInfo", "More Character Info") + ':</strong><br>' + extra + '</p>' : '') +
            '</details>' +
            '<div class="admin-card-actions">' + actions + '</div>' +
            moneyEditor +
            decidedLine +
        '</div>';
}

function saveAdminMoney(profileId) {
    var key = getSessionKey();
    if (!key) return;
    var bank = parseInt(document.getElementById("admin-bank-" + profileId).value, 10) || 0;
    var cash = parseInt(document.getElementById("admin-cash-" + profileId).value, 10) || 0;

    api("/api/admin/set-money", "POST", { key: key, profileId: profileId, bank: bank, cash: cash }).then(function() {
        notify("Admin", "Money updated.");
    }).catch(function(err) {
        notify("Admin", err.message);
    });
}

function setApplicationStatus(profileId, status) {
    var key = getSessionKey();
    if (!key) return;

    var reason = null;
    if (status === "denied") {
        reason = window.prompt(DLRP_I18N.t("admin.reasonPrompt", "Reason for denying (optional, included in their DM):"), "");
        if (reason === null) return; // cancelado
    }

    api("/api/admin/set-status", "POST", { key: key, profileId: profileId, status: status, reason: reason }).then(function() {
        notify("Admin", "Application updated.");
        loadAdminStats();
        loadAdminApplications();
    }).catch(function(err) {
        notify("Admin", err.message);
    });
}

/* ---- Sub-pestañas del panel de administración ---- */

var ADMIN_SUBTAB = "applications";

function setAdminSubtab(tab) {
    ADMIN_SUBTAB = tab;
    var btns = document.querySelectorAll(".admin-subtab-btn");
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-subtab") === tab);
    }
    document.getElementById("admin-section-applications").classList.toggle("hidden", tab !== "applications");
    document.getElementById("admin-section-players").classList.toggle("hidden", tab !== "players");
    document.getElementById("admin-section-reports").classList.toggle("hidden", tab !== "reports");
    document.getElementById("admin-section-idrequests").classList.toggle("hidden", tab !== "idrequests");
    document.getElementById("admin-section-jobapps").classList.toggle("hidden", tab !== "jobapps");
    document.getElementById("admin-section-licenses").classList.toggle("hidden", tab !== "licenses");

    if (tab === "players" && ADMIN_PLAYERS.length === 0) loadAdminPlayers();
    if (tab === "reports" && ADMIN_REPORTS.length === 0) loadAdminReports();
    if (tab === "idrequests" && ADMIN_ID_REQUESTS.length === 0) loadAdminIdRequests();
    if (tab === "jobapps" && ADMIN_JOB_APPS.length === 0) loadAdminJobApps();
    if (tab === "licenses" && ADMIN_LICENSES.length === 0) loadAdminLicenses();
}

/* ---- Jugadores (toda la info de su perfil/telefono) ---- */

var ADMIN_PLAYERS = [];

function loadAdminPlayers() {
    if (!DLRP_IS_ADMIN) return;
    var key = getSessionKey();
    if (!key) return;
    var search = (document.getElementById("admin-player-search") || {}).value || "";
    document.getElementById("admin-players-loading").classList.remove("hidden");
    document.getElementById("admin-players-list").innerHTML = "";
    document.getElementById("admin-players-empty").classList.add("hidden");

    api("/api/admin/players", "POST", { key: key, search: search }).then(function(res) {
        ADMIN_PLAYERS = res.players || [];
        renderAdminPlayersList();
    }).catch(function(err) {
        notify("Admin", err.message);
        document.getElementById("admin-players-loading").classList.add("hidden");
    });
}

function renderAdminPlayersList() {
    document.getElementById("admin-players-loading").classList.add("hidden");
    var list = document.getElementById("admin-players-list");
    var empty = document.getElementById("admin-players-empty");

    if (ADMIN_PLAYERS.length === 0) {
        list.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    var html = "";
    for (var i = 0; i < ADMIN_PLAYERS.length; i++) {
        var p = ADMIN_PLAYERS[i];
        html += '<div class="admin-card">' +
            '<div class="admin-card-head">' +
            (p.discordAvatar ? '<img class="admin-card-avatar" src="' + escapeHtml(p.discordAvatar) + '" alt="">' : '<div class="admin-card-avatar"></div>') +
            '<div class="admin-card-id"><strong>' + escapeHtml(p.rpName || p.discordUsername || "-") + '</strong><span>@' + escapeHtml(p.discordUsername || "-") + '</span></div>' +
            (p.isBanned ? '<span class="admin-mini-badge not-in-guild">' + DLRP_I18N.t("admin.banned", "Banned") + '</span>' : '') +
            '</div>' +
            '<div class="admin-card-meta">' +
                '<span>' + DLRP_I18N.t("admin.money", "Money") + ': <strong>$' + ((p.bank || 0) + (p.cash || 0)).toLocaleString() + '</strong></span>' +
                '<span>' + DLRP_I18N.t("dreamos.number", "Number") + ': <strong>' + escapeHtml(p.phoneNumber || "-") + '</strong></span>' +
                '<span>' + DLRP_I18N.t("panel.jobs", "Job") + ': <strong>' + escapeHtml(p.job || "-") + '</strong></span>' +
            '</div>' +
            '<div class="admin-card-actions">' +
                '<button type="button" class="btn admin-action-btn" onclick="openAdminPlayerDetail(\'' + p.id + '\')">' + DLRP_I18N.t("admin.viewDetails", "View full details") + '</button>' +
                (p.isBanned
                    ? '<button type="button" class="btn admin-action-btn approve" onclick="setPlayerBan(\'' + p.id + '\', false)">' + DLRP_I18N.t("admin.unban", "Unban") + '</button>'
                    : '<button type="button" class="btn admin-action-btn deny" onclick="setPlayerBan(\'' + p.id + '\', true)">' + DLRP_I18N.t("admin.ban", "Ban") + '</button>') +
            '</div>' +
            '</div>';
    }
    list.innerHTML = html;
}

function setPlayerBan(profileId, banned) {
    var key = getSessionKey();
    if (!key) return;
    var reason = null;
    if (banned) {
        reason = window.prompt(DLRP_I18N.t("admin.banReasonPrompt", "Reason for the ban (optional):"), "");
        if (reason === null) return;
    }
    api("/api/admin/set-ban", "POST", { key: key, profileId: profileId, banned: banned, reason: reason }).then(function() {
        notify("Admin", banned ? "Player banned." : "Player unbanned.");
        loadAdminPlayers();
    }).catch(function(err) { notify("Admin", err.message); });
}

function openAdminPlayerDetail(profileId) {
    var key = getSessionKey();
    if (!key) return;
    api("/api/admin/player-detail", "POST", { key: key, profileId: profileId }).then(function(p) {
        renderAdminPlayerDetail(p);
        document.querySelector("#admin-section-players .admin-filter-bar").classList.add("hidden");
        document.getElementById("admin-players-list").classList.add("hidden");
        document.getElementById("admin-players-empty").classList.add("hidden");
        document.getElementById("admin-player-detail").classList.remove("hidden");
    }).catch(function(err) { notify("Admin", err.message); });
}

function closeAdminPlayerDetail() {
    document.querySelector("#admin-section-players .admin-filter-bar").classList.remove("hidden");
    document.getElementById("admin-players-list").classList.remove("hidden");
    document.getElementById("admin-player-detail").classList.add("hidden");
}

function adminDetailRow(label, value) {
    if (value === undefined || value === null || value === "") value = "-";
    return '<div class="profile-row"><span class="profile-label">' + escapeHtml(label) + '</span><span>' + escapeHtml(String(value)) + '</span></div>';
}

function renderAdminPlayerDetail(p) {
    var pd = p.phoneData || {};
    var html = '<div class="card reveal" style="margin-bottom:16px;"><div class="card-inner">' +
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">' +
        (p.discordAvatar ? '<img src="' + escapeHtml(p.discordAvatar) + '" style="width:56px;height:56px;border-radius:50%;object-fit:cover;">' : '') +
        '<div><h3 style="margin-bottom:2px;">' + escapeHtml(p.rpName || p.discordUsername || "-") + '</h3><span style="color:var(--muted);font-size:13px;">@' + escapeHtml(p.discordUsername || "-") + '</span></div>' +
        '</div>' +
        '<div class="profile-grid">' +
        adminDetailRow(DLRP_I18N.t("whitelist.psn", "PSN"), p.psn) +
        adminDetailRow(DLRP_I18N.t("profile.status", "Status"), p.status) +
        adminDetailRow(DLRP_I18N.t("admin.money", "Money") + " (Bank)", "$" + (p.bank || 0).toLocaleString()) +
        adminDetailRow(DLRP_I18N.t("admin.cash", "Cash"), "$" + (p.cash || 0).toLocaleString()) +
        adminDetailRow(DLRP_I18N.t("dreamos.number", "Number"), p.phoneNumber) +
        adminDetailRow(DLRP_I18N.t("dreamos.phone", "Phone"), pd.purchasedPhone) +
        adminDetailRow(DLRP_I18N.t("panel.jobs", "Job"), p.job) +
        '</div>' +
        (p.story ? '<div class="profile-row full" style="margin-top:10px;"><span class="profile-label">' + DLRP_I18N.t("whitelist.story", "Story") + '</span><p>' + escapeHtml(p.story) + '</p></div>' : '') +
        '</div></div>';

    html += adminDetailSection(DLRP_I18N.t("admin.vehicles", "Vehicles"), pd.vehicles, function(v) { return (v.name || v.model || "Vehicle") + (v.plate ? " · " + v.plate : ""); });
    html += adminDetailSection(DLRP_I18N.t("admin.properties", "Properties"), pd.properties, function(v) { return v.name || v.address || "Property"; });
    html += adminDetailSection(DLRP_I18N.t("admin.businesses", "Businesses"), pd.businesses, function(v) { return v.name || "Business"; });
    html += adminDetailSection(DLRP_I18N.t("admin.inventory", "Inventory"), pd.inventory, function(v) { return (v.name || "Item") + (v.qty ? " x" + v.qty : ""); });

    if (pd.idInfo) {
        html += '<div class="card reveal" style="margin-bottom:16px;"><div class="card-inner">' +
            '<h3 style="margin-bottom:10px;">' + DLRP_I18N.t("admin.govId", "Government ID") + '</h3>' +
            '<div class="profile-grid">' +
            adminDetailRow("Name", pd.idInfo.name) + adminDetailRow("DOB", pd.idInfo.dob) + adminDetailRow("ID #", pd.idInfo.id || pd.idInfo.number) +
            '</div></div></div>';
    }

    if (pd.bio || pd.pfp) {
        html += '<div class="card reveal" style="margin-bottom:16px;"><div class="card-inner">' +
            '<h3 style="margin-bottom:10px;">' + DLRP_I18N.t("admin.dreamgramProfile", "DreamGram Profile") + '</h3>' +
            (pd.pfp ? '<img src="' + escapeHtml(pd.pfp) + '" style="width:56px;height:56px;border-radius:50%;object-fit:cover;margin-bottom:8px;">' : '') +
            '<p style="color:var(--muted);">' + escapeHtml(pd.bio || "-") + '</p>' +
            '</div></div>';
    }

    html += '<div class="card reveal" style="margin-bottom:16px;"><div class="card-inner">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<h3>Game Stats (mpstats.json)</h3>' +
        '<button type="button" class="btn small" onclick="loadPlayerGameStats(\'' + escapeHtml(p.psn || "") + '\')">Load</button>' +
        '</div><div id="player-game-stats-area"><p style="color:var(--muted);font-size:12px;">Click Load to fetch this player\'s raw game stats.</p></div>' +
        '</div></div>';

    document.getElementById("admin-player-detail-content").innerHTML = html;
}

function adminDetailSection(title, items, labelFn) {
    if (!items || !items.length) return "";
    var rows = "";
    for (var i = 0; i < items.length; i++) {
        rows += '<div class="profile-row full">' + escapeHtml(labelFn(items[i])) + '</div>';
    }
    return '<div class="card reveal" style="margin-bottom:16px;"><div class="card-inner"><h3 style="margin-bottom:10px;">' + escapeHtml(title) + ' (' + items.length + ')</h3><div class="profile-grid">' + rows + '</div></div></div>';
}

/* ---- Reportes ---- */

var ADMIN_REPORTS = [];
var ADMIN_REPORT_FILTER = "open";

function setReportFilter(filter) {
    ADMIN_REPORT_FILTER = filter;
    var btns = document.querySelectorAll('[data-report-filter]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-report-filter") === filter);
    }
    loadAdminReports();
}

function loadAdminReports() {
    if (!DLRP_IS_ADMIN) return;
    var key = getSessionKey();
    if (!key) return;
    document.getElementById("admin-reports-loading").classList.remove("hidden");
    document.getElementById("admin-reports-list").innerHTML = "";
    document.getElementById("admin-reports-empty").classList.add("hidden");

    var status = ADMIN_REPORT_FILTER === "all" ? null : ADMIN_REPORT_FILTER;
    api("/api/admin/reports", "POST", { key: key, status: status }).then(function(res) {
        ADMIN_REPORTS = res.reports || [];
        renderAdminReportsList();
    }).catch(function(err) {
        notify("Admin", err.message);
        document.getElementById("admin-reports-loading").classList.add("hidden");
    });
}

function renderAdminReportsList() {
    document.getElementById("admin-reports-loading").classList.add("hidden");
    var list = document.getElementById("admin-reports-list");
    var empty = document.getElementById("admin-reports-empty");

    if (ADMIN_REPORTS.length === 0) {
        list.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    var html = "";
    for (var i = 0; i < ADMIN_REPORTS.length; i++) {
        var r = ADMIN_REPORTS[i];
        html += '<div class="admin-card">' +
            '<div class="admin-card-head">' +
            '<div class="admin-card-id"><strong>' + escapeHtml(r.reporterName) + '</strong>' +
            (r.reportedName ? '<span>' + DLRP_I18N.t("admin.reportAbout", "About: ") + escapeHtml(r.reportedName) + '</span>' : '') +
            '</div>' +
            '<span class="admin-mini-badge ' + (r.category === "bug" ? "in-guild" : "not-in-guild") + '">' + escapeHtml(r.category) + '</span>' +
            '</div>' +
            '<div class="admin-card-meta"><span>' + formatAdminDate(r.createdAt) + '</span></div>' +
            '<p style="color:var(--text);margin-bottom:14px;white-space:pre-wrap;">' + escapeHtml(r.message) + '</p>' +
            (r.status === "open"
                ? '<div class="admin-card-actions">' +
                    '<button type="button" class="btn admin-action-btn approve" onclick="resolveReport(\'' + r.id + '\',\'resolved\')">' + DLRP_I18N.t("admin.markResolved", "Mark resolved") + '</button>' +
                    '<button type="button" class="btn admin-action-btn deny" onclick="resolveReport(\'' + r.id + '\',\'dismissed\')">' + DLRP_I18N.t("admin.dismiss", "Dismiss") + '</button>' +
                  '</div>'
                : '<div class="admin-card-decided">' + DLRP_I18N.t("admin.decidedBy", "Decided by") + ' <strong>' + escapeHtml(r.resolvedByUsername || "-") + '</strong></div>') +
            '</div>';
    }
    list.innerHTML = html;
}

function resolveReport(reportId, status) {
    var key = getSessionKey();
    if (!key) return;
    api("/api/admin/resolve-report", "POST", { key: key, reportId: reportId, status: status }).then(function() {
        notify("Admin", "Report updated.");
        loadAdminReports();
    }).catch(function(err) { notify("Admin", err.message); });
}

/* ---- Solicitudes de DNI ---- */

var ADMIN_ID_REQUESTS = [];
var ADMIN_IDREQ_FILTER = "pending";

function setIdRequestFilter(filter) {
    ADMIN_IDREQ_FILTER = filter;
    var btns = document.querySelectorAll('[data-idreq-filter]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-idreq-filter") === filter);
    }
    loadAdminIdRequests();
}

function loadAdminIdRequests() {
    if (!DLRP_IS_ADMIN) return;
    var key = getSessionKey();
    if (!key) return;
    document.getElementById("admin-idreq-loading").classList.remove("hidden");
    document.getElementById("admin-idreq-list").innerHTML = "";
    document.getElementById("admin-idreq-empty").classList.add("hidden");

    var status = ADMIN_IDREQ_FILTER === "all" ? null : ADMIN_IDREQ_FILTER;
    api("/api/admin/id-requests", "POST", { key: key, status: status }).then(function(res) {
        ADMIN_ID_REQUESTS = res.requests || [];
        renderAdminIdRequestsList();
    }).catch(function(err) {
        notify("Admin", err.message);
        document.getElementById("admin-idreq-loading").classList.add("hidden");
    });
}

function renderAdminIdRequestsList() {
    document.getElementById("admin-idreq-loading").classList.add("hidden");
    var list = document.getElementById("admin-idreq-list");
    var empty = document.getElementById("admin-idreq-empty");

    if (ADMIN_ID_REQUESTS.length === 0) {
        list.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    var html = "";
    for (var i = 0; i < ADMIN_ID_REQUESTS.length; i++) {
        var r = ADMIN_ID_REQUESTS[i];
        html += '<div class="admin-card">' +
            '<div class="admin-card-head">' +
            (r.discordAvatar ? '<img class="admin-card-avatar" src="' + escapeHtml(r.discordAvatar) + '" alt="">' : '<div class="admin-card-avatar"></div>') +
            '<div class="admin-card-id"><strong>' + escapeHtml(r.rpName || r.discordUsername || "-") + '</strong><span>@' + escapeHtml(r.discordUsername || "-") + '</span></div>' +
            '</div>' +
            '<div class="admin-card-meta">' +
                '<span>Name: <strong>' + escapeHtml(r.fullName) + '</strong></span>' +
                '<span>DOB: <strong>' + escapeHtml(r.dob) + '</strong></span>' +
                '<span>POB: <strong>' + escapeHtml(r.pob || "-") + '</strong></span>' +
                '<span>Gender: <strong>' + escapeHtml(r.gender || "-") + '</strong></span>' +
                '<span>PSN: <strong>' + escapeHtml(r.psn || "-") + '</strong></span>' +
            '</div>' +
            (r.status === "pending"
                ? '<div class="admin-card-actions">' +
                    '<button type="button" class="btn admin-action-btn approve" onclick="decideIdRequest(\'' + r.id + '\',\'approved\')">' + DLRP_I18N.t("admin.approve", "Approve") + '</button>' +
                    '<button type="button" class="btn admin-action-btn deny" onclick="decideIdRequest(\'' + r.id + '\',\'denied\')">' + DLRP_I18N.t("admin.deny", "Deny") + '</button>' +
                  '</div>'
                : '<div class="admin-card-decided">' + DLRP_I18N.t("admin.decidedBy", "Decided by") + ' <strong>' + escapeHtml(r.decidedByUsername || "-") + '</strong></div>') +
            '</div>';
    }
    list.innerHTML = html;
}

function decideIdRequest(requestId, status) {
    var key = getSessionKey();
    if (!key) return;
    api("/api/admin/decide-id-request", "POST", { key: key, requestId: requestId, status: status }).then(function() {
        notify("Admin", "ID request updated.");
        loadAdminIdRequests();
    }).catch(function(err) { notify("Admin", err.message); });
}

/* ---- Solicitudes de empleo ---- */

var ADMIN_JOB_APPS = [];
var ADMIN_JOBAPP_FILTER = "pending";

function setJobAppFilter(filter) {
    ADMIN_JOBAPP_FILTER = filter;
    var btns = document.querySelectorAll('[data-jobapp-filter]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-jobapp-filter") === filter);
    }
    loadAdminJobApps();
}

function loadAdminJobApps() {
    if (!DLRP_IS_ADMIN) return;
    var key = getSessionKey();
    if (!key) return;
    document.getElementById("admin-jobapp-loading").classList.remove("hidden");
    document.getElementById("admin-jobapp-list").innerHTML = "";
    document.getElementById("admin-jobapp-empty").classList.add("hidden");

    var status = ADMIN_JOBAPP_FILTER === "all" ? null : ADMIN_JOBAPP_FILTER;
    api("/api/admin/job-applications", "POST", { key: key, status: status }).then(function(res) {
        ADMIN_JOB_APPS = res.applications || [];
        renderAdminJobAppsList();
    }).catch(function(err) {
        notify("Admin", err.message);
        document.getElementById("admin-jobapp-loading").classList.add("hidden");
    });
}

function renderAdminJobAppsList() {
    document.getElementById("admin-jobapp-loading").classList.add("hidden");
    var list = document.getElementById("admin-jobapp-list");
    var empty = document.getElementById("admin-jobapp-empty");

    if (ADMIN_JOB_APPS.length === 0) {
        list.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    var html = "";
    for (var i = 0; i < ADMIN_JOB_APPS.length; i++) {
        var a = ADMIN_JOB_APPS[i];
        html += '<div class="admin-card">' +
            '<div class="admin-card-head">' +
            (a.discordAvatar ? '<img class="admin-card-avatar" src="' + escapeHtml(a.discordAvatar) + '" alt="">' : '<div class="admin-card-avatar"></div>') +
            '<div class="admin-card-id"><strong>' + escapeHtml(a.rpName || a.discordUsername || "-") + '</strong><span>@' + escapeHtml(a.discordUsername || "-") + '</span></div>' +
            '</div>' +
            '<div class="admin-card-meta"><span>Applying for: <strong>' + escapeHtml(a.jobName) + '</strong></span><span>' + formatAdminDate(a.createdAt) + '</span></div>' +
            (a.status === "pending"
                ? '<div class="admin-card-actions">' +
                    '<button type="button" class="btn admin-action-btn approve" onclick="decideJobApp(\'' + a.id + '\',\'approved\')">' + DLRP_I18N.t("admin.approve", "Approve") + '</button>' +
                    '<button type="button" class="btn admin-action-btn deny" onclick="decideJobApp(\'' + a.id + '\',\'denied\')">' + DLRP_I18N.t("admin.deny", "Deny") + '</button>' +
                  '</div>'
                : '<div class="admin-card-decided">' + DLRP_I18N.t("admin.decidedBy", "Decided by") + ' <strong>' + escapeHtml(a.decidedByUsername || "-") + '</strong></div>') +
            '</div>';
    }
    list.innerHTML = html;
}

function decideJobApp(applicationId, status) {
    var key = getSessionKey();
    if (!key) return;
    api("/api/admin/decide-job-application", "POST", { key: key, applicationId: applicationId, status: status }).then(function() {
        notify("Admin", "Job application updated.");
        loadAdminJobApps();
    }).catch(function(err) { notify("Admin", err.message); });
}


/* ---- Permisos ---- */

var ADMIN_LICENSES = [];
var ADMIN_LICENSE_FILTER = "pending";

function setLicenseFilter(filter) {
    ADMIN_LICENSE_FILTER = filter;
    var btns = document.querySelectorAll('[data-license-filter]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].getAttribute("data-license-filter") === filter);
    }
    loadAdminLicenses();
}

function loadAdminLicenses() {
    if (!DLRP_IS_ADMIN) return;
    var key = getSessionKey();
    if (!key) return;
    document.getElementById("admin-license-loading").classList.remove("hidden");
    document.getElementById("admin-license-list").innerHTML = "";
    document.getElementById("admin-license-empty").classList.add("hidden");

    var status = ADMIN_LICENSE_FILTER === "all" ? null : ADMIN_LICENSE_FILTER;
    api("/api/admin/license-requests", "POST", { key: key, status: status }).then(function(res) {
        ADMIN_LICENSES = res.requests || [];
        renderAdminLicensesList();
    }).catch(function(err) {
        notify("Admin", err.message);
        document.getElementById("admin-license-loading").classList.add("hidden");
    });
}

function renderAdminLicensesList() {
    document.getElementById("admin-license-loading").classList.add("hidden");
    var list = document.getElementById("admin-license-list");
    var empty = document.getElementById("admin-license-empty");

    if (ADMIN_LICENSES.length === 0) {
        list.innerHTML = "";
        empty.classList.remove("hidden");
        return;
    }
    empty.classList.add("hidden");

    var html = "";
    for (var i = 0; i < ADMIN_LICENSES.length; i++) {
        var r = ADMIN_LICENSES[i];
        html += '<div class="admin-card">' +
            '<div class="admin-card-head">' +
            (r.discordAvatar ? '<img class="admin-card-avatar" src="' + escapeHtml(r.discordAvatar) + '" alt="">' : '<div class="admin-card-avatar"></div>') +
            '<div class="admin-card-id"><strong>' + escapeHtml(r.rpName || r.discordUsername || "-") + '</strong><span>@' + escapeHtml(r.discordUsername || "-") + '</span></div>' +
            '</div>' +
            '<div class="admin-card-meta"><span>License: <strong>' + escapeHtml(r.licenseType.toUpperCase()) + '</strong></span><span>' + formatAdminDate(r.createdAt) + '</span></div>' +
            (r.status === "pending"
                ? '<div class="admin-card-actions">' +
                    '<button type="button" class="btn admin-action-btn approve" onclick="decideLicense(\'' + r.id + '\',\'approved\')">Approve</button>' +
                    '<button type="button" class="btn admin-action-btn deny" onclick="decideLicense(\'' + r.id + '\',\'denied\')">Deny</button>' +
                  '</div>'
                : '<div class="admin-card-decided">Decided by <strong>' + escapeHtml(r.decidedByUsername || "-") + '</strong></div>') +
            '</div>';
    }
    list.innerHTML = html;
}

function decideLicense(requestId, status) {
    var key = getSessionKey();
    if (!key) return;
    api("/api/admin/decide-license-request", "POST", { key: key, requestId: requestId, status: status }).then(function() {
        notify("Admin", "License request updated.");
        loadAdminLicenses();
    }).catch(function(err) { notify("Admin", err.message); });
}

function loadPlayerGameStats(psn) {
    var area = document.getElementById("player-game-stats-area");
    if (!psn) { area.innerHTML = '<p style="color:var(--muted);font-size:12px;">This player has no PSN on file.</p>'; return; }
    area.innerHTML = '<p style="color:var(--muted);font-size:12px;">Loading...</p>';

    fetch("https://dreamlegacyrp.xyz/api/admin/player-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: getSessionKey(), psn: psn })
    }).then(function(r) {
        return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || "Request failed"); return d; });
    }).then(function(res) {
        if (!res.found) { area.innerHTML = '<p style="color:var(--muted);font-size:12px;">No game stats synced for this player yet.</p>'; return; }

        var html = '<p style="color:var(--muted);font-size:11px;margin-bottom:8px;">' + res.decodedCount + ' of ' + res.totalStats + ' stats decoded &middot; last synced ' + formatAdminDate(res.updatedAt) + '</p>';
        html += '<div style="max-height:340px;overflow-y:auto;">';
        for (var i = 0; i < res.stats.length; i++) {
            var s = res.stats[i];
            var label = s.name ? s.name : ('Hash ' + s.hash);
            html += '<div class="profile-row"><span class="profile-label" style="' + (s.name ? '' : 'opacity:.5;') + '">' + escapeHtml(label) + '</span><span>' + escapeHtml(String(s.value)) + '</span></div>';
        }
        html += '</div>';
        area.innerHTML = html;
    }).catch(function(err) {
        area.innerHTML = '<p style="color:var(--red);font-size:12px;">' + escapeHtml(err.message) + '</p>';
    });
}

document.addEventListener("DOMContentLoaded", function() {
    checkAdminStatus();
});