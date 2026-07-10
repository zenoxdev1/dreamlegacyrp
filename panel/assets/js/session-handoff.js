/* ============================================================
   Dream Legacy RP — Panel: recoger sesion pasada desde la landing
   ------------------------------------------------------------
   Cuando el usuario hace click en "Go to Panel" en dreamlegacyrp.xyz
   despues de que su solicitud sea aprobada, se le redirige aqui con
   ?dlrp_session=TOKEN en la URL (mismo token de sesion de Supabase).
   Como panel.dreamlegacyrp.xyz es un dominio/origen distinto,
   localStorage no se comparte automaticamente -- por eso hace falta
   pasarlo explicitamente por la URL una vez.
   ============================================================ */

var SESSION_KEY = "dlrp_panel_session";

(function pickUpSession() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get("dlrp_session");
    if (token) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ key: token }));
        params.delete("dlrp_session");
        var clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
        window.history.replaceState({}, document.title, clean);
    }
})();