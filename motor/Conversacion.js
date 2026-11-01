// --- Conversación: lo que Opus le dice y le pregunta ---
// Una sola entidad, propuesta: plan de instalación, políticas, niveles, fichas, preguntas y repaso semanal.
// Cada opción trae su efecto y el motor lo aplica en el acto al responder. Cuántas y cuándo lo decide Opus.

const PROPUESTA = {
  TIPOS: ['plan', 'politica', 'nivel', 'ficha', 'pregunta', 'repaso', 'resumen', 'decision'],
  ESTADOS: ['abierta', 'aceptada', 'corregida', 'rechazada', 'vencida'],
  SIN_CONTESTAR_PAUSA: 2,
  DIAS_PAUSA_PREGUNTAS: 7,
  MAX_TEXTO_RESUMEN: 4000,
  DIAS_VENCE: 7,
  // Lo que escribe al contestar autoriza solo el efecto de la opción que eligió: lo demás se anota para proponérselo.
  ANOTADO: 'Lo anoté. En tu siguiente revisión te lo propongo para que lo apruebes con un toque.',
  DIAS_VENCE_INSTALACION: 30,
  DIAS_RECHAZO: 30,
  MAX_OPCIONES: 6,
  MAX_ITEMS: 100,
  MAX: 400,
  RX_NO: /^(no\b|rechaz|d[eé]jalo|ahora no|nunca|descart)/i,
  // Los seis lineamientos del plan de instalación: la persona decide lineamientos, no decenas de reglas.
  LINEAMIENTOS: ['lo_que_no_abres', 'con_calma', 'se_repite', 'sobra', 'al_dia', 'cuanto_hago_solo', 'sin_leer']
};

function listaPropuestas_(st) { return st.get('propuestas', []); }

// La instalación queda cerrada con el primer sí de la persona a una propuesta del plan (lote instalacion), no cuando el
// instalador pone el activador (instalado_desde). Sin plan_aceptado guardado (Hojas anteriores), se toma de las propuestas.
function instalacionCerrada_(st) {
  const t = st.get('plan_aceptado', null);
  if (t) return t;
  const r = listaPropuestas_(st).filter(p => p.lote === 'instalacion' && (p.estado === 'aceptada' || p.estado === 'corregida') && p.respuesta).map(p => p.respuesta.t);
  return r.length ? Math.min.apply(null, r) : null;
}

// Lo anterior a una fecha solo se archiva si ella lo elige (contrato, línea 9): en ninguna propuesta es la recomendada una
// opción que lo archiva. Marcar leído sí puede serlo, porque se queda en Recibidos. En una propuesta guardada antes de
// esta regla, la recomendada pasa a la primera opción sin efecto, o a ninguna.
// El efecto de una opción como lista plana, a cualquier profundidad: la guarda y la ejecución leen la misma lista.
function aplanarEfecto_(ef) { return !ef ? [] : Array.isArray(ef) ? ef.reduce((a, x) => a.concat(aplanarEfecto_(x)), []) : [ef]; }
function archivaAnterior_(o) { return !!o && aplanarEfecto_(o.efecto).some(ef => ef && ef.bandeja_inicial && (typeof ef.bandeja_inicial !== 'object' || ef.bandeja_inicial.modo !== 'leido')); }
function recomendadaSegura_(p) {
  const ops = p.opciones || [], rec = p.recomendada;
  if (!rec || !archivaAnterior_(ops.filter(x => x.etiqueta === rec)[0])) return rec;
  const q = ops.filter(x => !x.efecto)[0];
  return q ? q.etiqueta : undefined;
}
function filaPropuesta_(p, maxItems) {
  return { id: p.id, tipo: p.tipo, lote: p.lote || undefined, lineamiento: p.lineamiento || undefined, nombre: p.nombre || undefined, texto: p.texto,
    // En lo anterior, la cifra y el total no salen: la persona ve lo que se queda, no cuántos se archivan.
    evidencia: p.evidencia ? (/^historico:/.test(String(p.objeto || '')) ? Object.assign({}, p.evidencia, { cifra: undefined, anteriores: undefined }) : p.evidencia) : undefined, lineas: p.lineas || undefined,
    opciones: (p.opciones || []).map(o => ({ id: o.id, etiqueta: o.etiqueta, porque: o.porque, valor: o.valor, costo: o.costo, efecto: o.efecto === undefined ? null : o.efecto })), recomendada: recomendadaSegura_(p) || undefined,
    confianza: p.confianza === undefined ? undefined : p.confianza, origen: p.origen, objeto: p.objeto || undefined, id_hilo: p.hilo || undefined, estado: p.estado,
    respuesta: p.respuesta ? { opcion: p.respuesta.opcion, texto: p.respuesta.texto || undefined, canal: p.respuesta.canal, fecha: fecha_(p.respuesta.t) } : undefined,
    toque_pendiente: p.toque_pendiente ? { opcion: p.toque_pendiente.opcion, que: p.toque_pendiente.que } : undefined,
    correos: p.items ? p.items.length : undefined,
    detalle: p.items ? p.items.slice(-(maxItems || 10)).reverse().map(i => ({ id_hilo: i.h, de: i.de, correo: i.co, asunto: i.as, fecha: fecha_(i.f), tema_sensible: i.sens || undefined })) : undefined,
    creada: fecha_(p.creada), vence: p.vence ? fecha_(p.vence) : undefined };
}

// Por páginas: antes se cortaba en 60 sin aviso y con 70 propuestas se perdían 10. desde (1 = la primera) y maximo
// (60 por omisión en Claude; la web app las recibe todas). Si el texto pasa de 45,000 caracteres, se quita el detalle de
// correos desde la cola y, si hace falta, se cortan propuestas; siguiente_desde dice cómo pedir las que siguen.
function verPropuestas_(st, estado, lote, tipo, maxItems, op) {
  op = op || {};
  let l = listaPropuestas_(st);
  const e = estado === undefined || estado === null || estado === '' ? 'abierta' : String(estado);
  if (e !== 'todas') l = l.filter(p => p.estado === e);
  if (lote) l = l.filter(p => p.lote === lote);
  if (tipo) l = l.filter(p => p.tipo === tipo);
  if (op.lineamiento) l = l.filter(p => p.lineamiento === String(op.lineamiento).trim().toLowerCase());
  l = l.slice().sort((a, b) => (b.actualizada || b.creada) - (a.actualizada || a.creada));
  const desde = Math.min(Math.max(1, Math.round(Number(op.desde) || 1)), Math.max(1, l.length));
  const maximo = Math.max(1, Math.round(Number(op.maximo) || (VIA === 'webapp' ? PROPUESTA.MAX : 60)));
  const filas = l.slice(desde - 1, desde - 1 + maximo).map(p => filaPropuesta_(p, maxItems));
  if (VIA !== 'webapp') {
    const largo = () => JSON.stringify(filas).length;
    for (let k = filas.length - 1; k >= 0 && largo() > 45000; k--) delete filas[k].detalle;
    while (filas.length > 1 && largo() > 45000) filas.pop();
  }
  const hasta = desde - 1 + filas.length;
  const siguiente = hasta < l.length ? hasta + 1 : null;
  const w = ligasWebapp_();
  return { total: l.length, mostradas: filas.length, desde: filas.length ? desde : undefined, hasta: filas.length ? hasta : undefined, siguiente_desde: siguiente,
    webapp_url: w.webapp_url, plan_url: w.plan_url,
    // La página por lineamientos la prende la web app con su propia constante; sin ella, la guía arma el plan carpeta por carpeta.
    plan_por_lineamientos: planPorLineamientos_() || undefined,
    quedan: siguiente ? 'Van ' + filas.length + ' de ' + l.length + ' (de la ' + desde + ' a la ' + hasta + '). Las que siguen: ver_propuestas con desde: ' + siguiente + ' y los mismos filtros.' : undefined,
    propuestas: filas };
}

function planPorLineamientos_() { return typeof PLAN_POR_LINEAMIENTOS !== 'undefined' && PLAN_POR_LINEAMIENTOS === true; }

