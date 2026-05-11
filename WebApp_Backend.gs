// ============================================
// BIBLIOTECA GOYAVIER — WEB APP BACKEND
// Archivo: WebApp_Backend.gs  (versión 2.1)
// ============================================
// CAMBIO v2.1: Soporte JSONP en doGet()
//   → Permite usar el Index.html desde Live Server
//     (localhost) o cualquier origen externo sin
//     errores de CORS.
//   → Todo lo demás es idéntico a v2.0.
// ============================================

const APP_CONFIG = {
  NOMBRE_HOJA: "Correos Colegio",
  EMAIL_BIBLIOTECA: Session.getEffectiveUser().getEmail(),

  COL: {
    FECHA: 1,
    REMITENTE: 2,
    ASUNTO: 3,
    CUERPO: 4,
    NUM_ADJUNTOS: 5,
    CARPETA: 6,
    ID_MENSAJE: 7,
    EMAIL_DESTINO: 8,
    ESTADO: 9,
    ENVIADO_RECIBIDO: 10,
    ENVIADO_IMPRESO: 11,
    ENVIADO_ENTREGADO: 12,
    // Columnas NUEVAS (se agregan automáticamente)
    ID_SOLICITUD: 13,
    PROFESOR: 14,
    AREA: 15,
    MATERIA: 16,
    TIPO_IMPRESION: 17,
    TIPO_HOJA: 18,
    NUM_HOJAS: 19,
    TIPO_DOCUMENTO: 20,
    NOMBRE_RECIBE: 21,
    FECHA_ENTREGA: 22,
    OBSERVACIONES: 23
  }
};

// ============================================
// ENTRY POINT — WEB APP
// ============================================
function doGet(e) {
  // ── MODO API (payload presente) ──────────────
  if (e && e.parameter && e.parameter.payload) {
    let resultado;
    try {
      const params = JSON.parse(decodeURIComponent(e.parameter.payload));
      resultado = despachar(params);
    } catch (err) {
      Logger.log("doGet error: " + err.toString());
      resultado = { error: err.toString() };
    }

    // ── JSONP: si viene ?callback=xxx, envolver la respuesta ──
    //    Esto elimina los errores CORS al abrir desde Live Server / localhost.
    //    Los <script> tags no tienen restricciones de origen cruzado.
    if (e.parameter.callback) {
      const jsonpBody = e.parameter.callback + "(" + JSON.stringify(resultado) + ")";
      return ContentService
        .createTextOutput(jsonpBody)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    // Sin callback: respuesta JSON normal (producción desde GAS)
    return respuesta(resultado);
  }

  // ── MODO PÁGINA: servir el HTML ──────────────
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Biblioteca Goyavier")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    return respuesta(despachar(params));
  } catch (err) {
    Logger.log("doPost error: " + err.toString());
    return respuesta({ error: err.toString() });
  }
}

function despachar(params) {
  const accion = params.accion;
  switch (accion) {
    case "getDashboard":        return getDashboard();
    case "getSolicitudes":      return getSolicitudes(params);
    case "actualizarEstado":    return actualizarEstado(params);
    case "guardarEntrega":      return guardarEntrega(params);
    case "getSolicitudDetalle": return getSolicitudDetalle(params.fila);
    case "editarSolicitud":     return editarSolicitud(params);
    case "sincronizarCorreos":  return sincronizarCorreos(params);
    default:                    return { error: "Acción no reconocida: " + accion };
  }
}

