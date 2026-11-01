// --- Acciones sobre el correo, con deshacer salvo la baja ---
// Mover, leído, importante, papelera, spam, borrador y baja de un clic. Nunca se envía un correo y nunca se borra
// para siempre. La baja no tiene deshacer: se revierte en el sitio del remitente.

// Si Google rechaza una llamada a media acción, lo que ya hizo se registra igual (huellas y deshacer) y viaja en el error:
// aplicarItems_ le pone su línea en Actividad. Nunca queda un correo movido sin registro ni Deshacer.
function hastaFallar_(ids, paso, fn) {
  let k = 0;
  try { for (; k < ids.length; k += paso) fn(ids.slice(k, k + paso)); }
  catch (err) { return { k: k, err: err }; }
  return { k: ids.length, err: null };
}
function siFallo_(r, parte) {
  if (!r.err) return parte;
  r.err.parcial = parte.ms.length ? parte : null;
  throw r.err;
}

// ms: [id, estaba en bandeja, estaba sin leer, ya tenía la etiqueta]
function etiquetar_(st, ids, estados, etId, quitarInbox, quitarUnread, carpeta, politica) {
  const quitar = [];
  if (quitarInbox) quitar.push('INBOX');
  if (quitarUnread) quitar.push('UNREAD');
  const r = hastaFallar_(ids, 1000, lote => modificar_(lote, etId ? [etId] : [], quitar));
  ids = ids.slice(0, r.k);
  const ms = ids.map(id => { const l = estados[id] || []; return [id, l.indexOf('INBOX') >= 0 ? 1 : 0, l.indexOf('UNREAD') >= 0 ? 1 : 0, etId && l.indexOf(etId) >= 0 ? 1 : 0]; });
  if (etId) huellas_(st, ms.filter(x => !x[3]).map(x => x[0]), ['+' + etId]);
  if (quitarInbox) {
    huellas_(st, ms.filter(x => x[1]).map(x => x[0]), ['-INBOX']);
    marcarMovidos_(st, ids, carpeta, politica);
  }
  if (quitarUnread) huellas_(st, ms.filter(x => x[2]).map(x => x[0]), ['-UNREAD']);
  return siFallo_(r, { tipo: 'etiquetar', l: etId || null, qi: quitarInbox ? 1 : 0, qu: quitarUnread ? 1 : 0, ms: ms });
}

function papeleraMensajes_(st, ids, estados, politica) {
  const r = hastaFallar_(ids, 1, uno => conReintento_(() => Gmail.Users.Messages.trash('me', uno[0])));
  ids = ids.slice(0, r.k);
  const ms = ids.map(id => { const l = estados[id] || []; return [id, l.indexOf('INBOX') >= 0 ? 1 : 0, l.indexOf('UNREAD') >= 0 ? 1 : 0]; });
  huellas_(st, ids, ['+TRASH']);
  huellas_(st, ms.filter(x => x[1]).map(x => x[0]), ['-INBOX']);
  marcarMovidos_(st, ids, 'Papelera', politica);
  return siFallo_(r, { tipo: 'papelera', ms: ms });
}

// Sacar de spam: regresa a Recibidos sin la etiqueta de spam, lo que le enseña al filtro de Gmail que no lo es. Deshacer
// lo regresa a spam.
function sacarDeSpam_(st, ids, estados) {
  const r = hastaFallar_(ids, 1000, lote => modificar_(lote, ['INBOX'], ['SPAM']));
  ids = ids.slice(0, r.k);
  const ms = ids.map(id => [id, (estados[id] || []).indexOf('INBOX') >= 0 ? 1 : 0]);
  huellas_(st, ids, ['-SPAM']);
  huellas_(st, ms.filter(x => !x[1]).map(x => x[0]), ['+INBOX']);
  return siFallo_(r, { tipo: 'no_spam', ms: ms });
}

// Spam: sale de la bandeja con la etiqueta de spam, que también enseña al filtro de Gmail.
function spamMensajes_(st, ids, estados, politica) {
  const r = hastaFallar_(ids, 1000, lote => modificar_(lote, ['SPAM'], ['INBOX']));
  ids = ids.slice(0, r.k);
  const ms = ids.map(id => { const l = estados[id] || []; return [id, l.indexOf('INBOX') >= 0 ? 1 : 0, l.indexOf('UNREAD') >= 0 ? 1 : 0]; });
  huellas_(st, ids, ['+SPAM']);
  huellas_(st, ms.filter(x => x[1]).map(x => x[0]), ['-INBOX']);
  marcarMovidos_(st, ids, 'Spam', politica);
  return siFallo_(r, { tipo: 'spam', ms: ms });
}

// Aplica las acciones de una política a una lista de correos. items: [{m, h, de, co, as, f}].
function aplicarItems_(st, acciones, items, politica, actor, op) {
  op = op || {};
  if (!items.length) return { n: 0, omitidos: 0, hecho: 'No había correos que aplicar.' };
  const estados = op.estados || estadoMensajes_(items.map(i => i.m));
  // Nunca se archiva nada sin leer.
  const archiva = acciones.indexOf('archivar') >= 0 && !acciones.some(a => /^carpeta:/.test(a)) && acciones.indexOf('papelera') < 0 && acciones.indexOf('spam') < 0;
  const vivos = items.filter(i => { const l = estados[i.m]; return l && l.indexOf('TRASH') < 0 && l.indexOf('SPAM') < 0 && (l.indexOf('INBOX') >= 0 || acciones.every(a => a === 'importante' || a === 'leido')) &&
    (!archiva || l.indexOf('UNREAD') < 0); });
  const omitidos = items.length - vivos.length;
  if (!vivos.length) return { n: 0, omitidos: omitidos, hecho: 'Ninguno de esos correos sigue en la bandeja; no hice nada.' };
  fijarHistorial_(st);
  const ids = vivos.map(i => i.m);
  const n = ids.length, s = n === 1 ? '' : 's';
  const carpeta = (acciones.filter(a => /^carpeta:/.test(a))[0] || '').slice(8);
  const leido = marcaLeido_(st, acciones);
  const partes = [];
  let texto, fallo = null;
  try {
    if (acciones.indexOf('papelera') >= 0) {
      partes.push(papeleraMensajes_(st, ids, estados, politica));
      texto = 'Mandé a la papelera ' + n + ' correo' + s + ' (' + conteoRemitentes_(vivos, 4) + '). Se recuperan en 30 días.';
    } else if (acciones.indexOf('spam') >= 0) {
      partes.push(spamMensajes_(st, ids, estados, politica));
      texto = 'Mandé a spam ' + n + ' correo' + s + ' (' + conteoRemitentes_(vivos, 4) + ').';
    } else if (carpeta) {
      partes.push(etiquetar_(st, ids, estados, idEtiquetaCos_(carpeta), true, leido, carpeta, politica));
      // Para el resumen de lo apartado: la carpeta y hasta 3 ejemplos, primero lo sin leer y lo más reciente.
      const ej = vivos.slice().sort((a, b) => ((estados[b.m] || []).indexOf('UNREAD') >= 0) - ((estados[a.m] || []).indexOf('UNREAD') >= 0) || (b.f || 0) - (a.f || 0)).slice(0, 3);
      Object.assign(partes[partes.length - 1], { c: carpeta, ej: ej.map(i => [i.de, corto_(i.as || '', 60), i.h]) });
      texto = 'Moví ' + n + ' correo' + s + ' a ' + carpeta + (leido ? ', leídos' : '') + ' (' + conteoRemitentes_(vivos, 4) + ').';
    } else if (archiva) {
      partes.push(etiquetar_(st, ids, estados, null, true, false, null, politica));
      texto = 'Archivé ' + n + ' correo' + s + ' que ya leíste y no te piden nada (' + conteoRemitentes_(vivos, 4) + '). Siguen en Todos y en la búsqueda.';
    } else if (leido) {
      partes.push(etiquetar_(st, ids, estados, null, false, true, null, politica));
      texto = 'Marqué como leídos ' + n + ' correo' + s + ' (' + conteoRemitentes_(vivos, 4) + '); siguen en la bandeja.';
    }
    if (acciones.indexOf('importante') >= 0 && acciones.indexOf('papelera') < 0 && acciones.indexOf('spam') < 0) {
      partes.push(etiquetar_(st, ids, estados, 'IMPORTANT', false, false, null, politica));
      texto = (texto ? texto + ' ' : '') + 'Marqué como importantes ' + n + ' correo' + s + '.';
    }
  } catch (err) {
    fallo = err;
    if (err && err.parcial) partes.push(err.parcial);
  }
  // Los correos que alguna parte alcanzó a tocar; sin falla, todos.
  const tocado = {};
  partes.forEach(p => p.ms.forEach(x => { tocado[x[0]] = 1; }));
  const hechos = fallo ? vivos.filter(i => tocado[i.m]) : vivos;
  const pendientes = fallo ? vivos.filter(i => !tocado[i.m]) : [];
  // Lo que una política marca leído nunca cuenta como que la persona lo abrió.
  if (leido && acciones.indexOf('papelera') < 0 && acciones.indexOf('spam') < 0) {
    const sinLeer = hechos.filter(i => (estados[i.m] || []).indexOf('UNREAD') >= 0);
    if (sinLeer.length) {
      anotarLeidoSistema_(st, sinLeer.map(i => i.h), 'politica');
      anotarSenal_(st, { tipo: 'leido_por_politica', canal: 'motor', politica: politica, remitente: sinLeer.length === 1 ? sinLeer[0].co : undefined, detalle: sinLeer.length + ' correo' + (sinLeer.length === 1 ? '' : 's') + ' marcados leídos por la política' });
    }
  }
  if (fallo && !partes.length) { fallo.pendientes = pendientes; throw fallo; }
  if (!partes.length) return { n: 0, omitidos: omitidos, hecho: 'La regla no trae una acción sobre el correo.' };
  if (fallo) {
    const h = hechos.length, f = pendientes.length;
    const verbo = acciones.indexOf('papelera') >= 0 ? 'Mandé a la papelera' : acciones.indexOf('spam') >= 0 ? 'Mandé a spam' : carpeta ? 'Moví a ' + carpeta : archiva ? 'Archivé' : leido ? 'Marqué como leídos' : 'Marqué como importantes';
    texto = f ? verbo + ' ' + h + ' de ' + n + ' correos (' + conteoRemitentes_(hechos, 4) + '). Google rechazó ' + (f === 1 ? 'el otro' : 'los otros ' + f) + ' por ahora; se reintenta' + (f === 1 ? '' : 'n') + '.'
      : (texto || verbo + ' ' + n + ' correo' + s) + ' Google rechazó el resto de la acción por ahora.';
  }
  if (politica) sumarDisparos_(st, politica, hechos.length);
  const pol = politica ? listaPoliticas_(st).filter(p => p.id === politica)[0] : null;
  const e = anotar_(st, { texto: (pol ? pol.nombre + ': ' : '') + texto, politica: politica, actor: actor, aviso: op.aviso, v: pol ? pol.version : undefined,
    objeto: hechos.length === 1 ? hechos[0].h : undefined, d: partes.length === 1 ? partes[0] : { tipo: 'varios', partes: partes } });
  GUARDAR_AL_FALLAR_ = true;
  if (fallo) {
    fallo.aplicado = { n: hechos.length, items: hechos, id_accion: e.id };
    fallo.pendientes = pendientes;
    fallo.message = String(fallo.message || fallo) + ' Lo que alcancé (' + hechos.length + ' de ' + n + ') quedó en Actividad con Deshacer (' + e.id + ').';
    throw fallo;
  }
  return { n: n, omitidos: omitidos, hecho: e.texto, id_accion: e.id };
}

