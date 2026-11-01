// --- Señales desde el historial de Gmail ---
// El motor lee el historial y anota lo que hizo la persona: abrió, respondió, estrella, rescate, borró sin abrir,
// archivó sin leer, marcado masivo, envió o editó un borrador del motor. Lo que hizo el motor deja huella y se
// descarta. Un rescate pone al remitente como excepción de la política que lo movió.

const SENAL = {
  MASIVO: 20,
  VENTANA_MASIVO_MS: 15 * 60000,
  MAX_PARES: 20,
  MAX_ABRIO_CORRIDA: 60,
  HORAS_OPUS: 24,
  UMBRAL: 3,
  DIAS_UMBRAL: 30
};

function etiquetaPrevia_(l, nombres, quitoInbox) {
  const cos = l.map(id => nombres[id]).filter(n => esEtiquetaCos_(n))[0];
  if (cos) return relativaCos_(cos);
  if (quitoInbox || l.indexOf('INBOX') >= 0) return 'Recibidos';
  const propia = l.filter(id => /^Label_/.test(id)).map(id => nombres[id]).filter(Boolean)[0];
  return propia || 'Archivo';
}

function procesarSenales_(st, hist, ctx, res) {
  const huellas = st.get('huellas', {});
  const movidos = st.get('movidos', {});
  const esCos = id => esEtiquetaCos_(ctx.nombres[id]);
  const dePersona = [];
  let delMotor = 0;
  hist.eventos.forEach(ev => { if (consumirHuella_(huellas, ev.id, ev.s)) delMotor++; else dePersona.push(ev); });
  st.set('huellas', huellas);
  // Cuándo leyó la persona cada hilo: Bandeja limpia archiva N horas después de leído.
  const lect = dePersona.filter(ev => ev.s === '-UNREAD' && ev.hilo);
  if (lect.length) {
    const le = st.get('leido_en', {});
    lect.forEach(ev => { le[ev.hilo] = Date.now(); });
    // Vive en las propiedades del script (500 KB en total): basta con las 72 horas que puede esperar Bandeja limpia.
    const lim = Date.now() - 72 * 3600000;
    const k = Object.keys(le).filter(x => le[x] >= lim).sort((a, b) => le[b] - le[a]).slice(0, 1500);
    const le2 = {};
    k.forEach(x => { le2[x] = le[x]; });
    st.set('leido_en', le2);
  }
  res.senales = { eventos: hist.eventos.length, del_motor: delMotor, de_la_persona: dePersona.length, nuevas: [] };
  // Marcado masivo: 20 o más lecturas en un mismo registro del historial, o en una corrida de 15 minutos o menos.
  const lecturas = dePersona.filter(ev => ev.s === '-UNREAD');
  const porRegistro = {};
  lecturas.forEach(ev => { porRegistro[ev.r] = (porRegistro[ev.r] || 0) + 1; });
  const masivo = Object.keys(porRegistro).some(k => porRegistro[k] >= SENAL.MASIVO) ||
    (lecturas.length >= SENAL.MASIVO && ctx.ventanaMs !== null && ctx.ventanaMs <= SENAL.VENTANA_MASIVO_MS);
  if (masivo) {
    const mm = st.get('marcados_masivos', []);
    mm.unshift({ t: Date.now(), n: lecturas.length });
    st.set('marcados_masivos', mm.slice(0, 10));
    anotarSenal_(st, { tipo: 'marcado_masivo', canal: 'gmail', detalle: lecturas.length + ' correos marcados leídos de golpe: no cuentan como abiertos' });
    res.senales.nuevas.push({ tipo: 'marcado_masivo', lecturas: lecturas.length });
  }
  const neto = {};
  dePersona.forEach(ev => {
    const n = neto[ev.id] = neto[ev.id] || { hilo: ev.hilo };
    if (ev.s === '+INBOX' || ev.s === '-INBOX') n.inbox = ev.s[0];
    else if (ev.s === '+TRASH' || ev.s === '-TRASH') n.trash = ev.s[0];
    else if (ev.s === '-UNREAD') n.leyo = !masivo;
    else if (ev.s === '+STARRED') n.estrella = true;
    else if (ev.s === '+SPAM') n.spam = true;
    else if (ev.s === '+IMPORTANT') n.importante = ev.t || 1;
    else if (ev.s === '+UNREAD') n.noLeido = true;
    else if (/^\+Label_/.test(ev.s)) n.etiqueta = ev.s.slice(1);
    if (ev.s === '-INBOX') n.quitoInbox = true;
  });
  const ids = Object.keys(neto).slice(0, 300);
  const metas = {};
  if (ids.length) leerMetadatos_(ids, ctx.t0).forEach(m => { metas[m.id] = m; });
  const ya = {};
  st.get('senales', []).forEach(x => { if (x.id_mensaje) ya[x.tipo + '|' + x.id_mensaje] = 1; });
  let abrio = 0;
  const anota = (tipo, m, extra) => {
    const k = tipo + '|' + m.id;
    if (ya[k]) return;
    ya[k] = 1;
    const de = extra.de || correo_(m.h['From']);
    const s = anotarSenal_(st, { tipo: tipo, canal: 'gmail', id_mensaje: m.id, id_hilo: m.threadId, remitente: de, asunto: extra.as !== undefined ? extra.as : (m.h['Subject'] || ''),
      etiqueta_previa: extra.ep, etiqueta: extra.etiqueta, politica: extra.politica, horas: extra.hr, detalle: extra.detalle, protegido: ctx.corresponsales && ctx.corresponsales[de] ? true : undefined });
    res.senales.nuevas.push({ tipo: tipo, de: de, asunto: s.asunto, etiqueta_previa: s.etiqueta_previa, politica: s.politica });
  };
  ids.forEach(id => {
    const n = neto[id], m = metas[id];
    if (!m) return;
    const l = m.labelIds || [];
    if (l.indexOf('SENT') >= 0 || l.indexOf('DRAFT') >= 0) return;
    const de = correo_(m.h['From']);
    if (!de || de === ctx.yo) return;
    const mov = movidos[id];
    if (n.trash === '+' && l.indexOf('TRASH') >= 0) {
      if (l.indexOf('UNREAD') >= 0) anota('borro_sin_abrir', m, { ep: etiquetaPrevia_(l, ctx.nombres, n.quitoInbox) });
    } else if (n.inbox === '+' && l.indexOf('INBOX') >= 0) {
      const cosActual = l.filter(esCos)[0];
      const cosQuitada = (hist.quitadasCos[id] || []).filter(esCos)[0];
      if (cosActual || cosQuitada || mov) {
        const ep = mov ? mov[0] : relativaCos_(ctx.nombres[cosQuitada || cosActual]);
        const politica = mov && mov[2];
        anota('rescate', m, { ep: ep, politica: politica });
        if (politica) excepcionPorRescate_(st, politica, de);
        delete movidos[id];
      }
    } else if (n.spam && l.indexOf('SPAM') >= 0) {
      anota('marco_spam', m, { ep: etiquetaPrevia_(l.filter(x => x !== 'SPAM'), ctx.nombres, n.quitoInbox) });
    // «Espero respuesta» es un seguimiento, no una carpeta (seguirPorEtiqueta_).
    } else if (n.etiqueta && l.indexOf(n.etiqueta) >= 0 && ctx.nombres[n.etiqueta] && !esCos(n.etiqueta) && n.etiqueta !== st.get(ESPERO.LLAVE, null)) {
      // Guardó el correo en una etiqueta suya: es lo que una carpeta de la persona puede aprender a hacer.
      anota('archivo_en_etiqueta', m, { ep: n.quitoInbox ? 'Recibidos' : undefined, etiqueta: ctx.nombres[n.etiqueta] });
    } else if (n.inbox === '-' && l.indexOf('INBOX') < 0 && l.indexOf('TRASH') < 0 && l.indexOf('SPAM') < 0 && !l.some(esCos)) {
      anota(l.indexOf('UNREAD') >= 0 ? 'archivo_sin_leer' : 'archivo_leido', m, { ep: 'Recibidos' });
    }
    // Importante: Gmail marca solo al llegar; lo que se marca una hora después lo hizo la persona.
    if (n.importante && l.indexOf('IMPORTANT') >= 0 && Number(m.internalDate) < Date.now() - 3600000) anota('marco_importante', m, { ep: etiquetaPrevia_(l, ctx.nombres, false) });
    if (n.noLeido && l.indexOf('UNREAD') >= 0) anota('marco_no_leido', m, { ep: etiquetaPrevia_(l, ctx.nombres, false) });
    if (n.leyo && l.indexOf('UNREAD') < 0 && abrio < SENAL.MAX_ABRIO_CORRIDA) {
      abrio++;
      anota('abrio', m, { ep: etiquetaPrevia_(l, ctx.nombres, false), politica: mov && mov[2] });
    }
    if (n.estrella && l.indexOf('STARRED') >= 0) anota('estrella', m, { ep: etiquetaPrevia_(l, ctx.nombres, false) });
  });
  st.set('movidos', movidos);
  // Respuestas suyas: a quién y cuánto tardó desde el último mensaje de la otra persona.
  const enviados = hist.enviados.slice(0, 40);
  if (!enviados.length) return;
  const porHilo = {};
  enviados.forEach(e => { (porHilo[e.hilo] = porHilo[e.hilo] || []).push(e.id); });
  const hilos = Object.keys(porHilo);
  const datos = gmailFetchAll_(hilos.map(h => 'threads/' + h + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc&metadataHeaders=Subject'), 20);
  const corr = st.get('corresponsales', null);
  const conocidos = st.get('conocidos', {});
  const borradores = st.get('borradores_motor', []);
  const delMotorB = {};
  borradores.forEach(b => { delMotorB[b.h] = b; });
  const deBorrador = [];
  hilos.forEach((h, k) => {
    const t = datos[k];
    if (!t) return;
    const ms = sinBorradores_(t.messages);
    const asunto = ms.length ? (cabeceras_(ms[0]).subject || '') : '';
    porHilo[h].forEach(idEnv => {
      const env = ms.filter(m => m.id === idEnv)[0];
      if (!env) return;
      const he = cabeceras_(env);
      correos_([he.to, he.cc, he.bcc].join(',')).forEach(x => {
        if (x === ctx.yo) return;
        if (corr && corr.lista.indexOf(x) < 0) corr.lista.push(x);
        if (!conocidos[x]) conocidos[x] = Date.now();
      });
      const previos = ms.filter(m => Number(m.internalDate) < Number(env.internalDate) && !tiene_(m, 'SENT'));
      if (!previos.length) return;
      const prev = previos[previos.length - 1];
      const de = correo_(cabeceras_(prev).from);
      if (!de || de === ctx.yo) return;
      const horas = +((Number(env.internalDate) - Number(prev.internalDate)) / 3600000).toFixed(1);
      anota('respondio', { id: idEnv, threadId: h, h: {} }, { de: de, as: asunto, hr: horas, ep: 'Enviados' });
    });
    const b = delMotorB[h];
    if (b) {
      const env = ms.filter(m => tiene_(m, 'SENT') && Number(m.internalDate) > b.t && porHilo[h].indexOf(m.id) >= 0)[0];
      if (env) deBorrador.push({ b: b, id: env.id, h: h, as: asunto });
    }
  });
  // Un envío en un hilo donde el motor dejó un borrador: la persona lo envió tal cual o editado.
  if (deBorrador.length) {
    const cuerpos = gmailFetchAll_(deBorrador.map(x => 'messages/' + x.id + '?format=full'), 10);
    const pares = st.get('pares_borrador', []);
    deBorrador.forEach((x, k) => {
      const tx = cuerpos[k] ? sinCitas_(contenido_(cuerpos[k].payload).texto).slice(0, COS.MAX_TEXTO_PAR) : null;
      if (tx === null) return;
      const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
      const cambio = norm(tx) !== norm(x.b.tx);
      anota(cambio ? 'edito_borrador' : 'envio_borrador', { id: x.id, threadId: x.h, h: {} }, { de: x.b.para.split(',')[0], as: x.as, ep: 'Enviados', politica: 'respuestas' });
      sumarMetrica_(st, 'respuestas', cambio ? 'c' : 'a');
      if (cambio) pares.unshift({ t: Date.now(), h: x.h, para: x.b.para, cambio: true, borrador: x.b.tx, enviado: tx });
    });
    st.set('pares_borrador', pares.slice(0, SENAL.MAX_PARES));
    const usados = {};
    deBorrador.forEach(x => { usados[x.b.dr] = 1; });
    st.set('borradores_motor', borradores.filter(b => !usados[b.dr]));
  }
  if (corr) st.set('corresponsales', corr);
  st.set('conocidos', conocidos);
}

// Borradores del motor: si la persona lo borró sin enviar, descarto_borrador; si pasan 7 días sin enviarse, rechazado.
function revisarBorradores_(st) {
  const l = st.get('borradores_motor', []);
  const viejos = l.filter(b => Date.now() - b.t > 3600000).slice(0, 20);
  if (!viejos.length) return;
  const datos = gmailFetchAll_(viejos.map(b => 'drafts/' + b.dr + '?format=minimal'), 20);
  const quitar = {};
  viejos.forEach((b, k) => {
    if (!datos[k]) { anotarSenal_(st, { tipo: 'descarto_borrador', canal: 'gmail', id_hilo: b.h, remitente: b.para.split(',')[0], politica: 'respuestas', detalle: 'borró el borrador sin enviarlo' }); sumarMetrica_(st, 'respuestas', 'r'); quitar[b.dr] = 1; }
    else if (Date.now() - b.t > COS.DIAS_OBSERVADA * 86400000) { sumarMetrica_(st, 'respuestas', 'r'); quitar[b.dr] = 1; }
  });
  if (Object.keys(quitar).length) st.set('borradores_motor', l.filter(b => !quitar[b.dr]));
}

// Respaldo: si el juicio de Opus lleva 24 h detenido, el motor propone con tres señales iguales.
function proponerRespaldo_(st, res) {
  // Solo si el juicio de Opus lleva 24 horas detenido; Hoy lo avisa con juicio_detenido.
  const r = st.get('rutinas', {});
  if (r.juicio && Date.now() - r.juicio < COS.HORAS_JUICIO_DETENIDO * 3600000) return;
  const lim = Date.now() - SENAL.DIAS_UMBRAL * 86400000;
  // Una política nueva y angosta, solo para ese remitente, en Me propone: aceptar el respaldo no enciende una política entera.
  const destino = { borro_sin_abrir: { acciones: ['papelera'], a: 'la papelera' }, archivo_sin_leer: { acciones: ['carpeta:' + COS.LEER_DESPUES], a: COS.LEER_DESPUES + ' sin marcarlos leídos' } };
  const cuenta = {};
  st.get('senales', []).filter(x => x.t >= lim && destino[x.tipo] && x.remitente && !x.protegido).forEach(x => {
    const k = x.tipo + '|' + x.remitente;
    cuenta[k] = (cuenta[k] || 0) + 1;
  });
  const VIA0 = VIA;
  VIA = 'motor';
  try {
    Object.keys(cuenta).filter(k => cuenta[k] >= SENAL.UMBRAL).slice(0, 3).forEach(k => {
      const tipo = k.split('|')[0], rem = k.split('|')[1];
      const des = destino[tipo];
      if (listaPoliticas_(st).some(p => p.estado !== 'retirada' && (tieneValor_(p.compilado.condiciones, 'remitente', rem) || tieneValor_(p.compilado.excepciones, 'remitente', rem)))) return;
      try {
        const p = proponer_(st, { tipo: 'politica', objeto: 'respaldo:' + tipo + ':' + rem, texto: (tipo === 'borro_sin_abrir' ? 'Borraste sin abrir ' : 'Archivaste sin leer ') + cuenta[k] + ' correos de ' + rem + '. ¿Los mando a ' + des.a + '?',
          evidencia: { cifra: cuenta[k] }, opciones: [{ etiqueta: 'Sí', efecto: { politica: { nombre: rem, texto: 'Lo de ' + rem + ' va a ' + des.a + '.', acciones: des.acciones,
            compilado: { condiciones: [{ campo: 'remitente', valores: [rem] }] }, nivel: 'propone' } } }, { etiqueta: 'No', efecto: null }] });
        if (!p.repetida) (res.respaldo = res.respaldo || []).push(p.id);
      } catch (e) {}
    });
  } finally { VIA = VIA0; }
}
