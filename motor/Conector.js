// --- Conector MCP del Chief of Staff ---
// Transporte HTTP de MCP sin sesión ni SSE: cada POST trae un mensaje (o un lote) y la respuesta va en JSON.
// La llave viaja en ?k=. Un relevo en Cloudflare evita el redireccionamiento de Google que los clientes
// oficiales no siguen. Las mismas 29 herramientas sirven a Claude, a las rutinas y a la web app.
// Nunca envía correos. Nunca borra para siempre.

const CONECTOR = {
  NOMBRE: 'chief-of-staff',
  VERSION: '3.7.3',
  TOPE_INSTRUCCIONES: 4090,
  PERFIL_INSTRUCCIONES: 500,
  POLITICAS_INSTRUCCIONES: 400,
  ESTADO_INSTRUCCIONES: 150,
  SEG_REPETIDA: 600,
  GEN: 'cos3.gen'
};

// La llave vive solo en Instalacion.js, que escribe el instalador en cada proyecto y no va al repo. Sin ella el conector
// rechaza todo.
function llaveConector_() {
  return typeof INSTALACION !== 'undefined' && INSTALACION && INSTALACION.llave ? String(INSTALACION.llave) : '';
}

// ---------- Herramientas ----------
function herramientas_() {
  // corrida va en todas: la rutina la manda igual en cada llamada y así su cuenta no suma la plática que coincide con ella.
  const corrida = { type: 'object', description: 'Solo en las rutinas: {tipo, id}, el mismo en cada llamada de la corrida.',
    properties: { tipo: { type: 'string', enum: ['cada_hora', 'diaria', 'semanal'] }, id: { type: 'string' } } };
  const t = (name, title, description, props, required, notas) => ({
    name: name, title: title, description: description,
    inputSchema: { type: 'object', properties: Object.assign({}, props, { corrida: corrida }), required: required || [], additionalProperties: false },
    annotations: Object.assign({ title: title }, notas)
  });
  const lee = { readOnlyHint: true, openWorldHint: false };
  const cambia = (destructivo, idempotente) => ({ readOnlyHint: false, destructiveHint: !!destructivo, idempotentHint: idempotente !== false, openWorldHint: false });
  const hilo = { type: 'string', description: 'id_hilo de ver_hoy, ver_novedades o buscar.' };
  const lotePol = {
    politicas: { type: 'array', items: { type: 'string' }, description: 'Ids de políticas.' },
    lote: { type: 'string', description: 'Lote de propuestas, por ejemplo instalacion. En simular, "bandeja_inicial" da solo la cuenta de lo anterior a los últimos 30 días: los leídos que archivaría de Recibidos (se_archivan) y los sin leer que marcaría leídos (se_marcan_leidos), con el efecto para la opción del plan y su modo (archivar, leido o ambos).' },
    hasta: { type: 'string', description: 'Solo con lote "bandeja_inicial": fecha de corte AAAA-MM-DD, 30 días atrás o antes (hace 30 días por omisión). Cuenta lo leído anterior a esa fecha.' },
    dias: { type: 'integer', minimum: 1, maximum: 90, description: 'Días hacia atrás de la bandeja (30 por omisión).' },
    pagina: { type: 'string', description: 'El valor siguiente de la respuesta anterior.' },
    maximo: { type: 'integer', minimum: 1, maximum: 200, description: 'Hilos por página (200 por omisión).' }
  };
  const lista = [
    // Leer (11)
    t('ver_hoy', 'Ver lo de hoy', 'La pantalla Hoy: instalacion (trabaja: true solo con el activador de la corrida puesto y una rutina que ya llamó; falta dice qué no), desde_tu_ultima_visita (lo que hicieron las políticas desde la visita anterior, una línea por política, con su total), juicios vivos unidos a su hilo (remitente, nombre, asunto, ficha) con sus opciones para tocar (un aviso que Gmail mandó a spam y no es ruido sale con donde: "spam" y sacar_de_spam: true, para que ella lo saque con un toque en la web app), avisos del día, una línea por política en Te aviso (con [Bien] = responder(id de la línea, "Bien") y [Deshacer]), seguimientos, WhatsApp, juicio_detenido y las últimas corridas. apartado: lo que las reglas movieron a carpetas desde la visita anterior, una línea por carpeta con quién lo mandó. conexion.reconectar: las rutinas dejaron de llamar (2 revisiones o más). cupo_diario: desde el 80% de lo que Google le da a la cuenta al día; recurso dice cuál se acaba (tiempo o lecturas) y su texto se le dice tal cual; accion reducir_frecuencia o reanudar es pausar({frecuencia}). correo_sin_revisar: llegó más correo del que alcancé a revisar entre dos lecturas; dile su texto y sugiérele buscar en Gmail lo que esperaba de esas horas (desde, hasta). ultima_corrida: hora de la última corrida del motor, version (la de la instalación que la corrió) y motor (la versión del motor). Las propuestas no van aquí: ver_propuestas({estado: "abierta"}).',
      { maximo: { type: 'integer', minimum: 1, maximum: 30, description: 'Juicios a mostrar (20 por omisión).' },
        visita: { type: 'boolean', description: 'true al mostrarle Hoy a la persona (la web app al abrir, Claude en la plática): desde_tu_ultima_visita sale desde la visita anterior y esta queda guardada. Las rutinas nunca lo mandan.' },
        mostrados: { type: 'array', items: { type: 'string' }, description: 'Solo la web app: los id_hilo que de verdad mostró con su resumen. Con Enterarse en automático quedan leídos, igual que actuar({hilos, accion: "enterado", automatico: true}); lo sensible nunca. Por el conector no marca nada.' } }, [], lee),
    t('ver_novedades', 'Ver el correo nuevo', 'Lo nuevo de la bandeja que todavía no tiene juicio (hasta 25 hilos), con sus hechos: corresponsal, conocido, ficha, lista, categoría de Gmail, tipo de baja, lo que haría el motor y si espera tu juicio. Trae también documentos_de_dinero sin juicio aunque una política ya los haya movido, cada uno con donde está y cobros_90d del mismo remitente (cuántos, los 3 últimos id_hilo, primer_cobro): revisa cuenta nueva o distinta (riesgo), monto fuera de lo normal, primer cobro, pago por vencer y cargo que no reconoce. Trae también movidos_con_criterio: lo que movió una política con criterio y no has juzgado, con donde está y el criterio que te toca aplicar (por ejemplo, lo que pide algo con fecha sale en Hoy). Por omisión, desde que la bandeja quedó al corriente (todo lo anterior ya tenía juicio), con un máximo de 14 días; sin ese punto, los 14 días. No pases desde en la corrida normal: lo que una corrida dejó sin juzgar sale en la siguiente, y un hilo que no se pudo leer también. ver_hoy da el mismo total en sin_juicio. sin_juicio es el total de la ventana; quedan_por_leer, los que no cupieron en esta llamada. Juzga cada hilo con guardar_juicio y vuelve a llamar.',
      { desde: { type: 'string', description: 'AAAA-MM-DD HH:mm, AAAA-MM-DD o horas (6h).' } }, [], lee),
    t('leer_hilo', 'Leer una conversación completa', 'El hilo completo por mensaje (hasta 20): dirección real, nombre mostrado, responder a (si difiere), SPF, DKIM y DMARC, si el remitente o su dominio escriben por primera vez en 90 días, texto sin citas y adjuntos. Una dirección real distinta del nombre mostrado, un responder a ajeno o una autenticación fallida son señales de suplantación. Un mensaje de más de 4,000 caracteres trae el principio y el final con recortado y omitido {desde, caracteres}: para leer lo de en medio, llama otra vez con id_mensaje y desde; cada página trae 8,000 y siguiente_desde si hay más.',
      { id_hilo: hilo, id_mensaje: { type: 'string', description: 'Solo ese mensaje del hilo, para leer un texto largo por páginas.' }, desde: { type: 'integer', minimum: 0, description: 'Con id_mensaje: el carácter donde empieza la página (el omitido.desde o el siguiente_desde de la llamada anterior).' } }, ['id_hilo'], lee),
    t('buscar', 'Buscar en tu correo', 'Busca hilos con la sintaxis de Gmail (from:, subject:, newer_than:, has:attachment…) y los une a su juicio y su ficha. Hasta 25 hilos por llamada (10 por omisión) y sin páginas: si pides más, devuelve 25 con recortado: true y maximo_aplicado. hay_mas: true si Gmail tiene más resultados; para verlos, acota la consulta con fechas (after:, before:). Cada hilo trae para (las direcciones) y para_nombre (el nombre que muestra Gmail). El total de enviados y a quién escribe la persona vienen en analizar_bandeja.',
      { consulta: { type: 'string' }, maximo: { type: 'integer', minimum: 1, maximum: 25, description: 'Hilos a devolver: hasta 25 (10 por omisión).' } }, ['consulta'], lee),
    t('analizar_bandeja', 'Revisar tu bandeja por remitente', 'El correo de N días agrupado por remitente, solo hechos. Primero lo general: bandeja de hoy (con llegaron_a_tu_bandeja_30d: los hilos que llegaron a Recibidos en 30 días, lo que sigue ahí, lo archivado a mano y lo que mandó a la papelera; es la misma cifra que simular.resumen.antes con dias 30), filtros y etiquetas que ya tiene la persona, horas de envío (entre semana y fin de semana aparte), enviados_90d (total, reenvíos y los 15 destinatarios principales con sus correos y la fecha del último), totales, marcado masivo, dominios y listas. Al final, los grupos: llegados, abiertos (en el periodo confiable tras un marcado masivo), contestados (en 1 hora y en 24 horas), lista, categoría de Gmail, baja (un_clic, solo_correo o ninguna), plataforma y asuntos de muestra. Los grupos van por páginas: maximo (30 por omisión, con su muestra) y desde_grupo; siguiente_desde_grupo trae el valor para pedir los que siguen. Lo general va solo en la primera página (desde_grupo 1); las que siguen traen solo grupos, salvo solo_grupos: false. corto: true quita la muestra de asuntos después del grupo 20. La respuesta cabe siempre en unos 45,000 caracteres: si no cabe, quita la muestra desde la cola y lo dice en recortado_por_tamano. Tarda minutos con mucho correo: si responde en_proceso, vuelve a llamar en un minuto. No decide nada: para eso está simular.',
      { dias: { type: 'integer', minimum: 1, maximum: 90 }, maximo: { type: 'integer', minimum: 1, maximum: 200, description: 'Grupos por página (30 por omisión).' },
        desde_grupo: { type: 'integer', minimum: 1, maximum: 200, description: 'Primer grupo de la página (1 por omisión); usa siguiente_desde_grupo de la respuesta anterior. Desde el grupo 2, la página trae solo grupos.' },
        solo_grupos: { type: 'boolean', description: 'true: sin lo general, solo los grupos. false: lo general en cualquier página.' },
        corto: { type: 'boolean', description: 'true: sin asuntos de muestra después del grupo 20.' }, refrescar: { type: 'boolean' } }, [], lee),
    t('ver_memoria', 'Ver lo que Opus sabe de ti', 'Lo que sabes de la persona. parte: perfil, estilo, experiencia (cómo se ve su Hoy), cuaderno (Markdown) o fichas. Cada rutina empieza con ver_memoria("cuaderno", {corrida: "juicio" | "diaria" | "semanal"}): así el motor cuenta sus llamadas. Para fichas, filtro {id, correo, organizacion, dominio, texto, tipo, maximo}; la gente de una organización se pide con {organizacion: id}.',
      { parte: { type: 'string', enum: ['perfil', 'estilo', 'experiencia', 'cuaderno', 'fichas'] }, filtro: { type: 'object' } }, ['parte'], lee),
    t('ver_politicas', 'Ver tus reglas', 'Las políticas con su texto, nivel, estado, compilación, versión, lo que fijó la persona y sus métricas: disparos, aceptadas (sí explícito), observadas (7 días sin deshacer ni rescate; no es aprobación), corregidas, rechazadas, rescates y las últimas 20.',
      { filtro: { type: 'object', description: '{id, estado, nivel, origen}' } }, [], lee),
    t('ver_propuestas', 'Ver lo que espera tu sí', 'Las propuestas con sus opciones y su efecto. Por omisión, las abiertas. estado: abierta, aceptada, corregida, rechazada, vencida o todas. Van por páginas de 60: total dice cuántas hay y, si hay más, siguiente_desde es el valor de desde para pedir las que siguen con los mismos filtros.',
      { estado: { type: 'string' }, lote: { type: 'string' }, tipo: { type: 'string' }, lineamiento: { type: 'string', description: 'Solo las de ese lineamiento del plan: lo_que_no_abres, con_calma, se_repite, sobra, al_dia o cuanto_hago_solo.' }, maximo_correos: { type: 'integer', minimum: 1, maximum: 100 },
        desde: { type: 'integer', minimum: 1, description: 'Primera propuesta de la página (1 por omisión).' }, maximo: { type: 'integer', minimum: 1, maximum: 400, description: 'Propuestas por página (60 por omisión).' } }, [], lee),
    t('ver_hechos', 'Ver lo que pasó', 'Lo que pasó: senales (lo que hizo la persona), juicios, seguimientos, actividad (con id para deshacer), corridas o conflictos (políticas que chocaron en un correo).',
      { tipo: { type: 'string', enum: ['senales', 'juicios', 'seguimientos', 'actividad', 'corridas', 'conflictos', 'bandeja'] }, desde: { type: 'string' }, maximo: { type: 'integer', minimum: 1, maximum: 300 }, filtro: { type: 'object' } }, ['tipo'], lee),
    t('ver_agenda', 'Ver tu agenda', 'Las juntas de los próximos días con sus asistentes y su ficha. Solo con la política Juntas encendida y el permiso de calendario; si falta algo, responde disponible: false con el motivo.',
      { dias: { type: 'integer', minimum: 1, maximum: 14 } }, [], lee),
    t('ver_whatsapp', 'Ver tu WhatsApp', 'La última lectura buena de WhatsApp, el último intento y como_leer: los pasos para una lectura en vivo desde la plática (Claude no lee los archivos de la computadora).', {}, [], lee),
    // Memoria (1)
    t('guardar_memoria', 'Guardar lo que Opus aprende de ti', 'perfil o estilo: {texto} (reemplaza; en perfil, {sensibles: [{tema, palabras}]} es la lista completa de temas extra; dinero, contratos, consejo y prensa siempre cuentan y no se pueden quitar). experiencia: {orden_hoy [secciones], textos {seccion: su nombre}, resumen {momentos, largo}, horarios_juicio ["HH:mm"], tono}; lo que no pases se queda, y lo que pidió la persona no se cambia sin su sí; riesgo y temas sensibles van arriba siempre. cuaderno: {agregar: {seccion: aprendi | me_corrigio | no_se, texto, evidencia, cambio}} suma una lección fechada; {reemplazar} deja el cuaderno completo: en la instalación y en el repaso semanal. fichas: una o hasta 50 {id?, tipo: persona u organizacion, nombre, direcciones, dominios, organizacion, rol, relacion, importancia, notas, definido_por}. Lo que fijó la persona no se sobrescribe. Todo queda en Actividad con deshacer.',
      { parte: { type: 'string', enum: ['perfil', 'estilo', 'experiencia', 'cuaderno', 'fichas'] }, datos: { description: 'Va dentro de datos, según la parte: perfil o estilo {texto}; experiencia {orden_hoy, secciones_propias, textos, resumen, horarios_juicio, tono, decisiones}; cuaderno {agregar: {seccion, texto, evidencia, cambio}} o {reemplazar}; fichas {tipo, nombre, direcciones o dominios, ...} o una lista.' } }, ['parte', 'datos'], cambia(false)),
    // Políticas (4)
    t('pedir_politica', 'Pedir una regla', 'La persona pide una política en sus palabras. Queda en borrador; Opus la interpreta y la propone en su siguiente corrida.',
      { texto: { type: 'string' } }, ['texto'], cambia(false)),
    t('guardar_politica', 'Guardar una regla', 'Opus interpreta una política: {id?, nombre, texto, acciones, compilado: {condiciones, excepciones}, criterio, cuando, nivel, evidencia}. Condiciones: remitente, dominio, lista, categoria_gmail, consulta (sin in:, is:, label: ni fechas), ficha o importancia. Se prueba contra 14 días y queda propuesta. Una activa no cambia texto, acciones ni nivel sin el sí de la persona; la compilación de una en Te propongo se cambia proponiendo. Lo que la persona fijó gana.',
      { datos: { type: 'object' }, consentimiento: { type: 'object', description: 'Lo que pidió la persona en esta plática: {canal: "claude", palabras literales, 8 caracteres o más}. Con él la política queda activa al nivel que ella implicó (avisa si no lo dijo), hasta Te aviso, salvo bajas; Lo hago solo pide propuesta. Deja un aviso en Hoy con Bien y Deshacer. Lo que escribió en la web app no se pasa aquí: el motor lo guarda y lo usa solo (para una respuesta escrita, pasa datos.propuesta).' } }, ['datos'], cambia(false)),
    t('cambiar_politica', 'Prender, apagar o ajustar una regla', 'Cambia el nivel (apagado, propone, avisa, solo) o el estado (activa, pausada, retirada). Bajar el nivel o apagarla no pide sí, salvo una regla que pidió la persona o encendió con sus palabras, o una que protege (importante, nunca_limpiar, aviso_en_hoy, Protección): esas piden su sí para bajar, apagar, pausar o retirar. Con rescates arriba de 2%, una suya que no protege baja un nivel sin preguntar. Su sí son sus palabras en esta plática (consentimiento), que piden ese cambio y nombran la regla, y llega hasta Te aviso. Lo demás necesita una propuesta aceptada con objeto = id de la política (pásala en propuesta), que vale solo para su cambio exacto y una vez. En una rutina no hay palabras de la persona: lo que pide su sí queda como propuesta. Desde la web app la persona lo cambia directo.',
      { id: { type: 'string' }, nivel: { type: 'string', enum: ['apagado', 'propone', 'avisa', 'solo'] }, estado: { type: 'string', enum: ['activa', 'pausada', 'retirada'] }, propuesta: { type: 'string', description: 'Id de la propuesta aceptada.' },
        consentimiento: { type: 'object', description: 'Lo que pidió la persona en esta plática: {canal: "claude", palabras literales, 8 caracteres o más}. Vale como su sí hasta Te aviso, salvo en Bajas; Lo hago solo pide propuesta. Deja un aviso en Hoy con Bien y Deshacer.' } }, ['id'], cambia(false)),
    t('simular', 'Ver qué harían tus reglas sin mover nada', 'Lo que harían las políticas con la bandeja, hilo por hilo, sin tocar nada: resumen {antes, despues, salen, abiertos_que_salen} acumulado entre páginas y decisiones [{id_hilo, remitente, asunto, decision, motivo, politica, abrio}]. Con lote, simula el plan como si la persona aceptara cada opción recomendada. Con politicas, esas aunque no estén activas.',
      lotePol, [], lee),
    // Conversación (2)
    t('proponer', 'Proponerte un cambio', 'Deja una propuesta: {tipo (plan, politica, nivel, ficha, pregunta, repaso), texto (una o dos líneas), opciones [{etiqueta, efecto}], recomendada, evidencia {cifra, ejemplos}, confianza, objeto, lote, id_hilo}. efecto: {politica: {...}}, {nivel: {politica, nivel}}, {ficha: {...}}, {desuscribir: [remitentes]} o {aplicar: true}; con usar_texto_como: carpeta o nombre, el texto de la respuesta renombra. Topes: 3 preguntas al día y 7 abiertas fuera del plan. Una rechazada no se repite sin una cifra mayor.',
      { datos: { type: 'object' }, opId: { type: 'string', description: 'Id propio de esta llamada: si un reintento trae el mismo opId, regresa la propuesta que ya quedó y no crea otra.' } }, ['datos'], cambia(false)),
    t('responder', 'Guardar tu respuesta a una propuesta', 'Contesta una propuesta y el motor aplica el efecto en el acto. opcion: la etiqueta elegida o su id. texto: lo que escribió la persona (renombrar o juntar carpetas). excluir: ids de hilo que no se aplican. También marca [Bien] en una línea de aviso de Hoy (id aviso|politica|dia).',
      { id: { type: 'string' }, opcion: { type: 'string' }, texto: { type: 'string' }, excluir: { type: 'array', items: { type: 'string' } } }, ['id'], cambia(false)),
    // Hechos (5)
    t('guardar_juicio', 'Anotar qué necesita cada correo', 'Tu juicio de un hilo: prioridad (riesgo, alta, media, baja, ruido), recomendacion, motivo, confianza (0 a 1), politica, sensible (dinero, contratos, consejo, prensa u otro tema del perfil) y opciones [{etiqueta, accion (borrador, mover, papelera, spam, leido, importante, seguimiento, nada), texto o carpeta}]. Un lote de hasta 25 va en juicios. Vence si llega un mensaje nuevo. La corrección de la persona manda.',
      { id_hilo: hilo, prioridad: { type: 'string', enum: ['riesgo', 'alta', 'media', 'baja', 'ruido'] }, recomendacion: { type: 'string' }, motivo: { type: 'string' },
        confianza: { type: 'number', minimum: 0, maximum: 1 }, politica: { type: 'string' }, sensible: { type: 'string' }, opciones: { type: 'array', items: { type: 'object' } },
        resumen: { type: 'string' }, resumen_completo: { type: 'boolean' }, opcional: { type: 'boolean' }, caduca: { type: ['string', 'number'] }, proxima_revision: { type: 'string' },
        juicios: { type: 'array', maxItems: 25, items: { type: 'object' }, description: 'Lote: [{id_hilo, prioridad, recomendacion, motivo, confianza, politica, sensible, opciones, resumen, resumen_completo, opcional, caduca, proxima_revision}].' } }, [], cambia(false)),
    t('corregir_juicio', 'Corregir la prioridad de un correo', 'La persona corrige la prioridad de un hilo. Anota corrigio_juicio y gana sobre el juicio de Opus hasta que llegue un mensaje nuevo. Con despues (esta_tarde, manana o lunes) y sin prioridad, es el Después de la tarjeta: esconde el hilo de Hoy hasta esa hora.',
      { id_hilo: hilo, prioridad: { type: 'string', enum: ['riesgo', 'alta', 'media', 'baja', 'ruido'] }, motivo: { type: 'string' }, persistente: { type: 'boolean', description: 'true es Conservar: lo opcional no caduca.' },
        despues: { type: 'string', enum: ['esta_tarde', 'manana', 'lunes'], description: 'Vuelve a Hoy esta tarde (17:00, o 20:00 desde las 16:00), mañana o el lunes a las 8:00.' },
        proxima_revision: { type: 'string', description: 'Lo mismo que despues, con la fecha: AAAA-MM-DD HH:mm.' } }, ['id_hilo'], cambia(false)),
    t('seguimiento', 'Seguir un pendiente', 'Abre o cierra un seguimiento: {accion: "abrir", id_hilo o chat, direccion (le_deben o debe_la_persona), que (hasta 80 caracteres), dias} o {accion: "cerrar", id, motivo}. El Después de la tarjeta: {accion: "posponer", id, despues: esta_tarde, manana o lunes}. Con la política apagada, solo a pedido (a_pedido: true).',
      { datos: { type: 'object' } }, ['datos'], cambia(false)),
    t('guardar_whatsapp', 'Guardar la lectura de WhatsApp', 'Guarda una lectura de WhatsApp. estado ok con chats [{chat, es_grupo, no_leidos, ultimo_mensaje_fecha, resumen, necesita_respuesta, compromiso}]; con sin_chrome, sin_sesion o error solo anota el intento y conserva la última lectura buena. Una fecha AAAA-MM-DD se devuelve igual.',
      { chats: { type: 'array', items: { type: 'object', properties: { chat: { type: 'string' }, es_grupo: { type: 'boolean' }, no_leidos: { type: 'integer' }, ultimo_mensaje_fecha: { type: 'string' },
        resumen: { type: 'string' }, necesita_respuesta: { type: 'boolean' }, compromiso: { type: ['string', 'null'] } }, required: ['chat'] } },
        estado: { type: 'string', enum: ['ok', 'sin_chrome', 'sin_sesion', 'error'] } }, [], cambia(false)),
    t('exportar_evaluacion', 'Ver el registro de un periodo', 'Hechos de un rango para la evaluación y los pilotos (solo lectura). Arriba: instalacion_cerrada, temas_sensibles, carpeta_leer_despues. Por hilo: llegada, remitente, nombre_mostrado, dominio, asunto, extracto, lista, baja, categoría, le_escribio_90d, ficha y organización, decision {destino, carpeta, leido, politica, version, actor, hora} (lo que hizo el sistema), juicio {prioridad, confianza, sensible, hora}, abierto, contestado y rescatado. En la primera página, las senales (con detalle) y la actividad (con objeto) del rango. Por páginas de 200.',
      { desde: { type: 'string', description: 'AAAA-MM-DD o -60d.' }, hasta: { type: 'string' }, pagina: { type: 'string' }, maximo: { type: 'integer', minimum: 1, maximum: 200 } }, ['desde'], lee),
    // Correo (5)
    t('aplicar', 'Aplicar tus reglas', 'Aplica políticas activas a la bandeja de los últimos días, por páginas. Ningún correo se mueve sin una política activa. Con lote, las que activó el plan aceptado (y da las bajas aprobadas en su primera página). En Te propongo, desde la plática deja una propuesta en vez de mover. Un tema sensible siempre se propone. Los movimientos quedan en Actividad con Deshacer por 30 días; las bajas no tienen Deshacer: se revierten en el sitio del remitente.',
      Object.assign({}, lotePol, { con_bajas: { type: 'boolean', description: 'false para no dar las bajas aprobadas del lote.' },
        bandeja_inicial: { type: 'boolean', description: 'true solo dice cómo va la limpieza de lo anterior a una fecha (archivar lo leído, marcar leído lo sin leer o ambos). Nunca la arranca: empieza al contestar que sí a la propuesta historico:<fecha> (efecto {bandeja_inicial: {modo}}; sin modo, archivar).' } }), [], cambia(false)),
    t('actuar', 'Mover o marcar correos', 'Una acción sobre un hilo o un lote de hasta 25: mover (a una carpeta), papelera, spam, sacar_de_spam, leido o importante. sacar_de_spam regresa a Recibidos un aviso legítimo que Gmail mandó a spam; va sin politica, con hasta 5 hilos por llamada y 20 al día, y solo saca lo que tiene SPF o DKIM alineados con el dominio del remitente, sin ninguna falla, de un remitente conocido (la persona le escribe, ya lo juzgaste o tiene ficha) que nunca juzgaste ruido, riesgo o fraude, sin juicio de riesgo, ruido o fraude en ese hilo, y que no mandó Protección; lo demás responde sin_cambio con sospechoso y lo saca la persona desde la web app, donde Hoy le ofrece Sacar de spam. Sin politica es un pedido de la persona. Con politica manda su nivel: en Te propongo queda en la propuesta del día de esa política (al aceptarse se aplican las acciones de la política) y un juicio sensible siempre se propone. Con politica, lo que nunca se limpia (accesos, alertas de seguridad, cobros fallidos, cambios de plan o contrato y suspensiones; el código de verificación sin leer o de menos de 72 horas) no se mueve ni se marca leído, y nada sin leer se archiva: responde sin_cambio con protegido. La excepción es spam con politica proteccion: el fraude que imita un aviso va a spam. Tiene deshacer. Nunca borra para siempre.',
      { id_hilo: hilo, hilos: { type: 'array', maxItems: 25, items: { type: 'string' }, description: 'Lote de hasta 25 id_hilo en lugar de id_hilo.' },
        accion: { type: 'string', enum: ['mover', 'archivar', 'papelera', 'spam', 'sacar_de_spam', 'leido', 'importante', 'enterado', 'conservar'] }, carpeta: { type: 'string', description: 'Solo para mover.' },
        por: { type: 'string', enum: ['resumen'], description: 'Con leido: la persona se enteró por el resumen (igual que enterado).' }, canal: { type: 'string', description: 'Con enterado: webapp, claude o whatsapp.' }, automatico: { type: 'boolean', description: 'Solo la web app, con enterado: los hilos que de verdad mostró en Hoy.' },
        politica: { type: 'string', description: 'La política por la que actúas tú (sin ella, es un pedido de la persona). Manda su nivel.' } }, ['accion'], cambia(false)),
    t('desuscribir', 'Darte de baja de una lista', 'Da de baja de un remitente con baja de un clic (RFC 8058). Con Bajas en Te aviso o Lo hago solo, la das sin preguntar a un remitente conocido (con historia o ficha). Con Bajas en Te propongo o apagada, a un remitente nuevo, con ficha de importancia alta o en un tema sensible, solo con el sí de la persona (una propuesta aceptada con efecto desuscribir). Nunca a un remitente sospechoso y nunca por correo. No tiene deshacer: se revierte en el sitio del remitente.',
      { remitente: { type: 'string', description: 'Dirección completa.' } }, ['remitente'], cambia(true)),
    t('redactar_respuesta', 'Dejar un borrador de respuesta', 'Deja un borrador de respuesta en el hilo, con la voz de la persona. Nunca envía: la persona lo revisa y lo manda desde Gmail.',
      { id_hilo: hilo, texto: { type: 'string' }, responder_a_todos: { type: 'boolean' } }, ['id_hilo', 'texto'], cambia(false)),
    t('deshacer', 'Deshacer un cambio', 'Deshace una acción de Actividad por su id. Con el id de una línea de Hoy (aviso|…) deshace todas sus acciones en una sola llamada; ids hace lo mismo con una lista. Si no alcanza el tiempo devuelve quedan: llama otra vez con lo mismo y sigue donde se quedó. Lo que el motor hizo solo y la persona deshace cuenta como corregido para su política. Por el conector no deshace lo que hizo la persona, no sube, no enciende ni ensancha una regla, no baja ni quita una que ella pidió o que protege, y no saca nada de spam: esas acciones salen en omitidas o con su motivo, y ella las deshace desde la web app.',
      { id: { type: 'string', description: 'id_accion de Actividad o id de una línea de Hoy (aviso|<política>|…).' }, ids: { type: 'array', items: { type: 'string' }, description: 'Varios id_accion, deshechos juntos.' } }, [], cambia(false)),
    // Control (1)
    t('pausar', 'Pausar o reanudar', 'Con activo true nadie toca el correo: la corrida no actúa ni propone, y actuar, aplicar, redactar_respuesta, desuscribir y el spam de Protección responden "Estoy en pausa". deshacer sigue; se anotan señales. Con false vuelve a trabajar. En pausa, si la persona pide mover algo, dile que está en pausa y ofrece quitarla en una línea.',
      { activo: { type: 'boolean' }, frecuencia: { type: 'string', enum: ['reducida', 'normal'], description: 'Sin activo: reducida lee cada 30 minutos hasta medianoche para no agotar el cupo diario de Google (cupo_diario en ver_hoy); normal vuelve a cada 10.' } }, [], cambia(false))
  ];
  // Las descripciones con las reglas finas vienen de Textos.js; el motor suma solo lo que es suyo.
  const educ = typeof DESCRIPCIONES_EDUCACION === 'object' && DESCRIPCIONES_EDUCACION ? DESCRIPCIONES_EDUCACION : {};
  lista.forEach(x => { if (educ[x.name]) x.description = educ[x.name] + (DESCRIPCION_MOTOR[x.name] ? '\n' + DESCRIPCION_MOTOR[x.name] : ''); });
  return lista;
}

