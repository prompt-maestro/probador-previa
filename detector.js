// Detector de uñas del probador (actividad 98): una red chica entrenada por Prompt Maestro con fotos publicas de uñas (CC BY 4.0).
// Recibe la punta de cada dedo recortada y alineada (la punta hacia arriba) y devuelve, pixel por pixel, donde esta la uña.
// Corre en el celular con TensorFlow.js (version exacta 4.22.0, alojada aqui mismo): la imagen no sale del navegador.

const ANCHO = 48, ALTO = 64;

export async function cargarDetector(base) {
  const tf = window.tf;
  if (!tf) throw new Error("Falta TensorFlow.js");
  try { await tf.setBackend("webgl"); } catch { await tf.setBackend("cpu"); }
  await tf.ready();
  const [man, bin] = await Promise.all([
    fetch(`${base}detector-unas.json`).then((r) => r.json()),
    fetch(`${base}detector-unas.bin`).then((r) => r.arrayBuffer()),
  ]);
  const todo = new Float32Array(bin);
  const w = {};
  for (const c of man.capas) w[c.nombre] = tf.tensor(todo.subarray(c.desde, c.desde + c.cuantos), c.forma);
  const conv = (x, n) => tf.relu(tf.add(tf.conv2d(x, w[`${n}.weight`], 1, "same"), w[`${n}.bias`]));
  const bloque = (x, n) => conv(conv(x, `${n}.0`), `${n}.2`);
  const sube = (x) => tf.image.resizeBilinear(x, [x.shape[1] * 2, x.shape[2] * 2], false, true);
  const red = (x) => {
    const a = bloque(tf.div(tf.sub(x, 0.5), 0.25), "e1");
    const b = bloque(tf.maxPool(a, 2, 2, "valid"), "e2");
    const c = bloque(tf.maxPool(b, 2, 2, "valid"), "e3");
    const d = bloque(tf.concat([sube(c), b], 3), "d2");
    const e = bloque(tf.concat([sube(d), a], 3), "d1");
    return tf.sigmoid(tf.add(tf.conv2d(e, w["fin.weight"], 1, "same"), w["fin.bias"]));
  };
  // tira: canvas de (ANCHO * n) x ALTO con los n recortes uno junto al otro
  async function correr(tira, n) {
    const salida = tf.tidy(() => {
      // Solo operaciones sueltas: el paquete tfjs-core no trae las formas encadenadas (x.toFloat())
      const x = tf.div(tf.cast(tf.browser.fromPixels(tira), "float32"), 255);
      const lotes = tf.transpose(tf.reshape(x, [ALTO, n, ANCHO, 3]), [1, 0, 2, 3]);
      return red(lotes);
    });
    const datos = await salida.data();
    salida.dispose();
    return datos; // n * ALTO * ANCHO probabilidades
  }
  // Calentar la tarjeta de video una vez (la primera corrida compila sus programas)
  const prueba = document.createElement("canvas");
  prueba.width = ANCHO * 5;
  prueba.height = ALTO;
  await correr(prueba, 5);
  return { correr, ANCHO, ALTO, backend: tf.getBackend() };
}

// Transformacion del recorte: punto del recorte (x, y) -> punto de la imagen. u: hacia la punta; v: a lo ancho.
export function marcoDelRecorte(centro, u, anchoRecorte) {
  const v = { x: -u.y, y: u.x };
  const altoRecorte = anchoRecorte * ALTO / ANCHO;
  const ex = anchoRecorte / ANCHO, ey = altoRecorte / ALTO;
  const o = { x: centro.x - v.x * (ANCHO / 2) * ex + u.x * (ALTO / 2) * ey, y: centro.y - v.y * (ANCHO / 2) * ex + u.y * (ALTO / 2) * ey };
  // x_img = a*x + c*y + e ; y_img = b*x + d*y + f  (el mismo orden que setTransform del canvas)
  return { a: v.x * ex, b: v.y * ex, c: -u.x * ey, d: -u.y * ey, e: o.x, f: o.y };
}
export function inversa(m) {
  const det = m.a * m.d - m.b * m.c;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
}

