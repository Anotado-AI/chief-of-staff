// --- Bandeja limpia para lo que ya está en Recibidos al instalar ---
// Lo de los últimos 30 días no entra: eso lo archiva Bandeja limpia solo con juicio de Opus. Lo anterior, leído, sin
// estrella y sin borrador, se archiva solo con la aprobación explícita de ese alcance en el plan (el efecto
// {bandeja_inicial: {antes_de}} fija la fecha) o desde la web app. Nadie lo revisó uno por uno: Actividad lo dice así y
// no lo presenta como resuelto. Va por partes en las corridas de 10 minutos, con una sola línea y un Deshacer que
// regresa todo. Se quedan además los hilos con seguimiento abierto, Conservar o juicio de riesgo o alta, y lo que nunca se
// limpia (accesos, alertas de seguridad, cobros fallidos, cambios de plan o contrato y suspensiones). Nunca archiva
// sin leer. Los ids van en la pestaña "Archivo inicial": son miles y no caben en las propiedades.
// El modo lo elige la persona: archivar (lo de siempre, también sin modo), leido (marca leído lo sin
// leer anterior a la fecha y lo deja en Recibidos, con las mismas exclusiones) o ambos (archiva lo que ya estaba leído y
// después marca leído lo sin leer, que se queda en Recibidos). Lo marcado va en la pestaña "Leído inicial".
// Es un trabajo de una sola vez, aparte de lo diario: corre con su propio activador de un minuto
// (limpiezaInicial), que se vuelve a programar mientras falte y se borra al terminar. Cada vuelta lee la lista completa
// una vez y mueve por posición hasta cero; lo que se queda vive en la caché y se recalcula cada 30 minutos. Sin ese
// activador, la corrida de 10 minutos lo avanza como antes.

const INICIAL = { LLAVE: 'bandeja_inicial', MS_CORRIDA: 45000, POR_RENGLON: 2000, DIAS_RECIENTES: 30, MAX_RECIENTES: 5000, DIAS_EN_HOY: 7,
  MODOS: ['archivar', 'leido', 'ambos'], PAGINAS_NUNCA: 10, MAX_NUNCA: 3000, ACTIVADOR: 'limpiezaInicial', MS_ACTIVADOR: 240000, MS_QUEDAN: 1800000, MAX_EXACTA: 3000 };
const MOTIVO_INICIAL = { s: 'sin leer', e: 'estrella', b: 'borrador', g: 'seguimiento abierto', j: 'juicio de riesgo o alta', k: 'conservar', r: 'posterior a la fecha de corte: espera el juicio de Opus',
  n: 'nunca se limpia: acceso, alerta de seguridad, cobro fallido, cambio de plan o suspensión' };

function idsDeConsulta_(q, tipo, max) {
  const out = [];
  let pag = null, vueltas = 0;
  do {
    const r = conReintento_(() => tipo === 'hilos' ? Gmail.Users.Threads.list('me', { q: q, maxResults: 500, pageToken: pag || undefined })
      : Gmail.Users.Messages.list('me', { q: q, maxResults: 500, pageToken: pag || undefined }));
    (tipo === 'hilos' ? r.threads || [] : r.messages || []).forEach(x => out.push(tipo === 'hilos' ? x.id : x.threadId));
    pag = r.nextPageToken;
    vueltas++;
  } while (pag && out.length < max && vueltas < 40);
  return { ids: out, topo: !!pag };
}

// La fecha de corte: "AAAA-MM-DD" a las 0:00, al menos 30 días atrás. Sin fecha, hace 30 días.
function corteInicial_(antesDe) {
  const z = Utilities.formatDate(new Date(), tz_(), 'XXX');
  const maximo = dia_(Date.now() - INICIAL.DIAS_RECIENTES * 86400000);
  const d = antesDe === undefined || antesDe === null || antesDe === '' || antesDe === true ? maximo : String(antesDe).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !isFinite(Date.parse(d + 'T00:00:00' + z))) throw new Error('La fecha de corte (hasta) es AAAA-MM-DD (llegó ' + corto_(d, 40) + ').');
  if (d > maximo) throw new Error('La fecha de corte (hasta) va al menos 30 días atrás (' + maximo + ' o antes): lo de los últimos 30 días lo archiva Bandeja limpia solo con juicio de Opus.');
  return { dia: d, s: Math.floor(Date.parse(d + 'T00:00:00' + z) / 1000) };
}

// archivar, leido o ambos. Sin modo, archivar.
function modoInicial_(m) {
  if (m === undefined || m === null || m === '') return 'archivar';
  const v = sinAcentos_(String(m)).toLowerCase().trim();
  if (INICIAL.MODOS.indexOf(v) < 0) throw new Error('modo es archivar, leido o ambos (llegó ' + corto_(String(m), 30) + ').');
  return v;
}

