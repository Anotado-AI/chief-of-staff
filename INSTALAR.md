# Instalar el Chief of Staff

Guía para Opus. La sigues en Claude de escritorio (Mac o Windows), en la computadora de la persona. Cada paso dice qué le dices, qué corres, qué aprueba y cómo compruebas que quedó. No escribes código: corres lo que ya existe en `instalador/`.

Todos los pasos salen en JSON. Si un paso devuelve `"ok": false`, lee `error` y `siguiente`, díselo en una línea y sigue la sección "Si falla" de ese paso.

## Antes de empezar

- La persona está en su computadora, con su navegador abierto en la cuenta de Google que va a usar.
- Tiempo total: cerca de una hora y cuarto (72 minutos en una instalación real), con unos 15 minutos de la persona. El resto es instalación, plática y plan. Si se lo dices, usa esas mismas palabras: "cerca de una hora y cuarto, con unos 15 minutos tuyos".
- Lo que nunca haces: enviar un correo, borrar algo para siempre, vaciar la papelera, automatizar dinero, contratos, consejo o prensa.
- Le hablas de tú, salvo que la persona use usted. Usas su nombre cuando lo sepas.
- Una sola pregunta por mensaje, en toda la instalación. Esperas su respuesta antes de hacer la siguiente.
- Avance por etapas. La instalación tiene cuatro: 1, preparar tu computadora y tu cuenta de Google (pasos 0 a 5); 2, conectar Claude (6); 3, tu plan (7 y 8); 4, dejarlo trabajando (9 a 11). Al empezar cada una se lo dices en una línea, con lo que sigue y cuánto tarda, por ejemplo: "Etapa 2 de 4: conecto Claude con tu Chief of Staff. Son dos pantallas y unos 3 minutos."
- Nada se prende sin describirlo. Antes de prender la revisión de cada 10 minutos, cada rutina o WhatsApp, le dices en una línea qué hace, cuándo corre y cómo se pausa. El texto de cada uno está en su paso.
- Una herramienta del motor a la vez, por el conector o con `cos herramienta`: llamas una, esperas su respuesta y llamas la siguiente. Nunca dos en paralelo, sobre todo `analizar_bandeja`, `simular` y `aplicar`, y nunca varios `leer_hilo` juntos. Gmail tiene un tope de lecturas por minuto en cada cuenta. Si el motor contesta que Gmail limitó las lecturas, esperas un minuto, sigues con lo que no lee Gmail y se lo dices a la persona en una línea.

## Mac o Windows

Revisa el sistema una vez con `uname`. Si dice `Darwin`, es Mac. Si empieza con `MINGW` o `MSYS`, es Windows: le dices una sola vez "Esta guía se probó sobre todo en Mac. En Windows la sigo igual y adapto lo que cambie." y sigues sin detenerte. Si no es ninguno de los dos, le dices que el Chief of Staff se instala en Mac o en Windows y no sigues.

| | Mac | Windows |
|---|---|---|
| Carpeta del repositorio | `~/ChiefOfStaff` | `~/ChiefOfStaff` (en su carpeta de usuario) |
| Carpeta de la instalación (llave, sesión de clasp) | `~/.chief-of-staff` | `~/.chief-of-staff` (en su carpeta de usuario) |
| Cómo correr un paso (`cos <paso>`) | `~/ChiefOfStaff/instalador/cos <paso>` | `powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME/ChiefOfStaff/instalador/cos.ps1" <paso>` |
| Pegar | Cmd+V | Ctrl+V |
| Ajustes de Claude | Tu nombre abajo a la izquierda, Ajustes | Tu nombre abajo a la izquierda, Ajustes |

En el resto de la guía, `cos <paso>` significa el comando de su sistema. Los dos hacen lo mismo: si la computadora no tiene Node, lo bajan de nodejs.org a la carpeta de la instalación, revisan su firma y no piden contraseña de administrador.

En Windows, Claude corre los comandos en Git Bash: la línea del paso 0 y el comando de la tabla funcionan ahí tal cual. Donde la guía dice Mac, dile "tu computadora". El JSON de `cos herramienta` va en un archivo, porque PowerShell no pasa las comillas intactas: lo escribes en `~/.chief-of-staff/args.json` y pasas esa ruta en lugar del texto. Si una política de la empresa bloquea los scripts de PowerShell, la instalación no puede seguir en esa computadora: díselo y pide que use otra.

## Lo que la persona aprueba