// Hilos que marcó leídos el sistema (por una política o por un resumen), con la hora: el análisis no los cuenta como
// abiertos, tampoco al recalcular el mes. Viven en la pestaña "Leídos por el sistema", sin tope de hilos, 40 días.
const LEIDOS_SISTEMA = { DIAS: 40, POR_FILA: 1200 };
function anotarLeidoSistema_(st, hilos, por) {
  por = por === 'resumen' ? 'resumen' : 'politica';
  const filas = st.get('leidos_sistema_filas', []);
  const viejo = st.get('leidos_sistema', null);
  if (viejo && Object.keys(viejo).length) { filas.push({ d: dia_(Date.now()), por: 'politica', h: Object.keys(viejo).map(h => [h, viejo[h]]) }); st.borrar('leidos_sistema'); }
  const t = Math.floor(Date.now() / 1000), d = dia_(Date.now());
  hilos.filter(Boolean).forEach(h => {
    let u = filas.filter(f => f.d === d && f.por === por && f.h.length < LEIDOS_SISTEMA.POR_FILA).pop();
    if (!u) { u = { d: d, por: por, h: [] }; filas.push(u); }
    u.h.push([h, t]);
  });
  const lim = dia_(Date.now() - LEIDOS_SISTEMA.DIAS * 86400000);
  st.set('leidos_sistema_filas', filas.filter(f => f.d >= lim));
}
// {hilo: {t, por}} con la última vez que el sistema marcó leído cada hilo.
function leidosSistema_(st) {
  const m = {};
  st.get('leidos_sistema_filas', []).forEach(f => f.h.forEach(x => { if (!m[x[0]] || x[1] > m[x[0]].t) m[x[0]] = { t: x[1], por: f.por }; }));
  const viejo = st.get('leidos_sistema', null) || {};
  Object.keys(viejo).forEach(h => { if (!m[h]) m[h] = { t: viejo[h], por: 'politica' }; });
  return m;
}

// ---------- deshacer(id) ----------
// Por el conector, deshacer no hace lo que pediría su sí: no deshace lo que hizo la persona, no sube, no enciende ni
// ensancha una regla, no baja ni quita una que ella pidió o que protege, y no saca nada de spam (eso va por sacar_de_spam,
// con sus límites). Desde la web app la persona deshace sin límites.
// Una rutina deshace solo lo que hizo una rutina: líneas con rut, y en un grupo todas sus líneas. Lo del motor que nace de
// una decisión de ella (Bandeja limpia, lo anterior que eligió, lo que aceptó en la web app) y lo ligado a su aviso de
// consentimiento quedan fuera.
function rutinaPuedeDeshacer_(st, e) {
  if (!e || !e.rut) return false;
  if (st.get('avisos_consentimiento', []).some(x => x.id_accion === e.id)) return false;
  if (e.d && e.d.tipo === 'grupo') { const a = st.get('actividad', []); return (e.d.ids || []).every(id => { const x = a.filter(y => y.id === id)[0]; return !x || x.u || rutinaPuedeDeshacer_(st, x); }); }
  return true;
}
function noDeshacePorConector_(st, e) {
  if (VIA === 'webapp' || !e || !e.d) return null;
  if (e.actor === 'persona') return 'lo hizo la persona: lo deshace ella desde la web app';
  if (typeof enRutina_ === 'function' && enRutina_() && !rutinaPuedeDeshacer_(st, e)) return 'no lo hizo una rutina: lo deshace ella desde la web app';
  const a = st.get('actividad', []), pols = listaPoliticas_(st);
  const hojas = d => !d ? [] : d.tipo === 'varios' ? [].concat.apply([], d.partes.map(hojas)) :
    d.tipo === 'grupo' ? [].concat.apply([], d.ids.map(id => { const x = a.filter(y => y.id === id)[0]; return x && !x.u && x.d ? hojas(x.d) : []; })) : [d];
  const prendida = x => !!x && x.estado === 'activa' && x.nivel !== 'apagado';
  for (const d of hojas(e.d)) {
    // Por Claude o por una rutina, Deshacer no borra lo que ella decidió después sobre lo mismo.
    const dp = decisionPosterior_(st, a, e, d);
    if (dp) return 'después ' + dp + ', y restaurar lo de antes borraría esa decisión';
    if (d.tipo === 'spam') return 'regresar de spam va con sacar_de_spam y sus límites, o lo hace ella desde la web app';
    if (d.tipo === 'politica_nueva') { const p = pols.filter(x => x.id === d.id)[0]; if (p && p.origen !== 'catalogo' && suyaOProtege_(p)) return '«' + p.nombre + '» la pidió la persona o protege su correo: quitarla es retirarla y pide su sí'; }
    if (d.tipo === 'politica' || d.tipo === 'politica_nivel') {
      const p = pols.filter(x => x.id === (d.id || (d.antes && d.antes.id)))[0], antes = d.antes || {};
      if (!p) continue;
      const nivelAntes = antes.nivel !== undefined ? antes.nivel : p.nivel, estadoAntes = antes.estado !== undefined ? antes.estado : p.estado;
      const sube = rangoNivel_(nivelAntes) > rangoNivel_(p.nivel) || (prendida({ nivel: nivelAntes, estado: estadoAntes }) && !prendida(p));
      const ensancha = d.tipo === 'politica' && !!antes.compilado && angosta_(antes.compilado, p.compilado);
      const baja = rangoNivel_(nivelAntes) < rangoNivel_(p.nivel) || (prendida(p) && !prendida({ nivel: nivelAntes, estado: estadoAntes })) || (d.tipo === 'politica' && !!antes.compilado && angosta_(p.compilado, antes.compilado));
      if (sube || ensancha) return 'subir, encender o ensanchar «' + p.nombre + '» pide su sí: déjalo como propuesta';
      // Regresar lo que subió con sus palabras (el Deshacer de su aviso) no baja algo que ella pidió antes.
      const deSuAviso = st.get('avisos_consentimiento', []).some(x => x.id_accion === e.id);
      if (baja && suyaOProtege_(p) && !deSuAviso) return '«' + p.nombre + '» la pidió la persona o protege su correo: bajarla o angostarla pide su sí';
    }
  }
  return null;
}
// La decisión de ella posterior a una acción, sobre lo mismo que restauraría su Deshacer (d, o una de sus partes): la parte
// de su memoria o la regla. La usan Deshacer de uno, de varios y de una línea, por noDeshacePorConector_.
function decisionPosterior_(st, a, e, d) {
  d = d || e.d || {};
  const i = a.findIndex(x => x.id === e.id), luego = i > 0 ? a.slice(0, i) : [];
  if (d.tipo === 'memoria') return luego.some(x => x.actor === 'persona' && ((x.d && x.d.tipo === 'memoria' && x.d.parte === d.parte) || x.objeto === 'memoria:' + d.parte)) ? 'ella cambió su ' + d.parte : null;
  const pid = d.tipo === 'politica' ? d.antes && d.antes.id : (d.tipo === 'politica_nueva' || d.tipo === 'politica_nivel') ? d.id : null;
  if (!pid) return null;
  const p = listaPoliticas_(st).filter(x => x.id === pid)[0];
  const suya = luego.some(x => x.actor === 'persona' && (x.politica === pid || x.objeto === 'politica:' + pid));
  return suya || (p && p.aprobada && p.aprobada > e.t) ? 'ella aceptó o cambió «' + (p ? p.nombre : pid) + '»' : null;
}
function deshacer_(st, id) {
  const a = st.get('actividad', []);
  const e = a.filter(x => x.id === id)[0];
  if (!e) throw new Error('No hay una acción ' + id + '. Usa ver_hechos("actividad") para ver los ids.');
  if (!e.d) throw new Error('La acción ' + id + ' («' + e.texto + '») no tiene deshacer.');
  if (e.u) return { hecho: 'La acción ' + id + ' ya se deshizo el ' + fecha_(e.u) + '.', deshecho: id, repetida: true };
  if (Date.now() - e.t > COS.DIAS_DESHACER * 86400000) throw new Error('Pasaron más de 30 días; esa acción ya no se puede deshacer.');
  // Deshacer por Claude o por una rutina no borra lo que ella decidió después: si cambió esa parte de su memoria, o aceptó
  // o cambió esa regla, después de esta acción, restaurar lo de antes borraría su decisión. Va antes que las demás
  // razones para responder sin_cambio; las partes de un grupo las revisa noDeshacePorConector_.
  const despues = VIA !== 'webapp' && e.d && e.actor !== 'persona' ? decisionPosterior_(st, a, e) : null;
  if (despues) return { hecho: 'No deshice «' + corto_(e.texto, 100) + '»: después ' + despues + ', y restaurar lo de antes borraría esa decisión. Si quiere el cambio, que lo haga ella.', sin_cambio: true, deshecho: null, id: id };
  const noVa = noDeshacePorConector_(st, e);
  if (noVa) throw new Error('No deshago «' + corto_(e.texto, 100) + '»: ' + noVa + '.');
  const ver = deshacerDatos_(st, e.d);
  e.u = Date.now();
  // Lo que el motor hizo solo y la persona deshace cuenta como corregido para esa política.
  if (e.politica && e.actor === 'motor' && !e.cf) { e.cf = 1; sumarMetrica_(st, e.politica, 'c'); }
  st.set('actividad', a);
  if (actor_() !== 'motor') anotarSenal_(st, { tipo: 'deshizo', politica: e.politica, detalle: id + ': ' + corto_(e.texto, 120) });
  const nueva = anotar_(st, { texto: 'Deshice: ' + e.texto, politica: e.politica });
  cerrarAvisoConsentimiento_(st, id, 'deshecho');
  return { hecho: 'Deshice: ' + e.texto, id_accion: nueva.id, deshecho: id, verificacion: ver };
}

