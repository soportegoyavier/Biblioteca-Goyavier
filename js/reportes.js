// ── REPORTES ─────────────────────────────────────────────────
async function cargarReportes() {
  document.getElementById('rep-content').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const p1 = new Date(_mes === undefined ? _hoy.getMonth() : _mes === _hoy.getMonth() ? _hoy.getMonth() : _mes,
                        0, 0); // reuse _mes/_ano from state
    const ano  = _ano  !== undefined ? _ano  : _hoy.getFullYear();
    const mes  = _mes  !== undefined ? _mes  : _hoy.getMonth();
    const ini  = new Date(ano, mes, 1).toISOString();
    const fin  = new Date(ano, mes + 1, 1).toISOString();
    const inia = new Date(ano, 0, 1).toISOString();

    const [{ data: mesD }, { data: anoD }, { data: topD }] = await Promise.all([
      _sb.from('bib_documentos').select('num_hojas,tipo_impresion,forma_impresion,bib_solicitudes!inner(fecha_recepcion)')
        .gte('bib_solicitudes.fecha_recepcion', ini).lt('bib_solicitudes.fecha_recepcion', fin),
      _sb.from('bib_documentos').select('num_hojas,tipo_impresion,forma_impresion,bib_solicitudes!inner(fecha_recepcion)')
        .gte('bib_solicitudes.fecha_recepcion', inia),
      _sb.from('bib_solicitudes').select('profesor,remitente_email,bib_documentos(num_hojas)')
        .gte('fecha_recepcion', inia).eq('estado', 'entregado')
    ]);
    const { data: destD } = await _sb.from('bib_solicitudes').select('email_destino').gte('fecha_recepcion', inia);
    function agg(rows) {
      let total=0,bn=0,color=0,una=0,doble=0;
      (rows||[]).forEach(d => {
        const h=d.num_hojas||0; total+=h;
        if(d.tipo_impresion==='Blanco y negro') bn+=h;
        if(d.tipo_impresion==='Color') color+=h;
        if(d.forma_impresion==='Una cara') una+=h;
        if(d.forma_impresion==='Doble cara') doble+=h;
      });
      return {total,bn,color,una,doble};
    }
    const mes2=agg(mesD), ano2=agg(anoD);
    const tops={};
    (topD||[]).forEach(s => {
      const k=s.profesor||s.remitente_email||'Desconocido';
      tops[k]=(tops[k]||0)+(s.bib_documentos||[]).reduce((a,d)=>a+(d.num_hojas||0),0);
    });
    const topArr = Object.entries(tops).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxTop = topArr[0]?.[1]||1;
    const dests = {};
    (destD||[]).forEach(s => { const k=s.email_destino; if(k) dests[k]=(dests[k]||0)+1; });
    const destArr = Object.entries(dests).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxDest = destArr[0]?.[1]||1;
    function shortEmail(e) { return e.includes('@') ? e.split('@')[0] : e; }

    document.getElementById('rep-title').textContent = `Estadísticas · ${MESES[mes]} ${ano}`;
    document.getElementById('rep-content').innerHTML = `
      <div class="rep-grid">
        <div class="rep-card">
          <div class="rep-card-title">Hojas este mes</div>
          <div class="rep-stat"><span>Total hojas</span><span class="rep-stat-val" style="color:var(--accent)">${mes2.total}</span></div>
          <div class="rep-stat"><span>Blanco y negro</span><span class="rep-stat-val">${mes2.bn}</span></div>
          <div class="rep-stat"><span>Color</span><span class="rep-stat-val" style="color:var(--blue)">${mes2.color}</span></div>
          <div class="rep-stat"><span>Una cara</span><span class="rep-stat-val">${mes2.una}</span></div>
          <div class="rep-stat"><span>Doble cara</span><span class="rep-stat-val">${mes2.doble}</span></div>
        </div>
        <div class="rep-card">
          <div class="rep-card-title">Acumulado ${ano}</div>
          <div class="rep-stat"><span>Total hojas</span><span class="rep-stat-val" style="color:var(--accent)">${ano2.total}</span></div>
          <div class="rep-stat"><span>Blanco y negro</span><span class="rep-stat-val">${ano2.bn}</span></div>
          <div class="rep-stat"><span>Color</span><span class="rep-stat-val" style="color:var(--blue)">${ano2.color}</span></div>
          <div class="rep-stat"><span>Una cara</span><span class="rep-stat-val">${ano2.una}</span></div>
          <div class="rep-stat"><span>Doble cara</span><span class="rep-stat-val">${ano2.doble}</span></div>
        </div>
        <div class="rep-card" style="grid-column:span 2">
          <div class="rep-card-title">Top solicitantes · ${ano} (hojas entregadas)</div>
          ${topArr.length ? topArr.map(([n,h]) => `
            <div class="rep-bar-row">
              <span class="rep-bar-lbl" title="${n}">${n}</span>
              <div class="rep-bar-bg"><div class="rep-bar-fill" style="width:${(h/maxTop*100).toFixed(0)}%;background:var(--accent)"></div></div>
              <span class="rep-bar-cnt">${h}</span>
            </div>`).join('') : '<p style="color:var(--dim);font-size:12px">Sin datos aún</p>'}
        </div>
        <div class="rep-card" style="grid-column:span 2">
          <div class="rep-card-title">Top destinatarios · ${ano} (envíos realizados)</div>
          ${destArr.length ? destArr.map(([email,cnt],i) => `
            <div class="rep-bar-row">
              <span class="rep-bar-lbl" title="${email}">${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${shortEmail(email)}</span>
              <div class="rep-bar-bg"><div class="rep-bar-fill" style="width:${(cnt/maxDest*100).toFixed(0)}%;background:var(--accent)"></div></div>
              <span class="rep-bar-cnt">${cnt}</span>
            </div>`).join('') : '<p style="color:var(--dim);font-size:12px">Sin datos aún</p>'}
        </div>
      </div>`;
  } catch(e) {
    document.getElementById('rep-content').innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p>Error: ${e.message}</p></div>`;
  }
}

// ── EXCEL HELPERS ─────────────────────────────────────────────
function _xlStyles() {
  function S(id, bg, fg, bold, sz, wrap, numFmt) {
    let out = `<Style ss:ID="${id}">`;
    const fontParts = [];
    if (bold) fontParts.push('ss:Bold="1"');
    if (fg)   fontParts.push(`ss:Color="${fg}"`);
    if (sz)   fontParts.push(`ss:Size="${sz}"`);
    if (fontParts.length) out += `<Font ${fontParts.join(' ')}/>`;
    if (bg)   out += `<Interior ss:Color="${bg}" ss:Pattern="Solid"/>`;
    if (wrap) out += `<Alignment ss:WrapText="1" ss:Vertical="Top"/>`;
    else      out += `<Alignment ss:Vertical="Center"/>`;
    if (numFmt) out += `<NumberFormat ss:Format="${numFmt}"/>`;
    out += `<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/></Borders>`;
    out += '</Style>';
    return out;
  }
  return [
    S('def',    '',        '',        false, 10, false),
    S('titulo', '#1e3a5f', '#FFFFFF', true,  14, false),
    S('sub',    '#2c7be5', '#FFFFFF', false, 10, false),
    S('hdr',    '#1e3a5f', '#FFFFFF', true,  10, false),
    S('hdrv',   '#1a5632', '#FFFFFF', true,  10, false),
    S('kpilbl', '#f1f5f9', '#334155', true,  10, false),
    S('kpival', '#dbeafe', '#1e40af', true,  12, false),
    S('kpivok', '#dcfce7', '#166534', true,  12, false),
    S('kpivwn', '#fef9c3', '#713f12', true,  12, false),
    S('kpivrd', '#fee2e2', '#991b1b', true,  12, false),
    S('alt',    '#f8fafc', '#1e293b', false, 10, false),
    S('altv',   '#f0fdf4', '#1e293b', false, 10, false),
    S('bold',   '',        '#0f172a', true,  10, false),
    S('pend',   '#fef9c3', '#713f12', false, 10, false),
    S('recib',  '#dbeafe', '#1e40af', false, 10, false),
    S('impre',  '#ede9fe', '#5b21b6', false, 10, false),
    S('entre',  '#dcfce7', '#166534', false, 10, false),
    S('cance',  '#fee2e2', '#991b1b', false, 10, false),
    S('vpag',   '#dcfce7', '#166534', false, 10, false),
    S('vdeu',   '#fee2e2', '#991b1b', false, 10, false),
    S('vsin',   '#f1f5f9', '#475569', false, 10, false),
    S('total',  '#e2e8f0', '#0f172a', true,  11, false),
    S('totalv', '#bbf7d0', '#14532d', true,  11, false),
    S('pesos',  '',        '#0f172a', false, 10, false, '"$"#,##0'),
    S('pesosv', '#dcfce7', '#166534', true,  11, false, '"$"#,##0'),
    S('pesosr', '#fee2e2', '#991b1b', true,  11, false, '"$"#,##0'),
    S('wrap',   '',        '#1e293b', false, 9,  true),
  ].join('');
}

function _xlC(val, type, sid, merge) {
  const t = type || (typeof val === 'number' ? 'Number' : 'String');
  const s = sid   ? ` ss:StyleID="${sid}"`            : '';
  const m = merge ? ` ss:MergeAcross="${merge}"`      : '';
  if (val === null || val === undefined || val === '') return `<Cell${s}${m}><Data ss:Type="String"></Data></Cell>`;
  const v = t === 'String' ? String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : val;
  return `<Cell${s}${m}><Data ss:Type="${t}">${v}</Data></Cell>`;
}
function _xlR(cells, h) {
  return `<Row${h ? ` ss:AutoFitHeight="0" ss:Height="${h}"` : ''}>${cells.join('')}</Row>`;
}
function _xlSheet(name, colW, rows) {
  const cols = colW.map(w => `<Column ss:Width="${w}"/>`).join('');
  return `<Worksheet ss:Name="${_xlEsc(name)}"><Table>${cols}${rows.join('')}</Table></Worksheet>`;
}
function _xlEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _xlDl(filename, sheets) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles>${_xlStyles()}</Styles>${sheets.join('')}</Workbook>`;
  const blob = new Blob(['﻿' + xml], { type: 'application/vnd.ms-excel; charset=UTF-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const _MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function _xlFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}
function _xlFechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}
const _ESTADO_SID = { pendiente:'pend', recibido:'recib', impreso:'impre', entregado:'entre', cancelado:'cance' };

// ── EXCEL GENERAL ─────────────────────────────────────────────
async function exportarExcelGeneral() {
  const ano = _ano !== undefined ? _ano : _hoy.getFullYear();
  const mes = _mes !== undefined ? _mes : _hoy.getMonth();
  const ini = new Date(ano, mes, 1).toISOString();
  const fin = new Date(ano, mes + 1, 1).toISOString();
  const nomMes = _MESES_ES[mes];
  toast('Generando Excel general…', 'info');
  try {
    const [{ data: sols, error: e1 }, { data: trabajos }] = await Promise.all([
      _sb.from('bib_solicitudes')
        .select('id,id_solicitud,fecha_recepcion,remitente_email,remitente_nombre,asunto,estado,destinatarios,profesor,area,materia,nombre_recibe,notif_recibido_en,notif_impreso_en,notif_entregado_en,fecha_entrega,bib_documentos(num_hojas,tipo_impresion,forma_impresion,nombre_archivo)')
        .gte('fecha_recepcion', ini).lt('fecha_recepcion', fin)
        .order('fecha_recepcion', { ascending: true }),
      _sb.from('bib_trabajos_impresion')
        .select('solicitud_id,nombre,profesor,total_hojas,archivos')
        .gte('created_at', ini).lt('created_at', fin)
    ]);
    if (e1) throw e1;
    const solsAll = sols || [];
    const trabAll = trabajos || [];

    // ── KPIs ─────────────────────────────────────────────────
    const conteo = { pendiente:0, recibido:0, impreso:0, entregado:0, cancelado:0 };
    let hojasTotal=0, hojasBN=0, hojasColor=0, hojasUna=0, hojasDoble=0;
    solsAll.forEach(s => {
      conteo[s.estado] = (conteo[s.estado]||0) + 1;
      (s.bib_documentos||[]).forEach(d => {
        const h = d.num_hojas||0; hojasTotal+=h;
        if (d.tipo_impresion==='Blanco y negro') hojasBN+=h;
        if (d.tipo_impresion==='Color')          hojasColor+=h;
        if (d.forma_impresion==='Una cara')      hojasUna+=h;
        if (d.forma_impresion==='Doble cara')    hojasDoble+=h;
      });
    });
    const topSol = {};
    solsAll.filter(s=>s.estado==='entregado').forEach(s => {
      const k = s.profesor || s.remitente_email || 'Desconocido';
      topSol[k] = (topSol[k]||0) + (s.bib_documentos||[]).reduce((a,d)=>a+(d.num_hojas||0),0);
    });
    const topArr = Object.entries(topSol).sort((a,b)=>b[1]-a[1]).slice(0,8);

    // ── SHEET 1: RESUMEN ─────────────────────────────────────
    const r1 = [];
    r1.push(_xlR([_xlC(`BIBLIOTECA GOYAVIER — Reporte General`, 'String', 'titulo', 12)], 32));
    r1.push(_xlR([_xlC(`Período: ${nomMes} ${ano}`, 'String', 'sub', 12)], 20));
    r1.push(_xlR([_xlC('', 'String', 'def', 12)], 10));

    r1.push(_xlR([_xlC('RESUMEN DE SOLICITUDES', 'String', 'hdr', 4), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr')], 22));
    const estadoLabels = [['Pendientes','pendiente','kpivwn'],['Recibidas','recibido','kpival'],['Impresas','impreso','kpival'],['Entregadas','entregado','kpivok'],['Canceladas','cancelado','kpivrd']];
    r1.push(_xlR(estadoLabels.map(([lbl,,]) => _xlC(lbl, 'String', 'kpilbl')), 18));
    r1.push(_xlR(estadoLabels.map(([,key,sid]) => _xlC(conteo[key]||0, 'Number', sid)), 28));
    r1.push(_xlR([_xlC('', 'String', 'def', 12)], 8));
    r1.push(_xlR([_xlC('Total solicitudes:', 'String', 'kpilbl', 1), _xlC(solsAll.length, 'Number', 'kpival'), _xlC('', 'String', 'def', 2)], 20));
    r1.push(_xlR([_xlC('', 'String', 'def', 12)], 8));

    r1.push(_xlR([_xlC('ESTADÍSTICAS DE IMPRESIÓN', 'String', 'hdr', 4), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr')], 22));
    r1.push(_xlR([_xlC('Total hojas', 'String', 'kpilbl'), _xlC('Blanco y negro', 'String', 'kpilbl'), _xlC('Color', 'String', 'kpilbl'), _xlC('Una cara', 'String', 'kpilbl'), _xlC('Doble cara', 'String', 'kpilbl')], 18));
    r1.push(_xlR([_xlC(hojasTotal,'Number','kpival'), _xlC(hojasBN,'Number','kpilbl'), _xlC(hojasColor,'Number','kpilbl'), _xlC(hojasUna,'Number','kpilbl'), _xlC(hojasDoble,'Number','kpilbl')], 28));
    r1.push(_xlR([_xlC('', 'String', 'def', 12)], 8));

    if (topArr.length) {
      r1.push(_xlR([_xlC('TOP SOLICITANTES (hojas entregadas)', 'String', 'hdr', 3), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr'), _xlC('', 'String', 'hdr')], 22));
      r1.push(_xlR([_xlC('Nombre / Email', 'String', 'kpilbl', 2), _xlC('', 'String', 'kpilbl'), _xlC('Hojas', 'String', 'kpilbl')], 18));
      topArr.forEach(([n,h], i) => {
        const sid = i === 0 ? 'entre' : i % 2 === 0 ? 'def' : 'alt';
        r1.push(_xlR([_xlC(n, 'String', sid, 2), _xlC('', 'String', sid), _xlC(h, 'Number', sid)], 18));
      });
    }

    const sheet1 = _xlSheet(`${nomMes} ${ano} — Resumen`, [180, 120, 100, 100, 100], r1);

    // ── SHEET 2: DETALLE SOLICITUDES ─────────────────────────
    const hdrs2 = ['N°','ID Sistema','Fecha Recepción','Remitente','Asunto','Estado','Destinatarios (Notificar a)','Total Hojas','B&N','Color','Una cara','Doble cara','Fecha Impresión','Fecha Entrega','Entregado a'];
    const r2 = [];
    r2.push(_xlR([_xlC(`SOLICITUDES — ${nomMes} ${ano}`, 'String', 'titulo', hdrs2.length - 1)], 30));
    r2.push(_xlR(hdrs2.map(h => _xlC(h, 'String', 'hdr')), 22));
    solsAll.forEach((s, i) => {
      const docs = s.bib_documentos || [];
      const hT   = docs.reduce((a,d)=>a+(d.num_hojas||0),0);
      const hBN  = docs.filter(d=>d.tipo_impresion==='Blanco y negro').reduce((a,d)=>a+(d.num_hojas||0),0);
      const hCo  = docs.filter(d=>d.tipo_impresion==='Color').reduce((a,d)=>a+(d.num_hojas||0),0);
      const hUn  = docs.filter(d=>d.forma_impresion==='Una cara').reduce((a,d)=>a+(d.num_hojas||0),0);
      const hDo  = docs.filter(d=>d.forma_impresion==='Doble cara').reduce((a,d)=>a+(d.num_hojas||0),0);
      const dests = Array.isArray(s.destinatarios) ? s.destinatarios.map(d=>typeof d==='string'?d:(d.nombre||d.email)).join(', ') : (s.destinatarios||'');
      const sid   = _ESTADO_SID[s.estado] || (i%2===0?'def':'alt');
      r2.push(_xlR([
        _xlC(i+1, 'Number', sid),
        _xlC(s.id_solicitud||'', 'String', sid),
        _xlC(_xlFecha(s.fecha_recepcion), 'String', sid),
        _xlC(s.remitente_email||'', 'String', sid),
        _xlC(s.asunto||'', 'String', sid),
        _xlC((s.estado||'').charAt(0).toUpperCase()+(s.estado||'').slice(1), 'String', sid),
        _xlC(dests, 'String', sid),
        _xlC(hT||0, 'Number', sid),
        _xlC(hBN||0, 'Number', sid),
        _xlC(hCo||0, 'Number', sid),
        _xlC(hUn||0, 'Number', sid),
        _xlC(hDo||0, 'Number', sid),
        _xlC(_xlFechaCorta(s.notif_impreso_en), 'String', sid),
        _xlC(_xlFechaCorta(s.fecha_entrega||s.notif_entregado_en), 'String', sid),
        _xlC(s.nombre_recibe||'', 'String', sid),
      ], 18));
    });
    r2.push(_xlR([
      _xlC('TOTAL', 'String', 'total', 6),
      _xlC('', 'String', 'total'),
      _xlC(solsAll.reduce((a,s)=>{const h=(s.bib_documentos||[]).reduce((x,d)=>x+(d.num_hojas||0),0);return a+h;},0), 'Number', 'total'),
      ...Array(7).fill(_xlC('', 'String', 'total'))
    ], 22));

    const sheet2 = _xlSheet('Solicitudes', [30,110,120,200,220,90,250,80,70,70,80,85,110,110,180], r2);

    // ── SHEET 3: TRABAJOS DE IMPRESIÓN ────────────────────────
    const hdrs3 = ['N°','ID Solicitud','Nombre del Trabajo','Colaborador','Total Hojas','N° Archivos','Archivos (detalle)'];
    const r3 = [];
    r3.push(_xlR([_xlC(`TRABAJOS DE IMPRESIÓN — ${nomMes} ${ano}`, 'String', 'titulo', hdrs3.length - 1)], 30));
    r3.push(_xlR(hdrs3.map(h => _xlC(h, 'String', 'hdr')), 22));
    const solMap = new Map(solsAll.map(s => [s.id, s.id_solicitud]));
    trabAll.forEach((t, i) => {
      const arch    = Array.isArray(t.archivos) ? t.archivos : [];
      const archDet = arch.map(a => `${a.nombre} (${a.copias}c×${a.paginas}p, ${a.tipo_impresion||''}, ${a.tamano_hoja||''})`).join(' | ');
      const sid     = i%2===0 ? 'def' : 'alt';
      r3.push(_xlR([
        _xlC(i+1, 'Number', sid),
        _xlC(solMap.get(t.solicitud_id)||t.solicitud_id||'', 'String', sid),
        _xlC(t.nombre||'', 'String', sid),
        _xlC(t.profesor||'', 'String', sid),
        _xlC(t.total_hojas||0, 'Number', sid),
        _xlC(arch.length, 'Number', sid),
        _xlC(archDet, 'String', 'wrap'),
      ], 18));
    });
    if (trabAll.length) {
      r3.push(_xlR([
        _xlC('TOTAL', 'String', 'total', 3),
        _xlC('', 'String', 'total'),
        _xlC(trabAll.reduce((a,t)=>a+(t.total_hojas||0),0), 'Number', 'total'),
        _xlC('', 'String', 'total'), _xlC('', 'String', 'total'),
      ], 22));
    }
    const sheet3 = _xlSheet('Trabajos Impresión', [30,110,220,180,90,90,350], r3);

    _xlDl(`Biblioteca_General_${nomMes}_${ano}.xls`, [sheet1, sheet2, sheet3]);
    toast('Excel general descargado.', 'success');
  } catch(e) {
    toast('Error al generar Excel: ' + e.message, 'error');
  }
}

// ── EXCEL VENTAS ─────────────────────────────────────────────
async function exportarExcelVentas() {
  const ano = _ano !== undefined ? _ano : _hoy.getFullYear();
  const mes = _mes !== undefined ? _mes : _hoy.getMonth();
  const ini = new Date(ano, mes, 1).toISOString();
  const fin = new Date(ano, mes + 1, 1).toISOString();
  const nomMes = _MESES_ES[mes];
  toast('Generando Excel ventas…', 'info');
  try {
    const { data: ventas, error } = await _sb.from('bib_solicitudes')
      .select('id,id_solicitud,fecha_recepcion,remitente_email,remitente_nombre,asunto,estado,bib_trabajos_personal(id,precio_total,valor_pagado,descripcion)')
      .eq('tipo_remitente', 'personal')
      .gte('fecha_recepcion', ini).lt('fecha_recepcion', fin)
      .order('fecha_recepcion', { ascending: true });
    if (error) throw error;
    const rows = ventas || [];

    // ── KPIs ─────────────────────────────────────────────────
    let totCobrado=0, totRecibido=0, totDeuda=0;
    let cPag=0, cDeu=0, cSin=0, cCan=0;
    rows.forEach(r => {
      if (r.estado === 'cancelado') { cCan++; return; }
      const trabs  = r.bib_trabajos_personal || [];
      const cobrado = trabs.reduce((a,t)=>a+(t.precio_total||0),0);
      const recibido= trabs.reduce((a,t)=>a+(t.valor_pagado||0),0);
      const saldo   = cobrado - recibido;
      totCobrado  += cobrado;
      totRecibido += recibido;
      totDeuda    += saldo > 0.005 ? saldo : 0;
      if (!trabs.length)       cSin++;
      else if (saldo > 0.005)  cDeu++;
      else                     cPag++;
    });

    // ── SHEET 1: RESUMEN ─────────────────────────────────────
    const r1 = [];
    r1.push(_xlR([_xlC(`BIBLIOTECA GOYAVIER — Reporte de Ventas`, 'String', 'hdrv', 4)], 32));
    r1.push(_xlR([_xlC(`Período: ${nomMes} ${ano}`, 'String', 'sub', 4)], 20));
    r1.push(_xlR([_xlC('', 'String', 'def', 4)], 10));

    r1.push(_xlR([_xlC('RESUMEN FINANCIERO', 'String', 'hdrv', 4)], 22));
    r1.push(_xlR([_xlC('Total cobrado','String','kpilbl'), _xlC('Total recibido','String','kpilbl'), _xlC('Total pendiente','String','kpilbl'), _xlC('Solicitudes','String','kpilbl')], 18));
    r1.push(_xlR([_xlC(totCobrado,'Number','pesosv'), _xlC(totRecibido,'Number','pesosv'), _xlC(totDeuda,'Number','pesosr'), _xlC(rows.length,'Number','kpival')], 30));
    r1.push(_xlR([_xlC('', 'String', 'def', 4)], 10));

    r1.push(_xlR([_xlC('ESTADO DE PAGOS', 'String', 'hdrv', 4)], 22));
    r1.push(_xlR([_xlC('Pagado','String','kpilbl'), _xlC('Con deuda','String','kpilbl'), _xlC('Sin registrar','String','kpilbl'), _xlC('Canceladas','String','kpilbl')], 18));
    r1.push(_xlR([_xlC(cPag,'Number','kpivok'), _xlC(cDeu,'Number','kpivrd'), _xlC(cSin,'Number','kpilbl'), _xlC(cCan,'Number','kpilbl')], 28));

    const sheet1 = _xlSheet(`${nomMes} ${ano} — Ventas`, [160,160,160,140], r1);

    // ── SHEET 2: DETALLE ─────────────────────────────────────
    const hdrs2 = ['N°','Fecha','Remitente','Asunto','Estado pago','# Trabajos','Total cobrado','Total recibido','Saldo pendiente'];
    const r2 = [];
    r2.push(_xlR([_xlC(`DETALLE VENTAS — ${nomMes} ${ano}`, 'String', 'hdrv', hdrs2.length - 1)], 30));
    r2.push(_xlR(hdrs2.map(h => _xlC(h, 'String', 'hdrv')), 22));
    rows.forEach((s, i) => {
      const trabs   = s.bib_trabajos_personal || [];
      const cobrado = trabs.reduce((a,t)=>a+(t.precio_total||0),0);
      const recibido= trabs.reduce((a,t)=>a+(t.valor_pagado||0),0);
      const saldo   = cobrado - recibido;
      let estadoPago, sid;
      if (s.estado === 'cancelado')    { estadoPago = 'Cancelada';       sid = 'cance'; }
      else if (!trabs.length)          { estadoPago = 'Sin registrar';   sid = 'vsin'; }
      else if (saldo > 0.005)          { estadoPago = 'Con deuda';       sid = 'vdeu'; }
      else                             { estadoPago = 'Pagado';          sid = 'vpag'; }
      const altSid = (i%2===0) ? sid : (sid==='vpag'?'altv':sid);
      r2.push(_xlR([
        _xlC(i+1, 'Number', altSid),
        _xlC(_xlFechaCorta(s.fecha_recepcion), 'String', altSid),
        _xlC(s.remitente_email||'', 'String', altSid),
        _xlC(s.asunto||'', 'String', altSid),
        _xlC(estadoPago, 'String', altSid),
        _xlC(trabs.length, 'Number', altSid),
        _xlC(cobrado, 'Number', 'pesos'),
        _xlC(recibido, 'Number', 'pesos'),
        _xlC(saldo > 0.005 ? saldo : 0, 'Number', saldo > 0.005 ? 'pesosr' : 'pesos'),
      ], 18));
    });
    r2.push(_xlR([
      _xlC('TOTAL', 'String', 'totalv', 5),
      _xlC('', 'String', 'totalv'),
      _xlC(totCobrado,  'Number', 'pesosv'),
      _xlC(totRecibido, 'Number', 'pesosv'),
      _xlC(totDeuda,    'Number', 'pesosr'),
    ], 24));

    const sheet2 = _xlSheet('Detalle Ventas', [30,110,220,250,110,90,130,130,130], r2);

    _xlDl(`Biblioteca_Ventas_${nomMes}_${ano}.xls`, [sheet1, sheet2]);
    toast('Excel ventas descargado.', 'success');
  } catch(e) {
    toast('Error al generar Excel: ' + e.message, 'error');
  }
}
