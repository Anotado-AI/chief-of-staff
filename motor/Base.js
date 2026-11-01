// --- Base del motor ---
// Constantes, utilidades, lectura de Gmail, etiquetas y huellas. El motor no juzga contenido: junta hechos,
// ejecuta las políticas que compiló Opus, guarda la memoria, mide y deshace.
// Nunca envía un correo. Nunca borra para siempre: lo más fuerte es la papelera, que Gmail guarda 30 días.

const COS = {
  VERSION: '3.7.3',
  RAIZ: 'Chief of Staff',
  LEER_DESPUES: 'Leer después',
  NIVELES: ['apagado', 'propone', 'avisa', 'solo'],
  NIVEL_TEXTO: { apagado: 'Apagado', propone: 'Te propongo', avisa: 'Te aviso', solo: 'Lo hago solo' },
  PRIORIDADES: ['riesgo', 'alta', 'media', 'baja', 'ruido'],
  DIAS_RESPALDO: 2,
  DIAS_DESHACER: 30,
  DIAS_CORRESPONSALES: 7,
  DIAS_MEDIR_LEIDO: 14,
  DIAS_OBSERVADA: 7,
  HORAS_JUICIO_DETENIDO: 24,
  MAX_NUEVOS: 300, MAX_COLA: 3000,
  MAX_ACTIVIDAD: 400,
  MAX_HUELLAS: 1500,
  MAX_MOVIDOS: 2000,
  MAX_PROCESADOS: 2500,
  MAX_JUICIOS: 1500,
  MAX_SEGUIMIENTOS: 200,
  MAX_CORRIDAS: 60,
  MAX_CONFLICTOS: 200,
  MAX_BORRADORES: 40,
  MAX_TEXTO_PAR: 1000,
  MAX_ESPERA: 300,
  RX_GENERICO: /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|mac|aol|prodigy|protonmail|proton)\./i
};

// Encabezados que el motor lee de cada correo.
const ENCABEZADOS = ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date', 'Reply-To', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'List-Id', 'Precedence',
  'Auto-Submitted', 'Feedback-ID', 'X-SES-Outgoing', 'X-Mailgun-Sid', 'X-Campaign-Id', 'X-MC-User', 'Authentication-Results'];
const PRESUPUESTO_MS = 270 * 1000;
const LOTE_LECTURA = 40;

// Categorías de Gmail con el nombre que usan las políticas.
const CAT_LETRA = { CATEGORY_PROMOTIONS: 'promociones', CATEGORY_SOCIAL: 'social', CATEGORY_UPDATES: 'notificaciones', CATEGORY_FORUMS: 'foros', CATEGORY_PERSONAL: 'principal' };

