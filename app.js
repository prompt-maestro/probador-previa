// Probador de diseños en vivo (prototipo de la actividad 98, Prompt Maestro).
// Todo corre en el celular: la imagen de la camara nunca sale del navegador (no hay ninguna llamada de red despues de cargar).
// La mano la sigue MediaPipe Hand Landmarker (version exacta 0.10.35, alojada aqui mismo); las uñas se pintan con canvas, sin IA.
import { FilesetResolver, HandLandmarker } from "./vendor/tasks-vision-0.10.35/vision_bundle.mjs";

// ---------- Diseños de ejemplo (nombres y precios de la previa de la pagina) ----------
const DISENOS = [
  { clave: "french-clasico", nombre: "French clásico", precio: 380, minutos: 90, foto: "fotos/c-french.webp", tipo: "french", paleta: ["#f1d3cb", "#fbf9f6"] },
  { clave: "rojo-cereza", nombre: "Rojo cereza", precio: 350, minutos: 75, foto: "fotos/c-cereza.webp", tipo: "solido", paleta: ["#86101c"] },
  { clave: "perla-cromada", nombre: "Perla cromada", precio: 450, minutos: 90, foto: "fotos/c-perla.webp", tipo: "cromo", paleta: ["#eee6ea", "#dfe6f1"] },
  { clave: "rosa-lechoso", nombre: "Rosa lechoso", precio: 350, minutos: 75, foto: "fotos/c-rosa.webp", tipo: "lechoso", paleta: ["#f3cdd2"] },
  { clave: "linea-de-oro", nombre: "Línea de oro", precio: 480, minutos: 90, foto: "fotos/c-oro.webp", tipo: "oro", paleta: ["#efd0c9", "#d2a94f"] },
];
const POR_CLAVE = Object.fromEntries(DISENOS.map((d) => [d.clave, d]));
const VERSION_CATALOGO = 1;

// Dedos en orden anatomico: 0 pulgar, 1 indice, 2 medio, 3 anular, 4 meñique (puntos de MediaPipe).
// ancho: ancho de la uña contra la distancia promedio entre nudillos; t0: donde empieza la uña entre la ultima articulacion y la punta
const DEDOS = [
  { nombre: "Pulgar", para: "tu pulgar", raiz: 2, dip: 3, tip: 4, ancho: 0.8, t0: 0.32 },
  { nombre: "Índice", para: "tu índice", raiz: 5, dip: 7, tip: 8, ancho: 0.66, t0: 0.44 },
  { nombre: "Medio", para: "tu dedo medio", raiz: 9, dip: 11, tip: 12, ancho: 0.68, t0: 0.44 },
  { nombre: "Anular", para: "tu anular", raiz: 13, dip: 15, tip: 16, ancho: 0.64, t0: 0.44 },
  { nombre: "Meñique", para: "tu meñique", raiz: 17, dip: 19, tip: 20, ancho: 0.54, t0: 0.44 },
];
const LARGOS = { corto: 1.1, medio: 1.26, largo: 1.44 };

// ---------- Cuentas que en la version real hace el CODIGO del motor (regla 8) ----------
// Cada uña vale la decima parte del precio de su diseño; las dos manos iguales son 10 uñas; se redondea hacia arriba a 10 pesos.
export function precioMezcla(claves) {
  const suma = claves.reduce((s, c) => s + POR_CLAVE[c].precio * 2, 0);
  return Math.ceil(suma / 100) * 10;
}
export function minutosMezcla(claves) {
  return Math.max(...claves.map((c) => POR_CLAVE[c].minutos));
}
function duracionBonita(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}
function hexALab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const r = lin(n >> 16), g = lin((n >> 8) & 255), b = lin(n & 255);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function distancia(a, b) {
  let mejor = Infinity;
  for (const ca of a.paleta) for (const cb of b.paleta) {
    const [l1, a1, b1] = hexALab(ca), [l2, a2, b2] = hexALab(cb);
    mejor = Math.min(mejor, Math.hypot(l1 - l2, a1 - a2, b1 - b2));
  }
  return mejor;
}
// Primero los que combinan con el diseño de su mano: los que comparten un color (en el motor saldra de la foto de cada diseño)
export function combinan(baseClave) {
  const base = POR_CLAVE[baseClave];
  return DISENOS.filter((d) => d.clave !== baseClave)
    .map((d) => ({ d, k: distancia(base, d) }))
    .sort((x, y) => x.k - y.k || x.d.precio - y.d.precio)
    .map((x) => x.d.clave);
}
function codigoMezcla(claves) {
  const texto = `${claves.join("|")}#v${VERSION_CATALOGO}`;
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) { s += abc[h % 32]; h = Math.floor(h / 32) + (i + 1) * 7919; }
  return s;
}

