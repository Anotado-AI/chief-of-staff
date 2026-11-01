// --- Almacén del motor ---
// Lo que sabe y lo que pasó vive en la Hoja de Google ligada al proyecto, una pestaña por entidad, para que
// la persona la pueda ver y para que no haya tope de 500 KB. Cada renglón trae columnas legibles y, al final
// y oculta, la columna "datos" con el objeto completo en JSON, que es la fuente. Las lecturas frecuentes van
// por CacheService (6 h) y se invalidan en cada escritura. La contabilidad interna del motor (historial,
// huellas, procesados, contador) vive en las propiedades del script, partida en trozos.
// Interfaz: st.get(llave, defecto), st.set(llave, valor), st.tocar(llave), st.borrar(llave), st.guardar().

const ALMACEN = {
  PREFIJO: 'cos3.',
  TROZO: 2800,
  CACHE: 'cos3t.',
  CACHE_SEG: 21600,
  CACHE_TROZO: 90000,
  CELDA: 49000
};

const corto_ = (s, n) => { s = s === undefined || s === null ? '' : String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const lista_ = v => Array.isArray(v) ? v.join(', ') : (v || '');

// Pestañas en el orden en que se crean. tipo lista: arreglo de objetos; mapa: objeto por llave.
const TABLAS = {
  politicas: { hoja: 'Políticas', tipo: 'lista', cols: ['id', 'Nombre', 'Nivel', 'Estado', 'Origen', 'Texto', 'Versión', 'Disparos', 'Actualizada'],
    fila: p => [p.id, p.nombre, p.nivel, p.estado, p.origen, corto_(p.texto, 300), p.version, (p.metricas || {}).disparos || 0, p.actualizada ? fecha_(p.actualizada) : ''] },
  propuestas: { hoja: 'Propuestas', tipo: 'lista', cols: ['id', 'Tipo', 'Lote', 'Estado', 'Texto', 'Recomendada', 'Respuesta', 'Creada'],
    fila: p => [p.id, p.tipo, p.lote || '', p.estado, corto_(p.texto, 300), p.recomendada || '', p.respuesta ? corto_(p.respuesta.opcion + (p.respuesta.texto ? ': ' + p.respuesta.texto : ''), 120) : '', fecha_(p.creada)] },
  fichas: { hoja: 'Fichas', tipo: 'lista', cols: ['id', 'Tipo', 'Nombre', 'Organización', 'Rol', 'Relación', 'Importancia', 'Direcciones', 'Dominios', 'Definido por', 'Actualizada'],
    fila: f => [f.id, f.tipo, f.nombre, f.organizacion || '', f.rol || '', f.relacion || '', f.importancia || 'normal', lista_(f.direcciones), lista_(f.dominios), f.definido_por, f.actualizada ? fecha_(f.actualizada) : ''] },
  cuaderno: { hoja: 'Cuaderno', tipo: 'lista', cols: ['id', 'Fecha', 'Lección', 'Evidencia', 'Cambio'],
    fila: c => [c.id, fecha_(c.t), corto_(c.texto, 2000), corto_(c.evidencia, 500), corto_(c.cambio, 200)] },
  memoria: { hoja: 'Memoria', tipo: 'mapa', cols: ['Parte', 'Texto', 'Actualizada'],
    fila: (m, k) => [k, corto_(m.texto !== undefined ? m.texto : JSON.stringify(filaExperiencia_(m)), 5000), m.actualizado ? fecha_(m.actualizado) : ''] },
  juicios: { hoja: 'Juicios', tipo: 'mapa', cols: ['id_hilo', 'Prioridad', 'Recomendación', 'Motivo', 'Confianza', 'Política', 'Fecha', 'Estado'],
    fila: (j, k) => [k, j.prioridad, corto_(j.recomendacion, 300), corto_(j.motivo, 200), j.confianza === undefined ? '' : j.confianza, j.politica || '', fecha_(j.t), j.vencido ? 'vencido' : 'vigente'] },
  seguimientos: { hoja: 'Seguimientos', tipo: 'lista', cols: ['id', 'Canal', 'Dirección', 'Qué', 'Con quién', 'Vence', 'Estado'],
    fila: s => [s.id, s.canal, s.direccion, corto_(s.que || s.asunto, 120), corto_(s.para, 120), fecha_(s.vence), s.estado] },
  senales: { hoja: 'Señales', tipo: 'lista', cols: ['Fecha', 'Tipo', 'Canal', 'Remitente', 'Asunto', 'Política'],
    fila: x => [fecha_(x.t), x.tipo, x.canal || 'gmail', x.remitente || '', corto_(x.asunto, 120), x.politica || ''] },
  actividad: { hoja: 'Actividad', tipo: 'lista', cols: ['id', 'Hora', 'Actor', 'Texto', 'Política', 'Deshacer'],
    fila: a => [a.id, fecha_(a.t), a.actor, corto_(a.texto, 400), a.politica || '', a.d ? (a.u ? 'deshecho ' + fecha_(a.u) : 'sí') : 'no'] },
  corridas: { hoja: 'Corridas', tipo: 'lista', cols: ['Hora', 'Quién', 'Segundos', 'Resultado'],
    fila: c => [fecha_(c.t), c.quien, c.s === undefined ? '' : c.s, corto_(c.resultado, 300)] },
  conflictos: { hoja: 'Conflictos', tipo: 'lista', cols: ['Fecha', 'id_hilo', 'Remitente', 'Políticas', 'Ganó'],
    fila: c => [fecha_(c.t), c.hilo, c.remitente, lista_(c.politicas), c.gano] },
  // Lo que Bandeja limpia archivó al instalar, para su Deshacer: miles de ids que no caben en las propiedades.
  bandeja_inicial_ids: { hoja: 'Archivo inicial', tipo: 'lista', cols: ['Parte', 'Correos', 'Fecha'],
    fila: x => [x.i, (x.ids || []).length, fecha_(x.t)] },
  // Lo que marcó leído el sistema, por política o por resumen: el análisis nunca lo cuenta como abierto, tampoco al recalcular el mes.
  leidos_sistema_filas: { hoja: 'Leídos por el sistema', tipo: 'lista', cols: ['Día', 'Por', 'Hilos'],
    fila: x => [x.d, x.por === 'resumen' ? 'resumen' : 'política', (x.h || []).length] },
  // Lo que la limpieza de lo viejo marcó leído (modo leido o ambos), para su Deshacer.
  bandeja_inicial_leidos: { hoja: 'Leído inicial', tipo: 'lista', cols: ['Parte', 'Correos', 'Fecha'],
    fila: x => [x.i, (x.ids || []).length, fecha_(x.t)] },
  // Los hilos que revisa una corrida de aplicar, listados una vez al empezar; se vacía al terminar.
  aplicar_hilos: { hoja: 'Aplicar en curso', tipo: 'lista', cols: ['Parte', 'Hilos', 'Fecha'],
    fila: x => [x.i, (x.ids || []).length, fecha_(x.t)] }
};

function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('El motor no encuentra su Hoja de Google. Debe ser un proyecto ligado a la Hoja "Chief of Staff".');
  return ss;
}