// ---------- deshacer de una línea de Hoy o de una lista de ids ----------
// Una línea («Aparté 250 de publicidad.») junta cientos de acciones. Se deshacen en una sola ejecución: un guardado, una
// entrada en Actividad y una señal. Los movimientos iguales (misma etiqueta, bandeja y leído) se regresan juntos en lotes.
// Lo que no cabe en el tiempo queda en quedan: la siguiente llamada con el mismo id sigue donde se quedó.
const DESHACER = { LOTE_MENSAJES: 500, LOTE_ACCIONES: 200, MS_MAXIMO: 240000, MAX_IDS: 10000 };

// Las acciones de una línea: aviso|<política>|v<ms> (desde esa visita) o aviso|<política>|AAAA-MM-DD (avisos del día).
function idsDeLinea_(st, id) {
  const x = String(id).split('|');
  const politica = x[1], dia = x[2] || '';
  const t0 = /^v\d+$/.test(dia) ? Number(dia.slice(1)) : null;
  if (!politica || (t0 === null && !/^\d{4}-\d{2}-\d{2}$/.test(dia))) throw new Error('El id de la línea es aviso|<política>|v<ms> o aviso|<política>|AAAA-MM-DD (llegó ' + id + ').');
  const ids = st.get('actividad', []).filter(e => e.politica === politica && e.d && !e.u &&
    (t0 !== null ? e.t > t0 && e.actor !== 'persona' : e.aviso && dia_(e.t) === dia)).map(e => e.id);
  const pod = t0 !== null ? ((st.get('actividad_podada', {}) || {})[t0] || {})[politica] : null;
  return { ids: ids, politica: politica, sin_deshacer: pod && pod[0] || 0 };
}

function deshacerVarios_(st, ids, linea) {
  const t0 = Date.now();
  if (ids.length > DESHACER.MAX_IDS) throw new Error('Van hasta ' + DESHACER.MAX_IDS + ' ids por llamada (llegaron ' + ids.length + ').');
  const a = st.get('actividad', []);
  const porId = {};
  a.forEach(e => { porId[e.id] = e; });
  const omitidas = [], listas = [];
  ids.forEach(id => {
    const e = porId[id];
    if (!e) omitidas.push({ id: id, motivo: 'no está en Actividad' });
    else if (!e.d) omitidas.push({ id: id, motivo: 'no tiene deshacer' });
    else if (e.u) omitidas.push({ id: id, motivo: 'ya se deshizo' });
    else if (t0 - e.t > COS.DIAS_DESHACER * 86400000) omitidas.push({ id: id, motivo: 'pasaron más de 30 días' });
    else if (noDeshacePorConector_(st, e)) omitidas.push({ id: id, motivo: noDeshacePorConector_(st, e) });
    else if (listas.indexOf(e) < 0) listas.push(e);
  });
  if (!listas.length && linea && !omitidas.length) return { hecho: 'Esa línea ya no tiene acciones por deshacer.', id: linea.id, repetida: true, sin_deshacer: linea.sin_deshacer || undefined };
  // Las hojas de cada acción: "varios" se abre en sus partes; "etiquetar" se junta con las iguales.
  const hojas = d => d.tipo === 'varios' ? [].concat.apply([], d.partes.map(hojas)) : [d];
  const hechas = [], quedan = [];
  let correos = 0;
  for (let i = 0; i < listas.length; i += DESHACER.LOTE_ACCIONES) {
    if (i && Date.now() - t0 > DESHACER.MS_MAXIMO) { listas.slice(i).forEach(e => quedan.push(e.id)); break; }
    const tanda = listas.slice(i, i + DESHACER.LOTE_ACCIONES);
    const juntas = {}, sueltas = [];
    tanda.forEach(e => hojas(e.d).forEach(d => {
      if (d.tipo !== 'etiquetar') { sueltas.push(d); return; }
      const k = (d.l || '') + '|' + (d.qi ? 1 : 0) + '|' + (d.qu ? 1 : 0);
      const g = juntas[k] = juntas[k] || { tipo: 'etiquetar', l: d.l, qi: d.qi, qu: d.qu, ms: [], caducidad: [] };
      g.ms = g.ms.concat(d.ms || []);
      if (d.caducidad) g.caducidad = g.caducidad.concat(d.caducidad);
    }));
    Object.keys(juntas).forEach(k => {
      const g = juntas[k];
      correos += g.ms.length;
      for (let j = 0; j < g.ms.length; j += DESHACER.LOTE_MENSAJES)
        deshacerDatos_(st, { tipo: 'etiquetar', l: g.l, qi: g.qi, qu: g.qu, ms: g.ms.slice(j, j + DESHACER.LOTE_MENSAJES), caducidad: j === 0 && g.caducidad.length ? g.caducidad : undefined });
    });
    sueltas.forEach(d => { correos += d.ms ? d.ms.length : 0; deshacerDatos_(st, d); });
    tanda.forEach(e => { e.u = Date.now(); hechas.push(e); });
  }
  // Lo que el motor hizo solo y la persona deshace cuenta como corregido para su política, una vez por acción.
  const corregidas = {};
  hechas.forEach(e => { if (e.politica && e.actor === 'motor' && !e.cf) { e.cf = 1; corregidas[e.politica] = (corregidas[e.politica] || 0) + 1; } });
  Object.keys(corregidas).forEach(p => sumarMetrica_(st, p, 'c', corregidas[p]));
  st.set('actividad', a);
  const pols = {};
  hechas.forEach(e => { if (e.politica) pols[e.politica] = 1; });
  const pol = Object.keys(pols).length === 1 ? Object.keys(pols)[0] : (linea ? linea.politica : undefined);
  const nombre = pol ? ((listaPoliticas_(st).filter(p => p.id === pol)[0] || {}).nombre || pol) : null;
  const texto = 'Deshice ' + hechas.length + ' acci' + (hechas.length === 1 ? 'ón' : 'ones') + (nombre ? ' de ' + nombre : '') + ' (' + correos + ' correo' + (correos === 1 ? '' : 's') + ').';
  let nueva = null;
  if (hechas.length) {
    if (actor_() !== 'motor') anotarSenal_(st, { tipo: 'deshizo', politica: pol, detalle: (linea ? linea.id : 'lista') + ': ' + hechas.length + ' acciones, ' + correos + ' correos' });
    nueva = anotar_(st, { texto: texto, politica: pol });
  }
  // La web app recibe los ids deshechos para marcarlos; en la plática bastan las cifras.
  return { hecho: hechas.length ? texto : 'No había acciones por deshacer.', id_accion: nueva ? nueva.id : undefined, deshechas: hechas.length, correos: correos,
    ids: VIA === 'webapp' ? hechas.map(e => e.id) : undefined,
    omitidas: omitidas.length ? omitidas.slice(0, 20) : undefined, omitidas_total: omitidas.length > 20 ? omitidas.length : undefined,
    quedan: quedan.length || undefined, siguiente: quedan.length ? 'No alcanzó el tiempo: llama otra vez a deshacer con el mismo id; sigue donde se quedó.' : undefined,
    sin_deshacer: linea && linea.sin_deshacer ? linea.sin_deshacer : undefined,
    nota_sin_deshacer: linea && linea.sin_deshacer ? linea.sin_deshacer + ' correos de esta línea ya salieron de Actividad (más de 30 días) y no se pueden deshacer.' : undefined };
}

function deshacerLinea_(st, id) {
  const l = idsDeLinea_(st, id);
  return deshacerVarios_(st, l.ids, { id: id, politica: l.politica, sin_deshacer: l.sin_deshacer });
}

