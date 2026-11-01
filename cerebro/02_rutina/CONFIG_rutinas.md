# Configuración de las rutinas del cerebro

Versión 3. Para el instalador. Datos de la documentación consultada hoy (code.claude.com/docs/en/routines); las tareas programadas están en vista previa de investigación y sus límites pueden cambiar.

## Tres rutinas, dos perfiles

| Rutina | Prompt | Modelo y esfuerzo | Presupuesto por corrida (referencia) |
|---|---|---|---|
| Chief of Staff · revisión entre semana y Chief of Staff · revisión del fin de semana | `PROMPT_cerebro_cada_hora.md` | Opus 5.5, esfuerzo alto | Completo: 20 hilos y 40 llamadas. Ligero: 60 hilos y 70 llamadas. Detalle en el prompt |
| Chief of Staff · aprendizaje diario | `PROMPT_cerebro_aprendizaje_diario.md` | Opus 5.5, esfuerzo alto | Unas 60 llamadas. Propuestas y preguntas las decide Opus: todo cabe en una tarjeta al día |
| Chief of Staff · repaso del domingo | `PROMPT_cerebro_repaso_semanal.md` | Opus 5.5, esfuerzo extra alto | Unas 60 llamadas y unas 3 líneas en el repaso |

La plática de instalación va en esfuerzo extra alto; corre una vez, en Claude, y cuesta unos US$7.6 a precio de lista con 50 llamadas.

| Perfil | Juicio | Diaria y semanal | Para quién |
|---|---|---|---|
| Ligero | Hasta 3 veces al día, todos los días, a las horas que Opus elige según cuándo lee y contesta la persona (por ejemplo 7:15, 13:45 y 20:45 entre semana y 11:45 en fin de semana). Respaldo si no hay datos: 8:07, 13:07 y 18:07 | Igual | Todos. Es el perfil por defecto y tiene que caber en Pro |
| Completo | Cada hora de su horario entre semana; hasta 3 veces en fin de semana, a las horas que Opus elige. Respaldo del fin de semana si no hay datos: 10:07, 14:07 y 19:07 | Igual | Se ofrece el día 7 con la medición, si no faltó ninguna corrida, o si la persona lo pide. Conviene solo con Max, Ultra, Team o Enterprise |

El perfil es un tope; las horas las decide Opus. La instalación no pregunta el plan de Claude: todos empiezan en el ligero, y Opus lo dice en una línea del plan con sus horas (propuesta con objeto `rutinas`). Elige las horas con las que la persona envía y contesta (`horas_de_envio_30d`) y el horario que ve en sus enviados; la persona corrige con palabras si quiere. El perfil queda en su perfil ("Rutinas: ligero") y las horas en su experiencia: `horarios_juicio {entre_semana [], fin_de_semana []}`. Si falta `fin_de_semana`, vale la lista de entre semana dentro del tope. El instalador lee las dos cosas, arma un cron para entre semana (`1-5`) y otro para fin de semana (`0,6`) con esas horas y llena `<<PERFIL>>` y `<<HORARIO_RUTINAS>>` en el prompt de juicio. Si después Opus propone mover las horas y la persona acepta, el cambio lo aplica el instalador o la persona en la página de rutinas: el motor no puede cambiar el horario de una rutina.

En el ligero, el juicio de la mañana cubre todo lo que llegó en la noche. Juzga primero lo que puede ser riesgo y a los remitentes nuevos, luego las fichas de importancia alta y al final lo demás.

## Cron

El cron de 5 campos usa UTC salvo que empiece con `CRON_TZ=` [documentado: code.claude.com/docs/en/scheduled-tasks]. El intervalo mínimo es 1 hora; una expresión más frecuente se rechaza [documentado: code.claude.com/docs/en/routines]. Los minutos 07 evitan la hora en punto, cuando corren más tareas.

Ejemplo con las horas de respaldo, para un horario de 8:00 a 20:00 en Ciudad de México. Con las horas que eligió Opus, el instalador cambia los números de hora y minuto:

