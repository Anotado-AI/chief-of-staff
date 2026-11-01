# Lo que la web app necesita de la capa de inteligencia

Versión 3. Para la web app. Las formas de los datos son las acordadas entre el motor y la web app. Aquí va qué debe sentir la persona y qué texto escribe Opus para cada pantalla.

## La regla de fondo

La web app no habla con Opus. Todo lo que la persona hace ahí es una señal o una respuesta a una propuesta (`responder`), y Opus la lee en su siguiente corrida. Por eso cada pantalla dice cuándo pasa lo que la persona pidió: "Lo hago ahora" si lo ejecuta el motor; "Opus lo hace en su siguiente revisión, a las 13:07" si necesita a Opus.

Lo que la persona pide con sus palabras ya es su sí. Opus lo aplica en su siguiente corrida y contesta en una línea con Deshacer; no lo regresa como propuesta. Solo pregunta ante un tema sensible, una orden ambigua o una baja que necesita el sí: Bajas en Te propongo o apagada, remitente nuevo, ficha alta o tema sensible. Un rescate tampoco genera pregunta: la excepción queda y sale el domingo en el repaso, con Deshacer.

Quién hace qué, siempre claro. En la web app hablan tres: la app, Opus y la persona. La app dice "yo" solo de lo que hace: mover, archivar, avisar ("Moví 18 a Publicidad", "Te aviso"). Opus sale con su nombre en lo que juzga y aprende ("Opus te recomienda", "lo que Opus ya juzgó", "Opus aprendió"). La persona es "tú". En la plática de Claude es distinto: ahí habla Opus y dice "yo".

A la persona las políticas se le nombran reglas: en títulos, pestañas, botones y textos. Política es solo el nombre interno del motor y de sus herramientas.

## Su Hoy lo diseña Opus

La web app se pinta con la `experiencia` de cada persona (`ver_memoria('experiencia')`): `orden_hoy` dice qué secciones y en qué orden, `secciones_propias` agrega las que Opus inventa para la persona con `titulo` y `filtro` por política, ficha o prioridad ("Cobranza de clientes", "Lo de la escuela"), `textos` les pone nombre en sus palabras, `resumen` dice cuándo y qué tan largo, `decisiones` trae las tres que tomó al instalar, y `tono` cómo le habla. Cada resumen lo escribe la corrida de juicio más cercana a ese momento; el largo en la plática sale de `resumen.largo`. Opus la escribe al instalar y la ajusta cada domingo. Si falta, la web app usa su orden por omisión. Riesgo y temas sensibles siempre van arriba, diga lo que diga la experiencia. La persona la cambia con palabras en Claude ("el resumen, solo en la mañana").

## Plan de instalación

Es el lugar principal para decidir. En el chat, Opus manda la liga, dice que aquí está más claro y deja un resumen de 3 o 4 renglones con una sola pregunta. Aquí está todo, con ejemplos de su correo.

Ante la persona, el plan se llama "Tus instrucciones para tu Chief of Staff": es el título de esta pantalla y la palabra plan no sale en ella. El plan se organiza por lineamientos. La persona no aprueba decenas de reglas: decide 7 grandes líneas de qué hacer con cada tipo de correo. Opus las convierte en reglas y las guarda en su perfil como sus lineamientos, para tratar igual a los remitentes nuevos sin volver a preguntar. Cómo llega cada dato lo acuerdan el motor y la web app; aquí va lo que ve la persona. Meta: decidir en menos de 5 minutos.

El mensaje del chat abre con una liga que lleva directo al plan. Esa liga es la URL de la web app más `?vista=plan`: la página lee la vista con `google.script.url.getLocation` y un `#plan` no le llega. El motor la da en `plan_url` de `ver_propuestas` y `ver_hoy`.

Arriba:

1. **El resultado.** Primero lo sin leer, que es lo que más le importa a la persona: "De tus 39 sin leer, 6 te piden algo; los demás los marco leídos", de la tarjeta Sin leer. Luego, de `simular`: "Lo del último mes en tu bandeja pasaría de 348 a 104". Nunca el total de su bandeja ni el de lo anterior. Debajo, lo que abrió y quedaría escondido, uno por renglón con [Déjalo a la vista]: "Liverpool · Venta nocturna · llegó el 18-oct y lo abriste".
2. **Tu gente.** Las tarjetas de quien nunca espera, que la persona ya confirmó en Claude: nombre, relación y último asunto. Su correo siempre se queda en la bandeja. [Cambiar en Claude].
3. **Lo que te pide algo.** De 3 a 5 asuntos con quién, qué pide y la fecha, cada uno con [Ya lo resolví]. Lo que no marque sale en Hoy desde mañana.

**Tus lineamientos**, una tarjeta cada uno, en este orden: sin leer, lo que no abres, lo que lees con calma, lo que se repite, lo que sobra, tu bandeja al día y cuánto hago solo. Cada tarjeta lleva:

- El nombre y lo que hace, en una frase: "Lo que no abres: fuera de tu bandeja, a su carpeta y ya leído".
- El bloque de correo que toca: la cifra al mes, cuánto abre ("abres 2 de cada 100") y de 3 a 5 remitentes de ejemplo con su cifra.
- La recomendación de Opus ("Opus te recomienda…") y sus opciones como botones, con la recomendada marcada.
- Un toque abre las reglas que salen de ese lineamiento: carpeta, remitentes, cifra al mes y si va leída. Ahí se saca un remitente o se cambia de carpeta. En Facturas y pagos, una línea: "Si llega una cuenta bancaria nueva, un monto raro, un primer cobro, un pago por vencer o un cargo que no reconoces, te sale en Hoy".
- Si Opus tiene una duda real en ese lineamiento, va dentro de la tarjeta, con el correo de ejemplo y su recomendada marcada.

Lo propio de algunos:

- **Sin leer, solo lo que te necesita.** Va primero: es lo que más le importa a la persona. La cifra grande, por lo pendiente: "De tus 39 sin leer, 6 te piden algo; los demás los marco leídos". Debajo, los remitentes de lo que se marcaría leído, con su cifra. Sus opciones [Solo lo que te necesita] [Déjalos sin leer], con la primera marcada. Con la primera, lo que una regla manda a su carpeta también queda leído, salvo Leer después. Nunca el total de la bandeja.
- **Lo que sobra.** Arriba, la papelera: lo que borra sin abrir, con sus remitentes y su cifra, y sus opciones [Así] [Déjalo en mi bandeja]. Debajo, una línea por cada remitente para baja, con su propia pregunta: "Ofertas Viva: 8 al mes, abriste 0. ¿Te doy de baja o solo a la papelera?" [Darme de baja] [Solo a la papelera]. Nunca una opción que junte baja y papelera ni que dé de baja a varios: la persona decide cada una. Esas líneas no llevan opción marcada y [Acepto todo] no las toma; las que no conteste salen en la tarjeta del día. [Darme de baja] solo aparece con baja de un clic y remitente no sospechoso. La tarjeta dice que una baja no tiene Deshacer: se revierte en el sitio del remitente.
- **Tu bandeja al día.** Dos partes. Archivar cada noche lo leído que no le pide nada: con la recomendada marcada, "Acepto todo" la toma. Lo anterior a la fecha: la fecha, lo que trae y lo que se queda ("casi todo ya lo leíste, sobre todo de Mercado Libre y tu banco; se quedan como están 8"), sin cuántos se archivan ni cuántos se marcan leídos, y "Opus te recomienda marcar leído lo sin leer", sin opción marcada: [Marcar leído lo sin leer] [Archivar lo leído] [Las dos] [No]. Solo arranca con el toque de la persona; "Acepto todo" no lo toma. Lo sin leer nunca se archiva. Mientras el motor lo hace por partes, Hoy dice que sigue en curso, sin cuántos lleva ni cuántos son. Al terminar, dice que ya quedó, sin cifras.
- **Cuánto hago solo.** Tres tarjetas: Te propongo (cada cambio espera su sí en la tarjeta del día), Te aviso (lo hace y deja una línea por regla en Hoy, con Deshacer) y Lo hago solo (lo ve en el repaso del domingo). Cada una con lo que le costaría con su correo ("unos 8 sí al día", "cerca de 1 minuto al día"). Dinero, contratos y temas sensibles siempre se proponen.