// Lo que el motor agrega a las descripciones de Textos.js: campos y reglas que solo él conoce.
const DESCRIPCION_MOTOR = {
  guardar_politica: 'Motor: datos {id?, nombre, texto, compilado, criterio, acciones, cuando, nivel, prueba, evidencia, rescate}. Sin id crea una nueva. carpeta:/<nombre> (con diagonal) usa una etiqueta que la persona ya tiene. La primera compilación de una política aprobada sin condiciones (una carpeta que la persona creó) la pones tú. Bandeja limpia: acciones [archivar] y cuando "HH:mm", "cierre" o "3h" (horas después de leído); sus condiciones las pone el motor. leido se retiene 14 días con un remitente que abre más de 1 de cada 10 o sin historia. Para extender sin preguntar un rescate suyo al dominio o al tema, pasa en rescate el id de su línea en Actividad («Rescataste un correo de…»).',
  guardar_juicio: 'Motor: también acepta un solo juicio con id_hilo y opciones [{etiqueta, accion, texto o carpeta, recomendada}]. sensible es el tema (dinero, contratos, consejo, prensa u otro del perfil); true lo deduce del correo y de tu juicio; false quita la marca que puso la palabra clave. Con politica "proteccion" y la opción recomendada spam, el motor lo manda a spam en el nivel de Protección (nunca un riesgo, ni a alguien con ficha o a quien le escribe). resumen y resumen_completo: con él, la persona puede decir que se enteró (actuar enterado). opcional caduca en caduca (fecha u horas) o a las 72 horas. proxima_revision esconde el hilo de Hoy hasta esa fecha. La corrección de la persona manda.',
  proponer: 'Motor: datos {tipo, lote, lineamiento, nombre, texto, evidencia {cifra, ejemplos, texto, cobertura, abiertos, contestados, antes, despues, etiqueta_existente}, opciones [{id, etiqueta, efecto, porque, valor, costo}], recomendada, confianza, objeto, id_hilo, lineas, origen}. lineamiento: lo_que_no_abres, con_calma, se_repite, sobra, al_dia o cuanto_hago_solo; objeto "lineamiento:<id>" es la propuesta del lineamiento. origen "persona" cuando la persona lo pidió; su carpeta no lleva mínimo de correos ni cuenta para el tope. Repaso: lineas [{texto, deshacer}]. Resumen: el resto en evidencia.texto (hasta 4,000 caracteres); el de una junta con objeto "evento:<id>".',
  responder: 'Motor: por Claude, un efecto de Lo hago solo se aplica como Te aviso y una baja a un remitente nuevo no se da; lo demás sí. Entonces contesta estado abierta y pendiente_toque: la propuesta sigue abierta y su toque en la web app aplica lo que faltó. No la vuelvas a contestar ni hagas otra.',
  guardar_memoria: 'Motor: en el cuaderno, deshacer es el id_accion de Actividad que revierte el cambio de esa lección; cambio nombra politica:<id>, ficha:<id>, estilo o perfil. En experiencia, lo que no pases se queda y lo que fijó la persona no cambia. En perfil, {sensibles: [{tema, palabras}]} es la lista completa de temas extra.'
};

