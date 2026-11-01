// Instalador del Chief of Staff. Cada subcomando es un paso de INSTALAR.md; Opus los corre en la
// computadora de la persona (Mac o Windows) y lee la salida en JSON. Todo lo que se guarda vive en la
// carpeta .chief-of-staff de su usuario: la sesión de clasp, la llave del conector y los
// identificadores del despliegue. Nunca el correo.

import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const CASA = process.env.COS_HOME || path.join(os.homedir(), '.chief-of-staff');
const ARCHIVO_ESTADO = path.join(CASA, 'instalacion.json');
const CLASPRC = process.env.COS_CLASPRC || path.join(CASA, 'clasprc.json');
// El relevo con la dirección de anotado.ai; la dirección anterior sigue viva para las instalaciones que ya la usan.
const RELEVO = (process.env.COS_RELEVO || 'https://chief.anotado.ai').replace(/\/$/, '');
const CLASP_VERSION = '3.4.1';
const QR_VERSION = '2.0.4';
const TITULO = process.env.COS_TITULO || 'Chief of Staff';

// Permisos del inicio de sesión de clasp: crear y actualizar el proyecto, publicarlo y saber con qué
// cuenta entró. Alcanzan para create-script, push y create-deployment.
// El motor vive ligado a una Hoja de Google llamada como el proyecto, que es su memoria.
// Crear la Hoja pide un permiso más a clasp, solo sobre los archivos que crea.
// COS_MOTOR_EN_HOJA=0 regresa al proyecto suelto de v2.
const MOTOR_EN_HOJA = process.env.COS_MOTOR_EN_HOJA !== '0';
const ALCANCES_CLASP = [
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/userinfo.email',
  ...(MOTOR_EN_HOJA ? ['https://www.googleapis.com/auth/drive.file'] : [])
];
const AJUSTES_API = 'https://script.google.com/home/usersettings';
const RX_API_APAGADA = /has not enabled the Apps Script API|usersettings/i;

// Funciones que piden un permiso de Google extra. El permiso entra al manifiesto solo si la persona
// eligió la función; si la enciende después, se vuelve a desplegar y se autoriza una pantalla más.
const FUNCIONES = {
  juntas: { nombre: 'Preparar tus juntas', permisos: ['https://www.googleapis.com/auth/calendar.readonly'] }
};

// ---------- utilidades ----------

// Escribe completo antes de salir. Con console.log y process.exit, una salida de más de 64 KB a una
// tubería se corta en Mac (las rutinas del perfil completo pasan de ese tamaño).
function salida(obj, codigo = 0) {
  const b = Buffer.from(JSON.stringify(obj, null, 2) + '\n');
  for (let i = 0; i < b.length;) {
    try { i += fs.writeSync(1, b, i); }
    catch (e) { if (e.code !== 'EAGAIN') throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); }
  }
  process.exit(codigo);
}

function falla(mensaje, extra = {}, codigo = 1) {
  salida(Object.assign({ ok: false, error: mensaje }, extra), codigo);
}

function leerEstado() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, 'utf8')); } catch { return {}; }
}

function guardarEstado(estado) {
  fs.mkdirSync(CASA, { recursive: true, mode: 0o700 });
  fs.writeFileSync(ARCHIVO_ESTADO, JSON.stringify(estado, null, 2), { mode: 0o600 });
}

function opciones(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) o[k] = v;
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) o[k] = args[++i];
      else o[k] = true;
    } else o._.push(a);
  }
  return o;
}

// Abre una dirección o un archivo con el programa predeterminado del sistema.
function abrir(destino) {
  if (process.env.COS_NO_ABRIR) return false;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [destino]]
    : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', destino]]
    : ['xdg-open', [destino]];
  try {
    const hijo = spawn(cmd, args, { stdio: 'ignore', detached: true });
    hijo.on('error', () => {});
    hijo.unref();
    return true;
  } catch { return false; }
}

function copiar(texto) {
  if (process.env.COS_NO_ABRIR) return false;
  const [cmd, args] = process.platform === 'darwin' ? ['pbcopy', []]
    : process.platform === 'win32' ? ['clip', []]
    : ['xclip', ['-selection', 'clipboard']];
  try { return spawnSync(cmd, args, { input: texto }).status === 0; } catch { return false; }
}