// Los cuatro temas sensibles: siempre se proponen, en cualquier nivel, y no se pueden quitar.
// Dinero sensible es lo que pide decidir o mover dinero (pagar fuera de lo recurrente, transferir, aprobar un gasto,
// cambiar una cuenta). Comprobantes, recibos, facturas y avisos de pago no lo son: son documento_de_dinero, un hecho
// que Opus revisa en su siguiente corrida aunque una política ya los haya movido.
const SENSIBLES_FIJOS = ['dinero', 'contratos', 'consejo', 'prensa'];
const RX_SENSIBLE = {
  dinero: /(transfi[eé]re(me|nos|le)?\b|transferir|(haz|hacer|realiza|realizar|env[ií]a|enviar) (la |una |el )?(transferencia|dep[oó]sito|pago)|cambio de cuenta|nueva cuenta (bancaria|de dep[oó]sito)|cuenta (bancaria )?(nueva|distinta|diferente)|(actualiza|actualizar|actualizamos|actualizado|cambiamos|cambiado|cambiar) (tus |sus |los |nuestros )?datos bancarios|(apruebes|autorices|aprueba|autoriza) (el |un |este |la )?(gasto|pago|presupuesto|factura|transferencia)|datos bancarios (nuevos|actualizados)|aprob(ar|ar[aá]s|aci[oó]n de|aci[oó]n del)? ?(el |un |este |del |de )?(gasto|pago|presupuesto)|autoriza(r|ci[oó]n del|ci[oó]n de)? ?(el |un |del |de )?(pago|gasto|cargo)|(env[ií]o|te comparto|adjunto) (la |mi |nuestra )?cotizaci[oó]n|cotizaci[oó]n (adjunta|solicitada|para)|presupuesto para|honorarios|pr[eé]stamo|\bwire transfer\b|bank (account|details) (change|update)|change of bank|new bank account|approve (the |this )?(payment|expense|invoice|budget)|please (pay|transfer|wire)|\bquote for\b|\bloan\b)/i,
  // Un contrato seguido de número (que no sea un año) o de "No." es una cuenta de un servicio, no algo que se firma.
  contratos: /(contrato(?!s?\s*(?:(?:[:#]|n[oº°]\.?|n[uú]m(?:ero|\.)?)\s*\d|(?!(?:19|20)\d\d\b)\d)|s?\s+n[oº°]\.)|convenio|acuerdo de|addendum|adenda|carta de intenci[oó]n|term ?sheet|\bnda\b|confidencialidad|\bfirma(r|do|da)?\b|contract|agreement|signature|docusign)/i,
  consejo: /(consejo de administraci[oó]n|consejer[oa]s?\b|\bconsejo\b|\bboard\b|asamblea|comit[eé] de (auditor[ií]a|compensaci)|junta de consejo)/i,
  prensa: /(prensa|periodista|reportero|entrevista (para|con)|medios de comunicaci[oó]n|\bpress\b|journalist|reporter|interview request|comunicado)/i
};

// Documento de dinero: factura, recibo, comprobante, estado de cuenta, cargo o aviso de pago. Es un hecho, no un juicio.
const RX_DOCUMENTO_DINERO = /(factura|\bcfdi\b|recibo|comprobante|estado de cuenta|aviso de (pago|cobro|cargo)|pago (recibido|realizado|exitoso|confirmado|aplicado|pendiente|vencido|rechazado|por vencer)|fecha l[ií]mite de pago|(paga|pagar|liquida) tu|cargo (a tu|en tu|recurrente|autom[aá]tico|no reconocido)|\bcobro|domiciliaci[oó]n|tu (pago|recibo|factura|cargo|mensualidad)|\bclabe\b|\bspei\b|transferencia (recibida|realizada|enviada|exitosa)|dep[oó]sito (recibido|realizado)|invoice|receipt|billing statement|payment (received|confirmation|due|failed|reminder)|your (bill|statement|payment|invoice|receipt)|amount due|auto-?pay)/i;
function documentoDinero_(texto) { return RX_DOCUMENTO_DINERO.test(texto || ''); }

// Lo que nunca se limpia (ni papelera, ni spam, ni baja, ni leído), aunque Opus afine el vocabulario: códigos, accesos,
// cobros fallidos, cambios en el contrato o el plan de la persona y un servicio suyo que va a fallar (almacenamiento lleno,
// respaldo detenido, cuenta o servicio suspendido, tarjeta por vencer). Se revisa el asunto y el inicio del cuerpo.
// Bandeja limpia tampoco los archiva, salvo un código de verificación leído y vencido: por eso el código
// va en su propia lista. Un correo con código y con aviso de acceso cuenta como acceso y se queda.
const RX_CODIGO_VERIFICACION = /(c[oó]digo (de )?(verificaci[oó]n|seguridad|acceso|confirmaci[oó]n|un solo uso)|verification code|security code|one[- ]time (code|password|passcode)|\botp\b)/i;
const RX_NUNCA_LIMPIAR_SALVO_CODIGO = /(alertas? de seguridad|avisos? de seguridad|security (alerts?|warning|notification|notice)|actividad (sospechosa|inusual)|(suspicious|unusual) (activity|sign[- ]?in|login)|intentos? de (acceso|inicio de sesi[oó]n)|inicio de sesi[oó]n|nuevo acceso|acceso (nuevo|desde|a tu cuenta)|(restablec\w*|cambi\w*|recupera\w*) (de |tu |la )*contrase[ñn]a|new sign[- ]?in|sign[- ]?in attempt|password (reset|change)|login (alert|attempt)|(pago|cargo|cobro|tarjeta|domiciliaci[oó]n) (fue )?(rechazad|declinad|fallid|no (aplicad|procesad|autorizad|exitos))[oa]|no pudimos (procesar|cobrar|realizar|aplicar) (tu |el |la )?(pago|cargo|cobro|domiciliaci[oó]n)|payment (failed|declined|unsuccessful)|card (was )?declined|(cambios?|actualizaci[oó]n|modificaci[oó]n)(es)? (a|en|de) (los |las |nuestros |nuestras |tus |su |tu )?(t[eé]rminos|condiciones|contrato|tarifas?)|updates? to (our|your) (terms|agreement|contract)|changes to (our|your) (terms|agreement|contract)|\b(payment|pago)\b.{0,100}\b(was|fue|has been|ha sido) (unsuccessful|declined|rejected|rechazad[oa]|declinad[oa]|no (exitos|aplicad|procesad)[oa])|(downgrade|upgrade|cancellation|plan change) (is |was |has been )?(scheduled|confirmed)|(cambio de plan|cancelaci[oó]n|baja de tu plan) (est[aá] |fue |ha sido )?(programad|confirmad)[oa]|\byour updated plan\b|\btu plan (actualizado|cambi[oó])|\b(your|tu) (plan|subscription|membership|suscripci[oó]n|membres[ií]a) (has been |was |will be |ha sido |fue |ser[aá] )(changed|updated|downgraded|cancel+ed|suspended|paused|cambiad[oa]|actualizad[oa]|cancelad[oa]|suspendid[oa]|pausad[oa])|\b(subscription|membership) (will )?(expires?|ends?) on|(suscripci[oó]n|membres[ií]a) (vence|termina|expira) el|storage (is |almost |nearly )*(full|exceeded)|almacenamiento (est[aá] |casi )*(lleno|agotado)|(no longer|stopped) backing up|(ya no se|dej[oó] de) respald|\baccount (will be |has been |is )?(suspended|deactivated|locked|on hold)|\bcuenta (ser[aá] |fue |ha sido |est[aá] )?(suspendida|desactivada|bloqueada)|service (will be |has been )?(interrupted|suspended|disconnected)|servicio (ser[aá] |fue |ha sido )?(suspendido|interrumpido|cortado)|(card|tarjeta) (is |est[aá] )?(expiring|about to expire|expires soon|por vencer|vence pronto|vencida|expired))/i;
const RX_NUNCA_LIMPIAR = new RegExp(RX_CODIGO_VERIFICACION.source + '|' + RX_NUNCA_LIMPIAR_SALVO_CODIGO.source, 'i');
// Un adeudo de la persona (cobro fallido, saldo o pago vencido, recargos, cobranza, fecha límite) tampoco se limpia, aunque traiga
// una promoción (bonificación, descuento, cupón): la palabra de adeudo gana. «Último aviso», «atraso», «overdue» y suspender
// también los usa la publicidad: cuentan como adeudo solo sin una promoción al lado. «No adeudo», una constancia, no es
// adeudo. Nada de esto cuenta en correo masivo de un remitente sin historia (masivoAdeudo_).
const RX_ADEUDO = /(\badeudos?\b|\brecargos?\b|\bcargos? moratorios?\b|\bsaldos? vencidos?\b|\bpagos?( m[ií]nimos?)? vencidos?\b|\bpayment (is )?(past )?due\b|\bpast due\b|\b(tu|su) pago vence\b|\bfecha l[ií]mite de pago\b|\bpagos? pendientes?\b|\bcobranza\b|\bvencid[oa]s?\b|\b(cobros?|cargos?|pagos?) (fallidos?|rechazados?|declinados?)\b|\b(payments?|charges?) (failed|declined)\b|\bfailed (payments?|charges?)\b)/i;
const RX_ADEUDO_DEBIL = /(\boverdue\b|\batrasos?\b|[uú]ltimo aviso\b|\bsuspend(er|eremos|eríamos|ido|ida|imos)\b|\bsuspensi[oó]n\b)/i;
const RX_PROMOCION = /(\bconsolida\w*|\bdescuento|\bmeses sin intereses\b|\bofertas?\b|\bpromoci[oó]n\w*|\brebaja\w*|\bcashback\b|\bblack friday\b|\bbuen fin\b|\bhot sale\b|\bbonificaci[oó]n\w*|\bcup[oó]n\w*|\d+\s*%\s*(de descuento|off|menos|on\b|en tod[oa]s?\b)|\bhasta (el )?\d+\s*%|\boff\b.*\b(flights?|vuelos?)\b|\bvacation|\bvacaciones\b|\b(pr[eé]stamo|cr[eé]dito) (pre)?aprobado)/i;
const RX_NO_ADEUDO = /\bno adeudos?\b/gi;
function adeudo_(texto) {
  const t = String(texto || '').replace(RX_NO_ADEUDO, ' ');
  return RX_ADEUDO.test(t) || RX_ADEUDO_EXTRA.test(t) || (RX_ADEUDO_DEBIL.test(t) && !RX_PROMOCION.test(t));
}
// Una palabra de adeudo deja el correo en el piso, sea cual sea el dominio; nombrar a una autoridad (SAT, Infonavit,
// CONDUSEF, Hacienda) también, sin exigir dominio de gobierno, porque el piso protege. Lo que es fraude lo juzga Protección.
const RX_ADEUDO_EXTRA = /\b(moratori[oa]s?|saldos? pendientes?|mensualidades? vencidas?|sat|imss|infonavit|issste|fovissste|shcp|hacienda|condusef)\b/i;
const RX_GOBIERNO = /\b(sat|imss|infonavit|issste|fovissste|shcp|hacienda|tesorer[ií]a|gobierno|condusef|profeco)\b/i;
const RX_NO_ADEUDO_GOB = /(\bno adeudo\b|\bconsolida\w*|\bdescuento|\bmeses sin intereses\b|\bofertas?\b|\bpromoci[oó]n\w*|\b(pr[eé]stamo|cr[eé]dito) (pre)?aprobado)/i;
function gobiernoAutenticado_(m) {
  const h = (m && m.h) || cabeceras_(m), val = k => h[k] || h[k.toLowerCase()] || '';
  const de = correo_(val('From'));
  return /(^|\.)gob\.mx$|(^|\.)gov(\.[a-z]{2})?$/.test(dominio_(de)) && autenticadoAlineado_(val('Authentication-Results'), de);
}
function adeudoDe_(texto, m) {
  const t = texto || '';
  if (m && RX_GOBIERNO.test(t) && gobiernoAutenticado_(m)) return adeudo_(t) || !RX_NO_ADEUDO_GOB.test(t);
  return adeudo_(t);
}
// Un cobro fallido dicho con otras palabras, en cualquier correo: «rechazado por el emisor», «no pudo ser procesado»,
// «no logramos cobrar». La puntuación no corta una señal: dos puntos, punto y coma, comas y guiones pasan a espacio.
const RX_COBRO_FALLIDO = /(\bpagos? rechazados?\b|\brechazad[oa]s? por (el|tu|su) (emisor|banco)\b|\bno (pudo|pudieron) ser procesad[oa]s?\b|\bno se (pudo|pudieron) procesar\b|\bno (logramos|pudimos) cobrar\b|\bcargos? rechazados?\b|\bpayments? (failed|declined)\b)/i;
function sinPuntuacion_(texto) { return String(texto || '').replace(/[:;,\-\u2013\u2014]+/g, ' ').replace(/\s+/g, ' '); }
function nuncaSeLimpia_(texto, masivo, m) { const t = sinPuntuacion_(texto); return RX_NUNCA_LIMPIAR.test(t) || RX_COBRO_FALLIDO.test(t) || (!masivo && adeudoDe_(t, m)); }
function nuncaSeLimpiaSalvoCodigo_(texto, masivo, m) { const t = sinPuntuacion_(texto); return RX_NUNCA_LIMPIAR_SALVO_CODIGO.test(t) || RX_COBRO_FALLIDO.test(t) || (!masivo && adeudoDe_(t, m)); }
// Correo masivo para el piso de adeudos: en Promociones, o con List-Unsubscribe fuera de Notificaciones (ahí llega el aviso
// transaccional del banco, que también trae List-Unsubscribe), de un remitente sin historia: la persona no le escribe, Opus
// no lo ha juzgado y no tiene ficha. Ahí un «adeudo» suele ser publicidad.
function masivoAdeudo_(m, st, mapaCorr) {
  const h = (m && m.h) || cabeceras_(m);
  const val = k => h[k] || h[k.toLowerCase()] || '';
  if (!tiene_(m, 'CATEGORY_PROMOTIONS') && !(val('List-Unsubscribe') && !tiene_(m, 'CATEGORY_UPDATES'))) return false;
  if (gobiernoAutenticado_(m)) return false;
  const de = correo_(val('From'));
  if (mapaCorr && mapaCorr[de]) return false;
  if (!st) return true;
  const c = st.get('corresponsales', null);
  if ((c && (c.lista || []).indexOf(de) >= 0) || st.get('conocidos', {})[de]) return false;
  const f = fichaDe_(st.get('fichas', []), de);
  return !(f.persona || f.organizacion);
}
function codigoVerificacion_(texto) { return RX_CODIGO_VERIFICACION.test(texto || ''); }
// Lo que ninguna ruta automática saca de Recibidos, en los mensajes recibidos de un hilo (metadatoDe_): accesos,
// alertas de seguridad, cobros fallidos, cambios de plan o contrato y servicios que van a fallar, siempre; el código de
// verificación, sin leer o con menos de BANDEJA.CODIGO_VENCE_H horas. Devuelve el motivo o null.
function protegidoDeLimpiar_(md, ahora, st) {
  const rec = md.filter(m => !tiene_(m, 'SENT'));
  const texto = m => (m.h['Subject'] || '') + ' ' + (m.snippet || '');
  if (rec.some(m => nuncaSeLimpiaSalvoCodigo_(texto(m), masivoAdeudo_(m, st), m))) return 'nunca se limpia';
  if (rec.some(m => codigoVerificacion_(texto(m)) && (tiene_(m, 'UNREAD') || ahora - Number(m.internalDate) < BANDEJA.CODIGO_VENCE_H * 3600000))) return 'código sin vencer';
  return null;
}
// Búsquedas de Gmail que juntas encuentran todo lo que RX_NUNCA_LIMPIAR_SALVO_CODIGO protege: cada una pide palabras
// sin las cuales una parte de la regla no se cumple ({…} es una de ellas). La regla confirma después con asunto y vista
// previa; sirve donde no se lee cada correo, como la limpieza de lo viejo.
const BUSQUEDA_NUNCA_LIMPIAR = [
  '{alerta alertas aviso avisos} seguridad', 'security {alert alerts warning notification notice}', 'actividad {sospechosa inusual}',
  '{suspicious unusual} {activity sign signin login}', '{intento intentos} {acceso inicio}', 'inicio {sesión sesion}', 'acceso {nuevo desde cuenta}',
  '{contraseña contrasena}', '{sign signin} {new attempt}', 'password {reset change}', 'login {alert attempt}',
  '{pago cargo cobro tarjeta domiciliación domiciliacion} {rechazado rechazada declinado declinada fallido fallida aplicado aplicada procesado procesada autorizado autorizada exitoso exitosa}',
  'pudimos {pago cargo cobro domiciliación domiciliacion}', 'payment {failed declined unsuccessful rejected}', 'card declined',
  '{payment pago} {rechazado rechazada declinado declinada}',
  '{cambio cambios actualización actualizacion actualizaciones modificación modificacion modificaciones} {términos terminos condiciones contrato tarifa tarifas}',
  '{update updates changes} {terms agreement contract}', '{downgrade upgrade cancellation change} {scheduled confirmed}',
  '{plan cancelación cancelacion} {programado programada confirmado confirmada}', 'updated plan', 'plan {actualizado cambió cambio}',
  '{plan subscription membership suscripción suscripcion membresía membresia} {changed updated downgraded canceled cancelled suspended paused cambiado cambiada actualizado actualizada cancelado cancelada suspendido suspendida pausado pausada}',
  '{subscription membership} {expire expires end ends}', '{suscripción suscripcion membresía membresia} {vence termina expira}',
  'storage {full exceeded}', 'almacenamiento {lleno agotado}', 'backing', '{respalda respaldan respaldar respaldando respaldo respaldos}',
  'account {suspended deactivated locked hold}', 'cuenta {suspendida desactivada bloqueada}', 'service {interrupted suspended disconnected}',
  'servicio {suspendido interrumpido cortado}', '{card tarjeta} {expiring expire expires vencer vence vencida expired}',
  '{adeudo adeudos}', '{saldo saldos} {vencido vencidos}', '{pago pagos} {vencido vencidos}', 'payment due', 'past due', 'overdue',
  'pago vence', '{límite limite} pago', '{pago pagos} {pendiente pendientes}', 'cobranza', 'atraso {pago pagos}', '{último ultimo} aviso',
  'suspender {servicio cuenta línea linea}', '{estado estados} cuenta'
];

// Tema sensible de un texto: los cuatro fijos más los que la persona agregó en su perfil.
// El vocabulario de cada tema lo escribe Opus en el perfil (vocabulario_sensible) y manda sobre RX_SENSIBLE, que queda
// de respaldo para el tema que el perfil no trae. Los cuatro temas no se quitan: una lista vacía vuelve al respaldo.
// sensibleDetalle_ dice además por qué: {tema, palabra, fuente, donde}. fuente: vocabulario del perfil, lista de respaldo del
// motor o tema propio del perfil. donde (si se pasa el asunto): asunto o extracto del cuerpo; el motor solo mira el asunto
// y el inicio del cuerpo.
// masivo (masivo_): en el correo masivo cuenta solo el asunto y prensa no cuenta.
function sensibleDetalle_(texto, st, asunto, masivo) {
  const t = masivo && asunto !== undefined ? String(asunto || '') : texto || '';
  const voc = st ? (perfil_(st).vocabulario_sensible || {}) : {};
  const bajo0 = sinAcentos_(t).toLowerCase();
  const arma = (tema, palabra, fuente) => {
    const d = { tema: tema, palabra: String(palabra || '').trim().slice(0, 60), fuente: fuente };
    if (asunto !== undefined) d.donde = sinAcentos_(String(asunto || '')).toLowerCase().indexOf(sinAcentos_(d.palabra).toLowerCase()) >= 0 ? 'asunto' : 'extracto del cuerpo';
    return d;
  };
  for (let k = 0; k < SENSIBLES_FIJOS.length; k++) {
    const x = SENSIBLES_FIJOS[k], w = voc[x];
    if (masivo && x === 'prensa') continue;
    if (!Array.isArray(w) || !w.length) { const m = t.match(RX_SENSIBLE[x]); if (m) return arma(x, m[0], 'lista de respaldo del motor'); continue; }
    const p = w.filter(p => { const q = sinAcentos_(String(p)).toLowerCase().trim(); if (!q) return false; const i = bajo0.indexOf(q); return i >= 0 && !/[a-z0-9]/.test(bajo0.charAt(i - 1) || ' ') && !/[a-z0-9]/.test(bajo0.charAt(i + q.length) || ' '); })[0];
    if (p) return arma(x, p, 'vocabulario del perfil');
  }
  if (!st) return null;
  const extra = (perfil_(st).sensibles || []).filter(s => SENSIBLES_FIJOS.indexOf(s.tema) < 0);
  for (let k = 0; k < extra.length; k++) {
    const p = (extra[k].palabras || []).filter(p => p && bajo0.indexOf(sinAcentos_(p).toLowerCase()) >= 0)[0];
    if (p) return arma(extra[k].tema, p, 'tema propio del perfil');
  }
  return null;
}
function sensible_(texto, st) { const d = sensibleDetalle_(texto, st); return d ? d.tema : null; }
// Correo masivo: con lista (List-Id o List-Unsubscribe) o en Promociones o Notificaciones de Gmail, de alguien a quien la
// persona no le escribió en 90 días. Los boletines hablan de entrevistas, cotizaciones y transferencias sin pedirle nada a
// la persona: en el simulacro de la instalación en vivo los 9 temas sensibles de correo masivo fueron falsos.
// Lo que nunca se limpia (cobros fallidos, accesos, cuentas suspendidas) va por protegidoDeLimpiar_ y no cambia.
function masivo_(m, st) {
  const h = (m && m.h) || cabeceras_(m);
  const val = k => h[k] || h[k.toLowerCase()] || '';
  if (!val('List-Id') && !val('List-Unsubscribe') && !tiene_(m, 'CATEGORY_PROMOTIONS') && !tiene_(m, 'CATEGORY_UPDATES')) return false;
  const c = st ? st.get('corresponsales', null) : null;
  return !(c && (c.lista || []).indexOf(correo_(val('From'))) >= 0);
}
// Tema sensible de un mensaje: asunto y cuerpo (el inicio, si no se pasa), con la regla del correo masivo.
function sensibleDeMensaje_(m, st, cuerpo) {
  const h = (m && m.h) || cabeceras_(m), asunto = h['Subject'] || h['subject'] || '';
  return sensibleDetalle_(asunto + ' ' + (cuerpo !== undefined ? cuerpo : (m && m.snippet) || ''), st, asunto, masivo_(m, st));
}
// "tema de dinero («transferir», lista de respaldo del motor, en el asunto)".
function textoSensible_(d) {
  if (!d) return '';
  const extra = [d.palabra ? '«' + d.palabra + '»' : '', d.fuente || '', d.donde ? 'en el ' + d.donde : ''].filter(Boolean);
  return 'tema de ' + d.tema + (extra.length ? ' (' + extra.join(', ') + ')' : '');
}

// ---------- Utilidades ----------
function yo_() { return Session.getEffectiveUser().getEmail().toLowerCase(); }
// La zona horaria se pide una vez por ejecución: fecha_ corre miles de veces al guardar Actividad.
let TZ_ = null;
function tz_() { return TZ_ || (TZ_ = Session.getScriptTimeZone() || 'America/Mexico_City'); }
function fecha_(ms) { return Utilities.formatDate(new Date(Number(ms)), tz_(), 'yyyy-MM-dd HH:mm'); }
function dia_(ms) { return Utilities.formatDate(new Date(Number(ms)), tz_(), 'yyyy-MM-dd'); }
// La fecha, la hora y el día de la semana de la persona en la zona del proyecto.
function ahoraLocal_() {
  const z = tz_(), d = new Date(Date.now()), fecha = Utilities.formatDate(d, z, 'yyyy-MM-dd');
  const dia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(fecha + 'T12:00:00Z').getUTCDay()];
  return { fecha: fecha, hora: Utilities.formatDate(d, z, 'HH:mm'), dia: dia, zona: z };
}
function antiguedad_(ms) {
  const min = Math.max(0, Math.round((Date.now() - Number(ms)) / 60000));
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 48) return 'hace ' + h + ' h';
  return 'hace ' + Math.round(h / 24) + ' d';
}
function sinAcentos_(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function dominio_(c) { return (String(c || '').split('@')[1] || '').toLowerCase(); }
// Dominio de la organización, para alinear SPF y DKIM con el From: «avisos.banco.com.mx» es «banco.com.mx».
function dominioOrg_(d) {
  const p = String(d || '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  const n = p.length > 2 && p[p.length - 1].length === 2 && /^(com|org|net|gob|gov|edu|co|ac|ne|or)$/.test(p[p.length - 2]) ? 3 : 2;
  return p.slice(-n).join('.');
}
// Evidencia positiva: SPF o DKIM pasan con el dominio de la organización del From.
function autenticadoAlineado_(auth, from) {
  const a = String(auth || '').toLowerCase(), org = dominioOrg_(dominio_(correo_(from)));
  if (!org) return false;
  const dkim = (a.match(/\bdkim=pass[^;]*/g) || []).some(s => { const m = s.match(/header\.[id]=@?([a-z0-9.-]+)/); return !!m && dominioOrg_(m[1]) === org; });
  const spf = (a.match(/\bspf=pass[^;]*/g) || []).some(s => { const m = s.match(/smtp\.mailfrom=(?:[^@\s;]*@)?([a-z0-9.-]+)/); return !!m && dominioOrg_(m[1]) === org; });
  return dkim || spf;
}
function correo_(s) {
  if (!s) return '';
  const m = String(s).match(/<([^>]+)>/);
  return (m ? m[1] : String(s)).trim().toLowerCase();
}
function nombreDe_(from) {
  const s = String(from || '');
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</);
  return m ? m[1].trim() : correo_(s);
}
function correos_(s) { return (String(s || '').match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map(x => x.toLowerCase()); }
// El nombre que trae una cabecera Para o Cc por cada dirección (el que muestra Gmail); sin nombre, la dirección.
function nombresPorCorreo_(s) {
  const r = {};
  (String(s || '').match(/(?:"[^"]*"|[^,"])+/g) || []).forEach(p => {
    const c = correos_(p)[0];
    if (c && !r[c]) { const n = nombreDe_(p.trim()); r[c] = n && n.toLowerCase() !== c ? n : c; }
  });
  return r;
}
// Authentication-Results: vale solo el de Google, el de más arriba. Uno que trae el propio correo, abajo, no gana.
function authDeGoogle_(headers) {
  const auth = (headers || []).filter(x => String(x.name).toLowerCase() === 'authentication-results').map(x => String(x.value || ''));
  // Vale solo la de más arriba, y solo si es la de Google con su servidor exacto: «mx.google.com.evil.test», la de otro
  // servidor o una de Google más abajo no cuentan. Sin ella no hay autenticación.
  return auth.length ? (/^\s*mx\.google\.com\s*(;|$)/i.test(auth[0]) ? auth[0] : '') : undefined;
}
function cabeceras_(m) {
  const h = {}, hs = (m && m.payload && m.payload.headers) || [];
  hs.forEach(x => { h[x.name.toLowerCase()] = x.value; });
  const a = authDeGoogle_(hs);
  if (a !== undefined) h['authentication-results'] = a;
  return h;
}
function sinBorradores_(ms) { return (ms || []).filter(m => (m.labelIds || []).indexOf('DRAFT') < 0); }
function tiene_(m, l) { return ((m && m.labelIds) || []).indexOf(l) >= 0; }
function entidades_(s) {
  const nombres = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', iexcl: '¡', iquest: '¿',
    laquo: '«', raquo: '»', middot: '·', hellip: '…', mdash: '-', ndash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: '©', reg: '®', euro: '€', zwnj: '' };
  return String(s || '')
    .replace(/&#(\d+);/g, (a, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (a, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (a, n) => (n in nombres ? nombres[n] : a))
    .replace(/[͏­​-‏⁠﻿]/g, '').replace(/[ \t ]{2,}/g, ' ').trim();
}
// Un correo o un dominio (con sus subdominios) dentro de una lista.
function coincide_(lista, correo) {
  const c = String(correo || '').toLowerCase();
  const d = dominio_(c);
  return (lista || []).some(v => v === c || (v.indexOf('@') < 0 && !!d && (d === v || d.slice(-(v.length + 1)) === '.' + v)));
}
// La cuota de Gmail es por minuto: con un análisis leyendo en segundo plano, una escritura espera hasta 37 segundos antes de fallar.
const ESPERAS_GMAIL = [2000, 5000, 10000, 20000];
// Con el tope de unidades por minuto ("Units per minute per user"), las esperas suman 75 segundos para cruzar el minuto.
// Una ejecución espera a lo más 90 segundos por ese tope; después falla con el aviso del minuto.
const MINUTO_GMAIL = { ESPERAS: [5000, 15000, 25000, 30000], MAX_MS: 90000, esperado: 0,
  RX: /per minute|por minuto|de un minuto|rateLimitExceeded|user-rate limit|too many concurrent requests/i,
  TEXTO: 'Gmail limitó las lecturas por un minuto; llama una herramienta a la vez y vuelve en 60 s.' };
function esLimiteMinuto_(err) { return !!err && MINUTO_GMAIL.RX.test(String(err && err.message || err)); }
// Espera del intento n (desde 0) cuando Gmail limitó: con el tope por minuto, las esperas largas dentro de los 90 s de la
// ejecución; si ya no caben, -1 (se deja de intentar). Sin el tope por minuto, la espera corta de quien llama.
function esperaGmail_(n, minuto, corta) {
  if (!minuto) return cabeLaEspera_(corta) ? corta : -1;
  const ms = MINUTO_GMAIL.ESPERAS[Math.min(n, MINUTO_GMAIL.ESPERAS.length - 1)];
  if (MINUTO_GMAIL.esperado + ms > MINUTO_GMAIL.MAX_MS || !cabeLaEspera_(ms)) return -1;
  MINUTO_GMAIL.esperado += ms;
  return ms;
}
// Una llamada de Claude o de la web app contesta antes de que su cliente deje de esperar (unos 300 segundos): ninguna
// espera por Gmail empieza si ya no cabe en PLAZO.MS desde que empezó la llamada. El tope diario de Google no se repone
// en minutos: ese error no se reintenta.
const PLAZO = { MS: 240000, inicio: 0, RX_DIA: /too many times for one day|demasiadas veces para un mismo d[ií]a/i };
function cabeLaEspera_(ms) { return !PLAZO.inicio || Date.now() + ms <= PLAZO.inicio + PLAZO.MS; }
function conReintento_(fn, esperas) {
  for (let intento = 0; ; intento++) {
    try { return fn(); }
    catch (err) {
      if (!/quota|rate|429|500|backend|internal/i.test(String(err && err.message || err))) throw err;
      if (PLAZO.RX_DIA.test(String(err && err.message || err))) throw err;
      const minuto = esLimiteMinuto_(err);
      const lista = esperas || (minuto ? MINUTO_GMAIL.ESPERAS : ESPERAS_GMAIL);
      if (intento >= lista.length || !cabeLaEspera_(lista[intento])) throw err;
      if (minuto) {
        if (MINUTO_GMAIL.esperado + lista[intento] > MINUTO_GMAIL.MAX_MS) throw err;
        MINUTO_GMAIL.esperado += lista[intento];
      }
      Utilities.sleep(lista[intento]);
    }
  }
}
// Tope diario de Google: Apps Script cuenta cada llamada externa (UrlFetchApp) contra un tope por cuenta y por día. Al
// agotarse, cada llamada falla con "Service invoked too many times for one day: urlfetch" (en español, "Servicio
// solicitado demasiadas veces para un mismo día: urlfetch") y tarda segundos en fallar. Toda llamada externa pasa por
// externa_: la primera que choca con el tope deja la marca de esta ejecución y las demás fallan de inmediato, sin volver
// a llamar. La marca vive en la memoria de la ejecución; el almacén guarda cuándo pasó (limite_diario) para ver_hoy.
const LIMITE_DIARIO = {
  RX: /(service invoked too many times for one day|servicio solicitado demasiadas veces para un mismo d[ií]a)\s*:?\s*urlfetch/i,
  // Herramientas que no pasan por ese tope: leen y escriben la Hoja, o usan el servicio de Gmail de Apps Script. Medido con el tope simulado en el arnés.
  SIGUEN: ['ver_hoy', 'ver_memoria', 'ver_politicas', 'ver_propuestas', 'ver_hechos', 'ver_whatsapp', 'guardar_memoria', 'pedir_politica', 'guardar_politica',
    'cambiar_politica', 'proponer', 'responder', 'guardar_juicio', 'corregir_juicio', 'seguimiento', 'guardar_whatsapp', 'actuar', 'redactar_respuesta', 'pausar'],
  visto: 0,
  ok: 0,
  n: 0
};
function esLimiteDiario_(err) { return !!err && (err.limite_diario === true || LIMITE_DIARIO.RX.test(String(err && err.message || err))); }
function textoLimiteDiario_() {
  return 'Google limitó por hoy las lecturas de esta cuenta: se agotó el tope diario de llamadas externas del motor. Lo guardado está a salvo: memoria, reglas, ' +
    'propuestas, juicios y seguimientos siguen en la Hoja. Siguen sirviendo, porque no pasan por ese tope: ' + LIMITE_DIARIO.SIGUEN.join(', ') +
    ' (ver_hoy, sin los datos del correo; responder, salvo una propuesta con efecto aplicar). Mientras, guarda lo que ya tienes y anota en el cuaderno dónde te quedaste. Se repone solo en menos de 24 horas; después, ver_novedades trae completa la cola sin juicio.';
}
function errorLimiteDiario_() {
  const e = new Error('limite_diario: ' + textoLimiteDiario_());
  e.limite_diario = true;
  return e;
}
function externa_(fn) {
  if (LIMITE_DIARIO.visto) throw errorLimiteDiario_();
  let r;
  try { r = fn(); }
  catch (err) {
    if (!esLimiteDiario_(err)) { LIMITE_DIARIO.n++; throw err; }
    LIMITE_DIARIO.visto = Date.now();
    throw errorLimiteDiario_();
  }
  LIMITE_DIARIO.ok++;
  // fetchAll cuenta cada petición contra el tope.
  LIMITE_DIARIO.n += Array.isArray(r) ? r.length : 1;
  return r;
}

// Aviso antes de agotar el cupo diario de Google. El motor cuenta sus llamadas externas del día en una
// propiedad y avisa en Hoy al 80% y al 100%. El tope de Google por cuenta y por día: 20,000 en Gmail personal y 100,000 en
// Workspace. Google repone en una ventana de 24 horas que no coincide con la medianoche: la cuenta es aproximada.
// Reducir frecuencia deja la corrida cada 30 minutos hasta medianoche; Reanudar la regresa a cada 10.
const CUPO = { LLAVE: 'cos3.cupo', FRECUENCIA: 'cos3.frecuencia', AVISO: 0.8, TOPE_PERSONAL: 20000, TOPE_WORKSPACE: 100000, LENTA_MIN: 30 };
function leerProp_(k) { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(k) || 'null'); } catch (e) { return null; } }
function topeCupo_() { try { return /@(gmail|googlemail)\.com$/.test(yo_()) ? CUPO.TOPE_PERSONAL : CUPO.TOPE_WORKSPACE; } catch (e) { return CUPO.TOPE_PERSONAL; } }
// Al final de cada ejecución: suma lo de esta ejecución a la cuenta del día. Si Google ya repuso después de agotarse, la
// cuenta vuelve a empezar.
function anotarCupo_() {
  const n = LIMITE_DIARIO.n;
  if (!n && !LIMITE_DIARIO.visto) return;
  LIMITE_DIARIO.n = 0;
  try {
    sumarConCandado_(() => {
      const hoy = dia_(Date.now());
      let x = leerProp_(CUPO.LLAVE);
      if (!x || x.dia !== hoy || (x.agotado && !LIMITE_DIARIO.visto && LIMITE_DIARIO.ok)) x = { dia: hoy, n: 0 };
      x.n += n;
      if (LIMITE_DIARIO.visto) x.agotado = LIMITE_DIARIO.visto;
      PropertiesService.getScriptProperties().setProperty(CUPO.LLAVE, JSON.stringify(x));
    });
  } catch (e) { LIMITE_DIARIO.n += n; }
}
// Tiempo de activadores: Google da 90 minutos al día en Gmail personal y 6 horas en Workspace a lo que corre por un
// activador (corrida, análisis y limpieza), en una ventana de 24 horas que no empieza a medianoche. Cada ejecución suma sus
// segundos a su hora; la cuenta son las últimas 24 horas. Avisa con la tarjeta del cupo desde el 80%.
const TIEMPO = { LLAVE: 'cos3.tiempo', ESPERA: 'cos3.tiempo_espera', TOPE_PERSONAL: 90 * 60, TOPE_WORKSPACE: 6 * 3600, HORAS: 24 };
function topeTiempo_() { return topeCupo_() === CUPO.TOPE_PERSONAL ? TIEMPO.TOPE_PERSONAL : TIEMPO.TOPE_WORKSPACE; }
// Las cuentas se suman bajo el candado del script: dos ejecuciones que terminan juntas no se sobrescriben. Dentro de conCandado_
// el candado ya es de esta ejecución. La ventana guarda de una a dos horas de más: ante la duda, se cuenta de más.
// Sin el candado no se escribe la cuenta: se reintenta y, si sigue ocupado, falla con error y quien llama decide.
function sumarConCandado_(fn) {
  if (CANDADO.vueltas) return fn();
  let lock = null;
  for (let k = 0; k < 3 && !lock; k++) { try { const l = LockService.getScriptLock(); if (l.tryLock(k ? 5000 : 10000)) lock = l; } catch (e) {} }
  if (!lock) throw new Error('candado_ocupado: no escribí la cuenta sin el candado del script.');
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e) {} }
}
function anotarTiempo_(t0) {
  try {
    sumarConCandado_(() => {
      const ahora = Date.now(), h = Math.floor(ahora / 3600000), y = {};
      // Se lee otra vez justo antes de escribir: si otra ejecución sumó entre las dos lecturas (sin candado, o con uno que
      // no detuvo a nadie), su suma no se pierde.
      const x0 = leerProp_(TIEMPO.LLAVE) || {}, x = Object.assign({}, x0, leerProp_(TIEMPO.LLAVE) || {});
      Object.keys(x).forEach(k => { if (Number(k) > h - TIEMPO.HORAS - 2) y[k] = x[k]; });
      y[h] = Math.round(((Number(y[h]) || 0) + Math.max(0, ahora - t0) / 1000) * 10) / 10;
      PropertiesService.getScriptProperties().setProperty(TIEMPO.LLAVE, JSON.stringify(y));
    });
  } catch (e) {
    // Sin candado la cuenta no se toca: los segundos van a una llave aparte, que nadie con candado sobrescribe, y se suman igual.
    try {
      const ahora = Date.now(), h = Math.floor(ahora / 3600000), x = leerProp_(TIEMPO.ESPERA) || {}, y = {};
      Object.keys(x).forEach(k => { if (Number(k) > h - TIEMPO.HORAS - 2) y[k] = x[k]; });
      y[h] = Math.round(((Number(y[h]) || 0) + Math.max(0, ahora - t0) / 1000) * 10) / 10;
      PropertiesService.getScriptProperties().setProperty(TIEMPO.ESPERA, JSON.stringify(y));
    } catch (e2) {}
  }
}
function tiempoUsado_() {
  const h = Math.floor(Date.now() / 3600000), suma = x => Object.keys(x || {}).filter(k => Number(k) > h - TIEMPO.HORAS - 2).reduce((s, k) => s + (Number(x[k]) || 0), 0);
  return suma(leerProp_(TIEMPO.LLAVE)) + suma(leerProp_(TIEMPO.ESPERA));
}
function frecuenciaVigente_() {
  const f = leerProp_(CUPO.FRECUENCIA);
  return f && f.hasta > Date.now() ? f : null;
}
// La corrida del activador se salta mientras la frecuencia esté reducida y no hayan pasado sus minutos.
function frecuenciaOmite_() {
  const f = frecuenciaVigente_();
  if (!f) return false;
  if (Date.now() - (f.ultima || 0) < (f.cada_min - 1) * 60000) return true;
  f.ultima = Date.now();
  try { PropertiesService.getScriptProperties().setProperty(CUPO.FRECUENCIA, JSON.stringify(f)); } catch (e) {}
  return false;
}
// Para ver_hoy: nada abajo del 80%. accion es lo que ofrece la tarjeta: reducir_frecuencia o reanudar. recurso dice qué
// tope se acerca: lecturas (llamadas externas del día) o tiempo (de activadores en 24 horas); manda el más cercano.
function cupoDiario_() {
  const x = leerProp_(CUPO.LLAVE), f = frecuenciaVigente_();
  const hoy = x && x.dia === dia_(Date.now()) ? x : null;
  const tope = topeCupo_(), usado = hoy ? hoy.n : 0, pc = Math.round(100 * usado / tope);
  const agotado = !!(hoy && hoy.agotado) || pc >= 100;
  const seg = Math.round(tiempoUsado_()), topeT = topeTiempo_(), pcT = Math.round(100 * seg / topeT);
  const tiempo = { segundos: seg, tope: topeT, por_ciento: Math.min(pcT, 100) };
  if (!agotado && pcT >= CUPO.AVISO * 100 && pcT >= pc) {
    const sinTiempo = pcT >= 100;
    const lentaT = f ? 'Leo tu correo cada ' + f.cada_min + ' minutos hasta medianoche para no gastar el tiempo que Google le da a tu cuenta para trabajar sola.' : '';
    return { usado: seg, tope: topeT, por_ciento: Math.min(pcT, 100), nivel: sinTiempo ? 'agotado' : 'casi', recurso: 'tiempo', tiempo: tiempo, frecuencia: f ? 'reducida' : 'normal', cada_min: f ? f.cada_min : 10,
      hasta: f ? fecha_(f.hasta) : undefined, accion: f ? 'reanudar' : sinTiempo ? undefined : 'reducir_frecuencia',
      texto: sinTiempo ? 'Se acabó el tiempo que Google le da a tu cuenta para trabajar sola en 24 horas. Lo guardado está a salvo; sigo cuando Google lo reponga, en menos de 24 horas. Claude y esta página siguen sirviendo.' + (lentaT ? ' ' + lentaT : '')
        : lentaT || 'En las últimas 24 horas usé el ' + pcT + '% del tiempo que Google le da a tu cuenta para trabajar sola. Si leo cada ' + CUPO.LENTA_MIN + ' minutos en lugar de cada 10, alcanza.' };
  }
  if (!f && !agotado && pc < CUPO.AVISO * 100) return null;
  const lenta = f ? 'Leo tu correo cada ' + f.cada_min + ' minutos hasta medianoche para no gastar las lecturas que Google le da a tu cuenta por día.' : '';
  return { usado: usado, tope: tope, por_ciento: Math.min(pc, 100), nivel: agotado ? 'agotado' : 'casi', recurso: 'lecturas', tiempo: tiempo, frecuencia: f ? 'reducida' : 'normal', cada_min: f ? f.cada_min : 10,
    hasta: f ? fecha_(f.hasta) : undefined, accion: f ? 'reanudar' : agotado ? undefined : 'reducir_frecuencia',
    texto: agotado ? 'Hoy se acabaron las lecturas que Google le da a tu cuenta. Lo guardado está a salvo; sigo cuando Google las reponga, en menos de 24 horas.' + (lenta ? ' ' + lenta : '')
      : lenta || 'Hoy llevo el ' + pc + '% de las lecturas que Google le da a tu cuenta por día. Si leo cada ' + CUPO.LENTA_MIN + ' minutos en lugar de cada 10, alcanzan hasta mañana.' };
}
// pausar({frecuencia}): reducida o normal. No toca el correo ni los activadores.
function cambiarFrecuencia_(st, valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (['reducida', 'normal'].indexOf(v) < 0) throw new Error('frecuencia vale reducida o normal.');
  const props = PropertiesService.getScriptProperties(), antes = frecuenciaVigente_();
  if (!!antes === (v === 'reducida')) return { hecho: v === 'reducida' ? 'Ya leo cada ' + antes.cada_min + ' minutos.' : 'Ya leo cada 10 minutos.', frecuencia: v, sin_cambio: true };
  let texto;
  if (v === 'reducida') {
    const z = Utilities.formatDate(new Date(Date.now()), tz_(), 'XXX'), hoy = dia_(Date.now());
    const manana = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10)) + 1)).toISOString().slice(0, 10);
    props.setProperty(CUPO.FRECUENCIA, JSON.stringify({ cada_min: CUPO.LENTA_MIN, desde: Date.now(), hasta: Date.parse(manana + 'T00:00:00' + z), ultima: Date.now() }));
    texto = 'Leo tu correo cada ' + CUPO.LENTA_MIN + ' minutos hasta medianoche para no gastar las lecturas que Google le da a tu cuenta.';
  } else {
    props.deleteProperty(CUPO.FRECUENCIA);
    texto = 'Volví a leer tu correo cada 10 minutos.';
  }
  const e = anotar_(st, { texto: texto });
  return { hecho: e.texto, id_accion: e.id, frecuencia: v, cada_min: v === 'reducida' ? CUPO.LENTA_MIN : 10 };
}
// Cuándo chocó con el tope: el primero y el último de las últimas 24 horas. Si esta ejecución leyó bien, ya se repuso.
function anotarLimiteDiario_(st, donde) {
  if (LIMITE_DIARIO.visto) {
    const x = st.get('limite_diario', null);
    const nuevo = !x || Date.now() - x.ultimo > 86400000;
    st.set('limite_diario', { desde: nuevo ? LIMITE_DIARIO.visto : x.desde, ultimo: LIMITE_DIARIO.visto, veces: nuevo ? 1 : (x.veces || 1) + 1, donde: String(donde || '').slice(0, 40) });
  } else if (LIMITE_DIARIO.ok && st.get('limite_diario', null)) st.set('limite_diario', null);
}
// Para ver_hoy y la rutina: el aviso mientras no pase un día o mientras esta ejecución no haya leído bien.
function limiteDiarioVigente_(st) {
  const x = st.get('limite_diario', null);
  const vivo = !!x && Date.now() - x.ultimo < 86400000;
  if (!LIMITE_DIARIO.visto && (!vivo || LIMITE_DIARIO.ok)) return null;
  const desde = vivo ? x.desde : LIMITE_DIARIO.visto;
  return { desde: fecha_(desde), ultimo: fecha_(LIMITE_DIARIO.visto || x.ultimo),
    texto: 'Google limitó por hoy las lecturas de esta cuenta desde ' + fecha_(desde) + '. Lo guardado está a salvo y se repone solo en menos de 24 horas.' };
}