const SOLO_WEBAPP = ['enviar_borrador', 'reconectar_claude'];
const ESCRITURAS = ['guardar_memoria', 'pedir_politica', 'guardar_politica', 'cambiar_politica', 'proponer', 'responder', 'guardar_juicio', 'corregir_juicio',
  'seguimiento', 'guardar_whatsapp', 'aplicar', 'actuar', 'desuscribir', 'redactar_respuesta', 'deshacer', 'pausar'];

// La liga de la web app, para que Opus la dé en el mensaje del plan. Se guarda cuando el dueño abre la página: desde
// el conector, ScriptApp.getService().getUrl() da la dirección del despliegue que corre, que es la del conector, y esa
// también se guarda para no confundirlas. Sin la de la página, las dos ligas salen en null.
function anotarLiga_(llave) {
  try {
    const u = ScriptApp.getService().getUrl();
    if (!u || !/\/exec$/.test(u)) return;
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(llave) !== u) props.setProperty(llave, u);
  } catch (e) {}
}
function ligasWebapp_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const u = props.getProperty('cos.webapp_url');
    if (!u || u === props.getProperty('cos.conector_url')) return { webapp_url: null, plan_url: null };
    return { webapp_url: u, plan_url: u + '?vista=plan' };
  } catch (e) { return { webapp_url: null, plan_url: null }; }
}

// ---------- JSON-RPC ----------
function doPost(e) {
  anotarLiga_('cos.conector_url');
  const p = (e && e.parameter) || {};
  let cuerpo;
  try { cuerpo = JSON.parse((e && e.postData && e.postData.contents) || ''); }
  catch (err) { return conectorJson_(rpcError_(null, -32700, 'JSON inválido')); }
  const lote = Array.isArray(cuerpo);
  const mensajes = lote ? cuerpo : [cuerpo];
  const llave = llaveConector_();
  if (!llave || p.k !== llave) {
    const r = mensajes.filter(m => m && m.id !== undefined).map(m => rpcError_(m.id, -32001, 'No autorizado'));
    return conectorJson_(lote ? r : (r[0] || rpcError_(null, -32001, 'No autorizado')));
  }
  const respuestas = mensajes.map(conectorAtiende_).filter(r => r !== null);
  if (!respuestas.length) return ContentService.createTextOutput('');
  return conectorJson_(lote ? respuestas : respuestas[0]);
}

// La web app la sirve paginaWebapp_ (archivo de la web app) solo al dueño; lo demás no toca el motor.
function doGet(e) {
  if (esDueno_() && typeof paginaWebapp_ === 'function') { anotarLiga_('cos.webapp_url'); return paginaWebapp_(e); }
  return conectorJson_({ servicio: CONECTOR.NOMBRE, version: CONECTOR.VERSION, transporte: 'POST JSON-RPC' });
}

function esDueno_() {
  try { return Session.getActiveUser().getEmail().toLowerCase() === Session.getEffectiveUser().getEmail().toLowerCase(); }
  catch (err) { return false; }
}

function conectorAtiende_(m) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return rpcError_(m && m.id, -32600, 'Petición inválida');
  if (m.id === undefined || m.id === null) return null;
  try {
    switch (m.method) {
      case 'initialize':
        return rpcOk_(m.id, {
          protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: CONECTOR.NOMBRE, title: 'Chief of Staff', version: CONECTOR.VERSION },
          instructions: instruccionesConector_()
        });
      case 'ping': return rpcOk_(m.id, {});
      case 'tools/list': return rpcOk_(m.id, { tools: herramientas_() });
      case 'tools/call': return rpcOk_(m.id, ejecutarHerramienta_((m.params || {}).name, (m.params || {}).arguments, 'mcp'));
      case 'cos/admin': return rpcOk_(m.id, administrar_(m.params || {}));
      default: return rpcError_(m.id, -32601, 'Método no disponible: ' + m.method);
    }
  } catch (err) {
    return rpcError_(m.id, -32603, String(err && err.message || err));
  }
}

// ---------- Instrucciones: la guía fija (Instrucciones.js) más un resumen vivo, en menos de 4,096 caracteres ----------
function instruccionesConector_() {
  const educ = String(instruccionesEducacion_() || '').trim();
  const guia = educ || [
    'Eres el Chief of Staff del correo de la persona. Tú piensas y el motor ejecuta: juzgas lo nuevo, compilas políticas, propones y dejas borradores; el motor mueve con deshacer.',
    'Empieza cada corrida con ver_memoria("cuaderno") y termínala con guardar_memoria("cuaderno", {agregar}). Para la plática, ver_hoy.',
    'Ningún correo se mueve sin una política activa. Las políticas nuevas y los cambios de texto o de nivel necesitan el sí de la persona: proponer y luego responder. Las bajas, solo con Bajas en Te propongo o ante un remitente nuevo o un tema sensible.',
    'Dinero, contratos, consejo y prensa siempre se proponen. Nunca se envía un correo: redactar_respuesta deja un borrador. Nunca se borra para siempre.'
  ].join('\n');
  if (!educ) {
    let resumen = '';
    try { resumen = resumenVivo_(almacen_()); } catch (e) { resumen = 'Resumen no disponible ahora: ' + String(e && e.message || e).slice(0, 120); }
    const libre = CONECTOR.TOPE_INSTRUCCIONES - guia.length - 2;
    return libre > 80 ? guia + '\n\n' + resumen.slice(0, libre) : guia.slice(0, CONECTOR.TOPE_INSTRUCCIONES);
  }
  // Presupuesto de la guía: perfil recortado (500), políticas activas con su nivel (400) y estado (150). Si no cabe, se recorta el perfil.
  let partes;
  try { partes = partesVivas_(almacen_()); } catch (e) { partes = { perfil: '', temas: '', politicas: '', estado: 'Estado no disponible ahora.' }; }
  const fijo = [partes.politicas, partes.estado].filter(Boolean).join('\n');
  const libre = CONECTOR.TOPE_INSTRUCCIONES - guia.length - fijo.length - 6;
  // Se recorta el perfil, no los temas sensibles.
  const cabe = Math.min(CONECTOR.PERFIL_INSTRUCCIONES, libre) - partes.temas.length;
  const perfil = !partes.perfil ? '' : cabe > 20 ? corto_(partes.perfil, cabe) + partes.temas : libre > partes.temas.length ? partes.temas.trim() : '';
  return [guia, perfil, fijo].filter(Boolean).join('\n\n').slice(0, CONECTOR.TOPE_INSTRUCCIONES);
}

