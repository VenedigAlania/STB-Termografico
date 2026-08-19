# Supabase y Vercel

1. Cree un proyecto en Supabase y ejecute `schema.sql` desde **SQL Editor**.
2. Importe o mantenga los usuarios en `tbUsuarios`. La aplicación usa las columnas `Codigo`, `Nombre`, `Rol`, `Contrasena`, `Grupo` y `Activo`.
3. Importe los límites en `tbTermoConfiguracion` o edítelos desde la aplicación como Administrador.
4. Despliegue esta carpeta en Vercel.
5. Configure en Vercel las variables de `.env.example`.

La clave `SUPABASE_SERVICE_ROLE_KEY` es secreta: debe existir únicamente en Vercel, nunca en `index.html` ni en variables con prefijo público.

El bucket `termografias` es privado. Las imágenes se consultan mediante URLs firmadas generadas por la función serverless.

Para producción conviene migrar `Contrasena` a hashes (por ejemplo bcrypt/Argon2) o Supabase Auth. El esquema conserva texto para ser compatible con la estructura actual de `tbUsuarios` del aplicativo de referencia.
