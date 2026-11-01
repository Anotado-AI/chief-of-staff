/**
 * Chief of Staff · web app para Apps Script
 *
 * Va en el mismo proyecto que el motor, junto a Pagina.html.
 * Integración: el doGet(e) del motor devuelve paginaWebapp_(e) cuando la
 * petición no trae ?accion= y quien la abre es la cuenta que instaló el Chief of Staff.
 *
 * La página llama google.script.run.webapp(herramienta, argumentos). Esa función
 * ya vive en Conector.js del motor: atiende las mismas herramientas que el
 * conector MCP y responde { ok, datos } o { ok: false, error }. Este archivo no la
 * redefine: con dos funciones del mismo nombre en un proyecto, una sobrescribe a la otra.
 */
const PLAN_POR_LINEAMIENTOS = true; // El motor la lee en ver_propuestas: la guía arma el plan por lineamientos

/** Sirve la página. ?vista=plan (o hoy, seguimiento, politicas, actividad, cuaderno, como) abre esa vista; la lee la página con google.script.url. */
function paginaWebapp_(e) {
  const salida = HtmlService.createHtmlOutputFromFile('Pagina');
  // El correo de la cuenta para «Abrir en Gmail» (authuser): el mismo que usa el motor en yo_(), sin permisos nuevos
  let cuenta = '';
  try { cuenta = Session.getEffectiveUser().getEmail() || ''; } catch (err) { cuenta = ''; }
  salida.setContent(salida.getContent().replace('<head>', '<head><script>window.COS_CUENTA = ' + JSON.stringify(cuenta).replace(/</g, '\\u003c') + ';</script>'));
  return salida
    .setTitle('Chief of Staff')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
