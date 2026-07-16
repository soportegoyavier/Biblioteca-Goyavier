// ============================================================
// BIBLIOTECA GOYAVIER — GAS Slim v3.0
// Solo hace 2 cosas que requieren Google OAuth:
//   1. Leer Gmail y sincronizar a Supabase
//   2. Enviar correos DESDE la cuenta de Biblioteca
//
// Todo lo demás (CRUD, dashboard, auth) va directo a Supabase
// desde el frontend.
//
// CONFIGURACIÓN REQUERIDA (Script Properties):
//   SUPABASE_URL  → https://xmondkilgkesaqaspmfq.supabase.co
//   SUPABASE_KEY  → service_role key (nunca en el HTML)
// ============================================================

// ── Leer config de Script Properties (más seguro que hardcodear) ──
function _cfg(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

// ── Único correo autorizado a operar la app y a llamar este backend ──
var CORREO_AUTORIZADO = 'biblioteca@colegiogoyavier.edu.co';

// Valida el access_token de la sesión de Supabase Auth contra el propio
// Supabase (no es un secreto estatico: es el JWT real de quien esta
// logueado en el frontend, verificado en cada llamada). Sin esto, la URL
// de este Web App (visible en js/config.js) permite a cualquiera con el
// enlace ejecutar acciones como eliminarSolicitud o enviarCorreo sin login.
function _emailDeSesion(token) {
  if (!token) return null;
  var url = _cfg('SUPABASE_URL'), key = _cfg('SUPABASE_KEY');
  if (!url || !key) return null;
  try {
    var res = UrlFetchApp.fetch(url + '/auth/v1/user', {
      headers: { apikey: key, Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    var user = JSON.parse(res.getContentText());
    return user && user.email ? user.email.toLowerCase() : null;
  } catch (e) {
    return null;
  }
}

// ============================================================
// ENTRY POINT
// ============================================================
function doGet(e) {
  if (e && e.parameter && e.parameter.accion === 'confirmarRecepcion' && e.parameter.sid) {
    return _paginaConfirmacion(e.parameter.sid, 'bib_solicitudes', 'las copias');
  }
  if (e && e.parameter && e.parameter.accion === 'confirmarRecepcionMaterial' && e.parameter.sid) {
    return _paginaConfirmacion(e.parameter.sid, 'bib_movimientos', 'el material');
  }
  if (e && e.parameter && e.parameter.accion === 'confirmarRecepcionLibro' && e.parameter.sid) {
    return _paginaConfirmacion(e.parameter.sid, 'bib_prestamos_libros', 'el libro');
  }
  if (e && e.parameter && e.parameter.accion === 'confirmarRecepcionTrabajo' && e.parameter.sid) {
    return _paginaConfirmacion(e.parameter.sid, 'bib_trabajos_impresion', 'tus copias');
  }

  if (e && e.parameter && e.parameter.payload) {
    var resultado;
    try {
      var params = JSON.parse(decodeURIComponent(e.parameter.payload));
      resultado = despachar(params);
    } catch (err) {
      resultado = { error: err.toString() };
    }

    // JSONP: permite llamadas desde cualquier origen sin CORS
    if (e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + "(" + JSON.stringify(resultado) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput("Biblioteca Goyavier GAS v3.0 — OK");
}

function despachar(p) {
  var email = _emailDeSesion(p.token);
  if (email !== CORREO_AUTORIZADO) {
    return { error: 'No autorizado' };
  }
  switch (p.accion) {
    case "sincronizarCorreos":     return sincronizarCorreos(p);
    case "enviarCorreo":           return _enviarCorreoConReintento(p);
    case "estadoAutomatizacion":   return _estadoAutomatizacion();
    case "ejecutarReconciliacion": return _ejecutarReconciliacionManual();
    case "reprocesarCorreoManual": return reprocesarCorreo(p.gmailMsgId);
    case "reprocesarDesdeManual":  return reprocesarDesde(p.fecha);
    case "reintentarCorreoFallido": return _reintentarCorreoFallido(p.id);
    case "generarReporteManual":   return _exportarMes(parseInt(p.ano), parseInt(p.mes));
    case "eliminarSolicitud":      return _eliminarSolicitud(p.id, p.motivo);
    case "archivarAdjuntosAntiguos": return archivarAdjuntosAntiguos();
    case "responderCorreo":        return _responderCorreo(p.gmailMessageId, p.mensaje);
    default: return { error: "Acción no reconocida: " + p.accion };
  }
}

// ── Centro de Salud (Fase 2): lo único que solo Apps Script puede ver
// sobre sí mismo — qué triggers existen y bajo qué cuenta corre. NO
// incluye ejecuciones fallidas/en curso: eso requiere habilitar la
// Apps Script API de Google Cloud con OAuth aparte, deliberadamente
// fuera de alcance de esta fase (ver propuesta original).
function _estadoAutomatizacion() {
  try {
    var triggers = ScriptApp.getProjectTriggers().map(function(t) {
      return { funcion: t.getHandlerFunction(), tipo: t.getEventType().toString() };
    });
    return { ok: true, triggers: triggers, cuentaGAS: Session.getEffectiveUser().getEmail() };
  } catch(e) {
    return { ok: false, error: e.toString() };
  }
}

function _paginaConfirmacion(sid, tabla, descripcion) {
  tabla = tabla || 'bib_solicitudes';
  descripcion = descripcion || 'las copias';
  var url = _cfg("SUPABASE_URL");
  var key = _cfg("SUPABASE_KEY");
  var contenido = '';

  if (!url || !key || !sid) {
    contenido = '<h2 style="color:#dc3545;margin-bottom:12px">⚠ Enlace inválido</h2>' +
      '<p style="color:#555;font-size:15px">Este enlace no es válido.<br>Comunícate con la biblioteca si tienes dudas.</p>';
  } else {
    try {
      // Verificar si ya fue confirmado antes de actualizar
      var actual = sbGet(url, key, tabla + "?id=eq." + encodeURIComponent(sid) + "&select=recepcion_confirmada,recepcion_confirmada_en");
      if (Array.isArray(actual) && actual.length > 0 && actual[0].recepcion_confirmada === true) {
        var fechaConf = actual[0].recepcion_confirmada_en
          ? new Date(actual[0].recepcion_confirmada_en).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' })
          : '';
        contenido = '<h2 style="color:#6f42c1;margin-bottom:12px">✓ Ya habías confirmado</h2>' +
          '<p style="color:#555;font-size:15px">Esta recepción ya fue confirmada' + (fechaConf ? ' el <strong>' + fechaConf + '</strong>' : '') + '.<br>No es necesario hacer nada más.</p>';
      } else {
        sbPatch(url, key,
          tabla + "?id=eq." + encodeURIComponent(sid),
          { recepcion_confirmada: true, recepcion_confirmada_en: new Date().toISOString() }
        );
        contenido = '<h2 style="color:#6f42c1;margin-bottom:12px">✓ ¡Recepción confirmada!</h2>' +
          '<p style="color:#555;font-size:15px">Gracias por confirmar.<br>La biblioteca ha registrado que recibiste ' + descripcion + '.</p>';
      }
    } catch(ex) {
      Logger.log("_paginaConfirmacion error: " + ex.toString());
      contenido = '<h2 style="color:#dc3545;margin-bottom:12px">⚠ No se pudo confirmar</h2>' +
        '<p style="color:#555;font-size:15px">Hubo un error al procesar tu confirmación.<br>Comunícate con la biblioteca si tienes dudas.</p>';
    }
  }

  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Biblioteca Goyavier</title></head>' +
    '<body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center;padding:20px">' +
    '<p style="color:#888;font-size:13px;margin-bottom:24px">Biblioteca — Colegio Goyavier</p>' +
    contenido +
    '</body></html>'
  );
}

// ============================================================
// SINCRONIZAR CORREOS GMAIL → SUPABASE  (v4 — optimizado)
//
// Optimizaciones aplicadas:
//   1. Setup paralelo: lista blanca + IDs existentes en un solo fetchAll
//   2. IDs limitados a ventana de 3 meses (no carga toda la historia)
//   3. Paginación por lotes: startOffset + maxMessages (8 por defecto)
//   4. Adjuntos: uno por uno, DELIBERADAMENTE secuencial (ver nota abajo)
//   5. Batch insert de solicitudes en un solo POST
//   6. Batch insert de documentos en un solo POST
//   7. maxMs se verifica de verdad dentro del bucle de adjuntos (corta el
//      lote a tiempo en vez de solo prometerlo en un comentario)
//
// Por que los adjuntos NO se paralelizan con UrlFetchApp.fetchAll:
// se probo antes y causo errores de memoria (OOM) al mantener varios
// archivos grandes en memoria a la vez para subirlos juntos — por eso
// el historial de commits lo volvio secuencial. Paralelizar de nuevo
// reintroduciria ese bug ya corregido. La mitigacion real del tiempo de
// ejecucion es el corte por maxMs (punto 7), no la paralelizacion.
// ============================================================
// Envoltorio con bloqueo: evita que dos ejecuciones de sincronizarCorreos
// corran en paralelo (dos personas sincronizando a la vez desde Copias y
// Ventas, o doble clic). Sin esto, ambas leerían el mismo snapshot de
// mensajes ya existentes antes de que ninguna insertara nada, pudiendo
// crear solicitudes duplicadas y pisarse el checkpoint de bib_sync_estado.
// ── Auditoría: eventos de proceso que un trigger de base de datos no
// puede ver (no son cambios de fila, o importan incluso cuando fallan
// antes de escribir nada). Nunca debe poder romper la operación que
// está registrando — de ahí el try/catch propio.
function _auditar(modulo, accion, resultado, gravedad, detalle, duracionMs) {
  try {
    var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
    if (!_url || !_key) return;
    sbPost(_url, _key, 'bib_auditoria', {
      usuario: 'sistema (GAS)', origen: 'gas', modulo: modulo, accion: accion,
      resultado: resultado || 'ok', gravedad: gravedad || 'info', detalle: detalle || null,
      duracion_ms: (duracionMs === undefined || duracionMs === null) ? null : duracionMs
    });
  } catch(e) {
    Logger.log('_auditar error (no crítico): ' + e.toString());
  }
}

function sincronizarCorreos(params) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return { ok: false, locked: true, error: "Ya hay una sincronización en curso. Intenta de nuevo en unos segundos." };
  }
  var t0 = Date.now();
  try {
    var res = _sincronizarCorreosImpl(params);
    var dur = Date.now() - t0;
    if (res && res.error) {
      _auditar('sincronizacion', 'sincronizar', 'error', 'error', res.error, dur);
    } else {
      _auditar('sincronizacion', 'sincronizar', 'ok', 'info',
        (res && res.agregados || 0) + ' nuevos, ' + (res && res.omitidos || 0) + ' omitidos, ' +
        (res && res.parcial ? 'parcial' : 'completo'), dur);
    }
    return res;
  } catch(e) {
    _auditar('sincronizacion', 'sincronizar', 'error', 'critico', e.toString(), Date.now() - t0);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function _sincronizarCorreosImpl(params) {
  var t0 = Date.now();
  var hoy = new Date();
  var mes         = (params && params.mes         !== undefined) ? parseInt(params.mes)         : hoy.getMonth();
  var ano         = (params && params.ano         !== undefined) ? parseInt(params.ano)         : hoy.getFullYear();
  var maxMs       = (params && params.maxMs       !== undefined) ? parseInt(params.maxMs)       : 22000;
  var startOffset = (params && params.startOffset !== undefined) ? parseInt(params.startOffset) : 0;
  var maxMessages = (params && params.maxMessages !== undefined) ? parseInt(params.maxMessages) : 8;

  var SUPABASE_URL = _cfg("SUPABASE_URL");
  var SUPABASE_KEY = _cfg("SUPABASE_KEY");
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { error: "Faltan SUPABASE_URL o SUPABASE_KEY en Script Properties." };
  }

  var primerDia    = new Date(ano, mes, 1);
  var primerDiaSig = new Date(ano, mes + 1, 1);
  // Fecha mínima de búsqueda: evita cargar histórico anterior al inicio del sistema
  if (params && params.fechaMinima) {
    var _fm = new Date(params.fechaMinima);
    if (!isNaN(_fm.getTime()) && _fm > primerDia) primerDia = _fm;
  }

  // ── 1. Lista blanca + IDs existentes en PARALELO ─────────────
  // IDs: solo últimos 3 meses (evita cargar toda la historia)
  var ventanaIds = new Date(ano, mes - 2, 1).toISOString();
  var setupReqs  = [
    {
      url: SUPABASE_URL + "/rest/v1/bib_remitentes_autorizados?select=email,tipo&activo=eq.true",
      method: "GET",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY },
      muteHttpExceptions: true
    },
    {
      url: SUPABASE_URL + "/rest/v1/bib_solicitudes?select=gmail_message_id&gmail_message_id=not.is.null&fecha_recepcion=gte." + ventanaIds,
      method: "GET",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY },
      muteHttpExceptions: true
    },
    {
      url: SUPABASE_URL + "/rest/v1/bib_mensajes_ignorados?select=gmail_message_id",
      method: "GET",
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY },
      muteHttpExceptions: true
    }
  ];
  var setupResp = UrlFetchApp.fetchAll(setupReqs);

  // Parsear lista blanca
  var listaBlanca = {};
  try {
    var rb = JSON.parse(setupResp[0].getContentText());
    if (!Array.isArray(rb)) return { error: "Error cargando remitentes: " + setupResp[0].getContentText().substring(0, 200) };
    rb.forEach(function(r) {
      var e = String(r.email || "").trim().toLowerCase();
      if (validarEmail(e)) listaBlanca[e] = r.tipo || "general";
    });
  } catch(ex) { return { error: "Parse remitentes: " + ex.toString() }; }

  if (!Object.keys(listaBlanca).length) {
    return { error: "Sin remitentes autorizados activos en bib_remitentes_autorizados." };
  }

  // Parsear IDs existentes
  var idsExistentes = {};
  try {
    var ri = JSON.parse(setupResp[1].getContentText());
    if (Array.isArray(ri)) ri.forEach(function(r) { if (r.gmail_message_id) idsExistentes[r.gmail_message_id] = true; });
  } catch(ex) { /* continúa sin dedup histórico */ }

  // Parsear mensajes ignorados (eliminados manualmente por el operador)
  var idsIgnorados = {};
  try {
    var rn = JSON.parse(setupResp[2].getContentText());
    if (Array.isArray(rn)) rn.forEach(function(r) { if (r.gmail_message_id) idsIgnorados[r.gmail_message_id] = true; });
  } catch(ex) { /* continúa sin lista de ignorados */ }

  // ── 2. Buscar threads (paginado) ──────────────────────────────
  function fmtGmail(d) {
    return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
  }

  var hoyNow      = new Date();
  var esMesActual = (mes === hoyNow.getMonth() && ano === hoyNow.getFullYear());
  var query;

  // Busca todo el correo recibido (no solo inbox) para capturar correos personales/externos
  // que pueden estar en etiquetas distintas a la bandeja de entrada
  var baseQuery = "-in:sent -in:trash -in:drafts";

  if (esMesActual) {
    var syncRes   = sbGet(SUPABASE_URL, SUPABASE_KEY, "bib_sync_estado?id=eq.1&select=ultimo_message_date");
    var ultimoChk = (Array.isArray(syncRes) && syncRes[0]) ? syncRes[0].ultimo_message_date : null;
    query = ultimoChk
      ? baseQuery + " after:" + fmtGmail(new Date(ultimoChk))
      : baseQuery + " after:" + fmtGmail(primerDia) + " before:" + fmtGmail(primerDiaSig);
  } else {
    query = baseQuery + " after:" + fmtGmail(primerDia) + " before:" + fmtGmail(primerDiaSig);
  }

  // Obtener solo el lote: startOffset..startOffset+maxMessages
  var threads    = GmailApp.search(query, startOffset, maxMessages + 2);
  var agregados  = 0;
  var omitidos   = 0;
  var rechazados = 0;
  var ultimaFecha = null;
  var emailBiblioteca = Session.getEffectiveUser().getEmail().toLowerCase();

  // ── 3. Recopilar mensajes nuevos del lote ─────────────────────
  var nuevos = []; // lista de mensajes a procesar
  var threadsVisto = 0;

  for (var t = 0; t < threads.length && threadsVisto < maxMessages; t++) {
    threadsVisto++;
    var msgs = threads[t].getMessages();
    for (var m = 0; m < msgs.length; m++) {
      var msg   = msgs[m];
      var msgId = msg.getId();
      if (idsExistentes[msgId] || idsIgnorados[msgId]) { omitidos++; continue; }

      var fechaMsg = msg.getDate();
      if (fechaMsg < primerDia || fechaMsg >= primerDiaSig) continue;
      if (!ultimaFecha || fechaMsg > ultimaFecha) ultimaFecha = fechaMsg;

      var remitenteRaw  = msg.getFrom();
      var emailMatch    = remitenteRaw.match(/<([^>]+)>/);
      var emailRemit    = emailMatch ? emailMatch[1].trim().toLowerCase() : remitenteRaw.trim().toLowerCase();
      // Clasificación automática: whitelist → institucional/general; resto → personal
      var tipoRemitente = listaBlanca[emailRemit] || 'personal';
      if (!listaBlanca[emailRemit]) rechazados++; // conteo informativo (no institucional)

      var emailDestino = _detectarEmailDestino(msg, emailRemit, emailBiblioteca);

      nuevos.push({ msg: msg, msgId: msgId, fechaMsg: fechaMsg, remitenteRaw: remitenteRaw,
                    emailRemit: emailRemit, tipoRemitente: tipoRemitente, emailDestino: emailDestino, threadIdx: t });
    }
  }

  var nextOffset = startOffset + threads.length;
  var hayMas     = threads.length >= maxMessages;

  if (!nuevos.length) {
    if (esMesActual && ultimaFecha) {
      sbPatch(SUPABASE_URL, SUPABASE_KEY, "bib_sync_estado?id=eq.1",
        { ultimo_sync_at: new Date().toISOString(), ultimo_message_date: ultimaFecha.toISOString() });
    }
    return { ok: true, agregados: 0, omitidos: omitidos, personal: rechazados, mes: mes, ano: ano, parcial: hayMas, nextOffset: nextOffset, ms: Date.now()-t0 };
  }

  // ── 4. Adjuntos: uno por uno para evitar OOM con archivos grandes ──
  // Presupuesto de tiempo real: si un lote con adjuntos pesados se acerca a
  // maxMs, se corta AQUI (antes de insertar nada) y se devuelve un nextOffset
  // que retoma desde el thread del primer mensaje no procesado — nunca se
  // pierde ni se duplica nada porque esos mensajes simplemente no entran a
  // "nuevos" en esta llamada y se re-detectan en la siguiente (idsExistentes
  // no los tiene todavia).
  var MAX_BYTES_SYNC = 40 * 1024 * 1024; // 40 MB por archivo (UrlFetchApp soporta hasta 50MB)
  var cortadoPorTiempo = false;
  var procesados = nuevos.length;
  for (var n = 0; n < nuevos.length; n++) {
    if (Date.now() - t0 > maxMs) {
      cortadoPorTiempo = true;
      procesados = n;
      break;
    }
    var item     = nuevos[n];
    // 1. Adjuntos MIME + Drive adjuntos con botón nativo de Gmail
    var adjuntos = item.msg.getAttachments({ includeGoogleDriveFiles: true, includeInlineImages: false });
    var itemDocs = _procesarAdjuntos(adjuntos, item.msgId, MAX_BYTES_SYNC, SUPABASE_URL, SUPABASE_KEY);
    // 2. Links Drive en el cuerpo HTML (archivos compartidos como enlace)
    var driveLinks = _extraerLinksDrive(item.msg.getBody());
    if (driveLinks.length) {
      itemDocs = itemDocs.concat(_procesarDriveLinks(driveLinks, item.msgId, MAX_BYTES_SYNC, SUPABASE_URL, SUPABASE_KEY));
    }
    item._docs = itemDocs;
  }

  if (cortadoPorTiempo) {
    var primerNoProcesado = nuevos[procesados];
    nextOffset = startOffset + primerNoProcesado.threadIdx;
    hayMas = true;
    nuevos = nuevos.slice(0, procesados);
    ultimaFecha = null; // el checkpoint no debe avanzar: quedaron mensajes de este mismo lote sin procesar
    Logger.log('Sync cortado por maxMs (' + maxMs + 'ms) en mensaje ' + procesados + '/' + (procesados + (nuevos.length - procesados)) + '. nextOffset=' + nextOffset);
    if (!nuevos.length) {
      return { ok: true, agregados: 0, omitidos: omitidos, personal: rechazados, mes: mes, ano: ano, parcial: true, nextOffset: nextOffset, ms: Date.now()-t0 };
    }
  }

  // ── 5. Insertar solicitudes en un único batch POST ────────────
  var solRows = nuevos.map(function(item) {
    return {
      gmail_message_id: item.msgId,
      fecha_recepcion:  item.fechaMsg.toISOString(),
      remitente_nombre: item.remitenteRaw,
      remitente_email:  item.emailRemit,
      email_destino:    item.emailDestino,
      tipo_remitente:   item.tipoRemitente,
      asunto:           item.msg.getSubject() || "(sin asunto)",
      cuerpo:           item.msg.getPlainBody().substring(0, 1000),
      estado:           "pendiente"
    };
  });

  var solRes = sbPostBatch(SUPABASE_URL, SUPABASE_KEY, "bib_solicitudes", solRows);

  // Fallback individual si el batch falla (conflicto de unicidad, etc.)
  var _primerError = null;
  if (!Array.isArray(solRes)) {
    _primerError = (solRes && solRes.error) ? solRes.error : JSON.stringify(solRes);
    Logger.log("Batch solicitudes error: " + _primerError + " — reintentando individualmente");
    solRes = nuevos.map(function(item, idx) {
      var r = sbPost(SUPABASE_URL, SUPABASE_KEY, "bib_solicitudes", solRows[idx]);
      if (!Array.isArray(r) && !_primerError) _primerError = (r && r.error) ? r.error : JSON.stringify(r);
      return (Array.isArray(r) && r[0]) ? r[0] : null;
    });
    // Si todos fallaron, devolver el error real para que el usuario lo vea
    var _guardados = solRes.filter(function(r) { return r !== null; }).length;
    if (_guardados === 0 && _primerError) {
      return { error: "Error al guardar correos: " + _primerError.substring(0, 400) };
    }
  }

  // ── 6. Insertar documentos en un único batch POST ─────────────
  // Correlación por gmail_message_id (no por posición): un INSERT masivo
  // en Postgres suele devolver las filas en el mismo orden en que se
  // enviaron, pero no es una garantía formal — un trigger futuro o un
  // cambio de comportamiento de PostgREST podría romper esa suposición
  // silenciosamente y adjuntar documentos a la solicitud equivocada.
  var solPorMsgId = {};
  (solRes || []).forEach(function(sol) { if (sol && sol.gmail_message_id) solPorMsgId[sol.gmail_message_id] = sol; });

  var docRows = [];
  for (var n2 = 0; n2 < nuevos.length; n2++) {
    var sol = solPorMsgId[nuevos[n2].msgId];
    var sid = sol && sol.id;
    if (!sid) {
      // Antes esto se saltaba en silencio: si la solicitud no se pudo
      // correlacionar de vuelta a su gmail_message_id, sus adjuntos (ya
      // subidos a Storage en el paso 4) quedaban huerfanos sin dejar
      // ningun rastro de por que.
      if ((nuevos[n2]._docs || []).length) {
        _auditar('sincronizacion', 'correlacion_documentos', 'error', 'error',
          'gmail_message_id=' + nuevos[n2].msgId + ' no se encontro en la respuesta del insert de bib_solicitudes -- ' +
          (nuevos[n2]._docs.length) + ' adjunto(s) ya subidos a Storage no se insertaron en bib_documentos');
      }
      continue;
    }
    idsExistentes[nuevos[n2].msgId] = true;
    agregados++;
    (nuevos[n2]._docs || []).forEach(function(doc) {
      docRows.push({ solicitud_id: sid, nombre_archivo: doc.nombre_archivo, tipo_mime: doc.tipo_mime, tamano_bytes: doc.tamano_bytes, storage_path: doc.storage_path });
    });
  }
  if (docRows.length) {
    var docRes = sbPostBatch(SUPABASE_URL, SUPABASE_KEY, "bib_documentos", docRows);
    if (!Array.isArray(docRes)) {
      // Antes el resultado de este batch se descartaba sin revisar --
      // era la unica asimetria real frente al insert de bib_solicitudes
      // (que sí tiene reintento individual) y la causa mas probable de
      // los huerfanos de Storage: el archivo ya estaba subido, pero su
      // fila en bib_documentos nunca llegaba a existir y nadie se enteraba.
      var _docErr = (docRes && docRes.error) ? String(docRes.error) : JSON.stringify(docRes);
      Logger.log('Batch documentos error: ' + _docErr + ' -- reintentando individualmente');
      var _docsGuardados = 0;
      docRows.forEach(function(fila) {
        var r = sbPost(SUPABASE_URL, SUPABASE_KEY, 'bib_documentos', fila);
        if (Array.isArray(r) && r[0]) _docsGuardados++;
      });
      var _docsOk = _docsGuardados === docRows.length;
      _auditar('sincronizacion', 'insertar_documentos', _docsOk ? 'ok' : 'error', _docsOk ? 'advertencia' : 'error',
        'Batch fallo (' + _docErr.substring(0, 300) + '); reintento individual: ' + _docsGuardados + '/' + docRows.length + ' documento(s) guardados');
    }
  }

  // ── 7. Actualizar checkpoint ───────────────────────────────────
  if (esMesActual && ultimaFecha) {
    sbPatch(SUPABASE_URL, SUPABASE_KEY, "bib_sync_estado?id=eq.1",
      { ultimo_sync_at: new Date().toISOString(), ultimo_message_date: ultimaFecha.toISOString() });
  }

  var elapsed = Date.now() - t0;
  Logger.log("Sync lote " + startOffset + "→" + nextOffset + ": " + agregados + " nuevos, " + omitidos + " omitidos, " + rechazados + " rechazados. " + elapsed + "ms");

  return { ok: true, agregados: agregados, omitidos: omitidos, personal: rechazados, mes: mes, ano: ano, parcial: hayMas, nextOffset: nextOffset, ms: elapsed };
}

// ============================================================
// ENVIAR CORREO DESDE CUENTA DE BIBLIOTECA
// ============================================================
// params: {
//   tipo:         'recibido' | 'impreso' | 'entregado'
//   destinatario: email
//   idSolicitud:  texto
//   asunto:       texto
//   profesor:     texto (opcional)
//   numHojas:     número (opcional)
//   materia:      texto (opcional)
//   tipoImpresion: texto (opcional)
//   tipoHoja:     texto (opcional)
//   nombreRecibe: texto (opcional)
//   observaciones: texto (opcional)
//   fechaEntrega: texto formateado (opcional)
// }
// ============================================================
function enviarCorreo(params) {
  try {
    if (!validarEmail(params.destinatario)) {
      _auditar('correo', 'envio_correo', 'error', 'advertencia',
        'Email destinatario inválido: ' + params.destinatario + ' (tipo=' + params.tipo + ')');
      return { ok: false, error: "Email destinatario inválido: " + params.destinatario };
    }

    // ── Verificar configuración de notificaciones ─────────────
    var _url = _cfg("SUPABASE_URL");
    var _key = _cfg("SUPABASE_KEY");
    if (_url && _key) {
      try {
        var nc = sbGet(_url, _key, "bib_notif_config?email=eq." + encodeURIComponent(params.destinatario) + "&select=activas");
        if (Array.isArray(nc) && nc.length > 0 && nc[0].activas === false) {
          _auditar('correo', 'envio_correo', 'ok', 'info',
            (params.tipo||'?') + ' → ' + params.destinatario + ': omitido (notificaciones desactivadas)');
          return { ok: true, skipped: true };
        }
      } catch(ex2) { /* si falla el check, se envía igual */ }
    }

    var ref   = params.numPersonal
      ? ("Solicitud #" + params.numPersonal)
      : (params.idSolicitud || params.asunto || "Sin referencia");
    var asunto = "";
    var html   = "";
    var plain  = "";

    // Plantilla base HTML
    function wrap(color, titulo, contenido) {
      return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0">' +
        '<tr><td align="center"><table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
        '<tr><td style="background:' + color + ';padding:20px 30px">' +
        '<p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold">' + titulo + '</p>' +
        '<p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px">Referencia: ' + ref + '</p>' +
        '</td></tr>' +
        '<tr><td style="padding:28px 30px;color:#333333;font-size:14px;line-height:1.7">' +
        contenido +
        '</td></tr>' +
        '<tr><td style="background:#f9f9f9;padding:16px 30px;border-top:1px solid #eeeeee">' +
        '<p style="margin:0;font-size:12px;color:#888888">BIBLIOTECA &mdash; Colegio Goyavier &nbsp;|&nbsp; Responde este correo si tienes preguntas</p>' +
        '</td></tr>' +
        '</table></td></tr></table></body></html>';
    }

    function fila(lbl, val) {
      return '<tr><td style="padding:5px 0;color:#888;font-size:13px;width:130px;vertical-align:top">' + lbl + '</td>' +
             '<td style="padding:5px 0;font-weight:600;font-size:13px">' + (val || '&mdash;') + '</td></tr>';
    }

    var horario =
      '<p style="background:#f0f4ff;border-left:3px solid #2c7be5;padding:12px 16px;border-radius:4px;margin:16px 0;font-size:13px">' +
      '<strong>HORARIO DE ENTREGA</strong><br>' +
      'Lunes a Viernes &mdash; 9:00 AM &ndash; 11:00 AM &nbsp;|&nbsp; 1:30 PM &ndash; 3:00 PM</p>';

    switch (params.tipo) {

      case "recibido":
        asunto = "Solicitud recibida :) - " + ref;
        html = wrap("#2c7be5", "Solicitud recibida :)",
          '<p>Hola!</p>' +
          '<p>Hemos recibido correctamente tu solicitud de impresion.</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("&gt;&gt; Asunto:", params.asunto) +
          (params.profesor ? fila("Profesor:", params.profesor) : "") +
          '</table>' +
          '<p style="background:#eaf4ff;border-left:3px solid #2c7be5;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'El tiempo estimado es de <strong>hasta 3 dias habiles</strong>.<br>' +
          'Te avisaremos por este medio cuando este lista para recoger.</p>' +
          '<p><strong>RECUERDA:</strong><br>Solo podras retirar tu impresion en el siguiente horario:</p>' +
          horario);
        plain =
          "Solicitud recibida :)\n\n" +
          "Hemos recibido correctamente tu solicitud de impresion.\n\n" +
          ">> Asunto:\n" + (params.asunto || ref) + "\n\n" +
          "El tiempo estimado de impresion es de hasta 3 dias habiles.\n" +
          "Te avisaremos por este medio cuando este lista para recoger.\n\n" +
          "RECUERDA:\n" +
          "Solo podras retirar tu impresion en el siguiente horario:\n" +
          "Lunes a Viernes:\n9:00 AM - 11:00 AM\n1:30 PM - 3:00 PM\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "impreso":
        asunto = "Tu impresion esta lista! :) - " + ref;
        html = wrap("#28a745", "Tu impresion esta lista! :)",
          '<p>Buenas noticias! :D</p>' +
          '<p>Tu solicitud de impresion ya esta lista y esperandote en la biblioteca.</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("&gt;&gt; Asunto:", params.asunto) +
          (params.profesor      ? fila("Profesor:", params.profesor)  : "") +
          (params.materia       ? fila("Materia:", params.materia)    : "") +
          (params.numHojas      ? fila("Hojas:", params.numHojas + " hojas") : "") +
          (params.tipoImpresion ? fila("Tipo:", params.tipoImpresion + (params.forma ? " / " + params.forma : "")) : "") +
          '</table>' +
          '<p style="background:#eafaf1;border-left:3px solid #28a745;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          '<strong>COMO RECOGER:</strong><br>Pasa por la Biblioteca, te estamos esperando!</p>' +
          '<p style="background:#f0f4ff;border-left:3px solid #2c7be5;padding:12px 16px;border-radius:4px;margin:16px 0;font-size:13px">' +
          '<strong>HORARIO DE ATENCION</strong><br>' +
          'Lunes a Viernes &mdash; 9:00 AM &ndash; 11:00 AM &nbsp;|&nbsp; 1:30 PM &ndash; 3:00 PM</p>' +
          '<p style="font-size:13px;color:#555">Recuerda que solo podras retirar tu impresion dentro de ese horario.</p>');
        plain =
          "Tu impresion esta lista! :)\n\n" +
          "Buenas noticias! :D\n" +
          "Tu solicitud de impresion ya esta lista y esperandote!\n\n" +
          ">> Asunto:\n" + (params.asunto || ref) + "\n\n" +
          "COMO RECOGER:\n" +
          "Pasa por la biblioteca, te estamos esperando!\n\n" +
          "HORARIO DE ATENCION:\n" +
          "Lunes a Viernes:\n9:00 AM - 11:00 AM\n1:30 PM - 3:00 PM\n\n" +
          "Recuerda que solo podras retirar tu impresion dentro de ese horario.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "entregado":
        asunto = "Impresion entregada con exito! :) - " + ref;
        var _gasUrl      = ScriptApp.getService().getUrl();
        // trabajoId (entrega por destinatario, js/copias.js) tiene prioridad; solicitudUuid
        // se mantiene como fallback para el flujo de Ventas (js/ventas.js), que sigue
        // entregando la solicitud completa y no manda trabajoId.
        var _accionConf  = params.trabajoId ? 'confirmarRecepcionTrabajo' : 'confirmarRecepcion';
        var _sidConf     = params.trabajoId || params.solicitudUuid || '';
        var _confirmUrl  = _gasUrl + '?accion=' + _accionConf + '&sid=' + encodeURIComponent(_sidConf);
        // Detalle por archivo si viene el array completo (entrega por trabajo); si no,
        // se mantiene el resumen agregado de siempre (Ventas, u otro llamado antiguo).
        var _detalleArchivos = '';
        if (Array.isArray(params.archivos) && params.archivos.length) {
          _detalleArchivos = params.archivos.map(function(a) {
            return '<div style="border:1px solid #eee;border-radius:6px;padding:10px 14px;margin:10px 0">' +
              '<p style="margin:0 0 6px;font-weight:bold;font-size:13px">' + (a.nombre || 'Archivo') + '</p>' +
              '<table cellpadding="0" cellspacing="0" style="width:100%">' +
              fila("Copias:", a.copias) +
              fila("Páginas:", a.paginas) +
              fila("Impresión:", a.tipo_impresion) +
              fila("Modo:", a.modo_impresion) +
              fila("Papel:", a.tamano_hoja) +
              '</table></div>';
          }).join('');
        } else if (params.tipoImpresion || params.numHojas) {
          _detalleArchivos =
            '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
            (params.tipoImpresion ? fila("Tipo:", params.tipoImpresion + (params.forma ? " / " + params.forma : "")) : "") +
            (params.numHojas      ? fila("Hojas:", params.numHojas + " hojas") : "") +
            '</table>';
        }
        // Ventas (personal, con precio) manda esPersonal=true; Gestion de Copias
        // (institucional, sin precio) no lo manda. Color y titulo cambian de
        // verdad (naranja vs morado), no solo una linea de texto -- para que
        // se distingan a simple vista, no solo leyendo el detalle.
        var _pesosEntregado  = function(n) { return '$ ' + Math.round(n || 0).toLocaleString(); };
        var _colorEntregado  = params.esPersonal ? "#f0883e" : "#6f42c1";
        var _colorEntregadoBg = params.esPersonal ? "#fff3e0" : "#f5f0ff";
        var _tituloEntregado = params.esPersonal ? "Entrega Personal! :D" : "Todo listo! :D";
        var _badgePersonal = params.esPersonal
          ? '<div style="text-align:center;margin-bottom:16px">' +
            '<span style="display:inline-block;background:#fff3e0;color:#f0883e;border:1px solid #f0883e;' +
            'padding:4px 14px;border-radius:20px;font-size:12px;font-weight:bold;letter-spacing:.03em">COMPROBANTE PERSONAL</span>' +
            '</div>'
          : '';
        var _infoPago = '';
        if (params.esPersonal) {
          var _saldoPend = params.saldo || 0;
          _infoPago = '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
            fila("Valor total:", _pesosEntregado(params.precioTotal)) +
            fila("Pagado:", _pesosEntregado(params.pagado)) +
            fila("Saldo:", _saldoPend > 0.5
              ? '<span style="color:#dc3545;font-weight:bold">' + _pesosEntregado(_saldoPend) + ' pendiente</span>'
              : '<span style="color:#28a745;font-weight:bold">Pagado completo</span>') +
            '</table>';
        }
        var _botonConfirm = _sidConf
          ? '<div style="text-align:center;margin:24px 0">' +
            '<a href="' + _confirmUrl + '" style="display:inline-block;background:' + _colorEntregado + ';color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">&#10003; Confirmar que recibí las copias</a>' +
            '</div>'
          : '';
        html = wrap(_colorEntregado, _tituloEntregado,
          _badgePersonal +
          '<p>Tu impresion fue entregada exitosamente. Esperamos que te sea de mucha utilidad!</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("&gt;&gt; Asunto:", params.asunto) +
          fila("Entregado a:", params.nombreRecibe) +
          fila("Fecha:", params.fechaEntrega) +
          (params.materia ? fila("Materia:", params.materia) : "") +
          '</table>' +
          _detalleArchivos +
          _infoPago +
          _botonConfirm +
          '<p style="background:' + _colorEntregadoBg + ';border-left:3px solid ' + _colorEntregado + ';padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Gracias por usar el servicio de la Biblioteca Goyavier, fue un gusto ayudarte.</p>');
        plain =
          _tituloEntregado + "\n\n" +
          (params.esPersonal ? "[[ COMPROBANTE PERSONAL ]]\n\n" : "") +
          "Tu impresion fue entregada exitosamente. Esperamos que te sea de mucha utilidad!\n\n" +
          ">> Asunto:\n" + (params.asunto || ref) + "\n\n" +
          (params.esPersonal ? "Valor total: " + _pesosEntregado(params.precioTotal) + "\n" +
            "Pagado: " + _pesosEntregado(params.pagado) + "\n" +
            "Saldo: " + (params.saldo > 0.5 ? _pesosEntregado(params.saldo) + " pendiente" : "Pagado completo") + "\n\n" : "") +
          (_sidConf ? "Confirma que recibiste las copias en este enlace:\n" + _confirmUrl + "\n\n" : "") +
          "Gracias por usar el servicio de la biblioteca, fue un gusto ayudarte.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "abono_registrado":
        var _pesosAbono  = function(n) { return '$ ' + Math.round(n || 0).toLocaleString(); };
        var _saldoAbono  = params.saldo || 0;
        var _pagadoTotal = _saldoAbono <= 0.5;
        asunto = (_pagadoTotal ? "Pago completo registrado" : "Abono registrado") + " - " + ref;
        html = wrap(_pagadoTotal ? "#28a745" : "#6f42c1",
          _pagadoTotal ? "¡Pago completo! :)" : "Abono registrado",
          '<p>' + (_pagadoTotal
            ? 'Confirmamos que recibimos tu pago y con esto tu trabajo queda totalmente pagado.'
            : 'Confirmamos que recibimos tu abono para el siguiente trabajo.') + '</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("&gt;&gt; Trabajo:", params.asunto) +
          fila("Fecha:", params.fecha) +
          fila("Monto recibido:", _pesosAbono(params.monto)) +
          fila("Valor total:", _pesosAbono(params.precioTotal)) +
          fila("Pagado hasta hoy:", _pesosAbono(params.pagado)) +
          fila("Saldo:", _pagadoTotal
            ? '<span style="color:#28a745;font-weight:bold">Pagado completo</span>'
            : '<span style="color:#dc3545;font-weight:bold">' + _pesosAbono(_saldoAbono) + ' pendiente</span>') +
          '</table>' +
          '<p style="background:#f5f0ff;border-left:3px solid #6f42c1;padding:12px 16px;border-radius:4px;margin:16px 0;font-size:13px">' +
          'Este correo es tu comprobante de este pago. Consérvalo por cualquier duda futura.</p>');
        plain =
          (_pagadoTotal ? "Pago completo registrado\n\n" : "Abono registrado\n\n") +
          ">> Trabajo:\n" + (params.asunto || ref) + "\n\n" +
          "Fecha: " + params.fecha + "\n" +
          "Monto recibido: " + _pesosAbono(params.monto) + "\n" +
          "Valor total: " + _pesosAbono(params.precioTotal) + "\n" +
          "Pagado hasta hoy: " + _pesosAbono(params.pagado) + "\n" +
          "Saldo: " + (_pagadoTotal ? "Pagado completo" : _pesosAbono(_saldoAbono) + " pendiente") + "\n\n" +
          "Este correo es tu comprobante de este pago. Consérvalo por cualquier duda futura.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "recordatorio_entregas":
        asunto = "Tienes entregas pendientes de confirmar - Biblioteca";
        var _gasUrlRec = ScriptApp.getService().getUrl();
        var _bloquesRec = (params.entregas || []).map(function(en) {
          var _cUrl = _gasUrlRec + '?accion=confirmarRecepcionTrabajo&sid=' + encodeURIComponent(en.trabajo_id);
          var _archsRec = (en.archivos || []).map(function(a) {
            return fila((a.nombre || 'Archivo') + ':', a.copias + ' copias, ' + a.paginas + ' páginas');
          }).join('');
          return '<div style="border:1px solid #eee;border-radius:6px;padding:14px 16px;margin:12px 0">' +
            '<p style="margin:0 0 8px;font-weight:bold">Entrega #' + (en.id_solicitud || '') + '</p>' +
            '<table cellpadding="0" cellspacing="0" style="width:100%">' + _archsRec + '</table>' +
            '<div style="text-align:center;margin-top:12px">' +
            '<a href="' + _cUrl + '" style="display:inline-block;background:#6f42c1;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px">Confirmar esta entrega</a>' +
            '</div></div>';
        }).join('');
        html = wrap("#e8a33d", "Tienes entregas pendientes de confirmar",
          '<p>Hace una semana registramos la entrega de los siguientes trabajos de impresión, pero aún no hemos recibido tu confirmación de recepción:</p>' +
          _bloquesRec +
          '<p style="background:#fff8ec;border-left:3px solid #e8a33d;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Si ya recibiste el material, confirma cada entrega con su propio botón.</p>');
        plain =
          "Tienes entregas pendientes de confirmar.\n\n" +
          "Hace una semana registramos la entrega de tus trabajos de impresión, pero aún no " +
          "hemos recibido tu confirmación. Revisa este correo en HTML para ver los enlaces " +
          "de confirmación de cada entrega.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier";
        break;

      case "movimiento_entregado":
        var tipoMovLbl = { prestamo: "Prestamo", asignacion: "Asignacion permanente", consumo: "Entrega / Consumo" };
        var _confirmUrlMat  = ScriptApp.getService().getUrl() + '?accion=confirmarRecepcionMaterial&sid=' + encodeURIComponent(params.movimientoId || '');
        var _botonConfirmMat = params.movimientoId
          ? '<div style="text-align:center;margin:24px 0">' +
            '<a href="' + _confirmUrlMat + '" style="display:inline-block;background:#6f42c1;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">&#10003; Confirmar que recibí el material</a>' +
            '</div>'
          : '';
        // Un bloque por material (nombre + cantidad/marca/color/tamaño/presentación),
        // igual estilo que el detalle por archivo del caso "entregado". Si viene el
        // resumen viejo como texto plano (llamador antiguo), se mantiene como fallback.
        var _detalleMateriales = '';
        var _plainMateriales   = '';
        if (Array.isArray(params.materiales) && params.materiales.length) {
          _detalleMateriales = params.materiales.map(function(m) {
            return '<div style="border:1px solid #eee;border-radius:6px;padding:10px 14px;margin:10px 0">' +
              '<p style="margin:0 0 6px;font-weight:bold;font-size:13px">' + (m.nombre || 'Material') + '</p>' +
              '<table cellpadding="0" cellspacing="0" style="width:100%">' +
              fila("Cantidad:", m.cantidad + " " + (m.unidad || "")) +
              (m.marca        ? fila("Marca:", m.marca) : "") +
              (m.color        ? fila("Color:", m.color) : "") +
              (m.tamano       ? fila("Tamaño:", m.tamano) : "") +
              (m.presentacion ? fila("Presentación:", m.presentacion) : "") +
              '</table></div>';
          }).join('');
          _plainMateriales = params.materiales.map(function(m) {
            var extra = [m.marca, m.color, m.tamano, m.presentacion].filter(function(x){ return x; }).join(' · ');
            return '- ' + m.cantidad + ' ' + (m.unidad || '') + ' de ' + m.nombre + (extra ? ' (' + extra + ')' : '');
          }).join('\n');
        } else {
          _detalleMateriales = '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
            fila("Materiales:", params.materiales) + '</table>';
          _plainMateriales = params.materiales || '';
        }
        asunto = "Entrega registrada :) - " + ref;
        html = wrap("#6f42c1", "Entrega registrada :)",
          '<p>Hola!</p>' +
          '<p>Se registro la siguiente entrega de materiales en la Biblioteca.</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("Tipo:", tipoMovLbl[params.tipoMovimiento] || params.tipoMovimiento) +
          (params.fechaLimite ? fila("Devolver antes de:", params.fechaLimite) : "") +
          '</table>' +
          _detalleMateriales +
          _botonConfirmMat +
          (params.fechaLimite
            ? '<p style="background:#fff3e0;border-left:3px solid #f0883e;padding:12px 16px;border-radius:4px;margin:16px 0">' +
              '<strong>RECUERDA:</strong> este material debe devolverse a la Biblioteca antes de la fecha indicada.</p>'
            : '') +
          '<p style="background:#f5f0ff;border-left:3px solid #6f42c1;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Gracias por usar el servicio de la Biblioteca Goyavier.</p>');
        plain =
          "Entrega registrada :)\n\n" +
          "Se registro la siguiente entrega de materiales en la Biblioteca.\n\n" +
          "Materiales:\n" + _plainMateriales + "\n\n" +
          (params.fechaLimite ? "Devolver antes de: " + params.fechaLimite + "\n\n" : "") +
          (params.movimientoId ? "Confirma que recibiste el material en este enlace:\n" + _confirmUrlMat + "\n\n" : "") +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "movimiento_devuelto":
        asunto = "Devolucion registrada - " + ref;
        html = wrap("#28a745", "Devolucion registrada",
          '<p>Hola!</p>' +
          '<p>Confirmamos que la Biblioteca registro la devolucion del siguiente prestamo.</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("Materiales:", params.materiales) +
          fila("Fecha de devolucion:", params.fechaDevolucion) +
          fila("Recibido por:", params.usuarioRecibio) +
          '</table>' +
          '<p style="background:#eafaf1;border-left:3px solid #28a745;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          '<strong>Este correo sirve como comprobante de paz y salvo</strong> de este prestamo. ' +
          'Consérvalo por si en algún caso el sistema llegara a mostrarlo como pendiente por devolver — ' +
          'este correo demuestra que ya fue entregado en la fecha indicada.</p>');
        plain =
          "Devolucion registrada\n\n" +
          "Confirmamos que la Biblioteca registro la devolucion del siguiente prestamo.\n\n" +
          "Materiales:\n" + (params.materiales || "") + "\n" +
          "Fecha de devolucion: " + (params.fechaDevolucion || "") + "\n" +
          "Recibido por: " + (params.usuarioRecibio || "") + "\n\n" +
          "Este correo sirve como comprobante de paz y salvo de este prestamo. Consérvalo por si en\n" +
          "algún caso el sistema llegara a mostrarlo como pendiente por devolver.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "libro_prestado":
        var _fechaLimLbl = params.esInstitucional
          ? "Sin fecha fija - uso durante el año escolar"
          : (params.fechaLimite || "-");
        var _confirmUrlLib  = ScriptApp.getService().getUrl() + '?accion=confirmarRecepcionLibro&sid=' + encodeURIComponent(params.prestamoId || '');
        var _botonConfirmLib = params.prestamoId
          ? '<div style="text-align:center;margin:24px 0">' +
            '<a href="' + _confirmUrlLib + '" style="display:inline-block;background:#2c7be5;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">&#10003; Confirmar que recibí el libro</a>' +
            '</div>'
          : '';
        asunto = "Prestamo de libro registrado - " + ref;
        html = wrap("#2c7be5", "Prestamo de libro registrado",
          '<p>Hola!</p>' +
          '<p>Se registro el prestamo del siguiente libro en la Biblioteca.</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("Libro:", params.libro) +
          (params.editorial ? fila("Editorial:", params.editorial) : "") +
          fila("Devolver antes de:", _fechaLimLbl) +
          '</table>' +
          _botonConfirmLib +
          (!params.esInstitucional
            ? '<p style="background:#fff3e0;border-left:3px solid #f0883e;padding:12px 16px;border-radius:4px;margin:16px 0">' +
              '<strong>RECUERDA:</strong> este libro debe devolverse a la Biblioteca antes de la fecha indicada.</p>'
            : '') +
          '<p style="background:#eaf4ff;border-left:3px solid #2c7be5;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Gracias por usar el servicio de la Biblioteca Goyavier.</p>');
        plain =
          "Prestamo de libro registrado\n\n" +
          "Se registro el prestamo del siguiente libro en la Biblioteca.\n\n" +
          "Libro: " + (params.libro || "") + "\n" +
          (params.editorial ? "Editorial: " + params.editorial + "\n" : "") +
          "Devolver antes de: " + _fechaLimLbl + "\n\n" +
          (params.prestamoId ? "Confirma que recibiste el libro en este enlace:\n" + _confirmUrlLib + "\n\n" : "") +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "libro_devuelto":
        asunto = "Devolucion de libro registrada - " + ref;
        html = wrap("#28a745", "Devolucion registrada",
          '<p>Hola!</p>' +
          '<p>Confirmamos que la Biblioteca registro la devolucion del siguiente libro.</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("Libro:", params.libro) +
          fila("Fecha de devolucion:", params.fechaDevolucion) +
          fila("Recibido por:", params.usuarioRecibio) +
          '</table>' +
          '<p style="background:#eafaf1;border-left:3px solid #28a745;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          '<strong>Este correo sirve como comprobante de paz y salvo</strong> de este prestamo de libro. ' +
          'Consérvalo por si en algún caso el sistema llegara a mostrarlo como pendiente por devolver.</p>');
        plain =
          "Devolucion de libro registrada\n\n" +
          "Confirmamos que la Biblioteca registro la devolucion del siguiente libro.\n\n" +
          "Libro: " + (params.libro || "") + "\n" +
          "Fecha de devolucion: " + (params.fechaDevolucion || "") + "\n" +
          "Recibido por: " + (params.usuarioRecibio || "") + "\n\n" +
          "Este correo sirve como comprobante de paz y salvo de este prestamo de libro.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      case "material_vencido":
        asunto = "Tienes material vencido por devolver - Biblioteca";
        var _bloquesMatVenc = (params.movimientos || []).map(function(m) {
          var _matsVenc = (m.materiales || []).map(function(mm) {
            return fila((mm.nombre || 'Material') + ':', mm.cantidad + ' ' + (mm.unidad || ''));
          }).join('');
          return '<div style="border:1px solid #eee;border-radius:6px;padding:14px 16px;margin:12px 0">' +
            '<p style="margin:0 0 8px;font-weight:bold">' + (m.id_movimiento || '') +
            ' <span style="color:#dc3545;font-weight:normal">(vencido hace ' + m.dias_vencido + ' dia' + (m.dias_vencido===1?'':'s') + ')</span></p>' +
            '<table cellpadding="0" cellspacing="0" style="width:100%">' + _matsVenc + '</table>' +
            '</div>';
        }).join('');
        html = wrap("#dc3545", "Tienes material vencido por devolver",
          '<p>Hola!</p>' +
          '<p>Los siguientes materiales de la Biblioteca ya pasaron su fecha limite de devolucion:</p>' +
          _bloquesMatVenc +
          '<p style="background:#fdecea;border-left:3px solid #dc3545;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Por favor acercate a la Biblioteca a devolverlo lo antes posible. Este recordatorio se repite ' +
          'cada pocos dias mientras siga pendiente.</p>');
        plain =
          "Tienes material vencido por devolver.\n\n" +
          "Los siguientes materiales de la Biblioteca ya pasaron su fecha limite de devolucion. " +
          "Revisa este correo en HTML para ver el detalle de cada uno.\n\n" +
          "Por favor acercate a la Biblioteca a devolverlo lo antes posible.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier";
        break;

      case "libro_vencido":
        asunto = "Tienes un libro vencido por devolver - Biblioteca";
        var _bloquesLibVenc = (params.libros || []).map(function(l) {
          return '<div style="border:1px solid #eee;border-radius:6px;padding:14px 16px;margin:12px 0">' +
            '<p style="margin:0;font-weight:bold">' + (l.libro_titulo || '') + '</p>' +
            '<p style="margin:4px 0 0;font-size:12px;color:#888">' + (l.id_prestamo || '') +
            ' &middot; <span style="color:#dc3545">vencido hace ' + l.dias_vencido + ' dia' + (l.dias_vencido===1?'':'s') + '</span></p>' +
            '</div>';
        }).join('');
        html = wrap("#dc3545", "Tienes un libro vencido por devolver",
          '<p>Hola!</p>' +
          '<p>Los siguientes libros de la Biblioteca ya pasaron su fecha limite de devolucion:</p>' +
          _bloquesLibVenc +
          '<p style="background:#fdecea;border-left:3px solid #dc3545;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Por favor acercate a la Biblioteca a devolverlo lo antes posible. Este recordatorio se repite ' +
          'cada pocos dias mientras siga pendiente.</p>');
        plain =
          "Tienes un libro vencido por devolver.\n\n" +
          "Los siguientes libros de la Biblioteca ya pasaron su fecha limite de devolucion. " +
          "Revisa este correo en HTML para ver el detalle.\n\n" +
          "Por favor acercate a la Biblioteca a devolverlo lo antes posible.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier";
        break;

      case "solicitudes_estancadas":
        asunto = "Backlog: " + (params.solicitudes||[]).length + " solicitud(es) sin gestionar - Biblioteca";
        var _filasEstancadas = (params.solicitudes || []).map(function(s) {
          return '<tr>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">' + (s.id_solicitud||'') + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">' + (s.asunto||'') + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px">' + (s.profesor||s.remitente_email||'') + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#dc3545;font-weight:bold">' + s.dias_estancada + ' dia' + (s.dias_estancada===1?'':'s') + '</td>' +
            '</tr>';
        }).join('');
        html = wrap("#e8a33d", "Backlog de solicitudes sin gestionar",
          '<p>Hola!</p>' +
          '<p>Las siguientes solicitudes de impresion llevan 2 o mas dias en estado "pendiente" sin pasar a "recibido":</p>' +
          '<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0">' +
          '<tr><th style="text-align:left;padding:6px 8px;font-size:11px;color:#888">ID</th>' +
          '<th style="text-align:left;padding:6px 8px;font-size:11px;color:#888">Asunto</th>' +
          '<th style="text-align:left;padding:6px 8px;font-size:11px;color:#888">Profesor/Remitente</th>' +
          '<th style="text-align:left;padding:6px 8px;font-size:11px;color:#888">Dias</th></tr>' +
          _filasEstancadas +
          '</table>' +
          '<p style="background:#fff8ec;border-left:3px solid #e8a33d;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Este es un aviso interno diario mientras la lista no este vacia.</p>');
        plain =
          "Backlog de solicitudes sin gestionar.\n\n" +
          (params.solicitudes||[]).length + " solicitud(es) llevan 2+ dias en 'pendiente'. " +
          "Revisa este correo en HTML para ver el detalle, o entra a Auditoria en la app.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier";
        break;

      case "correccion_registro":
        asunto = "Corrección de registro - Biblioteca";
        html = wrap("#6c757d", "Corrección de registro",
          '<p>Hola!</p>' +
          '<p>Te escribimos para informarte que un registro de la Biblioteca que llego a tu nombre por error ya fue corregido. No tienes que hacer nada.</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          (params.asuntoOriginal ? fila("Asunto:", params.asuntoOriginal) : "") +
          '</table>' +
          '<p style="background:#f4f4f4;border-left:3px solid #6c757d;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Disculpa las molestias. Si tienes alguna duda, responde a este correo.</p>');
        plain =
          "Correccion de registro.\n\n" +
          "Un registro de la Biblioteca que llego a tu nombre por error ya fue corregido internamente. " +
          "No tienes que hacer nada.\n\n" +
          "Disculpa las molestias.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier";
        break;

      default:
        return { ok: false, error: "Tipo de correo no reconocido: " + params.tipo };
    }

    GmailApp.sendEmail(params.destinatario, asunto, plain, {
      htmlBody: html,
      name:     "Biblioteca Goyavier"
    });
    _auditar('correo', 'envio_correo', 'ok', 'info', (params.tipo||'?') + ' → ' + params.destinatario);
    return { ok: true };

  } catch (e) {
    Logger.log("enviarCorreo error: " + e.toString());
    _auditar('correo', 'envio_correo', 'error', 'error',
      (params.tipo||'?') + ' → ' + (params.destinatario||'?') + ': ' + e.toString());
    return { ok: false, error: e.toString() };
  }
}

// ── Diagnostico (Fase 4): envoltorio SOLO para el envio original
// (despachar → "enviarCorreo"). Si falla, guarda el payload completo en
// bib_correos_fallidos para poder reintentarlo despues. Los reintentos
// mismos llaman a enviarCorreo() DIRECTAMENTE (ver _reintentarCorreoFallido),
// nunca a este envoltorio -- si tambien pasaran por aqui, cada intento
// fallido crearia una fila nueva en vez de actualizar la existente.
function _enviarCorreoConReintento(params) {
  var res = enviarCorreo(params);
  if (res && !res.ok && !res.skipped) {
    _guardarCorreoFallido(params, res.error || 'Error desconocido');
  }
  return res;
}

function _guardarCorreoFallido(params, error) {
  try {
    var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
    if (!_url || !_key) return;
    sbPost(_url, _key, 'bib_correos_fallidos', {
      params: params, error: String(error).substring(0, 1000)
    });
  } catch(e2) {
    Logger.log('_guardarCorreoFallido error (no critico): ' + e2.toString());
  }
}

// Reintenta un correo guardado en bib_correos_fallidos usando el mismo
// payload original. Actualiza la MISMA fila (resuelto=true o suma un
// intento) en vez de crear una nueva -- por eso llama a enviarCorreo()
// puro y no a _enviarCorreoConReintento().
function _reintentarCorreoFallido(id) {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return { ok: false, error: 'Faltan credenciales de Supabase' };
  var filas = sbGet(_url, _key, 'bib_correos_fallidos?id=eq.' + encodeURIComponent(id) + '&select=*');
  if (!Array.isArray(filas) || !filas.length) return { ok: false, error: 'No se encontró el registro #' + id };
  var fila = filas[0];
  var res = enviarCorreo(fila.params);
  if (res && res.ok) {
    sbPatch(_url, _key, 'bib_correos_fallidos?id=eq.' + encodeURIComponent(id),
      { resuelto: true, resuelto_en: new Date().toISOString() });
  } else {
    sbPatch(_url, _key, 'bib_correos_fallidos?id=eq.' + encodeURIComponent(id), {
      intentos: (fila.intentos || 0) + 1,
      error: (res && res.error) || 'Error desconocido',
      ultimo_intento_en: new Date().toISOString()
    });
  }
  return res;
}

// ── Respuesta manual a un correo (NO automática) ──────────────
// El usuario decide qué escribir y cuándo — pensado para los casos
// donde una solicitud llegó sin adjuntos o con un link de Drive sin
// permiso: hoy el sistema detecta ambas cosas pero no hay forma de
// avisarle al remitente. Usa msg.reply() (no GmailApp.sendEmail) para
// que quede en el MISMO hilo de Gmail — el remitente lo ve como una
// respuesta normal, no como un correo nuevo y desconectado.
function _responderCorreo(gmailMessageId, mensaje) {
  if (!gmailMessageId) return { ok: false, error: 'gmailMessageId requerido' };
  if (!mensaje || !mensaje.trim()) return { ok: false, error: 'El mensaje no puede estar vacío' };
  try {
    var msg = GmailApp.getMessageById(gmailMessageId);
    msg.reply(mensaje, { name: 'Biblioteca Goyavier' });
    _auditar('correo', 'responder_correo', 'ok', 'info', 'Respuesta manual enviada (gmail_message_id=' + gmailMessageId + ')');
    return { ok: true };
  } catch(e) {
    _auditar('correo', 'responder_correo', 'error', 'error', 'gmail_message_id=' + gmailMessageId + ': ' + e.toString());
    return { ok: false, error: e.toString() };
  }
}

// ============================================================
// HELPERS SUPABASE REST
// ============================================================

// GET: devuelve array o {error}
function sbGet(url, key, endpoint) {
  try {
    var res = UrlFetchApp.fetch(url + "/rest/v1/" + endpoint, {
      method: "GET",
      headers: {
        "apikey":        key,
        "Authorization": "Bearer " + key,
        "Content-Type":  "application/json"
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 400) {
      return { error: res.getContentText() };
    }
    return JSON.parse(res.getContentText());
  } catch(e) {
    return { error: e.toString() };
  }
}

// POST: inserta fila, devuelve array con la fila creada o {error}
function sbPost(url, key, tabla, fila) {
  try {
    var res = UrlFetchApp.fetch(url + "/rest/v1/" + tabla, {
      method: "POST",
      headers: {
        "apikey":        key,
        "Authorization": "Bearer " + key,
        "Content-Type":  "application/json",
        "Prefer":        "return=representation"
      },
      payload:            JSON.stringify(fila),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 400) {
      return { error: res.getContentText() };
    }
    return JSON.parse(res.getContentText());
  } catch(e) {
    return { error: e.toString() };
  }
}

// Batch POST: inserta un array de filas en una sola petición, devuelve array con los registros creados
function sbPostBatch(url, key, tabla, filas) {
  if (!filas || !filas.length) return [];
  try {
    var res = UrlFetchApp.fetch(url + "/rest/v1/" + tabla, {
      method: "POST",
      headers: {
        "apikey":        key,
        "Authorization": "Bearer " + key,
        "Content-Type":  "application/json",
        "Prefer":        "return=representation"
      },
      payload:            JSON.stringify(filas),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 400) return { error: res.getContentText() };
    return JSON.parse(res.getContentText());
  } catch(e) { return { error: e.toString() }; }
}

// Storage upload: sube bytes al bucket, devuelve true/false
function sbStorageUpload(url, key, path, mime, bytes) {
  try {
    // Encode cada segmento del path por separado para preservar la barra /
    var encodedPath = path.split("/").map(encodeURIComponent).join("/");
    var res = UrlFetchApp.fetch(
      url + "/storage/v1/object/biblioteca-adjuntos/" + encodedPath, {
        method:  "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type":  mime || "application/octet-stream",
          "x-upsert":      "true"
        },
        payload:            bytes,
        muteHttpExceptions: true
      }
    );
    return res.getResponseCode() < 400;
  } catch(e) {
    Logger.log("sbStorageUpload error: " + e.toString());
    return false;
  }
}

// PATCH: actualiza filas, devuelve true/false
function sbPatch(url, key, endpoint, data) {
  try {
    var res = UrlFetchApp.fetch(url + "/rest/v1/" + endpoint, {
      method: "PATCH",
      headers: {
        "apikey":        key,
        "Authorization": "Bearer " + key,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal"
      },
      payload:            JSON.stringify(data),
      muteHttpExceptions: true
    });
    return res.getResponseCode() < 400;
  } catch(e) {
    Logger.log("sbPatch error: " + e.toString());
    return false;
  }
}

// ── Helper: validar email básico ──
function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

// ============================================================
// REPORTES AUTOMÁTICOS MENSUALES
// ============================================================
// Script Properties adicionales requeridas:
//   REPORTE_EMAIL → correo(s) separados por coma para recibir reportes
//
// PASO ÚNICO DE CONFIGURACIÓN (ejecutar UNA VEZ desde el editor GAS):
//   Abre este script → Ejecutar → configurarTriggers()
//   Esto activa el trigger diario que revisa fechas automáticamente.
// ============================================================

var _MESES_GAS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Ejecutar UNA VEZ para activar los triggers ────────────────
function configurarTriggers() {
  // Borrar triggers previos del mismo nombre para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'verificarFechasMes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verificarFechasMes').timeBased().everyDays(1).atHour(7).create();
  Logger.log('Trigger configurado: verificarFechasMes cada dia a las 7am');
}

// ── Corre automáticamente cada día a las 7am ─────────────────
function verificarFechasMes() {
  var hoy          = new Date();
  var diasEnMes    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  var diaHoy       = hoy.getDate();
  var diasRestantes = diasEnMes - diaHoy;
  if (diasRestantes === 7) {
    _alertaFinDeMes(7, hoy);
  }
  if (diaHoy === diasEnMes) {
    try { _exportarMes(hoy.getFullYear(), hoy.getMonth()); }
    catch(e) { _notificarError('exportarMes', e.toString()); }
  }
  try { _verificarReconciliacionStorage(); }
  catch(e) { _notificarError('reconciliacionStorage', e.toString()); }
  try { _verificarAlertas(); }
  catch(e) { _notificarError('verificarAlertas', e.toString()); }
  try { archivarAdjuntosAntiguos(); }
  catch(e) { _notificarError('archivarAdjuntosAntiguos', e.toString()); }
  try { _recordarConfirmacionesPendientes(); }
  catch(e) { _notificarError('recordarConfirmacionesPendientes', e.toString()); }
  try { _recordarMaterialesVencidos(); }
  catch(e) { _notificarError('recordarMaterialesVencidos', e.toString()); }
  try { _recordarLibrosVencidos(); }
  catch(e) { _notificarError('recordarLibrosVencidos', e.toString()); }
  try { _alertarSolicitudesEstancadas(); }
  catch(e) { _notificarError('alertarSolicitudesEstancadas', e.toString()); }
}

// ── Recordatorio de materiales vencidos (prestamo/asignacion sin
// devolver, fecha limite ya pasada). Corre junto al resto de
// verificarFechasMes. Recoge bib_vista_recordatorios_materiales_vencidos
// (ver sql/034), agrupa por colaborador para mandar UN correo consolidado,
// y marca ultimo_recordatorio_vencido_en para reinsistir en 3 dias si
// sigue sin devolverse (a diferencia del recordatorio de copias original,
// este SI se repite -- ver sql/034 para el mismo fix aplicado alla).
function _recordarMaterialesVencidos() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return;

  var filas = sbGet(_url, _key, 'bib_vista_recordatorios_materiales_vencidos?select=*');
  if (filas && filas.error) {
    _auditar('recordatorios', 'materiales_vencidos', 'error', 'error', filas.error);
    return;
  }
  if (!Array.isArray(filas) || !filas.length) {
    _auditar('recordatorios', 'materiales_vencidos', 'ok', 'info', 'Sin materiales vencidos por recordar');
    return;
  }

  var porEmail = {};
  filas.forEach(function(f) {
    (porEmail[f.colaborador_email] = porEmail[f.colaborador_email] || []).push(f);
  });
  var enviados = 0;
  Object.keys(porEmail).forEach(function(email) {
    var movs = porEmail[email];
    var idsIncluidos = movs.map(function(m) { return m.id; });
    var r;
    try {
      r = enviarCorreo({ tipo: 'material_vencido', destinatario: email, movimientos: movs,
        idSolicitud: movs.length + ' material(es) vencido(s)' });
    } catch(ex) {
      r = { ok: false, error: ex.toString() };
    }
    if (r && r.ok) {
      sbPatch(_url, _key, 'bib_movimientos?id=in.(' + idsIncluidos.join(',') + ')',
        { ultimo_recordatorio_vencido_en: new Date().toISOString() });
      enviados++;
    }
  });
  _auditar('recordatorios', 'materiales_vencidos', 'ok', 'info',
    enviados + ' de ' + Object.keys(porEmail).length + ' recordatorio(s) enviado(s), ' + filas.length + ' material(es) vencido(s) en total');
}

// ── Recordatorio de libros vencidos. Mismo mecanismo que materiales,
// sobre bib_vista_recordatorios_libros_vencidos (ver sql/034).
function _recordarLibrosVencidos() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return;

  var filas = sbGet(_url, _key, 'bib_vista_recordatorios_libros_vencidos?select=*');
  if (filas && filas.error) {
    _auditar('recordatorios', 'libros_vencidos', 'error', 'error', filas.error);
    return;
  }
  if (!Array.isArray(filas) || !filas.length) {
    _auditar('recordatorios', 'libros_vencidos', 'ok', 'info', 'Sin libros vencidos por recordar');
    return;
  }

  var porEmail = {};
  filas.forEach(function(f) {
    (porEmail[f.prestatario_email] = porEmail[f.prestatario_email] || []).push(f);
  });
  var enviados = 0;
  Object.keys(porEmail).forEach(function(email) {
    var libros = porEmail[email];
    var idsIncluidos = libros.map(function(l) { return l.id; });
    var r;
    try {
      r = enviarCorreo({ tipo: 'libro_vencido', destinatario: email, libros: libros,
        idSolicitud: libros.length + ' libro(s) vencido(s)' });
    } catch(ex) {
      r = { ok: false, error: ex.toString() };
    }
    if (r && r.ok) {
      sbPatch(_url, _key, 'bib_prestamos_libros?id=in.(' + idsIncluidos.join(',') + ')',
        { ultimo_recordatorio_vencido_en: new Date().toISOString() });
      enviados++;
    }
  });
  _auditar('recordatorios', 'libros_vencidos', 'ok', 'info',
    enviados + ' de ' + Object.keys(porEmail).length + ' recordatorio(s) enviado(s), ' + filas.length + ' libro(s) vencido(s) en total');
}

// ── Digest diario de solicitudes de copias estancadas en 'pendiente'
// 2+ dias (ver bib_vista_solicitudes_estancadas, sql/034). Va al equipo
// de Biblioteca (REPORTE_EMAIL), no al profesor -- es una alerta interna
// de backlog, no un recordatorio al usuario final. Se repite todos los
// dias mientras la lista no este vacia (es un monitor, no un aviso unico).
function _alertarSolicitudesEstancadas() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return;
  var emailDest = _cfg('REPORTE_EMAIL') || Session.getActiveUser().getEmail();
  if (!emailDest) return;

  var filas = sbGet(_url, _key, 'bib_vista_solicitudes_estancadas?select=*');
  if (filas && filas.error) {
    _auditar('recordatorios', 'solicitudes_estancadas', 'error', 'error', filas.error);
    return;
  }
  if (!Array.isArray(filas) || !filas.length) {
    _auditar('recordatorios', 'solicitudes_estancadas', 'ok', 'info', 'Sin solicitudes estancadas');
    return;
  }

  var r;
  try {
    r = enviarCorreo({ tipo: 'solicitudes_estancadas', destinatario: emailDest, solicitudes: filas,
      idSolicitud: filas.length + ' solicitud(es) estancada(s)' });
  } catch(ex) {
    r = { ok: false, error: ex.toString() };
  }
  _auditar('recordatorios', 'solicitudes_estancadas',
    (r && r.ok) ? 'ok' : 'error', (r && r.ok) ? 'info' : 'advertencia',
    filas.length + ' solicitud(es) estancada(s), correo ' + ((r && r.ok) ? 'enviado' : 'con error: ' + (r && r.error)));
}

// ── Recordatorio de confirmacion de recepcion (Fase entregas por trabajo).
// Corre junto al resto de verificarFechasMes. Recoge bib_vista_recordatorios_pendientes
// (trabajos entregados hace 7+ dias, sin confirmar, nunca recordados -- ver sql/032),
// agrupa por destinatario para mandar UN correo consolidado por persona (no uno por
// entrega), y marca recordatorio_enviado_en para que no se repita manana.
function _recordarConfirmacionesPendientes() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return;

  var filas = sbGet(_url, _key, 'bib_vista_recordatorios_pendientes?select=*');
  if (filas && filas.error) {
    _auditar('recordatorios', 'recordar_confirmaciones', 'error', 'error', filas.error);
    return;
  }
  if (!Array.isArray(filas) || !filas.length) {
    _auditar('recordatorios', 'recordar_confirmaciones', 'ok', 'info', 'Sin recordatorios pendientes');
    return;
  }

  var porEmail = {};
  filas.forEach(function(f) {
    (porEmail[f.destinatario_email] = porEmail[f.destinatario_email] || []).push(f);
  });

  var enviados = 0;
  Object.keys(porEmail).forEach(function(email) {
    var entregas = porEmail[email];
    var idsIncluidos = entregas.map(function(e) { return e.trabajo_id; });
    var r;
    try {
      r = enviarCorreo({ tipo: 'recordatorio_entregas', destinatario: email, entregas: entregas,
        idSolicitud: entregas.length + ' entrega(s) pendiente(s)' });
    } catch(ex) {
      r = { ok: false, error: ex.toString() };
    }
    sbPost(_url, _key, 'bib_recordatorios_entrega', {
      destinatario_email: email,
      trabajo_ids: idsIncluidos,
      cantidad_entregas: entregas.length,
      estado_envio: (r && r.ok) ? 'ok' : 'error',
      error: (r && r.error) || null
    });
    if (r && r.ok) {
      sbPatch(_url, _key, 'bib_trabajos_impresion?id=in.(' + idsIncluidos.join(',') + ')',
        { recordatorio_enviado_en: new Date().toISOString() });
      enviados++;
    }
  });
  _auditar('recordatorios', 'recordar_confirmaciones', 'ok', 'info',
    enviados + ' de ' + Object.keys(porEmail).length + ' recordatorio(s) enviado(s), ' + filas.length + ' entrega(s) en total');
}

