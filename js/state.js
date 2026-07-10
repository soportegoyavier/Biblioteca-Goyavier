// ── ESTADO ───────────────────────────────────────────────────
let _pagina = 'dashboard';
let _filtro = '';
let _buscarTimer = null;
let _idImpreso = null;
let _idEntrega = null;
let _trabajosImpresion = [];
let _archivosDisponibles = [];
let _archivosAsignados = new Set();
let _profSeleccionado    = null;
let _profArea            = null;
let _profesoresData      = {}; // nombre → { area }
let _asuntoSolicitud     = '';
let _impresoDestinatarios = []; // destinatarios visibles en el modal de impresión
let _impresoExpanded = new Set(); // emails de colaboradores expandidos en modal impresión
let _archivoUrlsMap = new Map(); // docId → { url, nombre } para descargas en modal impresión
let _detalleActual = null; // datos completos de la solicitud abierta en modal-detalle (evita inyectar comillas de asunto/remitente en un onclick)
let _mnmColabsCache = null; // colaboradores cargados para el selector de "Nueva Solicitud Manual" en Ventas

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
// Feature 1 — solicitudes manuales
let _esManualPersonal        = false;
let _mnmEmailTimer           = null;
// Feature 2 — confirmación de entrega en ventas
let _confirmarEntregaVentasId = null;
// Feature 3 — precio automático
let _precioUnitarioCalculado  = 0;
let _esCandidatoColab         = false;
let _ventasColabEmailsCache   = null; // Set de emails de colaboradores, cacheado por sesión
let _singleSelectInitDone     = false; // initSingleSelect() puede llamarse varias veces (login + cada refresh de token)
let _personalSolCache        = null; // { remitente_email, remitente_nombre } de la solicitud abierta en modal-personal

// ── ESTADO — módulo materiales y préstamos ────────────────────
let _matTab            = 'movimientos'; // 'movimientos' | 'catalogo'
let _matFiltro          = '';           // texto del buscador de la página Materiales
let _matCache           = [];           // caché de bib_materiales para el buscador
let _movMaterialesTemp  = [];           // líneas de material en el modal "Nuevo movimiento"
let _movColabSel        = null;         // { nombre, email } del colaborador elegido en el modal
let _movDevolverId      = null;         // movimiento_id para "Registrar devolución"
let _movRetornoLineaId  = null;         // movimiento_material_id para "Registrar material devuelto"
let _movDetalleLineas   = [];           // líneas de material del movimiento abierto en el modal de detalle
let _movDetalleId       = null;         // id del movimiento abierto en el modal de detalle
let _movSolicitudOrigen = null;         // id de bib_solicitudes cuando el movimiento viene de "Enviar a Materiales"
let _matBuscarTimer     = null; // buscador de la lista (Movimientos/Catálogo)
let _matModalBuscarTimer = null; // buscador de material dentro del modal "Nuevo movimiento" (separado: son inputs distintos)

// ── ESTADO — submódulo libros ──────────────────────────────────
let _libCache        = [];              // caché de bib_libros para el buscador de títulos
let _libColabSel     = null;            // colaborador/docente elegido en "Nuevo préstamo de libro"
let _libBuscarTimer  = null;
let _libDetalleId    = null;            // id del préstamo de libro abierto en el modal de detalle
let _devolverTipo    = 'movimiento';    // 'movimiento' | 'libro' — a qué apunta modal-devolucion

// ── ESTADO — módulo auditoría / centro de salud ────────────────
let _audTab = 'salud'; // 'salud' (Fase 2) | 'alertas' | 'logs' (Fase 3)
let _logBuscarTimer = null; // debounce del filtro de usuario en el Visor de Logs