// Lo que nunca se limpia en Recibidos antes de la fecha (segundos): Gmail lo busca con BUSQUEDA_NUNCA_LIMPIAR y la regla
// lo confirma con asunto y vista previa. Lo que no alcanza a confirmarse (más de MAX_NUNCA o sin leerse) también se
// queda. falla: alguna búsqueda no respondió, y sin ella no se mueve nada; topo: alguna pasó de PAGINAS_NUNCA páginas.
function nuncaIniciales_(antesDe, sinConfirmar, st) {
  const ruta = (c, pag) => 'messages?maxResults=500&fields=' + encodeURIComponent('messages(id,threadId),nextPageToken') +
    '&q=' + encodeURIComponent('in:inbox before:' + antesDe + ' ' + c) + (pag ? '&pageToken=' + encodeURIComponent(pag) : '');
  const hiloDe = {};
  let falla = false, topo = false;
  let pend = BUSQUEDA_NUNCA_LIMPIAR.map(c => ({ c: c, pag: null, n: 0 }));
  while (pend.length) {
    const r = gmailUnoPorUno_(pend.map(x => ruta(x.c, x.pag)), 25);
    const sigue = [];
    pend.forEach((x, k) => {
      if (!r[k]) { falla = true; return; }
      (r[k].messages || []).forEach(m => { hiloDe[m.id] = m.threadId; });
      if (!r[k].nextPageToken) return;
      if (x.n + 1 < INICIAL.PAGINAS_NUNCA) sigue.push({ c: x.c, pag: r[k].nextPageToken, n: x.n + 1 }); else topo = true;
    });
    pend = sigue;
  }
  const ids = Object.keys(hiloDe), hilos = {};
  if (sinConfirmar) { ids.forEach(id => { hilos[hiloDe[id]] = 1; }); return { hilos: hilos, falla: falla, topo: topo, sin_confirmar: true }; }
  ids.slice(INICIAL.MAX_NUNCA).forEach(id => { hilos[hiloDe[id]] = 1; });
  const revisar = ids.slice(0, INICIAL.MAX_NUNCA);
  const datos = gmailFetchAll_(revisar.map(id => 'messages/' + id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=List-Unsubscribe&fields=' + encodeURIComponent('id,threadId,labelIds,snippet,internalDate,payload/headers')), 25);
  revisar.forEach((id, k) => {
    if (!datos[k]) { hilos[hiloDe[id]] = 1; return; }
    const m = metadatoDe_(datos[k]);
    if (!tiene_(m, 'SENT') && nuncaSeLimpiaSalvoCodigo_((m.h['Subject'] || '') + ' ' + (m.snippet || ''), masivoAdeudo_(m, st), m)) hilos[hiloDe[id]] = 1;
  });
  return { hilos: hilos, falla: falla, topo: topo };
}

// Hilos de Recibidos que se quedan, con su motivo en una letra. Sin lo sin leer (conSinLeer false): los que se quedan
// sin marcar leídos en el modo leido.
function quedanIniciales_(st, antesDe, conSinLeer, sinConfirmar) {
  const q = {};
  const marca = (h, k) => { if (h && !q[h]) q[h] = k; };
  if (conSinLeer !== false) idsDeConsulta_('in:inbox is:unread', 'mensajes', 20000).ids.forEach(h => marca(h, 's'));
  idsDeConsulta_('in:inbox is:starred', 'mensajes', 5000).ids.forEach(h => marca(h, 'e'));
  try { ((conReintento_(() => Gmail.Users.Drafts.list('me', { maxResults: 500 })) || {}).drafts || []).forEach(d => marca(d.message && d.message.threadId, 'b')); } catch (e) {}
  const nunca = nuncaIniciales_(antesDe, sinConfirmar, st);
  Object.keys(nunca.hilos).forEach(h => marca(h, 'n'));
  // Lo que el motor sabe que pide algo, de cualquier fecha, si sigue en Recibidos.
  const pide = {};
  st.get('seguimientos', []).filter(s => s.estado === 'abierto' && s.hilo).forEach(s => { pide[s.hilo] = 'g'; });
  const juicios = st.get('juicios', {});
  Object.keys(juicios).forEach(h => {
    const j = juicios[h];
    if (pide[h]) return;
    if (j.conservar) pide[h] = 'k';
    else if (!j.vencido && (j.prioridad === 'riesgo' || j.prioridad === 'alta')) pide[h] = 'j';
  });
  const porVer = Object.keys(pide).filter(h => !q[h]);
  if (porVer.length) {
    const datos = gmailFetchAll_(porVer.map(h => 'threads/' + h + '?format=minimal&fields=messages(labelIds)'), 25);
    porVer.forEach((h, k) => { const t = datos[k]; if (t && (t.messages || []).some(m => (m.labelIds || []).indexOf('INBOX') >= 0)) marca(h, pide[h]); });
  }
  // Un hilo con algún mensaje de los últimos 30 días se queda entero: lo juzga Opus.
  const rec = idsDeConsulta_('in:inbox after:' + antesDe, 'hilos', INICIAL.MAX_RECIENTES);
  rec.ids.forEach(h => marca(h, 'r'));
  return { quedan: q, recientes: rec.ids, recientes_topo: rec.topo, nunca_falla: nunca.falla, nunca_topo: nunca.topo, sin_confirmar: nunca.sin_confirmar };
}

// Las dos cifras, para que la persona elija el modo: los hilos leídos que se archivarían y los sin leer que se marcarían
// leídos, cada una con lo que se queda y por qué.
function cuentaBandejaInicial_(st, antesDe) {
  const t0 = Date.now();
  const corte = corteInicial_(antesDe);
  const x = conReintento_(() => Gmail.Users.Labels.get('me', 'INBOX'));
  // Con más de MAX_EXACTA hilos, lo que nunca se limpia se cuenta por la búsqueda sin leer cada correo: leer hasta 3,000
  // asuntos agotó dos veces el tope por minuto de Gmail en una bandeja de 25 mil hilos. La
  // estimación de Gmail (resultSizeEstimate) no sirve para esto: se topa en 201 hilos por búsqueda (medido en desarrollo).
  const grande = (x.threadsTotal || 0) > INICIAL.MAX_EXACTA;
  const sinLeer = {};
  idsDeConsulta_('in:inbox is:unread', 'mensajes', 20000).ids.forEach(h => { sinLeer[h] = 1; });
  const r = quedanIniciales_(st, corte.s, false, grande);
  const q = {};
  Object.keys(sinLeer).forEach(h => { q[h] = 's'; });
  Object.keys(r.quedan).forEach(h => { if (!q[h]) q[h] = r.quedan[h]; });
  const por = {}, porSinLeer = {};
  Object.keys(q).forEach(h => { const m = MOTIVO_INICIAL[q[h]]; por[m] = (por[m] || 0) + 1; });
  let marcan = 0, quedanSinLeer = 0;
  Object.keys(sinLeer).forEach(h => {
    if (!r.quedan[h]) { marcan++; return; }
    quedanSinLeer++;
    const m = MOTIVO_INICIAL[r.quedan[h]];
    porSinLeer[m] = (porSinLeer[m] || 0) + 1;
  });
  const quedan = Object.keys(q).length;
  const archivan = Math.max(0, (x.threadsTotal || 0) - quedan);
  // Recibidos partido en la fecha de corte, antes de exclusiones: posteriores (algún mensaje desde la fecha) y anteriores.
  const post = { hilos: r.recientes.length, sin_leer: r.recientes.filter(h => sinLeer[h]).length };
  const antHilos = Math.max(0, (x.threadsTotal || 0) - post.hilos), antSinLeer = Object.keys(sinLeer).length - post.sin_leer;
  return { hasta_fecha: corte.dia, leidos: archivan, sin_leer: x.threadsUnread || 0, en_bandeja: x.threadsTotal || 0, correos_en_bandeja: x.messagesTotal || 0, antes_del: corte.dia,
    se_quedan: Math.min(quedan, x.threadsTotal || 0), se_archivan: archivan, se_quedan_por_motivo: por,
    se_marcan_leidos: marcan, se_quedan_sin_leer: quedanSinLeer, se_quedan_sin_leer_por_motivo: porSinLeer, modos: INICIAL.MODOS,
    posteriores: post, anteriores: { hilos: antHilos, leidos: Math.max(0, antHilos - antSinLeer), sin_leer: antSinLeer },
    objeto: 'historico:' + corte.dia,
    aproximado: r.recientes_topo || r.nunca_topo || r.nunca_falla || r.sin_confirmar || undefined, sin_confirmar: r.sin_confirmar || undefined,
    nota_sin_confirmar: r.sin_confirmar ? 'Recibidos tiene más de ' + INICIAL.MAX_EXACTA + ' hilos: lo que nunca se limpia se contó por la búsqueda de Gmail, sin leer el asunto de cada correo, así que se_archivan y se_marcan_leidos quedan cortas y no largas. aplicar lo confirma uno por uno. Di las cifras redondeadas como aproximadas.' : undefined, segundos: +((Date.now() - t0) / 1000).toFixed(1),
    efecto: { bandeja_inicial: true },
    como_leer: 'Hilos de Recibidos. leidos (igual a se_archivan) son los leídos, sin estrella ni borrador, anteriores a hasta_fecha; sin_leer son los hilos de Recibidos con algo sin leer, que nunca se archivan. se_marcan_leidos son los sin leer anteriores a hasta_fecha que se marcarían leídos y se quedan en Recibidos; se_quedan_sin_leer, los que siguen sin leer por estrella, borrador, algo pendiente, un mensaje de los últimos 30 días o porque nunca se limpian (accesos, alertas de seguridad, cobros fallidos, cambios de plan o contrato y suspensiones, que tampoco se archivan leídos). posteriores y anteriores parten Recibidos en hasta_fecha antes de las exclusiones (hilos con algún mensaje desde esa fecha, y los demás, con cuántos están leídos y sin leer): se_archivan sale de anteriores.leidos y se_marcan_leidos de anteriores.sin_leer, menos lo que se queda. La persona elige el modo en la opción: {bandeja_inicial: {antes_de, modo}} con modo archivar (lo leído sale de Recibidos; sin modo es este), leido (lo sin leer se marca leído y se queda) o ambos (las dos cosas; nunca archiva algo que estaba sin leer). Nadie los revisó uno por uno: se hace solo si la persona aprueba ese alcance en su propia propuesta del plan (objeto y efecto de arriba, fuera del "Acepto todo") o desde la web app, por partes en las corridas de 10 minutos, con una línea en Actividad y Deshacer. Lo de los últimos 30 días se queda: lo archiva Bandeja limpia solo con juicio de Opus. Nunca se archiva nada sin leer.' };
}

// La propuesta historico:<fecha> lleva las cifras del motor: lo que se archiva y lo que se queda de lo anterior a la fecha
// suman siempre lo anterior. La frase la arma el motor y solo dice cuántos se quedan: ni lo que se archiva ni lo que se
// marca leído, que son totales. De lo que escribió Opus quedan las oraciones sin cifras.
// La corrida la recalcula a lo más una vez por hora si Recibidos cambió más de 1% y una vez al día aunque no cambie, y
// reescribe la frase si alguna cifra se movió más de 1%.
const HISTORICO = { CAMBIO: 0.01, MS_VISTA: 3600000, MS_DIA: 86400000, MS_CORRIDA: 60000 };
function cifrasHistorico_(c) {
  const anteriores = c.anteriores.hilos, archivan = Math.min(c.se_archivan, anteriores), marcan = c.se_marcan_leidos || 0;
  return { cifra: archivan, anteriores: anteriores, se_archivan: archivan, se_quedan: anteriores - archivan, se_marcan_leidos: marcan,
    modos: { archivar: { archiva: archivan, marca: 0 }, leido: { archiva: 0, marca: marcan }, ambos: { archiva: archivan, marca: marcan } },
    aproximado: c.aproximado || undefined, contada: fecha_(Date.now()) };
}
function cuentaHistorico_(c) { const t = Date.now(); return { t: t, visto: t, en_bandeja: c.en_bandeja, sin_leer: c.sin_leer }; }
function diaDeMes_(d) {
  const a = Number(d.slice(0, 4)), hoy = Number(Utilities.formatDate(new Date(), tz_(), 'yyyy'));
  return Number(d.slice(8, 10)) + ' de ' + MESES[Number(d.slice(5, 7)) - 1] + (a !== hoy ? ' de ' + a : '');
}
// Lo que ve la persona de lo anterior no lleva cifras ni números con letra: de «uno» a «cien», de «doscientos» a
// «novecientos» (también en femenino), docena, decena, cientos, centenar, mil, miles, millar, millón y millones, y sus
// compuestos («mil doscientos»). Las fechas sí; lo que se queda se dice sin número.
const RX_NUMERO_LETRA = /\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diec[ií]\w+|veinte|veint[ií]\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|cientos|(dos|tres|cuatro|seis|ocho)cient[oa]s|quinient[oa]s|setecient[oa]s|novecient[oa]s|docenas?|decenas?|centenar(es)?|mil|miles|millar(es)?|mill[oó]n|millones)\b/i;
const RX_FECHA_ = /\b\d{1,2} de [a-záéíóú]+( de \d{4})?\b|\b\d{4}-\d{2}-\d{2}\b/gi;
function conCifras_(x) { const t = String(x || '').replace(RX_FECHA_, ''); return /\d/.test(t) || RX_NUMERO_LETRA.test(t); }
function sinCifras_(x) {
  const fechas = [];
  return String(x || '').replace(RX_FECHA_, m => { fechas.push(m); return '\u0000' + String.fromCharCode(65 + fechas.length - 1) + '\u0001'; })
    .replace(/\d[\d.,]*/g, '').replace(new RegExp(RX_NUMERO_LETRA.source, 'gi'), '').replace(/\u0000([A-Z])\u0001/g, (m, k) => fechas[k.charCodeAt(0) - 65])
    .replace(/\s+/g, ' ').replace(/\s+(los|las|el|la|de|del|a|y)\s*$/i, '').trim();
}
function textoHistorico_(fecha, ev, opciones, textoOpus) {
  const modos = {};
  (opciones || []).forEach(o => aplanarEfecto_(o.efecto).forEach(e => { if (e && e.bandeja_inicial) modos[(typeof e.bandeja_inicial === 'object' && e.bandeja_inicial.modo) || 'archivar'] = 1; }));
  const archiva = modos.archivar || modos.ambos || !Object.keys(modos).length, marca = (modos.leido || modos.ambos) && ev.se_marcan_leidos > 0;
  const de = 'De lo anterior al ' + diaDeMes_(fecha) + ' en Recibidos, ', q = Number(ev.se_quedan || 0);
  let t = archiva ? de + 'archivo lo leído que no te pide nada; queda buscable.' +
      (q ? ' Lo sin leer, con estrella, borrador o algo pendiente, o que nunca se limpia, se queda en Recibidos.' : '') +
      (marca ? ' Lo sin leer que no te pide nada lo marco leído y se queda en Recibidos.' : '') +
      (q && ev.aproximado ? ' Reviso uno por uno al hacerlo.' : '')
    : de + 'marco leído lo sin leer que no te pide nada y todo se queda en Recibidos. Lo que tiene estrella, borrador o algo pendiente, o que nunca se limpia, sigue sin leer.';
  const resto = String(textoOpus || '').split(/(?<=[.!?])\s+/).filter(x => x && !conCifras_(x)).join(' ');
  return corto_(t + (resto ? ' ' + resto : ''), 500);
}
function refrescarHistorico_(st, t0) {
  const l = listaPropuestas_(st), ahora = Date.now();
  const ps = l.filter(p => p.estado === 'abierta' && /^historico:\d{4}-\d{2}-\d{2}$/.test(String(p.objeto || '')) && !(p.cuenta && ahora - p.cuenta.visto < HISTORICO.MS_VISTA));
  if (!ps.length || ahora - t0 > HISTORICO.MS_CORRIDA) return null;
  const cambio = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) > HISTORICO.CAMBIO * Math.max(Number(a) || 0, Number(b) || 0, 1);
  let x = null;
  const out = [];
  ps.forEach(p => {
    if (p.cuenta && ahora - p.cuenta.t < HISTORICO.MS_DIA) {
      x = x || conReintento_(() => Gmail.Users.Labels.get('me', 'INBOX'));
      p.cuenta.visto = ahora;
      if (!cambio(x.threadsTotal, p.cuenta.en_bandeja) && !cambio(x.threadsUnread, p.cuenta.sin_leer)) return;
    }
    const fecha = String(p.objeto).slice(10), c = cuentaBandejaInicial_(st, fecha), nuevas = cifrasHistorico_(c), ev = p.evidencia || {};
    p.cuenta = cuentaHistorico_(c);
    if (!['se_archivan', 'se_quedan', 'se_marcan_leidos'].some(k => ev[k] === undefined || cambio(nuevas[k], ev[k]))) return;
    if (p.texto_opus === undefined) p.texto_opus = p.texto;
    p.evidencia = Object.assign({}, ev, nuevas);
    p.texto = textoHistorico_(fecha, p.evidencia, p.opciones, p.texto_opus);
    p.actualizada = ahora;
    out.push(p.id);
  });
  st.set('propuestas', l);
  return out.length ? out : null;
}

