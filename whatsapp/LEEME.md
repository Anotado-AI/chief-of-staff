# Módulo de WhatsApp del Chief of Staff

Lee WhatsApp Web en el Chrome de la persona con Claude in Chrome, en solo lectura, resume los chats y guarda el resultado en el motor con `guardar_whatsapp`. Deja respuestas escritas sin enviar solo cuando la persona lo pide.

| Archivo | Qué es |
|---|---|
| `scripts/leer_whatsapp_web.js` | Lector de WhatsApp Web (fuente). Lista chats, detecta grupos, abre los que lo ameritan y deja el reporte en la consola |
| `scripts/leer_whatsapp_web.min.js` | El mismo, compacto, para pegar en `javascript_tool` |
| `scripts/compactar.mjs` | Genera el compacto, el prompt de la tarea y el archivo para el motor: `node scripts/compactar.mjs` |
| `scripts/para_motor/ScriptWhatsapp.js` | El script como variable `SCRIPT_WHATSAPP` de Apps Script; el motor lo copia tal cual y `ver_whatsapp` lo devuelve en `como_leer.script` |
| `tarea_programada/plantilla_prompt.md` | Prompt de la tarea con el hueco del script |
| `tarea_programada/PROMPT_cos_whatsapp.md` | Prompt completo de la tarea programada (no se edita a mano) |
| `tarea_programada/GUIA_instalador_Mac.md` | Cómo la instala Opus en Mac o Windows (probada de punta a punta en Mac) |
| `INSTRUCCION_platica_diaria.md` | "¿Qué tengo en WhatsApp?" y "contéstale a X" en la plática diaria |
| `salida/` | Ejemplo anónimo del JSON que recibe `guardar_whatsapp` |

Si cambias el lector, corre `node scripts/compactar.mjs` para regenerar el compacto, el prompt y el archivo para el motor. Después actualiza la tarea `cos-whatsapp` con el prompt nuevo y vuelve a copiar `ScriptWhatsapp.js` al motor.