// npm sin pasar por npm.cmd (en Windows, Node ya no deja lanzar .cmd sin consola).
function npmCli() {
  const bin = path.dirname(process.execPath);
  return [path.join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
    .find(f => fs.existsSync(f));
}

const espera = ms => new Promise(r => setTimeout(r, ms));

function claspBin() {
  return process.env.COS_CLASP || path.join(CASA, 'herramientas', 'clasp', 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
}

// Corre clasp con la sesión de esta instalación (nunca la de ~/.clasprc.json de la Mac).
function clasp(args, { cwd, json = true, heredar = false } = {}) {
  if (!fs.existsSync(claspBin())) falla('Falta clasp. Corre primero: instalador/cos preparar');
  const r = spawnSync(process.execPath, [claspBin(), '-A', CLASPRC, ...args, ...(json ? ['--json'] : [])], {
    cwd, encoding: 'utf8', stdio: heredar ? 'inherit' : 'pipe',
    env: Object.assign({}, process.env, { clasp_config_auth: CLASPRC, NO_COLOR: '1' })
  });
  if (heredar) return { status: r.status };
  const texto = ((r.stdout || '') + '\n' + (r.stderr || '')).trim();
  if (r.status !== 0) {
    const e = new Error(texto.split('\n').filter(Boolean).slice(-6).join(' | ') || 'clasp falló');
    e.apiApagada = RX_API_APAGADA.test(texto);
    throw e;
  }
  if (!json) return texto;
  const ini = r.stdout.search(/[[{]/);
  try { return JSON.parse(r.stdout.slice(ini)); } catch { return { texto: r.stdout.trim() }; }
}

// Una llamada JSON-RPC al motor por su despliegue de conector. Sigue el redireccionamiento de Google.
async function rpc(url, llave, method, params = {}) {
  const r = await fetch(url + '?k=' + encodeURIComponent(llave), {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const texto = await r.text();
  let cuerpo;
  try { cuerpo = JSON.parse(texto); } catch {
    const e = new Error('El motor no contestó en JSON (HTTP ' + r.status + '). Suele ser que falta autorizarlo en Google.');
    e.sinAutorizar = true;
    throw e;
  }
  if (cuerpo.error) throw new Error(cuerpo.error.message || 'Error del motor');
  return cuerpo.result;
}

// La web app se abre en el navegador con la cuenta correcta: en Google Workspace, con el dominio en la
// ruta; en Gmail, con authuser (si hay varias cuentas abiertas, Google usa la primera).
function urlParaAbrir(estado) {
  const cuenta = String(estado.cuenta || '');
  const dominio = cuenta.split('@')[1] || '';
  if (dominio && !/^(gmail|googlemail)\.com$/i.test(dominio)) return 'https://script.google.com/a/macros/' + dominio + '/s/' + estado.app.id + '/exec';
  return estado.app.url + (cuenta ? '?authuser=' + encodeURIComponent(cuenta) : '');
}

async function motorResponde(estado) {
  try {
    const r = await rpc(estado.conector.url, estado.llave, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cos-instalador', version: '1' } });
    return r && r.serverInfo && r.serverInfo.name === 'chief-of-staff' ? r : null;
  } catch { return null; }
}

// Hora local con su desfase, por ejemplo 2026-10-31 21:30 -06:00: así se sabe cuándo se desplegó sin adivinar la zona.
function horaConZona(f = new Date()) {
  const dos = n => String(Math.abs(n)).padStart(2, '0');
  const d = -f.getTimezoneOffset();
  return f.getFullYear() + '-' + dos(f.getMonth() + 1) + '-' + dos(f.getDate()) + ' ' + dos(f.getHours()) + ':' + dos(f.getMinutes()) +
    ' ' + (d < 0 ? '-' : '+') + dos(Math.trunc(d / 60)) + ':' + dos(d % 60);
}

// Al actualizar, la corrida de cada 10 minutos puede seguir atada al despliegue que creó su activador.
// Si ya había activador, se reinstala desde el despliegue nuevo; el motor quita el
// anterior antes de crearlo. Si no había, no se prende: llega con cos motor, cuando la persona aprueba el plan.
async function reinstalarActivador(estado) {
  try {
    const e = await rpc(estado.conector.url, estado.llave, 'cos/admin', { accion: 'estado' });
    if (!(e.activadores || []).includes('corrida')) return { activador: 'sin_activador' };
    const r = await rpc(estado.conector.url, estado.llave, 'cos/admin', { accion: 'instalar' });
    return { activador: 'reinstalado', activadores: r.activadores };
  } catch (err) {
    return { activador: 'sin_reinstalar', activador_error: err.message, siguiente: 'instalador/cos motor' };
  }
}

function exigir(estado, ...campos) {
  for (const c of campos) {
    if (!estado[c]) falla('Falta el paso anterior: no hay ' + c + ' en ' + ARCHIVO_ESTADO + '.');
  }
}

// ---------- pasos ----------

const pasos = {};

function herramientas() { return path.join(CASA, 'herramientas', 'clasp'); }

// Paso 0. Deja clasp y el generador de QR en .chief-of-staff/herramientas. Node ya lo resolvió la
// entrada (cos en Mac, cos.ps1 en Windows).
pasos.preparar = () => {
  const qrListo = fs.existsSync(path.join(herramientas(), 'node_modules', 'qrcode-generator'));
  if (!fs.existsSync(claspBin()) || !qrListo) {
    const npm = npmCli();
    if (!npm) falla('No encontré npm junto a Node', { node: process.execPath });
    fs.mkdirSync(herramientas(), { recursive: true, mode: 0o700 });
    const r = spawnSync(process.execPath, [npm, 'install', '--prefix', herramientas(), '@google/clasp@' + CLASP_VERSION, 'qrcode-generator@' + QR_VERSION,
      '--no-audit', '--no-fund', '--loglevel=error'], {
      encoding: 'utf8', env: Object.assign({}, process.env, { PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH })
    });
    if (r.status !== 0) falla('No se pudo instalar clasp', { detalle: (r.stderr || '').slice(-800) });
  }
  salida({ ok: true, sistema: process.platform, node: process.version, clasp: CLASP_VERSION, casa: CASA });
};

// Paso 1. Inicio de sesión de Google con los tres permisos de ALCANCES_CLASP. Abre el navegador.
pasos.entrar = (o) => {
  const estado = leerEstado();
  if (fs.existsSync(CLASPRC) && !o['de-nuevo']) {
    try {
      const yo = clasp(['show-authorized-user']);
      if (yo.loggedIn && yo.email) {
        estado.cuenta = yo.email; guardarEstado(estado);
        salida({ ok: true, cuenta: yo.email, ya_estaba: true });
      }
    } catch { /* sesión vencida o revocada: se vuelve a entrar */ }
  }
  // clasp toma los permisos del manifiesto con --use-project-scopes; este manifiesto solo trae los tres.
  const dir = path.join(CASA, 'entrar');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'appsscript.json'), JSON.stringify({ timeZone: 'America/Mexico_City', oauthScopes: ALCANCES_CLASP }, null, 2));
  // clasp solo lee el manifiesto si hay un scriptId; este es de relleno y no se consulta.
  fs.writeFileSync(path.join(dir, '.clasp.json'), JSON.stringify({ scriptId: '1' + 'x'.repeat(56), rootDir: '.' }));
  const extra = o['sin-navegador'] ? ['--no-localhost'] : [];
  const r = clasp(['login', '--use-project-scopes', ...extra], { cwd: dir, json: false, heredar: true });
  if (r.status !== 0) falla('No se completó el inicio de sesión de Google');
  try { fs.chmodSync(CLASPRC, 0o600); } catch { /* clasp ya lo deja privado */ }
  const yo = clasp(['show-authorized-user']);
  estado.cuenta = yo.email; guardarEstado(estado);
  salida({ ok: true, cuenta: yo.email });
};

// Ficha de acceso de la sesión de clasp para lo que clasp no hace solo. Si venció, se renueva y se
// guarda en el mismo archivo que usa clasp.
async function fichaGoogle() {
  const datos = JSON.parse(fs.readFileSync(CLASPRC, 'utf8'));
  const t = datos.tokens && datos.tokens.default;
  if (!t || !t.refresh_token) throw new Error('No hay sesión de clasp. Corre: instalador/cos entrar');
  if (t.access_token && Number(t.expiry_date) > Date.now() + 60000) return t.access_token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id, client_secret: t.client_secret })
  });
  const c = await r.json().catch(() => ({}));
  if (!r.ok || !c.access_token) throw new Error('Google no renovó la sesión de clasp: ' + (c.error_description || c.error || 'HTTP ' + r.status));
  t.access_token = c.access_token;
  t.expiry_date = Date.now() + Number(c.expires_in || 3600) * 1000;
  fs.writeFileSync(CLASPRC, JSON.stringify(datos, null, 2), { mode: 0o600 });
  return t.access_token;
}

// La Hoja de Google del motor. Se crea una sola vez y antes del proyecto: clasp create-script --type
// sheets la crea en cada intento, y si la API está apagada cada reintento dejaría una Hoja suelta.
async function crearHoja(estado) {
  if (estado.hoja) return estado.hoja;
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST', headers: { Authorization: 'Bearer ' + await fichaGoogle(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: TITULO, mimeType: 'application/vnd.google-apps.spreadsheet' })
  });
  const c = await r.json().catch(() => ({}));
  if (!r.ok || !c.id) throw new Error('Google Drive no creó la Hoja del motor: ' + ((c.error && c.error.message) || 'HTTP ' + r.status));
  estado.hoja = { id: c.id, url: c.webViewLink };
  guardarEstado(estado);
  return estado.hoja;
}

// Crea el proyecto de Apps Script si aún no existe. Es también la prueba de que la API está activa:
// Google revisa el interruptor al crear; una consulta con un ID inventado no lo revisa.
async function crearProyecto(estado) {
  if (estado.scriptId) return true;
  const proyecto = path.join(CASA, 'proyecto');
  fs.mkdirSync(proyecto, { recursive: true, mode: 0o700 });
  fs.rmSync(path.join(proyecto, '.clasp.json'), { force: true });
  const tipo = MOTOR_EN_HOJA ? ['--parentId', (await crearHoja(estado)).id] : ['--type', 'standalone'];
  try {
    const c = clasp(['create-script', ...tipo, '--title', TITULO, '--rootDir', 'src'], { cwd: proyecto });
    estado.scriptId = c.scriptId;
    guardarEstado(estado);
    return true;
  } catch (e) {
    if (e.apiApagada) return false;
    throw e;
  }
}

// Paso 2. Revisa que la API de Apps Script esté activa creando el proyecto. Si está apagada, abre la
// página del interruptor con su cuenta y espera a que la active (hasta 10 minutos).
pasos.api = async (o) => {
  const estado = leerEstado();
  try {
    if (await crearProyecto(estado)) salida({ ok: true, api: 'activa', scriptId: estado.scriptId, hoja: estado.hoja ? estado.hoja.url : undefined });
  } catch (e) { falla('No se pudo consultar Google con la sesión de clasp', { detalle: e.message, siguiente: 'instalador/cos entrar --de-nuevo' }); }
  const pagina = AJUSTES_API + (estado.cuenta ? '?authuser=' + encodeURIComponent(estado.cuenta) : '');
  const abierta = abrir(pagina);
  if (o['sin-esperar']) salida({ ok: false, api: 'apagada', abre: pagina }, 3);
  const segundos = Number(o.segundos || 600);
  // El JSON sale al final; esta línea dice desde ya que el paso espera el interruptor.
  process.stderr.write((abierta ? 'Abrí la página del interruptor API de Google Apps Script. ' : 'Abre esta página y activa el interruptor API de Google Apps Script: ' + pagina + '. ')
    + 'Espero hasta ' + Math.round(segundos / 60) + ' minutos a que lo actives.\n');
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    await espera(6000);
    try { if (await crearProyecto(estado)) salida({ ok: true, api: 'activa', scriptId: estado.scriptId, se_abrio_la_pagina: abierta }); }
    catch (e) { falla(e.message); }
  }
  falla('La API de Apps Script sigue apagada', { abre: pagina }, 3);
};