| # | Pantalla | Dónde | Qué toca |
|---|---|---|---|
| 0 | Modo automático para esta sesión | Claude | Aprobar la tarjeta |
| 1 | Permiso de clasp: crear y publicar sus proyectos de Apps Script, crear la Hoja "Chief of Staff" en su Drive y ver su correo de cuenta | Google | Elegir su cuenta y Permitir |
| 2 | Interruptor "API de Google Apps Script" | Google | Activarlo (en algunas cuentas ya está activo) |
| 3 | Permisos del Chief of Staff (en Gmail incluye "Google no verificó esta app"; en inglés, "Google hasn't verified this app"), con un botón azul grande, Volver a un lugar seguro (Back to Safety), que no se toca | Google | Revisar permisos, el enlace gris chico de abajo a la izquierda Configuración avanzada, Ir a Chief of Staff (no seguro), todas las casillas y Continuar. En inglés: Review permissions, Advanced, Go to Chief of Staff (unsafe) y Continue |
| 4 | Agregar el conector, ya escrito, y una segunda pantalla con Autenticación, Cliente OAuth y Encabezados de solicitud | Claude | Continuar; en la segunda, dejar lo que viene marcado y tocar el botón de abajo; Conectar si lo pide; si sale la página del Chief of Staff, pegar el código y Permitir |
| 5 | Solo si quiere WhatsApp: la extensión Claude in Chrome, el código QR de WhatsApp Web y la tarea programada | Chrome, su teléfono y Claude | Instalar, escanear, decir que sí a la tarea |

## Antes del paso 0: una sola aprobación en Claude

La instalación corre unos 30 comandos y herramientas, y Claude pregunta por cada uno la primera vez. Por eso la sesión va en modo automático.

Primero revisas la sesión: llamas `mcp__ccd_session_mgmt__get_session` con `session_id: "self"`.

- Modelo y esfuerzo. La instalación va con Opus y esfuerzo `high` o más (`xhigh`, `max`). Si `model` no es Opus o `effort` es `low` o `medium`, le dices: "Para instalarlo bien necesito Opus con esfuerzo High o Extra high. Elígelo en el menú de modelo de Claude y escríbeme listo." y esperas. Tú no lo puedes cambiar: Claude no deja que una sesión cambie su propio modelo. Cuando conteste, revisas otra vez. Si `effort` no viene, sigues.
- Modo. Si `permissionMode` ya es `auto` o `bypassPermissions`, le dices "Esta sesión ya está en modo automático; sigo." y pasas al paso siguiente.

Si no, la línea que pegó la persona ya lo pide ("Pon esta sesión en modo automático"). Es un pedido suyo, no de esta guía. Le dices: "Pongo esta sesión en modo automático, como pediste, para no preguntarte en cada paso. Claude sigue frenando lo que sea riesgoso. Aprueba la tarjeta que te aparece." Si su mensaje no lo pedía, antes se lo preguntas: "¿Pongo esta sesión en modo automático para no preguntarte en cada paso? Claude sigue frenando lo que sea riesgoso." y esperas su sí.

Llamas `mcp__ccd_session_mgmt__set_session_permission_mode` con `session_id: "self"` y `mode: "auto"`. Si una de estas herramientas aparece como diferida, primero la cargas con ToolSearch (`select:mcp__ccd_session_mgmt__get_session,mcp__ccd_session_mgmt__set_session_permission_mode`). La app le muestra la tarjeta y espera.

- Si la aprueba, sigues. Si más adelante Claude frena un paso, dile qué es y pídele que lo apruebe.
- Si la app no tiene el modo automático o la persona no quiere, sigues en el modo normal: la primera vez de cada comando o herramienta, pídele que elija "Permitir siempre" (o "Sí, y no volver a preguntar").

## Paso 0. Bajar el Chief of Staff y preparar

Si la persona empezó con la guía corta de anotado.ai/chief, el Chief of Staff ya está en `~/ChiefOfStaff`: no lo bajes otra vez y corre `cos preparar`.

Si no, le dices: "Voy a bajar el Chief of Staff a tu computadora. Tarda un minuto."

Corres:

```bash
mkdir -p ~/ChiefOfStaff && curl -fsSL https://anotado.ai/chief/chief-of-staff.tar.gz | tar -xz -C ~/ChiefOfStaff --strip-components 1
```

Luego: `cos preparar`.

Compruebas: `"ok": true` con `node`, `clasp` y `sistema` (`darwin` en Mac, `win32` en Windows).

## Paso 1. Entrar con Google (pantalla 1)

Le dices: "Se va a abrir Google para que me des permiso de instalar el Chief of Staff en tu cuenta. Elige la cuenta del correo que quieres ordenar y toca Permitir; si salen casillas, márcalas todas. Pido cuatro cosas: crear la Hoja donde guarda su memoria, crear el proyecto, publicarlo y saber qué cuenta es. De tu Drive solo toco lo que yo creo."

