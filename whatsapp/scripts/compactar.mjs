// Quita comentarios de línea completa y sangrías para que el script pese menos al pegarlo.
import { readFileSync, writeFileSync } from "node:fs";
const fuente = readFileSync(new URL("./leer_whatsapp_web.js", import.meta.url), "utf8");
const min = fuente.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//")).join("\n");
writeFileSync(new URL("./leer_whatsapp_web.min.js", import.meta.url), min);
new Function(`return (async () => { ${min} })`);
console.log(JSON.stringify({ fuente: fuente.length, compacto: min.length, tokens_aprox: Math.round(min.length / 3.2) }));
// Arma el prompt de la tarea programada con el script compacto adentro.
const plantilla = readFileSync(new URL("../tarea_programada/plantilla_prompt.md", import.meta.url), "utf8");
writeFileSync(new URL("../tarea_programada/PROMPT_cos_whatsapp.md", import.meta.url), plantilla.replace("{{SCRIPT}}", () => min));
console.log("prompt de la tarea:", plantilla.length + min.length, "caracteres");
// Archivo para el motor (Apps Script): ver_whatsapp devuelve este script en como_leer.script.
// El motor lo copia tal cual al construir; no se edita a mano.
const paraMotor = `// Generado por whatsapp/scripts/compactar.mjs desde leer_whatsapp_web.js. No se edita a mano.\n// ver_whatsapp lo devuelve en como_leer.script.\nvar SCRIPT_WHATSAPP = ${JSON.stringify(min)};\n`;
writeFileSync(new URL("./para_motor/ScriptWhatsapp.js", import.meta.url), paraMotor);
console.log("para el motor:", paraMotor.length, "caracteres");
