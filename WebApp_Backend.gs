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

// ============================================================
// ENTRY POINT
// ============================================================
function doGet(e) {
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
  switch (p.accion) {
    case "sincronizarCorreos": return sincronizarCorreos(p);
    case "enviarCorreo":       return enviarCorreo(p);
    default: return { error: "Acción no reconocida: " + p.accion };
  }
}

// ============================================================
// SINCRONIZAR CORREOS GMAIL → SUPABASE  (v4 — optimizado)
//
// Optimizaciones aplicadas:
//   1. Setup paralelo: lista blanca + IDs existentes en un solo fetchAll
//   2. IDs limitados a ventana de 3 meses (no carga toda la historia)
//   3. Paginación por lotes: startOffset + maxMessages (8 por defecto)
//   4. Uploads de adjuntos en PARALELO por mensaje (UrlFetchApp.fetchAll)
//   5. Batch insert de solicitudes en un solo POST
//   6. Batch insert de documentos en un solo POST
//   7. maxMs 22 segundos → responde siempre antes del timeout del navegador
// ============================================================
function sincronizarCorreos(params) {
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

      var emailDestino = emailRemit;
      try {
        var toList = msg.getTo().split(",");
        for (var i = 0; i < toList.length; i++) {
          var addr  = toList[i].trim();
          var am    = addr.match(/<([^>]+)>/);
          var ae    = am ? am[1].trim().toLowerCase() : addr.toLowerCase();
          if (ae && ae !== emailBiblioteca) { emailDestino = ae; break; }
        }
      } catch(ex2) {}

      nuevos.push({ msg: msg, msgId: msgId, fechaMsg: fechaMsg, remitenteRaw: remitenteRaw,
                    emailRemit: emailRemit, tipoRemitente: tipoRemitente, emailDestino: emailDestino });
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
  var MAX_BYTES_SYNC = 40 * 1024 * 1024; // 40 MB por archivo (UrlFetchApp soporta hasta 50MB)
  for (var n = 0; n < nuevos.length; n++) {
    var item     = nuevos[n];
    // includeGoogleDriveFiles:true captura archivos compartidos via botón Drive de Gmail
    var adjuntos = item.msg.getAttachments({ includeGoogleDriveFiles: true, includeInlineImages: false });
    var itemDocs = _procesarAdjuntos(adjuntos, item.msgId, MAX_BYTES_SYNC, SUPABASE_URL, SUPABASE_KEY);
    item._docs = itemDocs;
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
  var docRows = [];
  for (var n2 = 0; n2 < nuevos.length; n2++) {
    var sol = solRes[n2];
    var sid = sol && sol.id;
    if (!sid) continue;
    idsExistentes[nuevos[n2].msgId] = true;
    agregados++;
    (nuevos[n2]._docs || []).forEach(function(doc) {
      docRows.push({ solicitud_id: sid, nombre_archivo: doc.nombre_archivo, tipo_mime: doc.tipo_mime, tamano_bytes: doc.tamano_bytes, storage_path: doc.storage_path });
    });
  }
  if (docRows.length) sbPostBatch(SUPABASE_URL, SUPABASE_KEY, "bib_documentos", docRows);

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
      return { ok: false, error: "Email destinatario inválido: " + params.destinatario };
    }

    // ── Verificar configuración de notificaciones ─────────────
    var _url = _cfg("SUPABASE_URL");
    var _key = _cfg("SUPABASE_KEY");
    if (_url && _key) {
      try {
        var nc = sbGet(_url, _key, "bib_notif_config?email=eq." + encodeURIComponent(params.destinatario) + "&select=activas");
        if (Array.isArray(nc) && nc.length > 0 && nc[0].activas === false) {
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
        html = wrap("#6f42c1", "Todo listo! :D",
          '<p>Tu impresion fue entregada exitosamente. Esperamos que te sea de mucha utilidad!</p>' +
          '<table cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%">' +
          fila("Referencia:", ref) +
          fila("&gt;&gt; Asunto:", params.asunto) +
          fila("Entregado a:", params.nombreRecibe) +
          fila("Fecha:", params.fechaEntrega) +
          (params.materia       ? fila("Materia:", params.materia) : "") +
          (params.tipoImpresion ? fila("Tipo:", params.tipoImpresion + (params.forma ? " / " + params.forma : "")) : "") +
          (params.numHojas      ? fila("Hojas:", params.numHojas + " hojas") : "") +
          '</table>' +
          '<p style="background:#f5f0ff;border-left:3px solid #6f42c1;padding:12px 16px;border-radius:4px;margin:16px 0">' +
          'Gracias por usar el servicio de la Biblioteca Goyavier, fue un gusto ayudarte.</p>');
        plain =
          "Todo listo! :D\n\n" +
          "Tu impresion fue entregada exitosamente. Esperamos que te sea de mucha utilidad!\n\n" +
          ">> Asunto:\n" + (params.asunto || ref) + "\n\n" +
          "Gracias por usar el servicio de la biblioteca, fue un gusto ayudarte.\n\n" +
          "[BIBLIOTECA]\nColegio Goyavier\n\n" +
          "Tienes alguna pregunta? Responde a este correo.";
        break;

      default:
        return { ok: false, error: "Tipo de correo no reconocido: " + params.tipo };
    }

    GmailApp.sendEmail(params.destinatario, asunto, plain, {
      htmlBody: html,
      name:     "Biblioteca Goyavier"
    });
    return { ok: true };

  } catch (e) {
    Logger.log("enviarCorreo error: " + e.toString());
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
}

// ── Ejecutar manualmente para probar sin esperar al fin de mes ─
function exportarMesManual() {
  var hoy = new Date();
  _exportarMes(hoy.getFullYear(), hoy.getMonth());
}

// ── Motor principal de exportación ───────────────────────────
function _exportarMes(ano, mes) {
  var _url = _cfg('SUPABASE_URL');
  var _key = _cfg('SUPABASE_KEY');
  if (!_url || !_key) throw new Error('SUPABASE_URL o SUPABASE_KEY no configurados en Script Properties');
  var nom = _MESES_GAS[mes];
  var ini = Utilities.formatDate(new Date(ano, mes, 1),     'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var fin = Utilities.formatDate(new Date(ano, mes + 1, 1), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  Logger.log('Exportando ' + nom + ' ' + ano + ' (' + ini + ' → ' + fin + ')');

  // Consultas Supabase
  var qFecha = 'fecha_recepcion=gte.' + ini + '&fecha_recepcion=lt.' + fin;
  var sols = sbGet(_url, _key,
    'bib_solicitudes?' + qFecha +
    '&select=id,id_solicitud,fecha_recepcion,remitente_email,asunto,estado,destinatarios,' +
    'profesor,nombre_recibe,notif_impreso_en,fecha_entrega,' +
    'bib_documentos(num_hojas,tipo_impresion,forma_impresion)' +
    '&order=fecha_recepcion.asc');
  var trabs = sbGet(_url, _key,
    'bib_trabajos_impresion?created_at=gte.' + ini + '&created_at=lt.' + fin +
    '&select=solicitud_id,nombre,profesor,total_hojas,archivos');
  var ventas = sbGet(_url, _key,
    'bib_solicitudes?' + qFecha +
    '&tipo_remitente=eq.personal' +
    '&select=id,id_solicitud,fecha_recepcion,remitente_email,asunto,estado,' +
    'bib_trabajos_personal(precio_total,valor_pagado)' +
    '&order=fecha_recepcion.asc');

  if (!Array.isArray(sols))   throw new Error('Error solicitudes: ' + JSON.stringify(sols));
  if (!Array.isArray(trabs))  trabs  = [];
  if (!Array.isArray(ventas)) ventas = [];
  Logger.log('Datos: ' + sols.length + ' sols, ' + trabs.length + ' trabs, ' + ventas.length + ' ventas');

  // Crear Google Spreadsheet
  var nombre = 'Biblioteca_' + nom + '_' + ano;
  var ss = SpreadsheetApp.create(nombre);
  _crearHojaResumen(ss, sols, trabs, ventas, nom, ano);
  _crearHojaSolicitudes(ss, sols, nom, ano);
  _crearHojaTrabajosImp(ss, sols, trabs, nom, ano);
  _crearHojaVentas(ss, ventas, nom, ano);
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
  var htmlBody  = _htmlEmailReporte(nom, ano, sols, ventas, 'https://drive.google.com/drive/folders/' + carpeta.getId());
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
function _crearHojaResumen(ss, sols, trabs, ventas, nom, ano) {
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

// ── Carpeta en Drive para guardar reportes ────────────────────
function _carpetaReportes() {
  var nombre = 'Biblioteca Goyavier - Reportes';
  var it = DriveApp.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nombre);
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
function _htmlEmailReporte(nom, ano, sols, ventas, driveUrl) {
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
function reprocesarUltimoCorreo()   { reprocesarUltimosCorreos(1); }
function reprocesarUltimos3Correos(){ reprocesarUltimosCorreos(3); }

function reprocesarUltimosCorreos(n) {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  var res = sbGet(_url, _key, 'bib_solicitudes?order=fecha_recepcion.desc&limit=' + (n||1) + '&select=id,gmail_message_id,asunto,remitente_email');
  if (!Array.isArray(res) || !res[0]) throw new Error('No hay solicitudes en la base de datos');
  var lb = _cargarListaBlanca(_url, _key);
  for (var i = 0; i < res.length; i++) {
    Logger.log('--- ' + (i+1) + '/' + res.length + ': ' + res[i].remitente_email + ' | ' + res[i].asunto);
    reprocesarCorreo(res[i].gmail_message_id);
  }
  Logger.log('=== LISTO: ' + res.length + ' correos reprocesados');
}

// Reprocesa UN correo por su gmail_message_id (debe existir o no en Supabase)
function reprocesarCorreo(gmailMsgId) {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  if (!gmailMsgId) throw new Error('gmailMsgId requerido');
  var lb = _cargarListaBlanca(_url, _key);
  // Borrar registro existente si lo hay
  var existing = sbGet(_url, _key, 'bib_solicitudes?gmail_message_id=eq.' + encodeURIComponent(gmailMsgId) + '&select=id');
  if (Array.isArray(existing) && existing[0]) {
    var sid = existing[0].id;
    UrlFetchApp.fetch(_url + '/rest/v1/bib_documentos?solicitud_id=eq.' + sid,
      { method:'DELETE', headers:{apikey:_key, Authorization:'Bearer '+_key, Prefer:'return=minimal'}, muteHttpExceptions:true });
    UrlFetchApp.fetch(_url + '/rest/v1/bib_solicitudes?id=eq.' + sid,
      { method:'DELETE', headers:{apikey:_key, Authorization:'Bearer '+_key, Prefer:'return=minimal'}, muteHttpExceptions:true });
  }
  var msg = GmailApp.getMessageById(gmailMsgId);
  if (!msg) throw new Error('Mensaje no encontrado en Gmail: ' + gmailMsgId);
  return _reprocesarMensaje(msg, _url, _key, lb);
}

// Atajo sin argumentos para ejecutar desde el editor GAS
function reprocesarDesdeJunio24() { reprocesarDesde('2026/06/23'); }

// Busca en Gmail desde fechaStr ("2026/06/24") y reprocesa TODOS,
// incluyendo eliminados e ignorados — usa clasificación correcta via listaBlanca
function reprocesarDesde(fechaStr) {
  var _url = _cfg('SUPABASE_URL'), _key = _cfg('SUPABASE_KEY');
  var lb = _cargarListaBlanca(_url, _key);
  var threads = GmailApp.search('-in:sent -in:trash -in:drafts after:' + fechaStr, 0, 100);
  var procesados = 0, errores = 0;
  for (var t = 0; t < threads.length; t++) {
    var msgs = threads[t].getMessages();
    for (var m = 0; m < msgs.length; m++) {
      var msg = msgs[m];
      var msgId = msg.getId();
      try {
        // Borrar solicitud existente si la hay
        var ex = sbGet(_url, _key, 'bib_solicitudes?gmail_message_id=eq.' + encodeURIComponent(msgId) + '&select=id');
        if (Array.isArray(ex) && ex[0]) {
          UrlFetchApp.fetch(_url + '/rest/v1/bib_documentos?solicitud_id=eq.' + ex[0].id,
            { method:'DELETE', headers:{apikey:_key, Authorization:'Bearer '+_key, Prefer:'return=minimal'}, muteHttpExceptions:true });
          UrlFetchApp.fetch(_url + '/rest/v1/bib_solicitudes?id=eq.' + ex[0].id,
            { method:'DELETE', headers:{apikey:_key, Authorization:'Bearer '+_key, Prefer:'return=minimal'}, muteHttpExceptions:true });
        }
        _reprocesarMensaje(msg, _url, _key, lb);
        procesados++;
        Logger.log('OK: ' + msg.getFrom() + ' | ' + msg.getSubject());
      } catch(e) {
        errores++;
        Logger.log('ERROR ' + msgId + ': ' + e.message);
      }
    }
  }
  Logger.log('=== reprocesarDesde ' + fechaStr + ': ' + procesados + ' OK, ' + errores + ' errores');
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

function _reprocesarMensaje(msg, _url, _key, listaBlanca) {
  var MAX_BYTES  = 40 * 1024 * 1024;
  var gmailMsgId = msg.getId();

  // includeGoogleDriveFiles:true captura archivos del botón Drive de Gmail
  var adjuntos = msg.getAttachments({ includeGoogleDriveFiles: true, includeInlineImages: false });
  var docs = _procesarAdjuntos(adjuntos, gmailMsgId, MAX_BYTES, _url, _key);

  // Clasificar con listaBlanca (igual que sincronizarCorreos)
  var fromRaw    = msg.getFrom();
  var emMatch    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.exec(fromRaw);
  var emailRemit = emMatch ? emMatch[0].toLowerCase() : fromRaw.toLowerCase();
  var tipoRemitente = listaBlanca[emailRemit] || 'personal';

  var insertRes = sbPostBatch(_url, _key, 'bib_solicitudes', [{
    gmail_message_id: gmailMsgId,
    fecha_recepcion:  msg.getDate().toISOString(),
    remitente_nombre: fromRaw,
    remitente_email:  emailRemit,
    email_destino:    Session.getEffectiveUser().getEmail().toLowerCase(),
    tipo_remitente:   tipoRemitente,
    asunto:           msg.getSubject() || '(sin asunto)',
    cuerpo:           msg.getPlainBody().substring(0, 1000),
    estado:           'pendiente'
  }]);
  if (!Array.isArray(insertRes) || !insertRes[0]) throw new Error('Error insertando solicitud: ' + JSON.stringify(insertRes));
  var newSolId = insertRes[0].id;
  if (docs.length) {
    sbPostBatch(_url, _key, 'bib_documentos', docs.map(function(d){ return Object.assign({solicitud_id:newSolId}, d); }));
  }
  Logger.log('LISTO: id=' + newSolId + ' tipo=' + tipoRemitente + ' | ' + docs.length + ' archivos');
  return { ok:true, solId:newSolId, docs:docs.length };
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