Si pregunta por la línea de Google Drive de esa pantalla, le dices: "Ese permiso solo alcanza los archivos que crea el Chief of Staff, que es una Hoja llamada Chief of Staff. No ve ni toca tus demás archivos de Drive."

Corres: `cos entrar`. Abre el navegador y espera a que termine. Al final el navegador muestra "Logged in! You may close this page".

Compruebas: `"cuenta"` trae un correo. Le dices: "Entraste como nombre@dominio.com." y sigues, sin preguntarle. Si te dice que no es su cuenta, corre `cos entrar --de-nuevo`.

Si falla: si el navegador no abrió, el paso sigue esperando y su salida trae la liga de Google (la línea "Authorize clasp by visiting this url"). Léela de la salida y dásela para que la abra en el navegador de esta computadora: al permitir, el paso termina solo. No uses `--sin-navegador`: pide pegar una dirección en la terminal y desde aquí no se le puede escribir.

## Paso 2. Activar la API de Apps Script (pantalla 2)

Le dices, antes de correrlo: "Reviso que tu cuenta tenga activa la API de Google Apps Script. Si se abre una página de Google con un interruptor que dice API de Google Apps Script, actívalo y regresa aquí; si arriba a la derecha ves otra cuenta, cambia a la tuya antes. Si no se abre nada, no tienes que hacer nada."

Corres: `cos api`, con un tiempo límite de 10 minutos. El paso crea en su Drive la Hoja "Chief of Staff", que es la memoria del motor, y luego el proyecto ligado a ella; así sabe si la API está activa. La Hoja se crea una sola vez aunque el paso se repita.

- Si contesta `"api": "activa"`, el proyecto ya existe: sigue.
- Si la API está apagada, el paso abre la página de ajustes de Apps Script con su cuenta, escribe en su salida "Abrí la página del interruptor API de Google Apps Script. Espero hasta 10 minutos a que lo actives." y espera. Esa línea sale antes que el JSON del final: si la ves, el paso está esperando el interruptor.

Compruebas: `"api": "activa"`, un `scriptId` y `hoja` con la dirección de la Hoja. Google puede tardar un par de minutos en reconocer el cambio; el paso espera solo.

## Paso 3. Instalar el motor

La preparación de juntas viene apagada: la instalación no pide el calendario. Si después la quiere, la prende en el menú de delegación (paso 7).

Corres: `cos desplegar --funciones ninguna`.

Le dices: "Instalo tu Chief of Staff en tu cuenta de Google. No toca tu correo todavía."

Compruebas: `"ok": true`, un `scriptId`, la URL de `app` y `permisos_google` sin `calendar.readonly`. El paso sube el código y publica dos accesos al mismo proyecto: la web app, que solo la persona puede abrir, y el acceso del conector, que exige la llave de esta instalación. La llave vive en la carpeta de la instalación y en su proyecto; nunca se la enseñas.

Si falla con `"siguiente": "instalador/cos api"`, regresa al paso 2. Repetir este paso es seguro: actualiza el mismo proyecto y conserva las URLs. Los dos accesos cambian juntos: si uno falla, el paso regresa el otro a su versión anterior y la salida lo dice en `regreso`; si tampoco puede regresarlo, dice qué quedó en qué versión, y corres `cos desplegar` otra vez. Al actualizar una instalación que ya corre, el paso reinstala el activador de cada 10 minutos desde el despliegue nuevo y la salida dice `"activador": "reinstalado"`; en una instalación nueva dice `sin_activador`, porque el activador llega con `cos motor`. Si trae `activador_error`, corre `cos motor`. Si hay permisos por aprobar, el activador se reinstala al terminar `cos autorizar`. Después, `cos estado` trae `corrida_al_dia`: si sale `false`, la última corrida usó otro despliegue y toca correr `cos motor`; si sale `null`, el motor todavía no corre desde el despliegue y la siguiente corrida llega en menos de 10 minutos.

## Paso 4. Dar permisos al motor (pantalla 3)

Le dices, antes de correrlo: "Ahora Google te pide permisos para el Chief of Staff. Toca Revisar permisos y elige tu cuenta. Google te va a enseñar un aviso con un botón azul grande, Volver a un lugar seguro. Ese no. Toca el enlace gris chico de abajo a la izquierda, Configuración avanzada, y luego Ir a Chief of Staff (no seguro). El aviso nombra como desarrollador tu propio correo, porque la app la creó tu instalación en tu cuenta. Marca todas las casillas y toca Continuar. Si tu Google está en inglés, el aviso dice Google hasn't verified this app, el botón azul es Back to Safety y los que tocas son Review permissions, Advanced, Go to Chief of Staff (unsafe) y Continue. Te pide leer y ordenar tu correo, hacer borradores, guardar su memoria en la Hoja "Chief of Staff", dar de baja las suscripciones que permita tu plan y trabajar por su cuenta cada 10 minutos. Nunca envía nada sin que tú toques Enviar."