// ---------- Efectos ----------
function validarEfecto_(st, ef) {
  if (ef === null || ef === undefined) return null;
  if (Array.isArray(ef)) return aplanarEfecto_(ef).map(x => validarEfecto_(st, x)).filter(Boolean);
  if (typeof ef !== 'object') throw new Error('efecto es null o un objeto: {politica: {...}}, {nivel: {politica, nivel}}, {ficha: {...}}, {desuscribir: [remitentes]} o {aplicar: true}.');
  const k = Object.keys(ef).filter(x => x !== 'usar_texto_como');
  if (k.length !== 1 || ['politica', 'nivel', 'ficha', 'desuscribir', 'aplicar', 'decision', 'bandeja_inicial', 'deshacer', 'seguimiento'].indexOf(k[0]) < 0)
    throw new Error('Cada efecto lleva una sola llave: politica, nivel, ficha, desuscribir, aplicar, decision, bandeja_inicial, deshacer o seguimiento (llegó ' + JSON.stringify(ef).slice(0, 120) + ').');
  // Un recordatorio que se abre con el sí: los datos de seguimiento abrir.
  if (k[0] === 'seguimiento' && (!ef.seguimiento || typeof ef.seguimiento !== 'object' || !(ef.seguimiento.id_hilo || ef.seguimiento.chat))) throw new Error('seguimiento es {id_hilo o chat, direccion, que, vence}.');
  // Deshacer una acción de Actividad (la usa el repaso semanal en lo que ya cambió): {deshacer: id_accion}.
  if (k[0] === 'deshacer') {
    const id = String(ef.deshacer || '');
    const e = st.get('actividad', []).filter(x => x.id === id)[0];
    if (!e) throw new Error('El efecto deshacer apunta a una acción que no está en Actividad: ' + id + '. Usa ver_hechos("actividad") para ver los ids.');
    if (!e.d) throw new Error('La acción ' + id + ' no tiene deshacer.');
    return { deshacer: id };
  }
  // El alcance queda fijo en la opción que aprueba la persona: lo leído anterior a esa fecha (30 días atrás o antes).
  // El modo también: leido o ambos. Archivar queda sin modo, con la forma de siempre.
  if (k[0] === 'bandeja_inicial') {
    const b = ef.bandeja_inicial, o = b && typeof b === 'object' ? b : {}, m = modoInicial_(o.modo);
    return { bandeja_inicial: Object.assign({ antes_de: corteInicial_(o.antes_de || o.hasta).dia }, m === 'archivar' ? {} : { modo: m }) };
  }
  if (k[0] === 'decision') {
    const dd = ef.decision || {};
    const clave = dd.clave === 'enterado' ? 'enterarse' : dd.clave;
    if (!MEMORIA.DECISIONES[clave] || MEMORIA.DECISIONES[clave].indexOf(dd.valor) < 0) throw new Error('decision es {clave: ' + Object.keys(MEMORIA.DECISIONES).join('|') + ', valor}: ' + Object.keys(MEMORIA.DECISIONES).map(x => x + ' = ' + MEMORIA.DECISIONES[x].join('|')).join('; ') + '.');
    return { decision: { clave: clave, valor: dd.valor } };
  }
  if (k[0] === 'politica') {
    const d = ef.politica || {};
    if (d.id && !listaPoliticas_(st).some(p => p.id === d.id)) throw new Error('El efecto apunta a una política que no existe: ' + d.id + '.');
    if (d.compilado) normalizarCompilado_(st, d.compilado);
    if (d.agregar) normalizarCompilado_(st, d.agregar);
    if (d.quitar) normalizarCompilado_(st, d.quitar);
    if (d.acciones) normalizarAcciones_(d.acciones);
    if (d.nivel && POLITICA.NIVELES.indexOf(d.nivel) < 0) throw new Error('nivel vale apagado, propone, avisa o solo.');
    if (!d.id && !d.texto) throw new Error('Un efecto que crea una política necesita texto (y acciones o criterio).');
  }
  if (k[0] === 'nivel') {
    const d = ef.nivel || {};
    politica_(st, d.politica);
    if (POLITICA.NIVELES.indexOf(d.nivel) < 0) throw new Error('nivel vale apagado, propone, avisa o solo.');
  }
  if (k[0] === 'desuscribir') { const l = Array.isArray(ef.desuscribir) ? ef.desuscribir : [ef.desuscribir]; if (!l.length || l.some(x => correo_(x).indexOf('@') < 1)) throw new Error('desuscribir es una lista de remitentes completos.'); }
  if (ef.usar_texto_como && ef.usar_texto_como !== 'carpeta' && ef.usar_texto_como !== 'nombre') throw new Error('usar_texto_como vale carpeta o nombre.');
  return ef;
}