// ── Revisa bib_vista_alertas (umbrales de errores por modulo, ver
// sql/023_alertas.sql) y notifica por correo si algo esta en alerta.
// Corre junto al resto de verificarFechasMes, una vez al dia — el
// Visor de Alertas del frontend consulta la misma vista en vivo, asi
// que esto es solo el aviso proactivo diario, no la unica forma de ver
// una alerta activa.
function _verificarAlertas() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return;
  var filas;
  try {
    filas = sbGet(_url, _key, 'bib_vista_alertas?select=*');
  } catch(e) {
    Logger.log('Verificacion de alertas error: ' + e.toString());
    _auditar('alertas', 'verificar_alertas', 'error', 'error', e.toString());
    return;
  }
  if (!Array.isArray(filas) || !filas.length) {
    Logger.log('Verificacion de alertas: sin alertas activas.');
    _auditar('alertas', 'verificar_alertas', 'ok', 'info', 'Sin alertas activas');
    return;
  }
  var emailDest = _cfg('REPORTE_EMAIL') || Session.getActiveUser().getEmail();
  var cuerpo = 'Se detectaron ' + filas.length + ' modulo(s) con errores por encima del umbral en las ultimas 24 horas:\n\n' +
    filas.map(function(f) {
      return '[' + f.gravedad.toUpperCase() + '] ' + f.modulo + ': ' + f.cantidad + ' errores (umbral: ' + f.umbral + ')';
    }).join('\n') +
    '\n\nRevisa el detalle en la pestana Alertas de la pagina Auditoria.';
  GmailApp.sendEmail(emailDest, 'Biblioteca: ' + filas.length + ' alerta(s) activa(s)', cuerpo, { name: 'Biblioteca Goyavier' });
  Logger.log('Verificacion de alertas: ' + filas.length + ' alerta(s) notificada(s).');
  _auditar('alertas', 'verificar_alertas', 'ok', 'advertencia', filas.length + ' alerta(s) notificada(s) por correo');
}

