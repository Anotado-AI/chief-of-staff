// --- Memoria: lo que Opus sabe de la persona ---
// Perfil, estilo, experiencia, cuaderno y fichas. Opus la escribe y la persona la corrige; cada cambio queda en
// Actividad con deshacer. Lo que la persona corrigió en una ficha o en su experiencia queda fijo: Opus no lo sobrescribe.

const MEMORIA = {
  PARTES: ['perfil', 'estilo', 'experiencia', 'cuaderno', 'fichas'],
  CAMPOS_EXPERIENCIA: ['orden_hoy', 'secciones_propias', 'textos', 'resumen', 'horarios_juicio', 'tono', 'decisiones'],
  // Las tres decisiones de la persona en el plan; la primera opción es el valor por omisión.
  // sin_leer: lo_que_te_necesita deja sin leer solo lo que pide algo; como_esta, como siempre.
  DECISIONES: { enterarse: ['listo', 'automatico'], pendientes: ['bandeja', 'carpeta'], caducidad: ['opus', 'conservador', 'nunca'], sin_leer: ['lo_que_te_necesita', 'como_esta'],
    // Avisos de acceso y seguridad: a su carpeta, leídos, o en la bandeja. Cada
    // persona la decide en el plan; Hoy la da solo si ya se decidió (sin omisión). La rutina los mueve con actuar.
    seguridad: ['carpeta', 'bandeja'] },
  CARPETA_SEGURIDAD: 'Avisos de apps y seguridad',
  FILTROS_SECCION: ['politica', 'ficha', 'prioridad'],
  MAX_PERFIL: 6000,
  MAX_ESTILO: 12000,
  MAX_CUADERNO: 40000,
  MAX_LECCION: 2000,
  MAX_FICHAS: 1500,
  MAX_LOTE: 50,
  CAMPOS_FICHA: ['tipo', 'nombre', 'direcciones', 'dominios', 'chats_whatsapp', 'organizacion', 'rol', 'relacion', 'importancia', 'temas_abiertos', 'ultima_interaccion', 'notas'],
  IMPORTANCIAS: ['alta', 'normal', 'baja']
};

function perfil_(st) { return (st.get('memoria', {}).perfil) || { texto: '' }; }
function estilo_(st) { return (st.get('memoria', {}).estilo) || { texto: '' }; }
function experiencia_(st) { return st.get('memoria', {}).experiencia || null; }
// La decisión vigente de la persona, o la primera opción si no decidió.
function decision_(st, k) { const d = ((experiencia_(st) || {}).decisiones || {})[k]; return d || MEMORIA.DECISIONES[k][0]; }

function sensiblesDe_(st) {
  const extra = (perfil_(st).sensibles || []).filter(s => SENSIBLES_FIJOS.indexOf(s.tema) < 0);
  return SENSIBLES_FIJOS.map(t => ({ tema: t, fijo: true })).concat(extra.map(s => ({ tema: s.tema, palabras: s.palabras, fijo: false })));
}

// ---------- ver_memoria(parte, filtro) ----------
function verMemoria_(st, parte, filtro) {
  parte = String(parte || '').trim().toLowerCase();
  if (MEMORIA.PARTES.indexOf(parte) < 0) throw new Error('parte vale perfil, estilo, experiencia, cuaderno o fichas.');
  if (parte === 'experiencia') return verExperiencia_(st);
  if (parte === 'perfil') {
    const p = perfil_(st);
    return { parte: 'perfil', texto: p.texto || '', temas_sensibles: sensiblesDe_(st), vocabulario_sensible: p.vocabulario_sensible || undefined, actualizado: p.actualizado ? fecha_(p.actualizado) : null,
      nota: p.texto ? undefined : 'Perfil vacío: escríbelo con guardar_memoria("perfil", {texto}) a partir de lo que leíste y de lo que te dijo la persona.' };
  }
  if (parte === 'estilo') {
    const e = estilo_(st);
    return { parte: 'estilo', texto: e.texto || '', actualizado: e.actualizado ? fecha_(e.actualizado) : null,
      ediciones_recientes: st.get('pares_borrador', []).slice(0, 10).map(x => ({ fecha: fecha_(x.t), id_hilo: x.h, para: x.para, cambio: x.cambio, borrador: x.borrador, enviado: x.enviado })) };
  }
  if (parte === 'cuaderno') {
    const l = st.get('cuaderno', []);
    const texto = textoCuaderno_(l);
    return { parte: 'cuaderno', texto: texto, lecciones: l.length, caracteres: texto.length, palabras: texto ? texto.split(/\s+/).length : 0, tope_caracteres: MEMORIA.MAX_CUADERNO,
      entradas: VIA !== 'webapp' ? undefined : l.filter(c => !c.completo).map(c => ({ id: c.id, fecha: c.fecha || dia_(c.t), seccion: c.seccion || 'aprendi', texto: c.texto, evidencia: c.evidencia || undefined, cambio: c.cambio || undefined, deshacer: c.deshacer || undefined })),
      nota: texto ? undefined : 'Cuaderno vacío. Al terminar cada rutina o plática, agrega lo que aprendiste con guardar_memoria("cuaderno", {agregar: {texto, evidencia, cambio}}).' };
  }
  return verFichas_(st, filtro || {});
}

// El cuaderno en Markdown: lo consolidado del repaso y después las lecciones nuevas en tres partes, en este orden.
const SECCIONES_CUADERNO = { aprendi: 'Aprendí', me_corrigio: 'Me corrigió', no_se: 'No sé' };
// Cómo sale cada lección en Actividad.
const LINEA_CUADERNO = { aprendi: 'Aprendí: ', me_corrigio: 'Me corregiste: ', no_se: 'Tengo una duda: ' };
// Cada campo de la experiencia en palabras de la persona, para Actividad.
const CAMPOS_EXPERIENCIA_TEXTO = { orden_hoy: 'el orden', secciones_propias: 'tus secciones', textos: 'los textos', resumen: 'el resumen',
  horarios_juicio: 'las horas de revisión', tono: 'el tono', decisiones: 'lo que hago con tus avisos' };