// Aplica un efecto como decisión de la persona. texto: lo que escribió al contestar (renombrar una carpeta, por ejemplo).
function aplicarEfecto_(st, ef, p, texto) {
  if (!ef) return [];
  if (Array.isArray(ef)) return aplanarEfecto_(ef).reduce((a, x) => a.concat(aplicarEfecto_(st, x, p, texto)), []);
  // p.reversa: lo que hizo cada efecto, pieza por pieza, para cambiar la respuesta antes de aplicar el plan (revertirEfecto_).
  const reversa = r => { p.reversa = (p.reversa || []).concat([r]); };
  if (ef.aplicar) {
    reversa({ sin_reversa: 'aplicar' });
    const r = aplicarLote_(st, p, p.excluir || []);
    return [r.hecho];
  }
  if (ef.desuscribir) {
    const b = st.get('bajas_aprobadas', {});
    const correos = (Array.isArray(ef.desuscribir) ? ef.desuscribir : [ef.desuscribir]).map(correo_);
    correos.forEach(x => { b[x] = { t: Date.now(), propuesta: p.id }; });
    reversa({ baja: correos });
    st.set('bajas_aprobadas', b);
    return ['Baja aprobada para ' + Object.keys(b).length + (Object.keys(b).length === 1 ? ' remitente' : ' remitentes') + '; la doy enseguida o al aplicar tus instrucciones.'];
  }
  if (ef.nivel) {
    const pol = politica_(st, ef.nivel.politica);
    // Cuánto hago solo (el sexto lineamiento) solo cambia el nivel de las reglas que quedaron prendidas: nunca prende una
    // apagada ni una que la persona no aceptó. Antes, «Déjalo en mi bandeja» en un grupo y «Te aviso» aquí prendían la
    // regla y aplicar movía el correo.
    if (p && p.lineamiento === 'cuanto_hago_solo' && ef.nivel.nivel !== 'apagado' && (pol.nivel === 'apagado' || pol.estado !== 'activa'))
      return [pol.nombre + ' sigue ' + (pol.nivel === 'apagado' ? 'apagada' : 'sin aceptar') + ': el nivel solo cambia las reglas que quedaron prendidas.'];
    const antes = { nivel: pol.nivel, estado: pol.estado, aprobada: pol.aprobada };
    reversa({ nivel: { id: pol.id, antes: antes } });
    pol.nivel = ef.nivel.nivel;
    delete pol.nivel_propuesto;
    if (pol.estado === 'propuesta' || pol.estado === 'borrador' || pol.estado === 'pausada') pol.estado = 'activa';
    pol.aprobada = Date.now();
    pol.actualizada = Date.now();
    st.set('politicas', listaPoliticas_(st));
    anotar_(st, { texto: pol.nombre + ': de ' + COS.NIVEL_TEXTO[antes.nivel] + ' a ' + COS.NIVEL_TEXTO[pol.nivel] + ' (lo aprobaste).', politica: pol.id, actor: 'persona', d: { tipo: 'politica_nivel', id: pol.id, antes: antes } });
    p.politicas_tocadas = (p.politicas_tocadas || []).concat([pol.id]);
    return [pol.nombre + ' en ' + COS.NIVEL_TEXTO[pol.nivel] + '.'];
  }
  if (ef.deshacer) { reversa({ sin_reversa: 'deshacer' }); return [deshacer_(st, ef.deshacer).hecho]; }
  if (ef.seguimiento) { reversa({ sin_reversa: 'seguimiento' }); return [seguimiento_(st, Object.assign({}, ef.seguimiento, { accion: 'abrir', a_pedido: true })).hecho]; }
  if (ef.bandeja_inicial) reversa({ sin_reversa: 'bandeja_inicial' });
  if (ef.bandeja_inicial) return [iniciarBandejaInicial_(st, 'plan', typeof ef.bandeja_inicial === 'object' ? ef.bandeja_inicial.antes_de : undefined, { canal: canal_(), palabras: texto || undefined, propuesta: p.id },
    typeof ef.bandeja_inicial === 'object' ? ef.bandeja_inicial.modo : undefined).hecho];
  if (ef.decision) {
    const dd = {}; dd[ef.decision.clave] = ef.decision.valor;
    reversa({ decision: { clave: ef.decision.clave, antes: decision_(st, ef.decision.clave), despues: ef.decision.valor } });
    guardarExperiencia_(st, { decisiones: dd, definido_por: 'persona' });
    return ['Decisión: ' + ef.decision.clave + ' = ' + ef.decision.valor + '.'];
  }
  if (ef.ficha) {
    reversa({ sin_reversa: 'ficha' });
    const d = Object.assign({}, ef.ficha, { definido_por: 'persona' });
    if (texto && ef.usar_texto_como === 'nombre') d.nombre = texto;
    return [guardarFichas_(st, d).hecho];
  }
  const d = JSON.parse(JSON.stringify(ef.politica));
  const l = listaPoliticas_(st);
  let pol = d.id ? l.filter(x => x.id === d.id)[0] : null;
  const antes = pol ? JSON.parse(JSON.stringify(pol)) : null;
  if (texto && ef.usar_texto_como === 'carpeta') {
    const c = 'carpeta:' + normalizarCarpeta_(texto);
    d.acciones = (d.acciones || (pol ? pol.acciones : [])).map(a => /^carpeta:/.test(a) ? c : a);
    if (!d.acciones.some(a => /^carpeta:/.test(a))) d.acciones.push(c);
    if (d.nombre && /carpeta/i.test(d.nombre) === false && !pol) d.nombre = 'Carpeta ' + texto;
  }
  if (!pol) {
    pol = { id: nuevoId_(st, 'p'), origen: p.origen === 'opus' ? 'opus' : 'persona', nombre: corto_(d.nombre || d.texto, 60), texto: d.texto, nivel: 'propone', estado: 'activa',
      compilado: { condiciones: [], excepciones: [] }, criterio: '', acciones: [], cuando: 'cada_corrida', prueba: null, version: 0, versiones: [], metricas: metricasVacias_(), creada: Date.now() };
    l.push(pol);
  }
  const cambio = { condiciones: [], excepciones: [], quitadas: [] };
  // rev: lo agregado y lo quitado valor por valor, y cada campo con su valor anterior y el nuevo.
  const rev = { id: pol.id, creada: !antes, agregadas: [], quitadas: [], pedidas: [], campos: {} };
  [d.compilado, d.agregar].forEach(x => { if (x && x.condiciones) x.condiciones.forEach(c => (c.valores || []).forEach(v => rev.pedidas.push(String(c.campo) + '|' + String(v).toLowerCase()))); });
  const anterior = k => antes ? JSON.parse(JSON.stringify(antes[k] === undefined ? null : antes[k])) : null;
  if (d.compilado) { rev.campos.compilado = [anterior('compilado')]; pol.compilado = normalizarCompilado_(st, d.compilado); cambio.condiciones = pol.compilado.condiciones; cambio.excepciones = pol.compilado.excepciones; }
  const suma = (lista, x, tipo) => { const y = lista.filter(z => z.campo === x.campo)[0];
    const nuevos = []; if (y) x.valores.forEach(v => { if (y.valores.indexOf(v) < 0) { y.valores.push(v); nuevos.push(v); } }); else { lista.push({ campo: x.campo, valores: x.valores.slice() }); x.valores.forEach(v => nuevos.push(v)); }
    nuevos.forEach(v => rev.agregadas.push([tipo, x.campo, v])); };
  if (d.agregar) { const a = normalizarCompilado_(st, d.agregar); a.condiciones.forEach(x => suma(pol.compilado.condiciones, x, 'c')); a.excepciones.forEach(x => suma(pol.compilado.excepciones, x, 'e')); cambio.condiciones = a.condiciones; cambio.excepciones = a.excepciones; }
  if (d.quitar) {
    const q = normalizarCompilado_(st, d.quitar);
    q.condiciones.forEach(x => { const y = pol.compilado.condiciones.filter(z => z.campo === x.campo)[0]; if (y) { x.valores.forEach(v => { if (y.valores.indexOf(v) >= 0) rev.quitadas.push(['c', x.campo, v]); }); y.valores = y.valores.filter(v => x.valores.indexOf(v) < 0); x.valores.forEach(v => cambio.quitadas.push({ campo: x.campo, valor: v })); } });
    q.excepciones.forEach(x => { const y = pol.compilado.excepciones.filter(z => z.campo === x.campo)[0]; if (y) { x.valores.forEach(v => { if (y.valores.indexOf(v) >= 0) rev.quitadas.push(['e', x.campo, v]); }); y.valores = y.valores.filter(v => x.valores.indexOf(v) < 0); } });
    pol.compilado.condiciones = pol.compilado.condiciones.filter(x => x.valores.length);
    pol.compilado.excepciones = pol.compilado.excepciones.filter(x => x.valores.length);
  }
  ['nombre', 'texto', 'criterio', 'cuando'].forEach(k => { if (d[k] !== undefined) { rev.campos[k] = [anterior(k)]; pol[k] = k === 'cuando' ? normalizarCuando_(d[k]) : String(d[k]).slice(0, k === 'criterio' ? 3000 : 600); } });
  if (d.acciones) { rev.campos.acciones = [anterior('acciones')]; pol.acciones = normalizarAcciones_(d.acciones); }
  ['nivel', 'estado', 'aprobada'].forEach(k => { rev.campos[k] = [anterior(k)]; });
  if (d.nivel) { pol.nivel = d.nivel; delete pol.nivel_propuesto; }
  // Pasar un remitente (solo agregar o quitar) no enciende ni reanuda la política: encenderla va con su propia propuesta.
  const soloMueve = !!antes && !!(d.agregar || d.quitar) && ['compilado', 'acciones', 'texto', 'criterio', 'cuando', 'nivel', 'estado', 'nombre'].every(k => d[k] === undefined);
  pol.estado = d.estado && POLITICA.ESTADOS.indexOf(d.estado) >= 0 ? d.estado : soloMueve ? antes.estado : 'activa';
  if (pol.estado === 'activa' && !soloMueve) pol.aprobada = Date.now();
  fijarDePersona_(pol, cambio);
  pol.version = (pol.version || 0) + 1;
  pol.versiones = (pol.versiones || []).concat([{ version: pol.version, t: Date.now(), por: 'persona', compilado: pol.compilado, evidencia: 'propuesta ' + p.id }]).slice(-POLITICA.MAX_VERSIONES);
  pol.actualizada = Date.now();
  Object.keys(rev.campos).forEach(k => { rev.campos[k].push(JSON.parse(JSON.stringify(pol[k] === undefined ? null : pol[k]))); });
  reversa({ politica: rev });
  st.set('politicas', l);
  p.politicas_tocadas = (p.politicas_tocadas || []).concat([pol.id]);
  anotar_(st, { texto: (antes ? 'Cambié' : 'Creé') + ' la regla «' + pol.nombre + '» con tu sí (' + COS.NIVEL_TEXTO[pol.nivel] + ', ' + pol.estado + ').', politica: pol.id, actor: 'persona',
    d: antes ? { tipo: 'politica', antes: antes } : { tipo: 'politica_nueva', id: pol.id } });
  return ['Regla «' + pol.nombre + '»: ' + COS.NIVEL_TEXTO[pol.nivel] + ', ' + pol.estado + '.'];
}

// ---------- proponer(datos, opId) ----------
// opId: un reintento con el mismo id regresa la propuesta que ya quedó y no crea otra. Pasa cuando el cliente recibe un
// error después de que la propuesta se guardó (una llamada larga que el relevo corta tras la redirección).
const OP_IDS = { DIAS: 7, MAX: 300 };
function proponerConOpId_(st, d, opId) {
  const op = opId === undefined || opId === null ? '' : String(opId).trim().slice(0, 100);
  if (!op) return proponer_(st, d);
  const ops = st.get('op_ids', {}) || {};
  const previo = ops['proponer|' + op];
  if (previo) {
    const p = listaPropuestas_(st).filter(x => x.id === previo.id)[0];
    return { hecho: 'Esa propuesta ya estaba creada con el mismo opId: ' + previo.id + '.', id: previo.id, estado: p ? p.estado : undefined, repetida: true, propuesta: p ? filaPropuesta_(p) : undefined };
  }
  const r = proponer_(st, d);
  const ahora = Date.now();
  Object.keys(ops).forEach(k => { if (ahora - ops[k].t > OP_IDS.DIAS * 86400000) delete ops[k]; });
  if (r && r.id) ops['proponer|' + op] = { id: r.id, t: ahora };
  const ks = Object.keys(ops).sort((a, b) => ops[a].t - ops[b].t);
  ks.slice(0, Math.max(0, ks.length - OP_IDS.MAX)).forEach(k => { delete ops[k]; });
  st.set('op_ids', ops);
  return r;
}

