/* ============================================================
   Dream Legacy RP — Motor de traducción en tiempo real
   Idiomas: es (base), en, fr, pt
   Uso en HTML:
     <span data-i18n="hero.title">Dream Legacy RP</span>
     <input data-i18n-placeholder="whitelist.rpName">
     <button data-i18n-html="footer.credit">...</button>  (permite HTML simple)
   ============================================================ */

(function (global) {
    "use strict";

    var SUPPORTED = ["en", "fr", "pt"];
    var DEFAULT_LANG = "en";
    var STORAGE_KEY = "dlrp_lang";
    var BASE_PATH = (global.DLRP_I18N_PATH || "/assets/i18n/");

    var dictionaries = {};
    var currentLang = DEFAULT_LANG;
    var ready = false;
    var listeners = [];

    function detectBrowserLang() {
        var nav = global.navigator || {};
        var langs = nav.languages && nav.languages.length ? nav.languages : [nav.language || nav.userLanguage || DEFAULT_LANG];
        for (var i = 0; i < langs.length; i++) {
            var code = String(langs[i]).slice(0, 2).toLowerCase();
            if (SUPPORTED.indexOf(code) !== -1) return code;
        }
        return DEFAULT_LANG;
    }

    function getSavedLang() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
        } catch (e) {}
        return null;
    }

    function resolvePath(obj, path) {
        var parts = path.split(".");
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null) return null;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function fetchDictionary(lang) {
        if (dictionaries[lang]) return Promise.resolve(dictionaries[lang]);
        return fetch(BASE_PATH + lang + ".json", { cache: "no-cache" })
            .then(function (r) {
                if (!r.ok) throw new Error("No se pudo cargar el idioma " + lang);
                return r.json();
            })
            .then(function (data) {
                dictionaries[lang] = data;
                return data;
            });
    }

    function applyToDom() {
        var dict = dictionaries[currentLang] || {};

        var nodes = document.querySelectorAll("[data-i18n]");
        for (var i = 0; i < nodes.length; i++) {
            var key = nodes[i].getAttribute("data-i18n");
            var val = resolvePath(dict, key);
            if (typeof val === "string") nodes[i].textContent = val;
        }

        var htmlNodes = document.querySelectorAll("[data-i18n-html]");
        for (var j = 0; j < htmlNodes.length; j++) {
            var hkey = htmlNodes[j].getAttribute("data-i18n-html");
            var hval = resolvePath(dict, hkey);
            if (typeof hval === "string") htmlNodes[j].innerHTML = hval;
        }

        var placeholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
        for (var k = 0; k < placeholderNodes.length; k++) {
            var pkey = placeholderNodes[k].getAttribute("data-i18n-placeholder");
            var pval = resolvePath(dict, pkey);
            if (typeof pval === "string") placeholderNodes[k].setAttribute("placeholder", pval);
        }

        var titleNodes = document.querySelectorAll("[data-i18n-title]");
        for (var m = 0; m < titleNodes.length; m++) {
            var tkey = titleNodes[m].getAttribute("data-i18n-title");
            var tval = resolvePath(dict, tkey);
            if (typeof tval === "string") titleNodes[m].setAttribute("title", tval);
        }

        var pageTitle = resolvePath(dict, "meta.title");
        if (pageTitle) document.title = pageTitle;

        document.documentElement.setAttribute("lang", currentLang);

        var switcher = document.getElementById("lang-select");
        if (switcher) switcher.value = currentLang;

        for (var n = 0; n < listeners.length; n++) {
            try { listeners[n](currentLang, dict); } catch (e) {}
        }
    }

    function setLang(lang) {
        if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
        return fetchDictionary(lang).then(function () {
            currentLang = lang;
            try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
            applyToDom();
            return lang;
        });
    }

    function t(key, fallback) {
        var dict = dictionaries[currentLang] || {};
        var val = resolvePath(dict, key);
        return typeof val === "string" ? val : (fallback !== undefined ? fallback : key);
    }

    function onChange(fn) {
        if (typeof fn === "function") listeners.push(fn);
    }

    function init() {
        var initial = getSavedLang() || detectBrowserLang();
        return setLang(initial).then(function () {
            ready = true;
            var switcher = document.getElementById("lang-select");
            if (switcher) {
                switcher.value = currentLang;
                switcher.addEventListener("change", function () {
                    setLang(switcher.value);
                });
            }
        });
    }

    global.DLRP_I18N = {
        init: init,
        setLang: setLang,
        t: t,
        onChange: onChange,
        getLang: function () { return currentLang; },
        supported: SUPPORTED
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})(window);
