// ── ESTADO ───────────────────────────────────────────────────
let _pagina = 'dashboard';
let _filtro = '';
let _buscarTimer = null;
let _idImpreso = null;
let _idEntrega = null;
let _trabajosImpresion = [];
let _archivosDisponibles = [];
let _archivosAsignados = new Set();
let _profSeleccionado = null;
let _profArea         = null;
let _profesoresData   = {}; // nombre → { area }
let _asuntoSolicitud = '';

let _mes = _hoy.getMonth();
let _ano = _hoy.getFullYear();

// ── ESTADO — módulo ventas ────────────────────────────────────
let _filtroVentas     = '';
let _buscarVentasTimer = null;
let _cajaTab           = 'dia';
let _idPersonal        = null;
let _archivosPersonalDisp = [];
let _archivosPersonalAsig = new Set();
let _abonoTrabajoId   = null;
let _abonoSolicitudId = null;
let _cancelarId       = null;
let _cancelarTipo     = 'copias';
let _eliminarId       = null;
let _abonoEmailRemit  = null;