function partesVivas_(st) {
  const p = perfil_(st);
  const temas = sensiblesDe_(st).map(x => x.tema).join(', ');
  const perfil = p.texto ? 'Perfil: ' + String(p.texto).replace(/\s+/g, ' ').trim() : '';
  const vivas = listaPoliticas_(st).filter(politicaViva_);
  const politicas = corto_(vivas.length ? 'Políticas activas: ' + vivas.map(x => x.nombre + ': ' + x.nivel).join(', ') + '.' : 'Ninguna política activa: el motor solo cuenta.', CONECTOR.POLITICAS_INSTRUCCIONES);
  const props = listaPropuestas_(st).filter(x => x.estado === 'abierta').length;
  const r = st.get('rutinas', {});
  const ult = ['juicio', 'diaria', 'semanal'].map(k => r['corrida_' + k] || (k === 'juicio' ? r.juicio : null) ? k + ' ' + fecha_(r['corrida_' + k] || r.juicio) : '').filter(Boolean);
  const det = juicioDetenido_(st);
  const pausa = st.get('pausa', null);
  const estado = corto_(props + ' propuestas abiertas. Última corrida: ' + (ult.length ? ult.join('; ') : 'ninguna') + '.' + (det ? ' Juicio detenido desde ' + (det.desde || 'siempre') + '.' : '') +
    (pausa && pausa.activo ? ' En pausa.' : '') + (instalacionCerrada_(st) ? '' : ' Sin instrucciones aceptadas: primero sus instrucciones (lote instalacion).'), CONECTOR.ESTADO_INSTRUCCIONES);
  return { perfil: perfil, temas: ' Temas sensibles: ' + temas + '.', politicas: politicas, estado: estado };
}

function resumenVivo_(st) {
  const pols = listaPoliticas_(st);
  const vivas = pols.filter(politicaViva_);
  const props = listaPropuestas_(st).filter(p => p.estado === 'abierta');
  const pausa = st.get('pausa', null);
  const r = st.get('rutinas', {});
  const inst = instalacionCerrada_(st);
  const cuaderno = st.get('cuaderno', []);
  return ['Estado al ' + fecha_(Date.now()) + ':',
    inst ? 'Instrucciones aceptadas el ' + dia_(inst) + '.' : 'Sin instrucciones aceptadas: primero sus instrucciones (lote instalacion).',
    vivas.length ? 'Políticas activas: ' + vivas.map(p => p.nombre + ' (' + COS.NIVEL_TEXTO[p.nivel] + ')').join('; ') + '.' : 'Ninguna política activa.',
    props.length + ' propuestas abiertas' + (props.filter(p => p.lote === 'instalacion').length ? ', ' + props.filter(p => p.lote === 'instalacion').length + ' de sus instrucciones' : '') + '.',
    'Último juicio: ' + (r.juicio ? fecha_(r.juicio) : 'ninguno') + '. Cuaderno: ' + (Array.isArray(cuaderno) ? cuaderno.length : 0) + ' lecciones.',
    pausa && pausa.activo ? 'En pausa desde ' + fecha_(pausa.desde) + '.' : ''].filter(Boolean).join('\n');
}

// ---------- Argumentos con mensajes que el modelo pueda corregir ----------
function argTexto_(v, nombre) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) throw new Error('Falta ' + nombre + '.');
  return s;
}
function argEntero_(v, def, min, max) {
  const n = v === undefined || v === null || v === '' ? def : Math.round(Number(v));
  if (!isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}
function argBoolOpc_(v, def) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return def;
}
function argBool_(v, nombre) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  throw new Error('Falta ' + nombre + ' (true o false).');
}
function argLista_(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') { try { const x = JSON.parse(v); if (Array.isArray(x)) return x.map(String); } catch (e) {} return v.split(',').map(s => s.trim()).filter(Boolean); }
  return Array.isArray(v) ? v.map(String) : [String(v)];
}
function argObjeto_(v, nombre) {
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { throw new Error(nombre + ' debe ser un objeto JSON.'); } }
  return v;
}

// Las herramientas que llevan datos. Si datos no llega y al nivel de arriba vienen campos de esa
// herramienta (o de esa parte, en guardar_memoria), se toman como datos. Sin ninguno, el error dice la forma.
const DATOS_HERRAMIENTA = {
  guardar_politica: { campos: ['id', 'nombre', 'texto', 'compilado', 'criterio', 'acciones', 'cuando', 'nivel', 'prueba', 'evidencia', 'rescate'],
    forma: 'guardar_politica lleva {datos, consentimiento}; datos = {id, nombre, texto, compilado, criterio, acciones, cuando, nivel, prueba, propuesta}' },
  proponer: { campos: ['tipo', 'lote', 'lineamiento', 'nombre', 'texto', 'evidencia', 'opciones', 'recomendada', 'confianza', 'objeto', 'id_hilo', 'lineas', 'origen'],
    forma: 'proponer lleva {datos, opId}; datos = {tipo, texto, opciones, recomendada, evidencia, objeto, id_hilo, lote}' },
  seguimiento: { campos: ['accion', 'id', 'id_hilo', 'chat', 'direccion', 'que', 'vence', 'dias', 'motivo', 'motivo_cierre', 'resultado', 'persistente', 'politica', 'proxima_revision', 'a_pedido', 'lote'],
    forma: 'seguimiento lleva {datos}; datos = {accion, id_hilo o chat, direccion, que, vence o dias}' }
};
function datosMemoria_(parte) {
  return {
    perfil: { campos: ['texto', 'sensibles', 'vocabulario_sensible'], forma: 'para el perfil, datos = {texto, sensibles}' },
    estilo: { campos: ['texto'], forma: 'para el estilo, datos = {texto}' },
    experiencia: { campos: ['orden_hoy', 'secciones_propias', 'textos', 'resumen', 'horarios_juicio', 'tono', 'decisiones', 'definido_por'],
      forma: 'para la experiencia, datos = {orden_hoy, secciones_propias, textos, resumen, horarios_juicio, tono, decisiones}' },
    cuaderno: { campos: ['agregar', 'reemplazar', 'seccion', 'texto', 'evidencia', 'cambio', 'fecha', 'deshacer'],
      forma: 'para el cuaderno, datos = {agregar: {seccion, texto, evidencia, cambio}}' },
    fichas: { campos: ['fichas', 'id', 'retirar', 'correo', 'correos', 'dominio', 'definido_por'].concat(MEMORIA.CAMPOS_FICHA),
      forma: 'para las fichas, datos = {tipo, nombre, direcciones o dominios, organizacion, rol, relacion, importancia} o una lista' }
  }[parte] || null;
}
function formaMemoria_(parte) { const m = datosMemoria_(parte); return 'guardar_memoria lleva {parte, datos}' + (m ? '; ' + m.forma : ''); }
function datosDeArriba_(n, a) {
  if (a.datos !== undefined && a.datos !== null && a.datos !== '') return null;
  let d = DATOS_HERRAMIENTA[n] || null, forma = d ? d.forma : '';
  if (n === 'guardar_memoria') {
    d = datosMemoria_(String(a.parte || '').trim().toLowerCase());
    // Sin parte válida, guardarMemoria_ dice cuáles hay.
    if (!d) return null;
    forma = formaMemoria_(String(a.parte).trim().toLowerCase());
  }
  if (!d) return null;
  const datos = {};
  d.campos.forEach(k => { if (a[k] !== undefined) datos[k] = a[k]; });
  if (!Object.keys(datos).length) throw new Error('Faltan datos: ' + forma + '.');
  return datos;
}