function nuevoId_(st, pre) {
  const n = (Number(st.get('contador', 0)) || 0) + 1;
  st.set('contador', n);
  return pre + n.toString(36);
}
function listId_(m) {
  const v = m.h['List-Id'] || '';
  const x = v.match(/<([^>]+)>/);
  return (x ? x[1] : v).trim().toLowerCase();
}
// Tipo de baja de un correo: un_clic (RFC 8058, POST a una dirección https), solo_correo (mailto) o ninguna.
function tipoBaja_(h) {
  const lu = String(h['List-Unsubscribe'] || h['list-unsubscribe'] || '');
  const post = String(h['List-Unsubscribe-Post'] || h['list-unsubscribe-post'] || '');
  if (/<https:\/\/[^>]+>/i.test(lu) && /List-Unsubscribe=One-Click/i.test(post)) return 'un_clic';
  if (/<mailto:[^>]+>/i.test(lu) || /<https?:\/\/[^>]+>/i.test(lu)) return 'solo_correo';
  return 'ninguna';
}
function plataforma_(h) {
  if (h['X-MC-User']) return 'Mailchimp';
  if (h['X-Mailgun-Sid']) return 'Mailgun';
  if (h['X-SES-Outgoing']) return 'Amazon SES';
  if (h['X-Campaign-Id']) return 'campaña';
  if (h['Feedback-ID']) return 'Feedback-ID';
  return null;
}
function categoriaGmail_(labelIds) {
  const c = (labelIds || []).filter(l => CAT_LETRA[l])[0];
  return c ? CAT_LETRA[c] : null;
}

