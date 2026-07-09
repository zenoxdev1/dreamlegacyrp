# Base de datos — Supabase (gratis y estable)

## 1. Crea el proyecto

1. Ve a https://supabase.com y crea una cuenta (o entra con la que ya
   usas en tus otros proyectos: iChecke, TamilPath, Kiosk City).
2. **New Project** → elige un nombre (p. ej. `dream-legacy-rp`), una
   contraseña de base de datos (guárdala, no la necesitarás para el
   día a día) y la región más cercana a tus jugadores.
3. Espera 1-2 minutos a que se aprovisione.

## 2. Aplica el esquema

1. En el panel de Supabase, ve a **SQL Editor → New query**.
2. Pega el contenido completo de `database/schema.sql` y pulsa **Run**.
3. Deberías ver "Success. No rows returned". Esto crea:
   - Tabla `profiles` (usuarios whitelisteados) y `sessions` (tokens de login).
   - Todas las funciones `dlrp_*` que usa el frontend.
   - RLS activado en ambas tablas SIN políticas públicas — solo se
     accede a través de las funciones, que validan todo internamente.

## 3. Copia tus claves

1. **Project Settings → API**.
2. Copia **Project URL** y la clave **anon / public** (NO la
   `service_role`, esa nunca debe ir en el frontend).
3. Pégalas en estos dos archivos:
   - `landing/assets/js/supabase-client.js`
   - `panel/assets/js/supabase-client.js`

   ```js
   var SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   var SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

## 4. Prueba

- Abre `landing/index.html` (o el sitio ya desplegado), ve a la
  pestaña **Whitelist**, envía una solicitud de prueba.
- En Supabase, **Table Editor → profiles**, deberías ver la fila
  nueva (con `password_hash` cifrado, nunca en texto plano).
- Inicia sesión con esos datos desde el botón "Already whitelisted?".

## Aprobar/gestionar jugadores

Por ahora, aprobar solicitudes (`status: pending → approved`), dar
dinero, asignar trabajos, etc. se hace manualmente desde
**Table Editor → profiles** en el panel de Supabase, editando la fila
del jugador. Si quieres un panel de administración dentro del propio
sitio web (para no depender del dashboard de Supabase), es un
añadido razonable para una próxima sesión — necesitaría su propio
sistema de roles de "admin".

## Notas de seguridad

- Las contraseñas se guardan con `crypt()` (bcrypt) vía la extensión
  `pgcrypto`, nunca en texto plano.
- Nadie puede leer la tabla `profiles` directamente por la API REST
  autogenerada de Supabase (se revoca el acceso explícitamente al
  final del script) — todo pasa por las funciones `dlrp_*`.
- Los tokens de sesión expiran a los 30 días (`sessions.expires_at`).
  Puedes programar una limpieza automática con `pg_cron` (comentado
  al final de `schema.sql`).

## Límites del plan gratuito (a fecha de esta guía)

- 500 MB de base de datos — de sobra para miles de jugadores.
- Proyectos gratuitos se pausan tras 7 días sin actividad (se
  reactivan solos con la primera petición, tardan unos segundos).
- Verifica los límites actuales en https://supabase.com/pricing antes
  de lanzar, por si han cambiado.