// Una lista en palabras: «A», «A y B», «A, B y C», «A, B, C, D y 2 más».
function listaNombres_(xs) {
  const v = xs.slice(0, 4), extra = xs.length - v.length;
  return extra > 0 ? v.join(', ') + ' y ' + extra + ' más' : v.length > 1 ? v.slice(0, -1).join(', ') + ' y ' + v[v.length - 1] : v[0] || '';
}
function textoCuaderno_(l) {
  const base = l.filter(c => c.completo).map(c => c.texto);
  const linea = c => '- ' + (c.fecha || dia_(c.t)) + ': ' + c.texto + (c.evidencia || c.cambio || c.deshacer ? ' (' + [c.evidencia ? 'evidencia: ' + c.evidencia : '', c.cambio ? 'cambio: ' + c.cambio : '', c.deshacer ? 'deshacer: ' + c.deshacer : ''].filter(Boolean).join('; ') + ')' : '');
  const partes = Object.keys(SECCIONES_CUADERNO).map(k => {
    const ls = l.filter(c => !c.completo && (c.seccion || 'aprendi') === k);
    return ls.length ? '## ' + SECCIONES_CUADERNO[k] + '\n\n' + ls.map(linea).join('\n') : '';
  }).filter(Boolean);
  return base.concat(partes).join('\n\n');
}

// ---------- guardar_memoria(parte, datos) ----------
function guardarMemoria_(st, parte, datos) {
  parte = String(parte || '').trim().toLowerCase();
  if (MEMORIA.PARTES.indexOf(parte) < 0) throw new Error('parte vale perfil, estilo, experiencia, cuaderno o fichas.');
  if (typeof datos === 'string' && parte === 'experiencia') { try { datos = JSON.parse(datos); } catch (e) { throw new Error('experiencia es un objeto {orden_hoy, secciones_propias, textos, resumen, horarios_juicio, tono}.'); } }
  if (typeof datos === 'string' && parte !== 'fichas' && parte !== 'cuaderno') datos = { texto: datos };
  if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) { datos = parte === 'cuaderno' ? { agregar: datos } : null; } }
  if (!datos) throw new Error('Faltan datos: ' + formaMemoria_(parte) + '.');
  if (parte === 'perfil' || parte === 'estilo') return guardarTextoMemoria_(st, parte, datos);
  if (parte === 'experiencia') return guardarExperiencia_(st, datos);
  if (parte === 'cuaderno') return guardarCuaderno_(st, datos);
  return guardarFichas_(st, datos);
}

function guardarTextoMemoria_(st, parte, datos) {
  const tope = parte === 'perfil' ? MEMORIA.MAX_PERFIL : MEMORIA.MAX_ESTILO;
  const m = st.get('memoria', {});
  const antes = m[parte] ? JSON.parse(JSON.stringify(m[parte])) : null;
  const nuevo = Object.assign({}, m[parte] || {});
  if (datos.texto !== undefined) {
    const t = String(datos.texto || '').trim();
    if (!t) throw new Error('El ' + parte + ' no puede quedar vacío.');
    if (t.length > tope) throw new Error('El ' + parte + ' pasa de ' + tope.toLocaleString('es-MX') + ' caracteres (' + t.length + '). Resúmelo.');
    nuevo.texto = t;
  }
  let nota = '';
  if (parte === 'perfil' && datos.sensibles !== undefined) {
    if (!Array.isArray(datos.sensibles)) throw new Error('sensibles es una lista de {tema, palabras[]}.');
    const extra = datos.sensibles.map(s => typeof s === 'string' ? { tema: s, palabras: [s] } : s)
      .filter(s => s && s.tema && SENSIBLES_FIJOS.indexOf(String(s.tema).toLowerCase()) < 0)
      .map(s => ({ tema: String(s.tema).trim().toLowerCase().slice(0, 40), palabras: (Array.isArray(s.palabras) ? s.palabras : [s.tema]).map(p => String(p).trim().slice(0, 40)).filter(Boolean).slice(0, 20) }))
      .slice(0, 12);
    // Una rutina agrega temas o palabras, nunca quita lo que ya estaba: quitar un tema es decisión de ella.
    if (typeof enRutina_ === 'function' && enRutina_()) ((m.perfil && m.perfil.sensibles) || []).forEach(p => { const x = extra.filter(y => y.tema === p.tema)[0];
      if (!x) extra.push(p); else p.palabras.forEach(w => { if (x.palabras.indexOf(w) < 0) x.palabras.push(w); }); });
    nuevo.sensibles = extra;
    nota = ' Dinero, contratos, consejo y prensa siguen siempre: no se pueden quitar.';
  }
  if (parte === 'perfil' && datos.vocabulario_sensible !== undefined) {
    const v = datos.vocabulario_sensible;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('vocabulario_sensible es {dinero, contratos, consejo, prensa: [palabras]}.');
    const voc = {};
    Object.keys(v).forEach(k => {
      const tema = String(k).toLowerCase();
      if (SENSIBLES_FIJOS.indexOf(tema) < 0) throw new Error('vocabulario_sensible trae los cuatro temas fijos; los demás van en sensibles [{tema, palabras}].');
      if (!Array.isArray(v[k])) throw new Error('vocabulario_sensible.' + tema + ' es una lista de palabras.');
      voc[tema] = v[k].map(p => String(p).trim().slice(0, 40)).filter(Boolean).slice(0, 80);
    });
    // Una rutina solo agrega palabras: no reemplaza ni vacía la lista de ningún tema.
    if (typeof enRutina_ === 'function' && enRutina_()) { const prev = (antes && antes.vocabulario_sensible) || {};
      Object.keys(voc).forEach(t => { const ya = prev[t] || []; voc[t] = ya.concat(voc[t].filter(w => ya.indexOf(w) < 0)).slice(0, 80); }); }
    nuevo.vocabulario_sensible = Object.assign({}, (antes && antes.vocabulario_sensible) || {}, voc);
    nota += ' El vocabulario de ' + Object.keys(voc).join(', ') + ' manda sobre la lista de respaldo; una lista vacía vuelve al respaldo.';
  }
  if (!nuevo.texto && parte === 'perfil' && !nuevo.sensibles && !nuevo.vocabulario_sensible) throw new Error('Falta texto.');
  nuevo.actualizado = Date.now();
  m[parte] = nuevo;
  st.set('memoria', m);
  // En Actividad, lo que cambió en palabras de la persona; el tamaño y las notas van solo en la respuesta.
  const tu = actor_() === 'persona';
  const linea = parte === 'estilo' ? (tu ? 'Corregiste cómo escribes.' : 'Aprendí cómo escribes.')
    : datos.texto === undefined ? (tu ? 'Corregiste tus temas sensibles.' : 'Aprendí cuáles son tus temas sensibles.') : (tu ? 'Corregiste lo que sé de ti.' : 'Aprendí más de ti y de tu trabajo.');
  const e = anotar_(st, { texto: linea, d: { tipo: 'memoria', parte: parte, antes: antes }, objeto: 'memoria:' + parte });
  return { hecho: e.texto + ' El ' + parte + ' quedó en ' + String(nuevo.texto || '').length + ' caracteres.' + nota, id_accion: e.id, caracteres: String(nuevo.texto || '').length, temas_sensibles: parte === 'perfil' ? sensiblesDe_(st).map(s => s.tema) : undefined };
}

