# Motor

Código del motor y del conector MCP, en Apps Script. El instalador sube todo lo que esté aquí y en `webapp/` al mismo proyecto.

Lo que el instalador espera:
- `appsscript.json` con los permisos del motor. El instalador cambia solo la sección `webapp` para publicar dos accesos: la web app (`MYSELF`) y el conector (`ANYONE_ANONYMOUS`).
- Archivos `.js`, `.gs` y `.html` en esta carpeta, sin subcarpetas. Ningún nombre puede repetirse con `webapp/`.
- La llave de cada instalación llega en `Instalacion.js`, que genera el instalador: `INSTALACION.llave`, `INSTALACION.relevo` e `INSTALACION.version`. Ese archivo nunca va al repositorio.
- `doPost` atiende MCP por POST con `?k=<llave>`; `initialize` contesta `serverInfo.name = 'chief-of-staff'`.
- `cos/admin` con `accion` `estado`, `instalar` y `desinstalar`.
