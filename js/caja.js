// ── CAJA ──────────────────────────────────────────────────────
function _initCajaFecha() {
  const el = document.getElementById('caja-fecha');
  if (el && !el.value) el.value = new Date().toISOString().split('T')[0];
}

function setCajaTab(tab, btn) {
  _cajaTab = tab;
  document.querySelectorAll('.caja-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  cargarCaja();
}

async function cargarCaja() {
  const el       = document.getElementById('caja-content');
  const fechaStr = document.getElementById('caja-fecha')?.value;
  if (!fechaStr) { el.innerHTML = '<div class="empty"><div class="eico"><i class="fa fa-calendar"></i></div><p>Selecciona una fecha</p></div>'; return; }
  el.innerHTML = '<div class="loader-wrap"><div class="loader"></div></div>';
  try {
    if (_cajaTab === 'dia') {
      const d1 = fechaStr + 'T00:00:00';
      const d2 = fechaStr + 'T23:59:59.999';
      const [pRes, tRes] = await Promise.all([
        _sb.from('bib_pagos').select('id,monto,notas,created_at,remitente_email').gte('created_at',d1).lte('created_at',d2).order('created_at',{ascending:false}),
        _sb.from('bib_trabajos_personal').select('id,nombre,precio_total,valor_pagado,created_at,bib_solicitudes(remitente_email,asunto)').gte('created_at',d1).lte('created_at',d2).order('created_at',{ascending:false})
      ]);
      const trabajos = tRes.data||[], pagos = pRes.data||[];
      const totVend  = trabajos.reduce((a,t)=>a+(t.precio_total||0),0);
      const totRec   = pagos.reduce((a,p)=>a+(p.monto||0),0);
      const totPend  = trabajos.reduce((a,t)=>a+Math.max(0,(t.precio_total||0)-(t.valor_pagado||0)),0);
      el.innerHTML = `
        <div class="caja-stats">
          <div class="caja-sc"><div class="caja-sc-lbl">Total vendido</div><div class="caja-sc-val azul">${fmtPesos(totVend)}</div></div>
          <div class="caja-sc"><div class="caja-sc-lbl">Dinero recibido</div><div class="caja-sc-val verde">${fmtPesos(totRec)}</div></div>
          <div class="caja-sc"><div class="caja-sc-lbl">Pendiente por cobrar</div><div class="caja-sc-val rojo">${fmtPesos(totPend)}</div></div>
          <div class="caja-sc"><div class="caja-sc-lbl">Trabajos del día</div><div class="caja-sc-val">${trabajos.length}</div></div>
        </div>
        ${trabajos.length?`<div class="sec-hdr"><div class="sec-title">Trabajos registrados</div><div class="sec-hdr-line"></div></div>
        <div class="tw" style="margin-bottom:20px"><table>
          <thead><tr><th>Hora</th><th>Trabajo</th><th>Solicitante</th><th>Cobrado</th><th>Pagado</th><th>Saldo</th></tr></thead>
          <tbody>${trabajos.map(t=>{const sl=(t.precio_total||0)-(t.valor_pagado||0);return`<tr>
            <td class="td-m">${new Date(t.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</td>
            <td>${t.nombre}</td><td class="td-m">${t.bib_solicitudes?.remitente_email||'—'}</td>
            <td class="td-m">${fmtPesos(t.precio_total||0)}</td>
            <td class="td-m" style="color:var(--green)">${fmtPesos(t.valor_pagado||0)}</td>
            <td class="td-m" style="color:${sl>0.005?'var(--red)':'var(--green)'}">${fmtPesos(sl)}</td></tr>`;}).join('')}</tbody>
        </table></div>`:''}
        ${pagos.length?`<div class="sec-hdr"><div class="sec-title">Pagos recibidos</div><div class="sec-hdr-line"></div></div>
        <div class="tw"><table>
          <thead><tr><th>Hora</th><th>Monto</th><th>Solicitante</th><th>Notas</th></tr></thead>
          <tbody>${pagos.map(p=>`<tr>
            <td class="td-m">${new Date(p.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</td>
            <td style="color:var(--green);font-weight:700">${fmtPesos(p.monto)}</td>
            <td class="td-m">${p.remitente_email||'—'}</td><td class="td-m">${p.notas||'—'}</td></tr>`).join('')}</tbody>
        </table></div>`:''}
        ${!trabajos.length&&!pagos.length?`<div class="empty"><div class="eico"><i class="fa fa-inbox"></i></div><p>Sin movimientos el ${fechaStr}</p></div>`:''}`;

    } else if (_cajaTab === 'mes') {
      const [y,m] = fechaStr.split('-');
      const p1 = new Date(+y,+m-1,1).toISOString(), p2 = new Date(+y,+m,1).toISOString();
      const [tRes,pRes] = await Promise.all([
        _sb.from('bib_trabajos_personal').select('precio_total,valor_pagado,archivos').gte('created_at',p1).lt('created_at',p2),
        _sb.from('bib_pagos').select('monto').gte('created_at',p1).lt('created_at',p2)
      ]);
      const trabajos=tRes.data||[], pagos=pRes.data||[];
      const totV=trabajos.reduce((a,t)=>a+(t.precio_total||0),0);
      const totR=pagos.reduce((a,p)=>a+(p.monto||0),0);
      const totP=trabajos.reduce((a,t)=>a+Math.max(0,(t.precio_total||0)-(t.valor_pagado||0)),0);
      const tipoCts={};
      trabajos.forEach(t=>(t.archivos||[]).forEach(a=>{const k=a.tipo||'B&N';tipoCts[k]=(tipoCts[k]||0)+1;}));
      const maxT = Math.max(1,...Object.values(tipoCts));
      el.innerHTML = `
        <div class="caja-stats">
          <div class="caja-sc"><div class="caja-sc-lbl">Total ventas</div><div class="caja-sc-val azul">${fmtPesos(totV)}</div></div>
          <div class="caja-sc"><div class="caja-sc-lbl">Dinero recibido</div><div class="caja-sc-val verde">${fmtPesos(totR)}</div></div>
          <div class="caja-sc"><div class="caja-sc-lbl">Pendiente</div><div class="caja-sc-val rojo">${fmtPesos(totP)}</div></div>
          <div class="caja-sc"><div class="caja-sc-lbl">Trabajos</div><div class="caja-sc-val">${trabajos.length}</div></div>
        </div>
        ${Object.keys(tipoCts).length?`<div class="sec-hdr"><div class="sec-title">Por tipo de impresión</div><div class="sec-hdr-line"></div></div>
        <div class="rep-card" style="margin-bottom:20px">${Object.entries(tipoCts).map(([tipo,cnt])=>`
          <div class="rep-bar-row">
            <div class="rep-bar-lbl">${tipo}</div>
            <div class="rep-bar-bg"><div class="rep-bar-fill" style="width:${Math.round(cnt/maxT*100)}%;background:var(--accent)"></div></div>
            <div class="rep-bar-cnt">${cnt}</div>
          </div>`).join('')}</div>`:''}`;

    } else if (_cajaTab === 'deudas') {
      const { data: trabajos, error } = await _sb.from('bib_trabajos_personal')
        .select('id,nombre,precio_total,valor_pagado,solicitud_id,bib_solicitudes(remitente_email)').gt('precio_total',0);
      if (error) throw error;
      const deudas = {};
      (trabajos||[]).forEach(t => {
        const saldo = (t.precio_total||0)-(t.valor_pagado||0);
        if (saldo < 0.01) return;
        const email = t.bib_solicitudes?.remitente_email||'—';
        if (!deudas[email]) deudas[email] = { email, total:0, items:[] };
        deudas[email].total += saldo;
        deudas[email].items.push({ nombre:t.nombre, saldo, tid:t.id, sid:t.solicitud_id });
      });
      const lista = Object.values(deudas).sort((a,b)=>b.total-a.total);
      if (!lista.length) { el.innerHTML=`<div class="empty"><div class="eico"><i class="fa fa-circle-check"></i></div><p>Sin deudas pendientes</p></div>`; return; }
      const totDeuda = lista.reduce((a,d)=>a+d.total,0);
      el.innerHTML = `
        <div class="caja-stats">
          <div class="caja-sc"><div class="caja-sc-lbl">Total pendiente</div><div class="caja-sc-val rojo">${fmtPesos(totDeuda)}</div></div>
          <div class="caja-sc"><div class="caja-sc-lbl">Personas con deuda</div><div class="caja-sc-val">${lista.length}</div></div>
        </div>
        <div class="sec-hdr"><div class="sec-title">Personas con saldo pendiente</div><div class="sec-hdr-line"></div></div>
        ${lista.map(d=>`<div style="background:var(--s1);border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:13px;font-weight:600">${d.email}</div>
            <div style="color:var(--red);font-weight:700;font-size:15px;font-family:'Poppins',sans-serif">${fmtPesos(d.total)}</div>
          </div>
          ${d.items.map(t=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);padding:3px 0">
            <span>${t.nombre}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:var(--red)">${fmtPesos(t.saldo)}</span>
              <button class="btn-abono" onclick="abrirModalAbono(${t.tid},${t.sid},'${d.email}')"><i class="fa fa-hand-holding-dollar fa-xs"></i> Abonar</button>
            </div>
          </div>`).join('')}
        </div>`).join('')}`;
    }
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="eico"><i class="fa fa-triangle-exclamation"></i></div><p>${e.message}</p></div>`;
  }
}