// ---------- Filtro "un euro": quita el temblor sin atrasar el movimiento ----------
class UnEuro {
  constructor(minCorte = 1.0, beta = 8, dCorte = 1.0) { Object.assign(this, { minCorte, beta, dCorte, x: null, dx: 0, t: 0 }); }
  alfa(corte, dt) { const tau = 1 / (2 * Math.PI * corte); return 1 / (1 + tau / dt); }
  filtrar(x, t) {
    if (this.x === null) { this.x = x; this.t = t; this.dx = 0; return x; }
    const dt = Math.max(0.001, (t - this.t) / 1000);
    this.t = t;
    this.dx += this.alfa(this.dCorte, dt) * ((x - this.x) / dt - this.dx);
    this.x += this.alfa(this.minCorte + this.beta * Math.abs(this.dx), dt) * (x - this.x);
    return this.x;
  }
}

// ---------- Estado ----------
const $ = (s) => document.querySelector(s);
const estado = {
  base: "french-clasico",
  unas: Array(5).fill("french-clasico"),
  historial: [],
  seleccion: null,
  idea: null,
  modo: null, // "camara" | "foto"
  pausado: false,
  largo: "medio",
  ancho: 1,
  puntos: false,
  camara: "trasera",
  orden: [4, 3, 2, 1, 0], // dedos de izquierda a derecha en la pantalla
};
let marcador = null, delegado = "", flujo = null, pista = null, luzPrendida = false, puedeLuz = false;
let mano = null, ultimaMano = 0, ordenCandidato = "", ordenVeces = 0, luzEscena = 1, lumaEscena = 0.5;
let filtros = null, sucio = true, ultimoTiempoVideo = -1, ts = 0, cuadros = 0;
const medidas = { cps: 0, msModelo: 0, cuentaMs: 0, sumaMs: 0, desde: performance.now(), lentoDesde: 0, avisoLento: false };

const video = $("#video"), lienzo = $("#lienzo"), ctx = lienzo.getContext("2d");
const fondo = document.createElement("canvas"), fctx = fondo.getContext("2d");
const chico = document.createElement("canvas");
chico.width = chico.height = 24;
const cctx = chico.getContext("2d", { willReadFrequently: true });
const dpr = Math.min(3, window.devicePixelRatio || 1);

function reiniciarFiltros() { filtros = Array.from({ length: 21 }, () => [new UnEuro(), new UnEuro()]); }
reiniciarFiltros();

