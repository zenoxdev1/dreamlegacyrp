# Despliegue — Cloudflare Pages + subdominios

Usamos Cloudflare Pages (gratis) ya que es lo que usas en iChecke.
Necesitas **dos proyectos de Pages separados** porque son dos sitios
distintos (landing y panel), aunque compartan dominio raíz.

## 1. Landing → dreamlegacyrp.xyz

1. Sube la carpeta `landing/` a un repositorio de GitHub (o arrastra
   la carpeta directamente en Cloudflare Pages con "Direct Upload").
2. Cloudflare Pages → **Create a project** → conecta el repo.
   - Build command: (ninguno, es HTML/CSS/JS estático)
   - Build output directory: `/` (la raíz del repo si solo subes `landing/`)
3. En **Custom domains**, añade `dreamlegacyrp.xyz` y `www.dreamlegacyrp.xyz`.
4. Si el dominio ya está en Cloudflare (DNS gestionado ahí), los
   registros se añaden automáticamente. Si no, añade un `CNAME`
   apuntando a `<tu-proyecto>.pages.dev`.

## 2. Panel → panel.dreamlegacyrp.xyz

1. Repite el proceso con la carpeta `panel/` como **otro proyecto**
   de Pages distinto (por ejemplo `dlrp-panel`).
2. En **Custom domains** de ESE proyecto, añade
   `panel.dreamlegacyrp.xyz`.
3. En el DNS de Cloudflare para `dreamlegacyrp.xyz`, confirma que
   existe un registro `CNAME panel → dlrp-panel.pages.dev` (Cloudflare
   Pages lo crea solo si el dominio ya está en tu cuenta de Cloudflare).

## 3. Verifica

- `https://dreamlegacyrp.xyz` → debe cargar la landing con el
  selector de idioma arriba a la derecha.
- `https://panel.dreamlegacyrp.xyz` → debe cargar el login del Panel.
- `https://panel.dreamlegacyrp.xyz/os/index.html` → tienda de teléfonos.
- `https://panel.dreamlegacyrp.xyz/os/os.html` → DreamOS.

## Nota sobre sesión entre landing y panel

Como son **dos dominios distintos** (`dreamlegacyrp.xyz` y
`panel.dreamlegacyrp.xyz`), el navegador NO comparte `localStorage`
entre ellos — es una restricción del navegador, no de este código.
Por eso el Panel tiene su propio formulario de login: un jugador que
ya inició sesión en la landing tendrá que volver a escribir su
usuario/contraseña una vez al entrar al Panel (las credenciales son
las mismas, es la misma cuenta en Supabase). Dentro del propio Panel
y DreamOS sí comparten sesión entre sí, porque viven bajo el mismo
subdominio.

Si en el futuro quieres sesión única entre ambos (sin volver a
escribir la contraseña), la opción estándar es pasar el token por la
URL al hacer clic en el enlace de la landing al Panel, o usar cookies
con `Domain=.dreamlegacyrp.xyz` en vez de `localStorage` — es un
cambio pequeño si lo quieres para la próxima sesión.

## Variables a configurar tras el despliegue

En ambos `assets/js/supabase-client.js`, reemplaza:

```js
var SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
var SUPABASE_ANON_KEY = "TU_ANON_KEY_PUBLICA";
```

con los valores reales de tu proyecto (ver `database/README.md`).