// ---------- Ejecución: las mismas herramientas para el conector ('mcp') y la web app ('webapp') ----------
const LECTURAS_LARGAS_ = ['simular', 'exportar_evaluacion', 'analizar_bandeja'];
function ejecutarHerramienta_(n, a, via) {
  PLAZO.inicio = Date.now();
  CANDADO.que = String(n || '');
  try { return ejecutarHerramientaCuerpo_(n, a, via); } finally { PLAZO.inicio = 0; CANDADO.que = ''; }
}
function ejecutarHerramientaCuerpo_(n, a, via) {
  a = a || {};
  n = String(n || '');
  MINUTO_GMAIL.esperado = 0;
  let datosArriba = null;
  try { datosArriba = datosDeArriba_(n, a); } catch (e) { return { content: [{ type: 'text', text: mensajeError_(e) }], isError: true }; }
  if (datosArriba) a = Object.assign({}, a, { datos: datosArriba });
  const lectura = {
    reconectar_claude: () => reconectarClaude_(),
    ver_hoy: st => verHoy_(st, argEntero_(a.maximo, 20, 1, 30), a.visita === true || a.visita === 'true'),
    ver_novedades: st => verNovedades_(st, a.desde),
    leer_hilo: st => leerHilo_(st, argTexto_(a.id_hilo, 'id_hilo'), a.id_mensaje ? String(a.id_mensaje) : undefined, argEntero_(a.desde, 0, 0, 10000000)),
    buscar: st => buscar_(st, argTexto_(a.consulta, 'consulta'), argEntero_(a.maximo, 10, 1, MAX_BUSCAR), argEntero_(a.maximo, 10, 1, 100000)),
    ver_memoria: st => verMemoria_(st, argTexto_(a.parte, 'parte'), argObjeto_(a.filtro, 'filtro')),
    ver_politicas: st => verPoliticas_(st, argObjeto_(a.filtro, 'filtro')),
    ver_propuestas: st => verPropuestas_(st, a.estado, a.lote, a.tipo, argEntero_(a.maximo_correos, 10, 1, 100),
      { desde: argEntero_(a.desde, 1, 1, PROPUESTA.MAX), maximo: a.maximo === undefined || a.maximo === null || a.maximo === '' ? undefined : argEntero_(a.maximo, 60, 1, PROPUESTA.MAX), lineamiento: a.lineamiento }),
    ver_hechos: st => verHechos_(st, argTexto_(a.tipo, 'tipo'), a.desde, argEntero_(a.maximo, 50, 1, 300), argObjeto_(a.filtro, 'filtro')),
    ver_agenda: st => verAgenda_(st, argEntero_(a.dias, 2, 1, LECTURA.DIAS_AGENDA)),
    ver_whatsapp: st => verWhatsapp_(st),
    simular: st => a.lote === 'bandeja_inicial' ? cuentaBandejaInicial_(st, a.hasta || a.antes_de) : simular_(st, { politicas: argLista_(a.politicas), lote: a.lote ? String(a.lote) : null, dias: argEntero_(a.dias, 30, 1, 90),
      pagina: a.pagina ? String(a.pagina) : null, maximo: argEntero_(a.maximo, EVALUACION.PAGINA, 1, EVALUACION.PAGINA) }),
    exportar_evaluacion: st => exportarEvaluacion_(st, a.desde, a.hasta, a.pagina ? String(a.pagina) : null, argEntero_(a.maximo, EVALUACION.PAGINA, 1, EVALUACION.PAGINA))
  };
  const escritura = {
    guardar_memoria: st => guardarMemoria_(st, argTexto_(a.parte, 'parte'), a.datos),
    pedir_politica: st => pedirPolitica_(st, a.texto),
    guardar_politica: st => guardarPolitica_(st, Object.assign({}, argObjeto_(a.datos, 'datos'), a.consentimiento ? { consentimiento: a.consentimiento } : {})),
    cambiar_politica: st => cambiarPolitica_(st, a.id, a.nivel === undefined || a.nivel === null || a.nivel === '' ? undefined : String(a.nivel),
      a.estado === undefined || a.estado === null || a.estado === '' ? undefined : String(a.estado), a.propuesta ? String(a.propuesta) : null, a.consentimiento),
    proponer: st => proponerConOpId_(st, argObjeto_(a.datos, 'datos'), a.opId),
    responder: st => enRutina_() ? { hecho: 'Una rutina no contesta por la persona: no apliqué nada y ' + (String(a.id || '') || 'la propuesta') + ' sigue para ella.', id: a.id === undefined ? undefined : String(a.id), sin_cambio: true, rutina: true }
      : /^aviso\|/.test(String(a.id || '')) ? bienLinea_(st, a.id) : /^consentimiento\|/.test(String(a.id || '')) ? bienConsentimiento_(st, a.id)
      : responder_(st, argTexto_(a.id, 'id'), a.opcion, a.texto, argLista_(a.excluir)),
    guardar_juicio: st => guardarJuicios_(st, a),
    corregir_juicio: st => { const sinPrioridad = a.prioridad === undefined || a.prioridad === null || a.prioridad === '';
      const despues = a.despues || a.proxima_revision;
      if (sinPrioridad && despues) return despuesJuicio_(st, a.id_hilo, a.despues, a.proxima_revision);
      const r = corregirJuicio_(st, a.id_hilo, a.prioridad, a.motivo); if (despues) r.despues = despuesJuicio_(st, String(a.id_hilo), a.despues, a.proxima_revision); if (a.persistente === true || a.persistente === 'true') r.conservar = conservar_(st, String(a.id_hilo)); return r; },
    seguimiento: st => seguimiento_(st, argObjeto_(a.datos, 'datos')),
    guardar_whatsapp: st => guardarWhatsapp_(st, a.chats, a.estado),
    aplicar: st => a.bandeja_inicial === true || a.bandeja_inicial === 'true' ? aplicarBandejaInicial_(st, a) : aplicarPorPagina_(st, { politicas: argLista_(a.politicas), lote: a.lote ? String(a.lote) : null, dias: argEntero_(a.dias, 30, 1, 90),
      pagina: a.pagina ? String(a.pagina) : null, maximo: argEntero_(a.maximo, EVALUACION.PAGINA, 1, EVALUACION.PAGINA), con_bajas: argBoolOpc_(a.con_bajas, true) }),
    actuar: st => actuarHerramienta_(st, a),
    desuscribir: st => desuscribir_(st, a.remitente),
    redactar_respuesta: st => redactar_(st, argTexto_(a.id_hilo, 'id_hilo'), argTexto_(a.texto, 'texto'), a.responder_a_todos === true),
    deshacer: st => {
      const ids = argLista_(a.ids);
      if (ids && ids.length) return deshacerVarios_(st, ids);
      const id = argTexto_(a.id || a.id_accion, 'id (o ids)');
      return /^aviso\|/.test(id) ? deshacerLinea_(st, id) : deshacer_(st, id.replace(/^consentimiento\|/, ''));
    },
    enviar_borrador: st => enviarBorrador_(st, a),
    pausar: st => a.frecuencia !== undefined && (a.activo === undefined || a.activo === null || a.activo === '') ? cambiarFrecuencia_(st, a.frecuencia) : pausar_(st, argBool_(a.activo, 'activo'))
  };
  // Solo la web app: enviar y reconectar no existen para el conector (ni en tools/list).
  if ((!lectura[n] && !escritura[n] && n !== 'analizar_bandeja') || (SOLO_WEBAPP.indexOf(n) >= 0 && via !== 'webapp'))
    return { content: [{ type: 'text', text: 'Herramienta desconocida: ' + n + '. Usa tools/list para ver las 29.' }], isError: true };
  VIA = via === 'webapp' ? 'webapp' : 'mcp';
  const interactiva = ['analizar_bandeja', 'simular', 'aplicar', 'exportar_evaluacion'].indexOf(n) < 0;
  if (interactiva) marcarInteractiva_(true);
  let datos;
  // Si trae la llave corrida, sea como sea, es una rutina: una mal formada no cuenta en las corridas, pero tampoco es plática.
  LLAMADA_CORRIDA_ = VIA === 'mcp' ? corridaDeLlamada_(a) || (a && a.corrida !== undefined ? { tipo: 'sin_forma', id: '' } : null) : null;
  if (VIA === 'mcp') { try { contarLlamada_(n, a, !lectura[n] && n !== 'analizar_bandeja'); } catch (e) {} }
  try {
    // Lo que puede una rutina: la lista blanca va antes de cualquier efecto. La visita es de la persona.
    if (VIA === 'mcp' && (LLAMADA_CORRIDA_ || enRutina_())) {
      const no = autorizarRutina_(almacen_(), n, a);
      if (no) throw new Error('Una rutina no puede ' + no + '. No cambié nada; si hace falta, déjalo como propuesta para la persona con proponer.');
      if (a.visita) a = Object.assign({}, a, { visita: false });
    }
    if (n === 'analizar_bandeja') datos = analizarBandeja_(argEntero_(a.dias, 30, 1, 90), argEntero_(a.maximo, VIA === 'webapp' ? ANALISIS.GRUPOS_WEBAPP : ANALISIS.GRUPOS_POR_PAGINA, 1, 200), argBoolOpc_(a.refrescar, false),
      { desde_grupo: argEntero_(a.desde_grupo, 1, 1, ANALISIS.MAX_GRUPOS), corto: argBoolOpc_(a.corto, false), solo_grupos: argBoolOpc_(a.solo_grupos, undefined) });
    else if (lectura[n]) datos = lectura[n](almacen_());
    else {
      REPETIDA_PENDIENTE_ = null;
      try {
        datos = conCandado_(st => escrituraIdempotente_(n, a, () => {
          if (VIA === 'mcp' && n !== 'guardar_juicio') marcarRutina_(st, 'llamada');
          return escritura[n](st);
        }));
      } catch (e) { REPETIDA_PENDIENTE_ = null; throw e; }
      guardarRepetida_();
    }
    // La fecha y la hora de la persona: las rutinas corren en la nube con el reloj en UTC y después de las 18:00 de México
    // ya es el día siguiente allá. Las rutinas usan este campo, nunca el reloj de su máquina.
    if (['ver_hoy', 'ver_novedades', 'ver_hechos'].indexOf(n) >= 0 && datos && typeof datos === 'object' && !Array.isArray(datos)) datos.ahora = ahoraLocal_();
    // Los juicios que se guardaron sin leer el hilo quedan completos con lo que Hoy ya leyó.
    if (n === 'ver_hoy' && COMPLETAR_JUICIOS_) { const c = COMPLETAR_JUICIOS_; COMPLETAR_JUICIOS_ = null; try { conCandado_(st => completarJuicios_(st, c), 5000); } catch (e) {} }
    // Una lectura que siguió sin el correo (ver_hoy con el tope diario) también deja la hora en el almacén.
    if (LIMITE_DIARIO.visto) { try { conCandado_(st => anotarLimiteDiario_(st, n), 5000); } catch (e) {} }
    // La visita de la persona: la siguiente vista acumulada empieza aquí. Una recarga de la visita en curso solo anota
    // la hora (ultima) y deja la ventana como estaba.
    if (n === 'ver_hoy' && datos && (a.visita === true || a.visita === 'true')) {
      try { conCandado_(st => { const v = st.get('visita', null), ahora = Date.now();
        st.set('visita', visitaSigue_(v, ahora) ? Object.assign({}, v, { ultima: ahora }) : { t: ahora, anterior: v ? v.t : 0, ultima: ahora }); }); } catch (e) {}
    }
    // El aviso de un cambio hecho con el sí en palabras se va cuando la persona lo ve en la web app.
    if (n === 'ver_hoy' && VIA === 'webapp' && datos && datos.avisos_consentimiento) { try { conCandado_(st => verAvisosConsentimiento_(st, datos.avisos_consentimiento.map(x => x.id)), 5000); } catch (e) {} }
    // Consultar no es mostrar: ver_hoy no marca nada leído. Lo que la página de verdad mostró llega con
    // actuar({hilos, accion: 'enterado', automatico: true}) o en mostrados.
    if (n === 'ver_hoy' && VIA === 'webapp' && Array.isArray(a.mostrados) && a.mostrados.length) {
      try { conCandado_(st => {
        if (decision_(st, 'enterarse') !== 'automatico' || (datos && datos.pausado)) return;
        const js = st.get('juicios', {}), v = a.mostrados.slice(0, 100).map(String).filter(h => js[h] && !js[h].sensible);
        const r = v.length ? enterarse_(st, v, 'webapp', true) : null;
        if (datos) datos.enterado_automatico = r && r.id_accion ? { id_accion: r.id_accion, hilos: (r.resultados || []).filter(x => x.mensajes).map(x => x.id_hilo) } : { hilos: [] };
      }, 5000); } catch (e) { if (datos) datos.enterado_automatico = { error: mensajeError_(e) }; }
    }
  } catch (err) {
    if (esLimiteDiario_(err)) return respuestaLimiteDiario_(n);
    // Una lectura larga que choca con el tope por minuto no falla: contesta en_proceso, como analizar_bandeja.
    if (esLimiteMinuto_(err) && LECTURAS_LARGAS_.indexOf(n) >= 0) {
      const r = { estado: 'en_proceso', motivo: 'tope_por_minuto', vuelve_en_segundos: 60,
        nota: 'Gmail limitó las lecturas por un minuto. Vuelve a llamar ' + n + ' en un minuto con los mismos argumentos; mientras, llama una herramienta a la vez.' };
      return { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: r };
    }
    return { content: [{ type: 'text', text: VIA === 'webapp' ? errorParaLaPersona_(mensajeError_(err)) : mensajeError_(err) }], isError: true };
  } finally {
    if (interactiva) marcarInteractiva_(false);
    VIA = 'motor';
    try { anotarCupo_(); } catch (e) {}
  }
  if (datosArriba && datos && typeof datos === 'object' && !Array.isArray(datos)) datos.forma = 'Tomé como datos los campos que llegaron afuera de datos; la próxima vez van dentro de datos.';
  // El texto va compacto: la sangría sumaba 16% a cada respuesta que lee el modelo.
  return { content: [{ type: 'text', text: JSON.stringify(datos) }], structuredContent: datos };
}

// El tope diario de Google: código propio limite_diario, en el texto y en structuredContent, y la hora queda en el almacén.
function respuestaLimiteDiario_(n) {
  try { conCandado_(st => anotarLimiteDiario_(st, n), 5000); } catch (e) {}
  const texto = errorLimiteDiario_().message;
  return { content: [{ type: 'text', text: texto }], isError: true,
    structuredContent: { codigo: 'limite_diario', mensaje: texto.replace(/^limite_diario: /, ''), herramienta: n, desde: LIMITE_DIARIO.visto ? fecha_(LIMITE_DIARIO.visto) : undefined,
      siguen_sirviendo: LIMITE_DIARIO.SIGUEN.slice(), se_repone: 'solo, en menos de 24 horas' } };
}

// Repetir la misma escritura (reintento, doble toque o las dos interfaces a la vez) produce un solo efecto:
// corre bajo el candado y, si nadie escribió en medio, se devuelve la respuesta guardada. Si hubo otra escritura (un deshacer, por
// ejemplo), se ejecuta otra vez y la propia herramienta reconoce lo que ya estaba hecho.
function escrituraIdempotente_(n, a, fn) {
  const cache = CacheService.getScriptCache();
  const props = PropertiesService.getScriptProperties();
  // La vía entra en la huella: el toque de la persona en la web app no es el reintento de lo que pidió Claude. Así, un
  // aviso que el motor le negó a Claude sí se mueve desde la web app.
  const huella = 'cos3w.' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, n + '|' + VIA + '|' + JSON.stringify(a))).slice(0, 40);
  let previa = null;
  try { previa = JSON.parse(cache.get(huella) || 'null'); } catch (e) {}
  if (previa && previa.g === Number(props.getProperty(CONECTOR.GEN) || 0)) {
    const r = previa.r;
    if (r && typeof r === 'object' && !Array.isArray(r)) { r.repetida = true; r.nota_repetida = 'Llamada repetida: devolví la respuesta de ' + antiguedad_(previa.t) + ' sin repetir el efecto.'; }
    return r;
  }
  const r = fn();
  const g = Number(props.getProperty(CONECTOR.GEN) || 0) + 1;
  props.setProperty(CONECTOR.GEN, String(g));
  // Un deshacer que no alcanzó el tiempo se llama otra vez igual para seguir: esa respuesta no se guarda como repetible.
  // La respuesta se guarda como repetible solo después de que la Hoja guardó (guardarRepetida_): si el guardado falla, el
  // reintento corre otra vez y no devuelve un éxito que no quedó.
  // Una negativa o una llamada sin efecto tampoco: la siguiente igual se vuelve a evaluar con el estado de ese momento.
  if (!(n === 'deshacer' && r && r.quedan) && !sinEfecto_(r)) { try { REPETIDA_PENDIENTE_ = { h: huella, v: JSON.stringify({ g: g, t: Date.now(), r: r }) }; } catch (e) {} }
  return r;
}
// Sin efecto: sin_cambio, o un lote donde cada hilo quedó sin cambio o con error.
function sinEfecto_(r) {
  if (!r || typeof r !== 'object') return false;
  if (r.sin_cambio === true) return true;
  return Array.isArray(r.resultados) && r.resultados.length > 0 && r.resultados.every(x => x && (x.sin_cambio === true || x.error));
}
let REPETIDA_PENDIENTE_ = null;
// {tipo, id} de la rutina que hizo la llamada en curso, o null en la plática.
let LLAMADA_CORRIDA_ = null;
function guardarRepetida_() {
  const x = REPETIDA_PENDIENTE_;
  REPETIDA_PENDIENTE_ = null;
  if (x) { try { CacheService.getScriptCache().put(x.h, x.v, CONECTOR.SEG_REPETIDA); } catch (e) {} }
}

