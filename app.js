// Inventario de órdenes de aplicación — app de solo lectura.
// Los datos llegan en tiempo real desde Firestore y quedan guardados en el dispositivo,
// así que sin señal se sigue viendo lo último que se alcanzó a descargar.
import { firebaseConfig } from './firebase-config.js';

const FIREBASE = 'https://www.gstatic.com/firebasejs/10.12.2';
const COLECCION = 'ordenes';
const DIAS_RECIENTES = 120; // ventana que se mantiene sincronizada por defecto
const MAX_FILAS = 400;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtNum = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 }));

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoyISO = () => iso(new Date());
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function fechaCorta(f) {
  const [y, m, d] = f.split('-').map(Number);
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
}
function diasHasta(f) {
  const [y, m, d] = f.split('-').map(Number);
  const h = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
}
function relativo(f) {
  const n = diasHasta(f);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  return n > 0 ? `En ${n} días` : `Hace ${-n} días`;
}
const claseFecha = (f) => (diasHasta(f) === 0 ? 'hoy' : diasHasta(f) > 0 ? 'fut' : '');
const millis = (t) => (t == null ? 0 : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : t.seconds ? t.seconds * 1000 : 0);

// ---------- Estado ----------
let ordenes = [];
let historialCompleto = false;
let cancelarEscucha = null;

function preparar(o) {
  o._creado = millis(o.creado);
  o._texto = norm(
    [
      o.numero, o.numeroInt, o.grupo, o.especie, o.etiqueta, o.variedad, o.tipo, o.objetivo,
      o.fecha, o.fecha?.split('-').reverse().join('-'), o.aplicador, o.responsable, o.maquinaria, o.tractor,
      ...(o.productos || []).flatMap((p) => [p.nombre, p.ingrediente, p.funcion, p.codigo]),
      ...(o.cuarteles || []).flatMap((c) => [c.nombre, c.codigo, c.variedad]),
    ].join(' ')
  );
  return o;
}

// ---------- Filtros y render ----------
function filtradas() {
  const tokens = norm($('q').value).split(/\s+/).filter(Boolean);
  const cuando = $('f-cuando').value;
  const grupo = $('f-grupo').value;
  const tipo = $('f-tipo').value;
  const hoy = hoyISO();
  const finSemana = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return iso(d);
  })();
  const inicioSemana = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(d);
  })();
  let r = ordenes.filter((o) => {
    if (grupo && o.grupo !== grupo) return false;
    if (tipo && o.tipo !== tipo) return false;
    if (cuando === 'hoy' && o.fecha !== hoy) return false;
    if (cuando === 'prox' && o.fecha < hoy) return false;
    if (cuando === 'pas' && o.fecha >= hoy) return false;
    if (cuando === 'sem' && (o.fecha < inicioSemana || o.fecha > finSemana)) return false;
    return tokens.every((t) => o._texto.includes(t));
  });
  const orden = $('f-orden').value;
  const porNumero = (a, b) => (b.numeroInt || 0) - (a.numeroInt || 0);
  if (orden === 'numero') r.sort(porNumero);
  else if (orden === 'creado') r.sort((a, b) => b._creado - a._creado || porNumero(a, b));
  else r.sort((a, b) => b.fecha.localeCompare(a.fecha) || porNumero(a, b));
  return r;
}

function llenarSelect(id, valores, etiquetaTodos) {
  const sel = $(id);
  const actual = sel.value;
  sel.innerHTML = `<option value="">${etiquetaTodos}</option>` + valores.map((v) => `<option>${esc(v)}</option>`).join('');
  sel.value = valores.includes(actual) ? actual : '';
}