function guardarCuaderno_(st, datos) {
  const l = st.get('cuaderno', []);
  // Una lección suelta, sin agregar ({texto, evidencia, cambio, seccion}), es la misma lección.
  if (datos.agregar === undefined && datos.reemplazar === undefined && datos.texto !== undefined)
    datos = { agregar: { texto: datos.texto, evidencia: datos.evidencia, cambio: datos.cambio, seccion: datos.seccion, fecha: datos.fecha, deshacer: datos.deshacer } };
  if (datos.reemplazar !== undefined) {
    const t = String(datos.reemplazar || '').trim();
    if (!t) throw new Error('reemplazar trae el cuaderno consolidado completo en Markdown; no puede ir vacío.');
    if (t.length > MEMORIA.MAX_CUADERNO) throw new Error('El cuaderno consolidado pasa de ' + MEMORIA.MAX_CUADERNO.toLocaleString('es-MX') + ' caracteres (' + t.length + '). El repaso lo deja en menos de 3,000 palabras.');
    st.set('cuaderno_anterior', { t: Date.now(), lecciones: l });
    st.set('cuaderno', [{ id: nuevoId_(st, 'c'), t: Date.now(), texto: t, completo: true, evidencia: datos.evidencia ? String(datos.evidencia).slice(0, 200) : 'repaso semanal', cambio: '' }]);
    const e = anotar_(st, { texto: l.length ? 'Ordené lo que he aprendido de ti.' : 'Empecé a anotar lo que aprendo de ti.', d: { tipo: 'cuaderno_reemplazo' }, objeto: 'memoria:cuaderno' });
    return { hecho: e.texto + ' El cuaderno quedó en ' + t.split(/\s+/).length + ' palabras' + (l.length ? ' (antes ' + l.length + ' lecciones).' : '.'), id_accion: e.id, palabras: t.split(/\s+/).length, caracteres: t.length };
  }
  // Varias lecciones en una llamada: agregar es una lista de hasta 10, cada una con su resultado.
  if (Array.isArray(datos.agregar)) {
    if (!datos.agregar.length || datos.agregar.length > 10) throw new Error('agregar es una lección o una lista de 1 a 10.');
    const res = datos.agregar.map(x => { try { return guardarCuaderno_(st, { agregar: x }); } catch (e) { return { error: mensajeError_(e), texto: corto_(String((x && x.texto) || x || ''), 80) }; } });
    const ok = res.filter(r => !r.error && !r.repetida).length;
    return { hecho: 'Anoté ' + ok + ' de ' + res.length + ' lecciones en el cuaderno.', lecciones: res, caracteres_del_cuaderno: textoCuaderno_(st.get('cuaderno', [])).length };
  }
  let a = datos.agregar;
  if (typeof a === 'string') a = { texto: a, evidencia: datos.evidencia, cambio: datos.cambio, seccion: datos.seccion, fecha: datos.fecha, deshacer: datos.deshacer };
  const seccion = String(a.seccion || 'aprendi').toLowerCase();
  if (!SECCIONES_CUADERNO[seccion]) throw new Error('seccion vale aprendi, me_corrigio o no_se.');
  if (!a || !String(a.texto || '').trim()) throw new Error('Usa {agregar: {texto, evidencia, cambio}} para sumar una lección, o {reemplazar: "markdown"} para dejar el cuaderno completo (instalación o repaso semanal).');
  const texto = String(a.texto).trim();
  if (texto.length > MEMORIA.MAX_LECCION) throw new Error('Una lección pasa de ' + MEMORIA.MAX_LECCION + ' caracteres (' + texto.length + '). Escríbela más corta.');
  const total = textoCuaderno_(l).length + texto.length + 200;
  if (total > MEMORIA.MAX_CUADERNO) throw new Error('El cuaderno llegó a su tope de ' + MEMORIA.MAX_CUADERNO.toLocaleString('es-MX') + ' caracteres. Consolídalo con {reemplazar} (el repaso semanal) antes de agregar más.');
  // Idempotente: la misma lección el mismo día no se repite.
  const hoy = dia_(Date.now());
  const igual = l.filter(c => !c.completo && c.texto === texto && dia_(c.t) === hoy)[0];
  if (igual) return { hecho: 'Esa lección ya estaba en el cuaderno de hoy.', id_leccion: igual.id, repetida: true };
  // cambio nombra lo que provocó (politica:<id>, ficha:<id>, estilo o perfil) y deshacer, el id de Actividad que lo revierte.
  const fecha = a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha)) ? String(a.fecha) : undefined;
  const deshacer = a.deshacer ? String(a.deshacer).trim() : undefined;
  if (deshacer && !st.get('actividad', []).some(e => e.id === deshacer && e.d)) throw new Error('deshacer es el id_accion de Actividad que revierte el cambio (' + deshacer + ' no existe o no tiene deshacer).');
  const c = { id: nuevoId_(st, 'c'), t: Date.now(), fecha: fecha, seccion: seccion, texto: texto, evidencia: String(a.evidencia || '').trim().slice(0, 500), cambio: String(a.cambio || '').trim().slice(0, 200), deshacer: deshacer };
  l.push(c);
  st.set('cuaderno', l);
  const e = anotar_(st, { texto: LINEA_CUADERNO[seccion] + corto_(texto, 140), d: { tipo: 'cuaderno', id: c.id }, objeto: 'memoria:cuaderno' });
  return { hecho: e.texto, id_accion: e.id, id_leccion: c.id, caracteres_del_cuaderno: textoCuaderno_(l).length };
}