Abajo, lo que va como Opus recomienda y se cambia cuando quiera, sin pedirle nada ahora:

- **Lo que siempre cuido.** Cobros fallidos y avisos de un servicio suyo que va a fallar: siempre en su bandeja. Códigos y avisos de acceso: en "Avisos de apps y seguridad", leídos, o en su bandeja, según eligió, y nunca a papelera, spam ni baja; lo que no hizo ella o toca su dinero sube a Hoy sin leer. Lo que se hace pasar por otro: a spam. El fraude que le toca: arriba en Hoy, sin moverlo.
- **Revisiones** (objeto `rutinas`): "Reviso tu correo 3 veces al día, un poco antes de cuando lo lees: 7:15, 13:45 y 20:45 entre semana; 11:45 sábado y domingo". [Cambiar en Claude].
- **Tres ajustes** (objetos `decision:enterarse`, `decision:pendientes` y `decision:caducidad`), cada uno con un ejemplo de su correo y [Cambiar]: "Cómo sé que ya viste algo: tocas Listo en Hoy. Por ejemplo, el recibo de CFE se queda en Hoy hasta que lo tocas". "Lo que leíste y te pide algo se queda en tu bandeja hasta que lo atiendes, como la firma que te pidió tu contador". "Las encuestas e invitaciones que no contestas salen de Hoy en unos 3 días, como la encuesta de Liverpool".
- **Tu Hoy** (objeto `experiencia`): una línea con su orden y su resumen, y [Cambiar en Claude].
- **Disponibles**: Juntas y Autonomía, apagadas y sin recomendación, con [Encender].

Un botón [Acepto todo] al final acepta los lineamientos con lo que la persona eligió o, si no tocó nada, con lo que Opus recomienda. No toma lo anterior a la fecha. El Chief of Staff no empieza hasta que la persona acepta su plan. En "Lo que Opus sabe de ti" salen sus lineamientos, con la fecha y sus palabras.

**Cómo se prende.** La web app define la constante `PLAN_POR_LINEAMIENTOS = true`. Con ella, `ver_propuestas` le dice a Opus `plan_por_lineamientos: true` y Opus arma una propuesta por lineamiento. Sin ella, Opus arma el plan carpeta por carpeta.

**De dónde sale cada dato.** Todo viene de `ver_propuestas({lote: 'instalacion'})`; `ver_propuestas({lineamiento: '<clave>'})` trae solo lo de una tarjeta.

