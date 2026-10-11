# Local face-landmark runtime

Pinned package: `@mediapipe/tasks-vision@0.10.21`, Apache-2.0.
Source: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/

Vendored files are the unmodified `vision_bundle.mjs`, SIMD and non-SIMD
`wasm/vision_wasm*_internal.js` and `.wasm` files. The worker selects the
appropriate runtime with FilesetResolver. Only the selected WASM variant loads.

Model: Face Landmarker float16, version 1:
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

License text: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
Copyright/license notices embedded in the distributed files are retained.
`checksums.json` records SHA-256 hashes of the downloaded files.

Frames are processed locally using a classic Web Worker and the CPU delegate.
The classic worker is required by this release's WASM loader (`importScripts`).
No CDN or model-host requests are made by the application at runtime.
The combined download stored in this folder is about 22 MB, including both WASM variants.