function deshacerDatos_(st, d) {
  if (d.tipo === 'varios') return d.partes.map(p => deshacerDatos_(st, p));
  if (d.tipo === 'bandeja_inicial') return deshacerBandejaInicial_(st);
  // Caducó sin moverse (sin leer, sin carpeta): Deshacer lo regresa a Hoy y bloquea repetirla hasta el siguiente repaso.
  if (d.tipo === 'caducidad') { const j = st.get('juicios', {}); d.caducidad.forEach(h => { if (j[h]) { j[h].caducidad_deshecha = Date.now(); delete j[h].caducado; } }); st.set('juicios', j); return { hilos: d.caducidad.length }; }
  // Un grupo (aplicar un plan por páginas) deshace cada acción que juntó, salvo las ya deshechas.
  if (d.tipo === 'grupo') {
    const a = st.get('actividad', []);
    return d.ids.map(id => {
      const x = a.filter(y => y.id === id)[0];
      if (!x || x.u || !x.d) return { id: id, omitida: true };
      const v = deshacerDatos_(st, x.d);
      x.u = Date.now();
      return { id: id, verificacion: v };
    });
  }
  if (d.tipo === 'etiquetar') {
    // Solo se cambia lo que falta: si la persona ya lo regresó a mano, no queda huella falsa.
    const est0 = estadoMensajes_(d.ms.map(x => x[0]));
    const grupos = {};
    d.ms.forEach(x => {
      const l = est0[x[0]];
      if (!l) return;
      const k = (d.qi && x[1] && l.indexOf('INBOX') < 0 ? 'I' : '') + (d.qu && x[2] && l.indexOf('UNREAD') < 0 ? 'U' : '') + (d.l && !x[3] && l.indexOf(d.l) >= 0 ? 'L' : '');
      if (k) (grupos[k] = grupos[k] || []).push(x[0]);
    });
    Object.keys(grupos).forEach(k => {
      const ag = [];
      if (k.indexOf('I') >= 0) ag.push('INBOX');
      if (k.indexOf('U') >= 0) ag.push('UNREAD');
      modificar_(grupos[k], ag, k.indexOf('L') >= 0 ? [d.l] : []);
      if (k.indexOf('I') >= 0) huellas_(st, grupos[k], ['+INBOX']);
      if (k.indexOf('U') >= 0) huellas_(st, grupos[k], ['+UNREAD']);
    });
    if (d.qi) { const mov = st.get('movidos', {}); d.ms.forEach(x => { delete mov[x[0]]; }); st.set('movidos', mov); }
    // Deshacer una caducidad le enseña a Opus y la bloquea hasta el siguiente repaso.
    if (d.caducidad) { const j = st.get('juicios', {}); [].concat(d.caducidad).forEach(h => { if (j[h]) { j[h].caducidad_deshecha = Date.now(); delete j[h].caducado; } }); st.set('juicios', j); }
    const est = estadoMensajes_(d.ms.map(x => x[0]));
    const ok = d.ms.every(x => {
      const l = est[x[0]] || [];
      return (!d.l || x[3] || l.indexOf(d.l) < 0) && (!d.qi || (l.indexOf('INBOX') >= 0) === !!x[1]) && (!d.qu || (l.indexOf('UNREAD') >= 0) === !!x[2]);
    });
    return { mensajes: d.ms.length, todo_regreso: ok, cambiados: Object.keys(grupos).reduce((a, k) => a + grupos[k].length, 0) };
  }
  if (d.tipo === 'papelera') {
    const ids = d.ms.map(x => x[0]);
    if (d.hilo) conReintento_(() => Gmail.Users.Threads.untrash('me', d.hilo));
    else ids.forEach(id => conReintento_(() => Gmail.Users.Messages.untrash('me', id)));
    huellas_(st, ids, ['-TRASH']);
    const mov = st.get('movidos', {});
    ids.forEach(id => { delete mov[id]; });
    st.set('movidos', mov);
    // Gmail no siempre regresa la etiqueta de bandeja al sacar de la papelera: se restaura el estado anotado.
    const est1 = estadoMensajes_(ids);
    const grupos = {};
    d.ms.forEach(x => {
      const l = est1[x[0]] || [];
      const k = (x[1] && l.indexOf('INBOX') < 0 ? 'I' : '') + (x[2] && l.indexOf('UNREAD') < 0 ? 'U' : '');
      if (k) (grupos[k] = grupos[k] || []).push(x[0]);
    });
    Object.keys(grupos).forEach(k => { const ag = []; if (k.indexOf('I') >= 0) ag.push('INBOX'); if (k.indexOf('U') >= 0) { ag.push('UNREAD'); huellas_(st, grupos[k], ['+UNREAD']); } modificar_(grupos[k], ag, []); });
    huellas_(st, d.ms.filter(x => x[1]).map(x => x[0]), ['+INBOX']);
    const est = estadoMensajes_(ids);
    const ok = d.ms.every(x => { const l = est[x[0]] || []; return l.indexOf('TRASH') < 0 && (l.indexOf('INBOX') >= 0) === !!x[1] && (l.indexOf('UNREAD') >= 0) === !!x[2]; });
    return { mensajes: d.ms.length, todo_regreso: ok };
  }
  if (d.tipo === 'spam') {
    const ids = d.ms.map(x => x[0]);
    const conBandeja = d.ms.filter(x => x[1]).map(x => x[0]);
    const sinBandeja = d.ms.filter(x => !x[1]).map(x => x[0]);
    if (conBandeja.length) { modificar_(conBandeja, ['INBOX'], ['SPAM']); huellas_(st, conBandeja, ['+INBOX']); }
    if (sinBandeja.length) modificar_(sinBandeja, [], ['SPAM']);
    const mov = st.get('movidos', {});
    ids.forEach(id => { delete mov[id]; });
    st.set('movidos', mov);
    const est = estadoMensajes_(ids);
    return { mensajes: ids.length, todo_regreso: d.ms.every(x => { const l = est[x[0]] || []; return l.indexOf('SPAM') < 0 && (l.indexOf('INBOX') >= 0) === !!x[1]; }) };
  }
  if (d.tipo === 'no_spam') {
    const ids = d.ms.map(x => x[0]), sinBandeja = d.ms.filter(x => !x[1]).map(x => x[0]);
    modificar_(ids, ['SPAM'], []);
    if (sinBandeja.length) { modificar_(sinBandeja, [], ['INBOX']); huellas_(st, sinBandeja, ['-INBOX']); }
    huellas_(st, ids, ['+SPAM']);
    const est = estadoMensajes_(ids);
    return { mensajes: ids.length, todo_regreso: d.ms.every(x => { const l = est[x[0]] || []; return l.indexOf('SPAM') >= 0 && (l.indexOf('INBOX') >= 0) === !!x[1]; }) };
  }
  if (d.tipo === 'borrador') {
    let dr;
    try { dr = Gmail.Users.Drafts.get('me', d.dr, { format: 'minimal' }); }
    catch (e) { return { borrador: 'ya no existía' }; }
    if (dr.message && dr.message.id !== d.mm) throw new Error('El borrador se editó después de crearlo; no lo borro. Si ya no lo quieres, bórralo desde Gmail.');
    Gmail.Users.Drafts.remove('me', d.dr);
    st.set('borradores_motor', st.get('borradores_motor', []).filter(b => b.dr !== d.dr));
    return { borrador_borrado: true };
  }
  if (d.tipo === 'memoria') { const m = st.get('memoria', {}); if (d.antes) m[d.parte] = d.antes; else delete m[d.parte]; st.set('memoria', m); return { restaurado: d.parte }; }
  if (d.tipo === 'cuaderno') { st.set('cuaderno', st.get('cuaderno', []).filter(c => c.id !== d.id)); return { leccion_quitada: d.id }; }
  if (d.tipo === 'cuaderno_reemplazo') { const a = st.get('cuaderno_anterior', null); if (!a) throw new Error('No guardé el cuaderno anterior.'); st.set('cuaderno', a.lecciones); return { cuaderno: 'restaurado' }; }
  if (d.tipo === 'fichas') return deshacerFichas_(st, d);
  if (d.tipo === 'politica_nueva') { st.set('politicas', listaPoliticas_(st).filter(p => p.id !== d.id || p.origen === 'catalogo')); return { politica_quitada: d.id }; }
  if (d.tipo === 'politica') { st.set('politicas', listaPoliticas_(st).map(p => p.id === d.antes.id ? d.antes : p)); return { politica_restaurada: d.antes.id, version: d.antes.version }; }
  if (d.tipo === 'politica_nivel') {
    const l = listaPoliticas_(st); const p = l.filter(x => x.id === d.id)[0];
    if (p) { p.nivel = d.antes.nivel; p.estado = d.antes.estado; p.aprobada = d.antes.aprobada; st.set('politicas', l); }
    return { politica: d.id, nivel: d.antes.nivel, estado: d.antes.estado };
  }
  if (d.tipo === 'juicio') { const j = st.get('juicios', {}); if (d.antes) j[d.hilo] = d.antes; else delete j[d.hilo]; st.set('juicios', j); return { juicio: d.antes ? 'restaurado' : 'quitado' }; }
  if (d.tipo === 'seguimiento') { st.set('seguimientos', st.get('seguimientos', []).filter(s => s.id !== d.id)); return { seguimiento_quitado: d.id }; }
  if (d.tipo === 'seguimiento_cerrado') { st.set('seguimientos', st.get('seguimientos', []).filter(s => s.id !== d.antes.id).concat([d.antes])); return { seguimiento_reabierto: d.antes.id }; }
  if (d.tipo === 'pausa') { st.set('pausa', d.antes || null); return { pausado: !!(d.antes && d.antes.activo) }; }
  if (d.tipo === 'conservar') { const j = st.get('juicios', {}); if (j[d.hilo]) { if (d.antes === null) delete j[d.hilo]; else j[d.hilo].conservar = d.antes || undefined; st.set('juicios', j); } return { conservar: false }; }
  throw new Error('Deshacer desconocido: ' + d.tipo);
}