// ---------- Lectura de Gmail ----------
// Las lecturas viajan en lotes de la API de Gmail: hasta 50 en una sola llamada externa. Apps Script cuenta cada llamada
// externa contra un tope diario por cuenta (20,000 en Gmail y 100,000 en Workspace); con una lectura por llamada, una
// bandeja grande lo agotaba en el primer análisis. Si la respuesta no llega como lote (otro servidor o una prueba local),
// esa parte se lee una por una, como antes.
// limitadas y minuto: cuántas lecturas de la última llamada a gmailFetchAll_ siguieron limitadas y si fue por el tope por minuto.
const LOTE_GMAIL = { URL: 'https://gmail.googleapis.com/batch/gmail/v1', POR_LOTE: 50, EN_PARALELO: 2, apagado: false, limitadas: 0, minuto: false };

function peticionLote_(rutas, token) {
  const f = 'cos' + Utilities.getUuid().replace(/-/g, '');
  const cuerpo = rutas.map((r, k) => '--' + f + '\r\nContent-Type: application/http\r\nContent-ID: <c' + k + '>\r\n\r\nGET /gmail/v1/users/me/' + r + '\r\n\r\n').join('') + '--' + f + '--\r\n';
  return { url: LOTE_GMAIL.URL, method: 'post', contentType: 'multipart/mixed; boundary=' + f, payload: cuerpo,
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
}

// Respuesta de un lote: [{codigo, cuerpo}] en el orden de las rutas, o null si no llegó como lote.
function respuestaLote_(r, n) {
  if (!r || r.getResponseCode() !== 200 || typeof r.getHeaders !== 'function') return null;
  const h = r.getHeaders() || {};
  const ct = String(h['Content-Type'] || h['content-type'] || '');
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(ct);
  if (!/multipart\/mixed/i.test(ct) || !m) return null;
  const salida = [];
  for (let k = 0; k < n; k++) salida.push(null);
  r.getContentText().split('--' + (m[1] || m[2])).forEach(parte => {
    const id = /Content-ID:\s*<response-c(\d+)>/i.exec(parte);
    const st = /HTTP\/1\.[01]\s+(\d{3})/.exec(parte);
    if (!id || !st) return;
    const k = Number(id[1]);
    if (!(k >= 0 && k < n)) return;
    const resto = parte.slice(st.index);
    const corte = resto.search(/\r?\n\r?\n/);
    const texto = corte >= 0 ? resto.slice(corte).trim() : '';
    let cuerpo = null;
    try { cuerpo = texto ? JSON.parse(texto) : null; } catch (e) { cuerpo = null; }
    salida[k] = { codigo: Number(st[1]), cuerpo: cuerpo, texto: texto };
  });
  return salida;
}

const limitadaLote_ = p => !p || p.codigo === 429 || p.codigo >= 500 || (p.codigo === 403 && /rate|quota|concurrent/i.test(p.texto || ''));

// Varias lecturas REST a Gmail: devuelve el JSON de cada ruta o null, en el mismo orden. Reintenta lo que Gmail limitó.
function gmailFetchAll_(rutas, lote) {
  const salida = rutas.map(() => null);
  LOTE_GMAIL.limitadas = 0; LOTE_GMAIL.minuto = false;
  if (!rutas.length) return salida;
  if (LOTE_GMAIL.apagado) return gmailUnoPorUno_(rutas, lote);
  const token = ScriptApp.getOAuthToken();
  let pendientes = rutas.map((r, k) => k);
  let minuto = false;
  for (let intento = 0, espera = 800; pendientes.length && intento < 5; intento++, espera *= 2) {
    if (intento) { const ms = esperaGmail_(intento - 1, minuto, espera); if (ms < 0) break; Utilities.sleep(ms); }
    const grupos = [];
    for (let i = 0; i < pendientes.length; i += LOTE_GMAIL.POR_LOTE) grupos.push(pendientes.slice(i, i + LOTE_GMAIL.POR_LOTE));
    const otraVez = [];
    for (let g = 0; g < grupos.length; g += LOTE_GMAIL.EN_PARALELO) {
      const tanda = grupos.slice(g, g + LOTE_GMAIL.EN_PARALELO);
      const resp = externa_(() => UrlFetchApp.fetchAll(tanda.map(gr => peticionLote_(gr.map(k => rutas[k]), token))));
      tanda.forEach((gr, x) => {
        const partes = respuestaLote_(resp[x], gr.length);
        if (!partes) {
          // No llegó como lote: esta parte, una por una, y el resto de la ejecución también.
          LOTE_GMAIL.apagado = true;
          gmailUnoPorUno_(gr.map(k => rutas[k]), lote).forEach((d, y) => { salida[gr[y]] = d; });
          return;
        }
        gr.forEach((k, y) => {
          const p = partes[y];
          if (limitadaLote_(p)) { otraVez.push(k); if (p && MINUTO_GMAIL.RX.test(p.texto || '')) minuto = true; }
          else if (p.codigo === 200) salida[k] = p.cuerpo;
        });
      });
      if (LOTE_GMAIL.apagado) {
        const resto = [];
        grupos.slice(g + LOTE_GMAIL.EN_PARALELO).forEach(gr => gr.forEach(k => resto.push(k)));
        if (resto.length) gmailUnoPorUno_(resto.map(k => rutas[k]), lote).forEach((d, y) => { salida[resto[y]] = d; });
        return salida;
      }
    }
    pendientes = otraVez;
  }
  LOTE_GMAIL.limitadas += pendientes.length; LOTE_GMAIL.minuto = LOTE_GMAIL.minuto || (minuto && pendientes.length > 0);
  return salida;
}

// Diagnóstico de administración: lee tres rutas por lote y dice si el lote funcionó o cayó al respaldo.
function probarLote_() {
  const t = Date.now();
  const r = gmailFetchAll_(['profile', 'labels/INBOX', 'labels/UNREAD'], 3);
  return { lote: !LOTE_GMAIL.apagado, leidas: r.filter(Boolean).length, de: 3, ms: Date.now() - t,
    muestra: r[0] ? { historyId: !!r[0].historyId, total: r[0].messagesTotal } : null };
}

// Una lectura por llamada externa: respaldo cuando el lote no está disponible.
function gmailUnoPorUno_(rutas, lote) {
  const token = ScriptApp.getOAuthToken();
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me/';
  const salida = rutas.map(() => null);
  lote = lote || 25;
  for (let i = 0; i < rutas.length; i += lote) {
    const pet = rutas.slice(i, i + lote).map(r => ({ url: base + r, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }));
    const resp = externa_(() => UrlFetchApp.fetchAll(pet));
    const limitada = r => { const c = r.getResponseCode(); return c === 429 || c >= 500 || (c === 403 && /rate|quota/i.test(r.getContentText())); };
    const minuto = k => MINUTO_GMAIL.RX.test(resp[k].getContentText() || '');
    for (let intento = 0, espera = 800; intento < 4; intento++, espera *= 2) {
      const fallidos = [];
      resp.forEach((r, k) => { if (limitada(r)) fallidos.push(k); });
      if (!fallidos.length) break;
      const ms = esperaGmail_(intento, fallidos.some(minuto), espera);
      if (ms < 0) break;
      Utilities.sleep(ms);
      const re = externa_(() => UrlFetchApp.fetchAll(fallidos.map(k => pet[k])));
      fallidos.forEach((k, j) => { resp[k] = re[j]; });
    }
    resp.forEach((r, k) => { if (r.getResponseCode() === 200) { try { salida[i + k] = JSON.parse(r.getContentText()); } catch (e) {} } else if (limitada(r)) { LOTE_GMAIL.limitadas++; if (minuto(k)) LOTE_GMAIL.minuto = true; } });
  }
  return salida;
}

// GET a la API de Gmail con espera creciente si Gmail limita la velocidad (429, o 403 por cuota).
function gmailGet_(url, token) {
  let r;
  for (let i = 0, espera = 1000; i < 5; i++, espera *= 2) {
    r = externa_(() => UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + (token || ScriptApp.getOAuthToken()) }, muteHttpExceptions: true }));
    const c = r.getResponseCode();
    if (!(c === 429 || c >= 500 || (c === 403 && /rate|quota/i.test(r.getContentText())))) break;
    const ms = esperaGmail_(i, MINUTO_GMAIL.RX.test(r.getContentText() || ''), espera);
    if (ms < 0) break;
    Utilities.sleep(ms);
  }
  return r;
}