function pestana_(ss, def, crear) {
  let sh = ss.getSheetByName(def.hoja);
  if (sh || !crear) return sh;
  sh = ss.insertSheet(def.hoja);
  const cols = def.cols.concat(['datos']);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sh.setFrozenRows(1);
  try { sh.hideColumns(cols.length); } catch (e) {}
  return sh;
}

// Crea las pestañas en orden y quita la hoja vacía que trae una Hoja nueva.
function prepararHoja_() {
  const ss = hoja_();
  const creadas = [];
  Object.keys(TABLAS).forEach(k => { if (!ss.getSheetByName(TABLAS[k].hoja)) { pestana_(ss, TABLAS[k], true); creadas.push(TABLAS[k].hoja); } });
  const propias = {};
  Object.keys(TABLAS).forEach(k => { propias[TABLAS[k].hoja] = 1; });
  const quitadas = [];
  ss.getSheets().forEach(sh => {
    if (propias[sh.getName()]) return;
    const vacia = sh.getLastRow() === 0 && sh.getLastColumn() === 0;
    if ((vacia || /^sonda/.test(sh.getName())) && ss.getSheets().length > 1) { quitadas.push(sh.getName()); ss.deleteSheet(sh); }
  });
  Object.keys(TABLAS).forEach((k, i) => { const sh = ss.getSheetByName(TABLAS[k].hoja); if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); } });
  return { hoja: ss.getName(), url: ss.getUrl(), creadas: creadas, quitadas: quitadas };
}