// De la mascara de un recorte saca la uña: se queda con la mancha sobre el eje del dedo y mide su eje, largo y ancho.
// lateral: cuanto puede alejarse la uña del eje del dedo, en fraccion del ancho del recorte (a lo ancho los puntos de la mano
// casi no se equivocan; a lo largo si, por eso alla hay mas holgura)
export function medirUna(prob, desde, lateral = 0.2) {
  const umbral = 0.5;
  const vista = new Uint8Array(ANCHO * ALTO);
  let mejor = null;
  for (let i = 0; i < ANCHO * ALTO; i++) {
    if (vista[i] || prob[desde + i] < umbral) continue;
    const pila = [i];
    vista[i] = 1;
    const pix = [];
    while (pila.length) {
      const k = pila.pop();
      pix.push(k);
      const x = k % ANCHO, y = (k / ANCHO) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ANCHO || ny >= ALTO) continue;
        const j = ny * ANCHO + nx;
        if (!vista[j] && prob[desde + j] >= umbral) { vista[j] = 1; pila.push(j); }
      }
    }
    // Red de seguridad: si no parece una uña (muy chica, muy grande, lejos de donde debe estar o con poca seguridad), no se pinta
    if (pix.length < ANCHO * ALTO * 0.04 || pix.length > ANCHO * ALTO * 0.55) continue;
    let sx = 0, sy = 0, sp = 0;
    for (const k of pix) { sx += k % ANCHO; sy += (k / ANCHO) | 0; sp += prob[desde + k]; }
    const cx = sx / pix.length, cy = sy / pix.length;
    if (sp / pix.length < 0.72) continue;
    if (Math.abs(cx - ANCHO / 2) > ANCHO * lateral || Math.abs(cy - ALTO / 2) > ALTO * 0.36) continue;
    const dist = Math.abs(cx - ANCHO / 2) * 2.5 + Math.abs(cy - ALTO / 2) - Math.sqrt(pix.length) * 0.5;
    if (!mejor || dist < mejor.dist) mejor = { pix, cx, cy, dist };
  }
  if (!mejor) return null;
  // eje por renglones: centro de cada renglon y su ancho
  const filas = new Map();
  for (const k of mejor.pix) {
    const x = k % ANCHO, y = (k / ANCHO) | 0;
    const f = filas.get(y) || { min: x, max: x, n: 0 };
    f.min = Math.min(f.min, x); f.max = Math.max(f.max, x); f.n++;
    filas.set(y, f);
  }
  const ys = [...filas.keys()].sort((p, q) => p - q);
  const arriba = ys[0], abajo = ys[ys.length - 1];
  const largo = abajo - arriba + 1;
  let sumY = 0, sumX = 0, sumXY = 0, sumYY = 0;
  const anchos = [];
  for (const y of ys) {
    const f = filas.get(y), cxF = (f.min + f.max) / 2;
    sumY += y; sumX += cxF; sumXY += y * cxF; sumYY += y * y;
    if (y > arriba + largo * 0.3 && y < abajo - largo * 0.25) anchos.push(f.max - f.min + 1);
  }
  const n = ys.length;
  const pend = n > 2 ? (n * sumXY - sumY * sumX) / Math.max(1e-6, n * sumYY - sumY * sumY) : 0;
  anchos.sort((p, q) => p - q);
  const ancho = anchos.length ? anchos[(anchos.length / 2) | 0] : mejor.pix.length / largo;
  return { cx: (sumX / n) + pend * ((arriba + abajo) / 2 - sumY / n), cy: (arriba + abajo) / 2, largo, ancho, pend, area: mejor.pix.length, pix: mejor.pix };
}
