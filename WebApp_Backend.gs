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

  // ── 4. Adjuntos: leer bytes y subir EN PARALELO por mensaje ──
  for (var n = 0; n < nuevos.length; n++) {
    var item     = nuevos[n];
    var adjuntos = item.msg.getAttachments();
    var uploadReqs  = [];
    var adjMeta     = [];

    for (var a = 0; a < adjuntos.length; a++) {
      var att   = adjuntos[a];
      var nom   = att.getName().replace(/[^a-zA-Z0-9._\-\s]/g, "_");
      var mime  = att.getContentType();
      var bytes = att.getBytes();
      var path  = item.msgId + "/" + nom;
      var epth  = path.split("/").map(encodeURIComponent).join("/");
      uploadReqs.push({
        url: SUPABASE_URL + "/storage/v1/object/biblioteca-adjuntos/" + epth,
        method: "POST",
        headers: { "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": mime || "application/octet-stream", "x-upsert": "true" },
        payload: bytes,
        muteHttpExceptions: true
      });
      adjMeta.push({ nombre_archivo: att.getName(), tipo_mime: mime, tamano_bytes: bytes.length, path: path });
    }

    // ← PARALELO: todos los adjuntos del mensaje en una sola llamada
    var upResp = uploadReqs.length ? UrlFetchApp.fetchAll(uploadReqs) : [];

    item._docs = adjMeta.map(function(meta, idx) {
      var ok = upResp[idx] && upResp[idx].getResponseCode() < 400;
      return { nombre_archivo: meta.nombre_archivo, tipo_mime: meta.tipo_mime, tamano_bytes: meta.tamano_bytes, storage_path: ok ? meta.path : null };
    });
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

    var ref   = params.idSolicitud || params.asunto || "Sin referencia";
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