// ---------- Experiencia: cómo se ve el Hoy de esta persona, diseñado por Opus ----------
// La web app se pinta con ella; si falta, usa su orden por omisión. Riesgo y temas sensibles van arriba siempre,
// diga lo que diga orden_hoy (lo hace la web app). Lo que pidió la persona queda fijo hasta que ella lo cambie.
function filaExperiencia_(x) {
  if (!x) return null;
  const o = {};
  MEMORIA.CAMPOS_EXPERIENCIA.forEach(k => { if (x[k] !== undefined) o[k] = x[k]; });
  return o;
}

function verExperiencia_(st) {
  const x = experiencia_(st);
  return { parte: 'experiencia', experiencia: filaExperiencia_(x), actualizada: x && x.actualizado ? fecha_(x.actualizado) : null,
    fijado_por_la_persona: x && x.bloqueados && x.bloqueados.length ? x.bloqueados : undefined,
    nota: x ? 'Riesgo y temas sensibles van arriba siempre, diga lo que diga orden_hoy.' : 'Sin experiencia: la web app usa su orden por omisión. Diséñala con guardar_memoria("experiencia", {orden_hoy, secciones_propias, textos, resumen, horarios_juicio, tono}).' };
}

// horarios_juicio: {entre_semana [], fin_de_semana []} en HH:mm. La lista plana de antes vale como entre_semana.
function horariosJuicio_(x) {
  const h = x && x.horarios_juicio;
  if (!h) return { entre_semana: [], fin_de_semana: null };
  if (Array.isArray(h)) return { entre_semana: h, fin_de_semana: null };
  return { entre_semana: h.entre_semana || [], fin_de_semana: Array.isArray(h.fin_de_semana) ? h.fin_de_semana : null };
}
// Perfil de rutinas que puso el plan en el perfil ("Rutinas: ligero" o "Rutinas: completo"); null si no lo dice.
function perfilRutinas_(st) { const m = String(perfil_(st).texto || '').match(/^\s*Rutinas:\s*(ligero|completo)/im); return m ? m[1].toLowerCase() : null; }