```
Perfil ligero
Chief of Staff · revisión entre semana:     CRON_TZ=America/Mexico_City 7 8,13,18 * * 1-5
Chief of Staff · revisión del fin de semana: CRON_TZ=America/Mexico_City 7 8,13,18 * * 0,6
Chief of Staff · aprendizaje diario:         CRON_TZ=America/Mexico_City 7 7 * * *
Chief of Staff · repaso del domingo:         CRON_TZ=America/Mexico_City 7 6 * * 0

Perfil completo
Chief of Staff · revisión entre semana:     CRON_TZ=America/Mexico_City 7 8-20 * * 1-5
Chief of Staff · revisión del fin de semana: CRON_TZ=America/Mexico_City 7 10,14,19 * * 0,6
Chief of Staff · aprendizaje diario:         CRON_TZ=America/Mexico_City 7 7 * * *
Chief of Staff · repaso del domingo:         CRON_TZ=America/Mexico_City 7 6 * * 0
```

La sintaxis con `CRON_TZ` y nombre de zona se infiere de la regla documentada; no hay ejemplo oficial con zona. El instalador la prueba con "Ejecutar ahora" y revisa la hora de la siguiente corrida. Si no la acepta, usa UTC: Ciudad de México está en UTC-6 todo el año, así que el ligero queda en `7 14,19,0 * * *` (la de las 18:07 cae a las 0:07 UTC del día siguiente).

## Conectores

- En cada rutina solo va el conector Chief of Staff. Los demás conectores de la cuenta se quitan: entran todos por defecto [documentado: code.claude.com/docs/en/routines, sección Connectors].
- Es la defensa principal. El conector Chief of Staff no puede enviar ni borrar para siempre: enviar solo lo hace la persona con el botón Enviar de su web app. Si la rutina tuviera el conector oficial de Gmail, Opus podría enviar.
- Una prueba confirmó que `allowed_tools` no limita lo que ve el agente.

## Límites del plan

- Las rutinas gastan del mismo límite de uso que la persona usa en Claude, igual que una sesión interactiva [documentado: sección "Usage and limits"].
- No hay tope diario de corridas por plan. Hay topes por hora sin excedente: 100 corridas programadas por hora por cuenta; 30 de "Ejecutar ahora" o disparos por API por hora por rutina [documentado].
- Al topar el límite de uso, sin créditos de uso, las corridas nuevas se rechazan hasta que se renueva la ventana [documentado].
- Si Opus no ha corrido en 24 horas, el motor propone con la regla de tres señales iguales y avisa en Hoy que el juicio está detenido. Lo compilado sigue cada 10 minutos: la limpieza no depende de las rutinas.

## Consumo estimado

**Es una estimación, no una medición.** La mide la primera semana de cada persona (abajo). Va a precio de lista para comparar perfiles y semanas; la persona no paga por token: gasta de su plan. Las cifras salen de un modelo de consumo del equipo de desarrollo; no viaja con el producto.

### Supuestos

| Supuesto | Valor |
|---|---|
| Esfuerzo | Juicio y aprendizaje diario en alto; repaso semanal en extra alto |
| Contexto fijo por corrida | 40 mil tokens (sistema de la nube, un conector, el prompt), en caché fría: cada corrida lo escribe una vez |
| Cada llamada al conector | Lee de caché todo lo anterior, escribe en caché lo nuevo y genera su salida |
| Llamadas de un juicio | 5 fijas; juicios y acciones en lotes de 25; lee completos 15% de los hilos y la mitad de los de personas (máximo 12); borradores para 20% de los de personas (máximo 8). Sin trabajo, sale en 2 llamadas |
| Tokens | Respuesta de herramienta: 2,500 de base, 150 por hilo en la lista de novedades, 3,000 por hilo leído. Salida: 500 por llamada más 100 por hilo juzgado en el juicio; 1,200 por llamada en la diaria; 3,000 en la semanal |
| Qué juzga Opus | Todo el correo de personas, porque su prioridad depende del contenido, y lo masivo que no está compilado. Lo compilado lo hace el motor sin costo |
| Compilado de lo masivo | Semana 1: 70%. Semana 4: 87% (abajo, de dónde salen) |
| Llamadas de la diaria | 20 en la semana 1; 14 en la semana 4, con menos rescates, preguntas y propuestas |
| Volumen | Cuenta medida: 21 hilos al día (364 en 17 días), casi sin correo de personas. Cuenta típica: 120 al día con 25% de personas; es un supuesto, no una medición. El fin de semana llega la mitad |
| Precios de lista de Opus 5.5 por millón | US$4 entrada, US$20 salida, US$5 escritura en caché, US$0.20 lectura en caché (DISENO_v1, sección 5) |

