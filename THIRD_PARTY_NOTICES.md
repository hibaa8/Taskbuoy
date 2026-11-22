# Third-party assets

## MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision`, pinned to **0.10.21**.
- Source project: https://github.com/google-ai-edge/mediapipe
- SDK and WebAssembly distribution: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/
- Apache 2.0 license and bundled upstream notices: `extension/vendor/LICENSE`.
- Files: `vision_bundle.mjs`, SIMD/non-SIMD loader JS and WebAssembly binaries in `extension/vendor/wasm/`.

## Model assets

Google MediaPipe model distributions, preserving the original model bytes:

- Face Landmarker, float16 v1: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- EfficientDet-Lite0, float32 v1: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite
- Model documentation: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker and https://developers.google.com/edge/mediapipe/solutions/vision/object_detector

The EfficientDet model is stored in three `.bin` parts to fit upload limits. `extension/models/phone-model.json` records their order, sizes, and the SHA-256 of the original model. The loader reassembles and verifies those original bytes in memory before inference.

`extension/MODEL_ASSETS.json` records the exact size and SHA-256 of every bundled model/runtime asset. See upstream documentation and its linked model cards for model descriptions and limitations. These models are general-purpose vision models; this project has not validated them for attention measurement.

## Motivational video

Default: “Thoughts on humanity, fame and love | Shah Rukh Khan | TED.”

- Official TED speaker page: https://www.ted.com/speakers/shah_rukh_khan
- Video: https://www.youtube.com/watch?v=0NV1KdWRHck

Playback is embedded through YouTube's player. No video/audio footage is included in the ZIP. Availability, advertising, autoplay, and embedding behavior are controlled by the provider. The talk is not a personal endorsement of this project.

The notification chime is an original synthesized three-note WAV generated for this project.
