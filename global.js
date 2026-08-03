/* ============================================================
   Dream Legacy RP — global.js
   ------------------------------------------------------------
   Alojado en files.dreamlegacyrp.xyz/js/global.js
   Solo el comportamiento del desplegable de idioma (abrir/cerrar)
   y el menu movil. La traduccion en si (el diccionario de
   textos) sigue siendo cosa de cada pagina, porque cada una
   tiene contenido distinto.

   Uso en el HTML:
     <div class="dl-lang" id="dl-lang">
       <button class="dl-lang-btn" id="dl-lang-btn" aria-haspopup="listbox" aria-expanded="false">
         <span id="dl-lang-current">EN</span>
         <span class="dl-lang-arrow">&#9662;</span>
       </button>
       <ul class="dl-lang-menu hidden" id="dl-lang-menu" role="listbox">
         <li role="option" data-lang="en">English</li>
         <li role="option" data-lang="fr">Fran&ccedil;ais</li>
         <li role="option" data-lang="pt">Portugu&ecirc;s</li>
       </ul>
     </div>

   Y en la pagina, defines window.onDlLangChange = function(lang) {...}
   para aplicar tu propio diccionario de textos.
   ============================================================ */

(function () {
    function setupLangDropdown() {
        var wrap = document.getElementById("dl-lang");
        var btn = document.getElementById("dl-lang-btn");
        var menu = document.getElementById("dl-lang-menu");
        var current = document.getElementById("dl-lang-current");
        if (!wrap || !btn || !menu) return;

        function close() {
            menu.classList.add("hidden");
            btn.setAttribute("aria-expanded", "false");
        }

        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var willOpen = menu.classList.contains("hidden");
            menu.classList.toggle("hidden", !willOpen);
            btn.setAttribute("aria-expanded", String(willOpen));
        });

        document.addEventListener("click", function (e) {
            if (!wrap.contains(e.target)) close();
        });

        var opts = menu.querySelectorAll("[data-lang]");
        for (var i = 0; i < opts.length; i++) {
            opts[i].addEventListener("click", function () {
                var lang = this.getAttribute("data-lang");
                if (current) current.textContent = lang.toUpperCase();
                var all = menu.querySelectorAll("[data-lang]");
                for (var j = 0; j < all.length; j++) {
                    all[j].classList.toggle("active", all[j] === this);
                }
                close();
                if (typeof window.onDlLangChange === "function") {
                    window.onDlLangChange(lang);
                }
            });
        }
    }

    function setupMobileNav() {
        var toggle = document.getElementById("dl-nav-mobile-toggle");
        var links = document.getElementById("dl-nav-links");
        if (!toggle || !links) return;
        toggle.addEventListener("click", function () {
            links.classList.toggle("open");
        });
    }

    /* Los subdominios no comparten localStorage entre si (cada uno es
       un origen distinto para el navegador) -- asi que si saltamos de
       un sitio a otro por un enlace normal del navbar, sin pasar el
       token, el destino no sabe quien eres hasta que lo visitas una
       vez con ?dlrp_session=... en la URL. Para que esto no dependa
       de acordarse de usar siempre el boton correcto del perfil,
       cualquier sitio que YA tenga sesion activa se la pasa el solo
       a los demas subdominios de DLRP al pinchar un enlace del navbar. */
    function setupNavTokenPropagation() {
        var key = null;
        try {
            var raw = JSON.parse(localStorage.getItem("dlrp_panel_session"));
            key = raw && raw.key ? raw.key : null;
        } catch (e) {}
        if (!key) return;

        var links = document.querySelectorAll(".dl-nav-links a[href^='https://']");
        for (var i = 0; i < links.length; i++) {
            var href = links[i].getAttribute("href");
            if (href.indexOf("dreamlegacyrp.xyz") === -1) continue;
            if (href.indexOf("?") === -1) {
                links[i].setAttribute("href", href + "?dlrp_session=" + encodeURIComponent(key));
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            setupLangDropdown();
            setupMobileNav();
            setupNavTokenPropagation();
        });
    } else {
        setupLangDropdown();
        setupMobileNav();
        setupNavTokenPropagation();
    }
})();