// La única puerta: el sí explícito de la persona a la propuesta historico:<fecha> (responder). aplicar solo la sigue.
function iniciarBandejaInicial_(st, origen, antesDe, si, modo) {
  const j = st.get(INICIAL.LLAVE, null);
  if (j && (j.estado === 'aplicando' || j.estado === 'deshaciendo')) return { hecho: (j.modo || 'archivar') === 'archivar' ? 'Ya va en curso' + avanceInicial_(j) + '.' : 'Ya va en curso. ' + textoInicial_(j), estado: j.estado, id_accion: j.id_accion, repetida: true };
  if (j && j.estado === 'hecho') return { hecho: (j.modo || 'archivar') === 'archivar' ? 'Ya archivé lo leído anterior al ' + diaDeMes_(j.antes_del || dia_(j.antes_de * 1000)) + ' el ' + fecha_(j.fin) + '.' : 'Ya lo hice el ' + fecha_(j.fin) + '. ' + textoInicial_(j), estado: 'hecho', id_accion: j.id_accion, repetida: true };
  const corte = corteInicial_(antesDe);
  const m = modoInicial_(modo);
  const nuevo = { estado: 'aplicando', modo: m, inicio: Date.now(), antes_de: corte.s, antes_del: corte.dia, archivados: 0, origen: origen || 'persona', si: si || undefined };
  if (m !== 'archivar') { nuevo.fase = m === 'leido' ? 'leido' : 'archivo'; nuevo.marcados = 0; }
  const e = anotar_(st, { texto: textoInicial_(nuevo), actor: 'motor', politica: 'bandeja_limpia', d: { tipo: 'bandeja_inicial' } });
  nuevo.id_accion = e.id;
  try { nuevo.activador = programarLimpieza_(); } catch (e) {}
  st.set(INICIAL.LLAVE, nuevo);
  st.set('bandeja_inicial_ids', []);
  if (m !== 'archivar') st.set('bandeja_inicial_leidos', []);
  return { hecho: e.texto, id_accion: e.id, estado: 'aplicando', modo: m, antes_del: corte.dia, siguiente: 'Corre en la corrida de cada 10 minutos; ver_hoy.bandeja_inicial dice cuánto lleva.' };
}

