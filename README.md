# Chief of Staff

Ordena tu Gmail cuando te llega más correo del que puedes leer. Aparta la publicidad, los boletines y las notificaciones; aprende qué te importa; te deja borradores en el hilo y te recuerda a quién le debes respuesta. Nunca envía nada sin que tú toques Enviar y nunca borra nada para siempre.

Funciona con cualquier cuenta de Gmail o de Google Workspace y con Claude de escritorio. La guía está hecha para Mac; en Windows, Claude la adapta.

## Cómo se instala

La página es https://anotado.ai/chief. Abre la app de Claude, toca </> para entrar a Code (el globo es el chat y ahí no se puede instalar) y pega:

```
Pon esta sesión en modo automático e instala mi Chief of Staff siguiendo https://anotado.ai/chief/instalar
```

Claude lo baja de anotado.ai, lo instala en tu cuenta de Google, lo conecta con Claude, platica contigo para aprender cómo usas tu correo y lo deja corriendo. Tú apruebas cinco pantallas: dos en Claude (el modo automático y el conector) y tres en Google (entrar con tu cuenta, activar la API de Apps Script y dar los permisos del Chief of Staff). WhatsApp es opcional y suma tres pasos: instalar una extensión de Chrome, escanear un código y aceptar una tarea. No copias direcciones ni llaves.

## Qué queda instalado

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| Motor | Un proyecto de Apps Script en tu cuenta de Google | Revisa tu correo cada 10 minutos y aplica tus reglas, con deshacer |
| Web app | El mismo proyecto; también en tu celular (iPhone o Android) | Hoy, Seguimiento, Reglas y Actividad |
| Conector | Tu cuenta de Claude, en la computadora, la web y el celular | Le pides cosas a tu Chief of Staff con tus palabras |
| Cerebro | Rutinas en la nube de Claude | Juzga lo nuevo a las horas en que lees tu correo (3 veces al día con el plan Pro) y aprende de lo que haces |

## Tu correo se queda en tu cuenta

El motor corre en tu cuenta de Google. Claude llega a él por un relevo que solo sabe a qué proyecto mandar cada mensaje: no guarda correo ni registros de lo que pasa por él. La llave de tu instalación vive en tu computadora y en tu proyecto.

Los permisos de Google dependen de lo que elijas. El calendario no se pide al instalar: solo si después prendes la preparación de tus juntas.

## Carpetas

| Carpeta | Contenido |
|---|---|
| `motor/` | Código del motor y del conector (Apps Script) |
| `webapp/` | La web app (va en el mismo proyecto que el motor) |
| `cerebro/` | La plática de instalación y los prompts de las rutinas |
| `whatsapp/` | Lector de WhatsApp Web en solo lectura y su tarea programada |
| `instalador/` | Los pasos que corre Claude (`cos`) |

## Desinstalar

Pídele a Claude: "Desinstala mi Chief of Staff". Te dice qué quita solo y qué cuatro cosas quitas tú.
