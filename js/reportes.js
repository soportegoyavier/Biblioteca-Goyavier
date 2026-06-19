// ── REPORTES ─────────────────────────────────────────────────
async function cargarReportes() {
  document.getElementById('rep-content').innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    const p1 = new Date(_hoy.getFullYear(), _hoy.getMonth(), 1).toISOString();
    const p2 = new Date(_hoy.getFullYear(), _hoy.getMonth() + 1, 1).toISOString();
    const pa  = new Date(_hoy.getFullYear(), 0, 1).toISOString();
    const [{ data: mesD }, { data: anoD }, { data: topD }] = await Promise.all([
      _sb.from('bib_documentos').select('num_hojas,tipo_impresion,forma_impresion,bib_solicitudes!inner(fecha_recepcion)')
        .gte('bib_solicitudes.fecha_recepcion', p1).lt('bib_solicitudes.fecha_recepcion', p2),
      _sb.from('bib_documentos').select('num_hojas,tipo_impresion,forma_impresion,bib_solicitudes!inner(fecha_recepcion)')
        .gte('bib_solicitudes.fecha_recepcion', pa),
      _sb.from('bib_solicitudes').select('profesor,remitente_email,bib_documentos(num_hojas)')
        .gte('fecha_recepcion', pa).eq('estado', 'entregado')
    ]);
    const { data: destD } = await _sb.from('bib_solicitudes').select('email_destino').gte('fecha_recepcion', pa);
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
    const mes=agg(mesD), ano=agg(anoD);
    const tops={};
    (topD||[]).forEach(s => {
      const k=s.profesor||s.remitente_email||'Desconocido';
      tops[k]=(tops[k]||0)+(s.bib_documentos||[]).reduce((a,d)=>a+(d.num_hojas||0),0);
    });
    const topArr = Object.entries(tops).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxTop = topArr[0]?.[1]||1;

    // Top destinatarios: contar envíos por email_destino
    const dests = {};
    (destD||[]).forEach(s => {
      const k = s.email_destino;
      if (!k) return;
      dests[k] = (dests[k]||0) + 1;
    });
    const destArr = Object.entries(dests).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxDest = destArr[0]?.[1]||1;
    // Mostrar solo usuario (sin dominio) para que quepa en la barra
    function shortEmail(e) { return e.includes('@') ? e.split('@')[0] : e; }

    document.getElementById('rep-content').innerHTML = `
      <div class="sec-hdr"><div class="sec-title">Estadísticas · ${MESES[_hoy.getMonth()]} ${_hoy.getFullYear()}</div></div>
      <div class="rep-grid">
        <div class="rep-card">
          <div class="rep-card-title">Hojas este mes</div>
          <div class="rep-stat"><span>Total hojas</span><span class="rep-stat-val" style="color:var(--accent)">${mes.total}</span></div>
          <div class="rep-stat"><span>Blanco y negro</span><span class="rep-stat-val">${mes.bn}</span></div>
          <div class="rep-stat"><span>Color</span><span class="rep-stat-val" style="color:var(--blue)">${mes.color}</span></div>
          <div class="rep-stat"><span>Una cara</span><span class="rep-stat-val">${mes.una}</span></div>
          <div class="rep-stat"><span>Doble cara</span><span class="rep-stat-val">${mes.doble}</span></div>
        </div>
        <div class="rep-card">
          <div class="rep-card-title">Acumulado ${_hoy.getFullYear()}</div>
          <div class="rep-stat"><span>Total hojas</span><span class="rep-stat-val" style="color:var(--accent)">${ano.total}</span></div>
          <div class="rep-stat"><span>Blanco y negro</span><span class="rep-stat-val">${ano.bn}</span></div>
          <div class="rep-stat"><span>Color</span><span class="rep-stat-val" style="color:var(--blue)">${ano.color}</span></div>
          <div class="rep-stat"><span>Una cara</span><span class="rep-stat-val">${ano.una}</span></div>
          <div class="rep-stat"><span>Doble cara</span><span class="rep-stat-val">${ano.doble}</span></div>
        </div>
        <div class="rep-card" style="grid-column:span 2">
          <div class="rep-card-title">Top solicitantes · ${_hoy.getFullYear()} (hojas entregadas)</div>
          ${topArr.length ? topArr.map(([n,h]) => `
            <div class="rep-bar-row">
              <span class="rep-bar-lbl" title="${n}">${n}</span>
              <div class="rep-bar-bg"><div class="rep-bar-fill" style="width:${(h/maxTop*100).toFixed(0)}%;background:var(--accent)"></div></div>
              <span class="rep-bar-cnt">${h}</span>
            </div>`).join('') : '<p style="color:var(--dim);font-size:12px">Sin datos aún</p>'}
        </div>
        <div class="rep-card" style="grid-column:span 2">
          <div class="rep-card-title">Top destinatarios · ${_hoy.getFullYear()} (envíos realizados)</div>
          ${destArr.length ? destArr.map(([email,cnt],i) => `
            <div class="rep-bar-row">
              <span class="rep-bar-lbl" title="${email}">${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 '+''}${shortEmail(email)}</span>
              <div class="rep-bar-bg"><div class="rep-bar-fill" style="width:${(cnt/maxDest*100).toFixed(0)}%;background:var(--accent)"></div></div>
              <span class="rep-bar-cnt">${cnt}</span>
            </div>`).join('') : '<p style="color:var(--dim);font-size:12px">Sin datos aún</p>'}
        </div>
      </div>`;
  } catch(e) {
    document.getElementById('rep-content').innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p>Error: ${e.message}</p></div>`;
  }
}