function guardarExperiencia_(st, datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('experiencia es un objeto {orden_hoy, secciones_propias, textos, resumen, horarios_juicio, tono}.');
  const txt = (v, n, campo) => { if (typeof v !== 'string') throw new Error(campo + ' es texto.'); return v.trim().slice(0, n); };
  const lista = (v, n, campo, fn) => { if (!Array.isArray(v)) throw new Error(campo + ' es una lista.'); return v.map(fn).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, n); };
  const nuevo = {};
  if (datos.orden_hoy !== undefined) nuevo.orden_hoy = lista(datos.orden_hoy, 12, 'orden_hoy', x => txt(String(x), 30, 'orden_hoy').toLowerCase());
  if (datos.textos !== undefined) {
    if (!datos.textos || typeof datos.textos !== 'object' || Array.isArray(datos.textos)) throw new Error('textos es un objeto {seccion: "su nombre en palabras de la persona"}.');
    nuevo.textos = {};
    Object.keys(datos.textos).slice(0, 20).forEach(k => { const v = txt(String(datos.textos[k] || ''), 80, 'textos.' + k); if (v) nuevo.textos[String(k).slice(0, 30)] = v; });
  }
  if (datos.resumen !== undefined) {
    const r = datos.resumen || {};
    if (typeof r !== 'object' || Array.isArray(r)) throw new Error('resumen es {momentos: ["07:30", "cierre"], largo: "corto"}.');
    // largo: corto, completo o cuántos asuntos. Un número (3 o "3") se guarda como número, de 1 a 50; antes quedaba como texto "3".
    let largo = r.largo === undefined ? 'corto' : r.largo;
    if (typeof largo === 'number' || /^\s*\d+\s*$/.test(String(largo))) {
      largo = Number(largo);
      if (!(largo >= 1 && largo <= 50)) throw new Error('resumen.largo es corto, completo o un número de asuntos de 1 a 50 (' + r.largo + ' no).');
    } else largo = txt(String(largo), 20, 'resumen.largo');
    nuevo.resumen = { momentos: r.momentos === undefined ? [] : lista(r.momentos, 6, 'resumen.momentos', x => txt(String(x), 30, 'resumen.momentos')), largo: largo };
  }
  if (datos.secciones_propias !== undefined) {
    if (!Array.isArray(datos.secciones_propias)) throw new Error('secciones_propias es una lista de {titulo, filtro: {politica, ficha o prioridad}}.');
    nuevo.secciones_propias = datos.secciones_propias.slice(0, 8).map(s => {
      if (!s || typeof s !== 'object') throw new Error('Cada sección propia es {titulo, filtro}.');
      // El filtro también llega como texto "ficha:f-1".
      const f0 = typeof s.filtro === 'string' && /^\w+:.+/.test(s.filtro) ? { [s.filtro.split(':')[0]]: s.filtro.slice(s.filtro.indexOf(':') + 1) } : s.filtro;
      const f = f0 && typeof f0 === 'object' ? f0 : null;
      const k = f ? Object.keys(f).filter(x => MEMORIA.FILTROS_SECCION.indexOf(x) >= 0)[0] : null;
      if (!k) throw new Error('El filtro de «' + (s.titulo || '') + '» es {politica}, {ficha} o {prioridad}.');
      const filtro = {}; filtro[k] = txt(String(f[k]), 60, 'filtro.' + k);
      return { titulo: txt(String(s.titulo || ''), 60, 'titulo'), filtro: filtro };
    }).filter(s => s.titulo);
  }
  if (datos.horarios_juicio !== undefined) {
    const horas = (v, campo) => lista(v, 24, campo, x => {
      const m = String(x).trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(campo + ' son horas HH:mm (' + x + ' no).');
      return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
    }).sort();
    const hj = datos.horarios_juicio;
    let o;
    if (Array.isArray(hj)) o = { entre_semana: horas(hj, 'horarios_juicio') };
    else if (hj && typeof hj === 'object') {
      o = { entre_semana: horas(hj.entre_semana || [], 'horarios_juicio.entre_semana') };
      if (hj.fin_de_semana !== undefined && hj.fin_de_semana !== null) o.fin_de_semana = horas(hj.fin_de_semana, 'horarios_juicio.fin_de_semana');
    } else throw new Error('horarios_juicio es {entre_semana: ["07:15", "13:45"], fin_de_semana: ["10:07"]}.');
    // El perfil de rutinas pone el tope: ligero, 3 al día; completo, 3 en fin de semana.
    const perfil = perfilRutinas_(st);
    if (perfil === 'ligero' && (o.entre_semana.length > 3 || (o.fin_de_semana || []).length > 3)) throw new Error('El perfil ligero juzga hasta 3 veces al día. Elige las 3 horas que más le sirven.');
    if (perfil === 'completo' && (o.fin_de_semana || []).length > 3) throw new Error('El perfil completo juzga 3 veces en fin de semana. Elige 3 horas en fin_de_semana.');
    nuevo.horarios_juicio = o;
  }
  if (datos.tono !== undefined) nuevo.tono = txt(String(datos.tono), 300, 'tono');
  if (datos.decisiones !== undefined) {
    const dd = datos.decisiones;
    if (!dd || typeof dd !== 'object' || Array.isArray(dd)) throw new Error('decisiones es {enterarse: listo|automatico, pendientes: bandeja|carpeta, caducidad: opus|conservador|nunca}.');
    const previas = (experiencia_(st) || {}).decisiones || {};
    nuevo.decisiones = Object.assign({}, previas);
    Object.keys(dd).forEach(k0 => {
      const k = k0 === 'enterado' ? 'enterarse' : k0;
      const ok = MEMORIA.DECISIONES[k];
      if (!ok) throw new Error('decisiones trae enterarse, pendientes y caducidad.');
      const v = sinAcentos_(String(dd[k0] || '')).toLowerCase().trim();
      if (ok.indexOf(v) < 0) throw new Error('decisiones.' + k + ' vale ' + ok.join(' o ') + '.');
      nuevo.decisiones[k] = v;
    });
  }
  const campos = Object.keys(nuevo);
  if (!campos.length) throw new Error('Pasa al menos uno: orden_hoy, secciones_propias, textos, resumen, horarios_juicio, tono o decisiones. Lo que no pases se queda como está.');
  const m = st.get('memoria', {});
  const antes = m.experiencia ? JSON.parse(JSON.stringify(m.experiencia)) : null;
  const x = Object.assign({}, m.experiencia || {});
  const porPersona = String(datos.definido_por || (VIA === 'webapp' ? 'persona' : 'opus')).toLowerCase() === 'persona';
  const bloq = x.bloqueados || [];
  const respetados = [];
  campos.forEach(k => {
    if (!porPersona && bloq.indexOf(k) >= 0 && JSON.stringify(x[k]) !== JSON.stringify(nuevo[k])) { respetados.push(k); return; }
    x[k] = nuevo[k];
  });
  if (porPersona) x.bloqueados = campos.reduce((a, k) => (a.indexOf(k) < 0 ? a.concat([k]) : a), bloq);
  const cambiaron = campos.filter(k => respetados.indexOf(k) < 0);
  if (!cambiaron.length) return { hecho: 'No cambié nada: ' + respetados.join(', ') + ' lo pidió la persona.', respetados: respetados, nota: 'Si crees que ya no le sirve, pregúntale con proponer.' };
  x.actualizado = Date.now();
  m.experiencia = x;
  st.set('memoria', m);
  const que = listaNombres_(cambiaron.map(k => CAMPOS_EXPERIENCIA_TEXTO[k] || k));
  const e = anotar_(st, { texto: (porPersona ? 'Cambiaste cómo se ve tu Hoy: ' : 'Aprendí cómo prefieres tu Hoy: ') + que + '.', d: { tipo: 'memoria', parte: 'experiencia', antes: antes }, objeto: 'memoria:experiencia' });
  // fin_de_semana: [] es descanso explícito (sin juicio el sábado ni el domingo); para heredar las horas se omite.
  const sinFinde = cambiaron.indexOf('horarios_juicio') >= 0 && Array.isArray(x.horarios_juicio && x.horarios_juicio.fin_de_semana) && !x.horarios_juicio.fin_de_semana.length;
  return { hecho: e.texto, id_accion: e.id, experiencia: filaExperiencia_(x), respetados: respetados.length ? respetados : undefined,
    nota: respetados.length ? 'Esos campos los pidió la persona: no los cambio sin su sí.' : undefined,
    fin_de_semana: sinFinde ? 'fin_de_semana: [] quiere decir sin juicio el sábado ni el domingo. Si querías las horas de entre semana, guarda horarios_juicio sin fin_de_semana.' : undefined };
}