Corres: `cos autorizar`. Abre su web app con su cuenta y espera hasta 15 minutos a que el motor conteste.

Compruebas: `"autorizado": true`. En una cuenta de Google Workspace la pantalla "no verificó" puede no aparecer: la app es de su propio dominio.

Si falla: pregúntale qué pantalla ve. Si tocó Volver a un lugar seguro (Back to Safety) o cerró la ventana, no pasa nada: Google no guardó ningún permiso. Le dices "No pasa nada, te la vuelvo a abrir." y corres `cos autorizar` otra vez cuando termine el que está esperando: abre de nuevo la web app y Google vuelve a enseñar la pantalla. Se puede repetir las veces que haga falta.

## Paso 5. El motor espera el plan

No corres `cos motor` todavía. El motor queda instalado sin activador: solo cuenta cuando Opus se lo pide. El activador de 10 minutos y las rutinas se instalan en el paso 7, cuando la persona aprueba el plan.

Antes de pasar al paso 6 arrancas el conteo de su mes, para que corra mientras conecta Claude: `cos herramienta analizar_bandeja '{"dias":30}'`. Contesta en segundos y el motor cuenta en segundo plano. No esperas el resultado: cuando la guía del paso 7 pida `analizar_bandeja(30)`, el motor da el conteo ya hecho o el que va avanzado, sin volver a empezar. Así la plática no espera esos minutos.

## Paso 6. Conectar Claude con su Chief of Staff (pantalla 4)

Le dices, antes de correrlo: "Se va a abrir Claude con tu Chief of Staff ya escrito. Revisa que diga Chief of Staff y toca Continuar. Luego sale otra pantalla con Autenticación, Cliente OAuth y Encabezados de solicitud: deja lo que viene marcado y toca el botón de abajo. Si te lo pide, toca Conectar. Si sale una página del Chief of Staff que pide un código, ya te lo dejé copiado: pégalo (Cmd+V en Mac, Ctrl+V en Windows) y toca Permitir. Lo demás termina solo."

Corres: `cos vincular`. El paso da de alta su motor en el relevo, deja el código en el portapapeles y abre en su navegador la página "Agregar conector personalizado" de Claude con el nombre y la dirección llenos (la liga oficial de claude.ai). Claude avisa que el conector viene de un enlace externo: es normal, el enlace lo abrió su instalación. Si su navegador no tiene abierta su cuenta de Claude, primero le pide entrar.

El relevo aprueba solo cuando el navegador trae el código que abrió `cos vincular` (vive 30 minutos y sirve una vez) y la conexión regresa a claude.ai. Si no, sale una página del Chief of Staff que pide el código (suele salir al conectar por primera vez). La persona pega el que ya dejó copiado `cos vincular` y toca Permitir. Si copió otra cosa en medio o pasaron más de 30 minutos, corre `cos codigo`: lo vuelve a copiar y, si venció, pide uno nuevo.

Compruebas: le pides que abra claude.ai/customize/connectors/yours, la pestaña Tuyos de Conectores, y que te diga si Chief of Staff aparece conectado. El conector que agrega la persona solo sale en Tuyos; en la lista principal de Conectores no aparece.

En Claude Code el conector no carga en la sesión que instala. La plática de la instalación usa `cos herramienta <nombre> '<json>'`: son las mismas herramientas, por el acceso directo de la instalación. Cuando la guía dice `ver_memoria('cuaderno')`, corres `cos herramienta ver_memoria '{"parte":"cuaderno"}'`. El conector sí queda para las sesiones nuevas, para Claude en su celular y para las rutinas.

Antes de la primera llamada corre `cos herramientas`: da el nombre y los argumentos de cada una (`cos herramientas <nombre>` trae también su descripción). Arma el JSON con esos argumentos; no los adivines leyendo el código del motor. Si una llamada falla, su salida trae el esquema de esa herramienta. Si el motor está terminando otra tarea o la conexión se corta, `cos herramienta` repite la llamada sola cuando no duplica nada. Si contesta que pudo haber terminado, revisa con una herramienta de lectura antes de repetirla. Los argumentos de cada una (con * los obligatorios):