// ── Detecta archivos huérfanos entre Storage y bib_documentos ──
// Corre todos los días junto al resto de verificarFechasMes. Si algo se
// pierde a mitad de un timeout de sincronizarCorreos, esto lo detecta
// aunque nadie lo esté buscando manualmente.
function _verificarReconciliacionStorage() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return;
  var res = UrlFetchApp.fetch(_url + '/rest/v1/rpc/bib_fn_reconciliar_storage', {
    method: 'POST',
    headers: { 'apikey': _key, 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
    payload: '{}',
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) {
    Logger.log('Reconciliacion storage error: ' + res.getContentText());
    _auditar('reconciliacion', 'reconciliar_storage', 'error', 'error', res.getContentText().substring(0, 500));
    return;
  }
  var filas = JSON.parse(res.getContentText());
  if (!Array.isArray(filas) || !filas.length) {
    Logger.log('Reconciliacion storage: sin inconsistencias.');
    _auditar('reconciliacion', 'reconciliar_storage', 'ok', 'info', 'Sin inconsistencias');
    return;
  }
  var emailDest = _cfg('REPORTE_EMAIL') || Session.getActiveUser().getEmail();
  var cuerpo = 'Se encontraron ' + filas.length + ' inconsistencias entre Storage y bib_documentos:\n\n' +
    filas.map(function(f){ return '[' + f.tipo + '] ' + f.ruta + ' - ' + f.detalle; }).join('\n');
  GmailApp.sendEmail(emailDest, 'Biblioteca: inconsistencias Storage/BD detectadas (' + filas.length + ')',
    cuerpo, { name: 'Biblioteca Goyavier' });
  Logger.log('Reconciliacion storage: ' + filas.length + ' inconsistencias encontradas y notificadas.');
  _auditar('reconciliacion', 'reconciliar_storage', 'ok', 'advertencia',
    filas.length + ' inconsistencias encontradas y notificadas por correo');
}

// ── Diagnostico (Fase 4): version "on demand" para el boton del panel.
// Misma llamada RPC que _verificarReconciliacionStorage(), pero SI
// devuelve las filas al llamador (para mostrarlas de inmediato en la
// pantalla) y NO manda correo -- quien la ejecuta ya esta mirando la
// pantalla, no necesita ademas un email.
function _ejecutarReconciliacionManual() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return { ok: false, error: 'Faltan SUPABASE_URL/SUPABASE_KEY en Script Properties' };
  var res = UrlFetchApp.fetch(_url + '/rest/v1/rpc/bib_fn_reconciliar_storage', {
    method: 'POST',
    headers: { 'apikey': _key, 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
    payload: '{}',
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) {
    _auditar('reconciliacion', 'reconciliar_storage', 'error', 'error', res.getContentText().substring(0, 500));
    return { ok: false, error: res.getContentText() };
  }
  var filas = JSON.parse(res.getContentText());
  var hayFilas = Array.isArray(filas) && filas.length > 0;
  _auditar('reconciliacion', 'reconciliar_storage', 'ok', hayFilas ? 'advertencia' : 'info',
    (hayFilas ? filas.length + ' inconsistencias encontradas' : 'Sin inconsistencias') + ' (ejecución manual)');
  return { ok: true, filas: filas || [] };
}

// ── Borra archivos de Storage con la service_role key ─────────
// El navegador (rol authenticated) llamaba a _sb.storage.remove()
// directo y no fallaba con un error visible, pero tampoco borraba de
// verdad -- probablemente una policy de Storage que no cubre archivos
// subidos originalmente por el service_role (los que suben Gmail/GAS).
// Centralizar el borrado aqui, con la key que SI tiene permiso total
// (ya probado: la usa limpiarHuerfanosSinDueno), evita tener que
// adivinar/ajustar policies de Storage que no se pueden inspeccionar
// desde este entorno.
function _borrarArchivosStorage(rutas) {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return { ok: false, error: 'Faltan credenciales de Supabase' };
  if (!Array.isArray(rutas) || !rutas.length) return { ok: true, borrados: 0 };
  var borrados = 0;
  for (var i = 0; i < rutas.length; i += 100) {
    var lote = rutas.slice(i, i + 100);
    var delResp = UrlFetchApp.fetch(_url + '/storage/v1/object/biblioteca-adjuntos', {
      method: 'DELETE',
      headers: { apikey: _key, Authorization: 'Bearer ' + _key, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ prefixes: lote }),
      muteHttpExceptions: true
    });
    if (delResp.getResponseCode() < 400) {
      borrados += lote.length;
    } else {
      Logger.log('_borrarArchivosStorage: error en lote desde indice ' + i + ': ' + delResp.getContentText());
    }
  }
  return { ok: true, borrados: borrados };
}

// ── Elimina una solicitud completa desde el servidor ──────────
// Antes esto lo hacia confirmarEliminar() en modals.js directo desde el
// navegador: borraba bien la fila pero el archivo de Storage se quedaba
// huerfano (ver _borrarArchivosStorage arriba). Aqui se hace todo con
// la service_role key en un solo lugar: registrar en ignorados, borrar
// Storage, borrar pagos, borrar la solicitud (cascade se lleva
// documentos/trabajos/historial).
function _eliminarSolicitud(solicitudId, motivo) {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return { ok: false, error: 'Faltan credenciales de Supabase' };
  if (!solicitudId) return { ok: false, error: 'solicitudId requerido' };

  var sol = sbGet(_url, _key, 'bib_solicitudes?id=eq.' + encodeURIComponent(solicitudId) + '&select=gmail_message_id,remitente_email,asunto');
  if (!Array.isArray(sol) || !sol[0]) return { ok: false, error: 'Solicitud id=' + solicitudId + ' no encontrada' };
  var s = sol[0];

  if (s.gmail_message_id) {
    UrlFetchApp.fetch(_url + '/rest/v1/bib_mensajes_ignorados?on_conflict=gmail_message_id', {
      method: 'POST',
      headers: {
        apikey: _key, Authorization: 'Bearer ' + _key, 'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      payload: JSON.stringify({
        gmail_message_id: s.gmail_message_id,
        remitente_email:  s.remitente_email || null,
        asunto:           s.asunto          || null,
        motivo:           motivo            || null
      }),
      muteHttpExceptions: true
    });
  }

  var docsViejos = sbGet(_url, _key, 'bib_documentos?solicitud_id=eq.' + solicitudId + '&select=storage_path&storage_path=not.is.null');
  var rutas = (Array.isArray(docsViejos) ? docsViejos : []).map(function(d) { return d.storage_path; });
  var storageRes = _borrarArchivosStorage(rutas);
  if (rutas.length && (!storageRes.ok || storageRes.borrados < rutas.length)) {
    _auditar('correo', 'eliminar_solicitud', 'error', 'advertencia',
      'Solicitud id=' + solicitudId + ': solo ' + (storageRes.borrados || 0) + '/' + rutas.length + ' archivo(s) de Storage borrados');
  }

  UrlFetchApp.fetch(_url + '/rest/v1/bib_pagos?solicitud_id=eq.' + solicitudId,
    { method: 'DELETE', headers: { apikey: _key, Authorization: 'Bearer ' + _key, Prefer: 'return=minimal' }, muteHttpExceptions: true });

  var delSol = UrlFetchApp.fetch(_url + '/rest/v1/bib_solicitudes?id=eq.' + solicitudId,
    { method: 'DELETE', headers: { apikey: _key, Authorization: 'Bearer ' + _key, Prefer: 'return=minimal' }, muteHttpExceptions: true });
  if (delSol.getResponseCode() >= 400) {
    _auditar('correo', 'eliminar_solicitud', 'error', 'error',
      'Error borrando solicitud id=' + solicitudId + ': ' + delSol.getContentText().substring(0, 300));
    return { ok: false, error: delSol.getContentText() };
  }

  _auditar('correo', 'eliminar_solicitud', 'ok', 'info',
    'Solicitud id=' + solicitudId + ' eliminada (' + (storageRes.borrados || 0) + ' archivo(s) de Storage borrados)');
  return { ok: true };
}

