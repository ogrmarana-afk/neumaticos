NEUMÁTICOS OFFLINE (PWA)
=================================
Qué es: App web instalable en iPhone (PWA), 100% gratis, sin servidor. Funciona offline, permite fotos (cámara), firmas y control básico de roles.

CONTENIDO
- index.html
- app.js
- manifest.webmanifest
- service-worker.js
- icons/icon-192.png
- icons/icon-512.png

CÓMO PUBLICAR GRATIS (GitHub Pages)
1) Crea una cuenta GitHub (gratis).
2) Crea un repositorio público llamado `neumaticos`.
3) Sube TODOS los archivos de esta carpeta al repositorio.
4) En el repo, ve a Settings → Pages → "Deploy from a branch": elige `main` y la carpeta raíz `/`.
5) Espera 1-2 min: tu URL será algo como https://tuusuario.github.io/neumaticos

INSTALAR EN IPHONE (iOS 16.4+)
1) Abre la URL en Safari.
2) Pulsa el botón Compartir → "Añadir a pantalla de inicio".
3) Abre la app desde el icono. Funciona offline.

NOTAS
- Datos guardados en IndexedDB del dispositivo (no hay nube).
- Exporta/Importa JSON para copia de seguridad o mover datos entre dispositivos.
- Rol ADMIN permite definir un PIN y eliminar. EDIT requiere PIN si existe.
- Las fotos se comprimen para ahorrar espacio.
- Si actualizas archivos, la app se actualiza sola tras recargar (Service Worker).

SOPORTE PUSH (opcional)
- Si necesitas notificaciones push, hace falta un backend gratuito (por ejemplo, Cloudflare Workers) y configurar Web Push. No es obligatorio para funcionar.