| En la tarjeta | Sale de |
|---|---|
| Qué tarjeta y en qué orden | La propuesta con `objeto: 'lineamiento:<clave>'`. Claves, en orden: `sin_leer`, `lo_que_no_abres`, `con_calma`, `se_repite`, `sobra`, `al_dia`, `cuanto_hago_solo`. Si Opus no mandó una, esa tarjeta no va |
| El nombre y lo que hace | `texto` |
| La cifra al mes | `evidencia.cifra` |
| "De tus 39 sin leer, 6 te piden algo", arriba y en Sin leer | La propuesta `lineamiento:sin_leer`. `evidencia.antes` es lo sin leer de su bandeja (`ver_hoy.bandeja.sin_leer`); `evidencia.despues`, lo que la necesita (`te_necesitan`); `ejemplos`, los remitentes de lo que se marcaría leído |
| "Abres 2 de cada 100" | `evidencia.abiertos` entre `evidencia.cifra`, por 100 y redondeado. Con 0 abiertos: "no abriste ninguno" |
| Los remitentes de ejemplo | `evidencia.ejemplos`, cada uno `{remitente, cifra}` |
| "Y 27 remitentes más" | `evidencia.texto` |
| Las opciones y por qué | `opciones[].etiqueta`, con su `porque` debajo |
| La opción marcada | `recomendada`, que es una etiqueta. Sin `recomendada`, ninguna va marcada |
| Las tres tarjetas de Cuánto hago solo | `opciones[].valor` (`propone`, `avisa` o `solo`) dice cuál es cuál; `opciones[].costo` es "unos 8 sí al día" |
| Las reglas que salen, al tocar | Los `efecto` de la opción marcada o elegida: cada `{nivel: {politica}}` o `{politica: {id}}` es una regla. Su carpeta, remitentes, cifra y si va leída salen de esa regla |
| Una duda dentro de la tarjeta | Las propuestas `tipo: 'pregunta'` con el mismo `lineamiento` |
| Cada baja, en Lo que sobra | Las propuestas `grupo:<remitente>` con `lineamiento: 'sobra'` y sin `recomendada`. La pregunta es su `texto` |
| Sus avisos de acceso y seguridad, en Tu bandeja al día | La propuesta `decision:seguridad` con `lineamiento: 'al_dia'` y su `recomendada`. Va dentro de la tarjeta como una decisión con sus dos opciones; la cifra es `evidencia.cifra` y los ejemplos, `evidencia.ejemplos` |
| Lo anterior a la fecha, en Tu bandeja al día | La propuesta `historico:<fecha>` con `lineamiento: 'al_dia'` y sin `recomendada`. Lo que trae y la recomendación de Opus vienen en su `texto`. Ni `evidencia.cifra` (lo leído que se archivaría) ni `evidencia.se_marcan_leidos` se enseñan: son para el juicio de Opus. Se enseñan la fecha y lo que se queda (`evidencia.se_quedan`) |

Contestar una tarjeta es `responder` con la etiqueta de la opción, igual que en la tarjeta del día. Un cambio en palabras va como texto sin opción.

## Hoy

Arriba, la cifra principal: la bandeja al cierre de ayer, en una línea y por lo pendiente: lo que la necesita y lo sin leer, nunca el total de la bandeja ("Ayer cerraste con 6 correos que te necesitan y 0 sin leer"). Dice lo que pasó: nunca una tasa de acierto que salga de que no hubo rescates, como "Acerté en 49 de 52". La meta es cero correos por leer.

**En corto** (la propuesta de tipo `resumen`) trae un titular y hasta 4 viñetas, una por renglón y cada una empieza con "- ". La web app respeta los saltos de línea y pinta cada "- " como viñeta; nunca lo junta en un párrafo.