// Arma el paquete que sube clasp: el motor, la web app y el archivo de esta instalación.
function armarPaquete(destino, fuentes, estado) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true, mode: 0o700 });
  const vistos = {};
  let manifiesto = null;
  for (const fuente of fuentes) {
    if (!fs.existsSync(fuente)) continue;
    for (const nombre of fs.readdirSync(fuente)) {
      const ruta = path.join(fuente, nombre);
      if (!fs.statSync(ruta).isFile()) continue;
      if (nombre === 'appsscript.json') { manifiesto = manifiesto || JSON.parse(fs.readFileSync(ruta, 'utf8')); continue; }
      if (!/\.(js|gs|html)$/.test(nombre) || nombre === 'Instalacion.js') continue;
      if (vistos[nombre]) falla('Dos piezas traen el mismo archivo: ' + nombre, { piezas: [vistos[nombre], fuente] });
      vistos[nombre] = fuente;
      fs.copyFileSync(ruta, path.join(destino, nombre));
    }
  }
  if (!manifiesto) falla('Ninguna pieza trae appsscript.json', { fuentes });
  // Permisos de las funciones que la persona eligió (por ejemplo, calendario para preparar juntas).
  const funciones = (estado.funciones || []).filter(f => FUNCIONES[f]);
  const extra = funciones.flatMap(f => FUNCIONES[f].permisos);
  manifiesto.oauthScopes = [...new Set([...(manifiesto.oauthScopes || []), ...extra])];
  fs.writeFileSync(path.join(destino, 'Instalacion.js'),
    '// Lo genera el instalador en cada despliegue. No va al repositorio.\n' +
    'const INSTALACION = ' + JSON.stringify({ llave: estado.llave, relevo: RELEVO, version: estado.version, funciones }, null, 2) + ';\n');
  // Compatibilidad: si el motor aún trae la llave de prueba fija, se cambia por la de esta instalación.
  const conector = path.join(destino, 'Conector.js');
  if (fs.existsSync(conector)) {
    const src = fs.readFileSync(conector, 'utf8');
    const nuevo = src.replace(/LLAVE:\s*'[0-9a-f]{20,}'/, 'LLAVE: INSTALACION.llave');
    if (nuevo !== src) fs.writeFileSync(conector, nuevo);
  }
  return { manifiesto, archivos: Object.keys(vistos).concat('Instalacion.js').sort() };
}

// Arma el paquete sin subir nada: sirve para revisar qué se instalaría y con qué permisos de Google.
pasos.armar = (o) => {
  const fuentes = o.fuente ? String(o.fuente).split(',').map(f => path.resolve(f)) : [path.join(RAIZ, 'motor'), path.join(RAIZ, 'webapp')];
  const destino = path.join(CASA, 'armado');
  const funciones = o.funciones ? String(o.funciones).split(',').filter(f => FUNCIONES[f]) : [];
  const { manifiesto, archivos } = armarPaquete(destino, fuentes, { llave: 'x'.repeat(40), version: 'revision', funciones });
  const conLlaveFija = archivos.filter(f => /LLAVE:\s*'[0-9a-f]{20,}'/.test(fs.readFileSync(path.join(destino, f), 'utf8')));
  salida({ ok: conLlaveFija.length === 0, destino, archivos, permisos_google: manifiesto.oauthScopes || [], servicios: (manifiesto.dependencies || {}).enabledAdvancedServices || [], llave_fija_en: conLlaveFija });
};