// aplicar({bandeja_inicial: true}) nunca arranca nada, ni desde la web app: la limpieza empieza al contestar que sí a la
// propuesta historico:<fecha>. Aquí solo se informa cómo va; después de un Deshacer hace falta una propuesta nueva.
function aplicarBandejaInicial_(st, a) {
  const j = st.get(INICIAL.LLAVE, null);
  if (!j) throw new Error('Limpiar lo anterior a los últimos 30 días (archivar lo leído, marcar leído lo sin leer o ambos) empieza solo con el sí explícito de la persona a su propia propuesta: objeto "historico:<fecha>" y una opción con el efecto {bandeja_inicial: {modo}} (simular con lote "bandeja_inicial" y hasta lo cuenta). aplicar no lo arranca.');
  const modo = j.modo || 'archivar';
  return { hecho: modo === 'archivar' ? { aplicando: 'Va en curso', deshaciendo: 'Lo estoy regresando a Recibidos', hecho: 'Ya terminó', deshecho: 'Se deshizo; para volver a archivar hace falta otra propuesta' }[j.estado] + ': lo leído anterior al ' + diaDeMes_(j.antes_del || dia_(j.antes_de * 1000)) + (j.estado === 'aplicando' ? avanceInicial_(j) : '') + '.'
    : textoInicial_(j) + (j.estado === 'deshecho' ? ' Para volver a hacerlo hace falta otra propuesta.' : ''),
    estado: j.estado, modo: modo, archivados: j.archivados, restaurados: j.restaurados, faltan: faltanInicial_(j),
    marcados: j.marcados, desmarcados: j.desmarcados, faltan_leidos: faltanLeidosInicial_(j), id_accion: j.id_accion, repetida: true };
}