function render() {
  const lista = filtradas();
  const visibles = lista.slice(0, MAX_FILAS);
  const agrupar = $('f-orden').value === 'fecha';
  let filas = '';
  let tarjetas = '';
  let ultima = null;

  for (const o of visibles) {
    if (agrupar && o.fecha !== ultima) {
      ultima = o.fecha;
      const titulo = `${fechaCorta(o.fecha)} · ${relativo(o.fecha)}`;
      filas += `<tr class="sep"><td colspan="7">${esc(titulo)}</td></tr>`;
      tarjetas += `<div class="sep-t">${esc(titulo)}</div>`;
    }
    const prods = (o.productos || []).map((p) => p.nombre).join(', ');
    const cuart = (o.cuarteles || []).map((c) => c.nombre);
    const cuartTxt = cuart.length > 2 ? `${cuart.slice(0, 2).join(', ')} +${cuart.length - 2}` : cuart.join(', ');
    const chip = `<span class="chip ${claseFecha(o.fecha)}">${esc(relativo(o.fecha))}</span>`;
    filas += `<tr tabindex="0" data-n="${esc(o.numero)}">
      <td class="n-orden">${esc(o.numero)}</td>
      <td class="fecha">${esc(fechaCorta(o.fecha))}${o.horaInicio ? ` <span class="sub">${esc(o.horaInicio)}</span>` : ''}<br>${chip}</td>
      <td>${esc(o.grupo)}<div class="sub">${esc(o.variedad || '')}</div></td>
      <td>${esc(o.tipo)}</td>
      <td>${esc(prods)}</td>
      <td class="sub">${esc(cuartTxt)}</td>
      <td class="num">${fmtNum(o.superficieHa)}</td>
    </tr>`;
    tarjetas += `<button class="tarjeta" data-n="${esc(o.numero)}">
      <div class="t-top"><span class="n-orden">${esc(o.numero)}</span>${chip}</div>
      <div class="t-prod">${esc(prods)}</div>
      <div class="t-meta">${esc(o.grupo)} · ${esc(o.tipo)} · ${esc(fechaCorta(o.fecha))}${o.horaInicio ? ' ' + esc(o.horaInicio) : ''}</div>
      <div class="t-meta">${esc(cuartTxt)}${o.superficieHa ? ` · ${fmtNum(o.superficieHa)} ha` : ''}</div>
    </button>`;
  }
  if (!visibles.length) {
    const msg = ordenes.length ? 'Ninguna orden coincide con la búsqueda.' : 'Aún no hay órdenes cargadas.';
    filas = `<tr><td colspan="7" class="vacio">${msg}</td></tr>`;
    tarjetas = `<div class="vacio">${msg}</div>`;
  }
  $('filas').innerHTML = filas;
  $('tarjetas').innerHTML = tarjetas;

  let resumen = `${lista.length} de ${ordenes.length} órdenes`;
  if (lista.length > MAX_FILAS) resumen += ` · mostrando las primeras ${MAX_FILAS}; afina la búsqueda para ver el resto`;
  if (!historialCompleto && !MODO_DEMO) resumen += ` · últimos ${DIAS_RECIENTES} días`;
  $('resumen').textContent = resumen;
  $('btn-historial').hidden = historialCompleto || MODO_DEMO;
}

function actualizarDatos(lista) {
  ordenes = lista.map(preparar);
  const uniq = (k) => [...new Set(ordenes.map((o) => o[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  llenarSelect('f-grupo', uniq('grupo'), 'Toda especie');
  llenarSelect('f-tipo', uniq('tipo'), 'Todo tipo');
  render();
  // Si se está viendo el PDF no se vuelve a dibujar cada vez que llega un cambio de la base.
  const abierta = $('detalle').open && $('detalle').dataset.vista === 'datos' && $('detalle').dataset.n;
  if (abierta) pintarDetalle(abierta, 'datos');
  precargarPdfs();
}

// ---------- PDF ----------
let leerPdfRemoto = null; // se define al conectar (Firebase o demostración)
let visorToken = 0;
let pdfjsPromise = null;
const claveCache = (o) => `${location.origin}/pdf/${o.numero}/${o.archivoModificado || 0}`;

async function obtenerPdf(o) {
  const clave = claveCache(o);
  let cache = null;
  try {
    cache = await caches.open('oa-pdfs');
    const r = await cache.match(clave);
    if (r) return new Uint8Array(await r.arrayBuffer());
  } catch {}
  if (!leerPdfRemoto) throw new Error('sin-fuente');
  const bytes = await leerPdfRemoto(o.numero);
  if (!bytes) throw new Error('no-existe');
  try {
    if (cache) {
      for (const k of await cache.keys()) if (k.url.includes(`/pdf/${o.numero}/`)) await cache.delete(k);
      await cache.put(clave, new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }));
    }
  } catch {}
  return bytes;
}

function cargarPdfjs() {
  pdfjsPromise ||= import('./pdfjs/pdf.min.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  });
  return pdfjsPromise;
}

async function mostrarPdf(o, cont, token) {
  const msg = (t) => token === visorToken && (cont.innerHTML = `<p class="sub">${t}</p>`);
  try {
    const bytes = await obtenerPdf(o);
    const pdfjs = await cargarPdfjs();
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    if (token !== visorToken) return;
    cont.innerHTML = '';
    const ancho = cont.clientWidth || 360;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (ancho / base.width) * Math.min(3, Math.max(2, window.devicePixelRatio || 1)) });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      if (token !== visorToken) return;
      cont.appendChild(canvas);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    }
  } catch (e) {
    console.error(e);
    if (e.message === 'no-existe') msg('El PDF de esta orden no está disponible en la nube. Toca <b>Ver datos</b>.');
    else if (!navigator.onLine) msg('Sin conexión y este PDF aún no se ha descargado en este dispositivo. Toca <b>Ver datos</b> para ver la información guardada.');
    else msg('No se pudo cargar el PDF. Toca <b>Ver datos</b> o vuelve a intentarlo.');
  }
}