// ---------- Carga (solo archivos de este mismo sitio) ----------
async function bajarConAvance(url, alAvance) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo bajar ${url}`);
  const total = Number(r.headers.get("content-length")) || 7819105;
  const lector = r.body.getReader();
  const partes = [];
  let n = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    n += value.length;
    alAvance(Math.min(1, n / total));
  }
  const buf = new Uint8Array(n);
  let o = 0;
  for (const p of partes) { buf.set(p, o); o += p.length; }
  return buf;
}
async function cargar() {
  const barra = $("#avance span"), texto = $("#avance-texto");
  try {
    const modelo = await bajarConAvance("modelo/hand_landmarker-float16-v1.task", (f) => { barra.style.width = `${Math.round(f * 85)}%`; });
    texto.textContent = "Preparando el seguimiento de la mano…";
    const archivos = await FilesetResolver.forVisionTasks(new URL("vendor/tasks-vision-0.10.35/wasm", location.href).href.replace(/\/$/, ""));
    const opciones = (d) => ({
      baseOptions: { modelAssetBuffer: modelo.slice(), delegate: d },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try { marcador = await HandLandmarker.createFromOptions(archivos, opciones("GPU")); delegado = "GPU"; }
    catch { marcador = await HandLandmarker.createFromOptions(archivos, opciones("CPU")); delegado = "CPU"; }
    barra.style.width = "100%";
    texto.textContent = "";
    $("#avance").classList.add("oculto");
    const b = $("#btn-camara");
    b.disabled = false;
    b.textContent = "Abrir mi cámara";
    if (new URLSearchParams(location.search).has("ejemplo")) abrirFoto("fotos/mano-ejemplo.webp");
  } catch (e) {
    texto.textContent = "No pude preparar el probador en este navegador. Prueba en Chrome o Safari actualizados.";
    console.error(e);
  }
}

// ---------- Camara y foto ----------
function ajustarTamano(w, h) {
  if (fondo.width !== w || fondo.height !== h) {
    fondo.width = lienzo.width = w;
    fondo.height = lienzo.height = h;
    sucio = true;
  }
}
function pararCamara() {
  if (flujo) for (const p of flujo.getTracks()) p.stop();
  flujo = null; pista = null; luzPrendida = false; puedeLuz = false;
}
async function abrirCamara() {
  const t = $("#avance-texto");
  if (!navigator.mediaDevices?.getUserMedia) {
    t.textContent = "Este navegador no deja usar la cámara aquí. Ábrelo en Chrome o Safari, o usa una foto de tu mano.";
    return;
  }
  pararCamara();
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: estado.camara === "frontal" ? "user" : { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    t.textContent = e && e.name === "NotAllowedError"
      ? "No me diste permiso de usar la cámara. Puedes darlo en los ajustes de tu navegador, o usar una foto de tu mano."
      : "No pude abrir la cámara. Prueba en Chrome o Safari, o usa una foto de tu mano.";
    return;
  }
  video.srcObject = flujo;
  try { await video.play(); } catch { /* algunos navegadores ya lo reproducen solos */ }
  pista = flujo.getVideoTracks()[0];
  puedeLuz = !!pista.getCapabilities?.().torch;
  estado.modo = "camara";
  estado.pausado = false;
  lienzo.classList.toggle("espejo", estado.camara === "frontal");
  mostrarProbador();
}
async function abrirFoto(fuente) {
  const img = new Image();
  img.src = typeof fuente === "string" ? fuente : URL.createObjectURL(fuente);
  try { await img.decode(); } catch { $("#avance-texto").textContent = "No pude abrir esa foto. Prueba con otra."; return; }
  pararCamara();
  const esc = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  ajustarTamano(Math.round(img.naturalWidth * esc), Math.round(img.naturalHeight * esc));
  fctx.drawImage(img, 0, 0, fondo.width, fondo.height);
  if (typeof fuente !== "string") URL.revokeObjectURL(img.src);
  estado.modo = "foto";
  estado.pausado = true;
  lienzo.classList.remove("espejo");
  mostrarProbador();
  reiniciarFiltros();
  detectar();
  if (!mano) avisar("No encontré una mano en la foto. Prueba con otra donde se vean tus uñas.");
}
function mostrarProbador() {
  $("#inicio").classList.add("oculto");
  $("#probador").classList.remove("oculto");
  actualizarPausa();
  pintarHoja();
}

// ---------- Deteccion ----------
function detectar() {
  const t = Math.max(performance.now(), ts + 1);
  ts = t;
  const t0 = performance.now();
  const r = marcador.detectForVideo(fondo, t);
  medidas.sumaMs += performance.now() - t0;
  medidas.cuentaMs++;
  procesar(r, t);
}
const depurar = new URLSearchParams(location.search).has("depurar");
function procesar(r, t) {
  if (depurar) window.ultimoResultado = { landmarks: r.landmarks, worldLandmarks: r.worldLandmarks, handedness: r.handedness ?? r.handednesses };
  const lm = r.landmarks?.[0];
  if (!lm) {
    if (t - ultimaMano > 250) { mano = null; reiniciarFiltros(); }
    sucio = true;
    return;
  }
  ultimaMano = t;
  const W = fondo.width, H = fondo.height;
  const pts = lm.map((p, i) => ({ x: filtros[i][0].filtrar(p.x, t) * W, y: filtros[i][1].filtrar(p.y, t) * H }));
  const etiqueta = (r.handedness ?? r.handednesses)?.[0]?.[0]?.categoryName || "";
  mano = { pts, etiqueta };
  // Orden de la tira: como la camara enseña la mano (se voltea si enseña la otra)
  const espejo = estado.modo === "camara" && estado.camara === "frontal";
  const xs = DEDOS.map((d) => (espejo ? W - pts[d.raiz].x : pts[d.raiz].x));
  const orden = [0, 1, 2, 3, 4].sort((a, b) => xs[a] - xs[b]);
  const clave = orden.join("");
  if (clave === ordenCandidato) ordenVeces++; else { ordenCandidato = clave; ordenVeces = 1; }
  if ((ordenVeces >= 6 || estado.modo === "foto") && clave !== estado.orden.join("")) { estado.orden = orden; pintarTiras(); }
  sucio = true;
}
function escalaMano(p) {
  const d = (i, j) => Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
  return (d(5, 9) + d(9, 13) + d(13, 17)) / 3;
}
function geometriaUna(p, i, escala) {
  const dedo = DEDOS[i];
  const a = p[dedo.dip], b = p[dedo.tip];
  const ux = b.x - a.x, uy = b.y - a.y, len = Math.hypot(ux, uy) || 1;
  const u = { x: ux / len, y: uy / len }, v = { x: -u.y, y: u.x };
  const t1 = LARGOS[estado.largo] - (i === 0 ? 0.04 : 0);
  const tm = (dedo.t0 + t1) / 2;
  const W = dedo.ancho * escala * estado.ancho;
  const L = Math.max((t1 - dedo.t0) * len, W * 0.35);
  const c = { x: a.x + ux * tm, y: a.y + uy * tm };
  if (i === 0) {
    // El pulgar casi siempre se ve de lado: su uña queda hacia afuera de la mano, lejos del indice
    const lejos = Math.sign((c.x - p[5].x) * v.x + (c.y - p[5].y) * v.y) || 1;
    c.x += v.x * lejos * W * 0.28;
    c.y += v.y * lejos * W * 0.28;
  }
  return { c, u, v, W, L, angulo: Math.atan2(uy, ux) };
}

// ---------- Dibujo de una uña (coordenadas locales: x a lo ancho, y negativa hacia la punta) ----------
function almendra(g, W, L) {
  const hw = W / 2, hl = L / 2;
  g.beginPath();
  g.moveTo(-hw * 0.86, hl * 0.8);
  g.quadraticCurveTo(0, hl * 1.12, hw * 0.86, hl * 0.8);
  g.bezierCurveTo(hw * 1.02, hl * 0.45, hw * 1.0, -hl * 0.05, hw * 0.84, -hl * 0.4);
  g.bezierCurveTo(hw * 0.62, -hl * 0.8, hw * 0.2, -hl, 0, -hl);
  g.bezierCurveTo(-hw * 0.2, -hl, -hw * 0.62, -hl * 0.8, -hw * 0.84, -hl * 0.4);
  g.bezierCurveTo(-hw * 1.0, -hl * 0.05, -hw * 1.02, hl * 0.45, -hw * 0.86, hl * 0.8);
  g.closePath();
}
function elipse(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }
function capaBase(g, W, L, centro, orilla) {
  const gr = g.createLinearGradient(-W / 2, 0, W / 2, 0);
  gr.addColorStop(0, orilla); gr.addColorStop(0.32, centro); gr.addColorStop(0.68, centro); gr.addColorStop(1, orilla);
  g.fillStyle = gr;
  g.fillRect(-W, -L, 2 * W, 2 * L);
  const gv = g.createLinearGradient(0, L / 2, 0, -L / 2);
  gv.addColorStop(0, "rgba(60,20,20,0.16)"); gv.addColorStop(0.22, "rgba(60,20,20,0)");
  g.fillStyle = gv;
  g.fillRect(-W, -L, 2 * W, 2 * L);
}
function brillo(g, W, L, ang, fuerza) {
  const mueve = Math.sin(ang * 1.5) * W * 0.1;
  g.save();
  g.translate(-W * 0.2 + mueve, -L * 0.06);
  g.rotate(0.05);
  const gr = g.createLinearGradient(-W * 0.1, 0, W * 0.1, 0);
  gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${fuerza})`); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  elipse(g, 0, 0, W * 0.1, L * 0.33);
  g.fill();
  g.restore();
  const gp = g.createRadialGradient(W * 0.2, L * 0.2, 0, W * 0.2, L * 0.2, W * 0.16);
  gp.addColorStop(0, `rgba(255,255,255,${fuerza * 0.55})`); gp.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gp;
  g.fillRect(-W, -L, 2 * W, 2 * L);
}
function orillaOscura(g, W, L) {
  g.save();
  g.scale(1, L / W);
  const gr = g.createRadialGradient(0, 0, W * 0.25, 0, 0, W * 0.62);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(30,10,10,0.22)");
  g.fillStyle = gr;
  g.fillRect(-W, -W, 2 * W, 2 * W);
  g.restore();
}
function lineaOro(g, W, L, de, a, ctrl) {
  const gr = g.createLinearGradient(-W / 2, 0, W / 2, 0);
  gr.addColorStop(0, "#a9792a"); gr.addColorStop(0.5, "#f6e3a1"); gr.addColorStop(1, "#c59a43");
  g.strokeStyle = gr;
  g.lineWidth = Math.max(0.8, W * 0.045);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(de[0], de[1]);
  g.quadraticCurveTo(ctrl[0], ctrl[1], a[0], a[1]);
  g.stroke();
}
function pintarDiseno(g, dis, i, W, L, ang) {
  const hw = W / 2, hl = L / 2;
  if (dis.tipo === "solido") { capaBase(g, W, L, "#9c1324", "#5c0710"); orillaOscura(g, W, L); brillo(g, W, L, ang, 0.55); return; }
  if (dis.tipo === "lechoso") { capaBase(g, W, L, "#f7d6db", "#e2afb9"); orillaOscura(g, W, L); brillo(g, W, L, ang, 0.42); return; }
  if (dis.tipo === "french") {
    capaBase(g, W, L, "#efcbc2", "#d6a598");
    const gr = g.createLinearGradient(0, -hl, 0, -hl * 0.3);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#f7f4ef");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-W, -L); g.lineTo(W, -L); g.lineTo(W, -hl * 0.05);
    g.quadraticCurveTo(0, -hl * 1.05, -W, -hl * 0.05);
    g.closePath();
    g.fill();
    orillaOscura(g, W, L); brillo(g, W, L, ang, 0.4);
    return;
  }
  if (dis.tipo === "cromo") {
    const s = Math.sin(ang * 2) * 0.5 + 0.5;
    const gr = g.createLinearGradient(-hw, hl - L * 0.4 * s, hw, -hl - L * 0.4 * s);
    gr.addColorStop(0, "#f6efe9"); gr.addColorStop(0.28, "#e7dbf1"); gr.addColorStop(0.5, "#d9ecf1");
    gr.addColorStop(0.72, "#f6e5df"); gr.addColorStop(1, "#ffffff");
    g.fillStyle = gr;
    g.fillRect(-W, -L, 2 * W, 2 * L);
    orillaOscura(g, W, L); brillo(g, W, L, ang, 0.75);
    return;
  }
  if (dis.tipo === "oro") {
    capaBase(g, W, L, "#f3d9d2", "#dfb9ae");
    if (i === 2) {
      g.fillStyle = "#d6ad52";
      for (const y of [-0.05, 0.2, 0.45]) { elipse(g, 0, y * hl, W * 0.05, W * 0.05); g.fill(); }
    } else {
      const lado = i % 2 ? 1 : -1;
      lineaOro(g, W, L, [-lado * hw * 0.75, hl * 0.85], [lado * hw * 0.45, -hl * 0.8], [-lado * hw * 0.05, hl * 0.05]);
      if (i === 0) lineaOro(g, W, L, [-lado * hw * 0.45, hl * 0.9], [lado * hw * 0.7, -hl * 0.6], [lado * hw * 0.15, hl * 0.2]);
    }
    orillaOscura(g, W, L); brillo(g, W, L, ang, 0.42);
  }
}
function dibujarUna(g, dis, i, geo, luz, marcada) {
  const { W, L, u, v, c } = geo;
  g.save();
  g.setTransform(v.x, v.y, -u.x, -u.y, c.x, c.y);
  g.shadowColor = "rgba(40,15,15,0.35)";
  g.shadowBlur = Math.max(1, W * 0.16);
  almendra(g, W, L);
  g.fillStyle = "rgba(0,0,0,0.2)";
  g.fill();
  g.shadowColor = "transparent";
  g.save();
  almendra(g, W, L);
  g.clip();
  pintarDiseno(g, dis, i, W, L, geo.angulo);
  if (luz < 0.98) {
    const k = Math.round(255 * luz);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = `rgb(${k},${k},${k})`;
    g.fillRect(-W, -L, 2 * W, 2 * L);
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
  almendra(g, W, L);
  g.lineWidth = Math.max(0.6, W * 0.025);
  g.strokeStyle = "rgba(70,30,30,0.3)";
  g.stroke();
  if (marcada) {
    g.save();
    g.scale(1.22, 1.12);
    almendra(g, W, L);
    g.restore();
    g.lineWidth = Math.max(2, W * 0.07);
    g.strokeStyle = "#6d84ff";
    g.stroke();
  }
  g.restore();
}

// ---------- Escena ----------
function medirLuz() {
  cctx.drawImage(fondo, 0, 0, 24, 24);
  const d = cctx.getImageData(0, 0, 24, 24).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  lumaEscena = s / (d.length / 4) / 255;
  luzEscena = Math.min(1, Math.max(0.55, lumaEscena / 0.45));
}
function pintar() {
  if (!fondo.width) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fondo, 0, 0);
  // Se pintan siempre: con una sola camara los puntos de la mano no dicen con certeza si se ve el dorso o la palma
  if (mano) {
    const esc = escalaMano(mano.pts);
    const geos = DEDOS.map((_, i) => geometriaUna(mano.pts, i, esc));
    mano.geos = geos;
    for (const i of [4, 3, 2, 1, 0]) dibujarUna(ctx, POR_CLAVE[estado.unas[i]], i, geos[i], luzEscena, estado.seleccion === i);
  }
  if (mano && estado.puntos) {
    ctx.fillStyle = "#39ff9e";
    for (const p of mano.pts) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, fondo.width / 300), 0, Math.PI * 2); ctx.fill(); }
  }
  actualizarAvisos();
}
let avisoFijo = null;
function avisar(texto) { avisoFijo = texto; actualizarAvisos(); }
function actualizarAvisos() {
  const el = $("#aviso");
  let texto = avisoFijo;
  if (!texto && estado.modo === "camara") {
    if (!mano && performance.now() - ultimaMano > 1200) texto = "Pon tu mano frente a la cámara, con las uñas hacia ti ✋";
    else if (lumaEscena < 0.16) texto = "Hay poca luz. Acércate a una lámpara o a una ventana.";
    else if (medidas.avisoLento && !estado.pausado) texto = "Tu celular va lento con el video. Toca Pausa para elegir sobre la imagen quieta.";
  }
  el.textContent = texto || "";
  el.classList.toggle("oculto", !texto);
  $("#btn-luz").classList.toggle("oculto", !(puedeLuz && estado.modo === "camara" && (lumaEscena < 0.22 || luzPrendida)));
}
function ciclo() {
  requestAnimationFrame(ciclo);
  if (estado.modo === "camara" && !estado.pausado && video.readyState >= 2 && video.videoWidth && video.currentTime !== ultimoTiempoVideo) {
    ultimoTiempoVideo = video.currentTime;
    ajustarTamano(video.videoWidth, video.videoHeight);
    fctx.drawImage(video, 0, 0, fondo.width, fondo.height);
    detectar();
    cuadros++;
    if (cuadros % 15 === 0) medirLuz();
  }
  const ahora = performance.now();
  if (ahora - medidas.desde > 1000) {
    medidas.cps = Math.round((cuadros * 1000) / (ahora - medidas.desde));
    medidas.msModelo = medidas.cuentaMs ? medidas.sumaMs / medidas.cuentaMs : 0;
    cuadros = 0; medidas.sumaMs = 0; medidas.cuentaMs = 0; medidas.desde = ahora;
    if (estado.modo === "camara" && !estado.pausado && medidas.cps < 10) {
      if (!medidas.lentoDesde) medidas.lentoDesde = ahora;
      if (ahora - medidas.lentoDesde > 4000) medidas.avisoLento = true;
    } else medidas.lentoDesde = 0;
    if (!$("#ajustes").classList.contains("oculto")) escribirMedidas();
  }
  if (sucio) { sucio = false; pintar(); }
}
function escribirMedidas() {
  const vivo = estado.modo === "camara" && !estado.pausado;
  $("#medidas").textContent = [
    `Cuadros por segundo: ${vivo ? medidas.cps : "en pausa"}`,
    `Modelo por cuadro: ${medidas.msModelo.toFixed(1)} ms (${delegado})`,
    `Imagen: ${fondo.width} x ${fondo.height}`,
    `Luz: ${Math.round(lumaEscena * 100)}%`,
    `Mano: ${mano ? `la veo (${mano.etiqueta || "?"})` : "no la veo"}`,
  ].join("\n");
}

