// ── REPORTES ─────────────────────────────────────────────────
async function cargarReportes() {
  document.getElementById('rep-content').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const ano  = _ano !== undefined ? _ano  : _hoy.getFullYear();
    const mes  = _mes !== undefined ? _mes  : _hoy.getMonth();
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
            </div>`).join('') : '<p style="color:var(--dim);font-size:12px">Sin datos aun</p>'}
        </div>
        <div class="rep-card" style="grid-column:span 2">
          <div class="rep-card-title">Top destinatarios · ${ano} (envios realizados)</div>
          ${destArr.length ? destArr.map(([email,cnt],i) => `
            <div class="rep-bar-row">
              <span class="rep-bar-lbl" title="${email}">${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${shortEmail(email)}</span>
              <div class="rep-bar-bg"><div class="rep-bar-fill" style="width:${(cnt/maxDest*100).toFixed(0)}%;background:var(--accent)"></div></div>
              <span class="rep-bar-cnt">${cnt}</span>
            </div>`).join('') : '<p style="color:var(--dim);font-size:12px">Sin datos aun</p>'}
        </div>
      </div>`;
  } catch(e) {
    document.getElementById('rep-content').innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p>Error: ${e.message}</p></div>`;
  }
}

// ── EXCEL — utilidades SpreadsheetML ─────────────────────────
const _XM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function _xEsc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function _xFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function _xFechaC(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function _xPesos(n) { return '$ ' + Math.round(n||0).toLocaleString('es-CO'); }

// Genera un cell XML. val=valor, t='String'|'Number', sid=styleId
function _xC(val, t, sid) {
  const s = sid ? ` ss:StyleID="${sid}"` : '';
  const tipo = t || (typeof val === 'number' ? 'Number' : 'String');
  if (val === null || val === undefined || val === '') {
    return `<Cell${s}><Data ss:Type="String"></Data></Cell>`;
  }
  const v = tipo === 'String' ? _xEsc(val) : (isNaN(val) ? 0 : val);
  return `<Cell${s}><Data ss:Type="${tipo}">${v}</Data></Cell>`;
}

// Fila de encabezado que llena N columnas con el texto en la primera
function _xHdr(text, sid, n) {
  let r = _xC(text, 'String', sid);
  for (let i = 1; i < n; i++) r += _xC('', 'String', sid);
  return `<Row ss:AutoFitHeight="0" ss:Height="24">${r}</Row>`;
}

function _xRow(cells, h) {
  return `<Row${h ? ` ss:AutoFitHeight="0" ss:Height="${h}"` : ''}>${cells.join('')}</Row>`;
}

function _xSheet(name, colWidths, rows) {
  const cols = colWidths.map(w => `<Column ss:Width="${w}"/>`).join('');
  return `<Worksheet ss:Name="${_xEsc(name)}"><Table>${cols}${rows.join('')}</Table></Worksheet>`;
}

function _xStyles() {
  function S(id, bg, fg, bold, sz, numFmt) {
    let o = `<Style ss:ID="${id}">`;
    o += `<Alignment ss:Vertical="Center"${sz === 'wrap' ? ' ss:WrapText="1"' : ''}/>`;
    const fp = [];
    if (bold) fp.push('ss:Bold="1"');
    if (fg)   fp.push(`ss:Color="${fg}"`);
    if (sz && sz !== 'wrap') fp.push(`ss:Size="${sz}"`);
    if (fp.length) o += `<Font ${fp.join(' ')}/>`;
    if (bg) o += `<Interior ss:Color="${bg}" ss:Pattern="Solid"/>`;
    if (numFmt) o += `<NumberFormat ss:Format="${numFmt}"/>`;
    o += `<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders>`;
    return o + '</Style>';
  }
  return [
    // Obligatorio: estilo Default
    `<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>`,
    S('def',   '',        '#1e293b', false, 10),
    S('alt',   '#F8FAFC', '#1e293b', false, 10),
    // Generales
    S('tit',   '#1e3a5f', '#FFFFFF', true,  13),
    S('per',   '#2c7be5', '#FFFFFF', false, 10),
    S('sh',    '#334155', '#FFFFFF', true,  10),
    S('ch',    '#475569', '#FFFFFF', true,   9),
    S('tot',   '#E2E8F0', '#0f172a', true,  10),
    // Estados
    S('pend',  '#FEF9C3', '#713F12', false, 10),
    S('reci',  '#DBEAFE', '#1E40AF', false, 10),
    S('impr',  '#EDE9FE', '#5B21B6', false, 10),
    S('entr',  '#DCFCE7', '#166534', false, 10),
    S('canc',  '#FEE2E2', '#991B1B', false, 10),
    // KPIs generales
    S('kn',    '#F1F5F9', '#334155', true,   9),
    S('kv',    '#DBEAFE', '#1E40AF', true,  13),
    S('kvo',   '#DCFCE7', '#166534', true,  13),
    S('kvw',   '#FEF9C3', '#713F12', true,  13),
    S('kvr',   '#FEE2E2', '#991B1B', true,  13),
    // Ventas
    S('vtit',  '#1a5632', '#FFFFFF', true,  13),
    S('vper',  '#15803d', '#FFFFFF', false, 10),
    S('vsh',   '#166534', '#FFFFFF', true,  10),
    S('vch',   '#14532D', '#FFFFFF', true,   9),
    S('vpag',  '#DCFCE7', '#166534', false, 10),
    S('vdeu',  '#FEE2E2', '#991B1B', false, 10),
    S('vsin',  '#F1F5F9', '#475569', false, 10),
    S('vtot',  '#BBF7D0', '#14532D', true,  10),
    S('vtotr', '#FEE2E2', '#991B1B', true,  10),
    S('pw',    '#DBEAFE', '#1E40AF', true,  10),
    S('pr',    '#FEE2E2', '#991B1B', true,  10),
    S('pg',    '#DCFCE7', '#166534', true,  10),
    S('wrap',  '',        '#1e293b', false, 'wrap'),
  ].join('');
}

function _xDl(filename, sheets) {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    `<Styles>${_xStyles()}</Styles>`,
    ...sheets,
    '</Workbook>'
  ].join('');
  const blob = new Blob(['﻿' + xml], { type: 'application/vnd.ms-excel;charset=UTF-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const _SID = { pendiente:'pend', recibido:'reci', impreso:'impr', entregado:'entr', cancelado:'canc' };

// ── EXCEL GENERAL ─────────────────────────────────────────────
async function exportarExcelGeneral() {
  const ano = _ano !== undefined ? _ano : _hoy.getFullYear();
  const mes = _mes !== undefined ? _mes : _hoy.getMonth();
  const ini = new Date(ano, mes, 1).toISOString();
  const fin = new Date(ano, mes + 1, 1).toISOString();
  const nom = _XM[mes];
  toast('Generando Excel general...', 'info');
  try {
    const [{ data: sols, error: e1 }, { data: trabs }] = await Promise.all([
      _sb.from('bib_solicitudes')
        .select('id,id_solicitud,fecha_recepcion,remitente_email,asunto,estado,destinatarios,profesor,nombre_recibe,notif_impreso_en,notif_entregado_en,fecha_entrega,bib_documentos(num_hojas,tipo_impresion,forma_impresion,nombre_archivo)')
        .gte('fecha_recepcion', ini).lt('fecha_recepcion', fin)
        .order('fecha_recepcion', { ascending: true }),
      _sb.from('bib_trabajos_impresion')
        .select('solicitud_id,nombre,profesor,total_hojas,archivos,created_at')
        .gte('created_at', ini).lt('created_at', fin)
    ]);
    if (e1) throw e1;
    const SS = sols || [];
    const TT = trabs || [];

    // KPIs
    const cnt = { pendiente:0, recibido:0, impreso:0, entregado:0, cancelado:0 };
    let hTot=0, hBN=0, hCo=0, hUn=0, hDo=0;
    SS.forEach(s => {
      cnt[s.estado] = (cnt[s.estado]||0) + 1;
      (s.bib_documentos||[]).forEach(d => {
        const h=d.num_hojas||0; hTot+=h;
        if(d.tipo_impresion==='Blanco y negro') hBN+=h;
        if(d.tipo_impresion==='Color')          hCo+=h;
        if(d.forma_impresion==='Una cara')      hUn+=h;
        if(d.forma_impresion==='Doble cara')    hDo+=h;
      });
    });
    const topMap = {};
    SS.filter(s=>s.estado==='entregado').forEach(s => {
      const k = s.profesor||s.remitente_email||'Desconocido';
      topMap[k] = (topMap[k]||0) + (s.bib_documentos||[]).reduce((a,d)=>a+(d.num_hojas||0),0);
    });
    const topArr = Object.entries(topMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

    // ── HOJA 1: RESUMEN (5 columnas) ─────────────────────────
    const N1 = 5;
    const r1 = [];
    r1.push(_xHdr(`BIBLIOTECA GOYAVIER — Reporte General · ${nom} ${ano}`, 'tit', N1));
    r1.push(_xHdr(`Generado: ${_xFecha(new Date().toISOString())}`, 'per', N1));
    r1.push(_xHdr('', 'def', N1));

    r1.push(_xHdr('SOLICITUDES DEL MES', 'sh', N1));
    r1.push(_xRow([_xC('Pendientes','String','kn'),_xC('Recibidas','String','kn'),_xC('Impresas','String','kn'),_xC('Entregadas','String','kn'),_xC('Canceladas','String','kn')], 18));
    r1.push(_xRow([_xC(cnt.pendiente,'Number','kvw'),_xC(cnt.recibido,'Number','kv'),_xC(cnt.impreso,'Number','kv'),_xC(cnt.entregado,'Number','kvo'),_xC(cnt.cancelado,'Number','kvr')], 30));
    r1.push(_xRow([_xC('Total solicitudes','String','kn'),_xC(SS.length,'Number','kv'),_xC('','String','def'),_xC('','String','def'),_xC('','String','def')], 22));
    r1.push(_xHdr('', 'def', N1));

    r1.push(_xHdr('IMPRESION DEL MES', 'sh', N1));
    r1.push(_xRow([_xC('Total hojas','String','kn'),_xC('Blanco y negro','String','kn'),_xC('Color','String','kn'),_xC('Una cara','String','kn'),_xC('Doble cara','String','kn')], 18));
    r1.push(_xRow([_xC(hTot,'Number','kv'),_xC(hBN,'Number','kn'),_xC(hCo,'Number','kn'),_xC(hUn,'Number','kn'),_xC(hDo,'Number','kn')], 30));
    r1.push(_xHdr('', 'def', N1));

    if (topArr.length) {
      r1.push(_xHdr('TOP SOLICITANTES (hojas entregadas)', 'sh', N1));
      r1.push(_xRow([_xC('Nombre / Correo','String','ch'),_xC('Hojas','String','ch'),_xC('','String','ch'),_xC('','String','ch'),_xC('','String','ch')], 18));
      topArr.forEach(([n,h],i) => {
        const sid = i%2===0 ? 'def' : 'alt';
        r1.push(_xRow([_xC(n,'String',sid),_xC(h,'Number',sid),_xC('','String',sid),_xC('','String',sid),_xC('','String',sid)], 18));
      });
    }
    const s1 = _xSheet(`${nom} ${ano} - Resumen`, [220,100,100,100,100], r1);

    // ── HOJA 2: SOLICITUDES (15 columnas) ────────────────────
    const H2 = ['N','ID Sistema','Fecha Recepcion','Remitente','Asunto','Estado','Notificar a','Total Hojas','B y N','Color','Una cara','Doble cara','Fecha Impresion','Fecha Entrega','Entregado a'];
    const N2 = H2.length;
    const r2 = [];
    r2.push(_xHdr(`SOLICITUDES — ${nom} ${ano}`, 'tit', N2));
    r2.push(_xRow(H2.map(h => _xC(h,'String','ch')), 20));
    SS.forEach((s,i) => {
      const docs = s.bib_documentos||[];
      const hT = docs.reduce((a,d)=>a+(d.num_hojas||0),0);
      const hB = docs.filter(d=>d.tipo_impresion==='Blanco y negro').reduce((a,d)=>a+(d.num_hojas||0),0);
      const hC = docs.filter(d=>d.tipo_impresion==='Color').reduce((a,d)=>a+(d.num_hojas||0),0);
      const hU = docs.filter(d=>d.forma_impresion==='Una cara').reduce((a,d)=>a+(d.num_hojas||0),0);
      const hD = docs.filter(d=>d.forma_impresion==='Doble cara').reduce((a,d)=>a+(d.num_hojas||0),0);
      const dest = Array.isArray(s.destinatarios) ? s.destinatarios.map(d=>typeof d==='string'?d:(d.nombre||d.email)).join(', ') : '';
      const sid  = _SID[s.estado] || (i%2===0?'def':'alt');
      r2.push(_xRow([
        _xC(i+1,'Number',sid), _xC(s.id_solicitud||'','String',sid), _xC(_xFecha(s.fecha_recepcion),'String',sid),
        _xC(s.remitente_email||'','String',sid), _xC(s.asunto||'','String',sid),
        _xC((s.estado||'')[0].toUpperCase()+(s.estado||'').slice(1),'String',sid),
        _xC(dest,'String',sid),
        _xC(hT,'Number',sid),_xC(hB,'Number',sid),_xC(hC,'Number',sid),_xC(hU,'Number',sid),_xC(hD,'Number',sid),
        _xC(_xFechaC(s.notif_impreso_en),'String',sid),
        _xC(_xFechaC(s.fecha_entrega||s.notif_entregado_en),'String',sid),
        _xC(s.nombre_recibe||'','String',sid),
      ], 18));
    });
    r2.push(_xRow([
      _xC('TOTAL','String','tot'),_xC('','String','tot'),_xC('','String','tot'),
      _xC('','String','tot'),_xC('','String','tot'),_xC(SS.length,'Number','tot'),
      _xC('','String','tot'),_xC(hTot,'Number','tot'),
      _xC(hBN,'Number','tot'),_xC(hCo,'Number','tot'),_xC(hUn,'Number','tot'),_xC(hDo,'Number','tot'),
      _xC('','String','tot'),_xC('','String','tot'),_xC('','String','tot'),
    ], 22));
    const s2 = _xSheet('Solicitudes', [30,110,120,200,220,90,240,80,70,70,80,85,115,115,180], r2);

    // ── HOJA 3: TRABAJOS DE IMPRESION (7 columnas) ────────────
    const H3 = ['N','ID Solicitud','Nombre del Trabajo','Colaborador','Total Hojas','N Archivos','Archivos (detalle)'];
    const N3 = H3.length;
    const solMap = new Map(SS.map(s=>[s.id, s.id_solicitud]));
    const r3 = [];
    r3.push(_xHdr(`TRABAJOS DE IMPRESION — ${nom} ${ano}`, 'tit', N3));
    r3.push(_xRow(H3.map(h => _xC(h,'String','ch')), 20));
    TT.forEach((t,i) => {
      const arch = Array.isArray(t.archivos) ? t.archivos : [];
      const det  = arch.map(a=>`${a.nombre} (${a.copias||0}c x ${a.paginas||0}p, ${a.tipo_impresion||''}, ${a.tamano_hoja||''})`).join(' | ');
      const sid  = i%2===0 ? 'def' : 'alt';
      r3.push(_xRow([
        _xC(i+1,'Number',sid), _xC(solMap.get(t.solicitud_id)||'','String',sid),
        _xC(t.nombre||'','String',sid), _xC(t.profesor||'','String',sid),
        _xC(t.total_hojas||0,'Number',sid), _xC(arch.length,'Number',sid),
        _xC(det,'String','wrap'),
      ], 18));
    });
    if (TT.length) {
      r3.push(_xRow([
        _xC('TOTAL','String','tot'),_xC('','String','tot'),_xC('','String','tot'),_xC('','String','tot'),
        _xC(TT.reduce((a,t)=>a+(t.total_hojas||0),0),'Number','tot'),
        _xC(TT.reduce((a,t)=>a+(Array.isArray(t.archivos)?t.archivos.length:0),0),'Number','tot'),
        _xC('','String','tot'),
      ], 22));
    }
    const s3 = _xSheet('Trabajos Impresion', [30,110,230,180,90,90,380], r3);

    _xDl(`Biblioteca_General_${nom}_${ano}.xls`, [s1, s2, s3]);
    toast('Excel general descargado.', 'success');
  } catch(e) { toast('Error al generar Excel: ' + e.message, 'error'); }
}

// ── EXCEL VENTAS ─────────────────────────────────────────────
async function exportarExcelVentas() {
  const ano = _ano !== undefined ? _ano : _hoy.getFullYear();
  const mes = _mes !== undefined ? _mes : _hoy.getMonth();
  const ini = new Date(ano, mes, 1).toISOString();
  const fin = new Date(ano, mes + 1, 1).toISOString();
  const nom = _XM[mes];
  toast('Generando Excel ventas...', 'info');
  try {
    const { data: rows, error } = await _sb.from('bib_solicitudes')
      .select('id,id_solicitud,fecha_recepcion,remitente_email,asunto,estado,bib_trabajos_personal(id,precio_total,valor_pagado)')
      .eq('tipo_remitente', 'personal')
      .gte('fecha_recepcion', ini).lt('fecha_recepcion', fin)
      .order('fecha_recepcion', { ascending: true });
    if (error) throw error;
    const RR = rows || [];

    let totCob=0, totRec=0, totDeu=0, cPag=0, cDeu=0, cSin=0, cCan=0;
    RR.forEach(r => {
      if (r.estado==='cancelado') { cCan++; return; }
      const tt = r.bib_trabajos_personal||[];
      const co = tt.reduce((a,t)=>a+(t.precio_total||0),0);
      const re = tt.reduce((a,t)=>a+(t.valor_pagado||0),0);
      const sd = co - re;
      totCob += co; totRec += re; if(sd>0.005) totDeu+=sd;
      if(!tt.length) cSin++;
      else if(sd>0.005) cDeu++;
      else cPag++;
    });

    // ── HOJA 1: RESUMEN (4 columnas) ─────────────────────────
    const N1 = 4;
    const r1 = [];
    r1.push(_xHdr(`BIBLIOTECA GOYAVIER — Reporte de Ventas · ${nom} ${ano}`, 'vtit', N1));
    r1.push(_xHdr(`Generado: ${_xFecha(new Date().toISOString())}`, 'vper', N1));
    r1.push(_xHdr('', 'def', N1));

    r1.push(_xHdr('RESUMEN FINANCIERO', 'vsh', N1));
    r1.push(_xRow([_xC('Total cobrado','String','kn'),_xC('Total recibido','String','kn'),_xC('Total pendiente','String','kn'),_xC('Solicitudes','String','kn')], 18));
    r1.push(_xRow([_xC(_xPesos(totCob),'String','pg'),_xC(_xPesos(totRec),'String','pg'),_xC(_xPesos(totDeu),'String','pr'),_xC(RR.length,'Number','pw')], 30));
    r1.push(_xHdr('', 'def', N1));

    r1.push(_xHdr('ESTADO DE PAGOS', 'vsh', N1));
    r1.push(_xRow([_xC('Pagadas','String','kn'),_xC('Con deuda','String','kn'),_xC('Sin registrar','String','kn'),_xC('Canceladas','String','kn')], 18));
    r1.push(_xRow([_xC(cPag,'Number','kvo'),_xC(cDeu,'Number','kvr'),_xC(cSin,'Number','kn'),_xC(cCan,'Number','kn')], 30));
    const s1 = _xSheet(`${nom} ${ano} - Ventas`, [180,180,180,150], r1);

    // ── HOJA 2: DETALLE (9 columnas) ─────────────────────────
    const H2 = ['N','Fecha','Remitente','Asunto','Estado Pago','N Trabajos','Total Cobrado','Total Recibido','Saldo'];
    const N2 = H2.length;
    const r2 = [];
    r2.push(_xHdr(`DETALLE VENTAS — ${nom} ${ano}`, 'vtit', N2));
    r2.push(_xRow(H2.map(h=>_xC(h,'String','vch')), 20));
    RR.forEach((s,i) => {
      const tt = s.bib_trabajos_personal||[];
      const co = tt.reduce((a,t)=>a+(t.precio_total||0),0);
      const re = tt.reduce((a,t)=>a+(t.valor_pagado||0),0);
      const sd = co - re;
      let estadoPago, sid;
      if (s.estado==='cancelado')  { estadoPago='Cancelada';     sid='canc'; }
      else if (!tt.length)         { estadoPago='Sin registrar'; sid='vsin'; }
      else if (sd>0.005)           { estadoPago='Con deuda';     sid='vdeu'; }
      else                         { estadoPago='Pagado';        sid='vpag'; }
      r2.push(_xRow([
        _xC(i+1,'Number',sid),
        _xC(_xFechaC(s.fecha_recepcion),'String',sid),
        _xC(s.remitente_email||'','String',sid),
        _xC(s.asunto||'','String',sid),
        _xC(estadoPago,'String',sid),
        _xC(tt.length,'Number',sid),
        _xC(_xPesos(co),'String',sid),
        _xC(_xPesos(re),'String',sid),
        _xC(sd>0.005?_xPesos(sd):'—','String',sd>0.005?'vdeu':sid),
      ], 18));
    });
    r2.push(_xRow([
      _xC('TOTAL','String','vtot'),_xC('','String','vtot'),_xC('','String','vtot'),
      _xC('','String','vtot'),_xC('','String','vtot'),
      _xC(RR.length,'Number','vtot'),
      _xC(_xPesos(totCob),'String','vtot'),
      _xC(_xPesos(totRec),'String','vtot'),
      _xC(_xPesos(totDeu),'String','vtotr'),
    ], 24));
    const s2 = _xSheet('Detalle Ventas', [30,100,220,250,110,90,130,130,130], r2);

    _xDl(`Biblioteca_Ventas_${nom}_${ano}.xls`, [s1, s2]);
    toast('Excel ventas descargado.', 'success');
  } catch(e) { toast('Error al generar Excel: ' + e.message, 'error'); }
}