// ── Limpieza ÚNICA de huérfanos sin dueño ─────────────────────
// Los archivos que bib_fn_recuperar_huerfanos() (sql/025) no pudo
// recuperar (resultado='sin_solicitud_coincidente') no perdieron el
// vínculo por error: su solicitud fue eliminada a propósito con
// "Eliminar correo" (antes de que esa función tuviera el fix de
// también borrar Storage — ver confirmarEliminar() en modals.js).
// Recrearles una solicitud sería revivir algo que alguien ya decidió
// borrar; lo correcto es terminar de borrarlos de Storage.
// Correr UNA VEZ desde el editor de Apps Script (seleccionar esta
// función → Ejecutar) — no está expuesta a la app a propósito, es
// limpieza de datos históricos, no una acción recurrente.
function limpiarHuerfanosSinDueno() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) { Logger.log('Faltan SUPABASE_URL/SUPABASE_KEY en Script Properties'); return; }

  var res = UrlFetchApp.fetch(_url + '/rest/v1/rpc/bib_fn_listar_huerfanos_sin_dueno', {
    method: 'POST',
    headers: { 'apikey': _key, 'Authorization': 'Bearer ' + _key, 'Content-Type': 'application/json' },
    payload: '{}',
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) { Logger.log('Error listando huérfanos sin dueño: ' + res.getContentText()); return; }

  var filas  = JSON.parse(res.getContentText());
  var rutas  = (Array.isArray(filas) ? filas : []).map(function(f) { return f.storage_path; });
  if (!rutas.length) { Logger.log('No hay huérfanos sin dueño para borrar.'); return; }

  var borrados = 0;
  for (var i = 0; i < rutas.length; i += 100) {
    var lote = rutas.slice(i, i + 100);
    var delResp = UrlFetchApp.fetch(_url + '/storage/v1/object/biblioteca-adjuntos', {
      method: 'DELETE',
      headers: { apikey: _key, Authorization: 'Bearer ' + _key, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ prefixes: lote }),
      muteHttpExceptions: true
    });
    if (delResp.getResponseCode() < 400) {
      borrados += lote.length;
    } else {
      Logger.log('Error borrando lote desde índice ' + i + ': ' + delResp.getContentText());
    }
  }
  Logger.log('Limpieza de huérfanos sin dueño: ' + borrados + ' de ' + rutas.length + ' archivo(s) borrados.');
  _auditar('reconciliacion', 'limpiar_huerfanos_sin_dueno', 'ok', 'info',
    borrados + ' de ' + rutas.length + ' archivo(s) sin solicitud borrados de Storage (ejecución manual única)');
}