// Deshacer: regresa a Recibidos todo lo que archivó y a sin leer lo que marcó leído, también por partes.
function deshacerBandejaInicial_(st) {
  const j = st.get(INICIAL.LLAVE, null);
  if (!j) throw new Error('No hay un archivo inicial que deshacer.');
  if (j.estado === 'deshecho') return { en_proceso: false, restaurados: j.restaurados || 0, desmarcados: j.desmarcados };
  j.estado = 'deshaciendo';
  try { j.activador = programarLimpieza_(); } catch (e) {}
  // posicion: hasta dónde regresó todo. Una Hoja anterior sin posicion repasa desde el principio: regresar a Recibidos
  // lo que ya está ahí no cambia nada.
  if (j.posicion === undefined) { j.posicion = 0; j.restaurados = 0; j.no_existen = 0; delete j.fallidos; }
  if ((j.modo || 'archivar') !== 'archivar' && j.posicion_leido === undefined) { j.posicion_leido = 0; j.desmarcados = 0; j.no_existen_leidos = 0; }
  st.set(INICIAL.LLAVE, j);
  return { en_proceso: true, archivados: j.archivados, marcados: j.marcados,
    nota: (j.modo || 'archivar') === 'archivar' ? 'Regresa a Recibidos por partes en las próximas corridas de 10 minutos.' : 'Regresa a Recibidos lo archivado y a sin leer lo marcado, por partes en las próximas corridas de 10 minutos.' };
}

// Guarda ids en renglones de la pestaña, de POR_RENGLON en POR_RENGLON.
function guardarIdsInicial_(filas, ids) {
  ids.forEach(id => {
    let u = filas[filas.length - 1];
    if (!u || u.ids.length >= INICIAL.POR_RENGLON) { u = { i: filas.length + 1, ids: [], t: Date.now() }; filas.push(u); }
    u.ids.push(id);
  });
}

// Una vuelta de la limpieza sobre lo anterior a la fecha: lee la lista completa una vez, sin tope de páginas y con a lo
// más la mitad del tiempo, y mueve por posición de 1,000 en 1,000. Leer desde el principio para cada 1,000 se atoraba
// cuando lo que se queda pasaba de 6,000 correos al frente. q es la consulta, quedan los hilos que no se
// tocan, agregar y quitar las etiquetas. Devuelve {fin, por_mover, completa}.
function pasadaInicial_(q, quedan, agregar, quitar, limite, alMover) {
  const lista = [];
  const hastaListar = Date.now() + (limite - Date.now()) / 2;
  let pag = null;
  do {
    const r = conReintento_(() => Gmail.Users.Messages.list('me', { q: q, maxResults: 500, pageToken: pag || undefined }));
    (r.messages || []).forEach(m => { if (!quedan[m.threadId]) lista.push(m); });
    pag = r.nextPageToken;
  } while (pag && Date.now() < hastaListar);
  let pos = 0;
  while (pos < lista.length && Date.now() < limite) {
    const lote = lista.slice(pos, pos + 1000);
    modificar_(lote.map(m => m.id), agregar, quitar);
    alMover(lote);
    pos += lote.length;
  }
  return { fin: !pag && pos >= lista.length, por_mover: lista.length - pos, completa: !pag };
}