function estadoMensajes_(ids) {
  const datos = gmailFetchAll_(ids.map(id => 'messages/' + id + '?format=minimal'), 40);
  const est = {};
  ids.forEach((id, k) => { if (datos[k]) est[id] = datos[k].labelIds || []; });
  return est;
}

function listarIds_(q, max, t0) {
  const ids = [];
  let token;
  do {
    const r = conReintento_(() => Gmail.Users.Messages.list('me', { q: q, maxResults: 500, pageToken: token }));
    (r.messages || []).forEach(m => ids.push(m.id));
    token = r.nextPageToken;
  } while (token && ids.length < max && Date.now() - (t0 || Date.now()) < PRESUPUESTO_MS);
  return ids.slice(0, max);
}

function leerMetadatos_(ids, t0) {
  t0 = t0 || Date.now();
  const salida = [], pendientes = [];
  const qs = ENCABEZADOS.map(h => 'metadataHeaders=' + encodeURIComponent(h)).join('&');
  // Por partes, para respetar el presupuesto de tiempo de la ejecución; cada parte viaja en lotes.
  const PARTE = LOTE_GMAIL.POR_LOTE * LOTE_GMAIL.EN_PARALELO * 2;
  for (let i = 0; i < ids.length; i += PARTE) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break;
    const parte = ids.slice(i, i + PARTE);
    gmailFetchAll_(parte.map(id => 'messages/' + id + '?format=metadata&' + qs), LOTE_LECTURA).forEach((d, k) => {
      if (d) salida.push(metadatoDe_(d)); else pendientes.push(parte[k]);
    });
  }
  pendientes.forEach(id => {
    if (Date.now() - t0 > PRESUPUESTO_MS) return;
    try { salida.push(metadatoDe_(Gmail.Users.Messages.get('me', id, { format: 'metadata', metadataHeaders: ENCABEZADOS }))); } catch (e) {}
  });
  return salida;
}

