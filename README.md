# Probador de diseños · prototipo (actividad 98)

Prototipo de Prompt Maestro para probar en un celular el probador de diseños de uñas EN VIVO con la cámara, sin IA generativa:
la mano la sigue MediaPipe Hand Landmarker y cada uña se pinta con canvas. No es la página pública; los diseños, los precios y las
fotos son de ejemplo (Studio Bella, negocio ficticio).

- Todo corre en el navegador: la imagen de la cámara no sale del celular. La página solo baja sus propios archivos
  (Content-Security-Policy `connect-src 'self'`, sin analítica ni terceros).
- `?ejemplo=1` abre la mano de ejemplo sin cámara. En "Ajustes" se ven los cuadros por segundo, el tiempo del modelo y la luz.

## Detector de uñas (propio)

`modelo/detector-unas.bin` y `.json`: red chica (unos 48 mil numeros) entrenada por Prompt Maestro para encontrar la uña dentro del
recorte de la punta de cada dedo. Corre en el celular con TensorFlow.js. Se entreno con estas colecciones publicas de Roboflow
Universe, todas con licencia CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), sin cambios a sus imagenes:

- "nail-segmentation" de Q1noisy bird: https://universe.roboflow.com/q1noisy-bird/nail-segmentation-vic7o
- "Nail" de sample: https://universe.roboflow.com/sample-4lz0a/nail-f6nzo
- "Nail" de nhi: https://universe.roboflow.com/nhi-tz2cg/nail-bheyh
- "nail segmentation" de AIIT nail competition: https://universe.roboflow.com/aiit-nail-competition/nail-segmentation-odcgv

## Avisos de terceros

Incluye, sin cambios, TensorFlow.js 4.22.0 (`@tensorflow/tfjs-core` y `@tensorflow/tfjs-backend-webgl`, carpeta
`vendor/tfjs-4.22.0/`, de npm con sha512 verificado), de Google, con licencia Apache 2.0.


Incluye, sin cambios, `@mediapipe/tasks-vision` 0.10.35 (carpeta `vendor/`, de npm, sha512 verificado) y el modelo
`hand_landmarker` float16 versión 1 (carpeta `modelo/`, de storage.googleapis.com/mediapipe-models, sha256
`fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`), los dos de Google con licencia Apache 2.0
(https://www.apache.org/licenses/LICENSE-2.0).