// ---------- Hoja de abajo ----------
function miniatura(cv, clave, i) {
  const s = cv.width, g = cv.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, s, s);
  const fondoG = g.createLinearGradient(0, 0, 0, s);
  fondoG.addColorStop(0, "#3a3036"); fondoG.addColorStop(1, "#251f24");
  g.fillStyle = fondoG;
  g.fillRect(0, 0, s, s);
  const piel = g.createLinearGradient(s * 0.25, 0, s * 0.75, 0);
  piel.addColorStop(0, "#c79478"); piel.addColorStop(0.5, "#e8bea2"); piel.addColorStop(1, "#c08b70");
  g.fillStyle = piel;
  g.beginPath();
  g.moveTo(s * 0.27, s * 1.05); g.lineTo(s * 0.27, s * 0.4);
  g.quadraticCurveTo(s * 0.27, s * 0.12, s * 0.5, s * 0.12);
  g.quadraticCurveTo(s * 0.73, s * 0.12, s * 0.73, s * 0.4);
  g.lineTo(s * 0.73, s * 1.05);
  g.closePath();
  g.fill();
  dibujarUna(g, POR_CLAVE[clave], i, { c: { x: s * 0.5, y: s * 0.4 }, u: { x: 0, y: -1 }, v: { x: 1, y: 0 }, W: s * 0.36, L: s * 0.56, angulo: -Math.PI / 2 }, 1, false);
}
function nuevaUna(i, alTocar) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "una";
  b.dataset.dedo = String(i);
  const cv = document.createElement("canvas");
  cv.width = cv.height = Math.round(50 * dpr);
  const sp = document.createElement("span");
  sp.textContent = DEDOS[i].nombre;
  b.append(cv, sp);
  b.addEventListener("click", () => alTocar(i));
  return b;
}
function armarTiras() {
  for (const id of ["#tira", "#tira2"]) {
    const t = $(id);
    t.replaceChildren(...[0, 1, 2, 3, 4].map((i) => nuevaUna(i, elegirUna)));
  }
}
function pintarTiras() {
  for (const id of ["#tira", "#tira2"]) {
    for (const b of $(id).children) {
      const i = Number(b.dataset.dedo);
      b.style.order = String(estado.orden.indexOf(i));
      b.classList.toggle("activa", estado.seleccion === i);
      b.setAttribute("aria-label", `${DEDOS[i].nombre}: ${POR_CLAVE[estado.unas[i]].nombre}`);
      miniatura(b.querySelector("canvas"), estado.unas[i], i);
    }
  }
}
function botonDiseno(d, activo, alTocar) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `disenio${activo ? " activo" : ""}`;
  b.setAttribute("role", "option");
  b.setAttribute("aria-selected", String(activo));
  const img = document.createElement("img");
  img.src = d.foto;
  img.alt = "";
  const sp = document.createElement("span");
  sp.textContent = d.nombre;
  b.append(img, sp);
  b.addEventListener("click", () => alTocar(d.clave));
  return b;
}
function esMezcla() { return new Set(estado.unas).size > 1; }
function textoResumen() {
  return `$${precioMezcla(estado.unas)} · ${duracionBonita(minutosMezcla(estado.unas))}`;
}
function pintarHoja() {
  const mezcla = esMezcla();
  $("#nombre").textContent = mezcla ? "Tu mezcla" : POR_CLAVE[estado.unas[0]].nombre;
  $("#resumen").textContent = textoResumen();
  $("#resumen2").textContent = `${mezcla ? "Tu mezcla" : POR_CLAVE[estado.unas[0]].nombre} · ${textoResumen()}`;
  $("#btn-elegir").textContent = mezcla ? "Elegir esta mezcla" : "Elegir este diseño";
  for (const b of [$("#btn-deshacer"), $("#btn-deshacer2")]) b.disabled = !estado.historial.length;
  $("#catalogo").replaceChildren(...DISENOS.map((d) => botonDiseno(d, d.clave === estado.base && !mezcla, elegirBase)));
  for (const b of document.querySelectorAll(".idea")) b.classList.toggle("activa", b.dataset.idea === estado.idea);
  const enUna = estado.seleccion !== null;
  $("#vista-mano").classList.toggle("oculto", enUna);
  $("#vista-una").classList.toggle("oculto", !enUna);
  if (enUna) {
    const i = estado.seleccion;
    $("#nombre-una").textContent = `Para ${DEDOS[i].para}`;
    const lista = [...combinan(estado.base), estado.base];
    $("#opciones").replaceChildren(...lista.map((c) => botonDiseno(POR_CLAVE[c], estado.unas[i] === c, (clave) => cambiarUna(i, clave))));
  }
  pintarTiras();
  sucio = true;
}
function guardarHistoria() {
  estado.historial.push({ base: estado.base, unas: [...estado.unas], idea: estado.idea });
  if (estado.historial.length > 40) estado.historial.shift();
}
function elegirBase(clave) {
  if (clave === estado.base && !esMezcla()) return;
  guardarHistoria();
  estado.base = clave;
  estado.unas = Array(5).fill(clave);
  estado.idea = null;
  pintarHoja();
}
function elegirUna(i) {
  estado.seleccion = i;
  pintarHoja();
}
function cambiarUna(i, clave) {
  if (estado.unas[i] === clave) return;
  guardarHistoria();
  estado.unas[i] = clave;
  estado.idea = null;
  pintarHoja();
}
function aplicarIdea(tipo) {
  const b = estado.base, o = combinan(b);
  let unas = Array(5).fill(b);
  if (tipo === "uno") unas[3] = o[0];
  if (tipo === "dos") { unas[2] = o[0]; unas[3] = o[0]; }
  if (tipo === "todas") unas = [o[3], b, o[1], o[0], o[2]];
  guardarHistoria();
  estado.unas = unas;
  estado.idea = tipo;
  pintarHoja();
}
function deshacer() {
  const h = estado.historial.pop();
  if (!h) return;
  Object.assign(estado, { base: h.base, unas: h.unas, idea: h.idea });
  pintarHoja();
}
function actualizarPausa() {
  const b = $("#btn-pausa");
  b.classList.toggle("pausado", estado.pausado && estado.modo === "camara");
  $("#txt-pausa").textContent = estado.modo === "foto" ? "Usar mi cámara" : estado.pausado ? "Pausa" : "En vivo";
  b.classList.toggle("foto", estado.modo === "foto");
  lienzo.classList.toggle("contener", estado.modo === "foto");
}
function mostrarEleccion() {
  const cont = $("#ficha-unas");
  cont.replaceChildren(...[4, 3, 2, 1, 0].map((i) => {
    const d = document.createElement("div");
    const cv = document.createElement("canvas");
    cv.width = cv.height = Math.round(44 * dpr);
    miniatura(cv, estado.unas[i], i);
    const sp = document.createElement("span");
    sp.textContent = DEDOS[i].nombre;
    d.append(cv, sp);
    return d;
  }));
  const mezcla = esMezcla();
  const distintos = new Set(estado.unas).size;
  $("#ficha-nombre").textContent = mezcla ? `Tu mezcla · ${distintos} diseños de Bella` : POR_CLAVE[estado.unas[0]].nombre;
  $("#ficha-detalle").textContent = `Alrededor de ${duracionBonita(minutosMezcla(estado.unas))} · $${precioMezcla(estado.unas)}`;
  $("#ficha-codigo").textContent = codigoMezcla(estado.unas);
  $("#eleccion").classList.remove("oculto");
}

