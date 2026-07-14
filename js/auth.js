// ── AUTH ────────────────────────────────────────────────────
// Biblioteca es de uso exclusivo de la cuenta institucional -- cualquier
// otra cuenta que logre autenticarse contra Supabase (password o Google)
// se cierra sesión de inmediato, antes de mostrar nada de la app.
const CORREO_AUTORIZADO = 'biblioteca@colegiogoyavier.edu.co';

_sb.auth.onAuthStateChange(async (_, session) => {
  if (session) {
    if ((session.user.email || '').toLowerCase() !== CORREO_AUTORIZADO) {
      document.getElementById('lerr').textContent = 'Esta cuenta no tiene acceso a Biblioteca.';
      await _sb.auth.signOut();
      return;
    }
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('shell').style.display = '';
    // Perfil del sidebar — no bloquea si falla o tarda
    try {
      const { data: p } = await withTimeout(
        _sb.from('bib_perfiles').select('nombre,rol').eq('id', session.user.id).single(),
        5000, 'Perfil no respondió'
      );
      if (p) {
        document.getElementById('sb-avatar').textContent = (p.nombre||'U').charAt(0).toUpperCase();
        document.getElementById('sb-uname').textContent  = p.nombre;
        document.getElementById('sb-urole').textContent  = p.rol.charAt(0).toUpperCase() + p.rol.slice(1);
      }
    } catch(e) { console.warn('Perfil sidebar:', e.message); }
    actualizarMesLabel();
    cargarDashboard();
    initSingleSelect();
  } else {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('shell').style.display = 'none';
  }
});

async function loginEmail() {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  const err   = document.getElementById('lerr');
  const btn   = document.getElementById('btn-lp');
  if (!email || !pass) { err.textContent = 'Ingresa correo y contraseña.'; return; }
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'Ingresando...';
  const { error } = await _sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Ingresar';
  if (error) err.textContent = 'Credenciales incorrectas. Verifica e intenta de nuevo.';
}

async function loginGoogle() {
  const note = document.getElementById('l-note');
  const err  = document.getElementById('lerr');
  note.textContent = ''; err.textContent = '';

  if (location.protocol === 'file:') {
    note.textContent = 'Google OAuth requiere HTTPS. Usa el login con correo y contraseña mientras tanto.';
    return;
  }
  const btn = document.getElementById('btn-lg');
  btn.classList.add('dis');
  try {
    const { error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        queryParams: { login_hint: CORREO_AUTORIZADO }
      }
    });
    if (error) {
      if (error.message && error.message.toLowerCase().includes('not enabled')) {
        note.textContent = 'Google no está activado aún en este proyecto. Usa correo y contraseña.';
      } else {
        err.textContent = error.message;
      }
      btn.classList.remove('dis');
    }
  } catch(e) {
    err.textContent = 'Error al conectar con Google. Usa correo y contraseña.';
    btn.classList.remove('dis');
  }
}

async function cerrarSesion() {
  try {
    await withTimeout(_sb.auth.signOut(), 3000, 'signOut timeout');
  } catch(e) {
    // Logout local forzado si el servidor no responde
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter(k => k.startsWith('sb-')).forEach(k => sessionStorage.removeItem(k));
  }
  location.reload();
}

// ── CANVAS LOGIN ANIMATION ────────────────────────────────────
(function initLoginCanvas() {
  const canvas = document.getElementById('login-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, pts = [], raf;
  const N = 80, MAX_DIST = 130, ACCENT = '72,149,239';

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  function mkPt() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .4, vy: (Math.random() - .5) * .4,
      r: Math.random() * 1.5 + .5
    };
  }
  function init() { resize(); pts = Array.from({length: N}, mkPt); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0 || a.x > W) a.vx *= -1;
      if (a.y < 0 || a.y > H) a.vy *= -1;
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < MAX_DIST) {
          const op = (1 - d / MAX_DIST) * .35;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${ACCENT},${op})`;
          ctx.lineWidth = .6;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(${ACCENT},.7)`;
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }

  function start() {
    if (!document.getElementById('login-overlay') ||
        document.getElementById('login-overlay').style.display === 'none') {
      cancelAnimationFrame(raf); return;
    }
    draw();
  }

  window.addEventListener('resize', () => { resize(); });
  init(); start();

  // Detener canvas cuando el usuario haya autenticado
  _sb.auth.onAuthStateChange((_, session) => {
    if (session) cancelAnimationFrame(raf);
    else { init(); start(); }
  });
})();
