/* ============================================================
   Dream Legacy RP — Login con Discord (lado cliente)
   ------------------------------------------------------------
   El Client ID de Discord es público (va en la URL de
   autorización, cualquiera puede verlo), así que es seguro
   tenerlo aquí. El Client Secret NUNCA va en este archivo —
   vive solo en la Cloudflare Function (functions/api/discord/callback.js).
   ============================================================ */

var DISCORD_CLIENT_ID = "TU_DISCORD_CLIENT_ID";
var DISCORD_REDIRECT_URI = "https://dreamlegacyrp.xyz/api/discord/callback";

function discordLoginUrl() {
    var params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: "code",
        scope: "identify guilds"
    });
    return "https://discord.com/api/oauth2/authorize?" + params.toString();
}

function loginWithDiscord() {
    window.location.href = discordLoginUrl();
}

/* Al volver del callback, la URL trae ?dlrp_session=TOKEN (o
   ?discord_error=mensaje si algo fallo). Lo recogemos, lo
   guardamos, y limpiamos la URL para que no quede el token
   visible ni se reenvie si el usuario recarga la pagina. */
(function pickUpDiscordSession() {
    var params = new URLSearchParams(window.location.search);
    var token = params.get("dlrp_session");
    var error = params.get("discord_error");

    if (token) {
        localStorage.setItem("rrp_session", JSON.stringify({ key: token }));
        window.DLRP_FRESH_LOGIN = true;
    }
    if (token || error) {
        params.delete("dlrp_session");
        params.delete("discord_error");
        var clean = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
        window.history.replaceState({}, document.title, clean);
    }
    if (error) {
        window.DLRP_DISCORD_ERROR = error;
    }
})();