// Lo que se queda en una fase, en la caché (son miles de hilos y no caben en las propiedades). Se recalcula si falta o
// tiene más de MS_QUEDAN. null si la búsqueda de lo que nunca se limpia no respondió: esa vuelta no mueve nada.
function quedanDeFase_(st, j, conSinLeer) {
  const k = 'inicial_quedan_' + (conSinLeer === false ? 'leido_' : 'archivo_') + j.id_accion;
  const c = cacheTablaLeer_(k);
  if (c && c.q && Date.now() - c.t < INICIAL.MS_QUEDAN) return c.q;
  const r = quedanIniciales_(st, j.antes_de, conSinLeer);
  if (r.nunca_falla) return null;
  cacheTablaPoner_(k, { t: Date.now(), q: r.quedan });
  if (conSinLeer === false) j.n_quedan_sin_leer = idsDeConsulta_('in:inbox is:unread before:' + j.antes_de, 'hilos', 20000).ids.filter(h => r.quedan[h]).length;
  else j.n_quedan = Object.keys(r.quedan).length;
  return r.quedan;
}

// ---------- Su activador: uno de un minuto que se vuelve a programar mientras falte ----------
function programarLimpieza_() {
  if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === INICIAL.ACTIVADOR)) return true;
  ScriptApp.newTrigger(INICIAL.ACTIVADOR).timeBased().after(60 * 1000).create();
  return true;
}
function quitarLimpieza_() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === INICIAL.ACTIVADOR) ScriptApp.deleteTrigger(t); });
}
function limpiezaVive_() {
  try { return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === INICIAL.ACTIVADOR); } catch (e) { return false; }
}
// Una vuelta: la corrida completa (lee primero lo nuevo y las señales) con 4 minutos para la limpieza. Se programa la
// siguiente antes de empezar, por si esta no termina; al quedar hecha, deshecha o en pausa, se borra.
function limpiezaInicial() {
  const t0 = Date.now();
  try { limpiezaInicialActivador_(); } finally { anotarTiempo_(t0); }
}
function limpiezaInicialActivador_() {
  try {
    quitarLimpieza_();
    programarLimpieza_();
    const r = corrida_({ origen: 'limpieza', espera: 30000 });
    const j = almacen_().get(INICIAL.LLAVE, null);
    const sigue = j && (j.estado === 'deshaciendo' || (j.estado === 'aplicando' && !r.pausado));
    if (!sigue) quitarLimpieza_();
  } catch (err) { console.error('limpiezaInicial: ' + (err && err.stack || err)); }
}

// Regresa por partes de 1,000 desde x.pos. Si Google rechaza una parte, va uno por uno hasta el primero que rechace:
// x.pos avanza solo sobre lo que regresó (o ya no existe en Gmail, que suma en x.no) y lo demás se reintenta en la
// corrida siguiente.
function regresarInicial_(todos, x, agregar, limite) {
  let rechazo = null, movio = false;
  while (x.pos < todos.length && !rechazo && Date.now() < limite) {
    const parte = todos.slice(x.pos, x.pos + 1000);
    try { modificar_(parte, agregar, []); x.pos += parte.length; movio = true; continue; }
    catch (e) {}
    for (let k = 0; k < parte.length && Date.now() < limite; k++) {
      try { modificar_([parte[k]], agregar, []); movio = true; }
      catch (e2) {
        const m = String(e2 && e2.message || e2);
        if (!/not found|Invalid id value|No se encontr/i.test(m)) { rechazo = m.slice(0, 160); break; }
        x.no++;
      }
      x.pos++;
    }
  }
  return { rechazo: rechazo, movio: movio };
}

function terminarInicial_(st, j) {
  j.estado = 'hecho';
  j.fin = Date.now();
  delete j.quedan;
  delete j.protegidos;
  delete j.con_nunca;
  j.por_mover = 0;
  const a = st.get('actividad', []);
  const e = a.filter(x => x.id === j.id_accion)[0];
  if (e) { e.texto = textoInicial_(j); st.tocar('actividad'); }
}