// Paso 3. Crea el proyecto (si no existe), sube el código y publica dos despliegues del mismo código:
// "app" (web app, solo la persona) y "conector" (lo llama el relevo con la llave). Repetirlo actualiza.
// --funciones juntas (o ninguna) fija las funciones que piden permisos extra; si no se pasa, se
// conservan las de la vez anterior.
pasos.desplegar = async (o) => {
  const estado = leerEstado();
  const fuentes = o.fuente ? String(o.fuente).split(',').map(f => path.resolve(f)) : [path.join(RAIZ, 'motor'), path.join(RAIZ, 'webapp')];
  if (o.funciones !== undefined) {
    const pedidas = String(o.funciones) === 'ninguna' ? [] : String(o.funciones).split(',').map(f => f.trim()).filter(Boolean);
    const desconocidas = pedidas.filter(f => !FUNCIONES[f]);
    if (desconocidas.length) falla('Función desconocida: ' + desconocidas.join(', '), { disponibles: Object.keys(FUNCIONES) });
    estado.funciones = pedidas;
  }
  estado.funciones = estado.funciones || [];
  estado.llave = estado.llave || randomBytes(20).toString('hex');
  const versionAnterior = estado.version, motorAnterior = estado.motor_version;
  estado.version = horaConZona();
  // La versión del código del motor (COS.VERSION de Base.js): cada corrida la deja en ultima_corrida.motor.
  const base = fuentes.map(f => path.join(f, 'Base.js')).find(f => fs.existsSync(f));
  estado.motor_version = base ? ((fs.readFileSync(base, 'utf8').match(/^\s*VERSION:\s*'([^']+)'/m) || [])[1] || null) : null;
  estado.fuentes = fuentes;
  guardarEstado(estado);

  const proyecto = path.join(CASA, 'proyecto');
  const claspJson = path.join(proyecto, '.clasp.json');
  try {
    if (!(await crearProyecto(estado))) falla('La API de Apps Script está apagada en esta cuenta', { siguiente: 'instalador/cos api' }, 3);
    fs.mkdirSync(proyecto, { recursive: true, mode: 0o700 });
    fs.writeFileSync(claspJson, JSON.stringify({ scriptId: estado.scriptId, rootDir: 'src' }));
    const { manifiesto, archivos } = armarPaquete(path.join(proyecto, 'src'), fuentes, estado);

    const variantes = [
      { nombre: 'app', acceso: 'MYSELF' },
      { nombre: 'conector', acceso: 'ANYONE_ANONYMOUS' }
    ];
    // Los dos accesos cambian juntos. Si el segundo falla, el primero regresa a su versión anterior (en una
    // simulación quedó la app en v7 y el conector en v6); si el regreso también falla, se dice qué quedó dónde.
    const anteriores = { app: estado.app ? Object.assign({}, estado.app) : null, conector: estado.conector ? Object.assign({}, estado.conector) : null };
    const hechos = [];
    for (const v of variantes) {
      try {
        const m = Object.assign({}, manifiesto, { webapp: { executeAs: 'USER_DEPLOYING', access: v.acceso } });
        fs.writeFileSync(path.join(proyecto, 'src', 'appsscript.json'), JSON.stringify(m, null, 2));
        clasp(['push', '-f'], { cwd: proyecto });
        const previo = estado[v.nombre] && estado[v.nombre].id;
        const d = clasp(['create-deployment', '-d', TITULO + ' · ' + v.nombre + ' · ' + estado.version, ...(previo ? ['-i', previo] : [])], { cwd: proyecto });
        estado[v.nombre] = { id: d.deploymentId, version: d.versionNumber, url: 'https://script.google.com/macros/s/' + d.deploymentId + '/exec' };
        guardarEstado(estado);
        hechos.push(v.nombre);
      } catch (e) {
        if (e.apiApagada) throw e;
        const regreso = hechos.map(n => {
          const a = anteriores[n];
          if (!a || !a.version) return { acceso: n, quedo_en: estado[n].version, antes: null };
          try {
            clasp(['create-deployment', '-i', a.id, '-V', String(a.version), '-d', TITULO + ' · ' + n + ' · regreso a v' + a.version], { cwd: proyecto });
            estado[n] = a;
            return { acceso: n, regreso_a: a.version };
          } catch (e2) { return { acceso: n, quedo_en: estado[n].version, antes: a.version, error: e2.message }; }
        });
        const pendientes = regreso.filter(x => !x.regreso_a);
        if (!pendientes.length) { estado.version = versionAnterior; estado.motor_version = motorAnterior; }
        guardarEstado(estado);
        const accesos = { app: estado.app ? estado.app.version : null, conector: estado.conector ? estado.conector.version : null };
        falla('Falló el despliegue del ' + (v.nombre === 'app' ? 'acceso de la web app' : 'conector') + ' (' + e.message + '). ' + (pendientes.length
          ? 'No pude regresar todo: ' + pendientes.map(x => x.acceso + ' quedó en la versión ' + x.quedo_en + (x.antes ? ' y antes estaba en la ' + x.antes : ', que es nueva')).join('; ') + '. Corre cos desplegar otra vez: actualiza los dos accesos juntos.'
          : hechos.length ? 'Regresé ' + hechos.join(' y ') + ' a su versión anterior: los dos accesos quedaron como estaban.' : 'Ningún acceso cambió.'),
          { accesos, regreso });
      }
    }
    // Si hay permisos que la persona no ha aprobado, el motor no contesta hasta el paso autorizar.
    estado.permisos = manifiesto.oauthScopes;
    guardarEstado(estado);
    const nuevos = estado.permisos.filter(x => !(estado.permisos_autorizados || []).includes(x));
    // Con permisos por aprobar el motor no contesta: el activador se reinstala al terminar cos autorizar.
    let activador = { activador: 'despues_de_autorizar' };
    if (nuevos.length) { estado.reinstalar_activador = true; guardarEstado(estado); }
    else activador = await reinstalarActivador(estado);
    salida(Object.assign({ ok: true, scriptId: estado.scriptId, app: estado.app.url, version: estado.version, motor_version: estado.motor_version, conector_version: estado.conector.version, archivos,
      funciones: estado.funciones, permisos_google: estado.permisos, autorizar: nuevos.length > 0, permisos_por_aprobar: nuevos,
      editor: 'https://script.google.com/d/' + estado.scriptId + '/edit' }, activador));
  } catch (e) {
    if (e.apiApagada) falla('La API de Apps Script está apagada en esta cuenta', { siguiente: 'instalador/cos api', abre: AJUSTES_API }, 3);
    falla(e.message);
  }
};

// Paso 4. Autorización de los permisos del motor (la primera vez, o cuando una función nueva suma un
// permiso). Abre la web app; Google le pide a la persona que apruebe (incluida la pantalla "Google no
// verificó esta app" en cuentas de Gmail). Espera hasta que el motor contesta.
pasos.autorizar = async (o) => {
  const estado = leerEstado();
  exigir(estado, 'app', 'conector', 'llave');
  const t0 = Date.now();
  const listo = async (extra) => {
    estado.permisos_autorizados = estado.permisos || [];
    const activador = estado.reinstalar_activador ? await reinstalarActivador(estado) : {};
    if (activador.activador && activador.activador !== 'sin_reinstalar') delete estado.reinstalar_activador;
    guardarEstado(estado);
    salida(Object.assign({ ok: true, autorizado: true }, extra, activador));
  };
  if (await motorResponde(estado)) await listo({ ya_estaba: true });
  const abierta = abrir(urlParaAbrir(estado));
  const limite = t0 + Number(o.segundos || 900) * 1000;
  while (Date.now() < limite) {
    await espera(4000);
    if (await motorResponde(estado)) await listo({ segundos: Math.round((Date.now() - t0) / 1000), se_abrio: abierta });
  }
  falla('El motor todavía no contesta. ¿Aprobó los permisos en la página de Google?', { abre: estado.app.url }, 4);
};

// Paso 5. Prende el motor: activadores de cada 10 minutos y lo que el motor necesite al instalarse.
pasos.motor = async () => {
  const estado = leerEstado();
  exigir(estado, 'conector', 'llave');
  try { salida({ ok: true, motor: await rpc(estado.conector.url, estado.llave, 'cos/admin', { accion: 'instalar' }) }); }
  catch (e) { falla(e.message); }
};

// Los argumentos que pide una herramienta, para no adivinarlos leyendo el código del motor (por
// ejemplo, guardar_memoria lleva "agregar" dentro de "datos").
async function esquemaDe(estado, nombre) {
  try {
    const lista = (await rpc(estado.conector.url, estado.llave, 'tools/list')).tools;
    const h = lista.find(t => t.name === nombre);
    return h ? { esquema: h.inputSchema || null } : { herramientas_validas: lista.map(t => t.name) };
  } catch { return {}; }
}

// Nombre y argumentos de cada herramienta del motor; con un nombre, también su descripción completa.
pasos.herramientas = async (o) => {
  const estado = leerEstado();
  exigir(estado, 'conector', 'llave');
  const [nombre] = o._;
  let lista;
  try { lista = (await rpc(estado.conector.url, estado.llave, 'tools/list')).tools; }
  catch (e) { falla(e.message); }
  if (!nombre) salida({ ok: true, total: lista.length, herramientas: lista.map(t => ({ nombre: t.name, argumentos: t.inputSchema || null })) });
  const h = lista.find(t => t.name === nombre);
  if (!h) falla('El motor no tiene la herramienta ' + nombre, { herramientas_validas: lista.map(t => t.name) });
  salida({ ok: true, nombre: h.name, descripcion: h.description || '', argumentos: h.inputSchema || null });
};

// Reintentos de cos herramienta. Con el candado ocupado el motor no corrió la llamada: se repite igual. Si fetch
// se rinde (300 s en Node) el motor pudo terminarla, y solo se repite lo que no duplica: con opId o si solo lee.
const CANDADO_OCUPADO = /terminando otra tarea/;
const ESPERA_REINTENTO_MS = Number(process.env.COS_ESPERA_REINTENTO_MS) || 60000;
async function repetible(estado, nombre, args) {
  if (args && args.opId) return true;
  try {
    const h = (await rpc(estado.conector.url, estado.llave, 'tools/list')).tools.find(t => t.name === nombre);
    return !!(h && h.annotations && h.annotations.readOnlyHint);
  } catch { return false; }
}

// Llama una herramienta del motor sin pasar por Claude (para aplicar la configuración que eligió la persona).
// Si el motor contesta con error, la salida trae el esquema de sus argumentos.
pasos.herramienta = async (o) => {
  const estado = leerEstado();
  exigir(estado, 'conector', 'llave');
  const [nombre, json] = o._;
  if (!nombre) falla('Uso: cos herramienta <nombre> \'{"arg": "valor"}\'. Los argumentos de cada una: cos herramientas');
  let args = {};
  try { args = json ? JSON.parse(fs.existsSync(json) ? fs.readFileSync(json, 'utf8') : json) : {}; }
  catch { falla('Los argumentos no son JSON válido', await esquemaDe(estado, nombre)); }
  let r, cortes = 0, ocupado = 0;
  for (;;) {
    try { r = await rpc(estado.conector.url, estado.llave, 'tools/call', { name: nombre, arguments: args }); }
    catch (e) {
      if (!/fetch failed/.test(e.message)) falla(e.message, await esquemaDe(estado, nombre));
      if (cortes < 2 && await repetible(estado, nombre, args)) { cortes++; await espera(ESPERA_REINTENTO_MS); continue; }
      falla('La llamada se cortó antes de que el motor contestara y pudo haber terminado. Revisa con una herramienta de lectura si quedó antes de repetirla; con un opId propio se puede repetir sin duplicar.', await esquemaDe(estado, nombre));
    }
    const texto = r && r.isError ? (r.content || []).map(c => c.text || '').join(' ') : '';
    if (CANDADO_OCUPADO.test(texto) && ocupado < 3) { ocupado++; await espera(ESPERA_REINTENTO_MS); continue; }
    break;
  }
  if (r && r.isError) salida(Object.assign({}, r, await esquemaDe(estado, nombre)));
  salida(r);
};

pasos.admin = async (o) => {
  const estado = leerEstado();
  exigir(estado, 'conector', 'llave');
  const [accion, json] = o._;
  try { salida(await rpc(estado.conector.url, estado.llave, 'cos/admin', Object.assign({ accion }, json ? JSON.parse(json) : {}))); }
  catch (e) { falla(e.message); }
};

async function alta(estado) {
  const r = await fetch(RELEVO + '/alta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_url: estado.conector.url, llave: estado.llave, proyecto: estado.scriptId })
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || !cuerpo.codigo) throw new Error(cuerpo.error || 'El relevo no dio de alta la instalación (HTTP ' + r.status + ')');
  return cuerpo;
}

// Paso 6. Da de alta su motor en el relevo y abre en su navegador /vincular con ir=claude: el relevo deja
// el código en una cookie (así el permiso no le pide escribir nada) y la manda a Claude con el diálogo
// "Agregar conector personalizado" ya lleno. El código también queda en el portapapeles.
pasos.vincular = async () => {
  const estado = leerEstado();
  exigir(estado, 'conector', 'llave');
  try {
    const a = await alta(estado);
    estado.vinculo = { codigo: a.codigo, vence: a.vence, relevo: RELEVO };
    guardarEstado(estado);
    // Si Claude abre el permiso sin la cookie, la página pide el código: ya queda listo para pegar.
    const copiado = copiar(a.codigo);
    abrir(a.enlace + '&ir=claude');
    salida({ ok: true, conector_url: RELEVO + '/mcp', codigo: a.codigo, vence: a.vence, copiado_al_portapapeles: copiado,
      pasos_en_claude: ['Revisar que diga Chief of Staff', 'Continuar', 'Conectar, si lo pide', 'Pegar el código y tocar Permitir, si lo pide'] });
  } catch (e) { falla(e.message); }
};

// Copia el código de vinculación al portapapeles (si la página del permiso lo pide). Si venció, pide otro.
pasos.codigo = async () => {
  const estado = leerEstado();
  exigir(estado, 'conector', 'llave');
  let v = estado.vinculo;
  if (!v || !v.vence || Date.parse(v.vence) < Date.now() + 60000) {
    try { const a = await alta(estado); v = estado.vinculo = { codigo: a.codigo, vence: a.vence, relevo: RELEVO }; guardarEstado(estado); }
    catch (e) { falla(e.message); }
  }
  salida({ ok: true, codigo: v.codigo, vence: v.vence, copiado_al_portapapeles: copiar(v.codigo) });
};

// Pasos 6b y reconexión. Abre la pestaña Tuyos de Conectores de Claude, donde vive el conector propio.
const CONECTORES_CLAUDE = 'https://claude.ai/customize/connectors/yours';
pasos.conectores = () => {
  salida({ ok: true, abre: CONECTORES_CLAUDE, se_abrio: abrir(CONECTORES_CLAUDE) });
};

// Dirección de la web app para el celular. En Google Workspace lleva el dominio en la ruta, para que el
// celular use la cuenta correcta.
function urlTelefono(estado) {
  const dominio = String(estado.cuenta || '').split('@')[1] || '';
  if (dominio && !/^(gmail|googlemail)\.com$/i.test(dominio)) return 'https://script.google.com/a/macros/' + dominio + '/s/' + estado.app.id + '/exec';
  return estado.app.url;
}

// Paso 9. Código QR para abrir la web app en el celular (iPhone o Android). Se dibuja en esta
// computadora, sin servicios externos, y se abre una página con el código y los pasos.
pasos.qr = () => {
  const estado = leerEstado();
  exigir(estado, 'app');
  let qrcode;
  try { qrcode = createRequire(path.join(herramientas(), 'package.json'))('qrcode-generator'); }
  catch { falla('Falta el generador de QR', { siguiente: 'instalador/cos preparar' }); }
  const url = urlTelefono(estado);
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
  const archivoSvg = path.join(CASA, 'telefono_qr.svg');
  fs.writeFileSync(archivoSvg, svg, { mode: 0o600 });
  const html = path.join(CASA, 'telefono.html');
  fs.writeFileSync(html, paginaTelefono(svg), { mode: 0o600 });
  abrir(html);
  salida({ ok: true, qr: archivoSvg, pagina: html, url });
};

function paginaTelefono(svg) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chief of Staff en tu celular</title>
<style>
:root{--fondo:#f6f5f2;--tinta:#1d1d1f;--suave:#6e6e73;--linea:#d9d6cf}
@media (prefers-color-scheme:dark){:root{--fondo:#151515;--tinta:#f2f2f2;--suave:#a1a1a6;--linea:#3a3a3c}}
body{margin:0;background:var(--fondo);color:var(--tinta);font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:520px;margin:0 auto;padding:40px 24px}
h1{font-size:26px;line-height:1.2;margin:0 0 20px;text-align:center}
.qr{width:260px;height:260px;margin:0 auto 28px;background:#fff;padding:12px;border-radius:16px}
.qr svg{width:100%;height:100%;display:block}
h2{font-size:17px;margin:22px 0 6px}ol{margin:0;padding-left:22px}li{margin:4px 0}
p{color:var(--suave);font-size:15px;margin-top:24px}
</style>
<main><h1>Tu Chief of Staff en el celular</h1>
<div class="qr" role="img" aria-label="Código QR de tu Chief of Staff">${svg}</div>
<h2>iPhone</h2><ol><li>Abre la cámara y apunta al código.</li><li>Toca el aviso para abrirlo en Safari. Si te lo pide, entra con tu cuenta de Google.</li></ol>
<h2>Android</h2><ol><li>Abre la cámara (o Google Lens) y apunta al código.</li><li>Ábrelo en Chrome. Si te lo pide, entra con tu cuenta de Google.</li></ol>
<h2>Si lo quieres a la mano</h2><p>En iPhone, toca Compartir y luego <b>Agregar a inicio</b>. En Android, toca el menú ⋮ y luego <b>Agregar a la pantalla principal</b>.</p>
<p>Si Google dice que no puede abrir el archivo, en el navegador del celular estás con otra cuenta de Google. Cambia a la cuenta donde instalaste el Chief of Staff y vuelve a abrir el código.</p>
</main></html>`;
}

// Las rutinas del cerebro, listas para crearlas en la nube de Claude con la skill schedule
// (cerebro/02_rutina/CONFIG_rutinas.md): juicio, aprendizaje diario y repaso semanal. El texto del prompt va
// después de la línea "---". El perfil (ligero o completo) es un tope que sale del plan de Claude y vive en
// la línea "Rutinas:" del perfil; las horas del juicio las elige Opus y viven en experiencia.horarios_juicio.
// El instalador las lee del motor; si la persona acepta mover las horas, se vuelve a correr.
const RUTINAS = {
  respaldo: ['08:07', '13:07', '18:07'],
  tope_dia: 3,
  // Fin de semana del completo sin horas propias (en empate, la más temprana). El motor cuenta las corridas
  // que faltaron con la misma regla: no se cambia aquí sola.
  finde_referencia: ['10:07', '14:07', '19:07']
};

const minutos = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = n => ('0' + Math.floor(n / 60)).slice(-2) + ':' + ('0' + (n % 60)).slice(-2);
const leerHora = t => {
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) falla('Las horas van en HH:mm (' + t + ' no)');
  return hhmm(Number(m[1]) * 60 + Number(m[2]));
};
const ordenar = hs => [...new Set(hs.map(leerHora))].sort((a, b) => minutos(a) - minutos(b));
const dicha = t => String(Math.floor(minutos(t) / 60)) + ':' + t.slice(3);
const enLista = xs => (xs.length > 1 ? xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1] : xs[0]);

// 8,9,10,11 → 8-11 (rangos de tres o más).
function enRangos(ns, n = ns.length) {
  const out = [];
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && ns[j + 1] === ns[j] + 1) j++;
    if (j - i >= 2) out.push(ns[i] + '-' + ns[j]); else for (let k = i; k <= j; k++) out.push(String(ns[k]));
    i = j + 1;
  }
  return out.join(',');
}
const cronDias = d => (d.length === 7 ? '*' : enRangos([...d].sort((a, b) => a - b)));

// Un cron lleva un solo minuto: las horas con minutos distintos van en rutinas aparte.
function porMinuto(horas) {
  const g = {};
  for (const t of horas) (g[t.slice(3)] = g[t.slice(3)] || []).push(t);
  return Object.values(g).sort((a, b) => minutos(a[0]) - minutos(b[0]));
}
const cronLocal = (horas, dias) => Number(horas[0].slice(3)) + ' ' + enRangos(horas.map(t => Math.floor(minutos(t) / 60))) + ' * * ' + cronDias(dias);

// Pasa horas locales a UTC; si cruzan la medianoche, esas horas corren otro día en UTC (si la rutina
// corre todos los días, da igual).
function cronUtc(horas, dias, desfaseMin) {
  const grupos = {};
  for (const t of horas) {
    const u = minutos(t) - desfaseMin, salto = dias.length === 7 ? 0 : Math.floor(u / 1440), d = ((u % 1440) + 1440) % 1440;
    const k = salto + '|' + (d % 60);
    (grupos[k] = grupos[k] || []).push(Math.floor(d / 60));
  }
  return Object.entries(grupos).map(([k, hs]) => {
    const [salto, m] = k.split('|').map(Number);
    return m + ' ' + enRangos(hs.sort((a, b) => a - b)) + ' * * ' + cronDias(dias.map(d => (((d + salto) % 7) + 7) % 7));
  });
}

// "de 8:00 a 20:00" en el perfil → cada hora de 8:07 a 20:07 (respaldo del completo sin horas).
function horasDelHorario(texto) {
  const m = String(texto || '').match(/(\d{1,2}):\d{2}\D+?(\d{1,2}):\d{2}/);
  const a = m ? Number(m[1]) : 8, b = m ? Number(m[2]) : 20;
  return Array.from({ length: Math.max(b - a + 1, 1) }, (_, i) => hhmm((a + i) * 60 + 7));
}

async function memoriaDelMotor(estado) {
  if (!estado.conector || !estado.llave) return null;
  const ver = async parte => {
    const r = await rpc(estado.conector.url, estado.llave, 'tools/call', { name: 'ver_memoria', arguments: { parte } });
    if (r.isError) throw new Error(r.content[0].text);
    return r.structuredContent || JSON.parse(r.content[0].text);
  };
  try {
    const texto = String((await ver('perfil')).texto || '');
    const x = (await ver('experiencia')).experiencia || {};
    const perfil = (texto.match(/^\s*Rutinas:\s*(ligero|completo)/im) || [])[1];
    return { perfil: perfil && perfil.toLowerCase(), horarios: x.horarios_juicio, horario: (texto.match(/^\s*Horario:\s*(.+)$/im) || [])[1] };
  } catch { return null; }
}

// horarios_juicio es {entre_semana [], fin_de_semana []} (contrato v3, 20:21); la lista plana de antes
// vale como entre semana. fin_de_semana: [] quiere decir sin juicio en fin de semana; si falta, es null.
function horasDeLaMemoria(x) {
  if (Array.isArray(x)) return { entre: x, finde: null };
  return { entre: (x && x.entre_semana) || [], finde: x && Array.isArray(x.fin_de_semana) ? x.fin_de_semana : null };
}

// Perfil, horas y de dónde salieron. Lo que se pasa en la línea de comandos gana sobre la memoria.
// Sin horas de fin de semana: el ligero usa las de entre semana; el completo, las de entre semana más
// cercanas a 10:07, 14:07 y 19:07 (sin repetir) o esas mismas si no hay datos. Con la lista vacía, no hay
// juicio en fin de semana. El motor cuenta las corridas que faltaron con la misma regla (horasDelDia_).
function horarioRutinas(o, memoria) {
  const m = memoria || {};
  const perfil = String(o.perfil || m.perfil || 'ligero').toLowerCase();
  if (!['ligero', 'completo'].includes(perfil)) falla('El perfil es ligero o completo (' + perfil + ' no)');
  const memo = horasDeLaMemoria(m.horarios);
  const lista = v => String(v).split(/[\s,]+/).filter(Boolean);
  let entre = o.horas ? lista(o.horas) : memo.entre.length ? memo.entre : null;
  const fuente = o.horas ? 'línea de comandos' : entre ? 'experiencia de la persona' : 'respaldo';
  entre = ordenar(entre || (perfil === 'ligero' ? RUTINAS.respaldo : horasDelHorario(m.horario)));
  const pedido = o['fin-de-semana'];
  let finde = pedido !== undefined ? (pedido === 'no' ? [] : lista(pedido)) : memo.finde;
  const fuenteFinde = pedido !== undefined ? 'línea de comandos' : finde ? 'experiencia de la persona'
    : perfil === 'ligero' ? 'las de entre semana' : fuente === 'respaldo' ? 'respaldo' : 'las de entre semana más cercanas';
  if (finde) finde = ordenar(finde);
  else if (perfil === 'ligero') finde = entre;
  else if (fuente === 'respaldo') finde = ordenar(RUTINAS.finde_referencia);
  else finde = ordenar(RUTINAS.finde_referencia.map(r => entre.reduce((a, b) => (Math.abs(minutos(b) - minutos(r)) < Math.abs(minutos(a) - minutos(r)) ? b : a))));
  const topes = [[perfil === 'ligero' ? entre : [], 'entre semana', 'entre_semana'], [finde, 'en fin de semana', 'fin_de_semana']];
  for (const [hs, cuando, campo] of topes) {
    if (hs.length > RUTINAS.tope_dia) {
      falla('El perfil ' + perfil + ' juzga hasta ' + RUTINAS.tope_dia + ' veces al día ' + cuando + ' y trae ' + hs.length + ' horas',
        { horas: hs, siguiente: 'Corrige horarios_juicio.' + campo + ' con guardar_memoria("experiencia", {horarios_juicio}) o cambia el perfil, y vuelve a correr cos rutina' });
    }
  }
  return { perfil, entre, finde, fuente, fuenteFinde };
}

function describirHoras(horas) {
  const hs = horas.map(t => Math.floor(minutos(t) / 60));
  const seguidas = horas.length >= 3 && horas.every(t => t.slice(3) === horas[0].slice(3)) && hs.every((h, i) => !i || h === hs[i - 1] + 1);
  return seguidas ? 'cada hora de ' + dicha(horas[0]) + ' a ' + dicha(horas[horas.length - 1]) : 'a las ' + enLista(horas.map(dicha));
}

// Un juicio entre semana y otro de fin de semana, aunque las horas coincidan: así sus nombres no cambian
// cuando se mueven las horas. La diaria va una hora antes del primer juicio de cualquier día y el repaso
// del domingo, dos horas antes.
function rutinasCerebro(h) {
  const primera = Math.min(...h.entre.concat(h.finde).map(minutos));
  const diaria = hhmm(Math.max(primera - 60, 0)), semanal = hhmm(Math.max(primera - 120, 0));
  const juicios = (horas, dias, base) => porMinuto(horas).map((g, i) => ({ nombre: base + (i ? ' ' + (i + 1) : ''), archivo: 'PROMPT_cerebro_cada_hora.md', horas: g, dias }));
  const iguales = h.entre.join() === h.finde.join();
  const lista = juicios(h.entre, [1, 2, 3, 4, 5], 'Chief of Staff · revisión entre semana').concat(juicios(h.finde, [0, 6], 'Chief of Staff · revisión del fin de semana'));
  // porMinuto([]) no arma rutinas: sin horas de fin de semana no hay juicio de fin de semana.
  lista.push(
    { nombre: 'Chief of Staff · aprendizaje diario', archivo: 'PROMPT_cerebro_aprendizaje_diario.md', horas: [diaria], dias: [0, 1, 2, 3, 4, 5, 6] },
    { nombre: 'Chief of Staff · repaso del domingo', archivo: 'PROMPT_cerebro_repaso_semanal.md', horas: [semanal], dias: [0] });
  const juicio = iguales ? 'revisión todos los días ' + describirHoras(h.entre)
    : 'revisión entre semana ' + describirHoras(h.entre) + (h.finde.length ? '; sábado y domingo ' + describirHoras(h.finde) : '; sin revisión en fin de semana');
  const texto = juicio + '; aprendizaje diario a las ' + dicha(diaria) + ' y repaso del domingo a las ' + dicha(semanal);
  return { lista, texto };
}

// Herramientas preaprobadas para que la rutina no se detenga a pedir permiso. Las rutinas corren en
// modo automático; una regla de permiso gana antes que el clasificador. El nombre de cada herramienta
// en la rutina es mcp__<nombre del conector en la rutina>__<herramienta> (así sale
// también con el conector Gmail); se usa la lista real del motor. Sin la lista no se arman rutinas: un comodín
// preaprobaría también lo que solo decide la persona.
// Lo que solo la persona decide: responder una propuesta. Una rutina no la
// trae preaprobada. desuscribir sí va: con Bajas en Te aviso o Lo hago solo, Opus da la baja a un remitente
// conocido sin preguntar, y el motor hace cumplir esas condiciones.
// cambiar_politica también va: el repaso del domingo retira con ella lo que dejó de servir, y sin propuesta
// aceptada el motor solo deja bajar un nivel o retirar lo que no pidió la persona (cambiarPolitica_).
const SIN_PREAPROBAR = ['responder'];
// Herramientas de Claude que la rutina usa además del motor: PushNotification manda el aviso urgente al
// celular de la persona.
const DE_CLAUDE = ['PushNotification'];
// El conector en la cuenta de Claude se llama así en las rutinas; el alta lo confirma.
const CONECTOR_RUTINA = 'Chief_of_Staff';

async function permisosRutina(conectorNombre) {
  const estado = leerEstado();
  if (!estado.conector || !estado.llave) falla('Falta el paso 6: sin el conector no sé qué herramientas tiene el motor y no armo las rutinas.');
  let nombres;
  try {
    nombres = (await rpc(estado.conector.url, estado.llave, 'tools/list')).tools.map(t => t.name);
  } catch (e) {
    falla('El motor no dio su lista de herramientas (' + e.message + '). No armé las rutinas: sin esa lista tendrían permiso para todo, también para contestar propuestas. Revisa con cos estado que el motor conteste y vuelve a correr cos rutina.');
  }
  if (!nombres.length) falla('El motor dio una lista de herramientas vacía. No armé las rutinas.');
  return {
    conector_nombre: conectorNombre,
    allowed_tools: nombres.filter(n => !SIN_PREAPROBAR.includes(n)).map(n => 'mcp__' + conectorNombre + '__' + n).concat(DE_CLAUDE),
    sin_preaprobar: SIN_PREAPROBAR.filter(n => nombres.includes(n)),
    fuente: 'lista del motor (' + nombres.length + ' herramientas)'
  };
}

// El cuerpo que recibe RemoteTrigger create o update, con la forma que aceptó en una instalación real. El esfuerzo
// no va: el cuerpo no tiene dónde ponerlo. Lo que aún no se sabe queda entre << >>.
function cuerpoRutina({ nombre, cron, conector, ambiente, modelo, allowed_tools, prompt, encendida }) {
  const cuerpo = { name: nombre, cron_expression: cron, enabled: encendida };
  if (conector) cuerpo.mcp_connections = [conector];
  cuerpo.job_config = { ccr: {
    environment_id: ambiente,
    session_context: { model: modelo, allowed_tools },
    events: [{ data: { uuid: crypto.randomUUID(), session_id: '', type: 'user', parent_tool_use_id: null, message: { role: 'user', content: prompt } } }]
  } };
  return cuerpo;
}

// Compara una rutina creada (la respuesta de RemoteTrigger create, update o get, guardada en un archivo)
// con su cuerpo. Lo que más importa: un solo conector, el del Chief of Staff; sin él la rutina recibe
// todos los de la cuenta, Gmail incluido.
function verificarRutina(archivo) {
  let texto;
  try { texto = fs.readFileSync(archivo, 'utf8'); } catch { falla('No encuentro el archivo con la respuesta: ' + archivo); }
  let r;
  try { r = JSON.parse(texto.replace(/^\s*HTTP \d+\s*/, '')); } catch { falla('La respuesta no es JSON: guarda tal cual lo que contestó RemoteTrigger.'); }
  const t = r.trigger || r;
  const carpeta = path.join(CASA, 'rutinas');
  const cuerpos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter(f => f.endsWith('.body.json') && f !== 'alta.body.json') : [];
  const archivoCuerpo = cuerpos.find(f => JSON.parse(fs.readFileSync(path.join(carpeta, f), 'utf8')).name === t.name);
  if (!archivoCuerpo) falla('No hay cuerpo de cos rutina para la rutina "' + t.name + '". Corre cos rutina antes.');
  const c = JSON.parse(fs.readFileSync(path.join(carpeta, archivoCuerpo), 'utf8'));
  const diferencias = [];
  const conectores = t.mcp_connections || [];
  if (conectores.length !== 1) diferencias.push('conectores: tiene ' + conectores.length + ' y debe tener solo el del Chief of Staff');
  // Todo el cuerpo, campo por campo y con las listas del mismo largo: otro nombre de conector o un segundo evento
  // cuentan. Lo que agrega RemoteTrigger (id, fechas) y los ids del evento no cuentan.
  const compara = (esperado, real, ruta) => {
    if (ruta === 'mcp_connections' && conectores.length !== 1) return;
    if (Array.isArray(esperado)) {
      if (!Array.isArray(real) || real.length !== esperado.length) return diferencias.push(ruta + ': tiene ' + (Array.isArray(real) ? real.length : 0) + ' y debe tener ' + esperado.length);
      if (ruta.endsWith('allowed_tools')) { if (JSON.stringify([...real].sort()) !== JSON.stringify([...esperado].sort())) diferencias.push(ruta); return; }
      return esperado.forEach((x, i) => compara(x, real[i], ruta + '[' + i + ']'));
    }
    if (esperado && typeof esperado === 'object') {
      if (!real || typeof real !== 'object') return diferencias.push(ruta);
      for (const k of Object.keys(esperado)) {
        if (ruta.includes('events') && (k === 'uuid' || k === 'session_id')) continue;
        compara(esperado[k], real[k], ruta ? ruta + '.' + k : k);
      }
      return;
    }
    if (esperado !== real && !(esperado === null && real === undefined)) diferencias.push(ruta);
  };
  compara(c, t, '');
  salida({ ok: diferencias.length === 0, rutina: t.name, id: t.id, cuerpo: path.join(carpeta, archivoCuerpo), diferencias }, diferencias.length ? 1 : 0);
}

pasos.rutina = async (o) => {
  if (o.verificar) verificarRutina(String(o.verificar));
  const nombre = o.nombre;
  if (!nombre) falla('Uso: cos rutina --nombre <su nombre> [--ambiente env_…] [--conector-uuid U] [--conector-nombre ' + CONECTOR_RUTINA + '] [--perfil ligero|completo] [--horas 07:15,13:45,20:45] [--fin-de-semana 10:07,14:07|no]; para revisar una creada: cos rutina --verificar <archivo con la respuesta>');
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const desfase = -new Date().getTimezoneOffset();
  const h = horarioRutinas(o, o.perfil && o.horas ? null : await memoriaDelMotor(leerEstado()));
  const permisos = await permisosRutina(String(o['conector-nombre'] || CONECTOR_RUTINA));
  const ambiente = o.ambiente ? String(o.ambiente) : '<<ENVIRONMENT_ID>>';
  const uuid = o['conector-uuid'] ? String(o['conector-uuid']) : '<<CONNECTOR_UUID>>';
  const { lista, texto } = rutinasCerebro(h);
  // La rutina usa el mismo relevo que el conector de esta instalación, aunque el de omisión haya cambiado.
  const relevo = String((leerEstado().vinculo || {}).relevo || RELEVO).replace(/\/$/, '');
  // Cada prompt va a un archivo: juntos pasan de 30 mil caracteres, más de lo que Claude ve de un comando.
  const carpeta = path.join(CASA, 'rutinas');
  // Los cuerpos anteriores son la única forma de regresar las rutinas desde disco: se copian antes de borrarlos.
  let respaldo_rutinas = null;
  if (fs.existsSync(carpeta) && fs.readdirSync(carpeta).length) {
    const sello = horaConZona().slice(0, 16).replace(/[-: ]/g, '') + String(new Date().getSeconds()).padStart(2, '0');
    respaldo_rutinas = path.join(CASA, 'respaldos', 'rutinas_' + sello);
    for (let n = 2; fs.existsSync(respaldo_rutinas); n++) respaldo_rutinas = path.join(CASA, 'respaldos', 'rutinas_' + sello + '_' + n);
    try { fs.cpSync(carpeta, respaldo_rutinas, { recursive: true }); }
    catch (e) { falla('No pude respaldar las rutinas anteriores (' + e.message + '). No borré nada.', { carpeta }); }
  }
  fs.rmSync(carpeta, { recursive: true, force: true });
  fs.mkdirSync(carpeta, { recursive: true });
  const rutinas = lista.map(r => {
    const archivo = path.join(RAIZ, 'cerebro', '02_rutina', r.archivo);
    if (!fs.existsSync(archivo)) falla('Falta el prompt del cerebro: ' + archivo, {}, 5);
    const original = fs.readFileSync(archivo, 'utf8');
    const corte = original.search(/^---\s*$/m);
    const prompt = (corte >= 0 ? original.slice(corte).replace(/^---\s*\n/, '') : original)
      .replace(/<<NOMBRE>>/g, nombre).replace(/<<PERFIL>>/g, h.perfil).replace(/<<HORARIO_RUTINAS>>/g, texto).trim();
    const pendientes = prompt.match(/<<[A-Z_]+>>/g);
    if (pendientes) falla('El prompt trae datos sin llenar: ' + [...new Set(pendientes)].join(', '), { archivo });
    const corto = r.nombre.replace(/^Chief of Staff · /, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_');
    const prompt_archivo = path.join(carpeta, corto + '.md');
    fs.writeFileSync(prompt_archivo, prompt + '\n', { mode: 0o600 });
    const cron = 'CRON_TZ=' + zona + ' ' + cronLocal(r.horas, r.dias);
    const conector = { connector_uuid: uuid, name: permisos.conector_nombre, url: relevo + '/mcp' };
    const body_archivo = path.join(carpeta, corto + '.body.json');
    fs.writeFileSync(body_archivo, JSON.stringify(cuerpoRutina({ nombre: r.nombre, cron, conector, ambiente, modelo: 'claude-opus-5-5',
      allowed_tools: permisos.allowed_tools, prompt, encendida: true }), null, 2) + '\n', { mode: 0o600 });
    return {
      nombre: r.nombre, modelo: 'claude-opus-5-5', cron, cron_utc: cronUtc(r.horas, r.dias, desfase),
      conectores: [{ nombre: permisos.conector_nombre, url: relevo + '/mcp' }],
      allowed_tools: permisos.allowed_tools,
      prompt_archivo, prompt_caracteres: [...prompt].length, body_archivo
    };
  });
  // El alta: la primera rutina, apagada, sin conectores y sin instrucciones. Su respuesta trae los
  // conectores de la cuenta con su connector_uuid, que nada más da.
  const alta_archivo = path.join(carpeta, 'alta.body.json');
  fs.writeFileSync(alta_archivo, JSON.stringify(cuerpoRutina({ nombre: rutinas[0].nombre, cron: rutinas[0].cron, conector: null, ambiente,
    modelo: 'claude-opus-5-5', allowed_tools: [], prompt: 'Instalación en curso: esta rutina todavía no tiene sus instrucciones. No hagas nada.', encendida: false }), null, 2) + '\n', { mode: 0o600 });
  const falta = [...(ambiente.startsWith('<<') ? ['environment_id (--ambiente)'] : []), ...(uuid.startsWith('<<') ? ['connector_uuid (--conector-uuid)'] : [])];
  salida({ ok: true, perfil: h.perfil, respaldo_rutinas, horas_juicio: { entre_semana: h.entre, fin_de_semana: h.finde },
    fuente_horas: h.fuente, fuente_fin_de_semana: h.fuenteFinde, horario: texto, zona, permisos_fuente: permisos.fuente, sin_preaprobar: permisos.sin_preaprobar,
    alta_archivo, falta, rutinas });
};

pasos.estado = async () => {
  const estado = leerEstado();
  const vista = Object.assign({}, estado, { llave: estado.llave ? '(guardada)' : null });
  if (vista.vinculo) vista.vinculo = Object.assign({}, vista.vinculo, { codigo: '(guardado)' });
  vista.motor_contesta = estado.conector && estado.llave ? !!(await motorResponde(estado)) : false;
  // Cada corrida deja la versión de la instalación con la que corrió (INSTALACION.version de Instalacion.js) y la
  // del motor. Si la primera corrida después de desplegar no trae la del despliegue, el activador sigue en el
  // despliegue viejo. Antes de esa corrida no se concluye nada: llega en menos de 10 minutos.
  if (vista.motor_contesta && estado.version) {
    try {
      const r = await rpc(estado.conector.url, estado.llave, 'tools/call', { name: 'ver_hoy', arguments: { maximo: 1 } });
      const c = (JSON.parse((r.content || [])[0].text) || {}).ultima_corrida;
      if (c && c.version) {
        vista.ultima_corrida = c;
        if (c.hora && estado.version && String(c.hora) < estado.version.slice(0, 16)) {
          vista.corrida_al_dia = null;
          vista.nota_corrida = 'El motor no ha corrido desde que se desplegó; la siguiente corrida llega en menos de 10 minutos.';
        } else {
          vista.corrida_al_dia = c.version === estado.version;
          if (!vista.corrida_al_dia) vista.siguiente = 'instalador/cos motor';
        }
      }
    } catch {}
  }
  // Liga del plan para la plática, por si ver_propuestas.plan_url viene en null.
  if (estado.app) { const u = urlParaAbrir(estado); vista.plan_url = u + (u.includes('?') ? '&' : '?') + 'vista=plan'; }
  salida(vista);
};

// Quita los activadores del motor y la alta en el relevo. El proyecto de Apps Script, el conector de
// Claude y las rutinas los quita la persona (la guía dice dónde); clasp no tiene permiso de borrar.
pasos.desinstalar = async () => {
  const estado = leerEstado();
  exigir(estado, 'conector', 'llave');
  const r = {};
  try { r.motor = await rpc(estado.conector.url, estado.llave, 'cos/admin', { accion: 'desinstalar' }); } catch (e) { r.motor = { error: e.message }; }
  try {
    const b = await fetch(RELEVO + '/baja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script_url: estado.conector.url, llave: estado.llave }) });
    r.relevo = await b.json();
  } catch (e) { r.relevo = { error: e.message }; }
  salida({ ok: true, resultado: r, falta_a_mano: [
    'Borrar el proyecto en ' + (estado.scriptId ? 'https://script.google.com/d/' + estado.scriptId + '/edit' : 'script.google.com') + ' (Información general, Eliminar)',
    ...(estado.hoja ? ['Mandar a la papelera la Hoja de su memoria: ' + estado.hoja.url] : []),
    'Quitar el conector Chief of Staff en Claude (Ajustes, Conectores)',
    'Borrar la rutina en https://claude.ai/code/routines',
    'Quitar el acceso de clasp en https://myaccount.google.com/permissions'
  ] });
};

const [paso, ...resto] = process.argv.slice(2);
if (!paso || !pasos[paso]) {
  salida({ uso: 'instalador/cos <paso>', pasos: ['preparar', 'entrar', 'api', 'armar', 'desplegar', 'autorizar', 'motor', 'vincular', 'codigo', 'conectores', 'qr', 'rutina', 'herramientas', 'herramienta', 'admin', 'estado', 'desinstalar'] }, paso ? 1 : 0);
}
await pasos[paso](opciones(resto));
