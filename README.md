# Dream Legacy RP — Reestructuración completa

Este repositorio reemplaza la estructura anterior (todo en "Phonesite",
sin base de datos, un único archivo HTML gigante) por dos sitios
independientes + una base de datos gratuita y estable (Supabase).

```
dreamlegacyrp/
├── landing/                  → deploy en dreamlegacyrp.xyz
│   ├── index.html            (antes: "Dream Legacy RP.html", 1730 líneas en 1 archivo)
│   └── assets/
│       ├── css/style.css
│       ├── js/
│       │   ├── i18n.js              (motor de traducción ES/EN/FR/PT)
│       │   ├── supabase-client.js   (reemplaza el backend que no existía)
│       │   └── app.js               (lógica de la web: tabs, whitelist, jobs, música...)
│       ├── i18n/{es,en,fr,pt}.json
│       └── img/dlrp.png
│
├── panel/                    → deploy en panel.dreamlegacyrp.xyz
│   ├── index.html            (antes: Phonesite/Panel/index.html)
│   ├── assets/ (css, js, i18n, img — misma estructura que landing)
│   └── os/                   (antes: Phonesite/PhoneUi/)
│       ├── index.html        (tienda de teléfonos)
│       ├── os.html           (DreamOS, el sistema operativo del teléfono in-game)
│       ├── model.html … model5.html  (páginas de compra de cada modelo)
│       └── apps/             (antes: Phonesite/PhoneUi/app/ — estas 14 apps ya
│                                estaban completas, solo minificadas en una línea:
│                                bank, browser, businesses, contacts, dialer,
│                                dreamgram, emergency, government, jobs,
│                                marketplace, messages, property, settings, vehicles)
│
├── database/
│   ├── schema.sql             (pégalo entero en el SQL Editor de Supabase)
│   └── README.md              (cómo crear el proyecto y conectar todo)
│
└── docs/
    └── DEPLOYMENT.md          (Cloudflare Pages + DNS para los 2 subdominios)
```

## Por qué esta estructura

- **Un sitio, una responsabilidad.** La landing (whitelist, info del
  servidor, trabajos) y el Panel/teléfono (DreamOS) son proyectos
  separados con su propio `index.html`, CSS y JS — así cada uno se
  despliega, cachea y actualiza de forma independiente, y el archivo
  de 1730 líneas queda dividido en piezas manejables.
- **`assets/js/i18n.js` es idéntico en landing y panel** (motor
  genérico basado en atributos `data-i18n`), solo cambian los
  diccionarios JSON. Cambiar de idioma no recarga la página.
- **`assets/js/supabase-client.js` reemplaza el backend que nunca se
  construyó** (`Phonesite/Database/README.md` decía "Coming Soon").
  Expone la misma función `api(path, method, body)` que ya usaba tu
  código, así que `app.js` casi no cambió — solo se le quitó el
  `fetch()` roto y se corrigió el sistema de sesión (ver abajo).

## Base de datos: por qué Supabase

Gratis, estable (Postgres gestionado, backups diarios) y sin
necesidad de mantener un servidor Node/Express aparte: el sitio
estático llama directamente a Supabase con la clave pública "anon".
Ya usas Supabase en otros proyectos, así que reutilizas la misma
cuenta. Detalles de seguridad y cómo configurarlo: `database/README.md`.

## Correcciones que hice sobre la lógica original

1. **Sesión insegura → token real.** El login antiguo guardaba como
   "clave de sesión" el propio nombre de usuario transformado
   (`storageKey(username)`), adivinable por cualquiera. Ahora el
   servidor (Supabase RPC `dlrp_login`) genera un token opaco de verdad.
2. **El Panel dejaba crear cuentas sin pasar por la whitelist.**
   `Phonesite/Panel/index.html` tenía un botón "Create Account" que
   creaba cuentas directamente en `localStorage`, sin ningún control
   — cualquiera podía saltarse el formulario de whitelist de la
   landing. Ahora el Panel y DreamOS usan el **mismo login** que la
   landing (misma tabla `profiles`), así que solo entra quien ya fue
   aprobado.
3. **Transferencias bancarias inseguras.** El código original de
   `bank.html` leía y modificaba el objeto de OTRO usuario directamente
   en el navegador del que transfiere — cualquiera podía manipular su
   propio saldo antes de enviarlo. Ahora es una función `dlrp_transfer_bank`
   en el servidor, atómica y validada.

## Lo que NO cambié (y por qué)

Las 14 apps del teléfono (`panel/os/apps/*.html`) ya estaban
completas — no eran archivos vacíos, solo minificados en una línea.
Su lógica de **banco y compra de teléfono** ya está conectada a
Supabase. Sus datos "ligeros" (contactos, ajustes, bio, vehículos,
propiedades) se sincronizan como un bloque JSON en cada
`bridge.saveData()`. Los **posts y mensajes directos de DreamGram** y
los **mensajes de texto** (`messages.html`) se quedaron en
`localStorage` del navegador por ahora — moverlos a Supabase con
sincronización en tiempo real entre jugadores (para que un mensaje
enviado por un jugador aparezca en el teléfono de otro) es un
proyecto aparte con su propio diseño de tablas y Realtime; dímelo si
quieres que lo hagamos en la próxima sesión.

## Pendiente de tu parte

- **Imagen del mapa de Los Santos**: el HTML original la referenciaba
  (`gtav-neighborhoods-v0-dmph4i8n5vpd1.png`) pero no estaba en los
  archivos que subiste. Colócala en `landing/assets/img/gtav-neighborhoods.png`.
- **Fuente Pricedown** (`Pricedown.otf`, la tipografía estilo GTA):
  tampoco estaba en el zip. El CSS ya tiene el `@font-face` listo;
  solo falta el archivo en `landing/assets/` si quieres usarla.
- **Rellenar `SUPABASE_URL` y `SUPABASE_ANON_KEY`** en los dos
  `supabase-client.js` (ver `database/README.md`).