function leerTabla_(ss, k) {
  const def = TABLAS[k];
  const sh = pestana_(ss, def, false);
  const vacio = def.tipo === 'mapa' ? {} : [];
  if (!sh || sh.getLastRow() < 2) return vacio;
  const n = def.cols.length + 1;
  const filas = sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues();
  if (def.tipo === 'mapa') {
    const o = {};
    filas.forEach(f => { if (f[0] !== '' && f[n - 1] !== '') { try { o[String(f[0])] = JSON.parse(f[n - 1]); } catch (e) {} } });
    return o;
  }
  const a = [];
  filas.forEach(f => { if (f[n - 1] !== '') { try { a.push(JSON.parse(f[n - 1])); } catch (e) {} } });
  return a;
}

function escribirTabla_(ss, k, v) {
  const def = TABLAS[k];
  const sh = pestana_(ss, def, true);
  const n = def.cols.length + 1;
  const filas = [];
  const fila = (x, llave) => {
    let datos = JSON.stringify(x);
    if (datos.length > ALMACEN.CELDA) throw new Error('Un renglón de ' + def.hoja + ' pasa de ' + ALMACEN.CELDA + ' caracteres; recórtalo.');
    filas.push(def.fila(x, llave).map(c => (c === undefined || c === null ? '' : c)).concat([datos]));
  };
  if (def.tipo === 'mapa') Object.keys(v || {}).forEach(key => fila(v[key], key));
  else (v || []).forEach(x => fila(x));
  const antes = sh.getLastRow();
  if (filas.length) sh.getRange(2, 1, filas.length, n).setValues(filas);
  if (antes > filas.length + 1) sh.getRange(filas.length + 2, 1, antes - filas.length - 1, n).clearContent();
}

function cacheTablaLeer_(k) {
  const c = CacheService.getScriptCache();
  const base = ALMACEN.CACHE + k;
  const v = c.get(base);
  if (v === null) return undefined;
  if (v.indexOf('#trozos:') === 0) {
    const n = Number(v.slice(8));
    const ks = [];
    for (let i = 1; i <= n; i++) ks.push(base + '#' + i);
    const t = c.getAll(ks);
    let s = '';
    for (let i = 1; i <= n; i++) { const p = t[base + '#' + i]; if (p === undefined || p === null) return undefined; s += p; }
    return JSON.parse(s);
  }
  return JSON.parse(v);
}

function cacheTablaPoner_(k, v) {
  const c = CacheService.getScriptCache();
  const base = ALMACEN.CACHE + k;
  const s = JSON.stringify(v);
  try {
    if (s.length <= ALMACEN.CACHE_TROZO) { c.put(base, s, ALMACEN.CACHE_SEG); return; }
    const n = Math.ceil(s.length / ALMACEN.CACHE_TROZO);
    if (n > 40) { c.remove(base); return; }
    const o = {};
    for (let i = 1; i <= n; i++) o[base + '#' + i] = s.slice((i - 1) * ALMACEN.CACHE_TROZO, i * ALMACEN.CACHE_TROZO);
    c.putAll(o, ALMACEN.CACHE_SEG);
    c.put(base, '#trozos:' + n, ALMACEN.CACHE_SEG);
  } catch (e) { try { c.remove(base); } catch (e2) {} }
}

