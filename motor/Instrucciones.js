// --- Instrucciones del conector para Opus (initialize.instructions) ---
// El texto fijo sale de cerebro/03_platica_diaria/INSTRUCCIONES_conector.md y llega en Textos.js.
// El conector le suma el perfil recortado, las políticas activas y el estado de la cuenta, sin pasar de 4,096 caracteres.

function instruccionesEducacion_() {
  return typeof INSTRUCCIONES_FIJAS === 'string' ? INSTRUCCIONES_FIJAS : '';
}
