// --- Corrida del motor cada 10 minutos ---
// Lee lo nuevo desde el último historyId, anota las señales, vence juicios y propuestas de hilos con mensajes
// nuevos y ejecuta las políticas activas. Sin políticas activas solo cuenta y registra señales.

const CORRIDA = { DIAS_ESPERA: 3, DIAS_MOVIDOS: 30, DIAS_HUELLAS: 7, DIAS_AVISOS: 2, DIAS_DINERO: 14, MAX_DINERO: 200,
  CONSULTA_ADJUNTOS: 'newer_than:2d -in:sent (filename:xml OR (filename:pdf {factura recibo comprobante cfdi "estado de cuenta" invoice receipt}))' };

function corrida() {
  const t0 = Date.now();
  try { corrida_({ origen: 'activador' }); }
  catch (err) { console.error('corrida: ' + (err && err.stack || err)); }
  finally { anotarTiempo_(t0); }
}

function corrida_(op) {
  op = op || {};
  const t0 = Date.now();
  if (op.origen === 'activador' && frecuenciaOmite_()) return { omitida: 'Leo cada ' + CUPO.LENTA_MIN + ' minutos hasta medianoche para no agotar el cupo diario de Google.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(op.espera || 3000)) return { omitida: 'Otra corrida o un cambio del conector está en curso.' };
  marcarCandado_('la corrida');
  const res = { inicio: fecha_(t0), origen: op.origen || 'manual', historial: null, nuevos: 0, en_bandeja: 0, decisiones: {}, propuesto: {}, aplicado: {},
    esperan_a_opus: 0, senales: null, juicios_vencidos: 0, propuestas_vencidas: 0, seguimientos_vencidos: 0, errores: [], ejemplos: [] };
  let st = null, nuevoHistory = null, avanzar = false;
  try {
    st = almacen_();
    const yo = yo_();
    const previa = st.get('corridas', []).filter(c => c.quien === 'motor')[0];
    const ctx = { yo: yo, t0: t0, nombres: nombresEtiquetas_(true), corresponsales: null, ventanaMs: previa ? t0 - previa.t : null };
    const pausa = st.get('pausa', null);
    res.pausado = !!(pausa && pausa.activo);
    const desde = op.reiniciarHistorial ? null : st.get('historyId', null);
    let hist = desde ? leerHistorial_(desde, t0) : null;
    let idsNuevos;
    if (!hist || hist.caducado) {
      res.historial = desde ? 'el historyId caducó: últimos ' + COS.DIAS_RESPALDO + ' días' : 'primera corrida: últimos ' + COS.DIAS_RESPALDO + ' días';
      const perfil = Gmail.Users.getProfile('me');
      // Sin historial no se leen los eventos anteriores: una huella de entonces nunca se consumiría y se tragaría una acción de la persona.
      st.set('huellas', {});
      idsNuevos = listarIds_('in:inbox newer_than:' + COS.DIAS_RESPALDO + 'd', 500, t0);
      hist = { agregados: [], enviados: [], hilosConNuevos: {}, eventos: [], quitadasCos: {}, registros: 0, historyId: String(perfil.historyId) };
    } else {
      idsNuevos = hist.agregados;
      res.historial = { desde: desde, hasta: hist.historyId, registros: hist.registros, eventos_de_etiquetas: hist.eventos.length, enviados: hist.enviados.length };
    }
    nuevoHistory = hist.historyId;
    // Un juicio o una propuesta sobre un hilo vence si llega un mensaje nuevo (también si la persona contestó).
    const tocados = Object.assign({}, hist.hilosConNuevos);
    hist.enviados.forEach(e => { tocados[e.hilo] = 1; });
    res.juicios_vencidos = vencerJuicios_(st, tocados);
    res.propuestas_vencidas = vencerPropuestas_(st, tocados);
    try { res.seguimientos_por_etiqueta = seguirPorEtiqueta_(st, hist, !res.pausado) || undefined; } catch (e) { res.errores.push('Espero respuesta: ' + String(e && e.message || e).slice(0, 200)); }
    if (!res.pausado) { try { res.leidos_no_te_necesitan = leerLoQueNoNecesita_(st) || undefined; } catch (e) { res.errores.push('Sin leer: ' + String(e && e.message || e).slice(0, 200)); } }
    idsNuevos = idsNuevos.concat(st.get('reintentar', []));
    if (idsNuevos.length || hist.eventos.length || hist.enviados.length) {
      const c = corresponsalesCache_(st, yo, t0, !!op.refrescarCorresponsales);
      ctx.corresponsales = c.mapa;
      sembrarConocidos_(st, c.mapa);
    }
    if (hist.eventos.length || hist.enviados.length) procesarSenales_(st, hist, ctx, res);
    if (res.pausado) {
      const procesados = st.get('procesados', {});
      const hora = Math.floor(Date.now() / 3600000);
      idsNuevos.forEach(id => { if (procesados[id] === undefined) procesados[id] = hora; });
      st.set('procesados', procesados);
      st.set('reintentar', []);
      res.nuevos_en_pausa = idsNuevos.length;
    } else {
      if (idsNuevos.length) clasificarYActuar_(st, idsNuevos, ctx, res);
      else st.set('reintentar', []);
      revisarEspera_(st, ctx, res);
      bandejaLimpia_(st, res);
      caducarOpcionales_(st, res);
    }
    // Lo que ya estaba en Recibidos al instalar, por partes; deshacerlo corre aunque el motor esté en pausa. Con su propio
    // activador vivo, la corrida de 10 minutos no lo toca y la vuelta de ese activador le da 4 minutos; si el activador
    // murió, esta corrida avanza 45 segundos y lo vuelve a programar.
    const ini = st.get('bandeja_inicial', null);
    const propia = op.origen === 'limpieza';
    if (ini && (ini.estado === 'deshaciendo' || (ini.estado === 'aplicando' && !res.pausado)) && (propia || !limpiezaVive_())) {
      if (!propia) { try { programarLimpieza_(); } catch (e) {} }
      if (avanzarBandejaInicial_(st, res, propia ? t0 + INICIAL.MS_ACTIVADOR : Date.now() + INICIAL.MS_CORRIDA)) nuevoHistory = saltarHistorial_(st, nuevoHistory);
    }
    revisarSeguimientos_(st, hist, res);
    try { anotarBandeja_(st); } catch (e) { res.error_bandeja = String(e && e.message || e).slice(0, 120); }
    if (!res.pausado) proponerRespaldo_(st, res);
    if (!res.pausado) { try { res.historico_recalculado = refrescarHistorico_(st, t0) || undefined; } catch (e) { res.errores.push('Lo anterior: ' + String(e && e.message || e).slice(0, 200)); } }
    avanzar = true;
  } catch (err) {
    res.errores.push(String(err && err.stack || err).slice(0, 600));
  } finally {
    try {
      if (st) {
        if (avanzar && nuevoHistory) st.set('historyId', nuevoHistory);
        anotarLimiteDiario_(st, 'corrida');
        anotarCupo_();
        podar_(st);
        res.segundos = +((Date.now() - t0) / 1000).toFixed(1);
        const suma = o => Object.keys(o).reduce((a, k) => a + o[k], 0);
        const c = st.get('corridas', []);
        c.unshift({ t: t0, quien: 'motor', v: COS.VERSION, vi: typeof INSTALACION !== 'undefined' && INSTALACION && INSTALACION.version ? String(INSTALACION.version) : undefined, s: res.segundos, origen: res.origen, nuevos: res.nuevos, propuestos: suma(res.propuesto), aplicados: suma(res.aplicado),
          senales: res.senales ? res.senales.nuevas.length : 0, errores: res.errores.length,
          resultado: res.nuevos + ' nuevos, ' + suma(res.propuesto) + ' propuestos, ' + suma(res.aplicado) + ' aplicados' + (res.esperan_a_opus ? ', ' + res.esperan_a_opus + ' esperan el juicio de Opus' : '') +
            (res.errores.length ? '; error: ' + res.errores[0].slice(0, 120) : '') });
        if (!st.get('primera_corrida', null)) st.set('primera_corrida', Math.min.apply(null, c.map(x => x.t).filter(isFinite)));
        st.set('corridas', c.slice(0, COS.MAX_CORRIDAS));
        st.guardar();
      }
    } catch (err2) {
      res.errores.push('guardar: ' + String(err2 && err2.message || err2));
    }
    soltarCandado_();
    lock.releaseLock();
  }
  return res;
}

// Después de que la limpieza mueve miles de correos, la corrida salta esos eventos para no leerlos como señales de la
// persona. El correo nuevo que llegó mientras tanto no se salta: pasa a reintentar y entra en la corrida siguiente.
// Devuelve el historyId nuevo.
function saltarHistorial_(st, desde) {
  const hasta = String(conReintento_(() => Gmail.Users.getProfile('me')).historyId);
  if (!desde) return hasta;
  const nuevos = [];
  let pagina = null, vueltas = 0;
  try {
    do {
      const r = gmailGet_('https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=' + encodeURIComponent(desde) + '&historyTypes=messageAdded&maxResults=500' +
        (pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''));
      if (r.getResponseCode() !== 200) break;
      const j = JSON.parse(r.getContentText());
      (j.history || []).forEach(rec => (rec.messagesAdded || []).forEach(x => {
        const l = (x.message && x.message.labelIds) || [];
        if (l.indexOf('INBOX') >= 0 && l.indexOf('DRAFT') < 0 && l.indexOf('SENT') < 0) nuevos.push(x.message.id);
      }));
      pagina = j.nextPageToken;
      vueltas++;
    } while (pagina && vueltas < 5);
  } catch (e) {}
  if (nuevos.length) st.set('reintentar', topeCola_(st, st.get('reintentar', []).concat(nuevos).filter((id, i, a) => a.indexOf(id) === i)));
  return hasta;
}

// La cola de correo por leer guarda hasta MAX_COLA. Lo que pasa de ahí no se revisa: queda un aviso en ver_hoy por 24 horas
// para que la persona lo busque en Gmail. La cuenta va en sin_revisar y no en el texto.
const COLA_RECORTADA = { LLAVE: 'cola_recortada', HORAS: 24 };
function topeCola_(st, cola) {
  if (cola.length <= COS.MAX_COLA) return cola;
  const ahora = Date.now(), x = st.get(COLA_RECORTADA.LLAVE, null), vivo = x && ahora - x.t < COLA_RECORTADA.HORAS * 3600000;
  st.set(COLA_RECORTADA.LLAVE, { t: ahora, desde: vivo ? x.desde : ahora, n: (vivo ? x.n : 0) + cola.length - COS.MAX_COLA });
  return cola.slice(0, COS.MAX_COLA);
}
function avisoColaRecortada_(st) {
  const x = st.get(COLA_RECORTADA.LLAVE, null);
  if (!x || Date.now() - x.t >= COLA_RECORTADA.HORAS * 3600000) return null;
  return { desde: fecha_(x.desde), hasta: fecha_(x.t), sin_revisar: x.n,
    texto: 'Llegó más correo del que alcancé a revisar entre dos lecturas y una parte quedó sin revisar. Si esperas algo de esas horas, búscalo en Gmail.' };
}

// Seguimiento al enviar: la etiqueta «Espero respuesta» en un correo que mandó la persona abre un
// seguimiento de lo que le deben, a 3 días; si no contestan, vuelve a Hoy en su fecha. Llega al mandar (la etiqueta puesta
// en el borrador) o después, en el hilo. La etiqueta se crea una vez, cuando la instalación ya cerró; si la persona ya
// tenía una con ese nombre, se usa la suya. Es pedido de la persona: abre aunque la regla de Seguimiento esté apagada.
const ESPERO = { NOMBRE: 'Espero respuesta', DIAS: 3, LLAVE: 'espero_respuesta', MAX: 10 };
function etiquetaEspero_(crear) {
  const nombres = nombresEtiquetas_(false), b = ESPERO.NOMBRE.toLowerCase();
  const id = Object.keys(nombres).filter(k => { const n = String(nombres[k]).toLowerCase(); return n === b || n.slice(-(b.length + 1)) === '/' + b; })[0];
  return id || (crear ? idEtiquetaCos_(ESPERO.NOMBRE) : null);
}
function seguirPorEtiqueta_(st, hist, crear) {
  if (!instalacionCerrada_(st)) return 0;
  let id = st.get(ESPERO.LLAVE, null);
  if (!id) {
    id = etiquetaEspero_(crear);
    if (!id) return 0;
    st.set(ESPERO.LLAVE, id);
    anotar_(st, { texto: 'Creé la etiqueta «' + ESPERO.NOMBRE + '»: ponla en un correo que mandes y, si no te contestan en ' + ESPERO.DIAS + ' días, te lo regreso a Hoy.' });
  }
  const hilos = {};
  (hist.enviados || []).forEach(e => { if ((e.l || []).indexOf(id) >= 0) hilos[e.hilo] = 1; });
  (hist.eventos || []).forEach(e => { if (e.s === '+' + id) hilos[e.hilo] = 1; });
  const abiertos = st.get('seguimientos', []).filter(s => s.estado === 'abierto' && s.direccion === 'le_deben').map(s => s.hilo);
  let n = 0;
  Object.keys(hilos).filter(h => abiertos.indexOf(h) < 0).slice(0, ESPERO.MAX).forEach(h => {
    seguimiento_(st, { accion: 'abrir', id_hilo: h, direccion: 'le_deben', dias: ESPERO.DIAS, a_pedido: true });
    n++;
  });
  return n;
}

// Sin leer = lo que te necesita: después del plan, lo que Opus juzgó baja o ruido
// queda leído donde esté, aunque sea de lo que nunca se limpia; no se mueve. Una vez por hilo (si la persona lo vuelve a
// marcar no leído, se respeta) y solo hasta el mensaje del juicio. Nunca en Leer después ni lo sensible. Con la decisión
// sin_leer en como_esta, nada.
const SIN_LEER = { MAX: 200 };
function leerLoQueNoNecesita_(st) {
  if (!instalacionCerrada_(st) || decision_(st, 'sin_leer') !== 'lo_que_te_necesita') return 0;
  const j = st.get('juicios', {});
  // Lo que una regla con dejar_sin_leer deja así no se marca leído: ni por el juicio con esa regla ni en su carpeta.
  const sinLeerPols = listaPoliticas_(st).filter(p => p.estado === 'activa' && (p.acciones || []).indexOf('dejar_sin_leer') >= 0);
  const polSinLeer = {};
  sinLeerPols.forEach(p => { polSinLeer[p.id] = 1; });
  const hs = Object.keys(j).filter(h => { const x = j[h]; return (x.prioridad === 'baja' || x.prioridad === 'ruido') && !x.vencido && !x.sensible && !x.leido_motor && !(x.politica && polSinLeer[x.politica]); }).slice(0, SIN_LEER.MAX);
  if (!hs.length) return 0;
  let nombres = nombresEtiquetas_(false);
  const ld = COS.LEER_DESPUES.toLowerCase();
  const fuera = [ld].concat(...sinLeerPols.map(p => (p.acciones || []).filter(a => /^carpeta:/.test(a)).map(a => { try { return normalizarCarpeta_(a.slice(8)).replace(/^\//, '').toLowerCase(); } catch (e) { return ''; } }))).filter(Boolean);
  const es = (n, c) => n === c || n.slice(-(c.length + 1)) === '/' + c;
  // Una carpeta recién creada puede no estar en la lista guardada de etiquetas: se pide otra vez.
  if (fuera.length > 1 && fuera.slice(1).some(c => !Object.keys(nombres).some(k => es(String(nombres[k]).toLowerCase(), c)))) nombres = nombresEtiquetas_(true);
  const despues = Object.keys(nombres).filter(k => { const n = String(nombres[k]).toLowerCase(); return fuera.some(c => es(n, c)); });
  const datos = gmailFetchAll_(hs.map(h => 'threads/' + h + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=messages(id,threadId,labelIds,internalDate,payload/headers)'), 25);
  const ids = [], estados = {}, hechos = [], ahora = Date.now();
  hs.forEach((h, k) => {
    const t = datos[k];
    if (!t || !t.messages) return;
    const md = sinBorradores_(t.messages).map(metadatoDe_);
    j[h].leido_motor = ahora;
    if (!md.length || md.some(m => (m.labelIds || []).some(l => despues.indexOf(l) >= 0))) return;
    const hasta = md.filter(m => m.id === j[h].ultimo)[0];
    const tope = hasta ? Number(hasta.internalDate) : Number(md[md.length - 1].internalDate);
    const suyos = md.filter(m => tiene_(m, 'UNREAD') && Number(m.internalDate) <= tope);
    if (!suyos.length) return;
    suyos.forEach(m => { ids.push(m.id); estados[m.id] = m.labelIds || []; });
    hechos.push({ h: h, as: md[0].h['Subject'] || '(sin asunto)' });
  });
  st.set('juicios', j);
  if (!ids.length) return 0;
  fijarHistorial_(st);
  const d = etiquetar_(st, ids, estados, null, false, true, null);
  anotarLeidoSistema_(st, hechos.map(x => x.h), 'politica');
  anotar_(st, { texto: hechos.length === 1 ? 'Marqué leído «' + corto_(hechos[0].as, 80) + '»: no te necesita.' : 'Marqué leídos ' + hechos.length + ' correos que no te necesitan.', d: d });
  return hechos.length;
}

function leerHistorial_(desde, t0) {
  const token = ScriptApp.getOAuthToken();
  const out = { agregados: [], enviados: [], hilosConNuevos: {}, eventos: [], quitadasCos: {}, registros: 0, historyId: null, caducado: false };
  let pagina = null, vueltas = 0;
  do {
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=' + encodeURIComponent(desde) +
      '&historyTypes=messageAdded&historyTypes=labelAdded&historyTypes=labelRemoved&maxResults=500' + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
    const r = gmailGet_(url, token);
    const c = r.getResponseCode();
    if (c === 404) { out.caducado = true; return out; }
    if (c !== 200) throw new Error('history.list respondió ' + c + ': ' + r.getContentText().slice(0, 200));
    const j = JSON.parse(r.getContentText());
    out.historyId = j.historyId || out.historyId;
    (j.history || []).forEach(rec => {
      out.registros++;
      (rec.messagesAdded || []).forEach(x => {
        const m = x.message || {}, l = m.labelIds || [];
        if (l.indexOf('DRAFT') >= 0) return;
        if (l.indexOf('SENT') >= 0) { out.enviados.push({ id: m.id, hilo: m.threadId, l: l.filter(e => /^Label_/.test(e)) }); return; }
        out.hilosConNuevos[m.threadId] = 1;
        if (l.indexOf('INBOX') >= 0) out.agregados.push(m.id);
      });
      (rec.labelsAdded || []).forEach(x => {
        const m = x.message || {}, l = x.labelIds || [];
        if ((m.labelIds || []).indexOf('DRAFT') >= 0) return;
        if (l.indexOf('INBOX') >= 0) out.eventos.push({ id: m.id, hilo: m.threadId, s: '+INBOX' });
        if (l.indexOf('TRASH') >= 0) out.eventos.push({ id: m.id, hilo: m.threadId, s: '+TRASH' });
        if (l.indexOf('STARRED') >= 0) out.eventos.push({ id: m.id, hilo: m.threadId, s: '+STARRED' });
        // Lo que la persona hace además de leer y mover: spam, importante, no leído y sus propias etiquetas.
        ['SPAM', 'IMPORTANT', 'UNREAD'].forEach(e => { if (l.indexOf(e) >= 0) out.eventos.push({ id: m.id, hilo: m.threadId, s: '+' + e, t: Number(m.internalDate) || 0 }); });
        l.forEach(e => { if (/^Label_/.test(e)) out.eventos.push({ id: m.id, hilo: m.threadId, s: '+' + e }); });
        // Un borrador enviado puede conservar su id: llega como SENT agregado, no como mensaje nuevo.
        if (l.indexOf('SENT') >= 0) out.enviados.push({ id: m.id, hilo: m.threadId });
      });
      (rec.labelsRemoved || []).forEach(x => {
        const m = x.message || {}, l = x.labelIds || [];
        if ((m.labelIds || []).indexOf('DRAFT') >= 0) return;
        if (l.indexOf('INBOX') >= 0) out.eventos.push({ id: m.id, hilo: m.threadId, s: '-INBOX' });
        if (l.indexOf('TRASH') >= 0) out.eventos.push({ id: m.id, hilo: m.threadId, s: '-TRASH' });
        if (l.indexOf('UNREAD') >= 0) out.eventos.push({ id: m.id, hilo: m.threadId, s: '-UNREAD', r: out.registros });
        l.forEach(id => { if (/^Label_/.test(id)) (out.quitadasCos[m.id] = out.quitadasCos[m.id] || []).push(id); });
      });
    });
    pagina = j.nextPageToken;
    vueltas++;
  } while (pagina && vueltas < 20 && Date.now() - t0 < 120000);
  return out;
}

// Quien ya le escribe a la persona no es nuevo: los corresponsales cuentan desde siempre. Los remitentes del análisis no:
// Opus decidió en el plan los grupos que suman el 90%, y el resto espera su juicio.
function sembrarConocidos_(st, corresponsales) {
  if (st.get('conocidos_sembrado', false)) return;
  const c = st.get('conocidos', {});
  Object.keys(corresponsales || {}).forEach(x => { if (!c[x]) c[x] = 1; });
  st.set('conocidos', c);
  st.set('conocidos_sembrado', true);
}

// Hilos con varios mensajes donde la persona escribió: solo los mueve una condición explícita.
function conversacionesDe_(msgs) {
  const multi = msgs.filter(m => m.threadId !== m.id);
  const salida = {};
  if (!multi.length) return salida;
  const hs = multi.map(m => m.threadId).filter((h, i, a) => a.indexOf(h) === i).slice(0, 100);
  gmailFetchAll_(hs.map(h => 'threads/' + h + '?format=minimal'), 20).forEach((t, k) => { if (t && sinBorradores_(t.messages).some(x => tiene_(x, 'SENT'))) salida[hs[k]] = 1; });
  return salida;
}

function clasificarYActuar_(st, idsNuevos, ctx, res) {
  const procesados = st.get('procesados', {});
  const hora = Math.floor(Date.now() / 3600000);
  // Hasta MAX_NUEVOS por corrida; lo que pasa de ahí y lo que no se alcanzó a leer queda en reintentar para la siguiente.
  // Sin esto, lo que pasaba de 300 se perdía al adelantar el historial.
  const pendientes = idsNuevos.filter((id, i, a) => a.indexOf(id) === i && procesados[id] === undefined);
  const unicos = pendientes.slice(0, COS.MAX_NUEVOS), resto = pendientes.slice(COS.MAX_NUEVOS);
  res.nuevos = unicos.length;
  if (resto.length) res.nuevos_en_cola = resto.length;
  if (!unicos.length) { st.set('reintentar', []); return; }
  const leidos = leerMetadatos_(unicos, ctx.t0);
  const vistos = {};
  leidos.forEach(m => { vistos[m.id] = 1; procesados[m.id] = hora; });
  const cola = unicos.filter(id => !vistos[id]).concat(resto);
  if (cola.length > COS.MAX_COLA) res.cola_recortada = cola.length - COS.MAX_COLA;
  st.set('reintentar', topeCola_(st, cola));
  st.set('procesados', procesados);
  const msgs = leidos.filter(m => tiene_(m, 'INBOX') && !tiene_(m, 'DRAFT'));
  res.en_bandeja = msgs.length;
  anotarDinero_(st, msgs, res);
  anotarPrimerCorreo_(st, msgs);
  // Un remitente pasa a conocido solo con un juicio de Opus, una ficha o la siembra inicial: llegar no basta.
  ejecutarPoliticas_(st, msgs, ctx, res);
}

// ---------- Bandeja limpia ----------
// Archiva lo que la persona ya leyó y Opus juzgó sin pendiente: un juicio vivo del hilo o una política de masivos activa
// que lo cubre. Sin juicio se queda: no tener un pendiente registrado no prueba que esté resuelto. Lo anterior que nadie juzgó sale solo con el archivo
// inicial, con su alcance aprobado en el plan. Las condiciones las pone el motor, no la compilación: todo leído, sin
// borrador, sin estrella, sin seguimiento abierto, sin mensaje posterior al juicio, sin juicio de riesgo o alta (ni con
// respuesta o seguimiento por hacer), sin tema sensible y sin "Conservar". cuando: "HH:mm" o "cierre" (una vez al día
// desde esa hora) o "Nh" (N horas después de leído). Nunca archiva sin leer.
// Lo que nunca se limpia (accesos, cobros fallidos, cambios de plan, suspensiones) se queda. Un código de verificación sí
// sale cuando venció: CODIGO_VENCE_H horas después de que llegó.
const BANDEJA = { CIERRE: '21:00', MAX_HILOS: 300, MAX_LISTA: 2000, CODIGO_VENCE_H: 72 };
function bandejaLimpia_(st, res) {
  const pol = listaPoliticas_(st).filter(p => p.id === 'bandeja_limpia')[0];
  if (!pol || pol.estado !== 'activa' || pol.nivel === 'apagado' || (pol.acciones || []).indexOf('archivar') < 0) return;
  const ahora = Date.now(), hoy = dia_(ahora), z = Utilities.formatDate(new Date(), tz_(), 'XXX');
  const c = pol.cuando || 'cierre';
  const rut = st.get('rutinas', {});
  const horas = /^\d+h$/.test(c) ? Number(c.slice(0, -1)) : null;
  if (horas === null) {
    const hh = /^\d{2}:\d{2}$/.test(c) ? c : BANDEJA.CIERRE;
    if (ahora < Date.parse(hoy + 'T' + hh + ':00' + z) || rut.bandeja_limpia === hoy) return;
  }
  const juicios = st.get('juicios', {});
  const abiertos = {};
  st.get('seguimientos', []).filter(s => s.estado === 'abierto' && s.hilo).forEach(s => { abiertos[s.hilo] = 1; });
  // La persona eligió "Pendientes" en carpeta: lo leído que pide algo (seguimiento abierto) va a esa carpeta.
  const aPendientes = decision_(st, 'pendientes') === 'carpeta';
  // Una política de masivos activa (limpia y no protege) es el juicio de Opus sobre ese remitente: lo leído de 30 días
  // que cumple su compilación también entra.
  const porPolitica = {};
  listaPoliticas_(st).filter(p => politicaViva_(p) && p.id !== 'bandeja_limpia' && p.id !== 'bajas' && limpia_(accionesMotor_(p)) && !accionesMotor_(p).some(a => a === 'nunca_limpiar' || a === 'importante')).forEach(p => {
    const q = consultaGmail_(st, p.compilado, 30);
    if (!q) return;
    try { idsDeConsulta_('in:inbox is:read -is:starred ' + q, 'hilos', 500).ids.forEach(h => { if (!porPolitica[h]) porPolitica[h] = p.id; }); } catch (e) {}
  });
  // Se revisa solo lo que juzgó Opus, lo de una política de masivos o lo que tiene un seguimiento que va a Pendientes.
  // Lo demás se queda sin leerlo.
  const vistos = {};
  const candidatos = idsDeConsulta_('in:inbox is:read -is:starred', 'hilos', BANDEJA.MAX_LISTA).ids.concat(Object.keys(porPolitica)).filter(h => {
    if (vistos[h]) return false;
    vistos[h] = 1;
    return (juicios[h] && !juicios[h].vencido) || porPolitica[h] || (aPendientes && abiertos[h]);
  });
  const ids = candidatos.slice(0, BANDEJA.MAX_HILOS);
  const out = { revisados: ids.length, archivados: 0, quedan: {} };
  const queda = k => { out.quedan[k] = (out.quedan[k] || 0) + 1; };
  if (Object.keys(vistos).length > candidatos.length) out.quedan['sin juicio de Opus'] = Object.keys(vistos).length - candidatos.length;
  if (ids.length) {
    const datos = gmailFetchAll_(ids.map(h => 'threads/' + h + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe&fields=messages(id,threadId,labelIds,snippet,internalDate,payload/headers)'), 25);
    const leidoEn = st.get('leido_en', {});
    const fuera = [];
    (pol.compilado.excepciones || []).filter(x => x.campo === 'remitente' || x.campo === 'dominio').forEach(x => x.valores.forEach(v => fuera.push(String(v).toLowerCase())));
    const items = [], pendientes = [];
    ids.forEach((h, k) => {
      const t = datos[k];
      if (!t || !t.messages) return queda('no se pudo leer');
      const ms = t.messages;
      const l = {};
      ms.forEach(m => (m.labelIds || []).forEach(x => { l[x] = 1; }));
      if (ms.some(m => (m.labelIds || []).indexOf('UNREAD') >= 0)) return queda('sin leer');
      if (l.DRAFT) return queda('borrador');
      if (l.STARRED) return queda('estrella');
      const j = juicios[h];
      if (abiertos[h] && !aPendientes) return queda('seguimiento abierto');
      const vivo = j && !j.vencido;
      if (j && j.conservar) return queda('conservar');
      if (vivo && (j.prioridad === 'riesgo' || j.prioridad === 'alta')) return queda('juicio ' + j.prioridad);
      const porHacer = o => o.accion === 'borrador' || o.accion === 'seguimiento';
      if (vivo && ((j.prioridad === 'media' && (j.opciones || []).some(porHacer)) || (j.opciones || []).some(o => o.recomendada && porHacer(o)))) return queda('respuesta pendiente');
      const md = ms.map(metadatoDe_);
      const ult = md[md.length - 1];
      if (!abiertos[h] || !aPendientes) {
        if (!vivo && !porPolitica[h]) return queda('sin juicio de Opus');
        // Un mensaje posterior al que juzgó Opus deja el juicio corto: espera el siguiente.
        // Sin el último mensaje juzgado (juicio guardado sin leer el hilo), cuenta lo que llegó después del juicio.
        const ultMs = sinBorradores_(ms)[sinBorradores_(ms).length - 1];
        if (vivo && (j.ultimo ? ultMs.id !== j.ultimo : Number(ultMs.internalDate) > j.t)) return queda('mensaje sin juicio');
      }
      // Un rescate deja al remitente como excepción: Bandeja limpia ya no lo toca.
      if (fuera.length && md.some(m => !tiene_(m, 'SENT') && coincide_(fuera, correo_(m.h['From'])))) return queda('excepción');
      const protegido = protegidoDeLimpiar_(md, ahora, st);
      if (protegido) return queda(protegido);
      if (!(j && !j.vencido && j.no_sensible) && (vivo && j.sensible || sensibleDeMensaje_(ult, st))) return queda('tema sensible');
      if (horas !== null) {
        const leido = leidoEn[h] || Number(ult.internalDate);
        if (ahora - leido < horas * 3600000) return queda('leído hace menos de ' + horas + ' h');
      }
      if (abiertos[h]) { md.filter(m => tiene_(m, 'INBOX')).forEach(m => pendientes.push(itemDe_(m))); return queda('a Pendientes'); }
      md.filter(m => tiene_(m, 'INBOX') && !tiene_(m, 'SENT')).forEach(m => items.push(itemDe_(m)));
      md.filter(m => tiene_(m, 'INBOX') && tiene_(m, 'SENT')).forEach(m => items.push(itemDe_(m)));
    });
    if (items.length) {
      if (pol.nivel === 'propone') { const p = proponerLote_(st, pol.id, items); out.propuesto = p.id; }
      else { const r = aplicarItems_(st, ['archivar'], items, pol.id, 'motor', { aviso: pol.nivel === 'avisa' }); out.archivados = r.n; out.id_accion = r.id_accion; }
    }
    if (pendientes.length && pol.nivel !== 'propone') {
      const r = aplicarItems_(st, ['carpeta:Pendientes'], pendientes, pol.id, 'motor', { aviso: pol.nivel === 'avisa' });
      out.a_pendientes = r.n; out.id_accion_pendientes = r.id_accion;
    }
  }
  if (horas === null && candidatos.length <= BANDEJA.MAX_HILOS) { rut.bandeja_limpia = hoy; st.set('rutinas', rut); }
  res.bandeja_limpia = out;
}

// La bandeja al cierre: cada corrida reescribe la cifra del día, y la última del día queda como su cierre.
function anotarBandeja_(st) {
  const x = conReintento_(() => Gmail.Users.Labels.get('me', 'INBOX'));
  const hoy = dia_(Date.now());
  const l = st.get('bandeja_dias', []).filter(d => d.fecha !== hoy);
  l.unshift({ fecha: hoy, hilos: x.threadsTotal || 0, sin_leer: x.threadsUnread || 0, te_necesitan: teNecesitanAhora_(st), t: Date.now() });
  st.set('bandeja_dias', l.slice(0, 120));
}

// Lo que necesita a la persona, con la regla de Hoy (verHoy_ y bandejaDeHoy_): juicios vivos de riesgo, alta o media, sin
// los que esperan su próxima revisión, en el tope de Hoy (salvo riesgo y sensible), cuyo hilo sigue en Recibidos; fuera de
// Recibidos cuentan el riesgo y lo de media o más que movió el motor. Lee solo las etiquetas de esos hilos, en lote.
// Si Gmail no deja leerlos, el día queda sin la cifra.
function teNecesitanAhora_(st) {
  try {
    const ahora = Date.now(), j = st.get('juicios', {});
    const hs = Object.keys(j).filter(h => !j[h].vencido && !j[h].caducado && !(j[h].revision > ahora && j[h].prioridad !== 'riesgo'))
      .sort((a, b) => (LECTURA.ORDEN[j[a].prioridad] - LECTURA.ORDEN[j[b].prioridad]) || j[b].t - j[a].t)
      .filter((h, k) => k < LECTURA.MAX_JUICIOS_HOY || j[h].prioridad === 'riesgo' || j[h].sensible)
      .filter(h => ['riesgo', 'alta', 'media'].indexOf(j[h].prioridad) >= 0);
    if (!hs.length) return 0;
    const datos = gmailFetchAll_(hs.map(h => 'threads/' + h + '?format=minimal&fields=messages(labelIds)'), 25);
    if (LOTE_GMAIL.limitadas) return undefined;
    const movido = {};
    st.get('dinero', []).concat(st.get('por_juzgar', [])).forEach(y => { movido[y.h] = 1; });
    return hs.filter((h, k) => { const ms = sinBorradores_((datos[k] && datos[k].messages) || []);
      return ms.length && (j[h].prioridad === 'riesgo' || movido[h] || ms.some(m => tiene_(m, 'INBOX'))); }).length;
  } catch (e) { return undefined; }
}

// Primer correo de cada remitente que ve el motor: de ahí corren los 14 días de medición antes de marcar leído.
// Solo importa para quien no tiene historia: con historia, Opus decide desde el primer día.
function anotarPrimerCorreo_(st, msgs) {
  const p = st.get('primer_correo', {});
  const ap = st.get('aperturas_30d', {});
  let cambio = false;
  msgs.forEach(m => { const de = correo_(m.h['From']); const t = Number(m.internalDate) || Date.now(); if (de && !(ap[de] && ap[de][2] > 0) && (!p[de] || t < p[de])) { p[de] = t; cambio = true; } });
  if (!cambio) return;
  const lim = Date.now() - 30 * 86400000;
  const k = Object.keys(p).filter(x => p[x] >= lim).sort((a, b) => p[b] - p[a]).slice(0, 1500);
  const p2 = {};
  k.forEach(x => { p2[x] = p[x]; });
  st.set('primer_correo', p2);
}

// Documentos de dinero: se anotan como hecho al llegar, haya o no políticas, para que Opus los revise en su
// siguiente corrida aunque una política ya los haya movido (cuenta nueva, monto raro, primer cobro, pago por vencer).
function anotarDinero_(st, msgs, res) {
  const recibidos = msgs.filter(m => !tiene_(m, 'SENT'));
  if (!recibidos.length) return;
  // Señal barata además del asunto: un XML adjunto (el CFDI) o un PDF con nombre o texto de factura o recibo.
  const conAdjunto = {};
  try { listarIds_(CORRIDA.CONSULTA_ADJUNTOS, 200, Date.now()).forEach(id => { conAdjunto[id] = 1; }); } catch (e) { res.error_adjuntos_dinero = String(e && e.message || e).slice(0, 120); }
  const nuevos = recibidos.filter(m => conAdjunto[m.id] || documentoDinero_((m.h['Subject'] || '') + ' ' + (m.snippet || '')));
  if (!nuevos.length) return;
  const l = st.get('dinero', []);
  const ya = {};
  l.forEach(x => { ya[x.m] = 1; });
  nuevos.forEach(m => { if (!ya[m.id]) l.unshift({ t: Number(m.internalDate) || Date.now(), h: m.threadId, m: m.id, co: correo_(m.h['From']), de: nombreDe_(m.h['From']), as: corto_(m.h['Subject'] || '(sin asunto)', 90) }); });
  st.set('dinero', l.filter(x => Date.now() - x.t < CORRIDA.DIAS_DINERO * 86400000).slice(0, CORRIDA.MAX_DINERO));
  res.documentos_de_dinero = nuevos.length;
}

// Lo que movió una política con criterio pasa también por el juicio de Opus, aunque ya esté en su carpeta: el criterio
// ("lo que pide algo con fecha sale en Hoy") solo lo puede aplicar Opus. Sale en ver_novedades hasta que lo juzga.
function anotarParaJuicio_(st, items, politica) {
  const p = listaPoliticas_(st).filter(x => x.id === politica)[0];
  if (!p || !String(p.criterio || '').trim()) return;
  const l = st.get('por_juzgar', []);
  const ya = {};
  l.forEach(x => { ya[x.m] = 1; });
  items.forEach(i => { if (!ya[i.m]) l.unshift({ t: i.f || Date.now(), h: i.h, m: i.m, co: i.co, de: i.de, as: i.as, pol: politica, mv: Date.now() }); });
  st.set('por_juzgar', l.filter(x => Date.now() - x.mv < CORRIDA.DIAS_DINERO * 86400000).slice(0, CORRIDA.MAX_DINERO));
}

function ejecutarPoliticas_(st, msgs, ctx, res, op) {
  op = op || {};
  const pc = contextoPoliticas_(st);
  if (!pc.politicas.length) { res.sin_politicas = true; return; }
  consultasPara_(pc, msgs.map(m => m.id), 3);
  pc.conversaciones = conversacionesDe_(msgs);
  const grupos = {};
  const espera = st.get('en_espera', {});
  const avisos = st.get('avisos', []);
  const conflictos = st.get('conflictos', []);
  msgs.forEach(m => {
    const dec = decidirMensaje_(m, pc);
    const k = dec.accion === 'actua' ? textoAcciones_(dec.acciones, st) : (dec.espera ? 'espera el juicio de Opus' : 'queda');
    res.decisiones[k] = (res.decisiones[k] || 0) + 1;
    if (dec.conflicto) conflictos.unshift({ t: Date.now(), hilo: m.threadId, remitente: dec.hechos.de, politicas: dec.conflicto, gano: dec.politica });
    if (dec.espera) { espera[m.id] = [Date.now(), m.threadId]; res.esperan_a_opus++; }
    dec.avisos.forEach(pid => avisos.unshift({ t: Date.now(), h: m.threadId, m: m.id, de: nombreDe_(m.h['From']), co: dec.hechos.de, as: corto_(m.h['Subject'] || '(sin asunto)', 90), politica: pid }));
    if (dec.accion !== 'actua' || !dec.acciones.length) return;
    const it = itemDe_(m);
    if (dec.sensible) it.sens = dec.sensible;
    const nivel = dec.nivel;
    const g = grupos[dec.politica + '|' + nivel + '|' + dec.acciones.join(',')] = grupos[dec.politica + '|' + nivel + '|' + dec.acciones.join(',')] || { politica: dec.politica, nivel: nivel, acciones: dec.acciones, items: [] };
    g.items.push(it);
  });
  st.set('en_espera', espera);
  st.set('avisos', avisos.slice(0, 200));
  st.set('conflictos', conflictos.slice(0, COS.MAX_CONFLICTOS));
  Object.keys(grupos).forEach(k => {
    const g = grupos[k];
    if (g.nivel === 'propone') {
      const p = proponerLote_(st, g.politica, g.items);
      sumarDisparos_(st, g.politica, g.items.length);
      res.propuesto[g.politica] = (res.propuesto[g.politica] || 0) + g.items.length;
      g.items.slice(0, 3).forEach(i => res.ejemplos.push({ propuesta: p.id, politica: g.politica, de: i.de + ' <' + i.co + '>', asunto: i.as }));
      return;
    }
    try {
      const r = aplicarItems_(st, g.acciones, g.items, g.politica, 'motor', { aviso: g.nivel === 'avisa' });
      res.aplicado[g.politica] = (res.aplicado[g.politica] || 0) + r.n;
      if (r.n) anotarParaJuicio_(st, g.items, g.politica);
    } catch (err) {
      res.errores.push(g.politica + ': ' + String(err && err.message || err));
      // Lo que alcanzó a hacer ya tiene su línea y su Deshacer (aplicarItems_); lo que Google rechazó vuelve a la siguiente corrida.
      if (err && err.aplicado) {
        res.aplicado[g.politica] = (res.aplicado[g.politica] || 0) + err.aplicado.n;
        anotarParaJuicio_(st, err.aplicado.items, g.politica);
      }
      reintentarAcciones_(st, err && err.pendientes ? err.pendientes : g.items);
    }
  });
}

// Correos que una política no alcanzó a tocar porque Google rechazó la llamada: vuelven a la siguiente corrida, hasta
// 3 veces en 3 días. Lo que ya se movió sale de la bandeja y no se vuelve a tocar.
const REINTENTOS_ACCION = { VECES: 3, DIAS: 3, MAX: 200 };
function reintentarAcciones_(st, items) {
  if (!items.length) return;
  const ahora = Date.now(), veces = st.get('reintentos_accion', {}), procesados = st.get('procesados', {}), cola = st.get('reintentar', []);
  items.forEach(i => {
    const v = veces[i.m] = veces[i.m] || [ahora, 0];
    if (++v[1] > REINTENTOS_ACCION.VECES) return;
    delete procesados[i.m];
    if (cola.indexOf(i.m) < 0) cola.push(i.m);
  });
  const vivos = Object.keys(veces).filter(id => ahora - veces[id][0] < REINTENTOS_ACCION.DIAS * 86400000).sort((a, b) => veces[b][0] - veces[a][0]).slice(0, REINTENTOS_ACCION.MAX);
  const v2 = {};
  vivos.forEach(id => { v2[id] = veces[id]; });
  st.set('reintentos_accion', v2);
  st.set('procesados', procesados);
  st.set('reintentar', topeCola_(st, cola));
}

// Lo que esperaba el juicio de Opus vuelve a pasar por las políticas cuando su hilo ya tiene juicio.
function revisarEspera_(st, ctx, res) {
  const espera = st.get('en_espera', {});
  const j = st.get('juicios', {});
  const ahora = Date.now();
  const listos = [];
  Object.keys(espera).forEach(id => {
    const x = espera[id];
    if (ahora - x[0] > CORRIDA.DIAS_ESPERA * 86400000) { delete espera[id]; return; }
    if (j[x[1]] && !j[x[1]].vencido) { listos.push(id); delete espera[id]; }
  });
  st.set('en_espera', espera);
  if (!listos.length) return;
  const msgs = leerMetadatos_(listos.slice(0, 100), ctx.t0).filter(m => tiene_(m, 'INBOX'));
  res.revisados_tras_juicio = msgs.length;
  if (msgs.length) ejecutarPoliticas_(st, msgs, ctx, res);
}

// ---------- Poda y métricas observadas ----------
function podar_(st) {
  cerrarRutinaVencida_(st);
  const ahora = Date.now();
  const p = st.get('procesados', {});
  const k = Object.keys(p);
  if (k.length > COS.MAX_PROCESADOS) {
    const p2 = {};
    k.sort((a, b) => p[b] - p[a]).slice(0, COS.MAX_PROCESADOS).forEach(x => { p2[x] = p[x]; });
    st.set('procesados', p2);
  }
  const h = st.get('huellas', {});
  const lim = Math.floor(ahora / 1000) - CORRIDA.DIAS_HUELLAS * 86400;
  const hk = Object.keys(h).filter(x => h[x][0] >= lim).sort((a, b) => h[b][0] - h[a][0]).slice(0, COS.MAX_HUELLAS);
  if (hk.length !== Object.keys(h).length) { const h2 = {}; hk.forEach(x => { h2[x] = h[x]; }); st.set('huellas', h2); }
  const mov = st.get('movidos', {});
  const limM = Math.floor(ahora / 1000) - CORRIDA.DIAS_MOVIDOS * 86400;
  const mk = Object.keys(mov).filter(x => mov[x][1] >= limM).sort((a, b) => mov[b][1] - mov[a][1]).slice(0, COS.MAX_MOVIDOS);
  if (mk.length !== Object.keys(mov).length) { const m2 = {}; mk.forEach(x => { m2[x] = mov[x]; }); st.set('movidos', m2); }
  const conocidos = st.get('conocidos', {});
  const ck = Object.keys(conocidos);
  if (ck.length > 6000) { const c2 = {}; ck.sort((a, b) => conocidos[b] - conocidos[a]).slice(0, 6000).forEach(x => { c2[x] = conocidos[x]; }); st.set('conocidos', c2); }
  // Una acción del motor que pasa 7 días sin deshacer ni rescate cuenta como observada (no como aprobada).
  const act = st.get('actividad', []);
  const rescatados = {};
  st.get('senales', []).forEach(x => { if (x.tipo === 'rescate' && x.id_mensaje) rescatados[x.id_mensaje] = 1; });
  let cambio = false;
  act.forEach(e => {
    if (e.actor !== 'motor' || !e.politica || !e.d || e.u || e.obs || ahora - e.t < COS.DIAS_OBSERVADA * 86400000) return;
    const ids = (e.d.ms || (e.d.partes || []).reduce((a, x) => a.concat(x.ms || []), [])).map(x => x[0]);
    e.obs = 1; cambio = true;
    if (!ids.some(id => rescatados[id])) sumarMetrica_(st, e.politica, 'o');
  });
  if (cambio) st.set('actividad', act);
  st.set('avisos', st.get('avisos', []).filter(a => ahora - a.t < CORRIDA.DIAS_AVISOS * 86400000));
  podarSenales_(st);
  const r = st.get('borradores_revisados', 0);
  if (ahora - r > 3600000) { try { revisarBorradores_(st); } catch (e) {} st.set('borradores_revisados', ahora); }
}

// ---------- Activadores ----------
// instalar: solo el activador de 10 minutos. Se instala al aprobar el plan.
function instalarMotor_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'corrida').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('corrida').timeBased().everyMinutes(10).create();
  const hoja = prepararHoja_();
  return conCandado_(st => {
    if (!st.get('instalado_desde', null)) st.set('instalado_desde', Date.now());
    listaPoliticas_(st);
    return { instalado: true, activadores: ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()), instalado_desde: fecha_(st.get('instalado_desde', Date.now())),
      medir_leido: 'Por remitente: lo que abre más de 1 de cada 10, o sin historia, se mide ' + COS.DIAS_MEDIR_LEIDO + ' días antes de marcar leído.', hoja: hoja.url };
  });
}

function desinstalarMotor_() {
  const quitados = [];
  ScriptApp.getProjectTriggers().forEach(t => { quitados.push(t.getHandlerFunction()); ScriptApp.deleteTrigger(t); });
  return { desinstalado: true, activadores_quitados: quitados, nota: 'La memoria sigue en la Hoja. El correo no se tocó.' };
}