function almacen_() {
  const props = PropertiesService.getScriptProperties();
  const crudo = props.getProperties();
  const memo = {}, sucio = {};
  let ss = null;
  const libro = () => ss || (ss = hoja_());

  function leerProp(k) {
    const base = ALMACEN.PREFIJO + k;
    const v = crudo[base];
    if (v === undefined || v === null || v === '') return undefined;
    if (v.indexOf('#trozos:') === 0) {
      const n = Number(v.slice(8));
      let s = '';
      for (let i = 1; i <= n; i++) s += crudo[base + '.' + i] || '';
      return JSON.parse(s);
    }
    return JSON.parse(v);
  }
  function trozosPrevios(base) {
    const v = crudo[base];
    return v && v.indexOf('#trozos:') === 0 ? Number(v.slice(8)) : 0;
  }

  return {
    crudo: crudo,
    libro: libro,
    get: function (k, defecto) {
      if (!(k in memo)) {
        let v;
        try {
          if (TABLAS[k]) { v = cacheTablaLeer_(k); if (v === undefined) { v = leerTabla_(libro(), k); cacheTablaPoner_(k, v); } }
          else v = leerProp(k);
        } catch (e) {
          if (TABLAS[k]) throw e;
          v = undefined;
        }
        if (v === undefined || v === null) v = typeof defecto === 'function' ? defecto() : (defecto === undefined ? null : JSON.parse(JSON.stringify(defecto)));
        memo[k] = v;
      }
      return memo[k];
    },
    set: function (k, v) { memo[k] = v; sucio[k] = true; },
    tocar: function (k) { sucio[k] = true; },
    borrar: function (k) { memo[k] = TABLAS[k] ? (TABLAS[k].tipo === 'mapa' ? {} : []) : undefined; sucio[k] = true; },
    guardar: function () {
      const escribir = {}, quitar = [];
      Object.keys(sucio).forEach(k => {
        if (TABLAS[k]) {
          CacheService.getScriptCache().remove(ALMACEN.CACHE + k);
          escribirTabla_(libro(), k, memo[k]);
          cacheTablaPoner_(k, memo[k]);
          return;
        }
        const base = ALMACEN.PREFIJO + k;
        const antes = trozosPrevios(base);
        if (memo[k] === undefined || memo[k] === null) {
          quitar.push(base);
          for (let i = 1; i <= antes; i++) quitar.push(base + '.' + i);
          return;
        }
        const s = JSON.stringify(memo[k]);
        let n = 0;
        if (s.length <= ALMACEN.TROZO) escribir[base] = s;
        else {
          n = Math.ceil(s.length / ALMACEN.TROZO);
          escribir[base] = '#trozos:' + n;
          for (let i = 1; i <= n; i++) escribir[base + '.' + i] = s.slice((i - 1) * ALMACEN.TROZO, i * ALMACEN.TROZO);
        }
        for (let i = n + 1; i <= antes; i++) quitar.push(base + '.' + i);
      });
      if (Object.keys(escribir).length) props.setProperties(escribir, false);
      quitar.forEach(k => { try { props.deleteProperty(k); } catch (e) {} delete crudo[k]; });
      Object.keys(escribir).forEach(k => { crudo[k] = escribir[k]; });
      Object.keys(sucio).forEach(k => { delete sucio[k]; });
      if (ss) SpreadsheetApp.flush();
      return bytesAlmacen_(crudo);
    }
  };
}

function bytesAlmacen_(crudo) {
  let n = 0;
  Object.keys(crudo).forEach(k => { n += k.length + String(crudo[k]).length; });
  return n;
}