function respuesta(datos) {
  return ContentService
    .createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// DASHBOARD
// ============================================
// FIXES:
//   1. Comparaciones con .includes() en lugar de === para emojis
//      (el carácter de variación U+FE0F de 🖨️ puede perderse en Sheets)
//   2. Tarjetas del dashboard filtradas al MES ACTUAL
//   3. Badge sidebar usa pendientes TOTALES (operacionales, sin filtro de fecha)
// ============================================
function getDashboard() {
  const sheet = obtenerHoja();
  const ultimaFila = sheet.getLastRow();

  if (ultimaFila < 2) {
    return {
      pendientesImprimir: 0,
      pendientesEntregar: 0,
      entregadas: 0,
      totalHojasMes: 0,
      totalSolicitudesMes: 0,
      // Operacionales (todos los pendientes sin importar fecha → badge sidebar)
      opPendientesImprimir: 0,
      opPendientesEntregar: 0
    };
  }

  const datos = sheet.getRange(2, 1, ultimaFila - 1, 23).getValues();
  const hoy   = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  // Último instante del día de hoy
  const finHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

  // Contadores MES (para las tarjetas del dashboard)
  let pendientesImprimir  = 0;
  let pendientesEntregar  = 0;
  let entregadas          = 0;
  let totalHojasMes       = 0;
  let totalSolicitudesMes = 0;

  // Contadores OPERACIONALES — todos los pendientes sin filtro de fecha
  // (se usa para el badge del sidebar y alertas)
  let opPendientesImprimir = 0;
  let opPendientesEntregar = 0;

  for (let i = 0; i < datos.length; i++) {
    // FIX: usar .includes() para evitar fallo por U+FE0F en emojis de Sheets
    const estado   = String(datos[i][APP_CONFIG.COL.ESTADO - 1] || "");
    const numHojas = parseInt(datos[i][APP_CONFIG.COL.NUM_HOJAS - 1]) || 0;
    const fecha    = datos[i][APP_CONFIG.COL.FECHA - 1];

    const esRecibido  = estado.includes("Recibido");
    const esImpreso   = estado.includes("Impreso");
    const esEntregado = estado.includes("Entregado");

    // ── Operacionales (sin filtro de fecha) ────────────────
    if (esRecibido) opPendientesImprimir++;
    if (esImpreso)  opPendientesEntregar++;

    // ── Solo si es del mes actual ──────────────────────────
    const esMesActual = fecha instanceof Date
      && fecha >= primerDiaMes
      && fecha <= finHoy;

    if (esMesActual) {
      if (esRecibido)  pendientesImprimir++;
      if (esImpreso)   pendientesEntregar++;
      if (esEntregado) entregadas++;
      totalHojasMes += numHojas;
      totalSolicitudesMes++;
    }
  }

  return {
    // Tarjetas dashboard → mes actual
    pendientesImprimir,
    pendientesEntregar,
    entregadas,
    totalHojasMes,
    totalSolicitudesMes,
    // Badge sidebar → operacionales totales
    opPendientesImprimir,
    opPendientesEntregar
  };
}

// ============================================
// LEER SOLICITUDES (con filtro de mes)
// ============================================
// params.mes: 0-based month number (default = mes actual)
// params.ano: 4-digit year (default = año actual)
// params.soloMes: si true, filtra estrictamente al mes/año dado
// ============================================
function getSolicitudes(params) {
  const sheet = obtenerHoja();
  const ultimaFila = sheet.getLastRow();

  if (ultimaFila < 2) return { solicitudes: [] };

  asegurarEncabezadosNuevos(sheet);

  const datos = sheet.getRange(2, 1, ultimaFila - 1, 23).getValues();
  const solicitudes = [];

  const filtroEstado = params && params.filtroEstado ? String(params.filtroEstado) : "";
  const filtroBuscar = params && params.buscar       ? String(params.buscar).toLowerCase() : "";

  // Filtro de mes/año: por defecto mes actual
  const hoy = new Date();
  const mesTarget = (params && params.mes !== undefined && params.mes !== null)
    ? parseInt(params.mes) : hoy.getMonth();
  const anoTarget = (params && params.ano !== undefined && params.ano !== null)
    ? parseInt(params.ano) : hoy.getFullYear();

  const primerDiaMes = new Date(anoTarget, mesTarget, 1);
  const primerDiaSig = new Date(anoTarget, mesTarget + 1, 1);

  for (let i = 0; i < datos.length; i++) {
    const fila = i + 2;
    const row  = datos[i];

    // Filtrar al mes/año objetivo
    const fechaFila = row[APP_CONFIG.COL.FECHA - 1];
    if (!(fechaFila instanceof Date)) continue;
    if (fechaFila < primerDiaMes || fechaFila >= primerDiaSig) continue;

    // FIX: usar .includes() para comparar estados con emojis
    const estado    = String(row[APP_CONFIG.COL.ESTADO - 1]       || "");
    const profesor  = String(row[APP_CONFIG.COL.PROFESOR - 1]     || "");
    const asunto    = String(row[APP_CONFIG.COL.ASUNTO - 1]       || "");
    const remitente = String(row[APP_CONFIG.COL.REMITENTE - 1]    || "");
    const idSol     = String(row[APP_CONFIG.COL.ID_SOLICITUD - 1] || "");

    // FIX: filtroEstado con .includes() para robustez con emojis
    if (filtroEstado && !estado.includes(filtroEstado)) continue;
    if (filtroBuscar) {
      const hayCoincidencia =
        profesor.toLowerCase().includes(filtroBuscar)  ||
        asunto.toLowerCase().includes(filtroBuscar)    ||
        remitente.toLowerCase().includes(filtroBuscar) ||
        idSol.toLowerCase().includes(filtroBuscar);
      if (!hayCoincidencia) continue;
    }

    const fecha = row[0];
    let fechaStr = "";
    if (fecha instanceof Date) {
      fechaStr = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    } else {
      fechaStr = String(fecha || "");
    }

    const fechaEntregaRaw = row[APP_CONFIG.COL.FECHA_ENTREGA - 1];
    let fechaEntregaStr = "";
    if (fechaEntregaRaw instanceof Date) {
      fechaEntregaStr = Utilities.formatDate(fechaEntregaRaw, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    }

    solicitudes.push({
      fila,
      fecha:            fechaStr,
      remitente,
      asunto,
      estado,
      carpetaLink:      String(row[APP_CONFIG.COL.CARPETA - 1]        || ""),
      numAdjuntos:      parseInt(row[APP_CONFIG.COL.NUM_ADJUNTOS - 1])|| 0,
      emailDestino:     String(row[APP_CONFIG.COL.EMAIL_DESTINO - 1]  || remitente || ""),
      idSolicitud:      idSol,
      profesor,
      area:             String(row[APP_CONFIG.COL.AREA - 1]           || ""),
      materia:          String(row[APP_CONFIG.COL.MATERIA - 1]        || ""),
      tipoImpresion:    String(row[APP_CONFIG.COL.TIPO_IMPRESION - 1] || ""),
      tipoHoja:         String(row[APP_CONFIG.COL.TIPO_HOJA - 1]      || ""),
      numHojas:         parseInt(row[APP_CONFIG.COL.NUM_HOJAS - 1])   || 0,
      tipoDocumento:    String(row[APP_CONFIG.COL.TIPO_DOCUMENTO - 1] || ""),
      nombreRecibe:     String(row[APP_CONFIG.COL.NOMBRE_RECIBE - 1]  || ""),
      fechaEntrega:     fechaEntregaStr,
      observaciones:    String(row[APP_CONFIG.COL.OBSERVACIONES - 1]  || ""),
      enviadoRecibido:  String(row[APP_CONFIG.COL.ENVIADO_RECIBIDO - 1]  || ""),
      enviadoImpreso:   String(row[APP_CONFIG.COL.ENVIADO_IMPRESO - 1]   || ""),
      enviadoEntregado: String(row[APP_CONFIG.COL.ENVIADO_ENTREGADO - 1] || ""),
    });
  }

  solicitudes.reverse();
  return { solicitudes, mes: mesTarget, ano: anoTarget };
}

// ============================================
// DETALLE DE UNA FILA
// ============================================
function getSolicitudDetalle(fila) {
  if (!fila || fila < 2) throw new Error("Fila inválida");

  const sheet = obtenerHoja();
  const row   = sheet.getRange(fila, 1, 1, 23).getValues()[0];

  const fecha = row[0];
  let fechaStr = "";
  if (fecha instanceof Date) {
    fechaStr = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  }

  return {
    fila,
    fecha:         fechaStr,
    remitente:     String(row[APP_CONFIG.COL.REMITENTE - 1]     || ""),
    asunto:        String(row[APP_CONFIG.COL.ASUNTO - 1]        || ""),
    cuerpo:        String(row[APP_CONFIG.COL.CUERPO - 1]        || ""),
    estado:        String(row[APP_CONFIG.COL.ESTADO - 1]        || ""),
    carpetaLink:   String(row[APP_CONFIG.COL.CARPETA - 1]       || ""),
    numAdjuntos:   parseInt(row[APP_CONFIG.COL.NUM_ADJUNTOS - 1])|| 0,
    idSolicitud:   String(row[APP_CONFIG.COL.ID_SOLICITUD - 1]  || ""),
    emailDestino:  String(row[APP_CONFIG.COL.EMAIL_DESTINO - 1] || row[APP_CONFIG.COL.REMITENTE - 1] || ""),
    profesor:      String(row[APP_CONFIG.COL.PROFESOR - 1]      || ""),
    area:          String(row[APP_CONFIG.COL.AREA - 1]          || ""),
    materia:       String(row[APP_CONFIG.COL.MATERIA - 1]       || ""),
    tipoImpresion: String(row[APP_CONFIG.COL.TIPO_IMPRESION - 1]|| ""),
    tipoHoja:      String(row[APP_CONFIG.COL.TIPO_HOJA - 1]     || ""),
    numHojas:      parseInt(row[APP_CONFIG.COL.NUM_HOJAS - 1])  || 0,
    tipoDocumento: String(row[APP_CONFIG.COL.TIPO_DOCUMENTO - 1]|| ""),
    nombreRecibe:  String(row[APP_CONFIG.COL.NOMBRE_RECIBE - 1] || ""),
    observaciones: String(row[APP_CONFIG.COL.OBSERVACIONES - 1] || ""),
  };
}

// ============================================
// EDITAR CAMPOS DE UNA SOLICITUD (SIN CAMBIAR ESTADO)
// ============================================
function editarSolicitud(params) {
  const { fila, profesor, area, materia, tipoImpresion,
          tipoHoja, numHojas, tipoDocumento, observaciones } = params;

  if (!fila) throw new Error("Fila no especificada");

  const sheet = obtenerHoja();

  const updates = {
    [APP_CONFIG.COL.PROFESOR]:       profesor      || "",
    [APP_CONFIG.COL.AREA]:           area          || "",
    [APP_CONFIG.COL.MATERIA]:        materia       || "",
    [APP_CONFIG.COL.TIPO_IMPRESION]: tipoImpresion || "",
    [APP_CONFIG.COL.TIPO_HOJA]:      tipoHoja      || "",
    [APP_CONFIG.COL.NUM_HOJAS]:      parseInt(numHojas) || 0,
    [APP_CONFIG.COL.TIPO_DOCUMENTO]: tipoDocumento || "",
    [APP_CONFIG.COL.OBSERVACIONES]:  observaciones || "",
  };

  for (const col in updates) {
    sheet.getRange(fila, parseInt(col)).setValue(updates[col]);
  }

  SpreadsheetApp.flush();
  return { ok: true };
}

// ============================================
// ACTUALIZAR ESTADO: RECIBIDO o IMPRESO
// ============================================
function actualizarEstado(params) {
  const { fila, nuevoEstado, accion } = params;

  if (!fila || !nuevoEstado) throw new Error("Parámetros inválidos");

  const sheet   = obtenerHoja();
  const rowData = sheet.getRange(fila, 1, 1, 23).getValues()[0];
  const estadoActual = String(rowData[APP_CONFIG.COL.ESTADO - 1] || "");

  // FIX: .includes() para no fallar por variantes de emoji en Sheets
  if (accion === "marcarImpreso" && !estadoActual.includes("Recibido")) {
    throw new Error("Solo se puede marcar Impreso si el estado actual es Recibido. Estado actual: " + estadoActual);
  }

  let idSolicitud = String(rowData[APP_CONFIG.COL.ID_SOLICITUD - 1] || "");
  if (!idSolicitud && accion === "marcarRecibido") {
    idSolicitud = generarIdSolicitud(sheet);
    sheet.getRange(fila, APP_CONFIG.COL.ID_SOLICITUD).setValue(idSolicitud);
  }

  sheet.getRange(fila, APP_CONFIG.COL.ESTADO).setValue(nuevoEstado);

  const destinatario = String(rowData[APP_CONFIG.COL.EMAIL_DESTINO - 1] || rowData[APP_CONFIG.COL.REMITENTE - 1] || "");
  const datosCorreo = {
    destinatario,
    asunto:     String(rowData[APP_CONFIG.COL.ASUNTO - 1]   || ""),
    idSolicitud,
    profesor:   String(rowData[APP_CONFIG.COL.PROFESOR - 1] || ""),
    numHojas:   parseInt(rowData[APP_CONFIG.COL.NUM_HOJAS - 1]) || 0,
  };

  if (accion === "marcarRecibido") {
    if (enviarCorreoRecibido(datosCorreo)) {
      sheet.getRange(fila, APP_CONFIG.COL.ENVIADO_RECIBIDO).setValue("✅ " + fechaHoraActual());
    }
  } else if (accion === "marcarImpreso") {
    if (enviarCorreoImpreso(datosCorreo)) {
      sheet.getRange(fila, APP_CONFIG.COL.ENVIADO_IMPRESO).setValue("✅ " + fechaHoraActual());
    }
  }

  SpreadsheetApp.flush();
  return { ok: true, idSolicitud, nuevoEstado };
}

// ============================================
// GUARDAR ENTREGA COMPLETA
// ============================================
function guardarEntrega(params) {
  const { fila, profesor, area, materia, tipoImpresion, tipoHoja,
          numHojas, tipoDocumento, nombreRecibe, observaciones } = params;

  if (!fila)         throw new Error("Fila no especificada");
  if (!nombreRecibe) throw new Error("El nombre de quien recibe es obligatorio");
  if (!profesor)     throw new Error("El nombre del profesor es obligatorio");

  const sheet    = obtenerHoja();
  const rowData  = sheet.getRange(fila, 1, 1, 23).getValues()[0];
  const estadoActual = String(rowData[APP_CONFIG.COL.ESTADO - 1] || "");

  // FIX: .includes() para robustez con emojis
  if (!estadoActual.includes("Impreso")) {
    throw new Error("Solo se puede entregar si el estado es Impreso. Estado actual: " + estadoActual);
  }

  const ahora = new Date();

  const updates = {
    [APP_CONFIG.COL.PROFESOR]:       profesor      || "",
    [APP_CONFIG.COL.AREA]:           area          || "",
    [APP_CONFIG.COL.MATERIA]:        materia       || "",
    [APP_CONFIG.COL.TIPO_IMPRESION]: tipoImpresion || "",
    [APP_CONFIG.COL.TIPO_HOJA]:      tipoHoja      || "",
    [APP_CONFIG.COL.NUM_HOJAS]:      parseInt(numHojas) || 0,
    [APP_CONFIG.COL.TIPO_DOCUMENTO]: tipoDocumento || "",
    [APP_CONFIG.COL.NOMBRE_RECIBE]:  nombreRecibe,
    [APP_CONFIG.COL.FECHA_ENTREGA]:  ahora,
    [APP_CONFIG.COL.OBSERVACIONES]:  observaciones || "",
    [APP_CONFIG.COL.ESTADO]:         "📦 Entregado",
  };

  for (const col in updates) {
    sheet.getRange(fila, parseInt(col)).setValue(updates[col]);
  }

  const idSolicitud  = String(rowData[APP_CONFIG.COL.ID_SOLICITUD - 1] || "");
  const destinatario = String(rowData[APP_CONFIG.COL.EMAIL_DESTINO - 1] || rowData[APP_CONFIG.COL.REMITENTE - 1] || "");

  const datosCorreo = {
    destinatario,
    asunto:        String(rowData[APP_CONFIG.COL.ASUNTO - 1] || ""),
    idSolicitud,
    profesor:      profesor      || "",
    materia:       materia       || "",
    numHojas:      parseInt(numHojas) || 0,
    tipoImpresion: tipoImpresion || "",
    tipoHoja:      tipoHoja      || "",
    nombreRecibe,
    observaciones: observaciones || "",
    fechaEntrega:  Utilities.formatDate(ahora, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"),
  };

  if (enviarCorreoEntregado(datosCorreo)) {
    sheet.getRange(fila, APP_CONFIG.COL.ENVIADO_ENTREGADO).setValue("✅ " + fechaHoraActual());
  }

  SpreadsheetApp.flush();
  return { ok: true };
}

// ============================================
// ENVÍO DE CORREOS
// ============================================
function enviarCorreoRecibido(datos) {
  try {
    if (!validarEmail(datos.destinatario)) {
      Logger.log("Email inválido para correo Recibido: " + datos.destinatario);
      return false;
    }

    const asunto = "📥 Solicitud recibida — " + (datos.idSolicitud || datos.asunto);
    const cuerpo =
      "¡Hola! 👋\n\n" +
      "Hemos recibido correctamente tu solicitud de impresión.\n\n" +
      "📋 Referencia: " + (datos.idSolicitud || "—") + "\n" +
      "📄 Asunto: " + datos.asunto + "\n" +
      (datos.profesor ? "👤 Profesor: " + datos.profesor + "\n" : "") +
      "\n" +
      "⏱️ El tiempo estimado es de hasta 3 días hábiles.\n" +
      "Te avisaremos cuando esté lista para recoger.\n\n" +
      "🕐 HORARIO DE ENTREGA:\n" +
      "Lunes a Viernes\n" +
      "9:00 AM – 11:00 AM  |  1:30 PM – 3:00 PM\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "📚 BIBLIOTECA — Colegio Goyavier\n" +
      "¿Tienes alguna pregunta? Responde este correo.";

    GmailApp.sendEmail(datos.destinatario, asunto, cuerpo);
    return true;
  } catch (e) {
    Logger.log("Error enviarCorreoRecibido: " + e.toString());
    return false;
  }
}

function enviarCorreoImpreso(datos) {
  try {
    if (!validarEmail(datos.destinatario)) {
      Logger.log("Email inválido para correo Impreso: " + datos.destinatario);
      return false;
    }

    const asunto = "🖨️ ¡Tu impresión está lista! — " + (datos.idSolicitud || datos.asunto);
    const cuerpo =
      "¡Buenas noticias! 🎉\n\n" +
      "Tu solicitud de impresión ya está lista y esperándote.\n\n" +
      "📋 Referencia: " + (datos.idSolicitud || "—") + "\n" +
      "📄 Asunto: " + datos.asunto + "\n" +
      (datos.profesor ? "👤 Profesor: " + datos.profesor + "\n" : "") +
      (datos.numHojas ? "📃 Hojas: " + datos.numHojas + "\n" : "") +
      "\n" +
      "📍 Pasa por la BIBLIOTECA a recogerla.\n\n" +
      "🕐 HORARIO:\n" +
      "Lunes a Viernes\n" +
      "9:00 AM – 11:00 AM  |  1:30 PM – 3:00 PM\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "📚 BIBLIOTECA — Colegio Goyavier\n" +
      "¿Tienes alguna pregunta? Responde este correo.";

    GmailApp.sendEmail(datos.destinatario, asunto, cuerpo);
    return true;
  } catch (e) {
    Logger.log("Error enviarCorreoImpreso: " + e.toString());
    return false;
  }
}

function enviarCorreoEntregado(datos) {
  try {
    if (!validarEmail(datos.destinatario)) {
      Logger.log("Email inválido para correo Entregado: " + datos.destinatario);
      return false;
    }

    const asunto = "✅ Impresión entregada — " + (datos.idSolicitud || datos.asunto);
    const cuerpo =
      "¡Todo listo! ✅\n\n" +
      "Tu impresión fue entregada exitosamente.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "📋 Referencia: " + (datos.idSolicitud || "—") + "\n" +
      "👤 Recibió: " + datos.nombreRecibe + "\n" +
      "📅 Fecha de entrega: " + datos.fechaEntrega + "\n" +
      "📚 Materia: " + (datos.materia || "—") + "\n" +
      "🖨️ Tipo: " + (datos.tipoImpresion || "—") + " en " + (datos.tipoHoja || "—") + "\n" +
      "📃 Hojas: " + datos.numHojas + "\n" +
      (datos.observaciones ? "💬 Observaciones: " + datos.observaciones + "\n" : "") +
      "━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Gracias por usar el servicio de la biblioteca. 😊\n\n" +
      "📚 BIBLIOTECA — Colegio Goyavier\n" +
      "¿Tienes alguna pregunta? Responde este correo.";

    GmailApp.sendEmail(datos.destinatario, asunto, cuerpo);
    return true;
  } catch (e) {
    Logger.log("Error enviarCorreoEntregado: " + e.toString());
    return false;
  }
}

// ============================================
// SINCRONIZAR CORREOS DESDE GMAIL
// ============================================
// Lee Gmail del mes/año indicado, filtra por lista
// blanca de remitentes (Hoja2 col A), y agrega
// a "Correos Colegio" las filas que aún no existen
// (deduplicación por ID_MENSAJE col 7).
// ============================================
function sincronizarCorreos(params) {
  const hoy       = new Date();
  const mes       = (params && params.mes !== undefined) ? parseInt(params.mes) : hoy.getMonth();
  const ano       = (params && params.ano !== undefined) ? parseInt(params.ano) : hoy.getFullYear();

  // ── 1. Cargar lista blanca desde Hoja2 col A ──
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const hojaLista  = ss.getSheetByName("Hoja2");
  if (!hojaLista) throw new Error("No se encontró la hoja 'Hoja2' con la lista de correos.");

  const listaRaw   = hojaLista.getRange(1, 1, Math.max(hojaLista.getLastRow(), 1), 1).getValues();
  const listaBlanca = new Set();
  listaRaw.forEach(function(r) {
    const email = String(r[0] || "").trim().toLowerCase();
    if (email && email.indexOf("@") > -1) listaBlanca.add(email);
  });

  if (listaBlanca.size === 0) throw new Error("La lista de correos autorizados (Hoja2) está vacía.");

  // ── 2. Cargar IDs ya registrados en Sheets ────
  const sheet      = obtenerHoja();
  asegurarEncabezadosNuevos(sheet);
  const ultimaFila = sheet.getLastRow();

  const idsExistentes = new Set();
  if (ultimaFila >= 2) {
    const colIds = sheet.getRange(2, APP_CONFIG.COL.ID_MENSAJE, ultimaFila - 1, 1).getValues();
    colIds.forEach(function(r) {
      const id = String(r[0] || "").trim();
      if (id) idsExistentes.add(id);
    });
  }

  // ── 3. Buscar correos en Gmail del mes ────────
  // Rango: desde el primer día del mes hasta el último
  const primerDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);   // día 0 del mes siguiente = último del mes

  // Formato para query Gmail: after:YYYY/MM/DD before:YYYY/MM/DD
  function fmtGmail(d) {
    return d.getFullYear() + "/" +
           String(d.getMonth() + 1).padStart(2, "0") + "/" +
           String(d.getDate()).padStart(2, "0");
  }

  // after es inclusivo, before es exclusivo → sumar 1 día al último
  const despuesUltimo = new Date(ano, mes + 1, 1);
  const query = "in:inbox after:" + fmtGmail(primerDia) + " before:" + fmtGmail(despuesUltimo);

  const threads = GmailApp.search(query, 0, 500);  // máx 500 threads por mes

  let agregados   = 0;
  let omitidos    = 0;   // ya existían
  let rechazados  = 0;   // no están en lista blanca

  const filasNuevas = [];

  for (var t = 0; t < threads.length; t++) {
    const mensajes = threads[t].getMessages();

    for (var m = 0; m < mensajes.length; m++) {
      const msg       = mensajes[m];
      const msgId     = msg.getId();

      // Deduplicar
      if (idsExistentes.has(msgId)) { omitidos++; continue; }

      // Fecha del mensaje
      const fechaMsg  = msg.getDate();
      // Verificar que esté dentro del mes (el thread puede tener mensajes de otros meses)
      if (fechaMsg < primerDia || fechaMsg >= despuesUltimo) continue;

      // Filtrar por lista blanca
      const remitenteRaw = msg.getFrom();                          // "Nombre <email>" o solo "email"
      const emailMatch   = remitenteRaw.match(/<([^>]+)>/);
      const emailRemit   = emailMatch
        ? emailMatch[1].trim().toLowerCase()
        : remitenteRaw.trim().toLowerCase();

      if (!listaBlanca.has(emailRemit)) { rechazados++; continue; }

      // Buscar carpeta Drive asociada (por nombre del asunto o ID mensaje)
      // Ya las crea otro script → buscamos por ID del mensaje en Drive
      var carpetaLink = "";
      try {
        var archivos = DriveApp.searchFiles("title contains '" + msgId + "'");
        if (archivos.hasNext()) {
          var f = archivos.next();
          carpetaLink = f.getUrl();
        }
        // Si no hay por ID, buscar carpeta con el mismo asunto
        if (!carpetaLink) {
          var asuntoCorto = msg.getSubject().substring(0, 40).replace(/'/g, " ");
          var carpetas = DriveApp.searchFolders("title contains '" + asuntoCorto + "' and trashed = false");
          if (carpetas.hasNext()) {
            carpetaLink = carpetas.next().getUrl();
          }
        }
      } catch(e) {
        Logger.log("No se pudo buscar carpeta Drive: " + e.toString());
      }

      // Extraer email destino (primer Reply-To o To que no sea la biblioteca)
      var emailDestino = "";
      try {
        var toField = msg.getTo();
        // Puede ser lista: "a@x.com, b@x.com"
        var toList = toField.split(",");
        for (var i = 0; i < toList.length; i++) {
          var addr = toList[i].trim();
          var addrMatch = addr.match(/<([^>]+)>/);
          var addrEmail = addrMatch ? addrMatch[1].trim() : addr;
          if (addrEmail && addrEmail.toLowerCase() !== APP_CONFIG.EMAIL_BIBLIOTECA.toLowerCase()) {
            emailDestino = addrEmail;
            break;
          }
        }
        if (!emailDestino) emailDestino = emailRemit;
      } catch(e) {
        emailDestino = emailRemit;
      }

      // Construir fila nueva (23 columnas, estado vacío = sin estado)
      var nuevaFila = new Array(23).fill("");
      nuevaFila[APP_CONFIG.COL.FECHA        - 1] = fechaMsg;
      nuevaFila[APP_CONFIG.COL.REMITENTE    - 1] = remitenteRaw;
      nuevaFila[APP_CONFIG.COL.ASUNTO       - 1] = msg.getSubject()       || "(sin asunto)";
      nuevaFila[APP_CONFIG.COL.CUERPO       - 1] = msg.getPlainBody().substring(0, 500);
      nuevaFila[APP_CONFIG.COL.NUM_ADJUNTOS - 1] = msg.getAttachments().length;
      nuevaFila[APP_CONFIG.COL.CARPETA      - 1] = carpetaLink;
      nuevaFila[APP_CONFIG.COL.ID_MENSAJE   - 1] = msgId;
      nuevaFila[APP_CONFIG.COL.EMAIL_DESTINO- 1] = emailDestino;
      nuevaFila[APP_CONFIG.COL.ESTADO       - 1] = "";   // Sin estado → aparece para gestionar

      filasNuevas.push(nuevaFila);
      idsExistentes.add(msgId);   // evitar duplicado si el mismo ID aparece en otro thread
      agregados++;
    }
  }

  // ── 4. Escribir todas las filas nuevas de una vez ──
  if (filasNuevas.length > 0) {
    // Ordenar por fecha ascendente antes de insertar
    filasNuevas.sort(function(a, b) {
      return new Date(a[0]) - new Date(b[0]);
    });
    const primeraFilaLibre = sheet.getLastRow() + 1;
    sheet.getRange(primeraFilaLibre, 1, filasNuevas.length, 23).setValues(filasNuevas);
    SpreadsheetApp.flush();
  }

  return {
    ok:         true,
    agregados,
    omitidos,
    rechazados,
    mes,
    ano,
    totalFiltrados: listaBlanca.size
  };
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function obtenerHoja() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(APP_CONFIG.NOMBRE_HOJA);
  if (!hoja) throw new Error("Hoja '" + APP_CONFIG.NOMBRE_HOJA + "' no encontrada.");
  return hoja;
}

function generarIdSolicitud(sheet) {
  const ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return "COP-0001";

  const ids = sheet.getRange(2, APP_CONFIG.COL.ID_SOLICITUD, ultimaFila - 1, 1).getValues();
  let max = 0;

  for (let i = 0; i < ids.length; i++) {
    const id    = String(ids[i][0] || "");
    const match = id.match(/COP-(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (num > max) max = num;
    }
  }

  return "COP-" + String(max + 1).padStart(4, "0");
}

function asegurarEncabezadosNuevos(sheet) {
  const maxCols     = Math.max(sheet.getLastColumn(), 23);
  const encabezados = sheet.getRange(1, 1, 1, maxCols).getValues()[0];

  const nuevos = {
    13: "ID Solicitud",
    14: "Profesor",
    15: "Área",
    16: "Materia",
    17: "Tipo Impresión",
    18: "Tipo Hoja",
    19: "Nº Hojas",
    20: "Tipo Documento",
    21: "Nombre quien recibe",
    22: "Fecha Entrega",
    23: "Observaciones"
  };

  for (const col in nuevos) {
    const idx = parseInt(col) - 1;
    if (!encabezados[idx] || encabezados[idx] === "") {
      sheet.getRange(1, parseInt(col)).setValue(nuevos[col]);
    }
  }
}

function fechaHoraActual() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yy HH:mm");
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