// Una tanda en cada corrida. Devuelve true si movió correo: la corrida adelanta su punto del historial para que estos
// miles de movimientos del motor no se lean como señales de la persona.
function avanzarBandejaInicial_(st, res, limite) {
  const j = st.get(INICIAL.LLAVE, null);
  if (!j || (j.estado !== 'aplicando' && j.estado !== 'deshaciendo')) return false;
  limite = limite || Date.now() + INICIAL.MS_CORRIDA;
  if (Date.now() >= limite) return false;
  // Lo que se queda ya no va en las propiedades: una lista guardada así se deja.
  delete j.quedan; delete j.protegidos; delete j.con_nunca;
  const modo = j.modo || 'archivar';
  const filas = st.get('bandeja_inicial_ids', []);
  const filasL = modo === 'archivar' ? [] : st.get('bandeja_inicial_leidos', []);
  let movio = false;
  if (j.estado === 'aplicando') {
    // Primero se archiva lo leído (archivar y ambos): lo que tenía algo sin leer se queda (motivo s) y nunca se archiva.
    if ((j.fase || 'archivo') === 'archivo') {
      const quedan = quedanDeFase_(st, j);
      if (!quedan) { st.set(INICIAL.LLAVE, j); return false; }
      const p = pasadaInicial_('in:inbox -is:unread -is:starred before:' + j.antes_de, quedan, [], ['INBOX'], limite, lote => {
        movio = true;
        j.archivados += lote.length;
        guardarIdsInicial_(filas, lote.map(m => m.id));
      });
      j.por_mover = p.por_mover; j.por_mover_minimo = !p.completa || undefined;
      if (p.fin && modo === 'ambos') j.fase = 'leido';
      else if (p.fin) terminarInicial_(st, j);
    }
    // Después se marca leído lo sin leer (leido y ambos), que se queda en Recibidos.
    if (j.fase === 'leido' && Date.now() < limite) {
      const protegidos = quedanDeFase_(st, j, false);
      if (!protegidos) { st.set(INICIAL.LLAVE, j); return false; }
      const p = pasadaInicial_('in:inbox is:unread -is:starred before:' + j.antes_de, protegidos, [], ['UNREAD'], limite, lote => {
        movio = true;
        j.marcados += lote.length;
        guardarIdsInicial_(filasL, lote.map(m => m.id));
        // Lo marcó el sistema: el análisis no lo cuenta como abierto.
        anotarLeidoSistema_(st, lote.map(m => m.threadId).filter((h, i, a) => a.indexOf(h) === i), 'politica');
      });
      j.por_mover = p.por_mover; j.por_mover_minimo = !p.completa || undefined;
      if (p.fin) terminarInicial_(st, j);
    }
  } else {
    // Primero regresa a Recibidos lo archivado; después, a sin leer lo marcado. restaurados y desmarcados son solo lo que
    // regresó; "deshecho" llega cuando todo regresó.
    const todos = [];
    filas.forEach(f => f.ids.forEach(id => todos.push(id)));
    const todosL = [];
    filasL.forEach(f => f.ids.forEach(id => todosL.push(id)));
    if (j.posicion === undefined) { j.posicion = 0; j.restaurados = 0; j.no_existen = 0; delete j.fallidos; }
    if (modo !== 'archivar' && j.posicion_leido === undefined) { j.posicion_leido = 0; j.desmarcados = 0; j.no_existen_leidos = 0; }
    const xa = { pos: j.posicion, no: j.no_existen || 0 };
    const ra = regresarInicial_(todos, xa, ['INBOX'], limite);
    j.posicion = xa.pos; j.no_existen = xa.no;
    let rechazo = ra.rechazo;
    movio = ra.movio;
    if (modo !== 'archivar' && !rechazo && j.posicion >= todos.length) {
      const xl = { pos: j.posicion_leido, no: j.no_existen_leidos || 0 };
      const rl = regresarInicial_(todosL, xl, ['UNREAD'], limite);
      j.posicion_leido = xl.pos; j.no_existen_leidos = xl.no;
      rechazo = rl.rechazo;
      movio = movio || rl.movio;
    }
    j.restaurados = j.posicion - j.no_existen;
    if (modo !== 'archivar') j.desmarcados = j.posicion_leido - j.no_existen_leidos;
    j.rechazo = rechazo ? { t: Date.now(), texto: rechazo } : undefined;
    if (j.posicion >= todos.length && (modo === 'archivar' || j.posicion_leido >= todosL.length)) { j.estado = 'deshecho'; j.fin_deshacer = Date.now(); }
    lineaDeshacerInicial_(st, j);
  }
  st.set('bandeja_inicial_ids', filas);
  if (modo !== 'archivar') st.set('bandeja_inicial_leidos', filasL);
  st.set(INICIAL.LLAVE, j);
  res.bandeja_inicial = { estado: j.estado, modo: modo, archivados: j.archivados, restaurados: j.restaurados, faltan: faltanInicial_(j), se_quedan: j.n_quedan,
    por_mover: j.estado === 'aplicando' ? j.por_mover : undefined, por_mover_es_minimo: j.estado === 'aplicando' && j.por_mover_minimo || undefined,
    marcados: j.marcados, desmarcados: j.desmarcados, faltan_leidos: faltanLeidosInicial_(j) };
  return movio;
}

// Lo que falta por regresar a Recibidos mientras se deshace.
function faltanInicial_(j) { return j.estado === 'deshaciendo' ? Math.max(0, (j.archivados || 0) - (j.posicion || 0)) : undefined; }
// Lo que falta por regresar a sin leer mientras se deshace (modo leido o ambos).
function faltanLeidosInicial_(j) { return j.estado === 'deshaciendo' && (j.modo || 'archivar') !== 'archivar' ? Math.max(0, (j.marcados || 0) - (j.posicion_leido || 0)) : undefined; }

// Lo que hace o hizo la limpieza, para Actividad y Hoy, según el modo. Nunca cuántos correos archivó: la persona quiere ver
// solo lo pendiente. Dice que ya quedó, cuántos marcó leídos y lo que se queda en Recibidos.
// Cómo va lo archivado, en porcentaje: «, va en 40%». Sin cuánto falta, nada.
function avanceInicial_(j) {
  const hechos = j.archivados || 0, faltan = j.por_mover;
  if (!(faltan > 0) || j.por_mover_minimo) return '';
  return ', va en ' + Math.min(99, Math.floor(100 * hechos / (hechos + faltan))) + '%';
}
function textoInicial_(j) {
  const n = x => Number(x || 0).toLocaleString('es-MX');
  const modo = j.modo || 'archivar';
  const dia = diaDeMes_(j.antes_del || dia_(j.antes_de * 1000));
  if (j.estado === 'deshaciendo' || j.estado === 'deshecho') return textoDeshacerInicial_(j);
  if (j.estado === 'hecho') {
    if (modo === 'archivar') return 'Bandeja limpia: archivé lo leído anterior al ' + dia + '. No lo revisé uno por uno; sigue en Todos y en la búsqueda. Lo sin leer, con estrella, borrador o algo pendiente, y lo posterior a esa fecha, se quedó en Recibidos.';
    if (modo === 'leido') return 'Bandeja limpia: marqué como leído lo sin leer anterior al ' + dia + '. Sigue en Recibidos. No los revisé uno por uno. Lo que tiene estrella, borrador o algo pendiente, y lo posterior a esa fecha, sigue sin leer.';
    return 'Bandeja limpia: archivé lo leído anterior al ' + dia + ' y marqué como leído lo que estaba sin leer, que sigue en Recibidos. No los revisé uno por uno; lo archivado sigue en Todos y en la búsqueda. Lo que tiene estrella, borrador o algo pendiente, y lo posterior a esa fecha, se quedó como estaba.';
  }
  if (modo === 'archivar') return 'Bandeja limpia: archivo lo leído anterior al ' + dia + ' que sigue en Recibidos, sin estrella ni borrador, por partes en las próximas corridas' + avanceInicial_(j) + '. No lo revisé uno por uno; sigue en Todos y en la búsqueda.';
  if (modo === 'leido') return 'Bandeja limpia: marco como leído lo sin leer anterior al ' + dia + ' que sigue en Recibidos, sin estrella ni borrador, por partes en las próximas corridas. Se queda en Recibidos. No lo revisé uno por uno.';
  return 'Bandeja limpia: archivo lo leído anterior al ' + dia + ' y marco como leído lo sin leer, que se queda en Recibidos; sin estrella ni borrador, por partes en las próximas corridas. Nunca archivo algo que estaba sin leer. No lo revisé uno por uno; lo archivado sigue en Todos y en la búsqueda.';
}