function proponer_(st, d) {
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  if (!d || typeof d !== 'object') throw new Error('datos es {tipo, texto, opciones: [{etiqueta, efecto}], recomendada, evidencia: {cifra, ejemplos}, confianza, objeto, lote}.');
  const tipo = String(d.tipo || '').toLowerCase();
  if (PROPUESTA.TIPOS.indexOf(tipo) < 0) throw new Error('tipo vale ' + PROPUESTA.TIPOS.join(', ') + '.');
  const texto = argTexto_(d.texto, 'texto (una o dos líneas)');
  if (texto.length > 500) throw new Error('El texto de una propuesta va en una o dos líneas (pasa de 500 caracteres).');
  let opciones = Array.isArray(d.opciones) ? d.opciones : [];
  // Un resumen (del día o de una junta) no lleva opciones: solo se marca visto.
  if (tipo === 'resumen') opciones = [{ etiqueta: 'Visto', efecto: null }];
  if (!opciones.length) opciones = tipo === 'repaso' ? [{ etiqueta: 'Visto', efecto: null }] : [{ etiqueta: 'Sí', efecto: null }, { etiqueta: 'No', efecto: null }];
  if (opciones.length > PROPUESTA.MAX_OPCIONES) throw new Error('Hasta ' + PROPUESTA.MAX_OPCIONES + ' opciones.');
  // Una decisión del plan (objeto "decision:<enterarse|pendientes|caducidad>"): cada opción trae su valor y su porqué.
  const claveDecision = tipo === 'decision' ? String(d.objeto || '').replace(/^decision:/, '').replace(/^enterado$/, 'enterarse') : null;
  if (tipo === 'decision' && !MEMORIA.DECISIONES[claveDecision]) throw new Error('Una decisión lleva objeto ' + Object.keys(MEMORIA.DECISIONES).map(k => '"decision:' + k + '"').join(', ') + '.');
  // Lineamiento del plan: uno de los seis. Con objeto "lineamiento:<id>" es la propuesta del lineamiento; su respuesta
  // ajusta todas sus reglas con una lista de efectos.
  const fl = /^lineamiento:(.*)$/.exec(String(d.objeto || ''));
  const lineamiento = d.lineamiento !== undefined && d.lineamiento !== null && d.lineamiento !== '' ? String(d.lineamiento).trim().toLowerCase() : fl ? fl[1] : undefined;
  if (lineamiento !== undefined && PROPUESTA.LINEAMIENTOS.indexOf(lineamiento) < 0) throw new Error('lineamiento vale ' + PROPUESTA.LINEAMIENTOS.join(', ') + ' (llegó «' + lineamiento + '»).');
  if (fl && fl[1] !== lineamiento) throw new Error('El objeto lineamiento:' + fl[1] + ' va con lineamiento «' + fl[1] + '».');
  opciones = opciones.map(o => {
    if (typeof o === 'string') o = { etiqueta: o };
    const etiqueta = argTexto_(o.etiqueta, 'etiqueta de cada opción').slice(0, 60);
    let efecto = o.efecto;
    if (tipo === 'decision' && !efecto) {
      const v = sinAcentos_(String(o.valor || o.etiqueta)).toLowerCase().trim();
      if (MEMORIA.DECISIONES[claveDecision].indexOf(v) < 0) throw new Error('Cada opción de la decisión lleva valor: ' + MEMORIA.DECISIONES[claveDecision].join(', ') + '.');
      efecto = { decision: { clave: claveDecision, valor: v } };
    }
    // Lo leído anterior a una fecha (objeto "historico:<fecha>"): la opción toma esa fecha como su alcance.
    const fh = /^historico:(\d{4}-\d{2}-\d{2})$/.exec(String(d.objeto || ''));
    if (fh && efecto && efecto.bandeja_inicial !== undefined && !(typeof efecto.bandeja_inicial === 'object' && (efecto.bandeja_inicial.antes_de || efecto.bandeja_inicial.hasta)))
      efecto = { bandeja_inicial: { antes_de: fh[1], modo: efecto.bandeja_inicial && typeof efecto.bandeja_inicial === 'object' ? efecto.bandeja_inicial.modo : undefined } };
    // id, valor (en cuanto_hago_solo: propone, avisa o solo) y costo («unos 8 sí al día») son para la web app.
    return { id: o.id !== undefined && o.id !== null && o.id !== '' ? String(o.id).slice(0, 40) : undefined, etiqueta: etiqueta, efecto: validarEfecto_(st, efecto),
      porque: o.porque ? String(o.porque).slice(0, 200) : undefined, valor: o.valor !== undefined && o.valor !== null && o.valor !== '' ? String(o.valor).slice(0, 40) : undefined,
      costo: o.costo ? corto_(o.costo, 80) : undefined, rechaza: o.rechaza === true || undefined };
  });
  // Lo anterior a una fecha: muchos guardan su correo en Recibidos. «Déjalo como está» va primero y es lo que queda si no
  // contesta; archivar lo elige ella y nunca es la recomendada. Marcar leído sí puede serlo, porque se queda en Recibidos.
  // La regla vale para toda propuesta que toque lo anterior, no solo para historico:<fecha>.
  const esHistorico = /^historico:\d{4}-\d{2}-\d{2}$/.test(String(d.objeto || ''));
  const conAnterior = esHistorico || opciones.some(o => aplanarEfecto_(o.efecto).some(ef => ef && ef.bandeja_inicial));
  if (esHistorico) {
    // Sin cifras ni números con letra en lo que ve la persona: la etiqueta pierde el número, lo demás se queda fuera.
    // Una etiqueta con número que limpia lo anterior se llama por lo que hace («Las dos», «Archivar 300»).
    const POR_MODO = { archivar: 'Archivar lo leído', leido: 'Marcar leído lo sin leer', ambos: 'Archivar lo leído y marcar leído lo sin leer' };
    const nuevas = {};
    opciones.forEach(o => {
      if (conCifras_(o.etiqueta)) {
        const bi = aplanarEfecto_(o.efecto).map(ef => ef && ef.bandeja_inicial).find(Boolean);
        const modo = bi && (typeof bi === 'object' && bi.modo || 'archivar'), limpia = sinCifras_(o.etiqueta);
        const nueva = POR_MODO[modo] || (limpia && !/^(los|las|el|la|de|del|a|y)$/i.test(limpia) ? limpia : 'Opción');
        nuevas[o.etiqueta] = opciones.some(x => x !== o && x.etiqueta === nueva) ? nueva + ' (otra)' : nueva;
        o.etiqueta = nuevas[o.etiqueta];
      }
      ['porque', 'costo', 'valor'].forEach(k => { if (conCifras_(o[k])) delete o[k]; });
    });
    if (d.recomendada && conCifras_(d.recomendada)) d.recomendada = nuevas[d.recomendada] || sinCifras_(d.recomendada);
  }
  if (conAnterior) {
    // La primera se llama siempre «Déjalo como está»: otra opción sin efecto («No volver a preguntarme») no la sustituye.
    const k = opciones.findIndex(o => !o.efecto && /^d[ée]j(a|ar|alo|alos|ala|alas|arlo|arlos)\b/i.test(o.etiqueta));
    const quieto = k >= 0 ? Object.assign(opciones.splice(k, 1)[0], { etiqueta: 'Déjalo como está' }) : { etiqueta: 'Déjalo como está', efecto: null };
    opciones.unshift(quieto);
    if (opciones.length > PROPUESTA.MAX_OPCIONES) throw new Error('Hasta ' + PROPUESTA.MAX_OPCIONES + ' opciones, contando «Déjalo como está», que siempre va primero.');
    const rec = d.recomendada ? opciones.filter(o => o.etiqueta === String(d.recomendada))[0] : null;
    const dia = esHistorico ? String(d.objeto).slice(10) : (([].concat((rec && rec.efecto) || []).map(ef => ef && ef.bandeja_inicial).filter(Boolean)[0]) || {}).antes_de;
    if (archivaAnterior_(rec)) throw new Error('Archivar lo anterior al ' + dia + ' nunca es la recomendada: lo elige la persona. Recomienda «' + quieto.etiqueta + '» o marcar leído lo sin leer.');
  }
  const etiquetas = opciones.map(o => o.etiqueta);
  if (etiquetas.some((x, i) => etiquetas.indexOf(x) !== i)) throw new Error('Dos opciones con la misma etiqueta.');
  // recomendada: null deja la propuesta sin recomendación; lo anterior a una fecha recomienda «Déjalo como está» si Opus no pone otra.
  const sinRecomendada = d.recomendada === null;
  const recomendada = sinRecomendada ? undefined : d.recomendada ? String(d.recomendada) : opciones[0].etiqueta;
  if (recomendada !== undefined && etiquetas.indexOf(recomendada) < 0) throw new Error('recomendada debe ser una de las etiquetas: ' + etiquetas.join(', ') + '.');
  const lote = d.lote ? String(d.lote).slice(0, 40) : (tipo === 'plan' || tipo === 'decision' ? 'instalacion' : tipo === 'repaso' ? 'semana-' + Utilities.formatDate(new Date(), tz_(), 'yyyy-ww') : undefined);
  // Autonomía apagada: no se propone subir de nivel una política encendida. Encenderla (en el plan o después) y bajar el nivel, siempre.
  // Subir se propone para su sí, un nivel a la vez y solo con Autonomía encendida.
  if (VIA !== 'webapp' && lote !== 'instalacion') opciones.forEach(o => aplanarEfecto_(o.efecto).forEach(ef => {
    if (!ef || !ef.nivel || !ef.nivel.politica) return;
    const p = politica_(st, ef.nivel.politica);
    const i0 = POLITICA.NIVELES.indexOf(p.nivel), i1 = POLITICA.NIVELES.indexOf(ef.nivel.nivel);
    if (!(i0 >= 1 && i1 > i0)) return;
    // Lo hago solo que la persona pidió en palabras y quedó en Te aviso se propone aunque Autonomía esté apagada.
    const pedido = p.nivel_propuesto && p.nivel_propuesto.consentimiento && p.nivel_propuesto.nivel === ef.nivel.nivel;
    if (!autonomiaEncendida_(st) && !pedido) throw new Error('Autonomía está apagada: no propongas subir «' + p.nombre + '» de ' + COS.NIVEL_TEXTO[p.nivel] + ' a ' + COS.NIVEL_TEXTO[ef.nivel.nivel] + '. Bajar el nivel cuando los rescates pasan de 2% sí va siempre.');
    if (i1 > i0 + 1 && !pedido) throw new Error('Subir va un nivel a la vez: de ' + COS.NIVEL_TEXTO[p.nivel] + ' a ' + COS.NIVEL_TEXTO[POLITICA.NIVELES[i0 + 1]] + '.');
  }));
  const objeto = d.objeto ? String(d.objeto).slice(0, 200) : undefined;
  const hilo = d.id_hilo ? String(d.id_hilo) : undefined;
  const num = v => v === undefined || v === null || !isFinite(Number(v)) ? undefined : Number(v);
  // En un resumen, evidencia.texto lleva el resto para «Ver más»; en una carpeta, etiqueta_existente es la de la persona que se usaría.
  // Un ejemplo es texto o {remitente, cifra} (lineamiento). abiertos es un número, o en el resultado del plan la lista de lo
  // abierto que saldría [{id_hilo, remitente, asunto, fecha, propuesta}], con antes y despues.
  const ejemplo = x => x && typeof x === 'object' ? { remitente: x.remitente ? corto_(x.remitente, 120) : undefined, cifra: num(x.cifra), asunto: x.asunto ? corto_(x.asunto, 120) : undefined, id_hilo: x.id_hilo ? String(x.id_hilo).slice(0, 40) : undefined } : String(x);
  const abierto = x => ({ id_hilo: x && x.id_hilo ? String(x.id_hilo).slice(0, 40) : undefined, remitente: x && x.remitente ? corto_(x.remitente, 120) : undefined,
    asunto: x && x.asunto ? corto_(x.asunto, 120) : undefined, fecha: x && x.fecha ? String(x.fecha).slice(0, 20) : undefined, propuesta: x && x.propuesta ? String(x.propuesta).slice(0, 20) : undefined });
  let evidencia = d.evidencia ? { cifra: d.evidencia.cifra === undefined ? undefined : d.evidencia.cifra, ejemplos: (d.evidencia.ejemplos || []).slice(0, 20).map(ejemplo),
    texto: d.evidencia.texto ? corto_(d.evidencia.texto, tipo === 'resumen' ? PROPUESTA.MAX_TEXTO_RESUMEN : 300) : undefined,
    cobertura: num(d.evidencia.cobertura), abiertos: Array.isArray(d.evidencia.abiertos) ? d.evidencia.abiertos.slice(0, 50).map(abierto) : num(d.evidencia.abiertos), contestados: num(d.evidencia.contestados),
    antes: num(d.evidencia.antes), despues: num(d.evidencia.despues),
    etiqueta_existente: d.evidencia.etiqueta_existente ? corto_(d.evidencia.etiqueta_existente, 80) : undefined } : undefined;
  // Lo anterior a una fecha: las cifras y su frase las pone el motor (cifrasHistorico_), y suman lo anterior.
  const fhist = /^historico:(\d{4}-\d{2}-\d{2})$/.exec(String(d.objeto || ''));
  let cuenta = null, textoP = texto;
  // Lo que ve la persona de lo anterior no lleva cuántos se archivan, cuántos se marcan leídos ni el total: un texto de Opus
  // con cifras o números con letra se queda fuera (conCifras_).
  if (fhist && evidencia && conCifras_(evidencia.texto)) delete evidencia.texto;
  if (fhist) { try { const c = cuentaBandejaInicial_(st, fhist[1]); evidencia = Object.assign({}, evidencia, cifrasHistorico_(c)); cuenta = cuentaHistorico_(c); textoP = textoHistorico_(fhist[1], evidencia, opciones, texto); } catch (e) { if (/fecha de corte/.test(String(e && e.message))) throw e; } }
  // Repaso semanal: líneas de "Esta semana aprendí", cada una con el id de Actividad que la deshace.
  const lineas = Array.isArray(d.lineas) ? d.lineas.slice(0, 10).map(x => ({ texto: corto_(typeof x === 'string' ? x : x.texto, 300), deshacer: x && x.deshacer ? String(x.deshacer) : null })) : undefined;
  const nombre = d.nombre && !(fhist && conCifras_(d.nombre)) ? corto_(d.nombre, 80) : undefined;
  const confianza = d.confianza === undefined ? undefined : Math.max(0, Math.min(1, Number(d.confianza) || 0));
  const l = listaPropuestas_(st);
  // Idempotente: la misma propuesta abierta no se duplica.
  const clave = tipo + '|' + (objeto || '') + '|' + (objeto ? '' : texto);
  const igual = l.filter(p => p.estado === 'abierta' && p.clave === clave)[0];
  if (igual) {
    igual.texto = textoP; igual.opciones = opciones;
    if (fhist) { igual.texto_opus = texto; igual.cuenta = cuenta || igual.cuenta; } igual.recomendada = recomendada; igual.evidencia = evidencia || igual.evidencia; igual.actualizada = Date.now();
    if (lineamiento) igual.lineamiento = lineamiento;
    if (nombre) igual.nombre = nombre;
    if (lineas) igual.lineas = lineas;
    st.set('propuestas', l);
    return { hecho: 'Esa propuesta ya estaba abierta (' + igual.id + '); la actualicé.', id: igual.id, repetida: true };
  }
  // Una propuesta rechazada no se repite sin evidencia nueva.
  const rech = l.filter(p => p.estado === 'rechazada' && p.clave === clave && Date.now() - (p.respuesta ? p.respuesta.t : p.creada) < PROPUESTA.DIAS_RECHAZO * 86400000)[0];
  if (rech) {
    const antes = rech.evidencia && Number(rech.evidencia.cifra), ahora = evidencia && Number(evidencia.cifra);
    if (!(isFinite(ahora) && (!isFinite(antes) || ahora > antes))) throw new Error('La persona rechazó esa misma propuesta el ' + fecha_(rech.respuesta ? rech.respuesta.t : rech.creada) + ' (' + rech.id + '). Solo se repite con evidencia nueva: una cifra mayor en evidencia.cifra.');
  }
  // origen persona: lo pidió la persona (en la web app o en palabras a Opus). Una carpeta suya no tiene mínimo ni cuenta para el tope.
  const origen = VIA === 'motor' ? 'motor' : d.origen === 'persona' ? 'persona' : 'opus';
  // Cuántas carpetas, preguntas y propuestas lo decide Opus; los números de la guía son referencias.
  // El motor solo cuida dos cosas: una tarjeta al día y, si la persona no contesta, preguntar menos.
  if (origen === 'opus' && lote !== 'instalacion' && tipo === 'pregunta') {
    const cerradas = l.filter(p => p.tipo === 'pregunta' && p.origen === 'opus' && p.lote !== 'instalacion' && p.estado !== 'abierta').sort((a, b) => (b.actualizada || b.creada) - (a.actualizada || a.creada));
    const sinContestar = cerradas.slice(0, PROPUESTA.SIN_CONTESTAR_PAUSA);
    if (sinContestar.length === PROPUESTA.SIN_CONTESTAR_PAUSA && sinContestar.every(p => p.estado === 'vencida' && !p.respuesta)) {
      const hasta = (sinContestar[0].actualizada || sinContestar[0].creada) + PROPUESTA.DIAS_PAUSA_PREGUNTAS * 86400000;
      if (Date.now() < hasta) throw new Error('La persona dejó sin contestar sus dos últimas preguntas: las preguntas quedan en pausa hasta el ' + fecha_(hasta) + '. Mientras, aprende de lo que hace.');
    }
  }
  const p = { id: nuevoId_(st, 'q'), tipo: tipo, lote: lote, lineamiento: lineamiento, nombre: nombre, texto: textoP, texto_opus: fhist ? texto : undefined, cuenta: cuenta || undefined, evidencia: evidencia, lineas: lineas, opciones: opciones, recomendada: recomendada, confianza: confianza,
    origen: origen, objeto: objeto, hilo: hilo, clave: clave, estado: 'abierta', creada: Date.now(), actualizada: Date.now(),
    vence: tipo === 'resumen' ? Date.parse(dia_(Date.now()) + 'T23:59:59' + Utilities.formatDate(new Date(), tz_(), 'XXX'))
      : Date.now() + (lote === 'instalacion' ? PROPUESTA.DIAS_VENCE_INSTALACION : PROPUESTA.DIAS_VENCE) * 86400000 };
  l.push(p);
  while (l.length > PROPUESTA.MAX) { const i = l.findIndex(x => x.estado !== 'abierta'); if (i < 0) break; l.splice(i, 1); }
  st.set('propuestas', l);
  if (tipo === 'repaso') marcarRutina_(st, 'repaso');
  return { hecho: 'Dejé la propuesta ' + p.id + ' para la persona.', id: p.id, propuesta: filaPropuesta_(p) };
}