// ---------- Fichas de personas y organizaciones ----------
function normalizarLista_(v, fn, max) {
  if (v === undefined || v === null || v === '') return undefined;
  const a = (Array.isArray(v) ? v : String(v).split(/[,;]/)).map(x => fn(String(x).trim())).filter(Boolean);
  return a.filter((x, i) => a.indexOf(x) === i).slice(0, max || 30);
}

// Remitente conocido por ella, una sola definición para sacar de spam, las bajas y responder: le escribió, abrió sus
// correos o tuvo historia en Recibidos, o tiene una ficha que ella definió. Un juicio de Opus, una ficha de Opus o un
// remitente dudoso no cuentan.
function conocidoPorElla_(st, correo) {
  const x = String(correo || '').trim().toLowerCase();
  if (!x || st.get('remitentes_dudosos', {})[x]) return false;
  if (st.get('conocidos', {})[x] && !st.get('conocidos_por_juicio', {})[x]) return true;
  const corr = st.get('corresponsales', null);
  if (corr && (corr.lista || []).indexOf(x) >= 0) return true;
  const f = fichaDe_(st.get('fichas', []).filter(y => y.definido_por === 'persona'), x);
  return !!(f.persona || f.organizacion);
}
function fichaDe_(fichas, correo) {
  const c = String(correo || '').toLowerCase(), d = dominio_(c);
  const persona = fichas.filter(f => f.tipo === 'persona' && (f.direcciones || []).indexOf(c) >= 0)[0] || null;
  let org = null;
  if (persona && persona.organizacion) org = fichas.filter(f => f.id === persona.organizacion)[0] || null;
  if (!org) org = fichas.filter(f => f.tipo === 'organizacion' && ((f.direcciones || []).indexOf(c) >= 0 || (d && (f.dominios || []).some(x => d === x || d.slice(-(x.length + 1)) === '.' + x))))[0] || null;
  return { persona: persona, organizacion: org };
}

function filaFicha_(f, fichas) {
  const org = f.organizacion && fichas ? fichas.filter(x => x.id === f.organizacion)[0] : null;
  return { id: f.id, tipo: f.tipo, nombre: f.nombre, direcciones: f.direcciones || [], dominios: f.dominios || undefined, chats_whatsapp: f.chats_whatsapp || undefined,
    organizacion: f.organizacion || undefined, organizacion_nombre: org ? org.nombre : undefined, rol: f.rol || undefined, relacion: f.relacion || undefined,
    importancia: f.importancia || 'normal', temas_abiertos: f.temas_abiertos || undefined, ultima_interaccion: f.ultima_interaccion || undefined, notas: f.notas || undefined,
    definido_por: f.definido_por, fijado_por_la_persona: f.bloqueados && f.bloqueados.length ? f.bloqueados : undefined, actualizada: f.actualizada ? fecha_(f.actualizada) : undefined };
}

function verFichas_(st, filtro) {
  if (typeof filtro === 'string') filtro = /@/.test(filtro) ? { correo: filtro } : { texto: filtro };
  const fichas = st.get('fichas', []);
  let r = fichas;
  let nota;
  if (filtro.id) r = fichas.filter(f => f.id === filtro.id);
  else if (filtro.correo) {
    const x = fichaDe_(fichas, filtro.correo);
    r = [x.persona, x.organizacion].filter(Boolean);
  } else if (filtro.organizacion) {
    r = fichas.filter(f => f.tipo === 'persona' && f.organizacion === filtro.organizacion);
    const o = fichas.filter(f => f.id === filtro.organizacion)[0];
    if (!o) throw new Error('No hay una ficha de organización ' + filtro.organizacion + '.');
    nota = 'Gente de ' + o.nombre + ': ' + r.length + '.';
  } else if (filtro.dominio) {
    const d = String(filtro.dominio).toLowerCase().replace(/^@/, '');
    r = fichas.filter(f => (f.dominios || []).indexOf(d) >= 0 || (f.tipo === 'persona' && (f.direcciones || []).some(c => dominio_(c) === d)));
  } else if (filtro.texto) {
    const palabras = sinAcentos_(filtro.texto).toLowerCase().split(/\s+/).filter(Boolean);
    r = fichas.filter(f => { const t = sinAcentos_([f.nombre, f.rol, f.relacion, f.notas, lista_(f.direcciones), lista_(f.dominios), lista_(f.temas_abiertos)].join(' ')).toLowerCase(); return palabras.every(w => t.indexOf(w) >= 0); });
  }
  if (filtro.tipo) r = r.filter(f => f.tipo === filtro.tipo);
  const max = argEntero_(filtro.maximo, 50, 1, 200);
  return { parte: 'fichas', total: r.length, fichas: r.slice(0, max).map(f => filaFicha_(f, fichas)), fichas_guardadas: fichas.length, nota: nota };
}

// La ficha usa alta, normal y baja; «media», la escala del juicio, cuenta como normal.
function importanciaFicha_(v) {
  const x = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const y = x === 'media' ? 'normal' : x;
  if (MEMORIA.IMPORTANCIAS.indexOf(y) < 0) throw new Error('importancia vale alta, normal o baja («media» cuenta como normal); llegó «' + corto_(x, 20) + '».');
  return y;
}