- **Riesgo primero**, en su propio color, con la recomendación: "No pagues; confirma con tu proveedor por teléfono".
- Luego los juicios por prioridad, cada uno con sus `opciones`. Corregir la prioridad es `corregir_juicio`, la señal más clara para que Opus mejore su juicio.
- **Borradores.** Un borrador de Opus sale en su asunto con el texto completo y [Enviar]. Solo sale del correo cuando la persona toca Enviar; Opus y las rutinas nunca envían. Si quiere cambiar algo, lo edita antes de enviar o se lo pide a Opus con palabras.
- **Lo que hice desde tu última visita** (`desde_tu_ultima_visita`): al abrir, un aviso discreto que se desvanece solo ("Desde el martes te ayudé con 255 correos") y una línea tranquila abajo de Hoy que abre la vista acumulada. La web app llama `ver_hoy({visita: true})` al abrir. Es una sola vista por regla, nunca una lista por día: si la persona falta tres días o se va de vacaciones, ve una vista, no un montón de avisos. Con total cero no se pinta nada.
- **Una línea por regla en `avisa`**, dentro de esa vista: "Publicidad: moví 18. [Bien] [Revisar]". En `solo`, la cifra se suma al resumen sin botones. Bajas no lleva [Deshacer]: su línea dice que la baja se revierte en el sitio del remitente. [Bien] es opcional: suma evidencia, pero no es la puerta. Si la persona encendió Autonomía, Opus juzga cuándo proponer "Lo hace solo" con lo que la persona hace: lo que la regla movió sin rescate ni deshacer y lo que abre en la carpeta. Se propone para su sí, un nivel a la vez, nunca en temas sensibles ni bajas.
- **[Listo]** confirma que se enteró de lo que Opus resumió (juicio con `resumen_completo`): `actuar(id_hilo, 'enterado')`. El motor marca leídos esos mensajes como `leido_por_resumen`, que no cuenta como abrió. Un toque para todo; lo sensible se confirma uno por uno. Lo que no trae `resumen_completo` no entra en [Listo]. Si la persona eligió "en automático" (`decisiones.enterarse`), no hay botón: la web app manda `actuar({hilos, accion: 'enterado', automatico: true})` con lo que mostró. `ver_hoy` no marca nada leído. Enterarse no es resolver: lo que pide algo sigue en su sección hasta que se atiende.
- **Lo opcional** (juicio con `opcional`: encuestas, invitaciones genéricas, pedidos de poco valor) lleva [Conservar] (`actuar(id_hilo, 'conservar')`). Sale de Hoy a su `caduca`, que pone Opus, o a las 72 horas; si está leído se archiva y si no, va a su carpeta sin marcar leído; sin carpeta, se queda en Recibidos y solo sale de Hoy. Un código o un acceso nunca caduca a una carpeta. Queda en Actividad y se puede buscar; Deshacer lo regresa a Hoy. Lo debido nunca caduca: compromisos, fechas, temas sensibles, fichas altas y riesgo se esconden hasta su `proxima_revision` y regresan con anticipación.
- **Si eligió la carpeta "Pendientes"** (`decisiones.pendientes`): la bandeja queda en cero, y lo leído que le pide algo vive en esa carpeta y en Hoy, en su sección, hasta que lo atiende.
- **Secciones propias**: las de `experiencia.secciones_propias`, en el lugar que dice `orden_hoy`, con lo que cumple su filtro.
- Si el juicio está detenido (`juicio_detenido`): "La revisión de Opus está detenida desde las 11:00. Sigo ordenando con lo que ya aprobaste".

## La tarjeta del día

Después de instalar, el Chief of Staff trabaja callado. Todo lo que necesita un sí de la persona sale en una sola tarjeta al día: las propuestas abiertas (`ver_propuestas({estado: 'abierta'})`) y la pregunta del día, si la hay.

- Una línea por propuesta, con la cifra y sus opciones: "Liverpool: 9 sin abrir esta semana. [A la papelera] [No]". La explicación se abre con un toque, nunca aparece sola.
- La pregunta, con el correo de ejemplo y la recomendada de Opus primero y marcada: "¿Los correos de Revolut te importan? [x] Solo los de mi cuenta [ ] Siempre [ ] Nunca".
- Abajo, [Acepto todo]: contesta con su opción recomendada cada propuesta que tiene una, preguntas incluidas. Opus marca su recomendada en toda pregunta y la persona la ve antes de aceptar. Lo que no trae recomendada se queda abierto. Es la misma regla del plan de instalación.
- Contestar es `responder`; el motor aplica el efecto en el acto. Si la persona no contesta, nada pasa: las propuestas vencen a los 7 días y Opus pregunta menos.
- La meta es que la tarjeta se resuelva en menos de un minuto. Opus la arma para que quepa.

## Esta semana Opus aprendió

La propuesta de tipo `repaso` del domingo. Arriba la cifra ("Esta semana limpié 312 correos y rescataste 3"). Debajo unas 3 líneas, cada una con su botón: [Deshacer] si ya lo hizo, [Aceptar] [No] si lo propone. Ahí salen las excepciones que Opus extendió después de un rescate, el total de lo opcional que caducó (sin repetir cada tarjeta), las reglas que Opus retiró porque no servían (las que no pidió la persona; las que pidió se retiran solo con su sí), los cambios al vocabulario de sus temas sensibles y una carpeta o regla nueva con su cifra; como referencia, una por semana para no cargar la tarjeta.

## Lo que Opus sabe de ti