// ---------- responder(id, opcion, texto) ----------
function responder_(st, id, opcion, texto, excluir) {
  const l = listaPropuestas_(st);
  const p = l.filter(x => x.id === id)[0];
  if (!p) throw new Error('No hay una propuesta ' + id + '. Usa ver_propuestas.');
  texto = texto === undefined || texto === null ? '' : String(texto).trim().slice(0, 500);
  let eleg = String(opcion === undefined || opcion === null || opcion === '' ? '' : opcion).trim();
  // La opción llega por su etiqueta o por el id que le dio Opus (la web app).
  const porId = eleg && !(p.opciones || []).some(x => x.etiqueta === eleg) ? (p.opciones || []).filter(x => x.id !== undefined && String(x.id) === eleg)[0] : null;
  if (porId) eleg = porId.etiqueta;
  // «Otra» de la web app no es una opción de la propuesta: solo trae lo que escribió.
  if (/^otra$/i.test(eleg) && !(p.opciones || []).some(x => String(x.etiqueta).toLowerCase() === 'otra')) eleg = '';
  // Una propuesta del plan ya contestada se puede cambiar mientras el plan no se aplique («Que se quede» en el simulacro):
  // se regresa lo que hizo la respuesta anterior y se aplica la nueva.
  let anterior = null;
  if (p.estado !== 'abierta') {
    if (p.respuesta && (!eleg || p.respuesta.opcion === eleg) && (!texto || texto === (p.respuesta.texto || ''))) return { hecho: 'Esa propuesta ya estaba contestada: ' + p.respuesta.opcion + '.', id: p.id, estado: p.estado, repetida: true };
    if (p.lote !== 'instalacion' || ['aceptada', 'corregida', 'rechazada'].indexOf(p.estado) < 0) throw new Error('La propuesta ' + id + ' ya está ' + p.estado + (p.respuesta ? ' (' + p.respuesta.opcion + ')' : '') + '.');
    if (p.aplicada) throw new Error('Tus instrucciones ya se aplicaron: la propuesta ' + id + ' quedó en ' + (p.respuesta ? p.respuesta.opcion : p.estado) + '. Para cambiar a dónde va ese correo, cámbialo en Reglas.');
    anterior = p.respuesta;
  }
  if (!eleg && !texto) throw new Error('Falta opcion: ' + p.opciones.map(o => o.etiqueta).join(', ') + '.');
  const o = eleg ? p.opciones.filter(x => x.etiqueta === eleg)[0] || p.opciones.filter(x => x.etiqueta.toLowerCase() === eleg.toLowerCase())[0] : null;
  if (eleg && !o) throw new Error('Opción desconocida: ' + eleg + '. Usa ' + p.opciones.map(x => x.etiqueta).join(', ') + '.');
  // El efecto se aplana antes de toda guarda: lo que se revisa es lo que se aplica.
  if (o && Array.isArray(o.efecto)) o.efecto = aplanarEfecto_(o.efecto);
  const rechaza = o && (o.rechaza || (!o.efecto && PROPUESTA.RX_NO.test(o.etiqueta)));
  // «Acepto todo» y cualquier lote toman la recomendada: si una propuesta guardada antes traía como recomendada archivar
  // lo anterior, no se aplica. La recomendada pasa a la opción sin efecto y archivar queda para cuando ella lo toque.
  if (!rechaza && archivaAnterior_(o) && o.etiqueta === p.recomendada) {
    p.recomendada = recomendadaSegura_(p); st.set('propuestas', l);
    return { hecho: 'No archivé lo anterior: esa opción venía como recomendada y lo anterior solo se archiva si la persona lo elige. Ya no es la recomendada; si lo quiere, que toque «' + o.etiqueta + '».',
      id: p.id, estado: p.estado, sin_cambio: true, recomendada: p.recomendada || null };
  }
  const estado = rechaza ? 'rechazada' : (o && o.etiqueta === p.recomendada && !texto ? 'aceptada' : 'corregida');
  // Lo anterior a una fecha (miles de hilos que nadie juzgó) arranca solo con el sí explícito a esta propuesta. El efecto
  // se revisa como lista. Archivarlo va solo con su toque en la web app: por Claude no se aplica, ni con sus palabras.
  // Marcar leído lo sin leer, que se queda en Recibidos, por Claude va con sus palabras en texto.
  const biDe = o ? aplanarEfecto_(o.efecto).map(ef => ef && ef.bandeja_inicial).filter(Boolean)[0] : null;
  if (!rechaza && biDe && VIA !== 'webapp' && (archivaAnterior_(o) || texto.length < 2)) {
    const bi = typeof biDe === 'object' ? biDe : {};
    throw new Error(({ leido: 'Marcar leído lo sin leer', ambos: 'Archivar lo leído y marcar leído lo sin leer' }[bi.modo] || 'Archivar lo leído') + ' anterior al ' + (bi.antes_de || bi.hasta || 'la fecha') +
      (archivaAnterior_(o) ? ' va solo con el toque de la persona en la web app: por Claude no se aplica, ni con sus palabras. No cambié nada; la propuesta sigue abierta para su toque.' : ' va con el sí explícito de la persona: pasa en texto sus palabras (por ejemplo "sí, márcalos leídos").'));
  }
  // Por el conector, Lo hago solo se aplica como Te aviso y una baja a un remitente nuevo no se da: las dos esperan su
  // toque en la web app, donde consta que fue ella, y la propuesta sigue abierta. Desde la web app se aplica completo; si
  // ya se aplicó una parte por el conector, el toque con la misma opción aplica solo lo que faltó.
  const tp = p.estado === 'abierta' ? p.toque_pendiente : null;
  if (tp && VIA !== 'webapp' && o && o.etiqueta === tp.opcion)
    return { hecho: 'Esa respuesta ya se aplicó como se puede por aquí; ' + tp.que.join(' y ') + ' espera' + (tp.que.length > 1 ? 'n' : '') + ' su toque en la web app.', id: p.id, estado: 'abierta', repetida: true, pendiente_toque: tp.que };
  if (tp && !(VIA === 'webapp' && o && o.etiqueta === tp.opcion && !rechaza)) { revertirEfecto_(st, p); p.politicas_tocadas = []; p.reversa = []; }
  if (tp) delete p.toque_pendiente;
  const toque = [], falta = [];
  let efecto = o ? (tp && VIA === 'webapp' && o.etiqueta === tp.opcion ? tp.efecto : o.efecto) : null;
  if (Array.isArray(efecto)) efecto = aplanarEfecto_(efecto);
  const porConector = !rechaza && o && efecto && VIA !== 'webapp';
  const nombre = id => (listaPoliticas_(st).filter(x => x.id === id)[0] || {}).nombre || id;
  const nuevo = x => !conocidoPorElla_(st, x);
  // Cada pieza se aplica sola para saber qué regla creó: el toque pendiente sube esa regla, no crea otra.
  const pieza = ef => {
    if (!porConector || !ef) return aplicarEfecto_(st, ef, p, texto);
    if (ef.nivel && ef.nivel.nivel === 'solo') {
      const r = aplicarEfecto_(st, Object.assign({}, ef, { nivel: Object.assign({}, ef.nivel, { nivel: 'avisa' }) }), p, texto);
      toque.push(COS.NIVEL_TEXTO.solo + ' en «' + nombre(ef.nivel.politica) + '»'); falta.push({ nivel: { politica: ef.nivel.politica, nivel: 'solo' } });
      return r;
    }
    if (ef.politica && ef.politica.nivel === 'solo') {
      const r = aplicarEfecto_(st, Object.assign({}, ef, { politica: Object.assign({}, ef.politica, { nivel: 'avisa' }) }), p, texto);
      const id = (p.politicas_tocadas || []).slice(-1)[0];
      toque.push(COS.NIVEL_TEXTO.solo + ' en «' + nombre(id) + '»'); falta.push({ nivel: { politica: id, nivel: 'solo' } });
      return r;
    }
    // Reanudar o editar por el conector una regla que estaba en Lo hago solo (texto, acciones, criterio, nombre, cuándo o
    // compilación) tampoco la deja ahí: llega a Te aviso, la propuesta sigue abierta y el toque falta.
    const obj = ef.politica && ef.politica.id ? listaPoliticas_(st).filter(x => x.id === ef.politica.id)[0] : null;
    if (obj && obj.nivel === 'solo' && (!(obj.estado === 'activa') || ['texto', 'acciones', 'criterio', 'nombre', 'cuando', 'compilado'].some(k => ef.politica[k] !== undefined))) {
      const r = aplicarEfecto_(st, ef, p, texto), l = listaPoliticas_(st), q = l.filter(x => x.id === obj.id)[0];
      if (q && q.estado === 'activa' && q.nivel === 'solo') { q.nivel = 'avisa'; st.set('politicas', l); toque.push(COS.NIVEL_TEXTO.solo + ' en «' + q.nombre + '»'); falta.push({ nivel: { politica: q.id, nivel: 'solo' } }); }
      return r;
    }
    if (ef.desuscribir) {
      const todos = [].concat(ef.desuscribir).map(correo_), nuevos = todos.filter(nuevo), quedan = todos.filter(x => nuevos.indexOf(x) < 0);
      if (nuevos.length) { toque.push('la baja de ' + nuevos.slice(0, 3).join(', ') + (nuevos.length > 3 ? ' y ' + (nuevos.length - 3) + ' más' : '')); falta.push({ desuscribir: nuevos }); }
      return quedan.length ? aplicarEfecto_(st, Object.assign({}, ef, { desuscribir: quedan }), p, texto) : [];
    }
    return aplicarEfecto_(st, ef, p, texto);
  };
  p.excluir = Array.isArray(excluir) ? excluir.map(String) : [];
  if (anterior) { revertirEfecto_(st, p); p.politicas_tocadas = []; p.reversa = []; }
  const previas = porConector && texto ? new Set(st.get('actividad', []).map(x => x.id)) : null;
  const hechos = rechaza || !efecto ? [] : aplanarEfecto_(efecto).reduce((a, ef) => a.concat(pieza(ef)), []);
  // Sus palabras al contestar por Claude son un cambio por palabras: cada regla que cambió deja su aviso en Hoy con Bien y
  // Deshacer, ligado a la línea que la cambió.
  if (previas) st.get('actividad', []).filter(x => !previas.has(x.id) && x.d && x.politica).forEach(x => {
    const q = listaPoliticas_(st).filter(y => y.id === x.politica)[0], a0 = (x.d && x.d.antes) || {};
    if (!q) return;
    const prende = z => !!z && z.estado === 'activa' && z.nivel !== 'apagado', ant = { nivel: a0.nivel || q.nivel, estado: a0.estado || q.estado };
    const que = ant.nivel === q.nivel && ant.estado === q.estado ? 'la cambié' : !prende(ant) && prende(q) ? 'la encendí en ' + COS.NIVEL_TEXTO[q.nivel]
      : !prende(q) ? (q.nivel === 'apagado' ? 'la apagué' : 'la pausé') : rangoNivel_(q.nivel) > rangoNivel_(ant.nivel) ? 'la subí de ' + COS.NIVEL_TEXTO[ant.nivel] + ' a ' + COS.NIVEL_TEXTO[q.nivel]
      : 'la bajé de ' + COS.NIVEL_TEXTO[ant.nivel] + ' a ' + COS.NIVEL_TEXTO[q.nivel];
    avisarConsentimiento_(st, q, { canal: 'claude', palabras: texto }, x, que);
  });
  // Lo anterior a una fecha se nombra por su fecha: su texto trae cuántos se archivan y eso no va a Actividad.
  const cual = /^historico:\d{4}-\d{2}-\d{2}$/.test(String(p.objeto || '')) ? 'Lo anterior al ' + diaDeMes_(String(p.objeto).slice(10)) : corto_(p.texto, 100);
  if (toque.length) {
    p.estado = 'abierta';
    delete p.respuesta; delete p.usada;
    p.toque_pendiente = { opcion: o.etiqueta, que: toque, efecto: falta.length === 1 ? falta[0] : falta, t: Date.now() };
    p.actualizada = Date.now();
    st.set('propuestas', l);
    if (p.lote === 'instalacion' && !st.get('plan_aceptado', null)) st.set('plan_aceptado', Date.now());
    const e0 = anotar_(st, { texto: 'Contestaste «' + cual + '»: ' + o.etiqueta + '. ' + toque.join(' y ') + ' espera' + (toque.length > 1 ? 'n' : '') + ' tu toque en la web app.', actor: 'persona', objeto: p.objeto || undefined });
    const anota0 = !!texto && !aplanarEfecto_(o.efecto).some(ef => ef && (ef.usar_texto_como || ef.bandeja_inicial));
    return { hecho: [e0.texto].concat(hechos).join(' ') + (anota0 ? ' ' + PROPUESTA.ANOTADO : ''), id_accion: e0.id, id: p.id, estado: 'abierta', efectos: hechos, pendiente_toque: toque, anotado: anota0 || undefined,
      siguiente: 'La propuesta sigue abierta en la web app: ahí la confirma con un toque.' };
  }
  p.estado = estado;
  p.respuesta = { opcion: o ? o.etiqueta : '(texto)', texto: texto || undefined, canal: canal_(), t: Date.now() };
  // Un efecto de nivel o de regla ya se aplicó aquí: la propuesta queda usada y no autoriza otro cambio con cambiar_politica.
  const tocaRegla = !rechaza && o && aplanarEfecto_(o.efecto).some(ef => ef && (ef.nivel || ef.politica));
  if (tocaRegla) p.usada = { t: p.respuesta.t, por: 'responder' };
  // Lo que la persona escribe en la web app al contestar es su sí: queda guardado y Opus no lo tiene que pasar. Si la
  // respuesta ya aplicó un cambio a la regla, sus palabras quedan usadas en ese cambio.
  if (VIA === 'webapp' && texto && !rechaza) p.consentimiento_webapp = { canal: 'webapp', palabras: texto, t: p.respuesta.t, usado: tocaRegla ? p.respuesta.t : undefined };
  p.actualizada = Date.now();
  st.set('propuestas', l);
  if (!rechaza && p.lote === 'instalacion' && !st.get('plan_aceptado', null)) st.set('plan_aceptado', p.respuesta.t);
  const letra = { aceptada: 'a', corregida: 'c', rechazada: 'r' }[estado];
  const pol = p.politica || (p.objeto && listaPoliticas_(st).some(x => x.id === p.objeto) ? p.objeto : null);
  if (pol && !anterior) sumarMetrica_(st, pol, letra);
  // Si su respuesta ya cambió la regla, lo que pidió antes en la web app queda usado. Contestar una pregunta sobre la regla
  // (sin efecto sobre ella) no lo gasta.
  const objPol = pol || (/^politica:/.test(String(p.objeto || '')) ? String(p.objeto).slice(9) : null);
  if (objPol && tocaRegla) { const lp = st.get('politicas', []), q = lp.filter(x => x.id === objPol)[0]; if (q && q.consentimiento_webapp && !q.consentimiento_webapp.usado) { q.consentimiento_webapp.usado = Date.now(); st.set('politicas', lp); } }
  anotarSenal_(st, { tipo: 'respondio_propuesta', asunto: corto_(p.texto, 80), politica: pol || undefined, detalle: p.id + ': ' + p.respuesta.opcion + (texto ? ' · ' + corto_(texto, 80) : ''),
    dx: { propuesta: p.id, tipo: p.tipo, texto: corto_(p.texto, 200), opcion: p.respuesta.opcion, respuesta: texto || undefined, objeto: p.objeto || null, efecto: rechaza ? null : destinoDeEfecto_(o ? o.efecto : null, texto) } });
  const e = anotar_(st, { texto: !o ? 'Contestaste «' + cual + '» con tus palabras: «' + corto_(texto, 80) + '».' : (anterior ? 'Cambiaste «' + cual + '»: de ' + anterior.opcion + ' a ' : 'Contestaste «' + cual + '»: ') + p.respuesta.opcion + (texto ? ' (' + corto_(texto, 80) + ')' : '') + '.', politica: pol || undefined, actor: 'persona',
    objeto: pol ? 'politica:' + pol : (p.objeto || undefined) });
  // Lo escrito que no usa la opción (un nombre o una carpeta, o el sí a lo anterior a una fecha) no se aplica: se anota.
  const usaTexto = o && aplanarEfecto_(o.efecto).some(ef => ef && (ef.usar_texto_como || ef.bandeja_inicial));
  const anota = !!texto && !usaTexto;
  return { hecho: !o ? PROPUESTA.ANOTADO : [e.texto].concat(hechos).join(' ') + (anota ? ' ' + PROPUESTA.ANOTADO : ''), id_accion: e.id, id: p.id, estado: estado, efectos: hechos, anotado: anota || undefined };
}