function guardarFichas_(st, datos) {
  const lote = Array.isArray(datos) ? datos : (Array.isArray(datos.fichas) ? datos.fichas : [datos]);
  if (!lote.length || !lote[0]) throw new Error('Falta la ficha: {tipo: "persona", nombre, direcciones: ["ana@empresa.com"], organizacion, rol, relacion, importancia} o {tipo: "organizacion", nombre, dominios: ["empresa.com"]}.');
  if (lote.length > MEMORIA.MAX_LOTE) throw new Error('Se guardan hasta ' + MEMORIA.MAX_LOTE + ' fichas por llamada.');
  let fichas = st.get('fichas', []);
  const antes = [];
  const salida = [];
  const respetados = [];
  const retiradas = [];
  let corrigio = 0;
  const errores = [];
  // Las organizaciones van primero: así una persona del mismo lote se liga a una organización nueva por su nombre.
  const esOrg = d => d && typeof d === 'object' && (String(d.tipo || '').toLowerCase() === 'organizacion' || (!d.tipo && (d.dominios || d.dominio) && !(d.direcciones || d.correos || d.correo)));
  const orden = lote.map((d, i) => i).sort((a, b) => (esOrg(lote[b]) ? 1 : 0) - (esOrg(lote[a]) ? 1 : 0) || a - b);
  // Una ficha con error no tumba el lote: se regresa lo que tocó y se guardan las demás, como en guardar_juicio.
  orden.forEach(i => {
    const foto = { fichas: JSON.stringify(fichas), antes: antes.length, retiradas: retiradas.length, respetados: respetados.length, corrigio: corrigio };
    try { unaFicha(i); }
    catch (e) {
      fichas = JSON.parse(foto.fichas); antes.length = foto.antes; retiradas.length = foto.retiradas; respetados.length = foto.respetados; corrigio = foto.corrigio;
      const d = lote[i];
      salida[i] = { ficha: i + 1, nombre: d && typeof d === 'object' && d.nombre ? String(d.nombre).slice(0, 80) : undefined, error: mensajeError_(e) };
      errores.push(i);
    }
  });
  if (errores.length === lote.length) throw new Error(errores.length === 1 ? salida[errores[0]].error : 'No se guardó ninguna ficha. ' + errores.slice(0, 3).map(i => 'Ficha ' + (i + 1) + ': ' + salida[i].error).join(' '));
  function unaFicha(i) {
    const d = lote[i];
    if (!d || typeof d !== 'object') throw new Error('La ficha ' + (i + 1) + ' no es un objeto.');
    const porPersona = String(d.definido_por || (VIA === 'webapp' ? 'persona' : 'opus')).toLowerCase() === 'persona';
    // {id, retirar: true} quita la ficha, con Deshacer. Lo que definió la persona solo lo retira ella.
    if (d.retirar === true || d.retirar === 'true') {
      const r = fichas.filter(x => x.id === d.id)[0];
      if (!r) throw new Error('Para retirar una ficha pasa su id (' + (d.id || 'sin id') + ' no existe).');
      if (r.definido_por === 'persona' && !porPersona) { respetados.push(r.nombre + ' (retirar)'); salida[i] = { id: r.id, nombre: r.nombre, tipo: r.tipo, retirada: false }; return; }
      retiradas.push(JSON.parse(JSON.stringify(r)));
      fichas = fichas.filter(x => x.id !== r.id);
      // Las personas ligadas a una organización retirada quedan sin organización.
      fichas.forEach(x => { if (x.organizacion === r.id) { if (!antes.some(y => y.id === x.id)) antes.push(JSON.parse(JSON.stringify(x))); delete x.organizacion; } });
      salida[i] = { id: r.id, nombre: r.nombre, tipo: r.tipo, retirada: true };
      return;
    }
    const direcciones = normalizarLista_(d.direcciones || d.correos || d.correo, x => x.toLowerCase().indexOf('@') > 0 ? x.toLowerCase() : null, 30);
    const dominios = normalizarLista_(d.dominios || d.dominio, x => x.toLowerCase().replace(/^@/, '').replace(/^www\./, ''), 20);
    let f = d.id ? fichas.filter(x => x.id === d.id)[0] : null;
    if (d.id && !f) throw new Error('No hay una ficha ' + d.id + '. Para una nueva, no pases id.');
    const tipo = String(d.tipo || (f && f.tipo) || (dominios && !direcciones ? 'organizacion' : 'persona')).toLowerCase();
    if (['persona', 'organizacion'].indexOf(tipo) < 0) throw new Error('tipo vale persona u organizacion.');
    if (!f && direcciones) f = fichas.filter(x => x.tipo === tipo && (x.direcciones || []).some(c => direcciones.indexOf(c) >= 0))[0];
    if (!f && dominios && tipo === 'organizacion') f = fichas.filter(x => x.tipo === 'organizacion' && (x.dominios || []).some(c => dominios.indexOf(c) >= 0))[0];
    if (!f && d.nombre) f = fichas.filter(x => x.tipo === tipo && sinAcentos_(x.nombre).toLowerCase() === sinAcentos_(d.nombre).toLowerCase())[0];
    const nueva = !f;
    if (nueva) {
      if (!d.nombre) throw new Error('La ficha ' + (i + 1) + ' necesita nombre.');
      if (tipo === 'persona' && !direcciones && !d.chats_whatsapp) throw new Error('La ficha de ' + d.nombre + ' necesita direcciones o chats_whatsapp.');
      if (fichas.length >= MEMORIA.MAX_FICHAS) throw new Error('Hay ' + MEMORIA.MAX_FICHAS + ' fichas, el tope. Las de remitentes masivos van en las políticas, no en fichas.');
      f = { id: nuevoId_(st, 'f'), tipo: tipo, nombre: '', direcciones: [], definido_por: porPersona ? 'persona' : 'opus', creada: Date.now() };
      fichas.push(f);
    } else if (!antes.some(y => y.id === f.id)) antes.push(JSON.parse(JSON.stringify(f)));
    // Una rutina no cambia una ficha que ella definió: lo que la vuelve conocida es su decisión.
    if (!nueva && f.definido_por === 'persona' && !porPersona && typeof enRutina_ === 'function' && enRutina_()) {
      respetados.push(f.nombre); salida[i] = { id: f.id, nombre: f.nombre, tipo: f.tipo, sin_cambio: true }; return; }
    const bloq = f.bloqueados || [];
    const cambia = {};
    MEMORIA.CAMPOS_FICHA.forEach(k => {
      let v = k === 'direcciones' ? direcciones : k === 'dominios' ? dominios : d[k];
      if (v === undefined) return;
      if (k === 'chats_whatsapp' || k === 'temas_abiertos') v = normalizarLista_(v, x => x.slice(0, 100), k === 'temas_abiertos' ? 8 : 20) || [];
      if (k === 'importancia') v = importanciaFicha_(v);
      // organizacion: el id de una ficha de organización o su nombre (también una nueva del mismo lote).
      if (k === 'organizacion' && v && !fichas.some(x => x.id === v && x.tipo === 'organizacion')) {
        const o = fichas.filter(x => x.tipo === 'organizacion' && sinAcentos_(x.nombre).toLowerCase() === sinAcentos_(String(v)).toLowerCase().trim())[0];
        if (!o) throw new Error('organizacion es el id o el nombre de una ficha de organización («' + v + '» no existe). Inclúyela en el mismo lote ({tipo: "organizacion", nombre, dominios}) o usa su id.');
        v = o.id;
      }
      if (k === 'ultima_interaccion' && v && typeof v === 'object') v = { fecha: String(v.fecha || '').slice(0, 20), canal: String(v.canal || 'correo').slice(0, 20), resumen: String(v.resumen || '').slice(0, 300) };
      if (typeof v === 'string') v = v.trim().slice(0, k === 'notas' ? 1000 : 120);
      if (!porPersona && !nueva && bloq.indexOf(k) >= 0 && JSON.stringify(f[k]) !== JSON.stringify(v)) { respetados.push(f.nombre + '.' + k); return; }
      cambia[k] = v;
    });
    Object.assign(f, cambia);
    if (porPersona) {
      f.bloqueados = Object.keys(cambia).filter(k => ['ultima_interaccion', 'temas_abiertos'].indexOf(k) < 0).reduce((a, k) => (a.indexOf(k) < 0 ? a.concat([k]) : a), bloq);
      f.definido_por = 'persona';
      if (!nueva) corrigio++;
      const k0 = Object.keys(cambia)[0];
      anotarSenal_(st, { tipo: 'corrigio_ficha', remitente: (f.direcciones || [])[0] || (f.dominios || [])[0] || '', asunto: f.nombre, detalle: Object.keys(cambia).join(', '), ficha: f.id,
        dx: k0 ? { campo: k0, valor: cambia[k0], campos: Object.keys(cambia).length > 1 ? Object.keys(cambia) : undefined } : undefined });
    }
    f.actualizada = Date.now();
    salida[i] = { id: f.id, nombre: f.nombre, tipo: f.tipo, nueva: nueva || undefined };
  }
  st.set('fichas', fichas);
  const hechas = salida.filter(x => !x.error);
  const guardadas = hechas.filter(x => !x.retirada && x.retirada !== false), quitadas = hechas.filter(x => x.retirada);
  // En Actividad, a quién conoció Opus o qué corrigió la persona, sin la palabra ficha; los errores van solo en la respuesta.
  const nom = xs => listaNombres_(xs.map(x => x.nombre)), nuevas = guardadas.filter(x => x.nueva), viejas = guardadas.filter(x => !x.nueva);
  const np = nuevas.filter(x => x.tipo !== 'organizacion').length, no = nuevas.length - np;
  const cuantos = [np ? (np === 1 ? 'a 1 persona' : 'a ' + np + ' personas') : '', no ? (no === 1 ? '1 organización' : no + ' organizaciones') : ''].filter(Boolean).join(' y ');
  const textoF = [actor_() === 'persona' ? (guardadas.length ? 'Corregiste lo que sé de ' + nom(guardadas) + '.' : '')
      : (nuevas.length ? 'Conocí ' + cuantos + ' de tu correo: ' + nom(nuevas) + '.' : '') + (viejas.length ? (nuevas.length ? ' ' : '') + 'Aprendí más de ' + nom(viejas) + '.' : ''),
    quitadas.length ? 'Borré lo que sabía de ' + nom(quitadas) + '.' : ''].filter(Boolean).join(' ') || 'No cambió nada de lo que sé de tu gente.';
  const textoE = errores.length ? ' ' + (errores.length === 1 ? 'Una ficha no se guardó' : errores.length + ' fichas no se guardaron') + ' por un error: está en fichas[].error.' : '';
  const e = anotar_(st, { texto: textoF,
    d: { tipo: 'fichas', nuevas: hechas.filter(x => x.nueva).map(x => x.id), antes: antes, retiradas: retiradas.length ? retiradas : undefined }, objeto: hechas.length === 1 ? 'ficha:' + hechas[0].id : hechas.map(x => 'ficha:' + x.id).join(',') });
  return { hecho: e.texto + textoE, id_accion: e.id, fichas: salida, errores: errores.length || undefined, correcciones_de_la_persona: corrigio || undefined,
    respetados: respetados.length ? respetados : undefined, nota: respetados.length ? 'Esos campos los corrigió la persona: no los cambio. Si crees que cambiaron, pregúntale con proponer.' : undefined };
}

function deshacerFichas_(st, d) {
  const quitar = {};
  (d.nuevas || []).forEach(id => { quitar[id] = 1; });
  const porId = {};
  (d.antes || []).forEach(f => { porId[f.id] = f; });
  // Las retiradas vuelven completas.
  const actuales = st.get('fichas', []).filter(f => !quitar[f.id]).map(f => porId[f.id] || f);
  const vuelven = (d.retiradas || []).filter(r => !actuales.some(f => f.id === r.id));
  st.set('fichas', actuales.concat(vuelven));
  return { fichas_quitadas: (d.nuevas || []).length, fichas_restauradas: (d.antes || []).length + vuelven.length };
}
