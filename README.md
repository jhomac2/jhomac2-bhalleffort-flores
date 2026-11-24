# Bhalleffort

Sistema de ventas para tienda de abarrotes / víveres. Funciona sin internet y guarda los datos en el navegador (IndexedDB).

Diseñado por Jhordy Cabascango · https://www.tiktok.com/@jhordycabascango21

## Modo simple (por defecto) y sistema completo
La app abre en **Modo simple**: diseño limpio, letra grande y solo 5 botones abajo/al lado: **Vender · Caja · Mi Vecino · Fiados · Más**.
- **Más** reúne lo demás: Ventas de hoy, Productos, Reportes, Contabilidad, Resumen, Cambios y Ajustes. **Ayuda** muestra ejemplos de qué decirle al micrófono.
- Abrir caja es un toque: «Abrir igual que ayer» (o cambiar los valores / decirlo por voz).
- Cerrar caja es paso a paso, una pregunta por pantalla.
- Reportes: un solo botón (Hoy / Semana / Mes) y enviar por WhatsApp o descargar PDF.
- Se ocultan costos, ventas en espera y factura SRI. Todo sigue disponible en el sistema completo.
- Para volver al sistema completo: **Más → «Ver el sistema completo»** (o Ajustes → casilla «Modo simple»). Los datos son los mismos en ambos modos.

## Qué incluye
- Venta con lector de códigos de barras o manual (solo efectivo), fiado y ventas en espera.
- **Todo se puede hacer por voz o a mano** (botón «Hablar» o tecla F4): abrir y cerrar caja, ventas, retiros/depósitos/consultas de Mi Vecino, gastos e ingresos, pagos a proveedores, retiros del dueño, contabilidad, inventario, productos nuevos, precios, anular ventas, fiados, reportes y preguntas («¿cuánto hay en Pichincha?»).
- Apertura de caja obligatoria cada día (efectivo tienda, efectivo Mi Vecino, cuentas Pichincha y Guayaquil), también por voz: «abre la caja igual que ayer».
- **Contabilidad** del dueño del negocio: botones «Anotar gasto» y «Anotar ingreso» (con atajos como Luz, Agua, Fundas), opción de que el gasto salga también de la caja de hoy, edición y PDF. Todo queda en el historial de cambios.
- Panel fijo de **Mi Vecino**: depósitos, retiros, consultas de saldo (solo se cuentan, para la comisión), servicios y recargas.
- Dueños de productos ilimitados, con ventas y ganancias por dueño.
- Edición de ventas y precios con historial de cambios y aviso al cerrar caja.
- Cierre de caja con conteo y opción de sumar a la contabilidad de un dueño.
- Dashboard de utilidad (día, semana, mes, año, rango) y reportes PDF de cualquier fecha.
- Envío de reportes por WhatsApp (un solo PDF: tienda, Mi Vecino o ambos).
- Sin IVA. Factura SRI opcional (solo anota los datos del cliente).

## Voz: cómo se usa
Toca **Hablar** (o F4), di la orden y el sistema la entiende y te contesta hablando. Si hay dudas pregunta; si es dinero pide confirmar («sí» / «no» o tocando el botón).

Ejemplos:
- Caja: «abre la caja» · «abre la caja igual que ayer» · «cierra la caja» · «cierra la caja, todo cuadra».
- Ventas: «vende 2 leche y 3 pan, cobrar, paga con 5» · «fiado a don Luis una leche» · «anula la última venta» · «cambia el precio del arroz a 0.65».
- Dinero: «anota un gasto de 5 en fundas» · «ingreso de 10 por venta de cartón» · «pago a proveedor de 25 coca cola» · «retiro del dueño de 20» · «gasto de 30 en luz, no de la caja».
- Mi Vecino: «retiro 50 pichincha» · «depósito 30 guayaquil» · «consulta de saldo».
- Inventario y productos: «ingreso 12 aceite» · «salida 2 atún» · «crea producto jugo de naranja a 0.75» · «agrega un cliente llamado Juan».
- Fiados: «cobra a Rosa 5 dólares».
- Preguntas: «¿cuánto hay en Guayaquil?» · «¿cuánto vendí hoy?» · «¿cuánto gasté este mes?» · «¿qué se está acabando?» · «¿quién me debe?» · «¿cuánto vendió Mercedes?».
- Reportes: «reporte de hoy» · «envía el reporte por WhatsApp» · «descarga el reporte de Mi Vecino del mes».
- Otros: «deshacer» · «haz un respaldo» · «ayuda».

En Ajustes → Voz hay un modo **manos libres**: el micrófono vuelve a escuchar solo después de cada respuesta.
Los gastos y pagos preguntan si salen de la caja de hoy y si se anotan en la contabilidad; se puede corregir hablando («no de la caja», «sin contabilidad») o tocando los botones. Todo lo que se hace por voz queda en el historial de cambios con lo que se dijo.

Siempre hay un cuadro de texto en el panel: si no hay internet o hay mucho ruido, escribe la orden y funciona igual.

### Límites de la voz (importante)
- El reconocimiento de voz del navegador (Chrome / Edge) normalmente **necesita internet**. Sin internet el sistema entero sigue funcionando; solo el micrófono pide conexión y se usa el cuadro de texto.
- Voz **sin internet**: solo Chrome 139 o más nuevo, y hay que descargar el idioma en Ajustes → Voz → «Revisar voz sin internet».
- El navegador pide permiso del micrófono. Con `https` (GitHub Pages) lo recuerda; abriendo el archivo directo (`file://`) pregunta cada vez.
- No funciona dentro de vistas previas incrustadas (por ejemplo, dentro de claude.ai): abre el archivo o la página de GitHub.
- En Firefox y Safari el micrófono puede no estar disponible; se usa el cuadro de texto.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa (todo el código dentro). |
| `sw.js` | Service worker: guarda la app para que abra **sin internet**. |
| `manifest.webmanifest` + `icon-*.png`, `icon.svg`, `apple-touch-icon.png` | Permiten instalarla como app en el computador o el celular. |
| `src/`, `template.html`, `build.py`, `vendor/` | Código fuente para regenerar `index.html`. |

`sw.js`, `manifest.webmanifest` y los iconos deben estar en la **misma carpeta** que `index.html`.

## Publicar en GitHub Pages
1. Sube todos los archivos a un repositorio.
2. Settings → Pages → Deploy from a branch → `main` / `(root)`.
3. Abre `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` **una vez con internet**. Desde ahí funciona sin conexión.
4. En Chrome: menú ⋮ → «Instalar Bhalleffort» (queda como app con su ícono).

## Usar sin GitHub
Abre `index.html` directamente en el navegador. También funciona sin internet.

## Actualizar
Tras cambiar el código ejecuta `python3 build.py` (genera `index.html`) y cambia `VERSION` en `sw.js` (esta versión: `bhalleffort-v4`; la siguiente `bhalleffort-v5`) para que los equipos reciban la versión nueva. Los datos guardados no se pierden al actualizar.

Los datos quedan en el navegador de cada equipo: descarga un respaldo cada semana desde Ajustes. Las librerías jsPDF y jspdf-autotable (licencia MIT) están en `vendor/`.
