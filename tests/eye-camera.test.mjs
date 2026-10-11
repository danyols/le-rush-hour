import assert from 'node:assert/strict';
import {CameraPipeline} from '../game/static/eye/camera.js';
function harness({cameraError,workerError,lateCamera,lateBitmap}={}){
 let stops=0,closed=0,resolveStream,resolveBitmap,videoEnded;
 const observations=[],errors=[],workers=[];
 const stream={getTracks:()=>[{stop(){stops++}}],getVideoTracks:()=>[{addEventListener(k,f){videoEnded=f}}]};
 const video={srcObject:null,currentTime:1,paused:false,readyState:4,videoWidth:640,videoHeight:480,async play(){}};
 class WorkerStub{
  constructor(){workers.push(this)}
  postMessage(data){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:workerError?{type:'error',message:'model missing'}:{type:'ready'}}));else {this.frame=data;this.frames=(this.frames||0)+1;}}
  terminate(){this.terminated=true;}
 }
 const bitmap={width:640,height:480,close(){closed++}};
 const pipeline=new CameraPipeline(video,{onObservation:(...args)=>observations.push(args),onError:e=>errors.push(e),media:{async getUserMedia(){if(cameraError)throw Object.assign(Error(cameraError),{name:cameraError});return lateCamera?new Promise(resolve=>resolveStream=resolve):stream;}},WorkerClass:WorkerStub,bitmap:()=>lateBitmap?new Promise(resolve=>resolveBitmap=resolve):Promise.resolve(bitmap),clock:{now:()=>1000}});
 return {pipeline,video,workers,errors,observations,get stops(){return stops},get closed(){return closed},resolveStream(){resolveStream(stream)},resolveBitmap(){resolveBitmap(bitmap)},end(){videoEnded()}};
}
for(const cameraError of ['NotAllowedError','NotFoundError']){const h=harness({cameraError});await h.pipeline.start();assert.equal(h.errors[0].name,cameraError);assert.equal(h.video.srcObject,null);}
let h=harness({workerError:true});await h.pipeline.start();assert.match(h.errors[0].message,/model missing/);assert.equal(h.stops,1);assert.equal(h.workers[0].terminated,true);
h=harness();await h.pipeline.start();await h.pipeline.tick();const worker=h.workers[0];assert.equal(worker.frame.type,'frame');assert.equal(h.pipeline.busy,true);await h.pipeline.tick();assert.equal(h.observations.length,0);
worker.onmessage({data:{type:'observation',observation:{valid:false,reason:'face'},time:1000,cost:20}});assert.equal(h.observations.length,1);assert.equal(h.pipeline.busy,false);await h.pipeline.tick();assert.equal(worker.frames,1,'frozen video cannot provide another observation');
h.pipeline.stop();assert.equal(h.stops,1);assert.equal(worker.terminated,true);worker.onmessage({data:{type:'observation'}});assert.equal(h.observations.length,1,'late old-generation message ignored');
await h.pipeline.start();assert.equal(h.workers.length,2);h.end();assert.match(h.errors[0].message,/disconnected/);assert.equal(h.video.srcObject,null);
h=harness({lateCamera:true});const pending=h.pipeline.start();h.pipeline.stop();h.resolveStream();await pending;assert.equal(h.stops,1);assert.equal(h.workers.length,0);
h=harness({lateBitmap:true});await h.pipeline.start();const capture=h.pipeline.tick();h.pipeline.stop();h.resolveBitmap();await capture;assert.equal(h.closed,1);assert.equal(h.workers[0].frame,undefined);
console.log('PASS: camera denial/missing, model failure, one frame in flight, pause/resume, disconnect, late permissions, late bitmap and stale worker cleanup.');
