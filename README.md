# STB Monitor Termográfico

Aplicación web para registrar inspecciones termográficas, imágenes, alertas, criticidad, seguimiento y auditoría. Preparada para Supabase y Vercel.

## Uso

En producción, despliegue la carpeta en Vercel y configure las variables descritas en `supabase/README.md`. La aplicación usa `/api/termografico` y Supabase como fuente principal; `localStorage` funciona únicamente como caché de interfaz.

## Accesos de demostración

La contraseña común es `1234`.

- `10000001`: Julio Senisse — Técnico
- `10000002`: Gustavo Flores — Supervisor
- `10000003`: JKenyo Villegas — Administrador
- `10000004`: Robertho Espinoza — Jefe

La configuración de límites solo puede editarse como Administrador. Jefe puede consultarla y las anomalías críticas no pueden cerrarse como Técnico.

## Producción

La función serverless autentica contra `tbUsuarios`, firma sesiones, guarda inspecciones y configuración, registra auditoría y almacena las imágenes en un bucket privado de Supabase Storage.
