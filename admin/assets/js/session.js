var SESSION_KEY = "dlrp_panel_session";

(function pickUpSession() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get("dlrp_session");
    if (token) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ key: token }));
        params.delete("dlrp_session");
        var clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, document.title, clean);
    }
})();

function getSessionKey() {
    try {
        var raw = JSON.parse(localStorage.getItem(SESSION_KEY));
        return raw && raw.key ? raw.key : null;
    } catch (e) { return null; }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}