// ---------- Lo que puede una rutina ----------
// Una llamada de rutina (con corrida, o con una rutina abierta) solo produce efectos de tres fuentes: una regla activa en
// Te aviso o Lo hago solo con una acción que esa regla trae, un poder de Opus de «Quién cambia una regla», o deshacer lo que
// hizo una rutina. No toca lo que decidió la persona. Se revisa aquí, en un solo lugar y antes de cualquier efecto; las guardas
// de cada función quedan como segunda línea. Devuelve null si la llamada cabe en la lista, o lo que no puede hacer.
const RUTINA_LECTURAS = ['ver_hoy', 'ver_novedades', 'leer_hilo', 'buscar', 'ver_memoria', 'ver_politicas', 'ver_propuestas', 'ver_hechos', 'ver_agenda',
  'ver_whatsapp', 'simular', 'exportar_evaluacion', 'analizar_bandeja'];
// Lo que deja algo para ella, sin efecto propio: una propuesta, un juicio de Opus y la lectura de WhatsApp. responder no
// aplica nada desde una rutina. seguimiento y redactar_respuesta se revisan por sus argumentos y su regla.
const RUTINA_SIN_EFECTO = ['proponer', 'guardar_juicio', 'guardar_whatsapp', 'responder'];
function autorizarRutina_(st, n, a) {
  if (RUTINA_LECTURAS.indexOf(n) >= 0) return null;
  // definido_por: 'persona' en cualquier nivel del argumento, también dentro de listas, objetos o un texto JSON.
  const dePersona = (x, k) => { if (k > 6 || x === null || x === undefined) return false;
    if (typeof x === 'string') { const t = x.trim(); if (!/^[\[{]/.test(t)) return false; try { return dePersona(JSON.parse(t), k + 1); } catch (e) { return false; } }
    if (typeof x !== 'object') return false;
    return Object.keys(x).some(c => (c === 'definido_por' && String(x[c] || '').trim().toLowerCase() === 'persona') || dePersona(x[c], k + 1)); };
  if (n !== 'proponer' && n !== 'responder' && dePersona(a, 0)) return 'hablar por la persona (definido_por: persona)';
  if (RUTINA_SIN_EFECTO.indexOf(n) >= 0) return null;
  const pols = listaPoliticas_(st), pol = id => pols.filter(p => p.id === String(id))[0];
  const prendida = p => !!p && p.estado === 'activa' && p.nivel !== 'apagado';
  const aceptada = p => !!p && ['borrador', 'propuesta'].indexOf(p.estado) < 0 && (!!p.aprobada || p.estado === 'pausada' || p.estado === 'retirada' || prendida(p) || p.origen === 'persona');
  const datos = x => { if (typeof x === 'string') { try { return JSON.parse(x) || {}; } catch (e) { return {}; } } return x && typeof x === 'object' ? x : {}; };
  if (n === 'cambiar_politica') return null; // sus reglas: bajar, pausar, apagar o retirar lo de Opus; lo demás sale como propuesta
  if (n === 'guardar_memoria') return null; // una ficha que ella definió no la cambia una rutina (guardarFichas_)
  if (n === 'guardar_politica') {
    const d = datos(a.datos), p = d.id ? pol(d.id) : null;
    if (!p) return null; // una nueva nace en propuesta; un borrador lo compila Opus (cambiaLoAprobado_ no la cuenta)
    const n0 = (k, f) => { if (d[k] === undefined) return undefined; try { return f(d[k]); } catch (e) { return '\u0000'; } };
    const cambia = cambiaLoAprobado_(p, { texto: n0('texto', x => String(x).trim().slice(0, 600)), nombre: n0('nombre', x => String(x).trim().slice(0, 60)),
      acciones: n0('acciones', normalizarAcciones_), criterio: n0('criterio', x => String(x || '').trim().slice(0, 3000)), cuando: n0('cuando', normalizarCuando_) });
    return cambia.length ? 'cambiar ' + cambia.join(', ') + ' de «' + p.nombre + '», que la persona ya aceptó' : null;
  }
  if (n === 'aplicar') {
    if (a.bandeja_inicial === true || a.bandeja_inicial === 'true') return 'aplicar lo anterior a una fecha: lo decide la persona';
    if (a.lote) return 'aplicar un lote: lo aplica la persona con su sí';
    const no = (argLista_(a.politicas) || []).filter(id => !prendida(pol(id)) || ['avisa', 'solo'].indexOf(pol(id).nivel) < 0);
    return no.length ? 'aplicar ' + no.join(', ') + ', que no está en Te aviso ni en Lo hago solo' : null;
  }
  if (n === 'actuar') {
    const acc = sinAcentos_(String(a.accion || '')).trim().toLowerCase();
    if (acc === 'conservar' || acc === 'sacar_de_spam') return null; // sacar de spam es de Protección, con sus topes y su autenticación
    // Con politica: su regla en Te aviso o Lo hago solo; si el hilo la cumple lo decide reglaAplicaAlHilo_ en actuar.
    if (a.politica !== undefined && a.politica !== null && a.politica !== '') { const p = pol(a.politica); return prendida(p) && ['avisa', 'solo'].indexOf(p.nivel) >= 0 ? null : 'actuar con una regla que no está en Te aviso ni en Lo hago solo'; }
    let carpeta = ''; try { carpeta = normalizarCarpeta_(a.carpeta).toLowerCase(); } catch (e) {}
    if (acc === 'mover' && decision_(st, 'seguridad') === 'carpeta' && carpeta === MEMORIA.CARPETA_SEGURIDAD.toLowerCase()) return null; // su decisión de seguridad
    return 'mover ni marcar correo sin una regla activa que lo haga';
  }
  // Un compromiso se abre solo con su regla prendida en Te aviso o Lo hago solo y sobre un hilo que Opus ya juzgó; en Te
  // propongo queda en propuesta (seguimiento_ la deja). a_pedido y el lote los trae ella, no la rutina. Cerrar, posponer y el
  // acuse siguen lo que ya está abierto.
  if (n === 'seguimiento') {
    const d = datos(a.datos), accion = String(d.accion || (d.id ? 'cerrar' : 'abrir')).toLowerCase();
    if (accion !== 'abrir') return null;
    if (d.a_pedido) return 'abrir un compromiso como pedido de la persona (a_pedido)';
    if (d.lote) return 'abrir un compromiso con lote: el lote lo aplica la persona';
    const direccion = String(d.direccion || 'le_deben').toLowerCase(), enCanal = ['correo', 'whatsapp'].indexOf(String(d.canal || '').toLowerCase()) >= 0;
    const p = pol(d.politica || (direccion === 'debe_la_persona' || (enCanal && prendida(pol('compromisos'))) ? 'compromisos' : 'seguimiento'));
    if (!p) return 'abrir un compromiso con una regla que no existe';
    // La regla que autoriza el compromiso trae la acción seguimiento: una que solo mueve a una carpeta no sirve.
    if ((p.acciones || []).indexOf('seguimiento') < 0) return 'abrir un compromiso con «' + p.nombre + '», que no trae la acción seguimiento';
    if (prendida(p) && p.nivel === 'propone' && instalacionCerrada_(st)) return null;
    if (!prendida(p) || ['avisa', 'solo'].indexOf(p.nivel) < 0) return 'abrir un compromiso con «' + p.nombre + '» fuera de Te aviso o Lo hago solo';
    if (!d.chat && !(d.id_hilo && (st.get('juicios', {}) || {})[String(d.id_hilo)])) return 'abrir un compromiso de un hilo sin juicio';
    return null;
  }
  // Un borrador en su Gmail es un efecto: necesita Respuestas en Te aviso o Lo hago solo.
  if (n === 'redactar_respuesta') { const p = pol('respuestas'); return prendida(p) && ['avisa', 'solo'].indexOf(p.nivel) >= 0 ? null : 'dejar un borrador sin Respuestas en Te aviso o Lo hago solo'; }
  if (n === 'desuscribir') return prendida(pol('bajas')) && pol('bajas').nivel !== 'propone' ? null : 'dar de baja sin Bajas encendida en Te aviso o Lo hago solo';
  if (n === 'deshacer') {
    const ids = argLista_(a.ids) || [String(a.id || a.id_accion || '')], act = st.get('actividad', []);
    for (const id0 of ids) {
      const id = String(id0).replace(/^consentimiento\|/, '');
      if (/^aviso\|/.test(id)) return 'deshacer una línea de Hoy: junta acciones que no hizo una rutina';
      const e = act.filter(x => x.id === id)[0];
      if (!e) continue;
      if (!rutinaPuedeDeshacer_(st, e)) return 'deshacer «' + corto_(e.texto, 80) + '»: no lo hizo una rutina';
    }
    return null;
  }
  return { pedir_politica: 'pedir una regla: el pedido es de la persona', corregir_juicio: 'corregir un juicio: la corrección es de la persona',
    pausar: 'pausar o cambiar la frecuencia: es el interruptor de la persona' }[n] || 'usar ' + n;
}

// actuar: un hilo o un lote de hasta 25. Sin politica es un pedido de la persona. Con politica, desde la plática,
// manda el nivel de esa política: en Me propone queda en su propuesta del día; un juicio sensible siempre se propone.
function actuarHerramienta_(st, a) {
  frenoPausa_(st);
  // Acentos y mayúsculas fuera antes de toda guarda: «leído» es leido.
  const accion = sinAcentos_(argTexto_(a.accion, 'accion')).trim().toLowerCase();
  let hilos = argLista_(a.hilos);
  if (!hilos) hilos = [argTexto_(a.id_hilo, 'id_hilo')];
  if (hilos.length > 25) throw new Error('Hasta 25 hilos por llamada.');
  if (accion === 'sacar_de_spam' && VIA !== 'webapp' && hilos.length > SPAM_RESCATE.LLAMADA) throw new Error('sacar_de_spam va con hasta ' + SPAM_RESCATE.LLAMADA + ' hilos por llamada y ' + SPAM_RESCATE.DIA + ' al día.');
  const pol = a.politica ? politica_(st, String(a.politica)) : null;
  // Desde una rutina nadie pidió nada: ningún correo se mueve ni se marca sin una regla activa que lo haga. La excepción es
  // la carpeta de seguridad que ella eligió en sus decisiones: mover ahí es su decisión.
  const aSuCarpeta = accion === 'mover' && ((experiencia_(st) || {}).decisiones || {}).seguridad === 'carpeta' &&
    (() => { try { return normalizarCarpeta_(a.carpeta).toLowerCase() === normalizarCarpeta_(MEMORIA.CARPETA_SEGURIDAD).toLowerCase(); } catch (e) { return false; } })();
  if (!pol && enRutina_() && !aSuCarpeta && ['mover', 'archivar', 'papelera', 'spam', 'leido', 'importante', 'enterado'].indexOf(accion) >= 0)
    throw new Error('Una rutina no mueve ni marca correo sin una regla activa: pasa politica con la regla que lo hace, o déjalo como propuesta para la persona. No moví nada.');
  if (pol && VIA === 'mcp' && (pol.estado !== 'activa' || pol.nivel === 'apagado')) throw new Error('La política «' + pol.nombre + '» no está activa. Si la persona lo pidió, llama sin politica.');
  // Con politica, la acción y la carpeta tienen que estar en la regla: una regla que solo mueve a Lecturas no manda a la
  // papelera (actuar está preaprobado en las rutinas). Sin politica es un pedido de la persona.
  // Enterarse con una regla es marcar leído por esa regla: se revisa primero y se actúa después. En Te propongo no marca nada.
  const porResumen = accion === 'enterado' || (accion === 'leido' && String(a.por || '').toLowerCase() === 'resumen'), sensiblesMotor = {};
  if (pol && VIA === 'mcp' && porResumen && pol.nivel === 'propone') throw new Error('La regla «' + pol.nombre + '» está en ' + COS.NIVEL_TEXTO.propone + ': no marca nada leído sin su sí. No marqué nada.');
  if (pol && VIA === 'mcp' && (['mover', 'archivar', 'papelera', 'spam', 'leido', 'importante'].indexOf(accion) >= 0 || porResumen)) {
    const acc = accionesMotor_(pol);
    const carpetas = acc.filter(x => /^carpeta:/.test(x)).map(x => { try { return normalizarCarpeta_(x.slice(8)).toLowerCase(); } catch (e) { return ''; } });
    let carpeta = '';
    if (accion === 'mover') { try { carpeta = normalizarCarpeta_(a.carpeta).toLowerCase(); } catch (e) {} }
    const ok = accion === 'mover' ? !!carpeta && carpetas.indexOf(carpeta) >= 0
      : accion === 'leido' || porResumen ? acc.indexOf('leido') >= 0 || (carpetas.length > 0 && marcaLeido_(st, acc))
      : acc.indexOf(accion) >= 0;
    if (!ok) throw new Error('La regla «' + pol.nombre + '» no autoriza ' + (accion === 'mover' ? 'mover a ' + (a.carpeta || '(sin carpeta)') : accion) + ': hace ' + (acc.join(', ') || 'nada sobre el correo') +
      '. No moví nada. Si la persona lo pidió, llama sin politica.');
    // Enterarse por una regla marca el lote junto: todos sus hilos tienen que cumplirla antes de marcar nada.
    if (porResumen) for (const h of hilos) { const no = reglaAplicaAlHilo_(st, pol, h, 'leido', null);
      if (no) throw new Error('La regla «' + pol.nombre + '» no aplica al hilo ' + h + ': ' + no + '. No marqué nada. Si la persona lo pidió, llama sin politica.'); }
  }
  // Lo demás va hilo por hilo: el hilo tiene que cumplir la regla (condiciones, excepciones y orden de choque, evaluados
  // por el motor). En un lote, el que no la cumple queda con su error y los demás siguen.
  const cumple = hilo => {
    if (!pol || VIA !== 'mcp' || ['mover', 'archivar', 'papelera', 'spam', 'leido', 'importante'].indexOf(accion) < 0) return;
    const marca = {}, no = reglaAplicaAlHilo_(st, pol, hilo, accion, marca);
    if (no) throw new Error('La regla «' + pol.nombre + '» no aplica al hilo ' + hilo + ': ' + no + '. No moví nada. Si la persona lo pidió, llama sin politica.');
    if (marca.sensible) sensiblesMotor[hilo] = marca.sensible;
  };
  // Enterarse por el resumen: accion enterado, o leido con por: "resumen". Un lote, una línea con un solo Deshacer.
  // Enterarse en automático: solo los hilos que la web app mostró con su resumen completo, y nunca lo sensible.
  if (accion === 'enterado' && (a.automatico === true || a.automatico === 'true')) {
    if (VIA !== 'webapp') throw new Error('enterado con automatico lo manda la web app con los hilos que mostró. Desde Claude, enterado va con los hilos que resumiste en tu respuesta.');
    if (decision_(st, 'enterarse') !== 'automatico') throw new Error('La persona no eligió enterarse en automático: no marqué nada leído.');
    const js = st.get('juicios', {});
    const vistos = hilos.filter(h => js[h] && !js[h].sensible);
    if (!vistos.length) return { hecho: 'Nada que marcar: ninguno de esos hilos tiene un resumen que cuente como leído.', resultados: [], sin_cambio: true };
    return enterarse_(st, vistos, 'webapp', true);
  }
  if (accion === 'enterado' || (accion === 'leido' && String(a.por || '').toLowerCase() === 'resumen')) return enterarse_(st, hilos, a.canal, !!a.hilos);
  const juicios = st.get('juicios', {});
  const uno = hilo => {
    cumple(hilo);
    const proponer = pol && VIA === 'mcp' && (pol.nivel === 'propone' || (juicios[hilo] && juicios[hilo].sensible && !juicios[hilo].vencido) || !!sensiblesMotor[hilo]);
    if (proponer) {
      const t = conReintento_(() => Gmail.Users.Threads.get('me', hilo, { format: 'metadata', metadataHeaders: ['From', 'Subject'] }));
      const items = sinBorradores_(t.messages).filter(m => tiene_(m, 'INBOX') && !tiene_(m, 'SENT')).map(m => itemDe_(metadatoDe_(m)));
      const sens = (juicios[hilo] && juicios[hilo].sensible) || sensiblesMotor[hilo];
      if (sens) items.forEach(i => { i.sens = sens; });
      if (!items.length) return { id_hilo: hilo, hecho: 'El hilo ya no está en la bandeja.', sin_cambio: true };
      const p = proponerLote_(st, pol.id, items);
      return { id_hilo: hilo, propuesto: p.id, hecho: 'Quedó en la propuesta de ' + pol.nombre + ' (' + COS.NIVEL_TEXTO[pol.nivel] + '): la persona decide.' };
    }
    const r = actuar_(st, hilo, accion, a.carpeta, pol);
    if (pol && r.id_accion) {
      const e = st.get('actividad', []).filter(x => x.id === r.id_accion)[0];
      if (e) { e.politica = pol.id; e.aviso = pol.nivel === 'avisa' || undefined; st.tocar('actividad'); sumarDisparos_(st, pol.id, 1); }
    }
    return r;
  };
  if (hilos.length === 1 && !a.hilos) return uno(hilos[0]);
  const res = hilos.map(h => { try { return uno(h); } catch (e) { return { id_hilo: h, error: mensajeError_(e) }; } });
  const hechos = res.filter(r => r.id_accion).length, prop = res.filter(r => r.propuesto).length;
  return { hecho: hechos + ' hilos con su acción' + (prop ? ', ' + prop + ' propuestos' : '') + (res.some(r => r.error) ? ', ' + res.filter(r => r.error).length + ' con error' : '') + '.', resultados: res };
}

// Campos del juicio: resumen con todo lo que importa (enterarse cuenta como leer), lo opcional que caduca y la próxima revisión.
function camposDelJuicio_(st, hilo, x) {
  const j = st.get('juicios', {});
  const y = j[hilo];
  if (!y) return;
  if (x.resumen !== undefined) y.resumen = String(x.resumen || '').trim().slice(0, 2000) || undefined;
  if (x.resumen_completo !== undefined) y.resumen_completo = x.resumen_completo === true || x.resumen_completo === 'true' || undefined;
  if (y.resumen_completo && !y.resumen) y.resumen_completo = undefined;
  if (x.opcional !== undefined) y.opcional = x.opcional === true || x.opcional === 'true' || undefined;
  // Opus pone en caduca (o en vence) cuándo sale de Hoy lo opcional: horas o fecha.
  if ((x.caduca === undefined || x.caduca === null) && y.opcional && x.vence !== undefined && x.vence !== null) x = Object.assign({}, x, { caduca: x.vence });
  if (x.caduca !== undefined && x.caduca !== null) y.caduca = typeof x.caduca === 'number' ? Date.now() + Math.max(1, Math.min(168, x.caduca)) * 3600000 : fechaRevision_(x.caduca);
  if (!y.opcional) delete y.caduca;
  if (x.proxima_revision !== undefined) y.revision = x.proxima_revision === null || x.proxima_revision === '' ? undefined : fechaRevision_(x.proxima_revision);
  st.set('juicios', j);
}

// Protección: el fraude genérico va a spam en el nivel de la política (nace en Lo hace y me avisa), con su línea de
// Bien y Deshacer. El que toca el negocio de la persona es riesgo y no se mueve. Nunca a spam a alguien con ficha o a
// quien la persona le escribe: si parece fraude, eso es suplantación, y se juzga riesgo.
function spamPorProteccion_(st, r, x) {
  const ops = Array.isArray(x.opciones) ? x.opciones : [];
  const rec = ops.filter(o => o && o.recomendada === true)[0] || ops[0];
  if (!rec || String(rec.accion || '').toLowerCase() !== 'spam') return undefined;
  if (r.prioridad === 'riesgo') return { hecho: 'Es riesgo: se queda en la bandeja y sale primero en Hoy.' };
  const pol = listaPoliticas_(st).filter(p => p.id === 'proteccion')[0];
  if (!pol || pol.estado !== 'activa' || pol.nivel === 'apagado') return { hecho: 'Protección está apagada: no lo mandé a spam.' };
  const f = fichaDe_(st.get('fichas', []), r.correo || '');
  const corr = (st.get('corresponsales', null) || {}).lista || [];
  if (f.persona || f.organizacion || (r.correo && corr.indexOf(r.correo) >= 0)) return { hecho: 'No lo mandé a spam: el remitente tiene ficha o la persona le escribe. Si es fraude que toca su negocio, júzgalo riesgo.' };
  return actuarHerramienta_(st, { id_hilo: r.id_hilo, accion: 'spam', politica: 'proteccion' });
}

// El aviso de Google por la conexión no es Protección: llega de no-reply@accounts.google.com con
// SPF y DKIM bien, nombra al Chief of Staff (con o sin sufijo) o a Claude y llega dentro de las 48 horas de la
// instalación. Ese juicio queda en baja, sin política y sin la opción de spam. Si falla la autenticación o nombra otra
// app, sigue siendo de Opus.
const AVISO_CONEXION = { DE: 'no-reply@accounts.google.com', HORAS: 48, RX: /chief of staff|\bclaude\b/i };
function avisoDeConexion_(st, hilo) {
  if (!hilo) return false;
  let t = null;
  try { t = conReintento_(() => Gmail.Users.Threads.get('me', String(hilo), { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Authentication-Results'] })); } catch (e) { return false; }
  const ms = sinBorradores_((t && t.messages) || []).filter(m => !tiene_(m, 'SENT'));
  const m = ms[ms.length - 1];
  if (!m) return false;
  const h = cabeceras_(m);
  if (correo_(h.from) !== AVISO_CONEXION.DE) return false;
  const auth = String((((m.payload && m.payload.headers) || []).filter(x => /^authentication-results$/i.test(x.name))[0] || {}).value || '').toLowerCase();
  if (!/\bspf=pass\b/.test(auth) || !/\bdkim=pass\b/.test(auth)) return false;
  if (!AVISO_CONEXION.RX.test((h.subject || '') + ' ' + (m.snippet || ''))) return false;
  const desde = st.get('instalado_desde', null) || Date.now();
  return Math.abs(Number(m.internalDate) - desde) <= AVISO_CONEXION.HORAS * 3600000;
}

// guardar_juicio: uno o un lote de hasta 25.
function guardarJuicios_(st, a) {
  // sensible: el tema (dinero, contratos, consejo, prensa u otro del perfil). true lo deduce del correo y, si no, de las
  // palabras de tu juicio. Un tema que no existe se rechaza antes de guardar.
  const temas = sensiblesDe_(st).map(t => t.tema);
  const uno = x => {
    const sv = x.sensible === true || x.sensible === 'true' ? true : x.sensible === false || x.sensible === 'false' || x.sensible === undefined || x.sensible === null || x.sensible === '' ? null : String(x.sensible).toLowerCase().trim();
    if (typeof sv === 'string' && temas.indexOf(sv) < 0) throw new Error('sensible es el tema: ' + temas.join(', ') + ', o true para que lo deduzca del correo y de tu juicio (llegó «' + x.sensible + '»).');
    const pv = String(x.politica || '').trim().toLowerCase();
    const conexion = (pv === 'proteccion' || pv === 'protección' || String(x.prioridad || '').toLowerCase() === 'riesgo') && avisoDeConexion_(st, x.id_hilo);
    if (conexion) x = Object.assign({}, x, { prioridad: 'baja', politica: undefined, opciones: Array.isArray(x.opciones) ? x.opciones.filter(o => o && ['spam', 'papelera'].indexOf(String(o.accion || '').toLowerCase()) < 0) : x.opciones });
    if (conexion && Array.isArray(x.opciones) && !x.opciones.length) x.opciones = undefined;
    const r = guardarJuicio_(st, x.id_hilo, x.prioridad, x.recomendacion, x.motivo, x.confianza, x.opciones, x.politica);
    if (conexion) r.aviso_conexion = 'Es el aviso de Google por la conexión del Chief of Staff: lo dejé en baja y no en Protección.';
    if ((x.sensible === false || x.sensible === 'false') && !r.respetado) {
      // Opus juzgó que no pide decidir ni mover dinero (una factura recurrente, por ejemplo): manda sobre la palabra clave.
      const j = st.get('juicios', {});
      if (j[r.id_hilo]) { delete j[r.id_hilo].sensible; delete j[r.id_hilo].sensible_por; j[r.id_hilo].no_sensible = true; st.set('juicios', j); r.tema_sensible = undefined; r.tema_sensible_por = undefined; }
    } else if (sv && !r.respetado) {
      const j = st.get('juicios', {});
      const y = j[r.id_hilo];
      if (y) {
        let v = sv === true ? y.sensible : sv, por = y.sensible_por && y.sensible_por.tema === v ? y.sensible_por : null;
        if (!v) {
          const sd = sensibleDetalle_([y.dh ? y.dh.as : '', y.recomendacion, y.motivo].join(' '), st);
          if (sd) { v = sd.tema; por = { tema: v, palabra: sd.palabra, fuente: 'juicio de Opus' }; }
        }
        // Sin tema en el correo ni en el juicio: se queda la marca (siempre se propone) y se pide el tema.
        if (!v) { v = 'sin tema'; r.sensible_sin_tema = 'No encontré el tema en el correo ni en tu juicio: repite con sensible: ' + temas.map(t => '"' + t + '"').join(', ') + '.'; }
        y.sensible = v; y.sensible_por = por || { tema: v, fuente: 'juicio de Opus' };
        delete y.no_sensible; st.set('juicios', j); r.tema_sensible = v; r.tema_sensible_por = y.sensible_por;
      }
    }
    if (!r.respetado) camposDelJuicio_(st, r.id_hilo, x);
    if (!r.respetado && r.politica === 'proteccion') { try { r.proteccion = spamPorProteccion_(st, r, x); } catch (e) { r.proteccion = { error: 'Guardé el juicio, pero no pude mandarlo a spam ahora: ' + mensajeError_(e) }; } }
    delete r.correo;
    return r;
  };
  if (a.juicios !== undefined && a.juicios !== null) {
    let l = a.juicios;
    if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = null; } }
    if (!Array.isArray(l) || !l.length) throw new Error('juicios es una lista de 1 a 25 {id_hilo, prioridad, recomendacion, motivo, confianza, politica, sensible, opciones}.');
    if (l.length > 25) throw new Error('Hasta 25 juicios por llamada.');
    const res = l.map(x => { try { return uno(x || {}); } catch (e) { return { id_hilo: x && x.id_hilo, error: mensajeError_(e) }; } });
    const ok = res.filter(r => !r.error).length;
    // Por hilo, solo id, prioridad y lo que no es rutina (error, respetado, tema sensible, sin completar, protección): el
    // eco de la recomendación pesaba tanto como el juicio. La web app recibe todo.
    const corto = r => VIA === 'webapp' ? r : Object.assign({ id_hilo: r.id_hilo, prioridad: r.prioridad }, r.error ? { error: r.error } : {}, r.respetado ? { respetado: true, hecho: r.hecho } : {},
      r.tema_sensible ? { tema_sensible: r.tema_sensible, tema_sensible_por: r.tema_sensible_por } : {}, r.sensible_sin_tema ? { sensible_sin_tema: r.sensible_sin_tema } : {},
      r.sin_completar ? { sin_completar: r.sin_completar } : {}, r.proteccion ? { proteccion: r.proteccion } : {}, r.aviso_conexion ? { aviso_conexion: r.aviso_conexion } : {});
    return { hecho: 'Guardé ' + ok + ' de ' + l.length + ' juicios.', guardados: ok, errores: l.length - ok || undefined, juicios: res.map(corto) };
  }
  return uno(a);
}

// La web app llama las mismas herramientas desde el navegador: google.script.run.webapp(herramienta, argumentos).
// Responde { ok: true, datos } o { ok: false, error }. Solo para el dueño de la cuenta.
function webapp(herramienta, argumentos) {
  if (!esDueno_()) return { ok: false, error: 'No autorizado.' };
  anotarLiga_('cos.webapp_url');
  return webappEjecuta_(herramienta, argumentos);
}

function webappEjecuta_(herramienta, argumentos) {
  let a = argumentos;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = {}; } }
  const r = ejecutarHerramienta_(String(herramienta || ''), a || {}, 'webapp');
  return r.isError ? { ok: false, error: r.content[0].text, codigo: r.structuredContent && r.structuredContent.codigo || undefined } : { ok: true, datos: r.structuredContent };
}

// Reconectar con Claude desde la web app: pide al relevo un código nuevo para esta instalación y lo devuelve
// con el enlace que abre Tuyos. Si el relevo no conoce el proyecto, da de alta otra vez con la dirección del conector.
// Solo la web app; la llave nunca sale en la respuesta.
function reconectarClaude_() {
  if (VIA !== 'webapp') throw new Error('Reconectar solo existe en la web app de la persona.');
  const ins = typeof INSTALACION !== 'undefined' ? INSTALACION : {};
  if (!ins.llave) throw new Error('Esta instalación no tiene llave: conéctala desde tu computadora.');
  const relevo = String(ins.relevo || 'https://chief.anotado.ai').replace(/\/$/, '');
  const pedir = (ruta, cuerpo) => externa_(() => UrlFetchApp.fetch(relevo + ruta, { method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo), muteHttpExceptions: true }));
  const proyecto = ScriptApp.getScriptId();
  let r = pedir('/reconectar', { proyecto: proyecto, llave: ins.llave }), alta = false;
  // 404: el relevo no tiene el índice de este proyecto (instalaciones de antes del relevo nuevo). /alta conserva el uid y
  // los permisos dados y, con proyecto en el cuerpo, deja el índice escrito para la próxima vez.
  if (r.getResponseCode() === 404) {
    const url = PropertiesService.getScriptProperties().getProperty('cos.conector_url');
    if (url) { r = pedir('/alta', { script_url: url, llave: ins.llave, proyecto: proyecto }); alta = true; }
  }
  let c = {};
  try { c = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
  if (r.getResponseCode() !== 200 || !c.codigo) throw new Error('El relevo no dio un código para reconectar (' + r.getResponseCode() + '): ' + String(c.error || 'sin respuesta').slice(0, 160));
  // El enlace abre Tuyos (ir=tuyos). Nunca ir=claude: crea un conector aparte que las rutinas no usan.
  let enlace = c.enlace || relevo + '/vincular?c=' + encodeURIComponent(c.codigo);
  if (alta && !/[?&]ir=/.test(enlace)) enlace += (enlace.indexOf('?') >= 0 ? '&' : '?') + 'ir=tuyos';
  return { codigo: c.codigo, vence: c.vence, enlace: enlace };
}

// Lo que ve la persona en la web app no lleva palabras internas ni ids: «regla» en lugar de «política», y fuera las
// oraciones con nombres de herramientas, ids o llaves. Si no queda nada, una línea general.
function errorParaLaPersona_(s) {
  const l = String(s || '').replace(/\bpol[ií]ticas\b/g, 'reglas').replace(/\bPol[ií]ticas\b/g, 'Reglas').replace(/\bpol[ií]tica\b/g, 'regla').replace(/\bPol[ií]tica\b/g, 'Regla')
    .replace(/\b(regla|propuesta|aviso|correo)\s+[a-z]{1,3}[0-9][0-9a-z]*\b/gi, '$1').replace(/\s*\([a-z]{1,3}[0-9][0-9a-z]*\)/g, '').split(/(?<=[.:])\s+/)
    .filter(o => !/\b(ver|guardar|cambiar|pedir|leer|analizar|redactar|corregir|exportar|sacar)_[a-z_]+\b|\b([Cc]on|[Uu]sa|[Ll]lama) (proponer|responder|actuar|aplicar|deshacer|simular|buscar)\b|tools\/list|[{}]|\b(Opus|motor|conector)\b/.test(o));
  const r = l.join(' ').trim(), generica = 'No pude hacer ese cambio. Pídeselo a Claude en tu siguiente revisión.';
  // Si después de limpiar queda un id, la palabra id o nivel, o un valor técnico, va la frase general.
  return !r || /\b[a-z]{1,3}-?\d+[a-z0-9]*\b|\b[0-9a-f]{12,}\b|\b(id|ids|nivel|niveles)\b|\b[a-z]+_[a-z_]+\b|<[a-z_]+>/i.test(r) ? generica : r;
}
function mensajeError_(err) {
  const s = String(err && err.message || err);
  if (esLimiteMinuto_(err)) return MINUTO_GMAIL.TEXTO;
  if (/not found|Requested entity was not found|Invalid id value|No se encontr/i.test(s)) return 'No encontré ese correo o hilo en Gmail. Revisa el id_hilo (viene de ver_hoy, ver_novedades o buscar). Detalle: ' + s.slice(0, 200);
  return s;
}

// ---------- Administración (solo con la llave; no es una herramienta del modelo) ----------
function administrar_(p) {
  const a = p.accion;
  if (typeof sondaAdmin_ === 'function') { const r = sondaAdmin_(p); if (r !== null) return r; }
  if (a === 'estado') return estadoMotor_();
  if (a === 'probar_lote') return probarLote_();
  if (a === 'instalar') return instalarMotor_();
  if (a === 'desinstalar') return desinstalarMotor_();
  if (a === 'preparar_hoja') return prepararHoja_();
  if (a === 'corrida') {
    const r = corrida_({ origen: 'admin', espera: 20000, refrescarCorresponsales: !!p.refrescar, reiniciarHistorial: !!p.reiniciar });
    if (r.omitida) throw new Error(r.omitida);
    return r;
  }
  if (a === 'webapp') return webappEjecuta_(p.herramienta, p.argumentos);
  if (a === 'analisis_reiniciar') {
    quitarPasos_();
    PropertiesService.getScriptProperties().deleteProperty(ANALISIS.LLAVE);
    PropertiesService.getScriptProperties().deleteProperty(ANALISIS.TURNO);
    try { CacheService.getScriptCache().remove(ANALISIS.PREFIJO + 'res.n'); } catch (e) {}
    return conCandado_(st => { st.borrar('analisis'); return { reiniciado: true }; });
  }
  // Limpieza de pruebas: quita registros por id sin tocar el correo.
  if (a === 'quitar') {
    return conCandado_(st => {
      const tabla = String(p.tabla || ''), ids = {};
      (p.ids || []).forEach(x => { ids[String(x)] = 1; });
      const v = st.get(tabla, null);
      if (v === null) throw new Error('No hay ' + tabla + '.');
      let n = 0;
      if (Array.isArray(v)) { const l = v.filter(x => { const k = x.id || x.id_mensaje || x.hilo || x.id_hilo; if (ids[k]) { n++; return false; } return true; }); st.set(tabla, l); }
      else { Object.keys(v).forEach(k => { if (ids[k]) { delete v[k]; n++; } }); st.set(tabla, v); }
      return { tabla: tabla, quitados: n };
    });
  }
  // Conteos de Gmail para verificar las pruebas antes y después.
  if (a === 'conteos') {
    const n = q => listarIds_(q, 5000, Date.now()).length;
    const nombres = nombresEtiquetas_(true);
    const cos = Object.keys(nombres).filter(id => esEtiquetaCos_(nombres[id])).map(id => { const x = Gmail.Users.Labels.get('me', id); return { nombre: nombres[id], mensajes: x.messagesTotal || 0 }; });
    let borradores = 0;
    try { borradores = (Gmail.Users.Drafts.list('me', { maxResults: 500 }).drafts || []).length; } catch (e) {}
    // Totales exactos de las etiquetas: una búsqueda topa en 5,000 y no distingue un buzón grande.
    const etq = id => { const x = conReintento_(() => Gmail.Users.Labels.get('me', id)); return { total: x.messagesTotal || 0, sin_leer: x.messagesUnread || 0 }; };
    const ib = etq('INBOX'), pa = etq('TRASH'), sp = etq('SPAM'), dr = etq('DRAFT');
    return { exactos: { bandeja: ib.total, bandeja_sin_leer: ib.sin_leer, papelera: pa.total, spam: sp.total, borradores: dr.total },
      bandeja: n('in:inbox'), bandeja_sin_leer: n('in:inbox is:unread'), importantes_bandeja: n('in:inbox is:important'), papelera_hoy: n('in:trash newer_than:1d'),
      spam_hoy: n('in:spam newer_than:1d'), carpetas_cos: cos, borradores: borradores, hora: fecha_(Date.now()), t: Date.now(),
      llegaron_desde: p.desde ? n('in:inbox after:' + Math.floor(Number(p.desde) / 1000)) : undefined,
      llegaron_sin_leer_desde: p.desde ? n('in:inbox is:unread after:' + Math.floor(Number(p.desde) / 1000)) : undefined };
  }
  // Limpieza de pruebas: quita las carpetas del Chief of Staff que quedaron sin correo (no toca ningún correo).
  if (a === 'borrar_etiquetas_vacias') {
    if (!p.solo) throw new Error('Pasa solo: la carpeta de prueba relativa a Chief of Staff. Las demás pueden ser de otra instalación.');
    const nombres = nombresEtiquetas_(true);
    const borradas = [], conCorreo = [];
    Object.keys(nombres).filter(id => esEtiquetaCos_(nombres[id]) && nombres[id] === COS.RAIZ + '/' + p.solo).sort((x, y) => nombres[y].length - nombres[x].length).forEach(id => {
      const x = Gmail.Users.Labels.get('me', id);
      if ((x.messagesTotal || 0) === 0) { Gmail.Users.Labels.remove('me', id); borradas.push(nombres[id]); } else conCorreo.push(nombres[id] + ' (' + x.messagesTotal + ')');
    });
    CacheService.getScriptCache().remove('cos_etiquetas');
    return { borradas: borradas, con_correo: conCorreo };
  }
  // Pasos y script de la lectura en vivo de WhatsApp como dato: sin pasos ni script, regresa a los del despliegue.
  if (a === 'como_leer') return conCandado_(st => {
    if (!p.pasos && !p.script) { st.borrar('como_leer_whatsapp'); return { como_leer: 'la del despliegue' }; }
    st.set('como_leer_whatsapp', { pasos: p.pasos ? String(p.pasos) : undefined, script: p.script ? String(p.script) : undefined, t: Date.now() });
    return { como_leer: 'guardada', pasos: p.pasos ? String(p.pasos).length : 'la del despliegue', script: p.script ? String(p.script).length : 'el del despliegue' };
  });
  if (a === 'leer') return conCandado_(st => ({ llave: p.llave, valor: st.get(String(p.llave || ''), null) }));
  if (a === 'poner') return conCandado_(st => { st.set(String(p.llave), p.valor); return { llave: p.llave, puesto: true }; });
  if (a === 'borrar_llaves') return conCandado_(st => { (p.llaves || []).forEach(k => st.borrar(k)); return { borradas: p.llaves || [] }; });
  throw new Error('Acción de administración desconocida: ' + a);
}

function estadoMotor_() {
  const st = almacen_();
  const corr = st.get('corridas', []);
  return {
    version: CONECTOR.VERSION, cuenta: yo_(), hoja: (() => { try { const ss = SpreadsheetApp.getActiveSpreadsheet(); return { nombre: ss.getName(), url: ss.getUrl(), pestanas: ss.getSheets().map(s => s.getName()) }; } catch (e) { return { error: String(e.message || e) }; } })(),
    activadores: ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()),
    instalado_desde: st.get('instalado_desde', null) ? fecha_(st.get('instalado_desde', null)) : null,
    historyId: st.get('historyId', null), pausa: st.get('pausa', null),
    politicas_activas: listaPoliticas_(st).filter(politicaViva_).map(p => p.id + ':' + p.nivel),
    propuestas_abiertas: listaPropuestas_(st).filter(p => p.estado === 'abierta').length,
    juicios: Object.keys(st.get('juicios', {})).length, senales: st.get('senales', []).length, actividad: st.get('actividad', []).length,
    en_espera: Object.keys(st.get('en_espera', {})).length, conocidos: Object.keys(st.get('conocidos', {})).length,
    ultima_corrida: corr[0] ? { hora: fecha_(corr[0].t), quien: corr[0].quien, version: corr[0].v, resultado: corr[0].resultado } : null,
    ocupacion: ocupacionAlmacen_(st)
  };
}

function rpcOk_(id, result) { return { jsonrpc: '2.0', id: id, result: result }; }
function rpcError_(id, code, message) { return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: code, message: message } }; }
function conectorJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
