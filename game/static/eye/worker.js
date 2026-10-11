// Classic worker: MediaPipe's WASM loader uses importScripts.
let landmarker=null, extract=null;
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      const [{FaceLandmarker,FilesetResolver},{extractObservation},{HEAD_CONFIG:C}]=await Promise.all([
        import('../vendor/mediapipe/vision_bundle.mjs'),import('./head-core.js'),import('./config.js'),
      ]);
      extract=extractObservation;
      const files=await FilesetResolver.forVisionTasks(C.wasmRoot);
      landmarker=await FaceLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:C.model,delegate:'CPU'},runningMode:'VIDEO',numFaces:2,
        minFaceDetectionConfidence:.65,minFacePresenceConfidence:.65,minTrackingConfidence:.65,
        outputFacialTransformationMatrixes:true,outputFaceBlendshapes:false,
      });
      self.postMessage({type:'ready'});
    }catch(error){self.postMessage({type:'error',message:`Head tracker could not load: ${error.message}`});}
    return;
  }
  if(data.type==='frame'){
    const begin=performance.now();
    try{
      if(!landmarker)throw Error('Head tracker is not ready');
      const result=landmarker.detectForVideo(data.bitmap,data.time);
      self.postMessage({type:'observation',time:data.time,observation:extract(result,data.bitmap.width,data.bitmap.height),cost:performance.now()-begin});
    }catch(error){self.postMessage({type:'error',message:`Head tracking failed: ${error.message}`});}
    finally{data.bitmap.close();}
  }
};