// Regresa lo que hizo la respuesta anterior de una propuesta del plan, pieza por pieza: un remitente agregado sale, uno
// quitado vuelve, y un campo vuelve a su valor anterior solo si nadie lo cambió después. Lo que otra propuesta contestada
// del mismo plan también pide (el remitente, o que la política siga encendida) se queda.
function revertirEfecto_(st, p) {
  const rev = (p.reversa || []).slice().reverse();
  const sin = rev.filter(r => r.sin_reversa)[0];
  if (sin) throw new Error('La respuesta de ' + p.id + ' ya hizo algo que no se regresa desde aquí (' + sin.sin_reversa + '): cámbialo en Reglas o con deshacer.');
  const hechas = st.get('bajas', {});
  const dada = rev.filter(r => r.baja).reduce((a, r) => a.concat(r.baja), []).filter(c => hechas[c] && hechas[c].ok)[0];
  if (dada) throw new Error('La baja de ' + dada + ' ya se dio: se revierte en el sitio del remitente.');
  const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  // vivas: políticas que otra respuesta encendió (cambió su nivel o la activó); pasar un remitente no cuenta.
  const otras = { valores: {}, vivas: {} };
  listaPropuestas_(st).filter(x => x.id !== p.id && x.lote === p.lote && (x.estado === 'aceptada' || x.estado === 'corregida')).forEach(x => (x.reversa || []).forEach(r => {
    if (r.nivel) otras.vivas[r.nivel.id] = 1;
    if (r.politica) {
      const cn = r.politica.campos.nivel, ce = r.politica.campos.estado;
      r.politica.pedidas.forEach(k => { otras.valores[r.politica.id + '|' + k] = 1; });
      if ((cn && !igual(cn[0], cn[1])) || (ce && !igual(ce[0], ce[1]) && ce[1] === 'activa')) otras.vivas[r.politica.id] = 1;
    }
  }));
  const l = listaPoliticas_(st);
  rev.forEach(r => {
    if (r.baja) {
      const b = st.get('bajas_aprobadas', {});
      r.baja.forEach(c => { if (b[c] && b[c].propuesta === p.id) delete b[c]; });
      st.set('bajas_aprobadas', b);
    }
    if (r.decision && decision_(st, r.decision.clave) === r.decision.despues) {
      const dd = {}; dd[r.decision.clave] = r.decision.antes;
      guardarExperiencia_(st, { decisiones: dd, definido_por: 'persona' });
    }
    if (r.nivel) {
      const pol = l.filter(x => x.id === r.nivel.id)[0];
      if (pol && !otras.vivas[pol.id]) { pol.nivel = r.nivel.antes.nivel; pol.estado = r.nivel.antes.estado; pol.aprobada = r.nivel.antes.aprobada; pol.actualizada = Date.now(); }
    }
    if (!r.politica) return;
    const x = r.politica, i = l.findIndex(z => z.id === x.id);
    if (i < 0) return;
    const pol = l[i];
    if (x.creada && pol.origen !== 'catalogo') { l.splice(i, 1); return; }
    const c = x.campos.compilado;
    if (c && igual(pol.compilado, c[1])) pol.compilado = c[0] || { condiciones: [], excepciones: [] };
    else {
      const lista = t => t === 'c' ? pol.compilado.condiciones : pol.compilado.excepciones;
      x.agregadas.forEach(a => {
        if (a[0] === 'c' && otras.valores[x.id + '|' + a[1] + '|' + String(a[2]).toLowerCase()]) return;
        const y = lista(a[0]).filter(z => z.campo === a[1])[0];
        if (y) y.valores = y.valores.filter(v => v !== a[2]);
      });
      x.quitadas.forEach(a => {
        const ls = lista(a[0]);
        let y = ls.filter(z => z.campo === a[1])[0];
        if (!y) { y = { campo: a[1], valores: [] }; ls.push(y); }
        if (y.valores.indexOf(a[2]) < 0) y.valores.push(a[2]);
      });
      pol.compilado.condiciones = pol.compilado.condiciones.filter(z => z.valores.length);
      pol.compilado.excepciones = pol.compilado.excepciones.filter(z => z.valores.length);
    }
    Object.keys(x.campos).forEach(k => {
      if (k === 'compilado' || (['nivel', 'estado', 'aprobada'].indexOf(k) >= 0 && otras.vivas[x.id])) return;
      if (igual(pol[k], x.campos[k][1])) pol[k] = x.campos[k][0] === null ? undefined : x.campos[k][0];
    });
    pol.version = (pol.version || 0) + 1;
    pol.versiones = (pol.versiones || []).concat([{ version: pol.version, t: Date.now(), por: 'persona', compilado: pol.compilado, evidencia: 'cambio de respuesta a ' + p.id }]).slice(-POLITICA.MAX_VERSIONES);
    pol.actualizada = Date.now();
  });
  st.set('politicas', l);
}

