// --- Políticas: lo que hace el Chief of Staff ---
// Una sola entidad en lugar de reglas, criterios, encargos y menú de delegación. La persona aprueba la
// política en palabras; Opus mantiene su compilación. El motor ejecuta solo `compilado`; `criterio` lo aplica
// Opus. Ningún correo se mueve sin una política activa.

const POLITICA = {
  CAMPOS: ['remitente', 'dominio', 'lista', 'categoria_gmail', 'consulta', 'ficha', 'importancia'],
  // Gana la condición más específica: remitente, luego dominio, lista, consulta y categoría.
  ESPECIFICIDAD: { remitente: 7, ficha: 6, dominio: 5, lista: 4, consulta: 3, categoria_gmail: 2, importancia: 1 },
  // Antes del juicio de Opus, a un remitente nuevo solo lo mueve una condición explícita.
  EXPLICITAS: ['remitente', 'dominio', 'ficha'],
  // dejar_sin_leer: la carpeta no marca leído aunque la decisión sin_leer sea lo_que_te_necesita («Fuera, sin marcarlo leído»).
  ACCIONES_MOTOR: ['importante', 'leido', 'archivar', 'papelera', 'spam', 'desuscribir', 'nunca_limpiar', 'aviso_en_hoy', 'dejar_sin_leer'],
  ACCIONES_OPUS: ['juicio', 'borrador', 'seguimiento', 'ficha'],
  LIMPIEZA: ['leido', 'archivar', 'papelera', 'spam', 'desuscribir'],
  NIVELES: ['apagado', 'propone', 'avisa', 'solo'],
  ESTADOS: ['borrador', 'propuesta', 'activa', 'pausada', 'retirada'],
  ORIGENES: ['catalogo', 'persona', 'opus'],
  CUANDO: ['cada_corrida', 'cada_hora', 'diario', 'semanal'],
  CATEGORIAS: ['promociones', 'social', 'notificaciones', 'foros', 'principal'],
  MAX: 200,
  MAX_VALORES: 400,
  MAX_VERSIONES: 10,
  DIAS_PRUEBA: 14,
  DIAS_BAJA_PAPELERA: 14
};

// Catálogo: políticas escritas de antemano, todas apagadas. El plan de instalación propone cuáles encender.
const CATALOGO = [
  { id: 'publicidad', nombre: 'Publicidad', texto: 'La publicidad va a su carpeta, leída.', acciones: [] },
  { id: 'boletines', nombre: 'Boletines', texto: 'Los boletines van a su carpeta, leídos.', acciones: [] },
  { id: 'notificaciones', nombre: 'Notificaciones', texto: 'Las notificaciones van a su carpeta, leídas.', acciones: [] },
  { id: 'bandeja_limpia', nombre: 'Bandeja limpia', texto: 'Archivo lo que ya leíste en Recibidos y no te pide nada: sin respuesta pendiente, sin seguimiento abierto y sin borrador. Nunca archivo lo sin leer.',
    acciones: ['archivar'], cuando: 'cierre' },
  { id: 'carpetas', nombre: 'Carpetas por tema', texto: 'Las carpetas que Opus te sugiere a partir de tu correo; cada carpeta es una regla propia.', acciones: [] },
  { id: 'papelera', nombre: 'Papelera', texto: 'Lo que siempre borras sin abrir va a la papelera (se recupera en 30 días).', acciones: ['papelera'] },
  { id: 'spam', nombre: 'Spam', texto: 'Lo sospechoso por su contenido o su autenticación va a spam; también enseña al filtro de Gmail.', acciones: ['spam'],
    criterio: 'Opus manda a spam lo que finge ser alguien más o trae un fraude: un nombre que no corresponde a su dirección, una verificación del remitente que falla, enlaces para "verificar" tus datos. No basta con que alguien te escriba por primera vez: así llega también una persona nueva. Si Opus no está seguro, no lo manda a spam: lo deja en tu bandeja y te dice por qué.' },
  { id: 'bajas', nombre: 'Bajas', texto: 'Me doy de baja de lo que Opus ve que nunca abres, solo con baja de un clic. A un remitente nuevo, con ficha alta o en un tema sensible, solo con tu sí; a uno sospechoso, nunca. Lo que siga llegando en 14 días va a la papelera.', acciones: ['desuscribir'] },
  { id: 'respuestas', nombre: 'Respuestas', texto: 'Opus te deja un borrador en el hilo, con tu voz. Nunca se envía solo.', acciones: ['borrador'] },
  { id: 'seguimiento', nombre: 'Seguimiento', texto: 'Te recuerdo quién te debe respuesta.', acciones: ['seguimiento'] },
  { id: 'compromisos', nombre: 'Compromisos', texto: 'Lo que prometiste y lo que te prometieron, en correo y WhatsApp.', acciones: ['seguimiento'] },
  { id: 'proteccion', nombre: 'Protección', texto: 'El fraude que toca tu negocio se queda y sale primero en Hoy; el genérico va a spam y te aviso.', acciones: ['juicio', 'spam'], nivel: 'avisa',
    criterio: 'Opus revisa quién manda de verdad cada correo y qué te pide. Si alguien se hace pasar por tu jefe, un cliente, un proveedor o tu banco, o te pide cambiar una cuenta de pago, Opus no lo mueve: te lo pone primero en Hoy y te dice qué hacer. El fraude genérico, como un paquete retenido o "verifica tu cuenta", lo manda a spam y te avisa. Si no está seguro de si te toca, te lo enseña.' },
  { id: 'personas', nombre: 'Personas', texto: 'Opus tiene al día lo que sabe de las personas y organizaciones de tu correo.', acciones: ['ficha'] },
  { id: 'juntas', nombre: 'Juntas', texto: 'Contexto de cada reunión con los correos de quienes asisten; te pido el permiso de calendario solo al encenderla.', acciones: [] },
  { id: 'autonomia', nombre: 'Autonomía', texto: 'Con datos, te propongo que una regla pase de Te propongo a Te aviso o a Lo hago solo. Si rescatas más de 2% de lo que mueve una regla, la bajo un paso aunque Autonomía esté apagada.', acciones: [] },
  { id: 'whatsapp', nombre: 'WhatsApp', texto: 'Opus resume lo que necesita respuesta y te deja la respuesta escrita sin enviar.', acciones: ['borrador'] }
];

// Textos que el catálogo sembró en versiones anteriores: si la persona no los cambió, se cambian por los de arriba.
const CATALOGO_ANTERIOR = {
  bandeja_limpia: ['Archiva lo que ya leyó en la bandeja y no le pide nada: sin respuesta pendiente, sin seguimiento abierto y sin borrador. Nunca archiva sin leer.'],
  papelera: ['Lo que siempre borra sin abrir va a la papelera (se recupera en 30 días).'],
  bajas: ['Opus da de baja de lo que nunca abre, solo con baja de un clic y nunca a un remitente nuevo o sospechoso. Lo que siga llegando en 14 días va a la papelera.'],
  respuestas: ['Deja un borrador en el hilo, con su voz; nunca envía.'],
  seguimiento: ['Le recuerda quién le debe respuesta.'],
  compromisos: ['Lo que prometió y lo que le prometieron, en correo y WhatsApp.'],
  personas: ['Mantiene al día las fichas de personas y organizaciones.'],
  juntas: ['Contexto de cada reunión con los correos de quienes asisten; pide el permiso de calendario solo al encenderse.'],
  autonomia: ['Te propongo subir el nivel de cada regla con datos. Si rescatas más de 2% de lo que mueve una regla, le bajo el nivel aunque Autonomía esté apagada.', 'Propone subir el nivel de cada regla con datos. Bajarlo cuando los rescates pasan de 2% no depende de ella.', 'Propone subir el nivel de cada política con datos. Bajarlo cuando los rescates pasan de 2% no depende de ella.'],
  whatsapp: ['Resume lo que necesita respuesta y deja la respuesta escrita sin enviar.'],
  carpetas: ['Las carpetas que Opus te sugiere a partir de tu correo; cada carpeta es una política propia.']
};

// Disparos y rescates por día, para la tasa de rescate de los últimos 30 días. Una regla anterior a esta cuenta usa sus
// totales hasta juntar sus días.
function porDia_(m, k, n) {
  const d = dia_(Date.now()), x = m.por_dia || (m.por_dia = {});
  x[d] = x[d] || [0, 0]; x[d][k] += n;
  const ds = Object.keys(x).sort(); if (ds.length > 31) ds.slice(0, ds.length - 31).forEach(y => { delete x[y]; });
}
function tasaRescate_(m) {
  if (!m) return 0;
  if (!m.por_dia) return m.disparos > 0 ? m.rescates / m.disparos : 0;
  const desde = dia_(Date.now() - 30 * 86400000), s = [0, 0];
  Object.keys(m.por_dia).filter(d => d > desde).forEach(d => { s[0] += m.por_dia[d][0]; s[1] += m.por_dia[d][1]; });
  return s[0] > 0 ? s[1] / s[0] : 0;
}
function metricasVacias_() { return { disparos: 0, ultimo_disparo: null, aceptadas: 0, observadas: 0, corregidas: 0, rechazadas: 0, rescates: 0, ultimas_20: [] }; }

// Lista de políticas; siembra el catálogo la primera vez.
function listaPoliticas_(st) {
  let l = st.get('politicas', []);
  const ids = {};
  l.forEach(p => { ids[p.id] = 1; });
  const faltan = CATALOGO.filter(c => !ids[c.id]);
  if (faltan.length) {
    faltan.forEach(c => l.push({ id: c.id, nombre: c.nombre, texto: c.texto, origen: 'catalogo', nivel: c.nivel || 'apagado', estado: 'activa',
      compilado: { condiciones: [], excepciones: [] }, criterio: c.criterio || '', acciones: c.acciones.slice(), cuando: c.cuando || 'cada_corrida',
      prueba: null, version: 1, versiones: [], metricas: metricasVacias_(), creada: Date.now(), actualizada: Date.now() }));
  }
  let viejo = 0;
  l.forEach(p => { const c = (CATALOGO_ANTERIOR[p.id] || []).indexOf(p.texto) >= 0 && CATALOGO.filter(x => x.id === p.id)[0]; if (c) { p.texto = c.texto; viejo++; } });
  if (faltan.length || viejo) st.set('politicas', l);
  return l;
}

function politica_(st, id) {
  const p = listaPoliticas_(st).filter(x => x.id === id)[0];
  if (!p) throw new Error('No hay una política ' + id + '. Usa ver_politicas para ver los ids.');
  return p;
}

// Una política ejecuta en la corrida si está activa, no está apagada y tiene condiciones.
// apagado < propone < avisa < solo: subir pide el sí de la persona; bajar, nunca.
function rangoNivel_(n) { return POLITICA.NIVELES.indexOf(n); }
function politicaViva_(p) { return p.estado === 'activa' && p.nivel !== 'apagado' && p.compilado && (p.compilado.condiciones || []).length > 0; }