// Bytes por llave interna y renglones por pestaña, para el estado de administración.
function ocupacionAlmacen_(st) {
  const por = {};
  Object.keys(st.crudo).forEach(k => {
    const base = k.indexOf(ALMACEN.PREFIJO) === 0 ? k.slice(ALMACEN.PREFIJO.length).replace(/\.\d+$/, '') : '(otra) ' + k;
    por[base] = (por[base] || 0) + k.length + String(st.crudo[k]).length;
  });
  const filas = {};
  try { const ss = st.libro(); Object.keys(TABLAS).forEach(k => { const sh = ss.getSheetByName(TABLAS[k].hoja); filas[TABLAS[k].hoja] = sh ? Math.max(0, sh.getLastRow() - 1) : null; }); } catch (e) { filas.error = String(e.message || e); }
  return { propiedades_bytes: bytesAlmacen_(st.crudo), por_llave: por, renglones_en_la_hoja: filas };
}

// Corre fn con el candado del script y guarda lo que cambió. Lo usan el conector y la corrida.
// Si una llamada ya movió correo y registró su línea con Deshacer (aplicarItems_) y después falla, se guarda igual:
// nunca queda un correo movido sin registro. Lo demás de una llamada que falla no se guarda.
let GUARDAR_AL_FALLAR_ = false;
// Las entradas de Actividad con deshacer que anotó esta ejecución (anotar_). Si la Hoja no guarda, lo que movieron se
// regresa en Gmail: así el reintento hace el movimiento completo con su Deshacer y nada queda movido sin registro.
let ANOTADAS_ = null;
// Quién tiene el candado y desde cuándo, en la caché: si otra llamada no lo consigue, el error dice qué sigue en curso.
const CANDADO = { LLAVE: 'cos3.candado', vueltas: 0, que: '' };
function marcarCandado_(que) {
  if (CANDADO.vueltas++) return;
  try { CacheService.getScriptCache().put(CANDADO.LLAVE, JSON.stringify({ t: Date.now(), que: que || CANDADO.que || 'el motor' }), 600); } catch (e) {}
}
function soltarCandado_() {
  if (--CANDADO.vueltas > 0) return;
  CANDADO.vueltas = 0;
  try { CacheService.getScriptCache().remove(CANDADO.LLAVE); } catch (e) {}
}
function candadoOcupado_() {
  let x = null;
  try { x = JSON.parse(CacheService.getScriptCache().get(CANDADO.LLAVE) || 'null'); } catch (e) {}
  const hace = x && x.t ? Math.max(0, Math.round((Date.now() - x.t) / 1000)) : null;
  return new Error('El Chief of Staff está terminando otra tarea' + (x && x.que ? ' (' + x.que + (hace !== null ? ', desde hace ' + hace + ' s' : '') + ')' : '') +
    '. Intenta de nuevo en un minuto con los mismos argumentos y el mismo opId: Google corta cualquier tarea a los 6 minutos.');
}
function conCandado_(fn, espera) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(espera || 25000)) throw candadoOcupado_();
  marcarCandado_();
  const previo = GUARDAR_AL_FALLAR_, previas = ANOTADAS_;
  GUARDAR_AL_FALLAR_ = false;
  ANOTADAS_ = [];
  try {
    const st = almacen_();
    let r;
    try { r = fn(st); }
    catch (err) { if (GUARDAR_AL_FALLAR_) { try { st.guardar(); } catch (e) { regresarSinGuardar_(st); } } throw err; }
    try { st.guardar(); } catch (err) { regresarSinGuardar_(st); throw err; }
    return r;
  } finally {
    GUARDAR_AL_FALLAR_ = previo || GUARDAR_AL_FALLAR_;
    ANOTADAS_ = previas;
    soltarCandado_();
    lock.releaseLock();
  }
}

function regresarSinGuardar_(st) {
  (ANOTADAS_ || []).forEach(e => { if (e.d && !e.u) { try { deshacerDatos_(st, e.d); } catch (x) {} } });
}