function metadatoDe_(m) {
  const h = {}, hs = (m.payload && m.payload.headers) || [];
  hs.forEach(x => { h[x.name] = x.value; });
  const a = authDeGoogle_(hs);
  if (a !== undefined) hs.forEach(x => { if (String(x.name).toLowerCase() === 'authentication-results') h[x.name] = a; });
  return { id: m.id, threadId: m.threadId, labelIds: m.labelIds, snippet: m.snippet, internalDate: m.internalDate, h: h };
}

function modificar_(ids, agregar, quitar) {
  for (let intento = 0, espera = 20000; ; intento++, espera += 15000) {
    try { Gmail.Users.Messages.batchModify({ ids: ids, addLabelIds: agregar, removeLabelIds: quitar }, 'me'); return intento; }
    catch (err) {
      if (intento >= 4 || !/quota|rate limit|429/i.test(String(err && err.message || err))) throw err;
      Utilities.sleep(espera);
    }
  }
}

// Correspondientes: a quién le escribió la persona en N días (para no limpiar a quien tiene intercambio).
function corresponsales_(diasHistoria, yo, t0) {
  const enviados = leerMetadatos_(listarIds_('in:sent newer_than:' + diasHistoria + 'd', 3000, t0), t0);
  const c = {};
  enviados.forEach(m => {
    [m.h['To'], m.h['Cc'], m.h['Bcc']].join(',').split(',').map(correo_).filter(x => x.indexOf('@') > 0).forEach(x => {
      if (x !== yo) c[x] = (c[x] || 0) + 1;
    });
  });
  return c;
}