| Herramienta | Argumentos |
|---|---|
| `ver_hoy` | `maximo`, `visita`, `mostrados` |
| `ver_novedades` | `desde` |
| `leer_hilo` | `id_hilo`*, `id_mensaje`, `desde` |
| `buscar` | `consulta`*, `maximo` |
| `analizar_bandeja` | `dias`, `maximo`, `desde_grupo`, `solo_grupos`, `corto`, `refrescar` |
| `ver_memoria` | `parte`*, `filtro` |
| `ver_politicas` | `filtro` |
| `ver_propuestas` | `estado`, `lote`, `tipo`, `lineamiento`, `maximo_correos`, `desde`, `maximo` |
| `ver_hechos` | `tipo`*, `desde`, `maximo`, `filtro` |
| `ver_agenda` | `dias` |
| `ver_whatsapp` | ninguno |
| `guardar_memoria` | `parte`*, `datos`* (lo que guardas va dentro de `datos`: `{"parte":"cuaderno","datos":{"agregar":"…"}}`) |
| `pedir_politica` | `texto`* |
| `guardar_politica` | `datos`*, `consentimiento` |
| `cambiar_politica` | `id`*, `nivel`, `estado`, `propuesta`, `consentimiento` |
| `simular` | `politicas`, `lote`, `hasta`, `dias`, `pagina`, `maximo` |
| `proponer` | `datos`*, `opId` |
| `responder` | `id`*, `opcion`, `texto`, `excluir` |
| `guardar_juicio` | `juicios` (o un solo juicio con `id_hilo`, `prioridad`, `recomendacion`, `motivo`, `confianza`, `politica`, `sensible`, `opciones`, `resumen`, `resumen_completo`, `opcional`, `caduca`, `proxima_revision`) |
| `corregir_juicio` | `id_hilo`*, `prioridad`, `motivo`, `persistente`, `despues`, `proxima_revision` |
| `seguimiento` | `datos`* |
| `guardar_whatsapp` | `chats`, `estado` |
| `exportar_evaluacion` | `desde`*, `hasta`, `pagina`, `maximo` |
| `aplicar` | `politicas`, `lote`, `hasta`, `dias`, `pagina`, `maximo`, `con_bajas`, `bandeja_inicial` |
| `actuar` | `id_hilo` o `hilos`, `accion`*, `carpeta`, `por`, `canal`, `automatico`, `politica` |
| `desuscribir` | `remitente`* |
| `redactar_respuesta` | `id_hilo`*, `texto`*, `responder_a_todos` |
| `deshacer` | `id` o `ids` |
| `pausar` | `activo`, `frecuencia` |
| todas | `corrida` (opcional): la mandan las rutinas con `{tipo, id}`; en la instalación no hace falta |

El conector queda en su cuenta de Claude: también lo tiene en Claude de su celular, sin hacer nada más.

Le dices: "Si el chat te pide permiso para una herramienta del Chief of Staff, elige Permitir siempre (Always allow). No cambies nada en los ajustes de tu cuenta." Con el modo Auto puede que ni aparezca. Las rutinas no lo necesitan: se rigen por sus `allowed_tools`, no por el ajuste de la cuenta (probado con una herramienta en Needs approval que la rutina usó sin preguntar).

## Paso 7. La plática de instalación y el plan

Sigue `cerebro/01_instalacion/GUIA_instalacion.md` de principio a fin: el motor cuenta su correo, Opus piensa (perfil, estilo y fichas), le presenta el plan, corre el simulacro del mes y espera su aprobación.

Antes de empezar, corre `cos estado` y guarda su `plan_url`. Es la dirección que te dio el instalador, la que pide la guía cuando `ver_propuestas.plan_url` viene en null. Ya trae `vista=plan`: la usas tal cual, sin agregarle nada.

Anota de esa plática su nombre: lo usas en el paso 9. El perfil de rutinas (ligero o completo) y las horas del juicio los guarda la guía en su memoria, y `cos rutina` los lee de ahí.

La guía termina cuando la persona aprueba el plan y el motor lo aplica. Solo entonces arrancas, en este orden:

1. Le dices: "Prendo la revisión de cada 10 minutos: lee tu correo nuevo y lo ordena según tu plan. Nunca envía nada sin que tú toques Enviar, y la pausas desde tu página del Chief of Staff." Luego corres `cos motor`: instala el activador de 10 minutos. Compruebas `"ok": true`.
2. El paso 9 (las rutinas) y, si quiere WhatsApp, el 9b.

Si no aprueba el plan en esta plática, no instalas ni el activador ni las rutinas: el Chief of Staff no trabaja hasta que lo apruebe.

