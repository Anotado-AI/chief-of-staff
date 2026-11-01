# WhatsApp del Chief of Staff · Guía para el instalador

La sigue Opus en la plática de instalación. Sirve en Mac y en Windows; está probada de punta a punta en Mac.

## Qué queda instalado

- La extensión Claude in Chrome, conectada a la cuenta de Claude de la persona.
- Su sesión de WhatsApp Web en ese Chrome, vinculada desde su teléfono.
- Una tarea programada de Claude de escritorio, `cos-whatsapp`, que lee WhatsApp Web tres veces al día (9:30, 14:30 y 19:30) y guarda el resumen en el motor con `guardar_whatsapp`.
- La instrucción para que en la plática diaria Opus lea WhatsApp a pedido (`../INSTRUCCION_platica_diaria.md`).

La tarea solo corre con la computadora prendida, despierta y con la app de Claude abierta. Si a la hora de una corrida la computadora estaba dormida o la app cerrada, esa corrida se pierde; al despertar o abrir la app corre una sola de recuperación por la última que faltó, aunque hayan faltado varias, y puede caer fuera de horario (una de las 9:30 puede correr a las 23:00). Si Chrome está cerrado, la corrida registra "sin_chrome" y no lee. Fuente: documentación de tareas programadas de Claude Code.

## Requisitos

- Una Mac o una computadora con Windows, con Google Chrome y la app de escritorio de Claude, con la misma cuenta de Claude.
- WhatsApp en el teléfono de la persona (cuenta personal o WhatsApp Business).
- El conector del Chief of Staff agregado en Claude con `guardar_whatsapp` y `ver_whatsapp`.

## Pasos

1. **Extensión.** La persona instala Claude in Chrome desde https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn, abre el panel de Claude en Chrome (ícono de la barra de extensiones) e inicia sesión con la misma cuenta de la app. Opus verifica con `list_connected_browsers`: debe salir un navegador. Si sale vacío, la extensión no tiene sesión o tiene otra cuenta.
2. **WhatsApp Web.** En ese mismo Chrome y en el mismo perfil, la persona abre web.whatsapp.com y escanea el código QR desde el teléfono: WhatsApp, Configuración, Dispositivos vinculados, Vincular un dispositivo. Opus no toca el QR. Ocupa uno de los 4 dispositivos vinculados que permite WhatsApp.
3. **Permiso del sitio.** En la primera lectura la extensión puede pedir permiso para web.whatsapp.com. La persona elige permitir siempre.
4. **Crear la tarea.** Opus llama `create_scheduled_task` con:
   - taskId `cos-whatsapp`, título "Chief of Staff · WhatsApp"
   - cronExpression `30 9,14,19 * * *` (hora local)
   - prompt: el contenido completo de `PROMPT_cos_whatsapp.md`, sin editar. Trae el script de lectura adentro, así que no depende de rutas.
   La app pide la aprobación de la persona. El modo automático de permisos puede bloquear la creación; si pasa, la persona la aprueba o la crea a mano en la app (Tareas programadas, Nueva tarea) pegando el mismo prompt.
5. **Primera corrida acompañada.** La persona toca "Ejecutar ahora" con Opus a su lado. La sesión puede detenerse a pedir aprobación para las herramientas de Chrome y del conector; la persona aprueba y las aprobaciones se guardan para las siguientes corridas.
6. **Energía.** Para que la computadora no se duerma en horas de corrida, activa "Keep computer awake" en la app de Claude; evita la suspensión por inactividad. Cerrar la tapa de la laptop la duerme de todos modos. Si la persona prefiere hacerlo en el sistema:
   - Mac: Configuración del Sistema, Batería (o Pantalla), Opciones: evitar que la Mac entre en reposo automático con la pantalla apagada cuando está conectada.
   - Windows: Configuración, Sistema, Inicio/apagado y batería: suspender "Nunca" cuando está conectada.
   La app de Claude debe abrir al iniciar sesión en la computadora.
7. **Verificación.** Opus llama `ver_whatsapp` y le enseña la lectura con su hora.

## Qué le dice Opus antes de instalar

- La lectura abre una pestaña propia de WhatsApp Web y la cierra al terminar. WhatsApp Web deja una sola pestaña activa por navegador: si la persona tiene WhatsApp Web abierto en ese Chrome, después de cada corrida su pestaña le pide "Usar aquí". Con la app de escritorio de WhatsApp o el teléfono no hay conflicto, porque son otros dispositivos vinculados.
- Los chats con mensajes sin leer no se abren, para no marcarlos como leídos ni mandar palomitas azules. Se resumen con la vista previa.
- Nunca envía. Las respuestas solo se dejan escritas cuando la persona lo pide en la plática.
- Si deja de usar el teléfono más de 14 días, WhatsApp cierra la sesión de WhatsApp Web y hay que volver a escanear el QR.

## Mac y Windows

WhatsApp Web, Claude in Chrome y el script son los mismos en las dos. La ayuda de Claude in Chrome solo nombra Google Chrome.

| Punto | Mac | Windows |
|---|---|---|
| Atajo para borrar un borrador de prueba | cmd+a y Backspace | ctrl+a y Backspace |
| Respaldo local si falla el motor | `$HOME/ChiefOfStaff/whatsapp/ultima_lectura.json` | `%USERPROFILE%\ChiefOfStaff\whatsapp\ultima_lectura.json` |
| Si la app no detecta la extensión | Reiniciar Chrome; el archivo del host nativo vive en `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` | Reiniciar Chrome |
| Probado de punta a punta | Sí | No |

## Si algo falla

| Síntoma | Causa | Qué hace la persona |
|---|---|---|
| Estado "sin_chrome" | Chrome cerrado o extensión sin sesión | Abrir Chrome; si sigue, entrar al panel de Claude |
| Estado "sin_sesion" | WhatsApp Web pide QR (14 días sin usar el teléfono o sesión cerrada) | Escanear el QR otra vez |
| La lectura tiene más de un día | Computadora apagada o dormida, o app de Claude cerrada | Abrir la app: sale sola una corrida de recuperación |
| La corrida se detiene a medio camino | WhatsApp pidió iniciar sesión o apareció un diálogo en la página | Abrir Chrome y resolverlo; la siguiente corrida sigue normal |
| Un chat sale con ERROR | La lista se reordenó con un mensaje nuevo | Nada: la siguiente corrida lo toma |