// Sin leer = lo que te necesita: lo que una regla manda a una carpeta queda leído, salvo Leer después o
// dejar_sin_leer. Con la decisión sin_leer en como_esta, solo con leido.
function marcaLeido_(st, acciones) {
  if (acciones.indexOf('leido') >= 0) return true;
  if (acciones.indexOf('dejar_sin_leer') >= 0 || acciones.indexOf('papelera') >= 0 || acciones.indexOf('spam') >= 0) return false;
  const carpeta = (acciones.filter(a => /^carpeta:/.test(a))[0] || '').slice(8);
  return !!carpeta && carpeta.replace(/^\//, '').toLowerCase() !== COS.LEER_DESPUES.toLowerCase() && (st ? decision_(st, 'sin_leer') : MEMORIA.DECISIONES.sin_leer[0]) === 'lo_que_te_necesita';
}
function accionesMotor_(p) { return (p.acciones || []).filter(a => /^carpeta:/.test(a) || POLITICA.ACCIONES_MOTOR.indexOf(a) >= 0); }
function limpia_(acciones) { return acciones.some(a => /^carpeta:/.test(a) || POLITICA.LIMPIEZA.indexOf(a) >= 0); }

// ---------- Validación ----------
function normalizarCondicion_(st, c, donde) {
  if (!c || typeof c !== 'object') throw new Error('Cada ' + donde + ' es {campo, valores}.');
  const campo = String(c.campo || '').trim().toLowerCase();
  if (POLITICA.CAMPOS.indexOf(campo) < 0) throw new Error('campo vale ' + POLITICA.CAMPOS.join(', ') + ' (llegó «' + c.campo + '»).');
  let vs = c.valores !== undefined ? c.valores : c.valor;
  vs = (Array.isArray(vs) ? vs : [vs]).map(v => String(v === undefined || v === null ? '' : v).trim()).filter(Boolean);
  if (!vs.length) throw new Error('La ' + donde + ' de ' + campo + ' no trae valores.');
  vs = vs.map(v => {
    if (campo === 'remitente') {
      const x = correo_(v);
      if (x.indexOf('@') < 1) throw new Error('remitente es una dirección completa (ana@empresa.com); llegó «' + v + '».');
      return x;
    }
    if (campo === 'dominio') {
      const x = v.toLowerCase().replace(/^@/, '').replace(/^www\./, '');
      if (x.indexOf('@') >= 0 || x.indexOf('.') < 0) throw new Error('dominio es como empresa.com; llegó «' + v + '».');
      if (COS.RX_GENERICO.test(x + '.')) throw new Error(x + ' es un dominio de correo personal: no se usa como condición (usa el remitente).');
      return x;
    }
    if (campo === 'lista') return v.toLowerCase().replace(/^<|>$/g, '');
    if (campo === 'categoria_gmail') {
      const x = sinAcentos_(v).toLowerCase();
      if (POLITICA.CATEGORIAS.indexOf(x) < 0) throw new Error('categoria_gmail vale ' + POLITICA.CATEGORIAS.join(', ') + '.');
      return x;
    }
    if (campo === 'consulta') {
      if (/(^|\s|\()-?(in|is|label|older_than|newer_than|before|after|has:userlabels)\s*:/i.test(v)) throw new Error('La consulta no admite in:, is:, label: ni fechas: el motor pone la ventana. Llegó «' + v + '».');
      if (v.length > 400) throw new Error('La consulta pasa de 400 caracteres.');
      return v;
    }
    if (campo === 'ficha') {
      // persona u organizacion: el remitente tiene una ficha de ese tipo. Si no, el id de una ficha.
      if (v === 'persona' || v === 'organizacion') return v;
      if (!st.get('fichas', []).some(f => f.id === v)) throw new Error('No hay una ficha ' + v + '. Usa ver_memoria("fichas"), o los valores persona u organizacion.');
      return v;
    }
    return importanciaFicha_(v);
  });
  vs = vs.filter((v, i) => vs.indexOf(v) === i);
  if (vs.length > POLITICA.MAX_VALORES) throw new Error('Una condición admite hasta ' + POLITICA.MAX_VALORES + ' valores.');
  return { campo: campo, valores: vs };
}

function normalizarCompilado_(st, c) {
  if (c === undefined || c === null) return { condiciones: [], excepciones: [] };
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { throw new Error('compilado es {condiciones: [{campo, valores}], excepciones: [...]}.'); } }
  const junta = lista => {
    const por = {};
    lista.forEach(x => { por[x.campo] = (por[x.campo] || []).concat(x.valores); });
    return Object.keys(por).map(k => ({ campo: k, valores: por[k].filter((v, i, a) => a.indexOf(v) === i) }));
  };
  return { condiciones: junta((c.condiciones || []).map(x => normalizarCondicion_(st, x, 'condición'))),
    excepciones: junta((c.excepciones || []).map(x => normalizarCondicion_(st, x, 'excepción'))) };
}

function normalizarAcciones_(a) {
  const l = (Array.isArray(a) ? a : (a ? [a] : [])).map(x => String(x).trim());
  return l.map(x => {
    if (/^carpeta:/i.test(x)) return 'carpeta:' + normalizarCarpeta_(x.slice(8));
    const y = x.toLowerCase();
    if (POLITICA.ACCIONES_MOTOR.indexOf(y) < 0 && POLITICA.ACCIONES_OPUS.indexOf(y) < 0)
      throw new Error('Acción desconocida: ' + x + '. Del motor: carpeta:<nombre>, ' + POLITICA.ACCIONES_MOTOR.join(', ') + '. De Opus: ' + POLITICA.ACCIONES_OPUS.join(', ') + '.');
    return y;
  }).filter((x, i, arr) => arr.indexOf(x) === i);
}

function normalizarCuando_(c) {
  const s = String(c || 'cada_corrida').trim().toLowerCase();
  if (POLITICA.CUANDO.indexOf(s) >= 0) return s;
  if (/^horario:[0-9*,\/\- ]{9,60}$/.test(s)) return s;
  // Bandeja limpia: a una hora del día ("19:00"), al cierre, o N horas después de leído ("3h").
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
  if (s === 'cierre' || s === 'al cierre') return 'cierre';
  m = s.match(/^(\d{1,2})\s*h/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 72) return Number(m[1]) + 'h';
  throw new Error('cuando vale cada_corrida, cada_hora, diario, semanal, horario:<cron>; para Bandeja limpia, "HH:mm", "cierre" o "3h" (horas después de leído).');
}

// ---------- Lo que la persona fijó ----------
// p.fijo guarda lo que la persona puso o quitó en la compilación; Opus no lo revierte sin su sí.
function fijarDePersona_(p, cambio) {
  const f = p.fijo || (p.fijo = { condiciones: [], excepciones: [], quitadas: [] });
  (cambio.condiciones || []).forEach(x => x.valores.forEach(v => { if (!f.condiciones.some(y => y.campo === x.campo && y.valor === v)) f.condiciones.push({ campo: x.campo, valor: v }); }));
  (cambio.excepciones || []).forEach(x => x.valores.forEach(v => { if (!f.excepciones.some(y => y.campo === x.campo && y.valor === v)) f.excepciones.push({ campo: x.campo, valor: v }); }));
  (cambio.quitadas || []).forEach(x => { if (!f.quitadas.some(y => y.campo === x.campo && y.valor === x.valor)) f.quitadas.push(x); });
}

function tieneValor_(lista, campo, valor) { return (lista || []).some(x => x.campo === campo && (x.valores || []).indexOf(valor) >= 0); }

function revisarFijo_(p, nuevo) {
  const f = p.fijo;
  if (!f) return;
  const faltan = [];
  f.condiciones.forEach(x => { if (!tieneValor_(nuevo.condiciones, x.campo, x.valor)) faltan.push('condición ' + x.campo + ' ' + x.valor); });
  f.excepciones.forEach(x => { if (!tieneValor_(nuevo.excepciones, x.campo, x.valor)) faltan.push('excepción ' + x.campo + ' ' + x.valor); });
  f.quitadas.forEach(x => { if (tieneValor_(nuevo.condiciones, x.campo, x.valor)) faltan.push('vuelve a poner ' + x.campo + ' ' + x.valor + ', que la persona quitó'); });
  if (faltan.length) throw new Error('Esa compilación revierte lo que corrigió la persona (' + faltan.slice(0, 4).join('; ') + '). Si crees que cambió, pregúntale con proponer.');
}

// ---------- Prueba contra los últimos 14 días ----------
function consultaGmail_(st, compilado, dias) {
  const fichas = st.get('fichas', []);
  const partes = [];
  (compilado.condiciones || []).forEach(c => c.valores.forEach(v => {
    if (c.campo === 'remitente') partes.push('from:' + v);
    else if (c.campo === 'dominio') partes.push('from:' + v);
    else if (c.campo === 'lista') partes.push('list:' + v);
    else if (c.campo === 'categoria_gmail') partes.push('category:' + { promociones: 'promotions', social: 'social', notificaciones: 'updates', foros: 'forums', principal: 'primary' }[v]);
    else if (c.campo === 'consulta') partes.push('(' + v + ')');
    else if (c.campo === 'ficha') { const f = fichas.filter(x => x.id === v)[0]; if (f) (f.direcciones || []).concat(f.dominios || []).forEach(d => partes.push('from:' + d)); }
  }));
  if (!partes.length) return null;
  const fuera = [];
  (compilado.excepciones || []).forEach(c => c.valores.forEach(v => { if (c.campo === 'remitente' || c.campo === 'dominio') fuera.push('-from:' + v); }));
  return 'newer_than:' + dias + 'd -in:sent -in:chats {' + partes.slice(0, 120).join(' ') + '}' + (fuera.length ? ' ' + fuera.slice(0, 60).join(' ') : '');
}

// Papelera y Bajas cuentan también lo que ya está en la papelera: si la persona ya borra esos correos a mano, la búsqueda
// normal no los ve y la prueba daba cero.
function probarPolitica_(st, compilado, dias, acciones) {
  const q = consultaGmail_(st, compilado, dias);
  if (!q) return { dias: dias, correos: 0, nota: 'Sin condiciones que pueda probar: Opus decide con su criterio, correo por correo.' };
  const r = conReintento_(() => Gmail.Users.Threads.list('me', { q: q, maxResults: 100 }));
  const hilos = (r.threads || []).map(t => t.id);
  const o = { dias: dias, hilos: hilos.length + (r.nextPageToken ? '+' : ''), ejemplos: hilos.slice(0, 5), consulta: q.slice(0, 300), calculada: fecha_(Date.now()) };
  if ((acciones || []).some(a => a === 'papelera' || a === 'desuscribir')) {
    const rp = conReintento_(() => Gmail.Users.Threads.list('me', { q: q + ' in:trash', maxResults: 100, includeSpamTrash: true }));
    const ep = (rp.threads || []).map(t => t.id).filter(id => hilos.indexOf(id) < 0);
    o.en_papelera = ep.length + (rp.nextPageToken ? '+' : '');
    o.total = (hilos.length + ep.length) + (r.nextPageToken || rp.nextPageToken ? '+' : '');
    o.ejemplos_en_papelera = ep.slice(0, 5);
    o.nota = 'hilos es lo que sigue fuera de la papelera; en_papelera, lo que la persona ya borró en estos ' + dias + ' días.';
  }
  return o;
}

// ---------- pedir_politica, guardar_politica, cambiar_politica, ver_politicas ----------
function pedirPolitica_(st, texto) {
  texto = argTexto_(texto, 'texto (la política en palabras de la persona)').slice(0, 600);
  const l = listaPoliticas_(st);
  const igual = l.filter(p => p.estado === 'borrador' && p.texto === texto)[0];
  // Lo que la persona pide en la web app es su sí: queda guardado en la regla y Opus no lo tiene que pasar.
  const si = VIA === 'webapp' ? { canal: 'webapp', palabras: texto, t: Date.now() } : undefined;
  if (igual) { if (si && !igual.consentimiento_webapp) { igual.consentimiento_webapp = si; st.set('politicas', l); } return { hecho: 'Esa regla ya estaba pedida; Opus la interpreta en su siguiente revisión.', id: igual.id, repetida: true }; }
  if (l.length >= POLITICA.MAX) throw new Error('Hay ' + POLITICA.MAX + ' políticas, el tope. Retira alguna antes.');
  const p = { id: nuevoId_(st, 'p'), nombre: corto_(texto, 60), texto: texto, origen: 'persona', nivel: 'propone', estado: 'borrador',
    compilado: { condiciones: [], excepciones: [] }, criterio: '', acciones: [], cuando: 'cada_corrida', prueba: null, version: 0, versiones: [],
    metricas: metricasVacias_(), creada: Date.now(), actualizada: Date.now(), consentimiento_webapp: si };
  l.push(p);
  st.set('politicas', l);
  const e = anotar_(st, { texto: 'Pediste una regla: «' + corto_(texto, 140) + '». Opus la interpreta y te la propone.', politica: p.id, objeto: 'politica:' + p.id, v: p.version, d: { tipo: 'politica_nueva', id: p.id } });
  return { hecho: e.texto, id_accion: e.id, id: p.id, estado: 'borrador' };
}

// Lo que la persona pide en palabras es su sí. Por el conector solo vale el de la plática con Claude, {canal: 'claude',
// palabras} con al menos CONSENTIMIENTO.MIN caracteres, y no pasa de Te aviso. El de la web app lo guarda el motor cuando
// nace (pedir_politica o una respuesta escrita) y lo usa solo: por el conector se rechaza. Sin un sí que valga, el cambio se
// trata como cualquier subida y pide propuesta. Cada regla que se enciende o sube con él deja un aviso en Hoy.
const CONSENTIMIENTO = { MIN: 8, DIAS_GUARDADO: 7, MAX_AVISOS: 20, MS_VISTO: 30 * 60000,
  CANAL: { claude: 'en Claude', webapp: 'en la web app' } };
function consentimiento_(c) {
  if (c === undefined || c === null || c === '') return null;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = { palabras: c }; } }
  const palabras = String((c && c.palabras) || '').trim(), canal = String((c && c.canal) || '').toLowerCase();
  if (VIA === 'webapp') return palabras ? { canal: 'webapp', palabras: palabras.slice(0, 500), t: Date.now() } : null;
  if (canal === 'webapp') throw new Error('consentimiento con canal webapp solo nace en la web app: el motor guarda lo que la persona escribió ahí y lo usa solo. No lo pases; si la regla sale de lo que escribió al contestar una propuesta, pasa datos.propuesta con su id.');
  if (canal !== 'claude') return { invalido: 'por el conector, consentimiento.canal vale claude (llegó «' + (canal || 'nada') + '»)' };
  if (palabras.length < CONSENTIMIENTO.MIN) return { invalido: 'consentimiento.palabras son las palabras literales de la persona, de ' + CONSENTIMIENTO.MIN + ' caracteres o más' };
  // Lo que escribe una rutina no son palabras de la persona.
  if (enRutina_()) return { invalido: 'en una rutina no hay palabras de la persona', dudoso: true };
  return { canal: 'claude', palabras: palabras.slice(0, 500), t: Date.now() };
}
// La llamada viene de una rutina: trae corrida, o hay una rutina abierta con la forma vieja (sin id).
function enRutina_() {
  if (typeof LLAMADA_CORRIDA_ !== 'undefined' && LLAMADA_CORRIDA_) return true;
  if (VIA !== 'mcp') return false;
  const r = rutinaAbierta_();
  return !!r && !r.con_id;
}
// Las palabras tienen que pedir ese cambio: nombrar la regla con una palabra completa (su nombre, su tema, su carpeta o
// a quién toca), sin negarlo ni preguntarlo, y con un verbo que pida ese cambio. Pausar no es retirar, y una pregunta o una
// queja no piden nada. Si no se puede saber, el cambio va como propuesta. Devuelve el motivo o null.
const PALABRAS_CATALOGO = { publicidad: ['publicidad', 'promocion', 'promo', 'oferta', 'anuncio'], boletines: ['boletin', 'newsletter', 'noticias'],
  notificaciones: ['notificacion', 'aviso de app', 'avisos de app'], bandeja_limpia: ['bandeja', 'limpieza', 'archiva', 'archivar', 'archivalo', 'archivalos', 'lo que ya lei', 'lo leido'],
  carpetas: ['carpeta'], papelera: ['papelera', 'basura', 'borra', 'borrar', 'borralo', 'borralos'], spam: ['spam'],
  bajas: ['baja', 'desuscribir', 'desuscribeme', 'suscripcion', 'boletin'], respuestas: ['borrador', 'respuesta', 'contestar', 'contesta', 'contestame'],
  seguimiento: ['seguimiento', 'recordatorio', 'recuerdame', 'recuerdale', 'me debe', 'me deben', 'respuesta'], compromisos: ['compromiso', 'prometi', 'prometio', 'promesa'],
  proteccion: ['proteccion', 'fraude', 'estafa', 'phishing', 'seguridad'], personas: ['persona', 'contacto', 'gente', 'ficha'],
  juntas: ['junta', 'reunion', 'calendario', 'agenda'], autonomia: ['autonomia', 'sin preguntar', 'sin preguntarme', 'sin avisar', 'sin avisarme', 'decide', 'decidas'],
  whatsapp: ['whatsapp', 'chat'] };