// El destino que pide un efecto, para medir si el motor lo respetó: {destino (bandeja, importante, carpeta, papelera,
// spam, baja), carpeta}. null si el efecto no decide dónde va el correo.
function destinoDeEfecto_(ef, texto) {
  if (!ef) return null;
  if (Array.isArray(ef)) return ef.map(x => destinoDeEfecto_(x, texto)).filter(Boolean)[0] || null;
  if (ef.desuscribir) return { destino: 'baja' };
  const d = ef.politica || {};
  const acc = (d.acciones || []).map(String);
  const carp = acc.filter(a => /^carpeta:/i.test(a))[0];
  if (acc.indexOf('papelera') >= 0) return { destino: 'papelera' };
  if (acc.indexOf('spam') >= 0) return { destino: 'spam' };
  if (acc.indexOf('desuscribir') >= 0) return { destino: 'baja' };
  if (carp) return { destino: 'carpeta', carpeta: ef.usar_texto_como === 'carpeta' && texto ? texto : carp.slice(8) };
  if (acc.indexOf('importante') >= 0) return { destino: 'importante' };
  if (acc.indexOf('nunca_limpiar') >= 0) return { destino: 'bandeja' };
  return null;
}

// ---------- Lotes del motor: una propuesta por política, con la cuenta y ejemplos ----------
function proponerLote_(st, politica, items) {
  const pol = politica_(st, politica);
  const l = listaPropuestas_(st);
  const clave = 'lote|' + politica;
  let p = l.filter(x => x.clave === clave && x.estado === 'abierta')[0];
  if (!p) {
    p = { id: nuevoId_(st, 'q'), tipo: 'politica', lote: 'dia-' + dia_(Date.now()), texto: '', opciones: [{ etiqueta: 'Sí', efecto: { aplicar: true } }, { etiqueta: 'No', efecto: null }],
      recomendada: 'Sí', origen: 'motor', objeto: politica, politica: politica, clave: clave, estado: 'abierta', items: [], creada: Date.now(),
      vence: Date.now() + PROPUESTA.DIAS_VENCE * 86400000 };
    l.push(p);
  }
  const ya = {};
  p.items.forEach(i => { ya[i.m] = 1; });
  items.forEach(i => { if (!ya[i.m]) p.items.push(i); });
  if (p.items.length > PROPUESTA.MAX_ITEMS) p.items = p.items.slice(-PROPUESTA.MAX_ITEMS);
  const n = p.items.length;
  const sens = p.items.filter(i => i.sens).length;
  p.texto = pol.nombre + ': ' + preguntaLote_(accionesMotor_(pol), st, n) + ' (' + conteoRemitentes_(p.items, 4) + ').' +
    (sens ? ' ' + sens + ' con tema sensible: ' + (sens === 1 ? 'revísalo.' : 'revísalos.') : '');
  p.evidencia = { cifra: n, ejemplos: p.items.slice(-5).map(i => i.h) };
  p.lote = 'dia-' + dia_(Date.now());
  p.actualizada = Date.now();
  st.set('propuestas', l);
  return p;
}

