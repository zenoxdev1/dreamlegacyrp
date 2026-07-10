# Login con Discord — cómo configurarlo

El login por nombre de usuario/contraseña (whitelist) se sustituyó por
**login con Discord** en la landing. Así es como se conecta todo:

```
[Botón "Log in with Discord"]
        |
        v
https://discord.com/api/oauth2/authorize?...   (el usuario autoriza en Discord)
        |
        v
https://dreamlegacyrp.xyz/api/discord/callback   (Cloudflare Pages Function)
        |  - intercambia el "code" por un access_token (usa el Client Secret)
        |  - pide a Discord los datos del usuario y sus servidores
        |  - comprueba si está en el servidor de Dream Legacy RP
        |  - guarda/actualiza el perfil en Supabase (usa la Service Role Key)
        |  - crea una sesión y redirige de vuelta con el token
        v
https://dreamlegacyrp.xyz/?dlrp_session=TOKEN
        |
        v
   assets/js/discord-auth.js guarda el token, limpia la URL
```

La Function (`landing/functions/api/discord/callback.js`) es la única
pieza que ve el Client Secret y la Service Role Key — ambas viven
solo como variables de entorno en Cloudflare, nunca en el código que
descarga el navegador.

## 1. Crea la aplicación en Discord

1. Ve a **https://discord.com/developers/applications** → **New Application**.
2. Nombre: `Dream Legacy RP` (o el que quieras).
3. Pestaña **OAuth2** → copia el **Client ID**.
4. En la misma pestaña, **Reset Secret** → copia el **Client Secret** (solo se muestra una vez).
5. En **Redirects**, añade exactamente:
   ```
   https://dreamlegacyrp.xyz/api/discord/callback
   ```

## 2. Pega el Client ID en el frontend (esto SÍ es público)

En `landing/assets/js/discord-auth.js`:

```js
var DISCORD_CLIENT_ID = "TU_CLIENT_ID_AQUI";
var DISCORD_REDIRECT_URI = "https://dreamlegacyrp.xyz/api/discord/callback";
```

## 3. Configura las variables de entorno en Cloudflare (esto NO es público)

En el proyecto de Cloudflare Pages de la **landing** (el que sirve
`dreamlegacyrp.xyz`) → **Settings → Environment variables** → añade
en **Production** (marca cada una como **Secret** salvo que se diga
lo contrario):

| Variable | Valor | Secreta |
|---|---|---|
| `DISCORD_CLIENT_ID` | el mismo Client ID de arriba | no hace falta, pero no molesta |
| `DISCORD_CLIENT_SECRET` | el Client Secret de Discord | **sí** |
| `DISCORD_REDIRECT_URI` | `https://dreamlegacyrp.xyz/api/discord/callback` | no |
| `DISCORD_GUILD_ID` | `1508290225741234238` | no |
| `SUPABASE_URL` | `https://cpdljnqhuealpxhpwsqk.supabase.co` | no |
| `SUPABASE_SERVICE_ROLE_KEY` | la clave `service_role` de Supabase (Project Settings → API) | **sí** |
| `SITE_URL` | `https://dreamlegacyrp.xyz` | no |

Guarda y vuelve a desplegar (los cambios de variables de entorno
requieren un nuevo deployment para aplicarse — usa "Retry deployment"
o haz un commit vacío).

## 4. Aplica la migración en Supabase

Si ya habías aplicado el `schema.sql` original antes de este cambio,
ejecuta ahora `database/migration_discord_login.sql` en el SQL Editor
de Supabase (añade las columnas de Discord y hace opcional el
usuario/contraseña de whitelist). Si vas a crear la base de datos
desde cero, usa directamente el `schema.sql` actualizado, no hace
falta la migración.

## 5. Prueba

1. Abre `https://dreamlegacyrp.xyz` y haz click en "Log in with Discord".
2. Autoriza en Discord.
3. Deberías volver a la web ya con sesión iniciada: tu avatar arriba a
   la derecha, y en la pestaña **Profile** debería indicar si estás o
   no en el servidor de Discord.
4. En Supabase → **Table Editor → profiles**, comprueba que apareció
   (o se actualizó) tu fila, con `discord_id`, `discord_username`,
   `discord_in_guild`.

## Notas de seguridad

- La Service Role Key de Supabase **bypasea todas las protecciones
  (RLS)** de la base de datos. Por eso solo se usa dentro de la
  Function, que corre en el servidor de Cloudflare — nunca debe
  copiarse a ningún archivo dentro de `assets/js/`.
- El scope `guilds` solo te deja **leer** la lista de servidores del
  usuario que ha iniciado sesión (para comprobar si está en el
  servidor de Dream Legacy RP); no da acceso a gestionar servidores ni
  a nada del bot.
- Si compartes este repositorio o quieres subirlo a un GitHub
  público, revisa que ningún archivo dentro de `assets/` tenga el
  Client Secret o la Service Role Key — solo el Client ID (que es
  público por diseño).