// ── Limpieza ÚNICA: nombres feos de bib_fn_recuperar_huerfanos() ──
// Esa función (sql/025) reconstruyó nombre_archivo tomando "todo lo
// que sigue a la primera barra" del storage_path. Para adjuntos que
// originalmente eran links de Drive en el cuerpo del correo, esa ruta
// tiene la forma "drive_<ID de Drive>_nombre.pdf" (ver
// _procesarDriveLinks) — el nombre recuperado quedó feo, con el ID
// de Drive metido en el medio.
//
// Para cada fila con ese patrón y ya archivada (drive_link existe): se
// extrae el ID de la URL de Drive (delimitador "/d/", sin ambigüedad,
// a diferencia de intentar adivinar dónde termina el ID dentro del
// nombre feo) y se le pregunta a Drive su nombre real. Si además existe,
// en la misma solicitud, una fila "muerta" (sin storage_path ni
// drive_link, "Sin archivo") con exactamente ese nombre limpio, es un
// duplicado de cuando el archivo aún no se había recuperado — se borra,
// porque su contenido real ya vive en la fila que se acaba de renombrar.
//
// Solo cubre filas YA archivadas (con drive_link) porque solo ahí el ID
// se puede extraer sin ambigüedad. Las que todavía están en Storage con
// el nombre feo se resuelven solas si se vuelve a correr esta misma
// función después de que archivarAdjuntosAntiguos() las archive.
// Correr desde el editor de Apps Script — no está expuesta a la app.
function limpiarNombresRecuperados() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) { Logger.log('Faltan credenciales de Supabase'); return; }

  var candidatos = sbGet(_url, _key, 'bib_documentos?select=id,solicitud_id,nombre_archivo,drive_link&drive_link=not.is.null');
  if (!Array.isArray(candidatos)) { Logger.log('Error consultando bib_documentos: ' + JSON.stringify(candidatos)); return; }
  var feos = candidatos.filter(function(f) { return f.nombre_archivo && f.nombre_archivo.indexOf('drive_') === 0; });
  if (!feos.length) { Logger.log('No hay nombres feos pendientes de limpiar.'); return; }

  var renombrados = 0, borrados = 0, sinResolver = 0;
  feos.forEach(function(f) {
    try {
      var m = /\/d\/([a-zA-Z0-9_-]+)/.exec(f.drive_link);
      if (!m) { sinResolver++; Logger.log('No se pudo extraer ID de Drive de: ' + f.drive_link); return; }
      var nombreReal = DriveApp.getFileById(m[1]).getName();

      var muertos = sbGet(_url, _key,
        'bib_documentos?select=id&solicitud_id=eq.' + f.solicitud_id +
        '&nombre_archivo=eq.' + encodeURIComponent(nombreReal) +
        '&storage_path=is.null&drive_link=is.null'
      );
      if (Array.isArray(muertos) && muertos.length) {
        muertos.forEach(function(mu) {
          UrlFetchApp.fetch(_url + '/rest/v1/bib_documentos?id=eq.' + mu.id,
            { method: 'DELETE', headers: { apikey: _key, Authorization: 'Bearer ' + _key, Prefer: 'return=minimal' }, muteHttpExceptions: true });
          borrados++;
        });
      }

      sbPatch(_url, _key, 'bib_documentos?id=eq.' + f.id, { nombre_archivo: nombreReal });
      renombrados++;
    } catch(e) {
      sinResolver++;
      Logger.log('Error resolviendo id=' + f.id + ': ' + e.toString());
    }
  });

  Logger.log('Limpieza de nombres: ' + renombrados + ' renombrados, ' + borrados + ' duplicado(s) muerto(s) borrados, ' + sinResolver + ' sin resolver.');
  _auditar('mantenimiento', 'limpiar_nombres_recuperados', 'ok', 'info',
    renombrados + ' renombrado(s), ' + borrados + ' duplicado(s) borrado(s), ' + sinResolver + ' sin resolver');
}

// ── Ejecutar manualmente para probar sin esperar al fin de mes ─
function exportarMesManual() {
  var hoy = new Date();
  _exportarMes(hoy.getFullYear(), hoy.getMonth());
}

// ── Motor principal de exportación ───────────────────────────
function _exportarMes(ano, mes) {
  var t0 = Date.now();
  try {
    var res = _exportarMesImpl(ano, mes);
    _auditar('reporte_mensual', 'generar_reporte', 'ok', 'info', res.nombre, Date.now() - t0);
    return res;
  } catch(e) {
    _auditar('reporte_mensual', 'generar_reporte', 'error', 'error', ano + '-' + (mes+1) + ': ' + e.toString(), Date.now() - t0);
    throw e;
  }
}

function _exportarMesImpl(ano, mes) {
  var _url = _cfg('SUPABASE_URL');
  var _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) throw new Error('SUPABASE_URL o SUPABASE_KEY no configurados en Script Properties');
  var nom = _MESES_GAS[mes];
  var ini = Utilities.formatDate(new Date(ano, mes, 1),     'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var fin = Utilities.formatDate(new Date(ano, mes + 1, 1), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  Logger.log('Exportando ' + nom + ' ' + ano + ' (' + ini + ' → ' + fin + ')');

  // Consultas Supabase — cada tipo trae lo del mes MAS lo que haya quedado
  // sin gestionar de meses anteriores (arrastre), para que nada pendiente
  // desaparezca de los reportes solo porque cambio el mes.
  var qFecha = 'fecha_recepcion=gte.' + ini + '&fecha_recepcion=lt.' + fin;
  var selectSol = 'id,id_solicitud,fecha_recepcion,remitente_email,asunto,estado,destinatarios,' +
    'profesor,nombre_recibe,notif_impreso_en,fecha_entrega,' +
    'bib_documentos(num_hojas,tipo_impresion,forma_impresion)';
  var sols = sbGet(_url, _key, 'bib_solicitudes?' + qFecha + '&select=' + selectSol + '&order=fecha_recepcion.asc');
  var solsPend = sbGet(_url, _key,
    'bib_solicitudes?fecha_recepcion=lt.' + ini + '&estado=not.in.(entregado,cancelado)' +
    '&select=' + selectSol + '&order=fecha_recepcion.asc');

  var trabs = sbGet(_url, _key,
    'bib_trabajos_impresion?created_at=gte.' + ini + '&created_at=lt.' + fin +
    '&select=solicitud_id,nombre,profesor,total_hojas,archivos');

  var selectVentas = 'id,id_solicitud,fecha_recepcion,remitente_email,asunto,estado,' +
    'bib_trabajos_personal(precio_total,valor_pagado)';
  var ventas = sbGet(_url, _key,
    'bib_solicitudes?' + qFecha + '&tipo_remitente=eq.personal&select=' + selectVentas + '&order=fecha_recepcion.asc');
  var ventasPend = sbGet(_url, _key,
    'bib_solicitudes?fecha_recepcion=lt.' + ini + '&tipo_remitente=eq.personal&estado=not.in.(entregado,cancelado)' +
    '&select=' + selectVentas + '&order=fecha_recepcion.asc');

  var qFechaMov = 'created_at=gte.' + ini + '&created_at=lt.' + fin;
  var selectMov = 'id,id_movimiento,tipo,colaborador_nombre,area,fecha_limite_devolucion,fecha_devolucion_real';
  var movs = sbGet(_url, _key, 'bib_movimientos?' + qFechaMov + '&select=' + selectMov + '&order=created_at.asc');
  var movsPend = sbGet(_url, _key,
    'bib_movimientos?created_at=lt.' + ini + '&tipo=neq.consumo&fecha_devolucion_real=is.null' +
    '&select=' + selectMov + '&order=created_at.asc');
  if (!Array.isArray(movsPend)) movsPend = [];

  var lineasMov = sbGet(_url, _key,
    'bib_movimiento_materiales?select=movimiento_id,nombre,cantidad_entregada,unidad_medida,cantidad_devuelta,bib_movimientos!inner(created_at)' +
    '&bib_movimientos.created_at=gte.' + ini + '&bib_movimientos.created_at=lt.' + fin);
  var lineasMovPend = [];
  if (movsPend.length) {
    var idsPend = movsPend.map(function(m){ return m.id; }).join(',');
    lineasMovPend = sbGet(_url, _key,
      'bib_movimiento_materiales?movimiento_id=in.(' + idsPend + ')' +
      '&select=movimiento_id,nombre,cantidad_entregada,unidad_medida,cantidad_devuelta');
  }

  var selectLib = 'id,id_prestamo,libro_titulo,tipo_prestatario,prestatario_nombre,es_institucional,fecha_limite_devolucion,fecha_devolucion_real';
  var libros = sbGet(_url, _key,
    'bib_prestamos_libros?fecha_prestamo=gte.' + ini + '&fecha_prestamo=lt.' + fin + '&select=' + selectLib + '&order=fecha_prestamo.asc');
  var librosPend = sbGet(_url, _key,
    'bib_prestamos_libros?fecha_prestamo=lt.' + ini + '&fecha_devolucion_real=is.null' +
    '&select=' + selectLib + '&order=fecha_prestamo.asc');

  if (!Array.isArray(sols))         throw new Error('Error solicitudes: ' + JSON.stringify(sols));
  if (!Array.isArray(trabs))        trabs         = [];
  if (!Array.isArray(ventas))       ventas        = [];
  if (!Array.isArray(movs))         movs          = [];
  if (!Array.isArray(lineasMov))    lineasMov     = [];
  if (!Array.isArray(libros))       libros        = [];
  if (!Array.isArray(solsPend))     solsPend      = [];
  if (!Array.isArray(ventasPend))   ventasPend    = [];
  if (!Array.isArray(lineasMovPend)) lineasMovPend = [];
  if (!Array.isArray(librosPend))   librosPend    = [];

  sols      = solsPend.concat(sols);
  ventas    = ventasPend.concat(ventas);
  movs      = movsPend.concat(movs);
  lineasMov = lineasMovPend.concat(lineasMov);
  libros    = librosPend.concat(libros);

  Logger.log('Datos: ' + sols.length + ' sols (+' + solsPend.length + ' arrastradas), ' + trabs.length + ' trabs, ' +
    ventas.length + ' ventas (+' + ventasPend.length + ' arrastradas), ' +
    movs.length + ' movs (+' + movsPend.length + ' arrastrados), ' +
    libros.length + ' libros (+' + librosPend.length + ' arrastrados)');

  // Crear Google Spreadsheet
  var nombre = 'Biblioteca_' + nom + '_' + ano;
  var ss = SpreadsheetApp.create(nombre);
  _crearHojaResumen(ss, sols, trabs, ventas, movs, libros, nom, ano);
  _crearHojaSolicitudes(ss, sols, nom, ano);
  _crearHojaTrabajosImp(ss, sols, trabs, nom, ano);
  _crearHojaVentas(ss, ventas, nom, ano);
  _crearHojaMovimientos(ss, movs, lineasMov, nom, ano);
  _crearHojaLibros(ss, libros, nom, ano);
  // Borrar hoja por defecto vacía
  ['Sheet1','Hoja 1','Hoja1'].forEach(function(n) {
    var def = ss.getSheetByName(n);
    if (def && ss.getNumSheets() > 1) ss.deleteSheet(def);
  });
  SpreadsheetApp.flush();

  // Exportar como XLSX
  var token    = ScriptApp.getOAuthToken();
  var xlsxResp = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
  );
  if (xlsxResp.getResponseCode() !== 200) {
    throw new Error('Error exportando XLSX: ' + xlsxResp.getContentText().substring(0, 300));
  }
  var xlsxBlob = xlsxResp.getBlob().setName(nombre + '.xlsx');

  // Guardar en carpeta Drive
  var carpeta  = _carpetaReportes();
  carpeta.createFile(xlsxBlob);
  var ssFile = DriveApp.getFileById(ss.getId());
  carpeta.addFile(ssFile);
  DriveApp.getRootFolder().removeFile(ssFile);

  // Enviar email
  var emailDest = _cfg('REPORTE_EMAIL') || Session.getActiveUser().getEmail();
  var emails    = emailDest.split(',').map(function(e){return e.trim();}).filter(Boolean);
  var htmlBody  = _htmlEmailReporte(nom, ano, sols, ventas, movs, libros, 'https://drive.google.com/drive/folders/' + carpeta.getId());
  emails.forEach(function(email) {
    GmailApp.sendEmail(email,
      'Reporte Biblioteca ' + nom + ' ' + ano + ' — guardado automaticamente',
      'Reporte adjunto.',
      { htmlBody: htmlBody, attachments: [xlsxBlob.copyBlob()], name: 'Biblioteca Goyavier' }
    );
  });
  Logger.log('OK: ' + nombre + '.xlsx enviado a ' + emailDest);
  return { ok: true, nombre: nombre };
}