function autonomiaEncendida_(st) { const p = listaPoliticas_(st).filter(x => x.id === 'autonomia')[0]; return !!p && p.estado === 'activa' && p.nivel !== 'apagado'; }

// Aplica los correos de un lote del motor con las acciones de su política (al decir que sí).
function aplicarLote_(st, p, excluir) {
  frenoPausa_(st);
  const pol = politica_(st, p.politica || p.objeto);
  const ex = {};
  (excluir || []).forEach(x => { ex[String(x)] = 1; });
  const items = (p.items || []).filter(i => !ex[i.h] && !ex[i.m]);
  const acc = accionesMotor_(pol).filter(a => a !== 'aviso_en_hoy' && a !== 'nunca_limpiar' && a !== 'desuscribir');
  if (!marcaLeido_(st, acc)) return aplicarItems_(st, acc, items, pol.id, 'persona');
  // Los remitentes que todavía se miden van a su carpeta sin marcar leído.
  const retener = retenerLeido_(st);
  const medir = items.filter(i => retener(i.co, i.f)), resto = items.filter(i => !retener(i.co, i.f));
  const r1 = resto.length ? aplicarItems_(st, acc, resto, pol.id, 'persona') : null;
  const r2 = medir.length ? aplicarItems_(st, acc.filter(a => a !== 'leido').concat(['dejar_sin_leer']), medir, pol.id, 'persona') : null;
  if (!r1 || !r2) return r1 || r2;
  return { n: r1.n + r2.n, omitidos: r1.omitidos + r2.omitidos, hecho: r1.hecho + ' ' + r2.hecho, id_accion: r1.id_accion, ids_accion: [r1.id_accion, r2.id_accion].filter(Boolean) };
}

// Vencen las propuestas viejas y las que hablan de un hilo que recibió un mensaje nuevo.
function vencerPropuestas_(st, hilosConNuevos) {
  const l = listaPropuestas_(st);
  let n = 0;
  l.forEach(p => {
    if (p.estado !== 'abierta') return;
    if ((p.vence && Date.now() > p.vence) || (p.hilo && hilosConNuevos && hilosConNuevos[p.hilo])) { p.estado = 'vencida'; p.actualizada = Date.now(); n++; }
  });
  if (n) st.set('propuestas', l);
  return n;
}