// Las claves de su tema que son verbos piden su acción: «archiva lo que ya leí» enciende Bandeja limpia, «bórralo» no apaga Papelera.
const CLAVES_VERBO = ['archiva', 'archivar', 'archivalo', 'archivalos', 'borra', 'borrar', 'borralo', 'borralos', 'desuscribir', 'desuscribeme', 'contestar', 'contesta', 'contestame',
  'recuerdame', 'recuerdale', 'decide', 'decidas'];
const PALABRAS_VACIAS = ['correo', 'correos', 'regla', 'reglas', 'todos', 'todas', 'todo', 'para', 'sobre', 'desde', 'avisos', 'aviso', 'mail', 'info', 'noreply', 'reply', 'gmail', 'hotmail', 'outlook', 'com', 'mx'];
const RX_NO_CAMBIA = /\b(no|nada|ningun[ao]?|nunca|jamas|tampoco)\b[^.!?]{0,30}\b(cambi|toqu|hag|muev|apag|prend|enciend|activ|baj|sub|quit|mov|pong)\w*|\bdeja(lo|la|los|las)? (asi|como esta)|\bcomo esta\b|\b(luego|despues) (lo |la )?vemos\b|\bno se\b|\bni idea\b|\btodavia no\b|\baun no\b/;
// Pregunta: una frase con «?» y una palabra interrogativa. «¿me apagas la publicidad?» sí pide; «¿quién apagó…?» no.
const RX_PREGUNTA = /(^|[.!;]\s*)[^.!;?]*\b(que|quien|quienes|cual|cuales|cuando|donde|como|cuanto|cuanta|cuantos|cuantas)\b[^.!;?]*\?/;
// Verbos por sentido, en imperativo, infinitivo o subjuntivo (con sus pronombres). Un pasado o una descripción no piden.
// «pásala» y «déjala» van en los dos sentidos: el nivel que nombra decide si sube o baja.
const VERBOS = {
  sube: /^(enciend(e|ela|elo|elas|elos|as|a|an)|encender(la|lo|las|los)?|prend(e|ela|elo|elas|elos|as|an)|prender(la|lo)?|(re)?activ(a|ala|alo|alas|alos|ar|arla|arlo|es|en)|reanud(a|ala|alo|ar|es)|sub(e|ela|elo|elas|elos|ir|irla|irlo|as|an)|pon(la|lo|las|los|er|erla|erlo|gas|ga|gan)?|mand(a|ala|alo|alas|alos|ar|arla|arlo|arlos|es|e|en|ame)|muev(e|ela|elo|elas|elos|as|a|an)|mover(la|lo|las|los)?|archiv(a|ala|alo|alas|alos|ar|es|e|en)|limpi(a|ala|alo|ar|es|e)|aplic(a|ala|alo|ar)|aplique[sn]?|marc(ala|alo|alas|alos|ar)|marque[sn]?|avis(a|ame|ale|anos|ar|arme|es|e|en)|separ(a|ala|alo|alos|ar|es)|agrup(a|ala|alo|alos|ar|es)|guard(a|ala|alo|alas|alos|ar|es|e)|llev(a|ala|alo|alas|alos|ar|es|e)|encarg(ate|arte)|encargues|ocup(ate|arte|es)|haz(la|lo|las|los|me)?|hag(as|a|an)|hacer(la|lo)?|agreg(a|ala|alo|ar|alos)|agregues|anad(e|elo|ela|ir)|inclu(ye|yela|yelo|ir|yas)|sum(a|ala|alo|ar)|recuerd(a|ame|ale|as)|organiz(a|ala|alo|ar)|orden(a|ala|alo|ar)|filtr(a|ala|alo|ar)|pas(a|ala|alo|alas|alos|ar|arla|arlo|es|as|e|en)|dej(ala|alo|alas|alos)|met(e|ela|elo|elas|elos|er|erla|erlo|as|an))$/,
  baja: /^(apag(a|ala|alo|alas|alos|ar|arla|arlo)|apague[sn]?|desactiv(a|ala|alo|ar|arla|es|en)|quit(a|ala|alo|alas|alos|ar|arla|arlo|es|en)|baj(a|ala|alo|ar|arla|es|en)|paus(a|ala|alo|ar|arla|es|en)|deten(la|lo|er|erla)?|deteng(as|a)|par(ala|alo|ar|arla|es)|retir(a|ala|alo|alas|alos|ar|arla|arlo|es|en)|elimin(a|ala|alo|ar|arla|es|en)|borr(a|ala|alo|ar|arla|es|en)|olvid(a|ala|alo|ate|ar)|pas(a|ala|alo|alas|alos|ar|arla|arlo|es|as|e|en)|dej(ala|alo|alas|alos))$/,
  apaga: /^(apag|desactiv|quit|deten|deteng|par[ae]|retir|elimin|borr|olvid)/,
  pausa: /^(paus|deten|deteng|par[ae]|apag|desactiv|quit|retir|elimin|borr)/,
  retira: /^(retir|elimin|borr|quit|olvid)/ };
const FRASES = {
  sube: /\bda(te|me|r|rte|rme|nos)? de baja\b|\ba (la |las |los |el |su |sus |mi |mis |una |esa |esas |esta |otra )?(carpeta|papelera|basura|spam|archivo|importantes?)\b/,
  baja: /\bya no\b|\bdeja de\b|\bmejor (que )?(me )?(lo |la |los |las )?(propon|propong|avis|pregunt)\w*|\bpreguntame\b|\bno (lo |la |los |las )?hagas sol[oa]\b/,
  apaga: /\bya no\b|\bdeja de\b/, pausa: /\bya no\b|\bdeja de\b|\bpor (unos|unas|un) (dias|semanas|tiempo|rato)\b|\bpor ahora\b/,
  retira: /\bya no (la |lo |las |los )?quiero\b|\bno (la |lo |las |los )?quiero\b/ };