**De dónde salen 70% y 87%.** En la cuenta medida, 54 de 90 remitentes hacen el 90% del volumen de 17 días. La instalación compila a los remitentes con 4 o más correos, que cubren 74% del volumen. Aprendiendo con los primeros 9 a 13 días y midiendo en los siguientes, esos remitentes cubren 57% a 71% de lo que llega después. En la semana 4, Opus ya agregó a la compilación cada remitente que cupo en una política aprobada después de juzgarlo una vez: los remitentes vistos al menos una vez cubren 87% a 90%. Lo que queda son remitentes nuevos, 10% a 13% del correo de cada semana, que siempre pasan por Opus.

### Resultado

| Cuenta | Perfil | Opus juzga al día | Semana 1 | Semana 4 | Baja |
|---|---|---|---|---|---|
| De prueba | Ligero | 6 en la semana 1, 3 en la 4 | US$23 | US$19 | 16% |
| De prueba | Completo | 6 en la semana 1, 3 en la 4 | US$39 | US$32 | 17% |
| Típica | Ligero | 57 en la semana 1, 42 en la 4 | US$32 | US$28 | 13% |
| Típica | Completo | 57 en la semana 1, 42 en la 4 | US$54 | US$47 | 12% |

**La curva existe, pero baja poco: 12% a 17% en cuatro semanas.** La cifra no sostiene sola el argumento de "cuesta menos mientras más aprende":

- Lo que Opus juzga sí baja: 57% menos en la cuenta medida y 27% menos en la típica. En la típica baja menos porque el correo de personas siempre se juzga.
- El costo baja poco porque cada hilo juzgado por lote cuesta cerca de un centavo de dólar. Pesa más lo fijo: el contexto de cada corrida y las rutinas diaria y semanal.
- Más de la mitad de la baja viene de que la diaria tiene menos que aprender, no de lo compilado.

**La curva se vuelve real si la frecuencia sigue al aprendizaje.** Con 2 juicios al día en la semana 4 en lugar de 3, el ligero cuesta US$17 en la cuenta medida y US$25 en la típica: 23% a 27% menos que en su semana 1. Pasar del completo al ligero cuesta cerca de 40% menos. Por eso la rutina diaria propone la frecuencia con datos el día 7 y el día 28 (abajo). El costo de bajar la frecuencia es tiempo: un remitente nuevo espera más su juicio.

**Lo que más baja es el trabajo de la persona,** no el cómputo: menos propuestas, menos preguntas y menos rescates conforme las políticas se afinan. Ese es el argumento de negocio más fuerte, y la rutina diaria lo mide.

**Antes se estimó otra cosa.** La primera estimación de esta versión daba US$39 a 50 para el ligero y US$63 a 79 para el completo. Contaba un costo fijo por tipo de corrida, sin volumen ni lotes, y la diaria en extra alto. El modelo de ahora cuenta el volumen y los lotes, y pone la diaria en alto.