async function descargarPdf(o, btn) {
  const txt = btn.textContent;
  try {
    btn.textContent = 'Descargando…';
    const bytes = await obtenerPdf(o);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = o.archivo || `${o.numero}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    alert('No se pudo descargar el PDF (¿sin conexión?).');
  }
  btn.textContent = txt;
}

// Con señal, baja en segundo plano los PDF de las órdenes recientes para poder verlos sin señal.
const precargados = new Set();
let precargando = false;
async function precargarPdfs() {
  if (precargando || MODO_DEMO || !navigator.onLine || !leerPdfRemoto) return;
  precargando = true;
  const desde = new Date();
  desde.setDate(desde.getDate() - 30);
  const pendientes = ordenes.filter((o) => o.tienePdf && o.fecha >= iso(desde) && !precargados.has(o.numero + o.archivoModificado)).slice(0, 80);
  for (const o of pendientes) {
    if (!navigator.onLine) break;
    precargados.add(o.numero + o.archivoModificado);
    try { await obtenerPdf(o); } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  precargando = false;
}

// ---------- Detalle ----------
function pintarDetalle(numero, vista = $('detalle').dataset.vista || 'pdf') {
  const o = ordenes.find((x) => x.numero === numero);
  if (!o) return false;
  const dato = (t, v) => (v || v === 0 ? `<div><span>${t}</span>${esc(v)}</div>` : '');
  const prods = (o.productos || [])
    .map((p) => `<tr><td><b>${esc(p.nombre)}</b><div class="sub">${esc(p.ingrediente)}</div></td><td>${esc(p.dosis)}</td><td>${esc(p.consumo)}</td><td>${esc(p.funcion)}</td><td>${esc(p.carencia)}</td><td>${esc(p.reingreso)}</td></tr>`)
    .join('');
  const cuart = (o.cuarteles || [])
    .map((c) => `<tr><td><b>${esc(c.nombre)}</b><div class="sub">${esc(c.codigo)}</div></td><td>${esc(c.variedad)}</td><td class="num">${fmtNum(c.ha)}</td><td class="num">${c.agua ? fmtNum(c.agua) : ''}</td><td class="sub">${(c.productos || []).map((p) => `${esc(p.nombre)}: ${fmtNum(p.cantidad)} ${esc(p.unidad)}`).join('<br>')}</td></tr>`)
    .join('');
  const otras = (o.fechas || []).length > 1 ? o.fechas.map((f) => `${fechaCorta(f.fecha)} ${f.inicio || ''}`).join(' · ') : '';
  const cargada = o._creado ? new Date(o._creado).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  if (vista === 'pdf' && !o.tienePdf && !MODO_DEMO) vista = 'datos';
  $('detalle').dataset.n = numero;
  $('detalle').dataset.vista = vista;
  $('detalle-contenido').innerHTML = `
    <div class="d-head">
      <div>
        <h2 id="d-titulo">${esc(o.numero)}</h2>
        <div class="sub">${esc(o.grupo)} · ${esc(o.tipo)}</div>
      </div>
      <div class="d-acciones">
        ${o.tienePdf || MODO_DEMO ? `<button class="btn" id="d-vista">${vista === 'pdf' ? 'Ver datos' : 'Ver PDF'}</button>` : ''}
        ${vista === 'pdf' ? '<button class="btn" id="d-bajar">Descargar</button>' : ''}
        <button class="btn" id="d-copiar">Copiar N°</button>
        <button class="btn pri" id="d-cerrar">Cerrar</button>
      </div>
    </div>
    <div class="d-body">
      <div class="d-grid">
        <div><span>Fecha de aplicación</span>${esc(fechaCorta(o.fecha))} ${esc(o.horaInicio || '')} <span class="chip ${claseFecha(o.fecha)}" style="display:inline-block">${esc(relativo(o.fecha))}</span></div>
        ${dato('Otras fechas', otras)}
        ${dato('Especie', [o.especie, o.variedad].filter(Boolean).join(' · '))}
        ${dato('Objetivo', o.objetivo)}
        ${dato('Superficie', o.superficieHa ? fmtNum(o.superficieHa) + ' ha' : '')}
        ${dato('Mojamiento', o.mojamiento)}
        ${dato('Consumo de agua', o.consumoAgua)}
        ${dato('Estado fenológico', o.estadoFenologico)}
        ${dato('Aplicador', o.aplicador)}
        ${dato('Tractor / equipo', [o.tractor, o.maquinaria, o.capacidad].filter(Boolean).join(' · '))}
        ${dato('Responsable', o.responsable)}
        ${dato('Dosificador', o.dosificador)}
      </div>
      <h3>Productos</h3>
      <div class="d-tabla-wrap"><table class="d-tabla"><thead><tr><th>Producto</th><th>Dosis</th><th>Consumo</th><th>Función</th><th>Carencia</th><th>Reingreso</th></tr></thead><tbody>${prods}</tbody></table></div>
      <h3>Cuarteles (${(o.cuarteles || []).length})</h3>
      <div class="d-tabla-wrap"><table class="d-tabla"><thead><tr><th>Cuartel</th><th>Variedad</th><th class="num">ha</th><th class="num">Agua (lt)</th><th>Por cuartel</th></tr></thead><tbody>${cuart}</tbody></table></div>
      <div class="d-pie">${cargada ? `Cargada el ${esc(cargada)} · ` : ''}Archivo: ${esc(o.archivo || '')}</div>
    </div>`;
  $('d-cerrar').onclick = cerrarDetalle;
  if ($('d-vista')) $('d-vista').onclick = () => pintarDetalle(numero, vista === 'pdf' ? 'datos' : 'pdf');
  if ($('d-bajar')) $('d-bajar').onclick = () => descargarPdf(o, $('d-bajar'));
  visorToken++;
  if (vista === 'pdf') {
    const body = document.querySelector('#detalle .d-body');
    body.className = 'd-body visor';
    body.innerHTML = '<p class="sub" id="visor-msg">Cargando PDF…</p>';
    mostrarPdf(o, body, visorToken);
  }
  $('d-copiar').onclick = async (e) => {
    try {
      await navigator.clipboard.writeText(o.numero);
      e.target.textContent = 'Copiado ✓';
    } catch {
      e.target.textContent = o.numero;
    }
  };
  return true;
}
function abrirDetalle(numero) {
  if (!pintarDetalle(numero, 'pdf')) return;
  $('detalle').showModal();
  $('detalle').scrollTop = 0;
  history.pushState({ detalle: numero }, '');
}
function cerrarDetalle() {
  visorToken++;
  if (history.state?.detalle) history.back();
  else $('detalle').close();
}
window.addEventListener('popstate', () => $('detalle').open && $('detalle').close());
$('detalle').addEventListener('click', (e) => e.target === $('detalle') && cerrarDetalle());
$('detalle').addEventListener('cancel', (e) => {
  e.preventDefault();
  cerrarDetalle();
});

function clicOrden(e) {
  const el = e.target.closest('[data-n]');
  if (el) abrirDetalle(el.dataset.n);
}
$('filas').addEventListener('click', clicOrden);
$('filas').addEventListener('keydown', (e) => e.key === 'Enter' && clicOrden(e));
$('tarjetas').addEventListener('click', clicOrden);
['q', 'f-cuando', 'f-grupo', 'f-tipo', 'f-orden'].forEach((id) => $(id).addEventListener('input', render));

// ---------- Estado de conexión ----------
function setEstado(texto, clase = '', titulo = '') {
  const el = $('estado');
  el.textContent = texto;
  el.className = 'pill ' + clase;
  el.title = titulo;
}
function aviso(html, info = false) {
  const el = $('aviso');
  el.hidden = !html;
  el.className = 'aviso' + (info ? ' info' : '');
  el.innerHTML = html || '';
}
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const horaTxt = (ms) => new Date(Number(ms)).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function estadoDesdeSnapshot(desdeCache) {
  if (!desdeCache) {
    guardar('oa-ultima-sync', Date.now());
    setEstado('● Al día', '', 'Conectado: los cambios aparecen solos');
    aviso('');
    return;
  }
  const ult = leer('oa-ultima-sync');
  if (!navigator.onLine) {
    setEstado('Sin conexión', 'off');
    aviso(ult ? `Sin conexión. Estás viendo las órdenes guardadas en este dispositivo (última actualización: ${esc(horaTxt(ult))}).` : 'Sin conexión, y este dispositivo aún no ha descargado las órdenes. Ábrela una vez con internet.', true);
  } else setEstado('Conectando…');
}

// ---------- Carga de datos ----------
const MODO_DEMO = new URLSearchParams(location.search).has('demo');

async function iniciarDemo() {
  leerPdfRemoto = async (n) => new Uint8Array(await (await fetch(`demo-pdfs/${n}.pdf`)).arrayBuffer());
  const r = await fetch('demo.json');
  actualizarDatos(await r.json());
  setEstado('Demostración', 'off', 'Datos de ejemplo, sin conexión a la base de datos');
}

async function iniciarFirebase() {
  const [{ initializeApp }, fs] = await Promise.all([import(`${FIREBASE}/firebase-app.js`), import(`${FIREBASE}/firebase-firestore.js`)]);
  const app = initializeApp(firebaseConfig);
  let db;
  try {
    // Copia local persistente: es lo que permite ver las órdenes sin señal.
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }

  function escuchar() {
    cancelarEscucha?.();
    const col = fs.collection(db, COLECCION);
    let q;
    if (historialCompleto) q = fs.query(col, fs.orderBy('fecha', 'desc'));
    else {
      const d = new Date();
      d.setDate(d.getDate() - DIAS_RECIENTES);
      q = fs.query(col, fs.where('fecha', '>=', iso(d)), fs.orderBy('fecha', 'desc'));
    }
    cancelarEscucha = fs.onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        actualizarDatos(snap.docs.map((d) => d.data()));
        estadoDesdeSnapshot(snap.metadata.fromCache);
      },
      (err) => {
        console.error(err);
        setEstado('Error', 'err');
        aviso(
          err.code === 'permission-denied'
            ? 'La base de datos no permite leer. Revisa que las reglas de Firestore estén publicadas (Paso 4 del LEEME).'
            : `No se pudieron cargar las órdenes: ${esc(err.message)}`
        );
      }
    );
  }
  escuchar();
  $('btn-historial').addEventListener('click', () => {
    historialCompleto = true;
    $('btn-historial').hidden = true;
    escuchar();
  });
  leerPdfRemoto = async (n) => {
    const snap = await fs.getDoc(fs.doc(db, 'pdfs', n));
    return snap.exists() ? snap.data().data.toUint8Array() : null;
  };
  window.addEventListener('online', () => { setEstado('Conectando…'); precargarPdfs(); });
  window.addEventListener('offline', () => estadoDesdeSnapshot(true));
}

(async () => {
  try {
    if (MODO_DEMO) await iniciarDemo();
    else if (!firebaseConfig || !firebaseConfig.projectId) {
      setEstado('Sin configurar', 'err');
      aviso('Falta pegar la configuración de Firebase en <b>web/firebase-config.js</b> (Paso 3a del LEEME).');
      render();
    } else await iniciarFirebase();
  } catch (e) {
    console.error(e);
    setEstado('Error', 'err');
    aviso(`No se pudo iniciar la app: ${esc(e.message)}. Si estás sin conexión, ábrela una vez con internet.`);
  }
})();

// Service worker: guarda la app en el dispositivo para abrirla sin internet.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.error));
}