// ── Hoja RESUMEN (KPIs generales + ventas) ────────────────────
function _crearHojaResumen(ss, sols, trabs, ventas, movs, libros, nom, ano) {
  var sh = ss.insertSheet('Resumen');
  sh.setColumnWidth(1,220); sh.setColumnWidth(2,110); sh.setColumnWidth(3,110);
  sh.setColumnWidth(4,110); sh.setColumnWidth(5,110);

  function fHdr(row, txt, bg, fg, sz) {
    sh.getRange(row,1,1,5).merge().setValue(txt)
      .setBackground(bg).setFontColor(fg||'#FFFFFF')
      .setFontWeight('bold').setFontSize(sz||11).setVerticalAlignment('middle');
    sh.setRowHeight(row, 28);
  }
  function fKpiLbl(row, lbls, bg) {
    for (var i=0;i<lbls.length;i++) {
      sh.getRange(row,i+1).setValue(lbls[i]).setBackground(bg||'#F1F5F9')
        .setFontWeight('bold').setFontSize(9).setFontColor('#334155')
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    }
    sh.setRowHeight(row, 18);
  }
  function fKpiVal(row, vals, bgs) {
    for (var i=0;i<vals.length;i++) {
      sh.getRange(row,i+1).setValue(vals[i]).setBackground(bgs[i])
        .setFontWeight('bold').setFontSize(14).setFontColor('#0f172a')
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
    }
    sh.setRowHeight(row, 34);
  }

  var r = 1;
  fHdr(r++, 'BIBLIOTECA GOYAVIER — Reporte ' + nom + ' ' + ano, '#1e3a5f', '#FFFFFF', 13);
  fHdr(r++, 'Generado: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'), '#2c7be5', '#FFFFFF', 10);
  sh.setRowHeight(r++, 8);

  // Solicitudes
  var cnt = {pendiente:0,recibido:0,impreso:0,entregado:0,cancelado:0};
  var hTot=0,hBN=0,hCo=0,hUn=0,hDo=0;
  sols.forEach(function(s) {
    cnt[s.estado]=(cnt[s.estado]||0)+1;
    (s.bib_documentos||[]).forEach(function(d){
      var h=d.num_hojas||0; hTot+=h;
      if(d.tipo_impresion==='Blanco y negro')hBN+=h;
      if(d.tipo_impresion==='Color')hCo+=h;
      if(d.forma_impresion==='Una cara')hUn+=h;
      if(d.forma_impresion==='Doble cara')hDo+=h;
    });
  });
  fHdr(r++, 'SOLICITUDES DEL MES', '#334155', '#FFFFFF');
  fKpiLbl(r++, ['Pendientes','Recibidas','Impresas','Entregadas','Canceladas']);
  fKpiVal(r++, [cnt.pendiente,cnt.recibido,cnt.impreso,cnt.entregado,cnt.cancelado],
    ['#FEF9C3','#DBEAFE','#EDE9FE','#DCFCE7','#FEE2E2']);
  sh.getRange(r,1).setValue('Total solicitudes').setFontWeight('bold').setBackground('#F1F5F9');
  sh.getRange(r,2).setValue(sols.length).setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');
  sh.setRowHeight(r++, 24);
  sh.setRowHeight(r++, 8);

  fHdr(r++, 'IMPRESION DEL MES', '#334155', '#FFFFFF');
  fKpiLbl(r++, ['Total hojas','Blanco y negro','Color','Una cara','Doble cara']);
  fKpiVal(r++, [hTot,hBN,hCo,hUn,hDo], ['#DBEAFE','#F1F5F9','#F1F5F9','#F1F5F9','#F1F5F9']);
  sh.setRowHeight(r++, 8);

  // Ventas resumen
  var totCob=0,totRec=0;
  ventas.forEach(function(v){
    var tt=v.bib_trabajos_personal||[];
    totCob+=tt.reduce(function(a,t){return a+(t.precio_total||0);},0);
    totRec+=tt.reduce(function(a,t){return a+(t.valor_pagado||0);},0);
  });
  function pesos(n){return '$ '+Math.round(n||0).toLocaleString();}
  fHdr(r++, 'VENTAS DEL MES', '#1a5632', '#FFFFFF');
  fKpiLbl(r++, ['Solicitudes','Total Cobrado','Total Recibido','Saldo'], '#E6F4EA');
  fKpiVal(r++, [ventas.length, pesos(totCob), pesos(totRec), pesos(totCob-totRec)],
    ['#DBEAFE','#DCFCE7','#DCFCE7',(totCob-totRec)>0?'#FEE2E2':'#DCFCE7']);
  sh.setRowHeight(r++, 8);

  // Top solicitantes
  var topMap={};
  sols.filter(function(s){return s.estado==='entregado';}).forEach(function(s){
    var k=s.profesor||s.remitente_email||'Desconocido';
    topMap[k]=(topMap[k]||0)+(s.bib_documentos||[]).reduce(function(a,d){return a+(d.num_hojas||0);},0);
  });
  var topArr=Object.keys(topMap).map(function(k){return[k,topMap[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  if (topArr.length) {
    fHdr(r++, 'TOP SOLICITANTES (hojas entregadas)', '#334155', '#FFFFFF');
    sh.getRange(r,1).setValue('Nombre / Correo').setFontWeight('bold').setBackground('#F1F5F9').setFontSize(9);
    sh.getRange(r,2).setValue('Hojas').setFontWeight('bold').setBackground('#F1F5F9').setFontSize(9).setHorizontalAlignment('center');
    sh.setRowHeight(r++, 18);
    topArr.forEach(function(item,i){
      var bg=i%2===0?'#FFFFFF':'#F8FAFC';
      sh.getRange(r,1).setValue(item[0]).setBackground(bg);
      sh.getRange(r,2).setValue(item[1]).setBackground(bg).setHorizontalAlignment('center').setFontWeight('bold');
      sh.setRowHeight(r++, 18);
    });
  }
  sh.setRowHeight(r++, 8);

  // Movimientos de materiales
  var cntMov = {prestamo:0, asignacion:0, consumo:0};
  var devMov=0, actMov=0, venMov=0;
  var hoyD = new Date(); hoyD.setHours(0,0,0,0);
  movs.forEach(function(m) {
    cntMov[m.tipo] = (cntMov[m.tipo]||0) + 1;
    if (m.tipo !== 'consumo') {
      if (m.fecha_devolucion_real) devMov++;
      else if (m.fecha_limite_devolucion && new Date(m.fecha_limite_devolucion+'T00:00:00') < hoyD) venMov++;
      else actMov++;
    }
  });
  fHdr(r++, 'MOVIMIENTOS DE MATERIALES', '#334155', '#FFFFFF');
  fKpiLbl(r++, ['Prestamos','Asignaciones','Consumos','Total']);
  fKpiVal(r++, [cntMov.prestamo||0, cntMov.asignacion||0, cntMov.consumo||0, movs.length],
    ['#DBEAFE','#DBEAFE','#F1F5F9','#EDE9FE']);
  fKpiLbl(r++, ['Devueltos','Activos','Vencidos','']);
  fKpiVal(r++, [devMov, actMov, venMov, ''], ['#DCFCE7','#DBEAFE','#FEE2E2','#FFFFFF']);
  sh.setRowHeight(r++, 8);

  // Prestamos de libros
  var cntLib = {estudiante:0, colaborador:0, institucional:0};
  libros.forEach(function(l) { cntLib[l.tipo_prestatario] = (cntLib[l.tipo_prestatario]||0) + 1; });
  fHdr(r++, 'PRESTAMOS DE LIBROS', '#334155', '#FFFFFF');
  fKpiLbl(r++, ['Estudiantes','Colaboradores','Institucionales','Total']);
  fKpiVal(r++, [cntLib.estudiante||0, cntLib.colaborador||0, cntLib.institucional||0, libros.length],
    ['#DBEAFE','#DBEAFE','#EDE9FE','#F1F5F9']);
}

// ── Hoja SOLICITUDES ──────────────────────────────────────────
function _crearHojaSolicitudes(ss, sols, nom, ano) {
  var sh = ss.insertSheet('Solicitudes');
  [30,110,120,200,220,90,230,75,75,75,80,85,115,115,170].forEach(function(w,i){sh.setColumnWidth(i+1,w);});
  var BGEST={pendiente:'#FEF9C3',recibido:'#DBEAFE',impreso:'#EDE9FE',entregado:'#DCFCE7',cancelado:'#FEE2E2'};
  var FGEST={pendiente:'#713F12',recibido:'#1E40AF',impreso:'#5B21B6',entregado:'#166534',cancelado:'#991B1B'};

  sh.getRange(1,1,1,15).merge().setValue('SOLICITUDES — ' + nom + ' ' + ano)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sh.setRowHeight(1, 28);
  var hdrs=['N','ID Sistema','Fecha','Remitente','Asunto','Estado','Notificar a','Hojas','B y N','Color','1 cara','2 caras','F. Impresion','F. Entrega','Entregado a'];
  sh.getRange(2,1,1,15).setValues([hdrs]).setBackground('#475569').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(2, 20);
  sh.setFrozenRows(2);

  var rows=[], tz=Session.getScriptTimeZone();
  sols.forEach(function(s,i){
    var docs=s.bib_documentos||[];
    var hT=docs.reduce(function(a,d){return a+(d.num_hojas||0);},0);
    var hB=docs.filter(function(d){return d.tipo_impresion==='Blanco y negro';}).reduce(function(a,d){return a+(d.num_hojas||0);},0);
    var hC=docs.filter(function(d){return d.tipo_impresion==='Color';}).reduce(function(a,d){return a+(d.num_hojas||0);},0);
    var hU=docs.filter(function(d){return d.forma_impresion==='Una cara';}).reduce(function(a,d){return a+(d.num_hojas||0);},0);
    var hD=docs.filter(function(d){return d.forma_impresion==='Doble cara';}).reduce(function(a,d){return a+(d.num_hojas||0);},0);
    var dest=Array.isArray(s.destinatarios)?s.destinatarios.map(function(d){return typeof d==='string'?d:(d.nombre||d.email);}).join(', '):'';
    var fR=s.fecha_recepcion?Utilities.formatDate(new Date(s.fecha_recepcion),tz,'dd/MM/yyyy HH:mm'):'';
    var fI=s.notif_impreso_en?Utilities.formatDate(new Date(s.notif_impreso_en),tz,'dd/MM/yyyy'):'';
    var fE=(s.fecha_entrega||s.notif_entregado_en)?Utilities.formatDate(new Date(s.fecha_entrega||s.notif_entregado_en),tz,'dd/MM/yyyy'):'';
    var est=(s.estado||'')[0].toUpperCase()+(s.estado||'').slice(1);
    rows.push([i+1,s.id_solicitud||'',fR,s.remitente_email||'',s.asunto||'',est,dest,hT,hB,hC,hU,hD,fI,fE,s.nombre_recibe||'']);
  });
  if (rows.length) {
    sh.getRange(3,1,rows.length,15).setValues(rows);
    sols.forEach(function(s,i){
      var bg=BGEST[s.estado]||(i%2===0?'#FFFFFF':'#F8FAFC');
      var fg=FGEST[s.estado]||'#1e293b';
      sh.getRange(i+3,1,1,15).setBackground(bg).setFontColor(fg);
      sh.setRowHeight(i+3,18);
    });
    var hTotAll=rows.reduce(function(a,r){return a+(r[7]||0);},0);
    var tr=rows.length+3;
    sh.getRange(tr,1,1,15).setValues([['TOTAL','','','','',sols.length+'','',hTotAll,'','','','','','','']]);
    sh.getRange(tr,1,1,15).setBackground('#E2E8F0').setFontWeight('bold').setFontColor('#0f172a');
    sh.setRowHeight(tr,22);
  }
}

// ── Hoja TRABAJOS IMPRESION ───────────────────────────────────
function _crearHojaTrabajosImp(ss, sols, trabs, nom, ano) {
  var sh = ss.insertSheet('Trabajos Impresion');
  [30,110,230,180,90,80,380].forEach(function(w,i){sh.setColumnWidth(i+1,w);});
  sh.getRange(1,1,1,7).merge().setValue('TRABAJOS DE IMPRESION — ' + nom + ' ' + ano)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sh.setRowHeight(1,28);
  sh.getRange(2,1,1,7).setValues([['N','ID Solicitud','Nombre Trabajo','Colaborador','Hojas','Archivos','Detalle']])
    .setBackground('#475569').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sh.setRowHeight(2,20); sh.setFrozenRows(2);
  var solMap={};
  sols.forEach(function(s){solMap[s.id]=s.id_solicitud;});
  var rows=[];
  trabs.forEach(function(t,i){
    var arch=Array.isArray(t.archivos)?t.archivos:[];
    var det=arch.map(function(a){return (a.nombre||'')+'('+a.copias+'c x '+a.paginas+'p, '+(a.tipo_impresion||'')+', '+(a.tamano_hoja||'')+')';}).join(' | ');
    rows.push([i+1,solMap[t.solicitud_id]||'',t.nombre||'',t.profesor||'',t.total_hojas||0,arch.length,det]);
  });
  if (rows.length) {
    sh.getRange(3,1,rows.length,7).setValues(rows);
    rows.forEach(function(_,i){
      sh.getRange(i+3,1,1,7).setBackground(i%2===0?'#FFFFFF':'#F8FAFC');
      sh.setRowHeight(i+3,18);
    });
    sh.getRange(3,7,rows.length,1).setWrap(true);
    var tr=rows.length+3;
    var hTotTrab=trabs.reduce(function(a,t){return a+(t.total_hojas||0);},0);
    var archTot=trabs.reduce(function(a,t){return a+(Array.isArray(t.archivos)?t.archivos.length:0);},0);
    sh.getRange(tr,1,1,7).setValues([['TOTAL','','','',hTotTrab,archTot,'']]);
    sh.getRange(tr,1,1,7).setBackground('#E2E8F0').setFontWeight('bold').setFontColor('#0f172a');
    sh.setRowHeight(tr,22);
  }
}

// ── Hoja VENTAS ───────────────────────────────────────────────
function _crearHojaVentas(ss, ventas, nom, ano) {
  var sh = ss.insertSheet('Ventas');
  [30,100,220,250,110,80,120,120,120].forEach(function(w,i){sh.setColumnWidth(i+1,w);});
  var BVST={pagado:'#DCFCE7',deuda:'#FEE2E2',sin:'#F1F5F9',cancelado:'#FEE2E2'};
  var FVST={pagado:'#166534',deuda:'#991B1B',sin:'#475569',cancelado:'#991B1B'};
  var tz=Session.getScriptTimeZone();
  function pesos(n){return '$ '+Math.round(n||0).toLocaleString();}

  var totCob=0,totRec=0,cPag=0,cDeu=0,cSin=0,cCan=0;
  ventas.forEach(function(r){
    if(r.estado==='cancelado'){cCan++;return;}
    var tt=r.bib_trabajos_personal||[];
    var co=tt.reduce(function(a,t){return a+(t.precio_total||0);},0);
    var re=tt.reduce(function(a,t){return a+(t.valor_pagado||0);},0);
    totCob+=co; totRec+=re;
    if(!tt.length)cSin++; else if(co-re>0.005)cDeu++; else cPag++;
  });

  sh.getRange(1,1,1,9).merge().setValue('VENTAS — ' + nom + ' ' + ano)
    .setBackground('#1a5632').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sh.setRowHeight(1,28);
  sh.getRange(2,1,1,4).setValues([['Total Cobrado','Total Recibido','Saldo Pendiente','Solicitudes']])
    .setBackground('#166534').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sh.setRowHeight(2,18);
  [pesos(totCob),pesos(totRec),pesos(totCob-totRec),ventas.length].forEach(function(v,i){
    sh.getRange(3,i+1).setValue(v).setBackground(i===2&&(totCob-totRec)>0?'#FEE2E2':'#DCFCE7')
      .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('center');
  });
  sh.setRowHeight(3,32);
  sh.getRange(4,1,1,4).setValues([['Pagadas','Con deuda','Sin registrar','Canceladas']])
    .setBackground('#166534').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sh.setRowHeight(4,18);
  [cPag,cDeu,cSin,cCan].forEach(function(v,i){
    sh.getRange(5,i+1).setValue(v).setBackground(['#DCFCE7','#FEE2E2','#F1F5F9','#F1F5F9'][i])
      .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  });
  sh.setRowHeight(5,32);
  sh.setRowHeight(6,10);
  sh.getRange(7,1,1,9).setValues([['N','Fecha','Remitente','Asunto','Estado Pago','Trabajos','Cobrado','Recibido','Saldo']])
    .setBackground('#14532D').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sh.setRowHeight(7,20); sh.setFrozenRows(7);

  var rows=[];
  ventas.forEach(function(s,i){
    var tt=s.bib_trabajos_personal||[];
    var co=tt.reduce(function(a,t){return a+(t.precio_total||0);},0);
    var re=tt.reduce(function(a,t){return a+(t.valor_pagado||0);},0);
    var sd=co-re;
    var ep,estKey;
    if(s.estado==='cancelado'){ep='Cancelada';estKey='cancelado';}
    else if(!tt.length){ep='Sin registrar';estKey='sin';}
    else if(sd>0.005){ep='Con deuda';estKey='deuda';}
    else{ep='Pagado';estKey='pagado';}
    var f=s.fecha_recepcion?Utilities.formatDate(new Date(s.fecha_recepcion),tz,'dd/MM/yyyy'):'';
    rows.push({v:[i+1,f,s.remitente_email||'',s.asunto||'',ep,tt.length,pesos(co),pesos(re),sd>0.005?pesos(sd):'—'],k:estKey});
  });
  if (rows.length) {
    sh.getRange(8,1,rows.length,9).setValues(rows.map(function(r){return r.v;}));
    rows.forEach(function(r,i){
      sh.getRange(8+i,1,1,9).setBackground(BVST[r.k]||(i%2===0?'#FFFFFF':'#F0FDF4')).setFontColor(FVST[r.k]||'#1e293b');
      sh.setRowHeight(8+i,18);
    });
    var tr=8+rows.length;
    sh.getRange(tr,1,1,9).setValues([['TOTAL','','','','',ventas.length,pesos(totCob),pesos(totRec),pesos(totCob-totRec)]]);
    sh.getRange(tr,1,1,9).setBackground('#BBF7D0').setFontWeight('bold').setFontColor('#14532D');
    sh.setRowHeight(tr,24);
  }
}

// ── Hoja MOVIMIENTOS (materiales) ─────────────────────────────
function _crearHojaMovimientos(ss, movs, lineasMov, nom, ano) {
  var sh = ss.insertSheet('Movimientos');
  [30,100,90,180,140,90,100,120,320].forEach(function(w,i){sh.setColumnWidth(i+1,w);});
  var tipoLbl = {prestamo:'Prestamo', asignacion:'Asignacion', consumo:'Consumo'};
  var tz = Session.getScriptTimeZone();
  var hoyD = new Date(); hoyD.setHours(0,0,0,0);
  var BGEST = {Devuelto:'#DCFCE7', Activo:'#DBEAFE', Vencido:'#FEE2E2'};

  var matPorMov = {};
  lineasMov.forEach(function(l) {
    if (!matPorMov[l.movimiento_id]) matPorMov[l.movimiento_id] = [];
    matPorMov[l.movimiento_id].push(l.cantidad_entregada + (l.cantidad_devuelta ? ' (dev. ' + l.cantidad_devuelta + ')' : '') + ' ' + l.unidad_medida + ' de ' + l.nombre);
  });

  sh.getRange(1,1,1,9).merge().setValue('MOVIMIENTOS DE MATERIALES — ' + nom + ' ' + ano)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sh.setRowHeight(1,28);
  sh.getRange(2,1,1,9).setValues([['N','ID','Tipo','Colaborador','Area','Estado','Fecha limite','Devuelto','Materiales']])
    .setBackground('#475569').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sh.setRowHeight(2,20); sh.setFrozenRows(2);

  var rows = [], bgs = [];
  movs.forEach(function(m, i) {
    var esDev = m.tipo !== 'consumo';
    var estado = '—';
    if (esDev) {
      if (m.fecha_devolucion_real) estado = 'Devuelto';
      else if (m.fecha_limite_devolucion && new Date(m.fecha_limite_devolucion+'T00:00:00') < hoyD) estado = 'Vencido';
      else estado = 'Activo';
    }
    var fDev = m.fecha_devolucion_real ? Utilities.formatDate(new Date(m.fecha_devolucion_real), tz, 'dd/MM/yyyy') : '';
    rows.push([i+1, m.id_movimiento||'', tipoLbl[m.tipo]||m.tipo, m.colaborador_nombre||'', m.area||'',
      estado, m.fecha_limite_devolucion||'', fDev, (matPorMov[m.id]||[]).join(' | ')]);
    bgs.push(esDev ? (BGEST[estado]||'#FFFFFF') : (i%2===0?'#FFFFFF':'#F8FAFC'));
  });
  if (rows.length) {
    sh.getRange(3,1,rows.length,9).setValues(rows);
    rows.forEach(function(_, i) {
      sh.getRange(i+3,1,1,9).setBackground(bgs[i]);
      sh.setRowHeight(i+3, 18);
    });
    sh.getRange(3,9,rows.length,1).setWrap(true);
    var tr = rows.length+3;
    sh.getRange(tr,1,1,9).setValues([['TOTAL','','','','','','','',movs.length+' movimientos']]);
    sh.getRange(tr,1,1,9).setBackground('#E2E8F0').setFontWeight('bold').setFontColor('#0f172a');
    sh.setRowHeight(tr,22);
  }
}

// ── Hoja PRESTAMOS DE LIBROS ───────────────────────────────────
function _crearHojaLibros(ss, libros, nom, ano) {
  var sh = ss.insertSheet('Prestamos Libros');
  [30,100,220,180,110,90,100,120].forEach(function(w,i){sh.setColumnWidth(i+1,w);});
  var tipoLbl = {estudiante:'Estudiante', colaborador:'Colaborador', institucional:'Institucional'};
  var tz = Session.getScriptTimeZone();
  var hoyD = new Date(); hoyD.setHours(0,0,0,0);
  var BGEST = {Devuelto:'#DCFCE7', Activo:'#DBEAFE', Vencido:'#FEE2E2'};

  sh.getRange(1,1,1,8).merge().setValue('PRESTAMOS DE LIBROS — ' + nom + ' ' + ano)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle');
  sh.setRowHeight(1,28);
  sh.getRange(2,1,1,8).setValues([['N','ID','Libro','Prestatario','Tipo','Institucional','Fecha limite','Devuelto']])
    .setBackground('#475569').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sh.setRowHeight(2,20); sh.setFrozenRows(2);

  var rows = [], bgs = [];
  libros.forEach(function(l, i) {
    var estado = '—';
    if (!l.es_institucional) {
      if (l.fecha_devolucion_real) estado = 'Devuelto';
      else if (l.fecha_limite_devolucion && new Date(l.fecha_limite_devolucion+'T00:00:00') < hoyD) estado = 'Vencido';
      else estado = 'Activo';
    }
    var fDev = l.fecha_devolucion_real ? Utilities.formatDate(new Date(l.fecha_devolucion_real), tz, 'dd/MM/yyyy') : '';
    rows.push([i+1, l.id_prestamo||'', l.libro_titulo||'', l.prestatario_nombre||'', tipoLbl[l.tipo_prestatario]||l.tipo_prestatario,
      l.es_institucional?'Si':'No', l.fecha_limite_devolucion||'', fDev]);
    bgs.push(!l.es_institucional ? (BGEST[estado]||'#FFFFFF') : (i%2===0?'#FFFFFF':'#F8FAFC'));
  });
  if (rows.length) {
    sh.getRange(3,1,rows.length,8).setValues(rows);
    rows.forEach(function(_, i) {
      sh.getRange(i+3,1,1,8).setBackground(bgs[i]);
      sh.setRowHeight(i+3, 18);
    });
    var tr = rows.length+3;
    sh.getRange(tr,1,1,8).setValues([['TOTAL','','','','','','',libros.length+' prestamos']]);
    sh.getRange(tr,1,1,8).setBackground('#E2E8F0').setFontWeight('bold').setFontColor('#0f172a');
    sh.setRowHeight(tr,22);
  }
}

// ── Carpeta en Drive para guardar reportes ────────────────────
function _carpetaReportes() {
  var nombre = 'Biblioteca Goyavier - Reportes';
  var it = DriveApp.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nombre);
}

// ── Carpeta en Drive para archivar adjuntos viejos ────────────
// Organizada por año/mes (a diferencia de _carpetaReportes, que es
// plana con ~12 archivos/año) porque aquí se espera acumular muchos
// adjuntos con el tiempo. Se comparte a nivel de dominio (cualquiera
// con cuenta @colegiogoyavier.edu.co y el link) — ni público, ni
// restringido solo al dueño de la cuenta de GAS.
function _carpetaArchivoAdjuntos(ano, mes) {
  var raizNombre = 'Biblioteca Goyavier - Archivo de Adjuntos';
  var itRaiz = DriveApp.getFoldersByName(raizNombre);
  var raiz = itRaiz.hasNext() ? itRaiz.next() : DriveApp.createFolder(raizNombre);
  try { raiz.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}

  var subNombre = ano + '-' + String(mes + 1).padStart(2, '0');
  var itSub = raiz.getFoldersByName(subNombre);
  if (itSub.hasNext()) return itSub.next();
  var sub = raiz.createFolder(subNombre);
  try { sub.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
  return sub;
}

// ── Archiva a Drive y borra de Supabase Storage los adjuntos de
// solicitudes ya resueltas (entregado/cancelado) de meses anteriores ──
// El archivo NUNCA se pierde: se descarga de Storage, se sube a Drive,
// se actualiza bib_documentos (storage_path=null, drive_link=<url>) y
// solo entonces se borra de Storage — la app ya sabe mostrar
// "Abrir en Google Drive" cuando storage_path es null y drive_link
// existe (mismo camino que ya usan los adjuntos compartidos por link
// de Drive en el correo original, ver _procesarDriveLinks).
// Corre disparada por verificarFechasMes() (diaria) y también se puede
// ejecutar manualmente desde Mantenimiento — al ser diaria y basada en
// storage_path IS NOT NULL, es normal que la mayoría de los días no
// encuentre nada nuevo que archivar.
function archivarAdjuntosAntiguos() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) return { ok: false, error: 'Faltan credenciales de Supabase' };

  // El trigger diario y el boton manual de Mantenimiento pueden llegar a
  // coincidir en el tiempo (o dos clics seguidos si la primera vuelta
  // tarda) -- sin este lock, ambas ejecuciones podrian tomar el mismo
  // documento a la vez y subirlo dos veces a Drive. Mismo patron que ya
  // usan sincronizarCorreos/reprocesarCorreo.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    return { ok: false, error: 'Ya hay un archivado en curso. Intenta de nuevo en unos segundos.' };
  }
  try {
    var hoy = new Date();
    var inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();

    var docs = sbGet(_url, _key,
      'bib_documentos?select=id,storage_path,nombre_archivo,bib_solicitudes!inner(fecha_recepcion,estado)' +
      '&storage_path=not.is.null' +
      '&bib_solicitudes.estado=in.(entregado,cancelado)' +
      '&bib_solicitudes.fecha_recepcion=lt.' + inicioMes
    );
    if (!Array.isArray(docs)) {
      _auditar('mantenimiento', 'archivar_adjuntos', 'error', 'error', 'Error consultando bib_documentos: ' + JSON.stringify(docs).substring(0, 300));
      return { ok: false, error: JSON.stringify(docs) };
    }
    if (!docs.length) return { ok: true, archivados: 0, errores: 0, restantes: 0 };

    var t0 = Date.now();
  // 35s, no 4 minutos: esta funcion tambien se llama desde el boton
  // manual de Mantenimiento via gasCall(), que se rinde a los 50s del
  // lado del navegador (ver utils.js). El trigger diario automatico no
  // tiene ese limite, pero usa la misma funcion -- con un backlog grande
  // simplemente le toma varios dias ponerse al dia, sin apuro real.
  var MAX_MS = 35 * 1000;
  var archivados = 0, errores = 0, procesados = 0;

  for (var i = 0; i < docs.length; i++) {
    if (Date.now() - t0 > MAX_MS) break;
    procesados++;
    var d = docs[i];
    try {
      var fecha = new Date(d.bib_solicitudes.fecha_recepcion);
      var carpeta = _carpetaArchivoAdjuntos(fecha.getFullYear(), fecha.getMonth());

      var encodedPath = d.storage_path.split('/').map(encodeURIComponent).join('/');
      var resp = UrlFetchApp.fetch(_url + '/storage/v1/object/biblioteca-adjuntos/' + encodedPath, {
        headers: { apikey: _key, Authorization: 'Bearer ' + _key },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() >= 400) throw new Error('Descarga de Storage fallo (' + resp.getResponseCode() + ')');

      var blob = resp.getBlob().setName(d.nombre_archivo || ('archivo_' + d.id));
      var file = carpeta.createFile(blob);

      var okPatch = sbPatch(_url, _key, 'bib_documentos?id=eq.' + d.id,
        { storage_path: null, drive_link: file.getUrl() });
      if (!okPatch) throw new Error('No se pudo actualizar bib_documentos id=' + d.id);

      var delResp = UrlFetchApp.fetch(_url + '/storage/v1/object/biblioteca-adjuntos', {
        method: 'DELETE',
        headers: { apikey: _key, Authorization: 'Bearer ' + _key, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ prefixes: [d.storage_path] }),
        muteHttpExceptions: true
      });
      if (delResp.getResponseCode() >= 400) {
        // El archivo ya quedo respaldado en Drive y bib_documentos ya
        // apunta ahi -- que sobreviva una copia extra en Storage no es
        // grave (no se pierde nada), solo no libera espacio todavia.
        // La proxima reconciliacion lo veria como huerfano_storage
        // (nada en bib_documentos ya referencia esa ruta) y
        // limpiarHuerfanosSinDueno lo terminaria de borrar.
        Logger.log('Archivado OK pero no se borro de Storage id=' + d.id + ': ' + delResp.getContentText());
      }
      archivados++;
    } catch(e) {
      errores++;
      Logger.log('Error archivando bib_documentos id=' + d.id + ': ' + e.toString());
    }
  }

  var restantes = docs.length - procesados;
  var hayError = errores > 0;
  _auditar('mantenimiento', 'archivar_adjuntos', hayError ? 'error' : 'ok', hayError ? 'advertencia' : 'info',
    archivados + ' archivado(s), ' + errores + ' error(es)' + (restantes > 0 ? ', ' + restantes + ' restante(s) para la próxima ejecución' : ''));
  return { ok: true, archivados: archivados, errores: errores, restantes: restantes };
  } finally {
    lock.releaseLock();
  }
}