const RX_PREVIO_DESCRIPTIVO = /^(esta|estan|estaba|estaban|quedo|queda|quedan|quedaron|sigue|siguen|es|son|era|eran|fue|fueron|se|la|el|una|un|las|los)$/;
// Lo que saca correo de su lugar tiene que estar en sus palabras: «revisa lo del banco» no lo manda a la papelera. leido lo
// decide Opus con lo que ella abre.
const ACCION_PALABRAS = { papelera: /\b(papelera|basura|borr\w*|elimin\w*|tira\w*)\b/, archivar: /\barchiv\w*/, spam: /\bspam\b/ };
const palabrasDe_ = s => sinAcentos_(String(s || '')).toLowerCase().split(/[^a-z0-9ñ]+/).filter(Boolean);
const mismaPalabra_ = (w, k) => w === k || w === k + 's' || w === k + 'es' || k === w + 's' || k === w + 'es';
function nombraClave_(ws, k) {
  const kw = k.split(' ');
  for (let i = 0; i + kw.length <= ws.length; i++) if (kw.every((x, j) => (j === kw.length - 1 ? mismaPalabra_(ws[i + j], x) : ws[i + j] === x))) return true;
  return false;
}
function clavesDeRegla_(p) {
  const k = (PALABRAS_CATALOGO[p.id] || []).slice();
  const de = s => palabrasDe_(s).filter(w => w.length >= 4 && PALABRAS_VACIAS.indexOf(w) < 0);
  de(p.nombre).forEach(w => k.push(w));
  (p.acciones || []).filter(a => /^carpeta:/.test(a)).forEach(a => de(a.slice(8).replace(/^\//, '')).forEach(w => k.push(w)));
  ((p.compilado && p.compilado.condiciones) || []).forEach(c => (c.valores || []).forEach(v => de(v).forEach(w => k.push(w))));
  return k;
}
// La forma de las palabras, con una lista cerrada de señales: si la frase que nombra la regla trae en cualquier lugar una
// negación («no», «ni», «nunca», «jamás», «tampoco»), una condición («si» seguido de una palabra, «cuando», «en caso de»,
// «siempre que», «a menos que», «hasta que»), un «¿» o un «?», o dos puntos o comillas antes del verbo, las palabras no
// aplican y queda propuesta. «Ya no me muestres», «no quiero ver» y parecidas son verbos de apartar, no negaciones. Al crear
// una regla, la condición describe la regla y no cuenta. Lo que la lista no alcanza lo interpreta Opus, con el tope de Te
// aviso, el aviso en Hoy y Deshacer.
const RX_APARTAR = /\b(ya )?no (me |nos )?(muestres|ensenes|mandes|aparezca|aparezcan|salga|salgan|llegue|lleguen)\b|\bno (lo |la |los |las )?(quiero|queremos) (ver|recibir|leer)\b|\bya no (lo |la |los |las )?(quiero|queremos|necesito)\b/;
const RX_APARTAR_G = new RegExp(RX_APARTAR.source, 'g');
// «Ya no marques lo del colegio» pide dejar de hacer lo que hace la regla: es de la misma familia. «Ya no la apagues» sí es
// una negación, porque niega el cambio.
const RX_DEJAR = /\bya no (me |nos |lo |la |los |las |le |les )?(marques|archives|muevas|mandes|metas|pases|toques|borres|tires|limpies|etiquetes|separes|avises|juntes)\b/;
const RX_DEJAR_G = new RegExp(RX_DEJAR.source, 'g');
const RX_NEGACION = /\b(no|ni|nunca|jamas|tampoco)\b/;
// Frases: se cortan en punto, punto y coma, signo de admiración y salto de línea; no en el punto de un dominio. El «¿» y el
// «?» se quedan en su frase: la vuelven pregunta.
function frasesDe_(orig) {
  return String(orig).split(/[.!]+(?=\s|$)|[;¡!\n]+/).map(x => x.trim()).filter(Boolean).map(f => {
    const otok = f.replace(/([,:«»“”"'‘’])/g, ' $1 ').split(/[^a-záéíóúüñ0-9,:«»“”"'‘’]+/).filter(Boolean);
    return { otok: otok, tok: otok.map(x => /^[,:«»“”"'‘’]$/.test(x) ? x : sinAcentos_(x)), t: sinAcentos_(f), pregunta: /[¿?]/.test(f) };
  });
}
// sentido: sube, baja, apaga, pausa, retira, o null (crear o compilar: pide que lo haga). acciones: las que agrega el cambio.
// p es la regla como estaba antes de la llamada: sus palabras nombran el nombre que tenía, no el que trae la llamada.
function noPideCambio_(con, p, sentido, acciones) {
  // Las palabras de Claude y el sí guardado de la web app (Pedir, o lo que escribió al contestar) se revisan igual: autorizan
  // solo el cambio que piden. En la web app, en vivo, la persona actúa ella misma.
  if (!con || VIA === 'webapp' || (con.canal !== 'claude' && !con.de)) return null;
  const orig = String(con.palabras || '').toLowerCase(), t = sinAcentos_(orig), claves = clavesDeRegla_(p);
  const dice = 'sus palabras («' + corto_(con.palabras, 80) + '»)';
  // Lo que saca correo de su lugar tiene que estar en sus palabras.
  const faltan = () => { const falta = (acciones || []).filter(a => /^carpeta:/.test(a) ? !palabrasDe_(a.slice(8)).some(w => palabrasDe_(orig).some(x => mismaPalabra_(x, w))) && !/\bcarpeta/.test(t) : ACCION_PALABRAS[a] && !ACCION_PALABRAS[a].test(t));
    return falta.length ? dice + ' no piden ' + falta.map(a => /^carpeta:/.test(a) ? 'mandarlo a ' + a.slice(8) : a === 'leido' ? 'marcarlo leído' : a).join(' ni ') : null; };
  // Su pedido guardado de la web app crea o compila la regla que pidió (sin cambio de nivel ni de estado): basta con que las
  // acciones estén en sus palabras. Para cualquier otro cambio, sus palabras se revisan como las de Claude.
  if (!sentido && con.canal !== 'claude') return faltan();
  if (RX_NO_CAMBIA.test(t.replace(RX_APARTAR_G, ' ').replace(RX_DEJAR_G, ' '))) return dice + ' no piden un cambio';
  if (RX_PREGUNTA.test(t)) return dice + ' son una pregunta, no piden un cambio';
  const fr = frasesDe_(orig);
  if (!fr.some(f => claves.some(k => nombraClave_(f.tok, k)))) return dice + ' no nombran «' + p.nombre + '»';
  const nombre = palabrasDe_(p.nombre), propias = PALABRAS_CATALOGO[p.id] || [];
  // «a Lecturas»: mandarlo a una carpeta de la regla también lo pide.
  const carpetas = [].concat.apply([], (p.acciones || []).concat(acciones || []).filter(x => /^carpeta:/.test(x)).map(x => palabrasDe_(x.slice(8))));
  // Las señales de la lista cerrada, en cualquier lugar de la frase.
  const condicion = f => f.tok.some((w, i) => (w === 'si' && f.otok[i] === 'si' && i + 1 < f.tok.length && !/^[,:]$/.test(f.tok[i + 1])) || w === 'cuando' ||
    (w === 'caso' && f.tok[i - 1] === 'en' && f.tok[i + 1] === 'de') || (w === 'que' && ['siempre', 'menos', 'hasta'].indexOf(f.tok[i - 1]) >= 0));
  const senal = f => f.pregunta ? 'son una pregunta' : RX_NEGACION.test(f.tok.join(' ').replace(RX_APARTAR_G, ' ').replace(RX_DEJAR_G, ' ')) ? 'traen una negación'
    : sentido && condicion(f) ? 'traen una condición' : null;
  // Lo que va después de dos puntos o de unas comillas (dobles, angulares o simples) cita a otro: el verbo tiene que ir antes.
  const libre = f => { const k = f.tok.findIndex(x => /^[:«»“”"'‘’]$/.test(x)); return f.tok.map((x, i) => k < 0 || i < k); };
  const verbo = (rx, f, ok, enNombre, i) => { const w = f.tok[i];
    return ok[i] && !enNombre[i] && !(i > 0 && RX_PREVIO_DESCRIPTIVO.test(f.tok[i - 1])) && !/[éíó]$/.test(f.otok[i] || '') &&
      !/(aste|iste|aron|ieron|ado|ada|ados|adas|ido|ida|idos|idas|aba|aban)$/.test(w) && rx.test(w); };
  const pideEn = (f, s) => {
    if (!claves.some(k => nombraClave_(f.tok, k)) || senal(f)) return false;
    const ok = libre(f), n = f.tok.length, enNombre = new Array(n).fill(false);
    for (let i = 0; i + nombre.length <= n; i++) if (nombre.length && nombre.every((x, j) => mismaPalabra_(f.tok[i + j], x))) for (let j = 0; j < nombre.length; j++) enNombre[i + j] = true;
    const tl = f.tok.filter((x, i) => ok[i]).join(' ');
    if (f.tok.some((w, i) => s === 'sube' ? verbo(VERBOS.sube, f, ok, enNombre, i) || (ok[i] && propias.indexOf(w) >= 0 && CLAVES_VERBO.indexOf(w) >= 0)
      : propias.indexOf(w) < 0 && verbo(VERBOS[s], f, ok, enNombre, i))) return true;
    if (s === 'sube') return RX_APARTAR.test(tl) || FRASES.sube.test(tl) || f.tok.some((w, i) => ok[i] && w === 'a' && carpetas.some(cw => mismaPalabra_(f.tok[i + 1] || '', cw) || (RX_PREVIO_DESCRIPTIVO.test(f.tok[i + 1] || '') && mismaPalabra_(f.tok[i + 2] || '', cw))));
    return FRASES[s].test(tl.replace(RX_APARTAR_G, ' '));
  };
  const pide = s => fr.some(f => pideEn(f, s));
  const s = sentido || 'sube';
  if (!pide(s)) { const sn = fr.filter(f => claves.some(k => nombraClave_(f.tok, k))).map(senal).filter(Boolean)[0];
    return dice + (sn ? ' ' + sn + ': no aplican y queda propuesta' : ' no piden ' + ({ sube: 'ese cambio', baja: 'bajarla', apaga: 'apagarla', pausa: 'pausarla', retira: 'retirarla' }[s])); }
  if (s === 'sube' && sentido && pide('baja') && !fr.some(f => { const ok = libre(f); return f.tok.some((w, i) => verbo(VERBOS.sube, f, ok, new Array(f.tok.length).fill(false), i)); })) return dice + ' piden bajarla, no subirla';
  return faltan();
}
// El sí que la persona escribió en la web app: en la regla que pidió ahí, en la propuesta que pasa Opus (idPropuesta) o en
// la última propuesta de esa regla que contestó por escrito. Vale CONSENTIMIENTO.DIAS_GUARDADO días y una sola vez.
function consentimientoGuardado_(st, p, idPropuesta) {
  const vigente = c => !!c && !c.usado && Date.now() - c.t < CONSENTIMIENTO.DIAS_GUARDADO * 86400000;
  if (p && vigente(p.consentimiento_webapp)) return { canal: 'webapp', palabras: p.consentimiento_webapp.palabras, t: p.consentimiento_webapp.t, de: { politica: p.id } };
  // Lo que escribió al contestar una propuesta autoriza solo el efecto de la opción que eligió, y responder ya lo aplicó:
  // una opción sin efecto, corregida o de otra pregunta no crea, no enciende y no sube nada.
  if (idPropuesta !== undefined && idPropuesta !== null && idPropuesta !== '') {
    const q = listaPropuestas_(st).filter(x => x.id === String(idPropuesta))[0];
    if (!q) throw new Error('No hay una propuesta ' + idPropuesta + '. Usa ver_propuestas.');
    return { invalido: 'lo que escribió al contestar la propuesta ' + q.id + ' autoriza solo el efecto de la opción que eligió, y responder ya lo aplicó' };
  }
  return null;
}
function usarConsentimiento_(st, con) {
  if (!con || !con.de) return;
  if (con.de.politica) { const l = st.get('politicas', []), p = l.filter(x => x.id === con.de.politica)[0]; if (p && p.consentimiento_webapp) { p.consentimiento_webapp.usado = Date.now(); st.set('politicas', l); } }
  if (con.de.propuesta) { const l = listaPropuestas_(st), q = l.filter(x => x.id === con.de.propuesta)[0]; if (q && q.consentimiento_webapp) { q.consentimiento_webapp.usado = Date.now(); st.set('propuestas', l); } }
}
// El aviso arriba en Hoy: qué cambió, con qué palabras, Bien y Deshacer (el id de Actividad del cambio).
function avisarConsentimiento_(st, p, con, e, que) {
  const l = st.get('avisos_consentimiento', []);
  l.unshift({ id: 'consentimiento|' + e.id, t: Date.now(), politica: p.id, nombre: p.nombre, que: que, palabras: corto_(con.palabras, 200), canal: con.canal, id_accion: e.id });
  st.set('avisos_consentimiento', l.slice(0, CONSENTIMIENTO.MAX_AVISOS));
}
function avisosConsentimiento_(st) {
  const ahora = Date.now();
  const l = st.get('avisos_consentimiento', []).filter(a => !a.cerrado && !(a.visto && ahora - a.visto > CONSENTIMIENTO.MS_VISTO));
  return l.length ? l.map(a => ({ id: a.id, politica: a.politica, texto: '«' + a.nombre + '»: ' + a.que + ', porque lo pediste ' + (CONSENTIMIENTO.CANAL[a.canal] || '') + ': «' + a.palabras + '».',
    palabras: a.palabras, canal: a.canal, hora: fecha_(a.t), id_accion: a.id_accion, opciones: ['Bien', 'Deshacer'] })) : undefined;
}
function cerrarAvisoConsentimiento_(st, idAccion, como) {
  const l = st.get('avisos_consentimiento', []), a = l.filter(x => x.id_accion === idAccion && !x.cerrado);
  a.forEach(x => { x.cerrado = como; x.t_cierre = Date.now(); });
  if (a.length) st.set('avisos_consentimiento', l);
  return a.length;
}
function verAvisosConsentimiento_(st, ids) {
  const l = st.get('avisos_consentimiento', []), ahora = Date.now();
  let n = 0;
  l.forEach(x => { if (ids.indexOf(x.id) >= 0 && !x.visto) { x.visto = ahora; n++; } });
  if (n) st.set('avisos_consentimiento', l);
}
// [Bien] del aviso: responder({id: 'consentimiento|<id_accion>', opcion: 'Bien'}).
function bienConsentimiento_(st, id) {
  const idAccion = String(id).replace(/^consentimiento\|/, '');
  const a = st.get('avisos_consentimiento', []).filter(x => x.id_accion === idAccion)[0];
  if (!a) throw new Error('No hay un aviso ' + id + '. Usa ver_hoy (avisos_consentimiento).');
  if (a.cerrado) return { hecho: 'Ese aviso ya estaba cerrado (' + a.cerrado + ').', id: id, repetida: true };
  cerrarAvisoConsentimiento_(st, idAccion, 'bien');
  anotarSenal_(st, { tipo: 'respondio_propuesta', politica: a.politica, detalle: id + ': Bien' });
  return { hecho: 'Listo: «' + a.nombre + '» se queda como está.', id: id };
}
// Una regla que pidió la persona (origen persona, o del catálogo encendida con sus palabras) o que protege su correo
// (importante, nunca_limpiar, aviso_en_hoy, Protección) no se baja, apaga, pausa ni retira por el conector sin su sí.
const ACCIONES_PROTEGEN = ['importante', 'nunca_limpiar', 'aviso_en_hoy'];
function protegeCorreo_(p) { return p.id === 'proteccion' || (p.acciones || []).some(a => ACCIONES_PROTEGEN.indexOf(a) >= 0); }
// Lo que ella aprobó de una regla: texto, nombre, acciones, criterio y cuándo corre. Cambiarlo pide su sí en cualquier
// estado (prendida, apagada, en pausa o retirada), de cualquier dueño (ella, Opus, catálogo o protección), en la plática y en
// la rutina. Una regla en borrador o en propuesta no está aprobada; corregir la compilación no cuenta, y tampoco poner las
// primeras acciones de una regla que no traía ninguna (las del catálogo nacen así), salvo papelera, spam o una baja. nuevo trae
// los campos ya normalizados; devuelve los que cambian.
function cambiaLoAprobado_(p, nuevo) {
  if (!p || ['borrador', 'propuesta'].indexOf(p.estado) >= 0) return [];
  const vale = { texto: p.texto || '', nombre: p.nombre || '', acciones: p.acciones || [], criterio: p.criterio || '', cuando: p.cuando || 'cada_corrida' };
  const primeras = k => k === 'acciones' && !vale.acciones.length && Array.isArray(nuevo.acciones) && !nuevo.acciones.some(x => ['papelera', 'spam', 'desuscribir'].indexOf(x) >= 0);
  return Object.keys(vale).filter(k => nuevo[k] !== undefined && JSON.stringify(nuevo[k] === null ? '' : nuevo[k]) !== JSON.stringify(vale[k]) && !primeras(k));
}
// Una acción con politica corre solo si el hilo cumple esa regla, evaluada por el motor sobre el último correo recibido:
// alguna de sus condiciones y ninguna de sus excepciones. Una regla sin condiciones la decide Opus con su criterio o su texto
// (la Papelera del catálogo: lo que Opus juzga basura). Va además el orden de choque (sección 2.2): una ficha de
// importancia alta no se mueve ni se marca leída, y un tema sensible por juicio o por palabra clave, si cumple la regla,
// queda en propuesta (marca.sensible) como con un juicio sensible. Lo que nunca se limpia va primero: con marca, actuar_
// lo deja en Recibidos con su motivo (sin_cambio); sin marca (enterarse por una regla) es la razón. El spam de Protección
// es su juicio de fraude y no lleva piso, como en actuar_. Marcar importante no limpia. Devuelve null si aplica, o por qué no.
function reglaAplicaAlHilo_(st, p, hilo, accion, marca) {
  const t = conReintento_(() => Gmail.Users.Threads.get('me', hilo, { format: 'metadata', metadataHeaders: ENCABEZADOS }));
  const md = sinBorradores_((t && t.messages) || []).map(metadatoDe_), rec = md.filter(m => !tiene_(m, 'SENT'));
  const m = rec[rec.length - 1];
  if (!m) return 'el hilo no tiene correo recibido';
  const ctx = contextoPoliticas_(st, {});
  ctx.politicas = [p];
  const f = hechosDe_(m, ctx);
  if (accion !== 'importante' && f.importancia === 'alta') return 'es de una ficha de importancia alta';
  if (accion !== 'importante' && !(accion === 'spam' && p.id === 'proteccion') && protegidoDeLimpiar_(md, Date.now(), st)) {
    if (marca) { marca.piso = true; return null; }
    return 'es de lo que nunca se limpia';
  }
  const sensible = () => { if (accion === 'importante' || !f.sensible) return null; if (marca) { marca.sensible = f.sensible; return null; } return 'es un tema sensible'; };
  const conds = (p.compilado && p.compilado.condiciones) || [];
  if (!conds.length) return sensible();
  consultasPara_(ctx, [m.id], 30);
  if (!conds.some(c => cumple_(c, m, f, ctx, p))) return 'ese correo no cumple sus condiciones';
  if (((p.compilado && p.compilado.excepciones) || []).some(c => cumple_(c, m, f, ctx, p))) return 'ese correo cae en una de sus excepciones';
  return sensible();
}
function suyaOProtege_(p) { return p.origen === 'persona' || !!p.consentimiento || protegeCorreo_(p); }
// El cambio que pidió con palabras que no alcanzan: queda como propuesta con su efecto exacto, para su sí.
function proponerCambio_(st, p, nivel, estado, motivo) {
  const efecto = estado === undefined ? { nivel: { politica: p.id, nivel: nivel } } : { politica: { id: p.id, nivel: nivel, estado: estado } };
  const que = nivel !== undefined && (estado === undefined || estado === p.estado) ? 'la paso a ' + COS.NIVEL_TEXTO[nivel] : ({ activa: 'la enciendo', pausada: 'la pauso', retirada: 'la retiro' }[estado] + (nivel !== undefined ? ' en ' + COS.NIVEL_TEXTO[nivel] : ''));
  if (nivel !== undefined && rangoNivel_(nivel) > rangoNivel_(p.nivel)) { p.nivel_propuesto = { nivel: nivel, t: Date.now(), por: actor_(), consentimiento: true }; st.set('politicas', listaPoliticas_(st)); }
  const r = proponer_(st, { tipo: nivel !== undefined ? 'nivel' : 'politica', objeto: p.id, texto: p.nombre + ': ¿' + que + '?', opciones: [{ etiqueta: 'Sí', efecto: efecto }, { etiqueta: 'No', efecto: null }] });
  return { hecho: 'No cambié «' + p.nombre + '»: ' + motivo + '. Quedó como propuesta para su sí («¿' + que + '?»).', propuesto: true, propuesta: r.id, repetida: r.repetida || undefined,
    consentimiento_no_vale: motivo, politica: filaPolitica_(p) };
}
// Extender un rescate suyo al dominio o al tema, en una regla que mueve correo, solo agrega excepciones: saca
// ese correo de lo que la regla mueve. Opus lo hace sin preguntar con el id del rescate (su línea en Actividad) como
// evidencia y lo reporta en el repaso. Sin un rescate de esta regla detrás, la excepción pide su sí.
function rescateDe_(st, p, ids) {
  const vivos = ((p.fijo && p.fijo.excepciones) || []).filter(x => x.campo === 'remitente').map(x => String(x.valor).toLowerCase());
  const act = ids.length ? st.get('actividad', []) : [];
  for (let k = 0; k < ids.length; k++) {
    const id = String(ids[k] || '').trim();
    if (!id) continue;
    let r = (p.rescates_ids || {})[id];
    if (!r) { const e = act.filter(x => x.id === id && x.politica === p.id)[0]; const m = e && /^Rescataste un correo de (\S+): /.exec(e.texto); r = m ? m[1] : null; }
    if (r && vivos.indexOf(String(r).toLowerCase()) >= 0) return String(r).toLowerCase();
  }
  return null;
}
function extiendeRescate_(st, p, antes, despues, d) {
  // También en una que protege y mueve correo (una carpeta de Clientes que además marca importante): la excepción saca de lo
  // que mueve el correo que ella rescató. Una que solo protege (importante, nunca_limpiar) nunca se extiende.
  const mueve = (p.acciones || []).some(a => /^carpeta:/.test(a) || ['archivar', 'papelera', 'spam', 'leido'].indexOf(a) >= 0);
  if (!mueve) return false;
  const a = antes || {}, n = despues || {};
  if ((a.condiciones || []).some(x => (x.valores || []).some(v => !tieneValor_(n.condiciones, x.campo, v)))) return false;
  const nuevas = [].concat.apply([], (n.excepciones || []).map(x => (x.valores || []).filter(v => !tieneValor_(a.excepciones, x.campo, v)).map(v => ({ campo: x.campo, valor: String(v).toLowerCase() }))));
  if (!nuevas.length) return false;
  const rescate = rescateDe_(st, p, [d && d.rescate].concat(String((d && d.evidencia) || '').match(/\ba[0-9a-z]{1,10}\b/g) || []));
  if (!rescate) return false;
  const dm = rescate.split('@')[1] || '';
  // La excepción que nace de un rescate lleva solo el remitente o el dominio de ese correo. Como consulta, va con su from:
  // (un tema dentro de ese dominio, «from:alfa.test subject:factura», también); un tema suelto o de otro dominio, no.
  // El dominio vale entero o como su dominio registrable (banco.com.mx), nunca un sufijo público (com.mx, gob.mx).
  const org = dominioOrg_(dm), suyo = v => v === rescate || v === dm || (dm.slice(-v.length - 1) === '.' + v && (v === org || v.slice(-org.length - 1) === '.' + org));
  const consultaSuya = v => { const f = v.match(/\bfrom:\s*\(?\s*[^\s()]+/g) || [];
    return f.length > 0 && f.every(x => suyo(x.replace(/^from:\s*\(?\s*/, ''))) && !/\bor\b|[{}]|\b(to|cc|bcc|list|deliveredto):|-from:/.test(v); };
  return nuevas.every(x => x.campo === 'dominio' ? suyo(x.valor) : x.campo === 'remitente' ? x.valor === rescate : x.campo === 'consulta' && consultaSuya(x.valor));
}
// Quitar un valor de una condición o agregar uno a una excepción angosta la regla.
function angosta_(antes, despues) {
  const vals = (l, campo) => [].concat.apply([], (l || []).filter(x => x.campo === campo).map(x => (x.valores || []).map(v => String(v).toLowerCase())));
  const campos = l => (l || []).map(x => x.campo);
  const a = antes || {}, d = despues || {};
  return campos(a.condiciones).some(cp => vals(a.condiciones, cp).some(v => vals(d.condiciones, cp).indexOf(v) < 0)) ||
    campos(d.excepciones).some(cp => vals(d.excepciones, cp).some(v => vals(a.excepciones, cp).indexOf(v) < 0));
}
// Una propuesta autoriza solo el cambio exacto del efecto de la opción que eligió la persona, y una sola vez. La que se
// contestó sin efecto (o con otra opción) no autoriza nada.
function propuestaAutoriza_(pr, id, nivel, estado) {
  if (!pr || ['aceptada', 'corregida'].indexOf(pr.estado) < 0 || pr.usada || !pr.respuesta) return false;
  const o = (pr.opciones || []).filter(x => x.etiqueta === pr.respuesta.opcion)[0];
  return [].concat((o && o.efecto) || []).some(ef => ef && (
    (ef.nivel && ef.nivel.politica === id && nivel !== undefined && ef.nivel.nivel === nivel && (estado === undefined || estado === 'activa')) ||
    (ef.politica && ef.politica.id === id && (nivel !== undefined || estado !== undefined) && (nivel === undefined || ef.politica.nivel === nivel) &&
      (estado === undefined || (ef.politica.estado || 'activa') === estado))));
}
const ESTADO_TEXTO = { activa: 'encendida', pausada: 'en pausa', retirada: 'retirada', propuesta: 'esperando tu sí', borrador: 'en borrador' };
function daBajas_(p, acciones) { return p && p.id === 'bajas' || (acciones || (p && p.acciones) || []).indexOf('desuscribir') >= 0; }

function guardarPolitica_(st, d) {
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  if (!d || typeof d !== 'object') throw new Error('datos es {id?, nombre, texto, compilado, criterio, acciones, cuando, nivel, prueba}.');
  let con = consentimiento_(d.consentimiento);
  let noVale = con && con.invalido ? con.invalido : undefined;
  let dudoso = !!(con && con.dudoso);
  if (noVale) con = null;
  const l = listaPoliticas_(st);
  let p = d.id ? l.filter(x => x.id === d.id)[0] : null;
  if (d.id && !p) throw new Error('No hay una política ' + d.id + '. Para una nueva, no pases id.');
  if (!con && VIA !== 'webapp') con = consentimientoGuardado_(st, p, d.propuesta);
  if (con && con.invalido) { noVale = con.invalido; con = null; }
  const nueva = !p;
  const comp = d.compilado !== undefined ? normalizarCompilado_(st, d.compilado) : (p ? p.compilado : { condiciones: [], excepciones: [] });
  const acciones = d.acciones !== undefined ? normalizarAcciones_(d.acciones) : (p ? p.acciones : []);
  const texto = d.texto !== undefined ? argTexto_(d.texto, 'texto').slice(0, 600) : (p ? p.texto : null);
  if (!texto) throw new Error('Falta texto: la política en palabras, como la aprobaría la persona.');
  const nombre = d.nombre !== undefined ? argTexto_(d.nombre, 'nombre').slice(0, 60) : (p ? p.nombre : corto_(texto, 60));
  const criterio = d.criterio !== undefined ? String(d.criterio || '').trim().slice(0, 3000) : (p ? p.criterio : '');
  // Sus palabras tienen que pedir esta regla; si no se puede saber, espera su sí como cualquier otra.
  const sentidoG = p && d.nivel !== undefined && POLITICA.NIVELES.indexOf(String(d.nivel).toLowerCase()) >= 0 ? (rangoNivel_(String(d.nivel).toLowerCase()) < rangoNivel_(p.nivel) ? (String(d.nivel).toLowerCase() === 'apagado' ? 'apaga' : 'baja') : 'sube') : null;
  // En una regla que ya existe, las acciones nuevas que mueven correo tienen que estar en sus palabras.
  const nuevasAcc = p && d.acciones !== undefined ? acciones.filter(x => (p.acciones || []).indexOf(x) < 0) : [];
  // En una regla que ya existe, sus palabras nombran la regla como estaba antes de esta llamada, no el nombre nuevo que trae.
  const noPideG = noPideCambio_(con, p || { id: null, nombre: nombre, acciones: acciones, compilado: comp }, sentidoG, nuevasAcc);
  let pideOtro = !!noPideG;
  if (noPideG) { noVale = noPideG; con = null; dudoso = true; }
  const cuando = d.cuando !== undefined ? normalizarCuando_(d.cuando) : (p ? p.cuando : 'cada_corrida');
  // Su sí guardado (Pedir) autoriza lo que pidió: crear la regla y compilarla. Cuándo corre no está en sus palabras.
  if (con && con.canal !== 'claude' && p && d.cuando !== undefined && cuando !== (p.cuando || 'cada_corrida')) { noVale = 'su sí guardado no dice cuándo corre'; con = null; dudoso = true; pideOtro = true; }
  // Una rutina no deja como propuesta lo que su sí no pide: no cambia nada.
  if (pideOtro && typeof enRutina_ === 'function' && enRutina_()) throw new Error('Una rutina no cambia «' + (p ? p.nombre : nombre) + '» con un sí que no lo pide (' + noVale + '). No cambié nada; si hace falta, déjalo como propuesta para la persona con proponer.');
  const nivel = d.nivel !== undefined ? String(d.nivel).toLowerCase() : (p && p.estado === 'activa' ? p.nivel : con ? 'avisa' : (p ? p.nivel : 'propone'));
  if (POLITICA.NIVELES.indexOf(nivel) < 0) throw new Error('nivel vale apagado, propone, avisa o solo.');
  if (!acciones.length && !criterio) throw new Error('Una política necesita acciones del motor, un criterio para Opus, o las dos.');
  if (comp.condiciones.length && !accionesMotor_({ acciones: acciones }).length) throw new Error('Hay condiciones pero ninguna acción del motor (carpeta:<nombre>, ' + POLITICA.ACCIONES_MOTOR.join(', ') + ').');
  if (acciones.indexOf('desuscribir') >= 0 && acciones.some(a => a !== 'desuscribir')) throw new Error('desuscribir va sola en su política (la de Bajas).');
  // La de Bajas del catálogo cambia con su orden como cualquier otra; una baja compilada por remitente sigue con propuesta.
  if (con && daBajas_(p, acciones) && !(p && p.id === 'bajas')) throw new Error('Una baja va siempre con propuesta: deja la propuesta con proponer aunque la persona la haya pedido.');
  if (p) revisarFijo_(p, comp);
  // Sin el sí de la persona, guardar nunca sube el nivel de una política que ya existe (las del catálogo nacen activas
  // y apagadas): el nivel pedido queda propuesto y el vigente sigue. Bajarlo o apagarla nunca pide sí.
  const sube = !!p && !con && (p.estado === 'activa' || p.estado === 'pausada') && rangoNivel_(nivel) > rangoNivel_(p.nivel);
  // Con el sí de la plática con Claude la regla llega a Te aviso: Lo hago solo pide su propio toque en la página. Editar con
  // palabras una que ya estaba en Lo hago solo también la deja en Te aviso, con Lo hago solo pendiente.
  const tope = !!con && VIA !== 'webapp' && nivel === 'solo';
  const nivelPedido = nivel;
  const nivelFinal = sube ? p.nivel : tope ? 'avisa' : nivel;
  const viva = p && p.estado === 'activa' && p.nivel !== 'apagado';
  const cambiaTexto = p && (texto !== p.texto || nombre !== p.nombre || JSON.stringify(acciones) !== JSON.stringify(p.acciones));
  // Lo que ella aprobó (texto, nombre, acciones, criterio, cuándo) pide su sí, de cualquier dueño y en cualquier estado.
  const aprobado = cambiaLoAprobado_(p, { texto: texto, nombre: nombre, acciones: acciones, criterio: criterio || '', cuando: cuando });
  const cambiaCriterio = aprobado.indexOf('criterio') >= 0;
  const cambiaNivel = p && nivelFinal !== p.nivel;
  const cambiaComp = !p || JSON.stringify(comp) !== JSON.stringify(p.compilado);
  // Una regla que pidió la persona o que protege su correo no se baja ni se angosta sin su sí, viva, en pausa o apagada:
  // quitar un valor de sus condiciones o agregar una excepción también es bajarla. La guarda va por dueño, no por estado:
  // vale también retirada.
  const guardada = p && (viva || (['borrador', 'propuesta'].indexOf(p.estado) < 0 && suyaOProtege_(p)));
  const extiende = guardada && extiendeRescate_(st, p, p.compilado, comp, d);
  if (guardada && !con && VIA !== 'webapp' && suyaOProtege_(p) && (rangoNivel_(nivelFinal) < rangoNivel_(p.nivel) || (angosta_(p.compilado, comp) && !extiende)))
    throw new Error('«' + p.nombre + '» la pidió la persona o protege su correo: bajarla, apagarla, quitarle valores o agregarle excepciones necesita su sí. Deja una propuesta con proponer (efecto {politica: {id, ...}} o {nivel: {politica, nivel}}).');
  // Lo que la persona ya aprobó en palabras no cambia sin su sí.
  if (aprobado.length && !con && VIA !== 'webapp') throw new Error('«' + p.nombre + '» ya la aprobó la persona: cambiar ' + aprobado.map(k => ({ texto: 'su texto', nombre: 'su nombre', acciones: 'sus acciones', criterio: 'su criterio', cuando: 'cuándo corre' }[k])).join(', ') + ' necesita su sí. Deja una propuesta con proponer (efecto {politica: {id, ...}}).');
  // La primera compilación de una política aprobada sin condiciones (una carpeta que creó la persona) la pone Opus:
  // en Me propone nada se mueve sin su sí.
  const primera = viva && !(p.compilado.condiciones || []).length;
  if (viva && cambiaComp && p.nivel === 'propone' && !primera && !con && !extiende) throw new Error('La política ' + p.id + ' está en ' + COS.NIVEL_TEXTO.propone + ': para agregar remitentes a su compilación, propónlo con proponer (efecto {politica: {id, compilado}}).');
  const ahora = Date.now();
  let prueba = null;
  if (comp.condiciones.length && cambiaComp) { try { prueba = probarPolitica_(st, comp, POLITICA.DIAS_PRUEBA, acciones); } catch (e) { prueba = { error: 'No se pudo probar ahora: ' + String(e.message || e).slice(0, 120) }; } }
  const antes = p ? JSON.parse(JSON.stringify(p)) : null;
  if (nueva) {
    if (l.length >= POLITICA.MAX) throw new Error('Hay ' + POLITICA.MAX + ' políticas, el tope. Propón retirar alguna.');
    p = { id: nuevoId_(st, 'p'), origen: VIA === 'webapp' || con ? 'persona' : 'opus', estado: 'propuesta', version: 0, versiones: [], metricas: metricasVacias_(), creada: ahora };
    l.push(p);
  }
  Object.assign(p, { nombre: nombre, texto: texto, compilado: comp, criterio: criterio, acciones: acciones, cuando: cuando, nivel: nivelFinal, actualizada: ahora });
  if (sube || tope) p.nivel_propuesto = { nivel: nivelPedido, t: ahora, por: actor_(), consentimiento: tope || undefined };
  else if (p.nivel_propuesto && (con || rangoNivel_(p.nivel) >= rangoNivel_(p.nivel_propuesto.nivel) || nivelPedido === p.nivel)) delete p.nivel_propuesto;
  if (p.estado === 'borrador') p.estado = 'propuesta';
  // Con su orden, la política queda activa al nivel que ella implicó y se lo dice en una línea con Deshacer.
  if (con && p.estado !== 'activa') { p.estado = 'activa'; p.aprobada = ahora; }
  if (con) p.consentimiento = con;
  const pp = d.prueba && typeof d.prueba === 'object' ? { dias: argEntero_(d.prueba.dias, POLITICA.DIAS_PRUEBA, 1, 90), casos: corto_(d.prueba.casos, 500), ejemplos: (d.prueba.ejemplos || []).slice(0, 10).map(String) } : (p.prueba || {});
  p.prueba = Object.assign({}, pp, prueba ? { resultado: prueba } : (p.prueba && p.prueba.resultado ? { resultado: p.prueba.resultado } : {}));
  if (cambiaComp || nueva || cambiaTexto || cambiaNivel) {
    p.version = (p.version || 0) + 1;
    p.versiones = (p.versiones || []).concat([{ version: p.version, t: ahora, por: actor_(), compilado: comp, evidencia: corto_(d.evidencia || (d.prueba && d.prueba.casos) || '', 300) }]).slice(-POLITICA.MAX_VERSIONES);
  }
  st.set('politicas', l);
  const aviso = viva && cambiaComp && p.nivel === 'avisa';
  const texto2 = con ? 'Listo: «' + nombre + '» queda en ' + COS.NIVEL_TEXTO[p.nivel] + ', como lo pediste («' + corto_(con.palabras, 120) + '»).' + (tope ? ' ' + COS.NIVEL_TEXTO.solo + ' espera tu sí.' : '') : (nueva ? 'La regla «' + nombre + '» espera tu sí.' : viva ? 'Actualicé la regla «' + nombre + '» (versión ' + p.version + ').' : 'Guardé la regla «' + nombre + '» (versión ' + p.version + ').');
  const e = anotar_(st, { texto: texto2, politica: p.id, objeto: 'politica:' + p.id, v: p.version, aviso: aviso, d: nueva ? { tipo: 'politica_nueva', id: p.id } : { tipo: 'politica', antes: antes } });
  const nivelTexto = sube ? ' Sigue en ' + COS.NIVEL_TEXTO[p.nivel] + ': pasarla a ' + COS.NIVEL_TEXTO[nivelPedido] + ' espera tu sí.' : '';
  if (nivelTexto) e.texto += nivelTexto;
  // Encenderla o subirla con el sí en palabras deja el aviso en Hoy, con Bien y Deshacer.
  const prendida = x => !!x && x.estado === 'activa' && x.nivel !== 'apagado';
  if (con && prendida(p) && (!prendida(antes) || rangoNivel_(p.nivel) > rangoNivel_(antes.nivel)))
    avisarConsentimiento_(st, p, con, e, prendida(antes) ? 'la subí de ' + COS.NIVEL_TEXTO[antes.nivel] + ' a ' + COS.NIVEL_TEXTO[p.nivel] : 'la encendí en ' + COS.NIVEL_TEXTO[p.nivel]);
  // Todo cambio con su sí en palabras deja el aviso, esté prendida, en pausa o apagada: bajarla, su texto, a qué correo toca y cuándo corre.
  else if (con && VIA !== 'webapp' && antes && (p.nivel !== antes.nivel || p.estado !== antes.estado))
    avisarConsentimiento_(st, p, con, e, p.nivel === 'apagado' ? 'la apagué' : 'la bajé de ' + COS.NIVEL_TEXTO[antes.nivel] + ' a ' + COS.NIVEL_TEXTO[p.nivel]);
  else if (con && VIA !== 'webapp' && antes && (aprobado.length || cambiaComp)) avisarConsentimiento_(st, p, con, e, 'la cambié');
  usarConsentimiento_(st, con);
  // Si sus palabras no alcanzan o la llamada viene de una rutina, lo que pidió queda como propuesta con su efecto exacto.
  const prop = dudoso && !con && (sube || p.estado !== 'activa') && !(planPorLineamientos_() && !instalacionCerrada_(st))
    ? proponerCambio_(st, p, nivelPedido, sube ? undefined : 'activa', noVale) : null;
  if (prop) return { hecho: e.texto + ' Quedó como propuesta para su sí.', id_accion: e.id, politica: filaPolitica_(p), propuesto: true, propuesta: prop.propuesta,
    repetida: prop.repetida, nivel_sin_cambio: sube ? p.nivel : undefined, consentimiento_no_vale: noVale };
  return { hecho: e.texto, id_accion: e.id, politica: filaPolitica_(p), nivel_sin_cambio: sube ? p.nivel : undefined, nivel_propuesto: sube || tope ? nivelPedido : undefined,
    consentimiento_no_vale: noVale ? noVale + ': la guardé como cualquier subida, sin su sí.' : undefined, consentimiento_usado: con ? con.canal : undefined,
    siguiente: sube || tope ? (tope ? COS.NIVEL_TEXTO.solo + ' no se da de un salto con un sí en palabras: ' : '') + 'Para subirla a ' + nivelPedido + ', pídele su sí con proponer({tipo: "politica", objeto: "' + p.id + '", opciones: [{etiqueta, efecto: {nivel: {politica: "' + p.id + '", nivel: "' + nivelPedido + '"}}}]}).'
      : p.estado === 'propuesta' && !con ? (planPorLineamientos_() && !instalacionCerrada_(st)
        ? 'Va en el plan por lineamientos: su sí llega con la propuesta de su lineamiento (objeto lineamiento:<clave>). No le hagas propuesta propia.'
        : 'Pídele su sí con proponer({tipo: "politica", objeto: "' + p.id + '", opciones...}).') : undefined };
}

// nivel o estado. Desde la web app lo decide la persona; por el conector, una propuesta aceptada o su orden en palabras
// (consentimiento). Opus retira sin preguntar lo que no pidió la persona; lo de origen persona pide su sí.
function cambiarPolitica_(st, id, nivel, estado, propuesta, consentimiento) {
  const p = politica_(st, argTexto_(id, 'id'));
  if (nivel === undefined && estado === undefined) throw new Error('Pasa nivel (apagado, propone, avisa, solo) o estado (activa, pausada, retirada).');
  if (nivel !== undefined && POLITICA.NIVELES.indexOf(String(nivel)) < 0) throw new Error('nivel vale apagado, propone, avisa o solo.');
  if (estado !== undefined && ['activa', 'pausada', 'retirada'].indexOf(String(estado)) < 0) throw new Error('estado vale activa, pausada o retirada.');
  let con = consentimiento_(consentimiento);
  let noVale = con && con.invalido ? con.invalido : undefined, dudoso = !!(con && con.dudoso);
  if (noVale) con = null;
  if (!con && VIA !== 'webapp') con = consentimientoGuardado_(st, p, null);
  const sube = (nivel !== undefined && rangoNivel_(nivel) > rangoNivel_(p.nivel)) || (estado === 'activa' && p.estado !== 'activa');
  const noPide = noPideCambio_(con, p, sube ? 'sube' : estado === 'retirada' ? 'retira' : estado === 'pausada' ? 'pausa' : nivel === 'apagado' ? 'apaga' : 'baja');
  if (noPide) { noVale = noPide; con = null; dudoso = true; }
  // Con su sí en palabras (de la plática o guardado de la web app) llega a Te aviso: Lo hago solo pide su propia propuesta.
  const nivelQueda = nivel !== undefined ? nivel : p.nivel, quedaActiva = estado !== undefined ? estado === 'activa' : p.estado === 'activa';
  const tope = !!con && VIA !== 'webapp' && nivelQueda === 'solo' && quedaActiva && !(p.nivel === 'solo' && p.estado === 'activa');
  if (tope) {
    nivel = 'avisa';
    p.nivel_propuesto = { nivel: 'solo', t: Date.now(), por: actor_(), consentimiento: true };
  }
  const siguienteSolo = tope ? COS.NIVEL_TEXTO.solo + ' no se da de un salto con un sí en palabras: pídele su sí con proponer({tipo: "politica", objeto: "' + p.id + '", opciones: [{etiqueta, efecto: {nivel: {politica: "' + p.id + '", nivel: "solo"}}}]}).' : undefined;
  // Bajar el nivel, apagar o retirar lo que no pidió la persona y no protege no pide sí. Lo demás, y subir, sí.
  // Bajar una suya que no protege, sin apagarla, cuando sus rescates pasan de 2%, tampoco pide sí: lo promete Autonomía.
  const suya = suyaOProtege_(p), m = p.metricas || {};
  const retiraOpus = estado === 'retirada' && nivel === undefined && !suya;
  const baja = nivel !== undefined && rangoNivel_(nivel) < rangoNivel_(p.nivel) && (estado === undefined || estado === p.estado);
  // Por rescates baja un solo nivel en cada ventana de 30 días: una segunda llamada no baja otro.
  const yaBajo = p.bajo_por_rescates && Date.now() - p.bajo_por_rescates < 30 * 86400000;
  const porRescates = baja && nivel !== 'apagado' && rangoNivel_(p.nivel) - rangoNivel_(nivel) === 1 && !protegeCorreo_(p) && tasaRescate_(m) > 0.02 && !yaBajo;
  // Lo que propuso Opus y ella aceptó, también el catálogo aceptado, se pausa sin preguntar si no protege.
  const pausaOpus = estado === 'pausada' && p.estado === 'activa' && nivel === undefined && !suya;
  if (suya && porRescates && !con && VIA !== 'webapp') p.bajo_por_rescates = Date.now();
  if (VIA !== 'webapp' && !retiraOpus && !pausaOpus && !(baja && (!suya || porRescates)) && !con) {
    const lp = st.get('propuestas', []), pr = propuesta ? lp.filter(x => x.id === propuesta)[0] : null;
    const porque = suya && (baja || estado === 'retirada' || estado === 'pausada') ? ' «' + p.nombre + '» la pidió la persona o protege su correo: bajarla, apagarla o retirarla también.' : '';
    // Pidió el cambio con palabras que no alcanzan para saberlo: queda como propuesta con su efecto exacto.
    if (!pr && dudoso) return proponerCambio_(st, p, nivel, estado, noVale);
    if (!pr) throw new Error('Cambiar el nivel o el estado de una política necesita el sí de la persona.' + porque + (noVale ? ' El consentimiento no vale: ' + noVale + '.' : '') + ' Deja una propuesta con proponer y aplícala con responder cuando conteste; desde la web app la persona lo cambia directo.');
    if (!propuestaAutoriza_(pr, p.id, nivel, estado)) throw new Error('La propuesta ' + propuesta + ' no autoriza ese cambio: vale solo para el cambio exacto del efecto de la opción que eligió la persona ({nivel: {politica, nivel}} o {politica: {id, nivel, estado}}), una vez' + (pr.usada ? ', y ya se usó' : '') + '.');
    pr.usada = { t: Date.now(), politica: p.id, nivel: nivel, estado: estado };
    st.set('propuestas', lp);
  }
  // Juntas, Autonomía y Carpetas por tema son funciones: se encienden sin acciones propias.
  if (estado === 'activa' && !(p.acciones || []).length && !p.criterio && ['juntas', 'autonomia', 'carpetas'].indexOf(p.id) < 0) throw new Error(VIA === 'webapp' ? '«' + p.nombre + '» todavía no está lista: Claude la arma en tu siguiente revisión y entonces la enciendes.' : 'La política ' + p.id + ' todavía no tiene acciones ni criterio: Opus la compila primero con guardar_politica.');
  const antes = { nivel: p.nivel, estado: p.estado, aprobada: p.aprobada };
  if (nivel !== undefined && nivel === p.nivel && (estado === undefined || estado === p.estado)) {
    if (tope) st.set('politicas', listaPoliticas_(st));
    return { hecho: p.nombre + ' ya estaba en ' + COS.NIVEL_TEXTO[nivel] + '.' + (tope ? ' ' + COS.NIVEL_TEXTO.solo + ' espera su sí.' : ''), sin_cambio: true, politica: filaPolitica_(p), nivel_propuesto: tope ? 'solo' : undefined, siguiente: siguienteSolo };
  }
  if (nivel === undefined && estado === p.estado) return { hecho: p.nombre + ' ya estaba ' + estado + '.', sin_cambio: true, politica: filaPolitica_(p) };
  if (nivel !== undefined) p.nivel = String(nivel);
  if (estado !== undefined) p.estado = String(estado);
  if (p.estado === 'activa' && !baja && (estado === 'activa' || (nivel !== undefined && nivel !== 'apagado'))) p.aprobada = Date.now();
  if (p.nivel_propuesto && rangoNivel_(p.nivel) >= rangoNivel_(p.nivel_propuesto.nivel)) delete p.nivel_propuesto;
  p.actualizada = Date.now();
  st.set('politicas', listaPoliticas_(st));
  const partes = [];
  if (nivel !== undefined && nivel !== antes.nivel) partes.push('de ' + COS.NIVEL_TEXTO[antes.nivel] + ' a ' + COS.NIVEL_TEXTO[p.nivel]);
  if (estado !== undefined && estado !== antes.estado) partes.push('quedó ' + (ESTADO_TEXTO[p.estado] || p.estado));
  if (con && VIA !== 'webapp') { p.consentimiento = con; partes.push('lo pediste («' + corto_(con.palabras, 120) + '»)'); }
  if (tope) partes.push(COS.NIVEL_TEXTO.solo + ' espera tu sí');
  if (retiraOpus && VIA !== 'webapp') partes.push('sale en el repaso con Deshacer');
  const e = anotar_(st, { texto: p.nombre + ': ' + partes.join('; ') + '.', politica: p.id, objeto: 'politica:' + p.id, v: p.version, d: { tipo: 'politica_nivel', id: p.id, antes: antes } });
  // Encenderla o subirla con el sí en palabras deja el aviso en Hoy, con Bien y Deshacer.
  // Bajar, apagar, pausar o retirar con su sí en palabras también deja el aviso, en cualquier regla y en cualquier estado.
  const prendida = x => x.estado === 'activa' && x.nivel !== 'apagado';
  if (con && VIA !== 'webapp' && prendida(p) && (!prendida(antes) || rangoNivel_(p.nivel) > rangoNivel_(antes.nivel)))
    avisarConsentimiento_(st, p, con, e, prendida(antes) ? 'la subí de ' + COS.NIVEL_TEXTO[antes.nivel] + ' a ' + COS.NIVEL_TEXTO[p.nivel] : 'la encendí en ' + COS.NIVEL_TEXTO[p.nivel]);
  else if (con && VIA !== 'webapp' && (p.nivel !== antes.nivel || p.estado !== antes.estado))
    avisarConsentimiento_(st, p, con, e, p.estado === 'retirada' ? 'la retiré' : p.estado === 'pausada' ? 'la pausé' : p.nivel === 'apagado' ? 'la apagué' : 'la bajé de ' + COS.NIVEL_TEXTO[antes.nivel] + ' a ' + COS.NIVEL_TEXTO[p.nivel]);
  if (VIA !== 'webapp') usarConsentimiento_(st, con);
  return { hecho: e.texto, id_accion: e.id, politica: filaPolitica_(p), nivel_propuesto: tope ? 'solo' : undefined, siguiente: siguienteSolo };
}

function filaPolitica_(p) {
  const m = p.metricas || metricasVacias_();
  // Bajar el nivel cuando los rescates pasan de 2% protege siempre, con o sin Autonomía.
  const bajar = tasaRescate_(m) > 0.02 && p.nivel !== 'apagado' && p.nivel !== 'propone';
  const decididas = m.aceptadas + m.corregidas + m.rechazadas;
  return { id: p.id, nombre: p.nombre, texto: p.texto, origen: p.origen, nivel: p.nivel, nivel_texto: COS.NIVEL_TEXTO[p.nivel], estado: p.estado,
    nivel_propuesto: p.nivel_propuesto ? { nivel: p.nivel_propuesto.nivel, desde: fecha_(p.nivel_propuesto.t), nota: 'Espera el sí de la persona: el nivel vigente es ' + p.nivel + '.' } : undefined,
    acciones: p.acciones, compilado: p.compilado, criterio: p.criterio || undefined, cuando: p.cuando, version: p.version,
    prueba: p.prueba || undefined, fijado_por_la_persona: p.fijo && (p.fijo.condiciones.length || p.fijo.excepciones.length || p.fijo.quitadas.length) ? p.fijo : undefined,
    metricas: { disparos: m.disparos, ultimo_disparo: m.ultimo_disparo ? fecha_(m.ultimo_disparo) : null, aceptadas: m.aceptadas, observadas: m.observadas,
      corregidas: m.corregidas, rechazadas: m.rechazadas, rescates: m.rescates, tasa_rescate: m.disparos ? +tasaRescate_(m).toFixed(3) : null, proponer_bajar_nivel: bajar || undefined,
      aceptadas_explicitas_sin_correccion: m.ultimas_20.filter(x => x === 'a').length + ' de las últimas ' + m.ultimas_20.length, ultimas_20: m.ultimas_20.join(''),
      sin_ver: undefined, decididas: decididas },
    aprobada: p.aprobada ? fecha_(p.aprobada) : undefined, actualizada: p.actualizada ? fecha_(p.actualizada) : undefined };
}

function verPoliticas_(st, filtro) {
  filtro = filtro || {};
  if (typeof filtro === 'string') filtro = POLITICA.ESTADOS.indexOf(filtro) >= 0 ? { estado: filtro } : { id: filtro };
  let l = listaPoliticas_(st);
  if (filtro.id) l = l.filter(p => p.id === filtro.id);
  if (filtro.estado) l = l.filter(p => p.estado === filtro.estado);
  // El catálogo nace con estado activa y nivel apagado. Una apagada no hace nada: el filtro {estado: "activa"} sin nivel
  // las deja fuera y dice cuántas son, para que nadie la lea como encendida.
  let apagadas = 0;
  if (filtro.estado === 'activa' && !filtro.nivel) { apagadas = l.filter(p => p.nivel === 'apagado').length; l = l.filter(p => p.nivel !== 'apagado'); }
  if (filtro.origen) l = l.filter(p => p.origen === filtro.origen);
  if (filtro.nivel) l = l.filter(p => p.nivel === filtro.nivel);
  if (filtro.texto) { const w = sinAcentos_(filtro.texto).toLowerCase(); l = l.filter(p => sinAcentos_(p.nombre + ' ' + p.texto).toLowerCase().indexOf(w) >= 0); }
  const vivas = listaPoliticas_(st).filter(politicaViva_).length;
  // En lista por el conector, la prueba va en cifras (sin ejemplos ni consulta) y sin el texto de aceptadas explícitas:
  // eran 40% del peso. Con filtro {id} y en la web app, todo.
  const corta = VIA !== 'webapp' && !filtro.id;
  const fila = p => { const f = filaPolitica_(p); if (!corta) return f;
    if (f.prueba) f.prueba = { dias: f.prueba.dias, casos: f.prueba.casos, hilos: f.prueba.resultado ? f.prueba.resultado.hilos : undefined, dias_resultado: f.prueba.resultado ? f.prueba.resultado.dias : undefined };
    if (f.metricas) delete f.metricas.aceptadas_explicitas_sin_correccion;
    return f; };
  return { total: l.length, vivas: vivas, apagadas_fuera: apagadas || undefined, politicas: l.map(fila),
    nota: [vivas ? '' : 'Ninguna política tiene nivel y condiciones: el motor solo cuenta y registra señales; no mueve correo.',
      apagadas ? 'Dejé fuera ' + apagadas + ' con estado activa y nivel apagado: no hacen nada. Para verlas, pide {nivel: "apagado"} o sin filtro.' : '',
      corta && l.some(p => p.prueba) ? 'La prueba va en cifras; sus ejemplos y su consulta, con filtro {id}.' : ''].filter(Boolean).join(' ') || undefined };
}

// ---------- Métricas ----------
// letra: a (aceptada explícita), o (observada 7 días), c (corregida), r (rechazada).
function sumarMetrica_(st, id, letra, n) {
  if (!id) return;
  const l = st.get('politicas', []);
  const p = l.filter(x => x.id === id)[0];
  if (!p) return;
  const m = p.metricas || (p.metricas = metricasVacias_());
  const campo = { a: 'aceptadas', o: 'observadas', c: 'corregidas', r: 'rechazadas' }[letra];
  if (campo) { m[campo] += (n || 1); m.ultimas_20 = (m.ultimas_20 || []).concat([letra]).slice(-20); }
  st.set('politicas', l);
}

function sumarDisparos_(st, id, n) {
  const l = st.get('politicas', []);
  const p = l.filter(x => x.id === id)[0];
  if (!p) return;
  const m = p.metricas || (p.metricas = metricasVacias_());
  m.disparos += n;
  m.ultimo_disparo = Date.now();
  porDia_(m, 0, n);
  st.set('politicas', l);
}

// Un rescate pone al remitente como excepción de la política que lo movió, hasta que la persona conteste.
function excepcionPorRescate_(st, id, remitente) {
  const l = st.get('politicas', []);
  const p = l.filter(x => x.id === id)[0];
  if (!p || !remitente) return null;
  const m = p.metricas || (p.metricas = metricasVacias_());
  m.rescates += 1;
  porDia_(m, 1, 1);
  m.ultimas_20 = (m.ultimas_20 || []).concat(['c']).slice(-20);
  if (tieneValor_(p.compilado.excepciones, 'remitente', remitente)) { st.set('politicas', l); return null; }
  const antes = JSON.parse(JSON.stringify(p));
  const ex = p.compilado.excepciones.filter(x => x.campo === 'remitente')[0];
  if (ex) ex.valores.push(remitente); else p.compilado.excepciones.push({ campo: 'remitente', valores: [remitente] });
  fijarDePersona_(p, { excepciones: [{ campo: 'remitente', valores: [remitente] }] });
  p.version = (p.version || 0) + 1;
  p.versiones = (p.versiones || []).concat([{ version: p.version, t: Date.now(), por: 'persona', compilado: p.compilado, evidencia: 'rescate de ' + remitente }]).slice(-POLITICA.MAX_VERSIONES);
  p.actualizada = Date.now();
  st.set('politicas', l);
  const e = anotar_(st, { texto: 'Rescataste un correo de ' + remitente + ': ya no lo toca «' + p.nombre + '». Sale en el repaso de la semana con Deshacer.', politica: p.id, objeto: 'politica:' + p.id, v: p.version, actor: 'motor', aviso: true, d: { tipo: 'politica', antes: antes } });
  // El id de esta línea es la evidencia con la que Opus extiende el rescate al dominio o al tema.
  const ids = p.rescates_ids || {}; ids[e.id] = remitente;
  const ks = Object.keys(ids); if (ks.length > 50) delete ids[ks[0]];
  p.rescates_ids = ids;
  st.set('politicas', l);
  return e;
}

// ---------- Decisión del motor para un correo ----------
// ctx: { politicas (vivas), fichas, consultas: {idPolitica#k: {idMensaje: 1}}, juicios, conocidos, conversaciones: {hilo: 1}, sinLeido, bajas, st }
function contextoPoliticas_(st, op) {
  op = op || {};
  const todas = listaPoliticas_(st);
  let pols = todas.filter(politicaViva_);
  if (op.solo) pols = todas.filter(p => op.solo.indexOf(p.id) >= 0 && p.estado !== 'retirada' && (p.compilado.condiciones || []).length);
  return { st: st, politicas: pols, fichas: st.get('fichas', []), consultas: {}, juicios: st.get('juicios', {}), conocidos: st.get('conocidos', {}),
    conversaciones: {}, bajas: st.get('bajas', {}), ignorarNivel: !!op.solo, retenerLeido: retenerLeido_(st) };
}

// Leído desde el primer día cuando la historia lo dice: con historia de 30 días, el motor ejecuta leído tal como lo compiló
// Opus. Un remitente sin historia se mide 14 días desde su primer correo antes de marcar leído, como respaldo.
// Devuelve una función (remitente, fecha del correo) → hasta cuándo se retiene, o null.
// Con sin_leer en lo_que_te_necesita no se mide: lo que va a una carpeta
// queda leído desde el primer correo; lo protege el juicio de Opus (media o más sigue sin leer). Con como_esta, se mide.
function retenerLeido_(st) {
  if (decision_(st, 'sin_leer') === 'lo_que_te_necesita') return () => null;
  const ap = st.get('aperturas_30d', {});
  const primer = st.get('primer_correo', {});
  const dias = COS.DIAS_MEDIR_LEIDO * 86400000;
  return (de, t) => {
    const a = ap[de];
    if (a && a[2] > 0) return null;
    const hasta = Math.min(primer[de] || t || Date.now(), t || Date.now()) + dias;
    return Date.now() < hasta ? hasta : null;
  };
}

// Mensajes que cumplen cada condición de consulta, con una búsqueda por consulta en la ventana dada.
function consultasPara_(ctx, ids, dias) {
  const quiero = {};
  ids.forEach(id => { quiero[id] = 1; });
  ctx.politicas.forEach(p => (p.compilado.condiciones || []).concat(p.compilado.excepciones || []).forEach((c, k) => {
    if (c.campo !== 'consulta') return;
    c.valores.forEach((v, j) => {
      const llave = p.id + '#' + v;
      if (ctx.consultas[llave]) return;
      const s = {};
      try { listarIds_('newer_than:' + Math.max(1, dias) + 'd (' + v + ')', 2000, Date.now()).forEach(id => { if (quiero[id]) s[id] = 1; }); } catch (e) {}
      ctx.consultas[llave] = s;
    });
  }));
  return ctx.consultas;
}

function cumple_(c, m, f, ctx, p) {
  const de = f.de, d = f.dominio;
  if (c.campo === 'remitente') return c.valores.indexOf(de) >= 0;
  if (c.campo === 'dominio') return c.valores.some(v => d === v || d.slice(-(v.length + 1)) === '.' + v);
  if (c.campo === 'lista') return !!f.lista && c.valores.some(v => f.lista === v || f.lista.indexOf(v) >= 0);
  if (c.campo === 'categoria_gmail') return !!f.categoria && c.valores.indexOf(f.categoria) >= 0;
  if (c.campo === 'consulta') return c.valores.some(v => !!(ctx.consultas[p.id + '#' + v] || {})[m.id]);
  if (c.campo === 'ficha') return c.valores.some(v => (v === 'persona' && !!f.ficha.persona) || (v === 'organizacion' && !!f.ficha.organizacion) ||
    (f.ficha.persona && f.ficha.persona.id === v) || (f.ficha.organizacion && f.ficha.organizacion.id === v));
  if (c.campo === 'importancia') return c.valores.indexOf(f.importancia) >= 0;
  return false;
}

function hechosDe_(m, ctx) {
  const de = correo_(m.h['From']);
  const ficha = fichaDe_(ctx.fichas, de);
  const importancia = (ficha.persona && ficha.persona.importancia) || (ficha.organizacion && ficha.organizacion.importancia) || 'normal';
  const sd = sensibleDeHilo_(m, ctx);
  return { de: de, dominio: dominio_(de), lista: listId_(m), categoria: categoriaGmail_(m.labelIds), ficha: ficha, importancia: importancia,
    sensible: sd ? sd.tema : null, sensible_por: sd || undefined, dinero: documentoDinero_((m.h['Subject'] || '') + ' ' + (m.snippet || '')) || undefined };
}

// El juicio de Opus manda sobre la palabra clave: marca un hilo sensible o le quita la marca. Sin juicio, la palabra clave.
// Devuelve {tema, palabra, fuente, donde} o null.
function sensibleDeHilo_(m, ctx) {
  const j = ctx.juicios && ctx.juicios[m.threadId];
  if (j && !j.vencido && j.no_sensible) return null;
  if (j && j.sensible) return Object.assign({ tema: j.sensible, fuente: 'juicio de Opus' }, j.sensible_por && j.sensible_por.fuente !== 'juicio de Opus' ? { palabra: j.sensible_por.palabra, donde: j.sensible_por.donde } : {});
  return sensibleDeMensaje_(m, ctx.st);
}

// Devuelve { accion: 'queda' | 'actua', acciones, politica, nivel, motivo, campo, importante, avisos, espera, conflicto }.
function decidirMensaje_(m, ctx) {
  const f = hechosDe_(m, ctx);
  const res = { accion: 'queda', acciones: [], politica: null, nivel: null, motivo: '', hechos: f, avisos: [], importante: false };
  if (tiene_(m, 'SENT') || tiene_(m, 'DRAFT')) { res.motivo = 'propio'; return res; }
  if (!ctx.politicas.length) { res.motivo = 'sin reglas activas'; return res; }
  const hits = [];
  ctx.politicas.forEach(p => {
    let mejor = null;
    (p.compilado.condiciones || []).forEach(c => { if (cumple_(c, m, f, ctx, p) && (!mejor || POLITICA.ESPECIFICIDAD[c.campo] > POLITICA.ESPECIFICIDAD[mejor])) mejor = c.campo; });
    if (!mejor) return;
    if ((p.compilado.excepciones || []).some(c => cumple_(c, m, f, ctx, p))) { res.excepcion = p.id; return; }
    hits.push({ p: p, campo: mejor, acciones: accionesMotor_(p) });
  });
  // Lo que se hizo baja hace menos de 14 días va a la papelera, por la política de Bajas.
  const baja = ctx.bajas[f.de];
  if (baja && baja.ok && Date.now() - baja.t < POLITICA.DIAS_BAJA_PAPELERA * 86400000) {
    const pb = ctx.st.get('politicas', []).filter(x => x.id === 'bajas')[0];
    if (pb) hits.push({ p: pb, campo: 'remitente', acciones: ['papelera'], baja: true });
  }
  if (!hits.length) { res.motivo = res.excepcion ? 'excepción de ' + res.excepcion : 'ninguna regla aplica'; return res; }
  hits.forEach(h => { if (h.acciones.indexOf('aviso_en_hoy') >= 0) res.avisos.push(h.p.id); if (h.acciones.indexOf('importante') >= 0) res.importante = true; });
  const protege = hits.filter(h => h.acciones.indexOf('nunca_limpiar') >= 0 || h.acciones.indexOf('importante') >= 0);
  let limpian = hits.filter(h => limpia_(h.acciones));
  const marca = hits.filter(h => !limpia_(h.acciones) && h.acciones.some(a => a === 'importante'));
  if (!limpian.length) {
    if (marca.length || res.avisos.length) { res.accion = 'actua'; res.acciones = res.importante ? ['importante'] : []; res.politica = (marca[0] || hits[0]).p.id; res.nivel = (marca[0] || hits[0]).p.nivel; res.motivo = 'regla ' + res.politica; }
    else res.motivo = 'regla ' + hits[0].p.id + ' sin acción sobre el correo';
    return res;
  }
  // 1. Temas sensibles y fichas de importancia alta nunca se limpian; tampoco códigos, accesos, cobros fallidos ni cambios de contrato.
  if (f.importancia === 'alta') { res.motivo = 'ficha de importancia alta: nunca se limpia'; res.bloqueo = limpian.map(h => h.p.id); return res; }
  if (nuncaSeLimpia_((m.h['Subject'] || '') + ' ' + (m.snippet || ''), masivoAdeudo_(m, ctx.st || null, ctx.corresponsales), m)) { res.motivo = 'código, acceso, cobro fallido, adeudo, cambio de contrato o de plan, o servicio que va a fallar: nunca se limpia'; res.bloqueo = limpian.map(h => h.p.id); return res; }
  // 3. nunca_limpiar (y lo importante) gana a cualquier limpieza.
  if (protege.length) { res.motivo = 'nunca_limpiar de ' + protege[0].p.id; res.bloqueo = limpian.map(h => h.p.id); if (res.importante) { res.accion = 'actua'; res.acciones = ['importante']; res.politica = protege[0].p.id; res.nivel = protege[0].p.nivel; } return res; }
  // Lo nuevo espera a Opus: antes de su juicio, solo una condición explícita de remitente o dominio.
  const juzgado = !!ctx.juicios[m.threadId] || !!ctx.conocidos[f.de] || !!f.ficha.persona;
  const conversa = !!ctx.conversaciones[m.threadId];
  const explicitas = limpian.filter(h => POLITICA.EXPLICITAS.indexOf(h.campo) >= 0);
  if ((!juzgado || conversa) && !explicitas.length) {
    res.accion = 'queda'; res.espera = true;
    res.motivo = conversa ? 'hilo donde escribiste: solo lo mueve una condición de remitente o dominio' : 'remitente nuevo: espera el juicio de Opus';
    res.bloqueo = limpian.map(h => h.p.id);
    return res;
  }
  if (!juzgado || conversa) limpian = explicitas;
  // 4 y 5. Gana la condición más específica y luego la aprobada más reciente.
  limpian.sort((a, b) => POLITICA.ESPECIFICIDAD[b.campo] - POLITICA.ESPECIFICIDAD[a.campo] || (b.p.aprobada || b.p.actualizada || 0) - (a.p.aprobada || a.p.actualizada || 0));
  const g = limpian[0];
  if (limpian.length > 1 && limpian.some(h => JSON.stringify(h.acciones.filter(a => a !== 'aviso_en_hoy')) !== JSON.stringify(g.acciones.filter(a => a !== 'aviso_en_hoy'))))
    res.conflicto = limpian.map(h => h.p.id);
  let acc = g.acciones.filter(a => a !== 'aviso_en_hoy' && a !== 'nunca_limpiar');
  // Medir antes de marcar leído, por remitente (ver retenerLeido_).
  const retiene = marcaLeido_(ctx.st || null, acc) && ctx.retenerLeido ? ctx.retenerLeido(f.de, Number(m.internalDate)) : null;
  if (retiene) { acc = acc.filter(a => a !== 'leido').concat(['dejar_sin_leer']); res.sin_leido_hasta = dia_(retiene); }
  res.accion = 'actua';
  res.acciones = acc.concat(res.importante ? ['importante'] : []).filter((x, i, a) => a.indexOf(x) === i);
  res.politica = g.p.id;
  res.nivel = g.baja ? 'solo' : g.p.nivel;
  res.campo = g.campo;
  res.motivo = 'regla ' + g.p.id + ' por ' + g.campo + (g.baja ? ' (baja hecha hace menos de 14 días)' : '');
  // 2. Los temas sensibles siempre se proponen, en cualquier nivel.
  if (f.sensible) { res.sensible = f.sensible; res.sensible_por = f.sensible_por; res.nivel = 'propone'; res.motivo += '; ' + textoSensible_(f.sensible_por || { tema: f.sensible }) + ': siempre se propone'; }
  // Una baja de suscripción siempre necesita su sí.
  if (res.acciones.indexOf('desuscribir') >= 0) res.nivel = 'propone';
  return res;
}

// Con st, lo que marca leído por la decisión sin_leer dice «leído» aunque la regla no lo traiga.
function textoAcciones_(acciones, st) {
  if (!acciones.length) return 'queda';
  if (st && acciones.indexOf('leido') < 0 && marcaLeido_(st, acciones)) acciones = acciones.concat(['leido']);
  return acciones.map(a => /^carpeta:/.test(a) ? 'a ' + a.slice(8) : { leido: 'leído', papelera: 'papelera', spam: 'spam', desuscribir: 'baja', importante: 'importante', dejar_sin_leer: 'sin marcarlo leído' }[a] || a).join(', ');
}

// La pregunta de la propuesta de una política: verbos sobre n correos, porque la propuesta trae Sí y No. La primera acción
// lleva los correos y las demás el pronombre: «muevo 2 correos a Recibos y los marco leídos». Primero lo que mueve, luego
// lo que marca y al final la baja. Marca leído igual que textoAcciones_ (la carpeta con sin_leer en lo_que_te_necesita).
function preguntaLote_(acciones, st, n) {
  const uno = n === 1, obj = n + ' correo' + (uno ? '' : 's'), lo = uno ? 'lo' : 'los', o = uno ? 'o' : 'os';
  acciones = acciones.filter(a => a !== 'aviso_en_hoy');
  if (st && acciones.indexOf('leido') < 0 && marcaLeido_(st, acciones)) acciones = acciones.concat(['leido']);
  const orden = a => /^carpeta:/.test(a) ? 0 : (k => (k < 0 ? -1 : k + 1))(['archivar', 'papelera', 'spam', 'leido', 'importante', 'dejar_sin_leer', 'nunca_limpiar', 'desuscribir'].indexOf(a));
  const frases = acciones.filter((a, i, l) => l.indexOf(a) === i && orden(a) >= 0).sort((a, b) => orden(a) - orden(b)).map((a, i) => {
    const x = i === 0 ? obj : '', y = i === 0 ? '' : lo + ' ';
    if (/^carpeta:/.test(a)) return y + 'muevo ' + (x ? x + ' ' : '') + 'a ' + a.slice(8);
    if (a === 'archivar') return y + 'archivo' + (x ? ' ' + x : '');
    if (a === 'papelera') return y + 'mando ' + (x ? x + ' ' : '') + 'a la papelera';
    if (a === 'spam') return y + 'mando ' + (x ? x + ' ' : '') + 'a spam';
    if (a === 'leido') return x ? 'marco ' + x + ' como leíd' + o : y + 'marco leíd' + o;
    if (a === 'importante') return x ? 'marco ' + x + ' como importante' + (uno ? '' : 's') : y + 'marco importante' + (uno ? '' : 's');
    if (a === 'dejar_sin_leer') return y + 'dejo ' + (x ? x + ' ' : '') + 'sin leer';
    if (a === 'nunca_limpiar') return y + 'dejo ' + (x ? x + ' ' : '') + 'siempre en Recibidos';
    return x ? 'me doy de baja de ' + (uno ? 'la lista' : 'las listas') + ' de ' + x : 'me doy de baja de ' + (uno ? 'su lista' : 'sus listas');
  });
  if (!frases.length) return '¿dejo ' + obj + ' como ' + (uno ? 'está' : 'están') + '?';
  return '¿' + (frases.length === 1 ? frases[0] : frases.slice(0, -1).join(', ') + ' y ' + frases[frases.length - 1]) + '?';
}