function corresponsalesCache_(st, yo, t0, forzar) {
  const c = st.get('corresponsales', null);
  const mapa = lista => { const m = {}; lista.forEach(x => { m[x] = 1; }); return m; };
  if (!forzar && c && Date.now() - c.t < COS.DIAS_CORRESPONSALES * 86400000) return { mapa: mapa(c.lista), refrescado: false };
  const m = corresponsales_(90, yo, t0);
  const lista = Object.keys(m).filter(x => !/unsubscribe|bounce|=/.test(x)).sort((a, b) => m[b] - m[a]).slice(0, 2000);
  st.set('corresponsales', { t: Date.now(), lista: lista });
  return { mapa: mapa(lista), refrescado: true };
}

// ---------- Contenido de un correo ----------
function contenido_(payload) {
  let plano = null, html = null;
  const adjuntos = [];
  (function rec(p) {
    if (!p) return;
    const mt = String(p.mimeType || '').toLowerCase();
    if (p.filename) adjuntos.push({ nombre: p.filename, tipo: p.mimeType || '' });
    else if (mt === 'text/plain' && p.body && p.body.data && plano === null) plano = decodificar_(p.body.data, p.headers);
    else if (mt === 'text/html' && p.body && p.body.data && html === null) html = decodificar_(p.body.data, p.headers);
    (p.parts || []).forEach(rec);
  })(payload);
  return { texto: plano !== null && plano.trim() ? plano : (html ? htmlATexto_(html) : ''), adjuntos: adjuntos };
}
function decodificar_(data, headers) {
  const ct = ((headers || []).filter(h => h.name.toLowerCase() === 'content-type')[0] || {}).value || '';
  const cs = (ct.match(/charset="?([^";\s]+)/i) || [])[1] || 'UTF-8';
  const bytes = Utilities.base64DecodeWebSafe(data);
  try { return Utilities.newBlob(bytes).getDataAsString(cs); }
  catch (e) { return Utilities.newBlob(bytes).getDataAsString('UTF-8'); }
}
function htmlATexto_(h) {
  const corte = h.split(/<div[^>]*class="[^"]*gmail_quote/i)[0];
  return entidades_(corte.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ‌]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// Quita las citas de mensajes anteriores: líneas con > y lo que sigue a "El ... escribió:" / "On ... wrote:".
