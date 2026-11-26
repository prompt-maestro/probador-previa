# Probador de diseños · prototipo (actividad 98)

Prototipo de Prompt Maestro para probar en un celular el probador de diseños de uñas EN VIVO con la cámara, sin IA generativa:
la mano la sigue MediaPipe Hand Landmarker y cada uña se pinta con canvas. No es la página pública; los diseños, los precios y las
fotos son de ejemplo (Studio Bella, negocio ficticio).

- Todo corre en el navegador: la imagen de la cámara no sale del celular. La página solo baja sus propios archivos
  (Content-Security-Policy `connect-src 'self'`, sin analítica ni terceros).
- `?ejemplo=1` abre la mano de ejemplo sin cámara. En "Ajustes" se ven los cuadros por segundo, el tiempo del modelo y la luz.

## Avisos de terceros

Incluye, sin cambios, `@mediapipe/tasks-vision` 0.10.35 (carpeta `vendor/`, de npm, sha512 verificado) y el modelo
`hand_landmarker` float16 versión 1 (carpeta `modelo/`, de storage.googleapis.com/mediapipe-models, sha256
`fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`), los dos de Google con licencia Apache 2.0
(https://www.apache.org/licenses/LICENSE-2.0).