// ── Alerta email 7 días antes del fin de mes ─────────────────
function _alertaFinDeMes(dias, fecha) {
  var emailDest = _cfg('REPORTE_EMAIL') || Session.getActiveUser().getEmail();
  if (!emailDest) return;
  var nom = _MESES_GAS[fecha.getMonth()];
  var ano = fecha.getFullYear();
  var html = '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">'
    + '<div style="background:#1e3a5f;color:#fff;padding:18px;border-radius:8px 8px 0 0">'
    + '<h2 style="margin:0;font-size:16px">Biblioteca Goyavier — Alerta Cierre de Mes</h2></div>'
    + '<div style="background:#fff3cd;border:1px solid #ffc107;padding:18px;border-radius:0 0 8px 8px">'
    + '<p style="font-size:14px;margin:0 0 10px"><strong>Faltan ' + dias + ' dias para terminar '
    + nom + ' ' + ano + '</strong></p>'
    + '<p style="color:#856404;margin:0;font-size:13px">El ultimo dia del mes el sistema generara el reporte '
    + 'Excel automaticamente y lo enviara a este correo con copia guardada en Google Drive.<br><br>'
    + '<em>No es necesario hacer nada — este es solo un recordatorio.</em></p>'
    + '</div></div>';
  emailDest.split(',').map(function(e){return e.trim();}).filter(Boolean).forEach(function(email) {
    GmailApp.sendEmail(email, 'Biblioteca: faltan ' + dias + ' dias para cerrar ' + nom + ' ' + ano, '', {
      htmlBody: html, name: 'Biblioteca Goyavier'
    });
  });
}

// ── Email con el reporte adjunto ─────────────────────────────
function _htmlEmailReporte(nom, ano, sols, ventas, movs, libros, driveUrl) {
  var total    = sols.length;
  var entregadas = sols.filter(function(s){return s.estado==='entregado';}).length;
  var hTot     = sols.reduce(function(a,s){return a+(s.bib_documentos||[]).reduce(function(b,d){return b+(d.num_hojas||0);},0);},0);
  var totCob   = ventas.reduce(function(a,r){return a+(r.bib_trabajos_personal||[]).reduce(function(b,t){return b+(t.precio_total||0);},0);},0);
  function pesos(n){return '$ '+Math.round(n||0).toLocaleString();}
  return '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">'
    + '<div style="background:#1e3a5f;color:#fff;padding:20px;border-radius:8px 8px 0 0">'
    + '<h2 style="margin:0;font-size:16px">Reporte Biblioteca — ' + nom + ' ' + ano + '</h2>'
    + '<p style="margin:6px 0 0;opacity:.75;font-size:12px">Generado automaticamente al cierre del mes</p></div>'
    + '<div style="background:#f8fafc;border:1px solid #e2e8f0;padding:20px;border-radius:0 0 8px 8px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px">'
    + '<tr style="background:#f1f5f9"><td style="padding:8px;color:#64748b">Solicitudes totales</td><td style="font-weight:bold">' + total + '</td></tr>'
    + '<tr><td style="padding:8px;color:#64748b">Solicitudes entregadas</td><td style="font-weight:bold;color:#166534">' + entregadas + '</td></tr>'
    + '<tr style="background:#f1f5f9"><td style="padding:8px;color:#64748b">Total hojas impresas</td><td style="font-weight:bold">' + hTot + '</td></tr>'
    + '<tr><td style="padding:8px;color:#64748b">Ventas del mes</td><td style="font-weight:bold;color:#1e3a5f">' + pesos(totCob) + '</td></tr>'
    + '<tr style="background:#f1f5f9"><td style="padding:8px;color:#64748b">Movimientos de materiales</td><td style="font-weight:bold">' + movs.length + '</td></tr>'
    + '<tr><td style="padding:8px;color:#64748b">Prestamos de libros</td><td style="font-weight:bold">' + libros.length + '</td></tr>'
    + '</table>'
    + '<div style="margin-top:14px;padding:12px;background:#dbeafe;border-radius:6px;font-size:13px">'
    + 'Archivo Excel adjunto. Tambien guardado en '
    + '<a href="' + driveUrl + '" style="color:#1d4ed8">Google Drive → Biblioteca Goyavier - Reportes</a></div>'
    + '</div></div>';
}

// ── Notificar error al admin ──────────────────────────────────
function _notificarError(contexto, msg) {
  var emailDest = _cfg('REPORTE_EMAIL') || Session.getActiveUser().getEmail();
  if (!emailDest) return;
  GmailApp.sendEmail(emailDest, 'ERROR Reporte Biblioteca: ' + contexto,
    'Error:\n\n' + msg, { name: 'Biblioteca Goyavier' });
}

// ── Helpers públicos de reprocesamiento ──────────────────────
// IMPORTANTE: estas funciones actualizan la solicitud EN EL MISMO id si ya
// existe (nunca borran-y-recrean). Borrar antes de confirmar que Gmail va
// a devolver el mensaje es lo que dejaba solicitudes perdidas para siempre
// si Gmail fallaba a mitad de camino, y cambiar el id rompía (o en cascada,
// borraba) los pagos/trabajos/movimientos de Materiales que ya apuntaban a
// esa solicitud. Comparten el mismo LockService que sincronizarCorreos()
// para no pisarse si alguien sincroniza desde el navegador al mismo tiempo.
function reprocesarUltimoCorreo()   { reprocesarUltimosCorreos(1); }
function reprocesarUltimos3Correos(){ reprocesarUltimosCorreos(3); }

function reprocesarUltimosCorreos(n) {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  var res = sbGet(_url, _key, 'bib_solicitudes?order=fecha_recepcion.desc&limit=' + (n||1) + '&select=id,gmail_message_id,asunto,remitente_email');
  if (!Array.isArray(res) || !res[0]) throw new Error('No hay solicitudes en la base de datos');
  for (var i = 0; i < res.length; i++) {
    Logger.log('--- ' + (i+1) + '/' + res.length + ': ' + res[i].remitente_email + ' | ' + res[i].asunto);
    reprocesarCorreo(res[i].gmail_message_id);
  }
  Logger.log('=== LISTO: ' + res.length + ' correos reprocesados');
}

