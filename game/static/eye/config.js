export const HEAD_CONFIG = Object.freeze({
  targets: {
    // Each marker color is an instrument tray. `items` are drawn by or-scene.js (INSTRUMENTS).
    green: {label:'Blunt',category:'Blunt & retractors',position:'top',color:'#0f9d77',task:'white_cube-green_marker',items:['retractor','probe','elevator']},
    yellow: {label:'Clamps',category:'Clamps & forceps',position:'left',color:'#d4930d',task:'white_cube-yellow_marker',items:['forceps','hemostat','needleHolder']},
    red: {label:'Sharps',category:'Sharps',position:'right',color:'#d64545',task:'white_cube-red_marker',items:['scalpel','needle','scissors']},
  },
  dwellMs:2000, rearmMs:500, freshnessMs:250,
  settleMs:500, sampleMs:1000, frameIntervalMs:60,
  neutralDegrees:5, yawEnter:12, yawExit:9, pitchEnter:10, pitchExit:8,
  horizontalPitchLimit:7, verticalYawLimit:8, maxYaw:40, maxPitch:30,
  maxRoll:20, neutralStabilityDegrees:4, maxCenterShift:.18, maxScaleChange:.35,
  wasmRoot:'/static/vendor/mediapipe/wasm',
  model:'/static/vendor/mediapipe/face_landmarker.task',
});