// Antes de mover el primer correo, el historial de Gmail necesita su punto de partida: sin él, la primera corrida
// lee solo los últimos días y no ve un rescate hecho entre la acción y esa corrida.
function fijarHistorial_(st) {
  if (st.get('historyId', null)) return;
  st.set('historyId', String(conReintento_(() => Gmail.Users.getProfile('me')).historyId));
  st.set('huellas', {});
}

// ---------- actuar(id_hilo, accion, carpeta): lo que pide la persona sobre un hilo ----------
// Con politica no es pedido de la persona: lo que nunca se limpia se queda y lo sin leer nunca se archiva. El spam de
// Protección es el juicio de fraude de Opus: el aviso falso de suspensión o de seguridad sí va a spam.
const SPAM_RESCATE = { LLAMADA: 5, DIA: 20 };
// Un aviso de acceso trae, en el asunto o en el juicio de Opus, una frase de esta lista cerrada: «código de verificación»,
// «código de acceso», «código de seguridad», «inicio de sesión», «iniciaste sesión», «nuevo inicio», «nuevo dispositivo»,
// «dispositivo nuevo», «contraseña», «verifica tu cuenta», «verificación en dos pasos», o «verification code», «sign-in»,
// «new device», «password». «Código» o «dispositivo» sueltos no bastan, y el remitente tampoco: un cobro, un pedido o un
// contrato con un código se quedan en Recibidos.
const RX_AVISO_ACCESO = /\b(codigos? de (verificacion|acceso|seguridad)|inicios? de sesion|iniciaste sesion|nuevo inicio|nuevo dispositivo|dispositivo nuevo|contrasenas?|verifica tu cuenta|verificacion en dos pasos|verification codes?|sign-in|new device|passwords?)\b/;
function avisoDeSeguridad_(asunto, correo, js) {
  const t = x => sinAcentos_(String(x || '')).toLowerCase();
  if (RX_AVISO_ACCESO.test(t(asunto))) return true;
  return !!js && !js.vencido && RX_AVISO_ACCESO.test(t([js.motivo, js.recomendacion, js.resumen].join(' ')));
}
function actuar_(st, hilo, accion, carpeta, politica) {
  hilo = argTexto_(hilo, 'id_hilo');
  accion = sinAcentos_(String(accion || '')).trim().toLowerCase();
  if (['mover', 'archivar', 'papelera', 'spam', 'sacar_de_spam', 'leido', 'importante', 'enterado', 'conservar'].indexOf(accion) < 0) throw new Error('accion vale mover, archivar, papelera, spam, sacar_de_spam, leido, importante, enterado o conservar.');
  if (accion === 'conservar') return conservar_(st, hilo);
  if (accion === 'sacar_de_spam' && politica) throw new Error('sacar_de_spam va sin politica: es un rescate de un aviso legítimo que Gmail mandó a spam.');
  fijarHistorial_(st);
  const t = conReintento_(() => Gmail.Users.Threads.get('me', hilo, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Authentication-Results', 'List-Unsubscribe'] }));
  const ms = sinBorradores_(t.messages);
  if (!ms.length) throw new Error('El hilo ' + hilo + ' no tiene mensajes.');
  const asunto = corto_(cabeceras_(ms[0]).subject || '(sin asunto)', 80);
  const recibidos = ms.filter(m => !tiene_(m, 'SENT'));
  if (politica && ['mover', 'archivar', 'papelera', 'spam', 'leido'].indexOf(accion) >= 0 && !(accion === 'spam' && politica.id === 'proteccion')) {
    const protegido = protegidoDeLimpiar_(ms.map(metadatoDe_), Date.now(), st) || (accion === 'archivar' && ms.some(m => tiene_(m, 'INBOX') && tiene_(m, 'UNREAD')) ? 'sin leer' : null);
    if (protegido) return { hecho: '«' + asunto + '» se queda en Recibidos (' + protegido + '): con una regla no se mueve.', id_hilo: hilo, sin_cambio: true, protegido: protegido };
  }
  const de = nombreDe_(cabeceras_((recibidos.length ? recibidos : ms)[(recibidos.length ? recibidos : ms).length - 1]).from);
  const estados = {};
  ms.forEach(m => { estados[m.id] = m.labelIds || []; });
  let d, texto, ids;
  if (accion === 'papelera') {
    if (ms.every(m => tiene_(m, 'TRASH'))) return { hecho: 'Ese hilo ya estaba en la papelera.', id_hilo: hilo, sin_cambio: true };
    ids = ms.map(m => m.id);
    d = { tipo: 'papelera', hilo: hilo, ms: ms.map(m => [m.id, tiene_(m, 'INBOX') ? 1 : 0, tiene_(m, 'UNREAD') ? 1 : 0]) };
    conReintento_(() => Gmail.Users.Threads.trash('me', hilo));
    huellas_(st, ids, ['+TRASH']);
    huellas_(st, d.ms.filter(x => x[1]).map(x => x[0]), ['-INBOX']);
    marcarMovidos_(st, ids, 'Papelera');
    texto = 'Mandé a la papelera «' + asunto + '» de ' + de + '. Se recupera en 30 días.';
  } else if (accion === 'spam') {
    ids = ms.filter(m => !tiene_(m, 'SPAM')).map(m => m.id);
    if (!ids.length) return { hecho: 'Ese hilo ya estaba en spam.', id_hilo: hilo, sin_cambio: true };
    d = spamMensajes_(st, ids, estados);
    // Lo que manda Protección nunca lo saca el conector: lo regresa ella desde la web app.
    if (politica && politica.id === 'proteccion') { const sp = st.get('spam_proteccion', {}); sp[hilo] = Date.now(); const ks = Object.keys(sp); if (ks.length > 3000) ks.sort((x, y) => sp[x] - sp[y]).slice(0, ks.length - 3000).forEach(k => { delete sp[k]; }); st.set('spam_proteccion', sp); }
    texto = 'Mandé a spam «' + asunto + '» de ' + de + '; también le enseña al filtro de Gmail.';
  } else if (accion === 'sacar_de_spam') {
    ids = ms.filter(m => tiene_(m, 'SPAM')).map(m => m.id);
    if (!ids.length) return { hecho: 'Ese hilo no está en spam.', id_hilo: hilo, sin_cambio: true };
    // Por el conector solo sale lo que se puede verificar: SPF o DKIM alineados con el From, sin ninguna falla, de un
    // remitente conocido (ella le escribió, tiene ficha o tuvo historia en Recibidos; un juicio de Opus no basta), sin juicio de riesgo, ruido o fraude, que
    // no haya mandado Protección y hasta SPAM_RESCATE.DIA hilos al día. La persona en la web app sí lo saca.
    if (VIA !== 'webapp') {
      const enSpam = ms.filter(m => tiene_(m, 'SPAM') && !tiene_(m, 'SENT'));
      const auth = enSpam.map(m => String(cabeceras_(m)['authentication-results'] || '').toLowerCase()).join(' ');
      const j = st.get('juicios', {})[hilo];
      const dudosos = st.get('remitentes_dudosos', {}), conocido = x => conocidoPorElla_(st, x);
      const hoy = st.get('rescates_spam', {});
      const fraude = j && (j.prioridad === 'riesgo' || j.prioridad === 'ruido' || (j.opciones || []).some(o => o && o.recomendada && String(o.accion || '').toLowerCase() === 'spam'));
      const porque = st.get('spam_proteccion', {})[hilo] ? 'lo mandó a spam Protección; si fue un error, lo regresa la persona desde la web app'
        : fraude ? 'el juicio es de ' + (j.prioridad === 'riesgo' || j.prioridad === 'ruido' ? j.prioridad : 'fraude')
        : /\b(spf|dkim|dmarc)=(fail|softfail|permerror)/.test(auth) ? 'su autenticación falló'
        : !enSpam.every(m => autenticadoAlineado_(cabeceras_(m)['authentication-results'], cabeceras_(m).from)) ? 'su autenticación no se puede verificar con el dominio del remitente'
        : enSpam.some(m => dudosos[correo_(cabeceras_(m).from)]) ? 'a ese remitente lo juzgué ruido, riesgo o fraude'
        : !enSpam.every(m => conocido(correo_(cabeceras_(m).from))) ? 'el remitente es nuevo: la persona no le escribe, no tiene ficha ni historia en Recibidos'
        : hoy.dia === dia_(Date.now()) && hoy.n >= SPAM_RESCATE.DIA ? 'hoy ya saqué ' + SPAM_RESCATE.DIA + ' hilos de spam, el tope del día' : null;
      if (porque) return { hecho: '«' + asunto + '» se queda en spam: ' + porque + '. Si la persona lo reconoce, lo saca desde Gmail o la web app.', id_hilo: hilo, sin_cambio: true, sospechoso: true };
      st.set('rescates_spam', { dia: dia_(Date.now()), n: (hoy.dia === dia_(Date.now()) ? hoy.n : 0) + 1 });
    }
    d = sacarDeSpam_(st, ids, estados);
    texto = 'Saqué de spam «' + asunto + '» de ' + de + ': lo regresé a Recibidos.';
  } else if (accion === 'mover') {
    const rel = normalizarCarpeta_(carpeta);
    const enBandeja = ms.filter(m => tiene_(m, 'INBOX'));
    const objetivo = enBandeja.length ? enBandeja : ms;
    // Avisos de acceso y seguridad con la decisión seguridad en carpeta: van leídos a su carpeta. Lo que
    // Opus juzgó media o más, o con tema sensible, se queda sin leer y en Hoy; la persona desde la web app sí lo mueve.
    const seg = rel.toLowerCase() === MEMORIA.CARPETA_SEGURIDAD.toLowerCase() && ((experiencia_(st) || {}).decisiones || {}).seguridad === 'carpeta';
    const js = seg ? st.get('juicios', {})[hilo] : null;
    if (seg && VIA !== 'webapp' && js && !js.vencido && (['media', 'alta', 'riesgo'].indexOf(js.prioridad) >= 0 || js.sensible))
      return { hecho: '«' + asunto + '» se queda en Recibidos sin leer: el juicio es ' + js.prioridad + (js.sensible ? ' con tema ' + js.sensible : '') + ' y ese aviso va a Hoy.', id_hilo: hilo, sin_cambio: true };
    // A esa carpeta van solo avisos de acceso y seguridad: lo dice su asunto, el juicio de Opus o un remitente de seguridad.
    // Desde una rutina, lo demás se queda donde está; en la plática lo pidió la persona, pero no se marca leído.
    const esAviso = seg && avisoDeSeguridad_(asunto, correo_(cabeceras_(ms[ms.length - 1]).from), js);
    if (seg && VIA !== 'webapp' && !politica && !esAviso && enRutina_())
      return { hecho: '«' + asunto + '» se queda en Recibidos sin leer: no es un aviso de acceso o seguridad.', id_hilo: hilo, sin_cambio: true };
    const etId = idEtiquetaCos_(rel);
    if (!enBandeja.length && objetivo.every(m => tiene_(m, etId))) return { hecho: 'Ese hilo ya estaba en ' + rel + '.', id_hilo: hilo, sin_cambio: true };
    ids = objetivo.map(m => m.id);
    const leerSeg = seg && (esAviso || VIA === 'webapp' || !!politica) && objetivo.some(m => tiene_(m, 'UNREAD'));
    d = etiquetar_(st, ids, estados, etId, true, leerSeg, rel);
    texto = 'Moví «' + asunto + '» de ' + de + ' a ' + rel + (leerSeg ? ', leído' : '') + '.';
  } else if (accion === 'archivar') {
    ids = ms.filter(m => tiene_(m, 'INBOX')).map(m => m.id);
    if (!ids.length) return { hecho: 'Ese hilo ya no estaba en la bandeja.', id_hilo: hilo, sin_cambio: true };
    d = etiquetar_(st, ids, estados, null, true, false, null);
    texto = 'Archivé «' + asunto + '» de ' + de + '. Sigue en Todos y en la búsqueda.';
  } else if (accion === 'enterado') {
    return enterarse_(st, [hilo], null, false);
  } else if (accion === 'leido') {
    ids = ms.filter(m => tiene_(m, 'UNREAD')).map(m => m.id);
    if (!ids.length) return { hecho: 'Ese hilo ya estaba leído.', id_hilo: hilo, sin_cambio: true };
    d = etiquetar_(st, ids, estados, null, false, true, null);
    texto = 'Marqué como leído «' + asunto + '» de ' + de + '.';
  } else {
    ids = ms.filter(m => !tiene_(m, 'IMPORTANT')).map(m => m.id);
    if (!ids.length) return { hecho: 'Ese hilo ya estaba marcado como importante.', id_hilo: hilo, sin_cambio: true };
    d = etiquetar_(st, ids, estados, 'IMPORTANT', false, false, null);
    texto = 'Marqué como importante «' + asunto + '» de ' + de + '.';
  }
  const e = anotar_(st, { texto: texto, d: d });
  return { hecho: e.texto, id_accion: e.id, id_hilo: hilo, mensajes: ids.length, borrado_definitivo: false };
}

// Enterarse cuenta como leer: solo con un resumen completo de Opus vigente, y solo los mensajes que resumió (uno nuevo
// queda sin leer). En lote, lo sensible se confirma uno por uno. Un lote deja una sola línea en Actividad con Deshacer
// y la señal leido_por_resumen por hilo, que nunca cuenta como que la persona lo abrió.
function enterarse_(st, hilos, canal, lote) {
  const juicios = st.get('juicios', {});
  const res = [], validos = [];
  hilos.forEach(h => {
    const j = juicios[h];
    if (!j || j.vencido || !j.resumen_completo) return res.push({ id_hilo: h, error: 'Ese hilo no tiene un resumen completo vigente: léelo en Gmail o pídele el resumen a Opus.' });
    if (lote && hilos.length > 1 && j.sensible) return res.push({ id_hilo: h, error: 'Es de ' + j.sensible + ': lo sensible se confirma uno por uno.' });
    validos.push(h);
  });
  if (!lote && !validos.length) throw new Error(res[0].error);
  const datos = validos.length ? gmailFetchAll_(validos.map(h => 'threads/' + h + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=messages(id,threadId,labelIds,snippet,internalDate,payload/headers)'), 25) : [];
  const ids = [], estados = {}, hechos = [];
  validos.forEach((h, k) => {
    const t = datos[k];
    if (!t || !t.messages) return res.push({ id_hilo: h, error: 'No pude leer el hilo; intenta otra vez.' });
    const md = sinBorradores_(t.messages).map(metadatoDe_);
    const j = juicios[h];
    const hasta = md.filter(m => m.id === j.ultimo)[0];
    const tope = hasta ? Number(hasta.internalDate) : j.ultimo ? Number(md[md.length - 1].internalDate) : Math.min(j.t, Number(md[md.length - 1].internalDate));
    const suyos = md.filter(m => tiene_(m, 'UNREAD') && Number(m.internalDate) <= tope);
    const nuevos = md.filter(m => tiene_(m, 'UNREAD') && Number(m.internalDate) > tope).length;
    if (!suyos.length) return res.push({ id_hilo: h, hecho: 'Ya estaba leído.', sin_cambio: true, quedan_sin_leer: nuevos || undefined });
    suyos.forEach(m => { ids.push(m.id); estados[m.id] = m.labelIds || []; });
    const rec = md.filter(m => !tiene_(m, 'SENT'));
    const ult = (rec.length ? rec : md)[(rec.length ? rec : md).length - 1];
    hechos.push({ h: h, de: correo_(ult.h['From']), as: md[0].h['Subject'] || '(sin asunto)' });
    res.push({ id_hilo: h, mensajes: suyos.length, quedan_sin_leer: nuevos || undefined });
  });
  if (!ids.length) return lote ? { hecho: 'No había nada sin leer en esos resúmenes.', resultados: res } : Object.assign({ id_hilo: hilos[0] }, res[0], { hecho: res[0].error || 'Ese hilo ya estaba leído.' });
  fijarHistorial_(st);
  const d = etiquetar_(st, ids, estados, null, false, true, null);
  anotarLeidoSistema_(st, hechos.map(x => x.h), 'resumen');
  const can = canal ? String(canal).slice(0, 20) : (VIA === 'webapp' ? 'webapp' : 'claude');
  hechos.forEach(x => anotarSenal_(st, { tipo: 'leido_por_resumen', canal: can, id_hilo: x.h, remitente: x.de, asunto: x.as }));
  const texto = hechos.length === 1 ? 'Te enteraste de «' + corto_(hechos[0].as, 80) + '» por el resumen: lo marqué leído.' : 'Te enteraste por el resumen de ' + hechos.length + ' hilos: los marqué leídos.';
  const e = anotar_(st, { texto: texto, d: d });
  res.forEach(r => { if (r.mensajes) r.id_accion = e.id; });
  if (!lote) return { hecho: e.texto, id_accion: e.id, id_hilo: hilos[0], mensajes: ids.length, quedan_sin_leer: res[0].quedan_sin_leer, borrado_definitivo: false };
  const err = res.filter(r => r.error).length;
  return { hecho: e.texto + (err ? ' ' + err + ' con error.' : ''), id_accion: e.id, mensajes: ids.length, resultados: res };
}

// Conservar: lo opcional deja de caducar y Bandeja limpia no lo archiva.
function conservar_(st, hilo) {
  const j = st.get('juicios', {});
  if (j[hilo] && j[hilo].conservar) return { hecho: 'Ese hilo ya estaba para conservar.', id_hilo: hilo, sin_cambio: true };
  const antes = j[hilo] ? !!j[hilo].conservar : null;
  if (!j[hilo]) j[hilo] = { prioridad: 'media', recomendacion: '', t: Date.now(), por: 'persona', vencido: false };
  j[hilo].conservar = true;
  st.set('juicios', j);
  anotarSenal_(st, { tipo: 'conservo', canal: VIA === 'webapp' ? 'webapp' : 'claude', id_hilo: hilo });
  const e = anotar_(st, { texto: 'Lo conservo: no caduca ni se archiva solo.', objeto: hilo, d: { tipo: 'conservar', hilo: hilo, antes: antes } });
  return { hecho: e.texto, id_accion: e.id, id_hilo: hilo };
}

// Lo opcional caduca: sale de Hoy cuando Opus lo decidió o a las 72 horas (7 días si la persona eligió conservador; nunca
// si eligió que nada caduque). Lo leído se archiva; lo que sigue sin leer va a su carpeta sin marcar leído, porque nunca se
// archiva sin leer. Nunca lo debido: un riesgo, un tema sensible, una ficha alta o un seguimiento abierto. Una sola línea
// en Actividad por corrida, con Deshacer; deshacer una caducidad la bloquea hasta el siguiente repaso.
function caducaDe_(x, modo) {
  if (!x || !x.opcional || x.conservar || modo === 'nunca') return null;
  const base = x.caduca || x.t + HECHOS.HORAS_CADUCA * 3600000;
  return modo === 'conservador' ? Math.max(base, x.t + 7 * 86400000) : base;
}
function caducarOpcionales_(st, res) {
  const modo = decision_(st, 'caducidad');
  if (modo === 'nunca') return;
  const j = st.get('juicios', {});
  const rut = st.get('rutinas', {});
  const abiertos = {};
  st.get('seguimientos', []).filter(s => s.estado === 'abierto' && s.hilo).forEach(s => { abiertos[s.hilo] = 1; });
  const fichas = st.get('fichas', []);
  const ahora = Date.now();
  const toca = Object.keys(j).filter(h => {
    const x = j[h];
    if (!x.opcional || x.conservar || x.vencido || x.caducado || x.prioridad === 'riesgo' || x.sensible || abiertos[h]) return false;
    if (x.caducidad_deshecha && !(rut.repaso > x.caducidad_deshecha)) return false;
    return ahora >= caducaDe_(x, modo);
  }).slice(0, 25);
  if (!toca.length) return;
  const datos = gmailFetchAll_(toca.map(h => 'threads/' + h + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe&fields=messages(id,threadId,labelIds,snippet,internalDate,payload/headers)'), 25);
  const archivar = { ids: [], hilos: [] }, porCarpeta = {}, estados = {}, asuntos = [], enBandejaSinLeer = [], protegidos = [];
  const politicas = listaPoliticas_(st);
  toca.forEach((h, k) => {
    const t = datos[k];
    j[h].caducado = ahora;
    if (!t || !t.messages) return;
    const md = sinBorradores_(t.messages).map(metadatoDe_);
    const f = fichaDe_(fichas, correo_(md[md.length - 1].h['From']));
    if ((f.persona && f.persona.importancia === 'alta') || (f.organizacion && f.organizacion.importancia === 'alta')) { delete j[h].caducado; return; }
    const enBandeja = md.filter(m => tiene_(m, 'INBOX'));
    if (!enBandeja.length) return;
    md.forEach(m => { estados[m.id] = m.labelIds || []; });
    asuntos.push(md[0].h['Subject'] || '(sin asunto)');
    // Lo que nunca se limpia, y el código sin vencer, se queda en Recibidos y solo sale de Hoy.
    if (protegidoDeLimpiar_(md, ahora, st)) { protegidos.push(h); return; }
    if (!md.some(m => tiene_(m, 'UNREAD'))) { enBandeja.forEach(m => archivar.ids.push(m.id)); archivar.hilos.push(h); return; }
    // Sin leer nunca se archiva: va a la carpeta de su opción o de su política sin marcarse leído. Sin carpeta se queda
    // en Recibidos y solo sale de Hoy.
    const op = (j[h].opciones || []).filter(o => o.accion === 'mover' && o.carpeta)[0];
    const pol = j[h].politica ? politicas.filter(p => p.id === j[h].politica)[0] : null;
    const acc = pol ? (pol.acciones || []).filter(a => /^carpeta:/.test(a))[0] : null;
    const c = op ? normalizarCarpeta_(op.carpeta) : acc ? normalizarCarpeta_(acc.slice(8)) : null;
    if (!c) { enBandejaSinLeer.push(h); return; }
    const g = porCarpeta[c] = porCarpeta[c] || { ids: [], hilos: [] };
    enBandeja.forEach(m => g.ids.push(m.id));
    g.hilos.push(h);
  });
  st.set('juicios', j);
  const partes = [];
  if (archivar.ids.length || Object.keys(porCarpeta).length) fijarHistorial_(st);
  if (archivar.ids.length) { const d = etiquetar_(st, archivar.ids, estados, null, true, false, null); d.caducidad = archivar.hilos; partes.push(d); }
  Object.keys(porCarpeta).forEach(c => { const g = porCarpeta[c]; const d = etiquetar_(st, g.ids, estados, idEtiquetaCos_(c), true, false, c); d.caducidad = g.hilos; partes.push(d); });
  if (enBandejaSinLeer.length || protegidos.length) partes.push({ tipo: 'caducidad', caducidad: enBandejaSinLeer.concat(protegidos) });
  if (!partes.length) return;
  const nCarpeta = Object.keys(porCarpeta).reduce((a, c) => a + porCarpeta[c].hilos.length, 0);
  const n = archivar.hilos.length + nCarpeta + enBandejaSinLeer.length + protegidos.length;
  const texto = n === 1 ? 'Caducó «' + corto_(asuntos[0], 80) + '»: era opcional. ' + (nCarpeta ? 'Lo moví a ' + Object.keys(porCarpeta)[0] + ' sin marcarlo leído.' : enBandejaSinLeer.length ? 'Sigue sin leer en Recibidos; ya no sale en Hoy.' :
      protegidos.length ? 'Sigue en Recibidos porque nunca se limpia; ya no sale en Hoy.' : 'Lo archivé; sigue en la búsqueda.')
    : 'Caducaron ' + n + ' correos opcionales: ' + [archivar.hilos.length ? archivar.hilos.length + ' leídos, archivados' : '', nCarpeta ? nCarpeta + ' sin leer, a su carpeta' : '',
      enBandejaSinLeer.length ? enBandejaSinLeer.length + ' sin leer, siguen en Recibidos' : '', protegidos.length ? protegidos.length + ' que nunca se limpian, siguen en Recibidos' : ''].filter(Boolean).join('; ') + '. Ya no salen en Hoy.';
  const solo = n === 1 ? (archivar.hilos[0] || enBandejaSinLeer[0] || protegidos[0] || porCarpeta[Object.keys(porCarpeta)[0]].hilos[0]) : undefined;
  anotar_(st, { texto: texto, objeto: solo, actor: 'motor', d: partes.length === 1 ? partes[0] : { tipo: 'varios', partes: partes } });
  res.caducados = n;
}

// ---------- redactar_respuesta(id_hilo, texto): borrador en el hilo; nunca envía ----------
function redactar_(st, hilo, texto, todos) {
  frenoPausa_(st);
  hilo = argTexto_(hilo, 'id_hilo');
  texto = String(texto || '').trim();
  if (!texto) throw new Error('Falta el texto de la respuesta.');
  if (texto.length > 10000) throw new Error('El texto pasa de 10,000 caracteres.');
  const previo = st.get('borradores_motor', []).filter(b => b.h === hilo && b.tx === texto.slice(0, COS.MAX_TEXTO_PAR))[0];
  if (previo) { try { Gmail.Users.Drafts.get('me', previo.dr, { format: 'minimal' }); return { hecho: 'Ese borrador ya estaba en el hilo.', id_borrador: previo.dr, id_hilo: hilo, enviado: false, repetida: true }; } catch (e) {} }
  const t = conReintento_(() => Gmail.Users.Threads.get('me', hilo, { format: 'metadata', metadataHeaders: ['From', 'To', 'Cc', 'Reply-To', 'Subject', 'Message-ID', 'References'] }));
  const ms = sinBorradores_(t.messages);
  if (!ms.length) throw new Error('El hilo ' + hilo + ' no tiene mensajes.');
  const yo = yo_();
  const ult = ms[ms.length - 1];
  const h = cabeceras_(ult);
  const esMio = tiene_(ult, 'SENT');
  let para = (esMio ? correos_(h.to) : correos_(h['reply-to'] || h.from)).filter(x => x !== yo);
  if (!para.length) para = correos_(h.to).filter(x => x !== yo);
  // Un hilo donde solo está la persona (una nota para sí misma): la respuesta va a su propia dirección.
  if (!para.length && ms.every(m => { const x = cabeceras_(m); return correo_(x.from) === yo && correos_(x.to).concat(correos_(x.cc)).every(c => c === yo); })) para = [yo];
  if (!para.length) throw new Error('No encuentro a quién responder en ese hilo.');
  let cc = todos ? correos_(h.to).concat(correos_(h.cc)).filter(x => x !== yo && para.indexOf(x) < 0) : [];
  cc = cc.filter((x, i) => cc.indexOf(x) === i);
  const asunto0 = cabeceras_(ms[0]).subject || h.subject || '';
  const asunto = /^\s*(re|rv|fw|fwd)\s*:/i.test(asunto0) ? asunto0 : 'Re: ' + asunto0;
  const mid = h['message-id'] || '';
  const lineas = ['From: ' + yo, 'To: ' + para.join(', ')];
  if (cc.length) lineas.push('Cc: ' + cc.join(', '));
  lineas.push('Subject: =?UTF-8?B?' + Utilities.base64Encode(asunto, Utilities.Charset.UTF_8) + '?=');
  if (mid) { lineas.push('In-Reply-To: ' + mid); lineas.push('References: ' + ((h.references || '') + ' ' + mid).trim()); }
  lineas.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Utilities.base64Encode(texto, Utilities.Charset.UTF_8));
  const raw = Utilities.base64EncodeWebSafe(lineas.join('\r\n'), Utilities.Charset.UTF_8);
  const dr = Gmail.Users.Drafts.create({ message: { raw: raw, threadId: hilo } }, 'me');
  const bm = st.get('borradores_motor', []).filter(b => b.h !== hilo);
  bm.push({ dr: dr.id, mm: dr.message.id, h: hilo, t: Date.now(), para: para.join(', ').slice(0, 120), tx: texto.slice(0, COS.MAX_TEXTO_PAR) });
  st.set('borradores_motor', bm.slice(-COS.MAX_BORRADORES));
  const e = anotar_(st, { texto: 'Dejé un borrador de respuesta en «' + corto_(asunto0, 70) + '» para ' + para.join(', ') + '. No se envió.', politica: 'respuestas', d: { tipo: 'borrador', dr: dr.id, mm: dr.message.id } });
  return { hecho: e.texto, id_accion: e.id, id_borrador: dr.id, id_hilo: hilo, en_el_hilo: !!(dr.message && dr.message.threadId === hilo), para: para, cc: cc, asunto: asunto, enviado: false,
    tema_sensible: (sensibleDetalle_(asunto0 + ' ' + (ult.snippet || ''), st, asunto0, masivo_(ult, st)) || {}).tema };
}

// Enviar: solo la web app, con el toque de la persona sobre un borrador del motor.
// Nunca es herramienta del conector: Opus y las rutinas no envían. Envía el borrador tal cual lo dejó el motor; si la
// persona lo editó en Gmail, no lo envía. La ventana para arrepentirse la pone la web app antes de llamar.
function enviarBorrador_(st, a) {
  if (VIA !== 'webapp') throw new Error('Enviar solo existe en la web app de la persona: Opus y las rutinas nunca envían.');
  const bm = st.get('borradores_motor', []), act = st.get('actividad', []);
  let b = null;
  if (a.id_borrador) b = bm.filter(x => x.dr === String(a.id_borrador))[0];
  else {
    const e = act.filter(x => x.id === argTexto_(a.id_accion, 'id_accion (o id_borrador)'))[0];
    const dr0 = e && (e.d && e.d.tipo === 'borrador' ? e.d.dr : e.borrador);
    if (dr0) b = bm.filter(x => x.dr === dr0)[0];
  }
  if (!b) throw new Error('No encuentro ese borrador: puede que ya se envió o se descartó.');
  if (b.enviado) return { hecho: 'Ese borrador ya se envió.', id_hilo: b.h, enviado: true, sin_cambio: true };
  let dr;
  try { dr = Gmail.Users.Drafts.get('me', b.dr, { format: 'minimal' }); }
  catch (e) { throw new Error('El borrador ya no está en Gmail: se envió o se borró desde ahí.'); }
  if (!dr.message || dr.message.id !== b.mm) throw new Error('Cambiaste el borrador en Gmail: envíalo desde ahí para mandar tu versión.');
  const m = Gmail.Users.Drafts.send({ id: b.dr }, 'me');
  b.enviado = Date.now();
  st.set('borradores_motor', bm);
  // El borrador enviado ya no se deshace desde Actividad.
  const eb = act.filter(x => x.d && x.d.tipo === 'borrador' && x.d.dr === b.dr)[0];
  const asunto = eb ? (eb.texto.match(/«(.*)»/) || [])[1] : '';
  if (eb) { eb.borrador = b.dr; eb.d = null; eb.enviado = b.enviado; st.set('actividad', act); }
  // La persona ya contestó: el hilo deja de necesitarla hasta que llegue algo nuevo.
  vencerJuicios_(st, { [b.h]: 1 });
  const e = anotar_(st, { texto: 'Enviaste tu respuesta' + (asunto ? ' en «' + asunto + '»' : '') + ' a ' + b.para + '.', actor: 'persona', objeto: b.h });
  return { hecho: e.texto, id_accion: e.id, id_hilo: b.h, para: b.para, enviado: true, id_mensaje: m && m.id || undefined };
}

// ---------- desuscribir(remitente): baja de un clic (RFC 8058) ----------
// Con Bajas en Te aviso o Lo hago solo, Opus da la baja sin preguntar a un remitente conocido. Con Bajas en
// Te propongo o apagada, a un remitente nuevo, con ficha de importancia alta o en un tema sensible, va con el sí de la persona.
function desuscribir_(st, remitente) {
  frenoPausa_(st);
  const r = correo_(argTexto_(remitente, 'remitente'));
  if (r.indexOf('@') < 1) throw new Error('remitente es una dirección completa.');
  const hechas = st.get('bajas', {});
  if (hechas[r] && hechas[r].ok && Date.now() - hechas[r].t < 30 * 86400000) return { hecho: 'Ya me di de baja de ' + r + ' el ' + fecha_(hechas[r].t) + '.', remitente: r, repetida: true };
  const aprobadas = st.get('bajas_aprobadas', {});
  const conSi = VIA === 'webapp' || !!aprobadas[r];
  const pb = listaPoliticas_(st).filter(x => x.id === 'bajas')[0];
  const nivelBajas = pb && pb.estado === 'activa' ? pb.nivel : null;
  // La ficha de Opus no vuelve conocido a nadie, pero su importancia alta sí frena la baja.
  const todas = fichaDe_(st.get('fichas', []), r);
  const importancia = (todas.persona && todas.persona.importancia) || (todas.organizacion && todas.organizacion.importancia) || 'normal';
  const pideSi = porque => new Error('Esta baja va con el sí de la persona (' + porque + '): propónla con proponer (efecto {desuscribir: ["' + r + '"]}) y llama desuscribir cuando la acepte.');
  if (!conSi) {
    if (!nivelBajas || rangoNivel_(nivelBajas) < rangoNivel_('avisa')) throw pideSi(nivelBajas ? 'Bajas está en ' + COS.NIVEL_TEXTO[nivelBajas] : 'Bajas no está activa');
    if (!conocidoPorElla_(st, r)) throw pideSi('remitente nuevo');
    if (importancia === 'alta') throw pideSi('ficha de importancia alta');
  }
  const lista = conReintento_(() => Gmail.Users.Messages.list('me', { q: 'from:' + r + ' -in:sent', maxResults: 1, includeSpamTrash: true }));
  const id = lista.messages && lista.messages[0] && lista.messages[0].id;
  if (!id) throw new Error('No encuentro correos de ' + r + ' para leer su dirección de baja.');
  const m = conReintento_(() => Gmail.Users.Messages.get('me', id, { format: 'metadata', metadataHeaders: ['List-Unsubscribe', 'List-Unsubscribe-Post', 'Authentication-Results', 'From', 'Subject'] }));
  const h = {};
  ((m.payload && m.payload.headers) || []).forEach(x => { h[x.name] = x.value; });
  const auth = String(authDeGoogle_((m.payload && m.payload.headers) || []) || '').toLowerCase();
  const j = st.get('juicios', {})[m.threadId];
  // Nunca se pide la baja a un remitente sospechoso: confirmaría que la dirección existe.
  if (tiene_(m, 'SPAM') || /\b(spf|dkim)=(fail|softfail)/.test(auth) || (j && j.prioridad === 'riesgo'))
    throw new Error(r + ' parece sospechoso (spam, autenticación fallida o juicio de riesgo): no se le pide la baja. Ofrece spam.');
  // Los temas sensibles siempre se proponen, en cualquier nivel.
  const sd = conSi ? null : sensibleDeMensaje_({ h: h, labelIds: m.labelIds, snippet: m.snippet }, st), tema = sd ? sd.tema : null;
  if (tema) throw pideSi('tema sensible: ' + tema);
  // El piso también vale para las bajas: a quien manda un cobro fallido, un cambio de contrato o un aviso de acceso no se le pide la baja sin su sí.
  if (!conSi && nuncaSeLimpia_(String(h.Subject || '') + ' ' + String(m.snippet || ''), false, { h: h, labelIds: m.labelIds })) throw pideSi('su último correo es de los que nunca se limpian');
  const tipo = tipoBaja_(h);
  if (tipo !== 'un_clic') throw new Error(r + ' no tiene baja de un clic (' + tipo + '). Con baja solo por correo no se desuscribe: ofrece papelera o spam.');
  const url = String(h['List-Unsubscribe']).match(/<(https:\/\/[^>]+)>/i)[1];
  const resp = externa_(() => UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/x-www-form-urlencoded', payload: 'List-Unsubscribe=One-Click', muteHttpExceptions: true, followRedirects: true }));
  const codigo = resp.getResponseCode();
  const ok = codigo >= 200 && codigo < 400;
  hechas[r] = { t: Date.now(), ok: ok, codigo: codigo, sitio: (url.match(/^https:\/\/([^\/]+)/) || [])[1] };
  st.set('bajas', hechas);
  delete aprobadas[r];
  st.set('bajas_aprobadas', aprobadas);
  const e = anotar_(st, { texto: ok ? 'Me di de baja de ' + r + ' (baja de un clic). Lo que siga llegando en 14 días va a la papelera.' : 'Intenté la baja de ' + r + ' y su sitio respondió ' + codigo + '.', politica: 'bajas', d: null,
    aviso: !conSi && nivelBajas === 'avisa' || undefined });
  return { hecho: e.texto, id_accion: e.id, remitente: r, ok: ok, codigo: codigo, sin_preguntar: !conSi || undefined, sin_deshacer: 'La baja se revierte en el sitio del remitente.' };
}

// En pausa, nada que llegue por el conector toca el correo: actuar (con o sin política), el spam de Protección, aplicar,
// los borradores y las bajas se rechazan. Lo que la persona toca en la web app es su mano y sí corre; deshacer y quitar
// la pausa siempre corren. La corrida de 10 minutos ya no actúa en pausa (corrida_).
const TEXTO_PAUSA = 'Estoy en pausa: no toco tu correo. Quita la pausa con pausar(false) o desde la web app.';
function frenoPausa_(st) {
  const p = st.get('pausa', null);
  if (VIA === 'mcp' && p && p.activo) throw new Error(TEXTO_PAUSA);
}

function pausar_(st, activo) {
  const antes = st.get('pausa', null);
  const ahora = activo ? { activo: true, desde: Date.now() } : null;
  if (!!(antes && antes.activo) === !!activo) return { hecho: activo ? 'Ya estaba en pausa.' : 'No estaba en pausa.', pausado: !!activo, sin_cambio: true };
  st.set('pausa', ahora);
  const e = anotar_(st, { texto: activo ? 'Pausa: no toco tu correo; ni tus reglas ni Claude mueven nada. Sigo anotando señales.' : 'Quité la pausa: vuelvo a trabajar con tus reglas.', d: { tipo: 'pausa', antes: antes } });
  return { hecho: e.texto, id_accion: e.id, pausado: !!activo };
}