// Reprocesa UN correo por su gmail_message_id (debe existir o no en Supabase)
function reprocesarCorreo(gmailMsgId) {
  if (!gmailMsgId) throw new Error('gmailMsgId requerido');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Ya hay una sincronización en curso. Intenta de nuevo en unos segundos.');
  try {
    var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
    var lb = _cargarListaBlanca(_url, _key);
    // Se busca el mensaje en Gmail ANTES de tocar la base de datos — si no
    // existe o Gmail falla, no se pierde nada de lo que ya había.
    var msg = GmailApp.getMessageById(gmailMsgId);
    if (!msg) throw new Error('Mensaje no encontrado en Gmail: ' + gmailMsgId);
    var res = _upsertSolicitudDesdeMensaje(msg, _url, _key, lb);
    _auditar('sincronizacion', 'reprocesar_correo', 'ok', 'advertencia',
      gmailMsgId + ': ' + res.accion + ' (id=' + res.solId + ')');
    return res;
  } catch(e) {
    _auditar('sincronizacion', 'reprocesar_correo', 'error', 'error', gmailMsgId + ': ' + e.toString());
    throw e;
  } finally {
    lock.releaseLock();
  }
}

// Atajo sin argumentos para ejecutar desde el editor GAS
function reprocesarDesdeJunio24() { reprocesarDesde('2026/06/23'); }

// Busca en Gmail desde fechaStr ("2026/06/24") y reprocesa TODOS,
// incluyendo eliminados e ignorados — usa clasificación correcta via listaBlanca
function reprocesarDesde(fechaStr) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Ya hay una sincronización en curso. Intenta de nuevo en unos segundos.');
  try {
    var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
    var lb = _cargarListaBlanca(_url, _key);
    var threads = GmailApp.search('-in:sent -in:trash -in:drafts after:' + fechaStr, 0, 100);
    var procesados = 0, errores = 0;
    for (var t = 0; t < threads.length; t++) {
      var msgs = threads[t].getMessages();
      for (var m = 0; m < msgs.length; m++) {
        var msg = msgs[m];
        var msgId = msg.getId();
        // Filtrar: solo procesar remitentes autorizados
        var fromMatch = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.exec(msg.getFrom());
        var fromEmail = fromMatch ? fromMatch[0].toLowerCase() : '';
        if (!lb[fromEmail]) {
          Logger.log('OMITIDO (no autorizado): ' + fromEmail + ' | ' + msg.getSubject());
          continue;
        }
        try {
          _upsertSolicitudDesdeMensaje(msg, _url, _key, lb);
          procesados++;
          Logger.log('OK: ' + msg.getFrom() + ' | ' + msg.getSubject());
        } catch(e) {
          errores++;
          Logger.log('ERROR ' + msgId + ': ' + e.message);
          _auditar('sincronizacion', 'reprocesar_desde', 'error', 'error', msgId + ': ' + e.toString());
        }
      }
    }
    Logger.log('=== reprocesarDesde ' + fechaStr + ': ' + procesados + ' OK, ' + errores + ' errores');
    _auditar('sincronizacion', 'reprocesar_desde', errores > 0 ? 'error' : 'ok', errores > 0 ? 'advertencia' : 'info',
      fechaStr + ': ' + procesados + ' OK, ' + errores + ' errores');
    return { ok: true, procesados: procesados, errores: errores };
  } finally {
    lock.releaseLock();
  }
}

// ── Lógica interna compartida ─────────────────────────────────
function _cargarListaBlanca(url, key) {
  var res = sbGet(url, key, 'bib_remitentes_autorizados?select=email,tipo&activo=eq.true');
  var lb = {};
  (Array.isArray(res) ? res : []).forEach(function(r) {
    var e = String(r.email || '').trim().toLowerCase();
    if (e) lb[e] = r.tipo || 'general';
  });
  return lb;
}

// Mismo criterio que sincronizarCorreos(): el primer destinatario del
// campo To: que no sea la cuenta de la biblioteca (antes _reprocesarMensaje
// fijaba esto siempre a la cuenta de la biblioteca, un dato incorrecto
// para todo lo reprocesado).
function _detectarEmailDestino(msg, emailRemit, emailBiblioteca) {
  var emailDestino = emailRemit;
  try {
    var toList = msg.getTo().split(",");
    for (var i = 0; i < toList.length; i++) {
      var addr = toList[i].trim();
      var am   = addr.match(/<([^>]+)>/);
      var ae   = am ? am[1].trim().toLowerCase() : addr.toLowerCase();
      if (ae && ae !== emailBiblioteca) { emailDestino = ae; break; }
    }
  } catch(ex2) {}
  return emailDestino;
}

// Crea la solicitud si no existe, o la ACTUALIZA en el mismo id si ya
// existe (nunca borra-y-recrea — ver comentario arriba de reprocesarCorreo).
function _upsertSolicitudDesdeMensaje(msg, _url, _key, listaBlanca) {
  var MAX_BYTES  = 40 * 1024 * 1024;
  var gmailMsgId = msg.getId();

  // 1. Adjuntos y links de Drive PRIMERO — si Gmail/Drive fallan aquí,
  //    todavía no se tocó bib_solicitudes ni bib_documentos.
  var adjuntos   = msg.getAttachments({ includeGoogleDriveFiles: true, includeInlineImages: false });
  var docs       = _procesarAdjuntos(adjuntos, gmailMsgId, MAX_BYTES, _url, _key);
  var driveLinks = _extraerLinksDrive(msg.getBody());
  docs = docs.concat(_procesarDriveLinks(driveLinks, gmailMsgId, MAX_BYTES, _url, _key));

  var fromRaw       = msg.getFrom();
  var emMatch       = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.exec(fromRaw);
  var emailRemit    = emMatch ? emMatch[0].toLowerCase() : fromRaw.toLowerCase();
  var tipoRemitente = listaBlanca[emailRemit] || 'personal';
  var emailBib      = Session.getEffectiveUser().getEmail().toLowerCase();
  var emailDestino  = _detectarEmailDestino(msg, emailRemit, emailBib);

  var campos = {
    gmail_message_id: gmailMsgId,
    fecha_recepcion:  msg.getDate().toISOString(),
    remitente_nombre: fromRaw,
    remitente_email:  emailRemit,
    email_destino:    emailDestino,
    tipo_remitente:   tipoRemitente,
    asunto:           msg.getSubject() || '(sin asunto)',
    cuerpo:           msg.getPlainBody().substring(0, 1000)
  };

  var existing = sbGet(_url, _key, 'bib_solicitudes?gmail_message_id=eq.' + encodeURIComponent(gmailMsgId) + '&select=id');
  var solId, accion;
  if (Array.isArray(existing) && existing[0]) {
    // Actualizar en el mismo id: conserva estado, pagos, trabajos y
    // movimientos de Materiales que ya apuntan a esta solicitud.
    solId  = existing[0].id;
    accion = 'actualizado';
    var okPatch = sbPatch(_url, _key, 'bib_solicitudes?id=eq.' + solId, campos);
    if (!okPatch) throw new Error('Error actualizando solicitud id=' + solId);
    // Los documentos sí se reemplazan (nadie más los referencia por su propio id).
    // Antes de borrar las filas, borrar TAMBIEN sus archivos en Storage:
    // borrar solo la fila y dejar el archivo huerfano fue exactamente la
    // causa de los 558 huerfanos que encontro la reconciliacion (ver
    // sql/025_recuperar_huerfanos_storage.sql). Se borran los dos o
    // ninguno, nunca solo uno de los dos lados.
    var docsViejos = sbGet(_url, _key, 'bib_documentos?solicitud_id=eq.' + solId + '&select=storage_path&storage_path=not.is.null');
    if (Array.isArray(docsViejos) && docsViejos.length) {
      var rutasViejas = docsViejos.map(function(d) { return d.storage_path; });
      var delStorage = UrlFetchApp.fetch(_url + '/storage/v1/object/biblioteca-adjuntos', {
        method: 'DELETE',
        headers: { apikey: _key, Authorization: 'Bearer ' + _key, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ prefixes: rutasViejas }),
        muteHttpExceptions: true
      });
      if (delStorage.getResponseCode() >= 400) {
        _auditar('sincronizacion', 'limpiar_storage_reemplazo', 'error', 'advertencia',
          'No se pudieron borrar ' + rutasViejas.length + ' archivo(s) viejo(s) de Storage (solicitud id=' + solId + '): ' +
          delStorage.getContentText().substring(0, 300));
      }
    }
    UrlFetchApp.fetch(_url + '/rest/v1/bib_documentos?solicitud_id=eq.' + solId,
      { method:'DELETE', headers:{apikey:_key, Authorization:'Bearer '+_key, Prefer:'return=minimal'}, muteHttpExceptions:true });
  } else {
    accion = 'creado';
    campos.estado = 'pendiente';
    var insertRes = sbPostBatch(_url, _key, 'bib_solicitudes', [campos]);
    if (!Array.isArray(insertRes) || !insertRes[0]) throw new Error('Error insertando solicitud: ' + JSON.stringify(insertRes));
    solId = insertRes[0].id;
  }

  if (docs.length) {
    // Normalizar: todas las filas deben tener las mismas claves (PostgREST PGRST102)
    var docRows = docs.map(function(d) {
      return {
        solicitud_id:   solId,
        nombre_archivo: d.nombre_archivo || null,
        tipo_mime:      d.tipo_mime      || null,
        tamano_bytes:   d.tamano_bytes   || 0,
        storage_path:   d.storage_path   || null,
        drive_link:     d.drive_link     || null
      };
    });
    var docRes = sbPostBatch(_url, _key, 'bib_documentos', docRows);
    if (!Array.isArray(docRes)) {
      // Antes esto solo se registraba con Logger.log -- visible unicamente
      // abriendo el editor de Apps Script y esa ejecucion puntual, nunca
      // en la app. El archivo ya estaba subido a Storage (paso 1), asi que
      // un fallo aqui silencioso es exactamente como se generaban huerfanos
      // al reprocesar. Mismo reintento individual que ya usa _sincronizarCorreosImpl.
      var _docErr2 = (docRes && docRes.error) ? String(docRes.error) : JSON.stringify(docRes);
      Logger.log('Batch documentos error: ' + _docErr2 + ' -- reintentando individualmente');
      var _docsGuardados2 = 0;
      docRows.forEach(function(fila) {
        var r = sbPost(_url, _key, 'bib_documentos', fila);
        if (Array.isArray(r) && r[0]) _docsGuardados2++;
      });
      var _docsOk2 = _docsGuardados2 === docRows.length;
      _auditar('sincronizacion', 'insertar_documentos', _docsOk2 ? 'ok' : 'error', _docsOk2 ? 'advertencia' : 'error',
        gmailMsgId + ': batch fallo (' + _docErr2.substring(0, 300) + '); reintento individual: ' + _docsGuardados2 + '/' + docRows.length + ' documento(s) guardados');
    } else {
      Logger.log('Docs insertados: ' + docRes.length);
    }
  }
  Logger.log('LISTO (' + accion + '): id=' + solId + ' tipo=' + tipoRemitente + ' | ' + docs.length + ' archivos');
  return { ok:true, solId:solId, docs:docs.length, accion:accion };
}

// ── Sube adjuntos (MIME + Drive) uno por uno a Storage ───────
// adjuntos = msg.getAttachments({includeGoogleDriveFiles:true})
function _procesarAdjuntos(adjuntos, msgId, maxBytes, supabaseUrl, supabaseKey) {
  var docs = [];
  for (var a = 0; a < adjuntos.length; a++) {
    var att  = adjuntos[a];
    var nom  = att.getName().replace(/[^a-zA-Z0-9._\-\s]/g, "_");
    var mime = att.getContentType() || 'application/octet-stream';
    var sz   = att.getSize();
    if (sz > maxBytes) {
      Logger.log('Omitido (>' + Math.round(sz/1024/1024) + 'MB): ' + att.getName());
      docs.push({ nombre_archivo: att.getName(), tipo_mime: mime, tamano_bytes: sz, storage_path: null });
      continue;
    }
    try {
      var bytes = att.getBytes();
      var path  = msgId + "/" + nom;
      var resp  = UrlFetchApp.fetch(supabaseUrl + "/storage/v1/object/biblioteca-adjuntos/" + path.split("/").map(encodeURIComponent).join("/"), {
        method: "POST", muteHttpExceptions: true,
        headers: { "Authorization": "Bearer " + supabaseKey, "Content-Type": mime, "x-upsert": "true" },
        payload: bytes
      });
      bytes = null;
      var ok = resp.getResponseCode() < 400;
      docs.push({ nombre_archivo: att.getName(), tipo_mime: mime, tamano_bytes: sz, storage_path: ok ? path : null });
      Logger.log((ok ? 'OK' : 'ERROR upload') + ': ' + att.getName());
    } catch(e) {
      Logger.log('Error adjunto ' + att.getName() + ': ' + e.message);
      docs.push({ nombre_archivo: att.getName(), tipo_mime: mime, tamano_bytes: sz, storage_path: null });
    }
  }
  return docs;
}

// ── Diagnóstico: solicitudes sin documentos ───────────────────
function diagnosticarSinAdjuntos() {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  // Solicitudes que no tienen ningún documento asociado
  var sols = sbGet(_url, _key,
    'bib_solicitudes?select=id,gmail_message_id,asunto,remitente_email' +
    '&not.bib_documentos.id=is.null' +
    '&order=fecha_recepcion.desc&limit=20');
  // Alternativa: buscar solicitudes recientes y cruzar con docs
  var recientes = sbGet(_url, _key,
    'bib_solicitudes?select=id,gmail_message_id,asunto,remitente_email,fecha_recepcion' +
    '&order=fecha_recepcion.desc&limit=30');
  if (!Array.isArray(recientes)) { Logger.log('Error: ' + JSON.stringify(recientes)); return; }
  recientes.forEach(function(s) {
    var docs = sbGet(_url, _key, 'bib_documentos?solicitud_id=eq.' + s.id + '&select=id');
    var nDocs = Array.isArray(docs) ? docs.length : '?';
    Logger.log('[' + nDocs + ' docs] ' + s.gmail_message_id + ' | ' + s.remitente_email + ' | ' + s.asunto);
    if (nDocs === 0) diagnosticarCorreo(s.gmail_message_id);
  });
}

// ── Diagnóstico: inspeccionar adjuntos de un mensaje Gmail ────
function diagnosticarCorreo(msgId) {
  if (!msgId) { Logger.log('Requiere gmail_message_id'); return; }
  var msg = GmailApp.getMessageById(msgId);
  if (!msg) { Logger.log('Mensaje no encontrado: ' + msgId); return; }
  Logger.log('=== ' + msgId);
  Logger.log('De: ' + msg.getFrom() + ' | Asunto: ' + msg.getSubject());

  var a1 = msg.getAttachments();
  Logger.log('getAttachments() sin opciones: ' + a1.length + ' items');
  a1.forEach(function(a){ Logger.log('  MIME - ' + a.getName() + ' | ' + a.getContentType() + ' | ' + a.getSize() + 'b'); });

  var a2 = msg.getAttachments({ includeGoogleDriveFiles: true, includeInlineImages: false });
  Logger.log('getAttachments({includeGoogleDriveFiles:true}): ' + a2.length + ' items');
  a2.forEach(function(a){ Logger.log('  GDrive - ' + a.getName() + ' | ' + a.getContentType() + ' | ' + a.getSize() + 'b'); });

  var links = _extraerLinksDrive(msg.getBody());
  Logger.log('Links Drive en HTML body: ' + links.length);
  links.forEach(function(l){ Logger.log('  LINK - id=' + l.id + ' nombre=' + l.nombre + ' url=' + l.url.substring(0,60)); });
}

// ── Descarga y sube archivos referenciados como links Drive ──
function _procesarDriveLinks(driveLinks, msgId, maxBytes, supabaseUrl, supabaseKey) {
  var docs = [];
  for (var d = 0; d < driveLinks.length; d++) {
    var dl = driveLinks[d];
    try {
      var df   = DriveApp.getFileById(dl.id);
      var dNom = df.getName().replace(/[^a-zA-Z0-9._\-\s]/g, "_");
      var dMime= df.getMimeType();
      var dSz  = df.getSize();
      var isGApp = dMime.indexOf('application/vnd.google-apps.') === 0;
      if (!isGApp && dSz > maxBytes) {
        docs.push({ nombre_archivo: df.getName(), tipo_mime: dMime, tamano_bytes: dSz, storage_path: null, drive_link: dl.url });
        Logger.log('Drive link omitido (>' + Math.round(dSz/1024/1024) + 'MB): ' + df.getName());
        continue;
      }
      var dBytes;
      if (dMime==='application/vnd.google-apps.document'||dMime==='application/vnd.google-apps.spreadsheet'||dMime==='application/vnd.google-apps.presentation') {
        dBytes = df.getAs('application/pdf').getBytes(); dMime='application/pdf'; dNom=dNom+'.pdf';
      } else {
        dBytes = df.getBlob().getBytes();
      }
      var dPath = msgId + "/drive_" + dl.id + "_" + dNom;
      var dResp = UrlFetchApp.fetch(supabaseUrl + "/storage/v1/object/biblioteca-adjuntos/" + dPath.split("/").map(encodeURIComponent).join("/"), {
        method:"POST", muteHttpExceptions:true,
        headers:{"Authorization":"Bearer "+supabaseKey,"Content-Type":dMime,"x-upsert":"true"},
        payload:dBytes
      });
      dBytes = null;
      var ok = dResp.getResponseCode() < 400;
      docs.push({ nombre_archivo: df.getName(), tipo_mime: dMime, tamano_bytes: dSz, storage_path: ok ? dPath : null });
      Logger.log('Drive link ' + (ok?'OK':'ERROR upload') + ': ' + df.getName());
    } catch(e) {
      // No accesible: guardar solo el link para referencia
      docs.push({ nombre_archivo: dl.nombre || ('Drive: '+dl.id), tipo_mime:'application/octet-stream', tamano_bytes:0, storage_path:null, drive_link:dl.url });
      Logger.log('Drive link no accesible ' + dl.id + ': ' + e.message);
    }
  }
  return docs;
}

// ── Extrae links de Drive del cuerpo HTML de un email ────────
// Retorna array de { id, url, nombre } sin duplicados
function _extraerLinksDrive(htmlBody) {
  if (!htmlBody) return [];
  var resultados = [];
  var vistos = {};
  // Patrones: /file/d/ID, /folders/ID, open?id=ID, /d/ID/edit|view|preview
  var patrones = [
    /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_\-]{10,})/g,
    /https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_\-]{10,})/g,
    /https?:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation|forms|drawings)\/d\/([a-zA-Z0-9_\-]{10,})/g,
    /https?:\/\/drive\.google\.com\/(?:a\/[^\/]+\/)?uc\?(?:[^"]*&)?id=([a-zA-Z0-9_\-]{10,})/g
  ];
  // Intentar extraer nombre del title attr o texto adyacente al link
  var nombreRe = /title="([^"]{1,120})"/;
  patrones.forEach(function(re) {
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(htmlBody)) !== null) {
      var id  = m[1];
      var url = m[0];
      if (vistos[id]) continue;
      vistos[id] = true;
      // Buscar nombre en los ~200 chars alrededor del match
      var ctx   = htmlBody.substring(Math.max(0, m.index - 100), m.index + 200);
      var nMatch = nombreRe.exec(ctx);
      resultados.push({ id: id, url: url, nombre: nMatch ? nMatch[1] : null });
    }
  });
  return resultados;
}

// ── Envio puntual de una sola vez: correccion_registro a Julian tras el
// error de asignacion en BIB-2026-0069. Correr una vez desde el editor
// (seleccionar esta funcion en el desplegable -> Ejecutar) y luego borrar
// este bloque completo.
function _enviarCorreoCorreccionJulian() {
  var r = enviarCorreo({
    tipo: 'correccion_registro',
    destinatario: 'convivenciabachillerato@colegiogoyavier.edu.co',
    idSolicitud: 'BIB-2026-0069',
    asuntoOriginal: 'Re: IMPRESIÓN',
  });
  Logger.log(JSON.stringify(r));
}
