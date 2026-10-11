export const HEAD_CONFIG = Object.freeze({
  targets: {
    green: {label:'Green',position:'top',color:'#268269',task:'white_cube-green_marker'},
    yellow: {label:'Yellow',position:'left',color:'#b58418',task:'white_cube-yellow_marker'},
    red: {label:'Red',position:'right',color:'#c56059',task:'white_cube-red_marker'},
  },
  dwellMs:2000, rearmMs:500, freshnessMs:250,
  settleMs:500, sampleMs:1000, frameIntervalMs:60,
  neutralDegrees:5, yawEnter:12, yawExit:9, pitchEnter:10, pitchExit:8,
  horizontalPitchLimit:7, verticalYawLimit:8, maxYaw:40, maxPitch:30,
  maxRoll:20, neutralStabilityDegrees:4, maxCenterShift:.18, maxScaleChange:.35,
  wasmRoot:'/static/vendor/mediapipe/wasm',
  model:'/static/vendor/mediapipe/face_landmarker.task',
});