// Cómo va el regreso, en porcentaje, sin cuántos se archivaron ni cuántos se marcaron leídos.
function avanceDeshacer_(j, conLeidos) {
  const total = (j.archivados || 0) + (conLeidos ? j.marcados || 0 : 0);
  if (!total) return '';
  const hechos = (j.restaurados || 0) + (j.no_existen || 0) + (conLeidos ? j.posicion_leido || 0 : 0);
  return ', va en ' + Math.min(99, Math.floor(100 * hechos / total)) + '%';
}
function textoDeshacerInicial_(j) {
  const modo = j.modo || 'archivar';
  const dia = diaDeMes_(j.antes_del || dia_(j.antes_de * 1000));
  const noEx = (j.no_existen || 0) + (modo === 'archivar' ? 0 : j.no_existen_leidos || 0);
  const fuera = noEx ? (noEx === 1 ? ' Uno ya no existía en Gmail.' : ' Algunos ya no existían en Gmail.') : '';
  const sigue = j.rechazo ? ' Google rechazó el resto por ahora; lo reintento en la corrida siguiente.' : ' Sigo en la corrida siguiente.';
  if (modo === 'leido') {
    if (j.estado === 'deshecho') return 'Leído inicial deshecho: lo que marqué leído anterior al ' + dia + ' regresó a sin leer.' + fuera;
    return 'Deshago el leído inicial: regreso a sin leer lo que marqué leído, por partes' + avanceDeshacer_({ marcados: j.marcados, posicion_leido: j.posicion_leido }, true) + '.' + fuera + sigue;
  }
  if (modo === 'ambos') {
    if (j.estado === 'deshecho') return 'Limpieza inicial deshecha: lo archivado anterior al ' + dia + ' regresó a Recibidos y lo que marqué leído, a sin leer.' + fuera;
    return 'Deshago la limpieza inicial: regreso a Recibidos lo archivado y a sin leer lo que marqué leído, por partes' + avanceDeshacer_(j, true) + '.' + fuera + sigue;
  }
  if (j.estado === 'deshecho') return 'Archivo inicial deshecho: lo leído anterior al ' + dia + ' regresó a Recibidos.' + fuera;
  return 'Deshago el archivo inicial: lo regreso a Recibidos por partes' + avanceDeshacer_(j) + '.' + fuera + sigue;
}

// Una sola línea en Actividad para este Deshacer, al día en cada corrida.
function lineaDeshacerInicial_(st, j) {
  const texto = textoDeshacerInicial_(j);
  const e = j.id_deshacer ? st.get('actividad', []).filter(x => x.id === j.id_deshacer)[0] : null;
  if (!e) j.id_deshacer = anotar_(st, { texto: texto, actor: 'motor', politica: 'bandeja_limpia' }).id;
  else if (e.texto !== texto) { e.texto = texto; st.tocar('actividad'); }
}

// Para Hoy: cuánto lleva, mientras corre y una semana después.
function bandejaInicialHoy_(st) {
  const j = st.get(INICIAL.LLAVE, null);
  if (!j) return undefined;
  if ((j.estado === 'hecho' && Date.now() - j.fin > INICIAL.DIAS_EN_HOY * 86400000) || (j.estado === 'deshecho' && Date.now() - j.fin_deshacer > INICIAL.DIAS_EN_HOY * 86400000)) return undefined;
  const deshacer = j.estado === 'deshaciendo' || j.estado === 'deshecho';
  const modo = j.modo || 'archivar';
  const leido = modo !== 'archivar';
  return { estado: j.estado, modo: modo, antes_del: j.antes_del || dia_(j.antes_de * 1000), archivados: j.archivados, restaurados: j.restaurados, faltan: faltanInicial_(j), no_existen: deshacer && j.no_existen || undefined,
    marcados: leido ? j.marcados : undefined, desmarcados: leido && deshacer ? j.desmarcados : undefined, faltan_leidos: faltanLeidosInicial_(j),
    no_existen_leidos: leido && deshacer && j.no_existen_leidos || undefined, se_quedan_sin_leer: leido ? j.n_quedan_sin_leer : undefined,
    texto: textoInicial_(j), se_quedan: j.n_quedan, por_mover: j.estado === 'aplicando' ? j.por_mover : undefined,
    por_mover_es_minimo: j.estado === 'aplicando' && j.por_mover_minimo || undefined, desde: fecha_(j.inicio), termino: j.fin ? fecha_(j.fin) : undefined, id_accion: j.id_accion };
}