Si en el menú de delegación prende "Preparar tus juntas", corre `cos desplegar --funciones juntas` y luego `cos autorizar`. Le dices: "Google te pide una pantalla más, solo para ver tu calendario, sin cambiarlo."

## Paso 8. Su voz y sus personas

Va dentro de la guía del paso 7, antes del plan: el motor cuenta 90 días de correos enviados y Opus escribe el perfil, el estilo de cómo escribe la persona y las fichas de las personas con las que trata. No es un paso aparte; si la guía todavía no lo trae, díselo en una línea y anótalo para la siguiente plática.

## Paso 9. El cerebro en la nube de Claude

Le dices, con sus horas: "Creo tres rutinas en la nube de Claude, que corren aunque tu computadora esté apagada: una revisa tu correo a las <horas que aprobó>, otra aprende cada mañana a las 7:07 de lo que hiciste y la del domingo a las 6:07 repasa tu semana. Solo usan tu Chief of Staff, no tu Gmail, y las pausas en claude.ai/code/routines."

Las rutinas se crean con RemoteTrigger. Antes carga la skill `schedule`: lista los ambientes de su cuenta. Usa uno sin repositorios (por ejemplo, Default) y anota su `id`.

Corres: `cos rutina --nombre <su nombre> --ambiente <id del ambiente>`. Lee del motor el perfil que aprobó (la línea "Rutinas:" de su perfil) y las horas que eligió Opus para entre semana y fin de semana (`horarios_juicio` de su experiencia). Compruebas que `fuente_horas` diga "experiencia de la persona" y que `perfil` sea el que aprobó. Si dice "respaldo", la guía no guardó las horas: guárdalas con `guardar_memoria("experiencia", {horarios_juicio: {entre_semana, fin_de_semana}})` y vuelve a correrlo. Si no hay horas de fin de semana, el ligero usa las de entre semana y el completo juzga a las horas de entre semana más cercanas a 10:07, 14:07 y 19:07 (`fuente_fin_de_semana` lo dice). Cada corrida de `cos rutina` reemplaza los cuerpos de `~/.chief-of-staff/rutinas`; antes guarda una copia con fecha en `~/.chief-of-staff/respaldos/` y dice dónde en `respaldo_rutinas`. Si la lista de fin de semana viene vacía, no hay juicio en fin de semana. El motor cuenta con esa misma regla las corridas que faltaron.

El paso devuelve tres rutinas: la revisión (una entre semana y otra del fin de semana, aunque las horas coincidan), el aprendizaje diario y el repaso del domingo. Un cron lleva un solo minuto: si las horas tienen minutos distintos, la revisión sale en más rutinas ("revisión entre semana", "revisión entre semana 2"). Cada rutina trae nombre, modelo, `cron`, `cron_utc`, `prompt_archivo` y `body_archivo`. `body_archivo` es el cuerpo listo para RemoteTrigger: horario, modelo, `allowed_tools`, ambiente, conector y el prompt completo, con su perfil y su horario ya escritos. El esfuerzo no se pone: el cuerpo no tiene dónde. Los horarios salen de `cerebro/02_rutina/CONFIG_rutinas.md`. `cron` lleva la zona horaria de su computadora (`CRON_TZ=America/Mexico_City ...`) y RemoteTrigger la acepta; al crearla, Claude dice la siguiente hora de corrida: compárala con su horario. `cron_utc` queda de respaldo.

El conector va por su `connector_uuid`, y en Claude Code nada lo da. Una rutina creada sin `mcp_connections` recibe todos los conectores de la cuenta, Gmail incluido; con el de Gmail podría enviar correos. Por eso, en este orden, y nunca enciendas una rutina antes de dejarle solo el conector del Chief of Staff:

1. **El alta, apagada.** RemoteTrigger `create` con el contenido de `alta_archivo` tal cual: la primera rutina, con `enabled: false`, sin conectores y sin instrucciones. De la respuesta anota el `id` de la rutina y, en `mcp_connections`, el conector cuya `url` es la de `conectores` en la salida de `cos rutina`: su `connector_uuid` y su `name`.
2. **Los cuerpos completos.** Corres otra vez `cos rutina --nombre <su nombre> --ambiente <id> --conector-uuid <connector_uuid> --conector-nombre <name>`. Ahora `falta` viene vacío.
3. **La primera rutina.** RemoteTrigger `update` sobre el `id` del alta con el contenido de su `body_archivo`: le deja solo el conector del Chief of Staff, le pone sus instrucciones y la enciende.
4. **Las demás.** RemoteTrigger `create` con el contenido de cada `body_archivo`, sin cambios.
5. **Cada una se verifica.** Cuando la respuesta de RemoteTrigger es larga, Claude la guarda en un archivo y dice dónde; si salió completa en el chat, guárdala tú con Write en `~/.chief-of-staff/rutinas/respuesta.json`. Corres `cos rutina --verificar <ese archivo>`. Debe contestar `"ok": true`. Si trae `diferencias`, corrígelas con `update` y verifica otra vez. Una rutina con más de un conector se apaga en el acto (`update` con `enabled: false`) hasta corregirla.