El cuaderno, de `ver_memoria('cuaderno')`, en tres partes: lo que Opus aprendió, lo que le corregiste y lo que todavía no sabe. Solo lectura, con fecha en cada línea. Debajo, el perfil y las fichas (personas y organizaciones), donde la persona corrige con un toque: tipo, organización e importancia. El perfil trae cómo se dice cada tema sensible en su correo, en sus idiomas: lo escribe Opus y la persona lo corrige con palabras. Los cuatro temas no se quitan. Cada corrección es `corrigio_ficha` y manda sobre lo que Opus escribió. El perfil trae también "Mis lineamientos": un renglón por lineamiento, con la fecha y sus palabras. Se cambian pidiéndoselo a Opus en la caja de "Lo que hago" o en Claude.

## Lo que hago

Las reglas activas, cada una con su texto, nivel, cuántas veces actuó y sus métricas en palabras: "Aceptaste 17 de 20. Rescataste 0". En su detalle, bajo el título "Cómo decide Opus", va su `criterio`: Opus lo escribe para la persona, con su nombre y la persona como "tú" ("Si Opus no está seguro, lo deja en tu bandeja", "lo que Opus ya juzgó"). Si la regla no tiene criterio, no va la sección. Cambiar el nivel es `cambiar_politica`. Debajo, una caja: "Pídele algo a Opus con tus palabras". Lo escrito entra con `pedir_politica(texto)` y la tarjeta dice "Opus lo hace en su siguiente revisión, a las 13:07". Opus lo aplica y contesta en una línea con Deshacer; solo pregunta si toca un tema sensible, si es una baja que necesita el sí o si la orden es ambigua.

## Cómo se usa

Esta sección es la única fuente de este texto. La página y el cierre de la instalación lo toman de aquí, sin variantes. Las etiquetas son las que la página muestra hoy; si una cambia en la página, cambia aquí.

Dónde va en la página:
- Los primeros días, arriba de Hoy, una tarjeta de una línea, "Así se usa tu Chief of Staff", con [Ver cómo se usa] y [Entendido]. Se va con [Entendido] o después de 3 visitas.
- Siempre, una sección "Cómo se usa" con liga fija al pie de la página.
- Hoy sigue cabiendo en 3 pantallas o menos en un iPhone de 393 de ancho, también con la tarjeta de los primeros días.

El texto:

**Cómo se usa tu Chief of Staff**

En tu página
- **Hoy** te enseña lo que te pide algo, en orden. Toca un correo para abrirlo en Gmail. Toca Listo cuando lo resuelvas.
- **Necesita tu sí** trae lo que espera tu respuesta. Contestas con un toque.
- **Lo que hice hoy** muestra lo que moví o marqué, cada cosa con Deshacer. Lo de días anteriores está en **Actividad**.
- **Pedir**, en **Reglas**: escribe lo que quieres como se lo dirías a una persona. Por ejemplo: «si me escribe mi hija, avísame siempre».
- **Listo para enviar**: Opus te deja la respuesta escrita. Tú la revisas y tocas Enviar.
- Guarda esta página en la pantalla de inicio de tu celular.

En Claude
- Abre una plática y pregunta: «¿Qué tengo hoy?».
- Pide con tus palabras: «ya no me muestres lo de Liverpool». Opus lo hace y te lo dice en una línea, con Deshacer.
- «Contéstale a Ana que sí, el jueves»: te deja el borrador y tú lo envías.
- «¿Por qué moviste este correo?» o «¿Qué sabes de mí?».

Si algo no debió moverse, regrésalo a tu bandeja en Gmail. Opus lo nota y no lo vuelve a tocar.

Si la persona tiene WhatsApp conectado, "En tu página" lleva una línea más: "- **WhatsApp**: te resume lo que necesita respuesta."

## Textos que no cambian

- "Nunca envío nada sin que tú toques Enviar. Te dejo borradores."
- "Nunca borro para siempre. Lo que va a la papelera se recupera en 30 días."
- "En dinero, contratos, consejo y prensa siempre te pregunto."