**El ligero tiene que caber en Pro.** La documentación no dice cuánto cabe, ni en dólares ni en tokens. El ligero equivale a unos US$80 a 140 al mes a precio de lista, según el volumen, y la persona usa el mismo límite en sus pláticas. Con poco correo es probable que quepa; con 120 correos al día puede topar algunas ventanas. Por eso la primera semana lo confirma con hechos y no con esta estimación. Como guía: desde el día 1, si falta una corrida, la rutina diaria lo dice y pide revisar el registro de esa rutina en Claude, porque también falta con un pedido de permiso. Propone bajar a 2 juicios al día, y si ya son 2 la diaria cada tercer día, solo si la persona confirma que el registro dice límite de uso o si faltan corridas en dos días distintos; Opus puede elegir otro ajuste si ve por qué faltó. En la semana 1, 2 juicios al día bajan 11%; la diaria cada tercer día baja 23% a 32%, porque en esa semana la diaria pesa casi tanto como el juicio; las dos juntas, 34% a 43%. El orden es ese a propósito: la diaria es donde se aprende la primera semana, y se recorta solo si con 2 juicios sigue faltando alguna corrida. El día 3 la diaria dice en una línea del resumen si el perfil cabe.

### Costo por número de llamadas

Para que la rutina diaria estime lo que gastó cada corrida con las llamadas que registra el motor:

| Llamadas | Juicio | Diaria |
|---|---|---|
| 5 | US$0.40 | US$0.50 |
| 10 | US$0.61 | US$0.83 |
| 15 | US$0.85 | US$1.18 |
| 20 | US$1.10 | US$1.56 |
| 25 | US$1.37 | US$1.96 |

Regla corta: US$0.15 más US$0.05 por llamada en el juicio, y US$0.15 más US$0.07 por llamada en la diaria.

## La frecuencia sigue al aprendizaje

1. El motor registra en `corridas` cada corrida de cada rutina: hora, duración, llamadas al conector y resultado (pedido al motor). Cada rutina además cierra diciendo cuántas llamadas hizo.
2. La rutina diaria estima el costo de cada corrida con la regla corta.
3. Las corridas que el horario pedía y no corrieron son la señal a revisar: pueden ser el límite del plan, un pedido de permiso o una falla de la rutina en la nube.
4. Desde el día 1, si falta una corrida, la rutina diaria lo dice en una línea y pide revisar el registro de esa rutina en Claude. Propone 2 juicios al día, y si ya son 2 la diaria cada tercer día, solo si la persona confirma que el registro dice límite de uso o si faltan corridas en dos días distintos. La medición corre sola desde el día 1: cada rutina se identifica con su `corrida` en cada llamada y el motor cuenta corridas, llamadas y faltantes. El día 3 la diaria dice en una línea del resumen si el perfil cabe en el plan de la persona. El día 7, si no faltó ninguna corrida, ofrece el completo en una línea con esa medición: conviene solo con Max, Ultra, Team o Enterprise. No se pregunta el plan; la persona sabe cuál tiene.
5. El día 28, vuelve a proponer con lo que Opus juzga al día: si es poco (referencia: menos de 15 hilos), propone 2 juicios al día en el ligero, o pasar al ligero desde el completo. Dice cuánto ahorra y cuánto esperaría un remitente nuevo.

## Disparo inmediato

Las rutinas aceptan un disparo por HTTP con token propio, con tope de 30 por hora por rutina y 100 por hora por cuenta [documentado: platform.claude.com/docs/en/api/claude-code/routines-fire; API experimental]. El motor puede disparar el juicio cuando llega algo de una ficha de importancia alta, en lugar de esperar a la siguiente corrida. Sirve sobre todo en el perfil ligero. El cuerpo `text` lleva el `id_hilo`. Gasta del mismo límite.

## Primera corrida, revisada por Opus

La persona no acompaña la primera corrida. El instalador la lanza con "Ejecutar ahora", y Opus la revisa con `ver_hechos('corridas')` en la siguiente plática o en la primera rutina diaria: que no se haya pausado a pedir permiso, que use solo el conector Chief of Staff, que lea el cuaderno al empezar y que su resumen de 3 líneas tenga sentido. Si algo falló, lo corrige y lo anota en el cuaderno.