Para que ninguna rutina se detenga a pedir permiso: las rutinas corren en modo automático. Una herramienta preaprobada no pasa por el clasificador ni pregunta. El cuerpo trae en `allowed_tools` las herramientas del motor con el nombre `mcp__<name del conector>__<herramienta>` (por ejemplo, `mcp__Chief_of_Staff__ver_hoy`), salvo la de `sin_preaprobar` (`responder`): esa la decide la persona y una rutina no la usa. `cambiar_politica` sí va preaprobada: el repaso del domingo retira con ella lo que dejó de servir, y el motor solo la deja bajar un nivel o retirar una regla que no pidió la persona; para subir un nivel pide una propuesta aceptada o las palabras de la persona. `desuscribir` sí va preaprobada: con Bajas en Te aviso o Lo hago solo, Opus da la baja a un remitente conocido sin preguntar, y el motor rechaza la que no cumple esas condiciones. También va `PushNotification`: con ella la rutina le manda al celular lo urgente. No la quites. Si `cos rutina` contesta que el motor no dio su lista de herramientas, no crees ninguna rutina: comprueba con `cos estado` que el motor conteste y vuelve a correrlo.

Compruebas: corre una vez el juicio con RemoteTrigger `run` y revisa su registro con `list_runs` y `get_run_log`. El registro no debe traer pedidos de permiso ni rechazos. Si trae uno, el registro dice qué herramienta y con qué nombre: corrige `allowed_tools` con ese nombre y córrela otra vez. Si la cuenta es de una organización (Team o Enterprise) y el pedido dice "Your organization requires approval for this tool", lo decide quien administra la organización; díselo. La corrida debe terminar sin errores, usar solo herramientas del Chief of Staff (y `PushNotification` si avisó algo urgente) y cerrar con su resumen de tres líneas. Que la corrida aparezca en Actividad de la web app no basta: lo que cuenta es el registro.

Si el registro dice `mcp_auth_required` y no trae ninguna llamada al Chief of Staff, Claude perdió el permiso del conector. Lo reconectas ahí mismo, en este paso, sin esperar a otra corrida:

1. Corres `cos codigo`: deja el código en el portapapeles. Vive 30 minutos; si venció, pide otro.
2. Corres `cos conectores` y le dices: "Te abrí la pestaña Tuyos de Conectores (https://claude.ai/customize/connectors/yours). Tu Chief of Staff no sale en la lista principal. Tócalo y toca Conectar (Connect). Si sale la página del Chief of Staff que pide un código, ya te lo dejé copiado: pégalo (Cmd+V en Mac, Ctrl+V en Windows) y toca Permitir."
3. Corres otra vez el juicio con `run` y revisas su registro.

Nunca cierras la instalación con rutinas que no entran. Si después de reconectar la corrida vuelve a salir con `mcp_auth_required`, repites la reconexión una vez más. Si sigue, se lo dices en una línea, apagas las rutinas con `update` (`enabled: false`) y le dices que su Chief of Staff sigue ordenando su correo cada 10 minutos, pero sin el juicio de Opus, hasta que Claude vuelva a entrar.

### Si cambian las horas

Una rutina no puede cambiar su propio horario. Cuando la persona acepta mover las horas o cambiar de perfil (una propuesta con objeto `rutinas`), el motor guarda lo nuevo en su memoria. La siguiente vez que abra Claude Code en su computadora:

1. Con RemoteTrigger `list` buscas sus rutinas por nombre; `get` de una trae el `environment_id` y el `connector_uuid` y `name` de su conector.
2. Corres otra vez `cos rutina --nombre <su nombre> --ambiente <id> --conector-uuid <uuid> --conector-nombre <name>` y a cada rutina le pones con `update` el contenido de su `body_archivo`. Verificas cada una con `cos rutina --verificar`.
3. Si sale una rutina que no existía ("revisión entre semana 2"), la creas como arriba. Si sobra una, la apagas con `update` (`enabled: false`) y le dices que puede borrarla en https://claude.ai/code/routines.

Si no está en su computadora, en esa página puede cambiar la hora sin ayuda.

## Paso 9b. Su WhatsApp (si lo quiere)