function sinCitas_(t) {
  const lineas = String(t || '').replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trim();
    if (/^>/.test(l)) continue;
    const dos = l + ' ' + ((lineas[i + 1] || '').trim());
    if (/^(El|On)\s.{4,200}(escribió|wrote):$/.test(l) || (/^(El|On)\s/.test(l) && /(escribió|wrote):$/.test(dos) && l.length < 200)) break;
    if (/^-{2,}\s*(Original Message|Mensaje original)/i.test(l)) break;
    if (/^_{10,}$/.test(l) && /^(De|From):/i.test((lineas[i + 1] || '').trim())) break;
    out.push(lineas[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- Etiquetas del Chief of Staff ----------
function esEtiquetaCos_(nombre) { return /^(CoS-Prueba|Chief of Staff)(\/|$)/.test(nombre || ''); }
function relativaCos_(nombre) { return String(nombre || '').replace(COS.RAIZ + '/', '').replace(/^CoS-Prueba\/(Limpieza\/)?/, ''); }

function nombresEtiquetas_(refrescar) {
  const cache = CacheService.getScriptCache();
  if (!refrescar) { const c = cache.get('cos_etiquetas'); if (c) return JSON.parse(c); }
  const m = {};
  (Gmail.Users.Labels.list('me').labels || []).forEach(l => { m[l.id] = l.name; });
  try { cache.put('cos_etiquetas', JSON.stringify(m), 600); } catch (e) {}
  return m;
}

// 'Boletines' o 'Facturas/2026' → id de 'Chief of Staff/...'; crea los padres que falten. '/Facturas' es una
// etiqueta que la persona ya tiene, fuera de la raíz: se usa la suya y nunca se crea. Tope: 8 carpetas en la raíz,
// sin contar Leer después.
function idEtiquetaCos_(relativo) {
  const nombres = nombresEtiquetas_(true);
  const porNombre = {};
  Object.keys(nombres).forEach(id => { porNombre[nombres[id].toLowerCase()] = id; });
  if (relativo.charAt(0) === '/') {
    const suya = porNombre[relativo.slice(1).toLowerCase()];
    if (!suya) throw new Error('La persona no tiene una etiqueta "' + relativo.slice(1) + '" en Gmail. Sin la diagonal inicial, la carpeta se crea dentro de ' + COS.RAIZ + '.');
    return suya;
  }
  const partes = (COS.RAIZ + '/' + relativo).split('/');
  let ruta = '', id = null, creo = false;
  partes.forEach((p, i) => {
    ruta = i ? ruta + '/' + p : p;
    if (porNombre[ruta.toLowerCase()]) { id = porNombre[ruta.toLowerCase()]; return; }
    id = Gmail.Users.Labels.create({ name: ruta, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, 'me').id;
    porNombre[ruta.toLowerCase()] = id;
    creo = true;
  });
  if (creo) CacheService.getScriptCache().remove('cos_etiquetas');
  return id;
}

// Nombre que da la persona → carpeta relativa a la raíz del Chief of Staff.
function normalizarCarpeta_(c) {
  const suya = /^\s*\//.test(String(c || ''));
  let s = String(c || '').trim().replace(/^\/+|\/+$/g, '').replace(/\s*\/\s*/g, '/');
  if (!s) throw new Error('Falta la carpeta (por ejemplo Publicidad, Boletines o Facturas).');
  if (s.toLowerCase().indexOf(COS.RAIZ.toLowerCase() + '/') === 0) return normalizarCarpeta_(s.slice(COS.RAIZ.length + 1));
  if (s.length > 60 || /\/\//.test(s) || /[<>]/.test(s)) throw new Error('Nombre de carpeta inválido: ' + c);
  return suya ? '/' + s : s;
}

// ---------- Huellas del motor ----------
// Lo que hace el motor deja huella para que las señales no lo confundan con la persona.
function huellas_(st, ids, signos) {
  if (!ids.length) return;
  const h = st.get('huellas', {});
  const t = Math.floor(Date.now() / 1000);
  ids.forEach(id => { const a = h[id] || [t]; a[0] = t; signos.forEach(s => a.push(s)); h[id] = a; });
  st.set('huellas', h);
}
function consumirHuella_(h, id, signo) {
  const a = h[id];
  if (!a) return false;
  const i = a.indexOf(signo, 1);
  if (i < 0) return false;
  a.splice(i, 1);
  if (a.length <= 1) delete h[id];
  return true;
}
// movidos: id → [carpeta, segundos, política]: de dónde sale un rescate.
function marcarMovidos_(st, ids, carpeta, politica) {
  const m = st.get('movidos', {});
  const t = Math.floor(Date.now() / 1000);
  ids.forEach(id => { m[id] = politica ? [carpeta, t, politica] : [carpeta, t]; });
  st.set('movidos', m);
}

function itemDe_(m) {
  return { m: m.id, h: m.threadId, de: nombreDe_(m.h['From']).slice(0, 60), co: correo_(m.h['From']), as: (m.h['Subject'] || '(sin asunto)').slice(0, 90), f: Number(m.internalDate) };
}
function conteoRemitentes_(items, n) {
  const c = {};
  items.forEach(i => { c[i.de] = (c[i.de] || 0) + 1; });
  const k = Object.keys(c).sort((a, b) => c[b] - c[a]);
  return k.slice(0, n).map(x => x + ' ' + c[x]).join(', ') + (k.length > n ? ' y ' + (k.length - n) + ' más' : '');
}

// Fecha relativa: AAAA-MM-DD, una fecha ISO o días hacia atrás (-60d o 60).
function fechaRelativa_(v, nombre) {
  const s = String(v === undefined || v === null ? '' : v).trim().replace(/\s+/g, '');
  if (!s) throw new Error('Falta ' + nombre + ': AAAA-MM-DD o días hacia atrás (por ejemplo -60d).');
  const n = s.match(/^-?(\d+)d?$/);
  if (n) {
    const hoy = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
    return Date.parse(hoy + 'T00:00:00' + Utilities.formatDate(new Date(), tz_(), 'XXX')) - Number(n[1]) * 86400000;
  }
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' + Utilities.formatDate(new Date(), tz_(), 'XXX') : s);
  if (!isFinite(t)) throw new Error('No entiendo ' + nombre + ': ' + v + '. Usa AAAA-MM-DD o días hacia atrás (-60d).');
  return t;
}