// ---------- Toques ----------
function tocarEscena(ev) {
  if (!mano?.geos) return;
  const r = lienzo.getBoundingClientRect();
  const esc = Math.max(r.width / fondo.width, r.height / fondo.height);
  const ox = (r.width - fondo.width * esc) / 2, oy = (r.height - fondo.height * esc) / 2;
  let x = (ev.clientX - r.left - ox) / esc;
  const y = (ev.clientY - r.top - oy) / esc;
  if (lienzo.classList.contains("espejo")) x = fondo.width - x;
  let mejor = -1, dist = Infinity;
  mano.geos.forEach((g, i) => {
    const d = Math.hypot(g.c.x - x, g.c.y - y);
    if (d < Math.max(g.W, g.L) * 0.9 && d < dist) { dist = d; mejor = i; }
  });
  if (mejor >= 0) elegirUna(mejor);
}
function conectar() {
  armarTiras();
  // La camara ocupa lo que queda arriba de la hoja: nada de la mano se esconde detras de los botones
  new ResizeObserver(() => {
    document.documentElement.style.setProperty("--hoja-alto", `${$("#hoja").offsetHeight}px`);
  }).observe($("#hoja"));
  $("#btn-camara").addEventListener("click", abrirCamara);
  $("#btn-ejemplo").addEventListener("click", () => abrirFoto("fotos/mano-ejemplo.webp"));
  $("#input-foto").addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) abrirFoto(f); e.target.value = ""; });
  $("#btn-pausa").addEventListener("click", () => {
    if (estado.modo === "foto") { avisoFijo = null; abrirCamara(); return; }
    estado.pausado = !estado.pausado;
    medidas.avisoLento = false;
    actualizarPausa();
    sucio = true;
  });
  $("#btn-deshacer").addEventListener("click", deshacer);
  $("#btn-deshacer2").addEventListener("click", deshacer);
  $("#btn-listo").addEventListener("click", () => { estado.seleccion = null; pintarHoja(); });
  $("#btn-elegir").addEventListener("click", mostrarEleccion);
  $("#btn-cerrar-eleccion").addEventListener("click", () => $("#eleccion").classList.add("oculto"));
  for (const b of document.querySelectorAll(".idea")) b.addEventListener("click", () => aplicarIdea(b.dataset.idea));
  $("#btn-ajustes").addEventListener("click", () => { pintarAjustes(); escribirMedidas(); $("#ajustes").classList.remove("oculto"); });
  $("#btn-cerrar-ajustes").addEventListener("click", () => $("#ajustes").classList.add("oculto"));
  for (const grupo of document.querySelectorAll(".segmentos")) {
    grupo.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const cual = grupo.dataset.ajuste, v = b.dataset.v;
      if (cual === "largo") estado.largo = v;
      if (cual === "ancho") estado.ancho = Number(v);
      if (cual === "puntos") estado.puntos = v === "si";
      if (cual === "camara" && v !== estado.camara) { estado.camara = v; if (estado.modo === "camara") abrirCamara(); }
      pintarAjustes();
      sucio = true;
    });
  }
  $("#btn-luz").addEventListener("click", async () => {
    if (!pista) return;
    try { luzPrendida = !luzPrendida; await pista.applyConstraints({ advanced: [{ torch: luzPrendida }] }); } catch { luzPrendida = false; }
    $("#btn-luz").textContent = luzPrendida ? "Apagar luz" : "Encender luz";
  });
  lienzo.addEventListener("click", tocarEscena);
  document.addEventListener("visibilitychange", () => { if (document.hidden && estado.modo === "camara") { estado.pausado = true; actualizarPausa(); } });
}
function pintarAjustes() {
  const valores = { largo: estado.largo, ancho: String(estado.ancho), puntos: estado.puntos ? "si" : "no", camara: estado.camara };
  for (const g of document.querySelectorAll(".segmentos")) {
    for (const b of g.children) b.classList.toggle("activo", b.dataset.v === valores[g.dataset.ajuste]);
  }
}

conectar();
pintarHoja();
requestAnimationFrame(ciclo);
cargar();