Si en la plática quiso que el Chief of Staff lea su WhatsApp, sigue `whatsapp/tarea_programada/GUIA_instalador_Mac.md` (en Windows, la misma guía con los nombres de Windows): extensión Claude in Chrome con la misma cuenta, código QR de WhatsApp Web desde su teléfono, permiso del sitio, la tarea programada `cos-whatsapp`, la primera corrida acompañada y la energía de la computadora.

Antes de crear la tarea le preguntas: "¿Creo la tarea que lee tu WhatsApp tres veces al día? Lee mientras tu computadora esté prendida, con Claude y Chrome abiertos. Solo lee: nunca envía ni marca nada como leído." En modo automático, Claude bloquea `create_scheduled_task` y `run_scheduled_task` hasta que la persona dice que sí en la plática.

Para que la tarea no se detenga a preguntar: en la primera corrida acompañada ("Ejecutar ahora"), pídele que elija "Permitir siempre" en cada pedido de permiso; las aprobaciones quedan guardadas para las siguientes corridas.

Compruebas: `ver_whatsapp` trae la lectura con su hora.

## Paso 10. El Chief of Staff en su celular

Corres: `cos qr`. Abre una página con un código QR de su web app y los pasos para iPhone y Android.

Le dices: "Apunta la cámara de tu celular al código y ábrelo. Si te lo pide, entra con tu cuenta de Google. Si quieres tenerlo a la mano, agrégalo a tu pantalla de inicio; la página dice cómo."

Compruebas: la persona ve su Chief of Staff en el celular.

## Paso 11. Cierre

Corres: `cos estado`. Debe decir `"motor_contesta": true`.

Le dices, en tres líneas: qué quedó instalado, dónde lo ve (Claude, su página del Chief of Staff y su celular) y cómo lo pausa ("dile a Claude: pausa el Chief of Staff").

## Desinstalar

Corres: `cos desinstalar`. Apaga el motor y borra su alta en el relevo. Luego le das los cuatro pasos a mano que devuelve el comando: borrar el proyecto en Apps Script, quitar el conector en Claude, borrar las rutinas y quitar el acceso de clasp en su cuenta de Google.

## Referencia de pasos

| Paso | Qué hace |
|---|---|
| `preparar` | Node (si falta), clasp y el generador de QR en la carpeta de la instalación |
| `entrar [--de-nuevo] [--sin-navegador]` | Inicio de sesión de Google con cuatro permisos |
| `api [--segundos N]` | Crea la Hoja y el proyecto ligado a ella; si la API está apagada, abre el interruptor y espera |
| `armar [--funciones juntas]` | Arma el paquete sin subirlo y dice qué permisos pediría |
| `desplegar [--funciones juntas\|ninguna]` | Crea o actualiza el proyecto y sus dos accesos; si ya había activador, lo reinstala |
| `autorizar [--segundos N]` | Abre la web app para el permiso y espera al motor |
| `motor` | Instala el activador de 10 minutos; solo después de que la persona aprueba el plan |
| `vincular` | Alta en el relevo y Claude abierto con el conector ya escrito |
| `codigo` | Código de vinculación al portapapeles; pide otro si venció |
| `conectores` | Abre en su navegador la pestaña Tuyos de Conectores de Claude (reconexión) |
| `rutina --nombre N [--ambiente E] [--conector-uuid U] [--conector-nombre X] [--perfil ligero\|completo] [--horas 'HH:mm,HH:mm'] [--fin-de-semana 'HH:mm,HH:mm']` | Las rutinas del cerebro con el perfil y las horas de su memoria y sus herramientas preaprobadas: un cuerpo listo para RemoteTrigger por rutina (`body_archivo`) y el alta apagada (`alta_archivo`). `--perfil`, `--horas` y `--fin-de-semana` solo si el motor no contesta; las listas de horas van entre comillas simples |
| `rutina --verificar <archivo>` | Compara la respuesta de RemoteTrigger con su cuerpo: un solo conector, horario, modelo, herramientas, ambiente y prompt |
| `qr` | Página con el QR de la web app para iPhone y Android |
| `herramientas [nombre]` | Nombre y argumentos de cada herramienta del motor; con un nombre, también su descripción |
| `herramienta <nombre> '<json>'` | Llama una herramienta del motor sin pasar por Claude; si falla, trae el esquema de sus argumentos |
| `admin <accion>` | Acciones de administración del motor (`estado`, `instalar`, `desinstalar`) |
| `estado` | Qué está instalado, si el motor contesta y si la última corrida usó la versión desplegada |
| `desinstalar` | Apaga el motor y borra el alta en el relevo |
