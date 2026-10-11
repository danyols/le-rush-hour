import {HEAD_CONFIG as C} from './config.js';
export class CameraPipeline {
  constructor(video,{onObservation,onError,onReady=()=>{},media=navigator.mediaDevices,WorkerClass=Worker,bitmap=(...args)=>globalThis.createImageBitmap(...args),clock=performance}={}){
    Object.assign(this,{video,onObservation,onError,onReady,media,WorkerClass,bitmap,clock});this.generation=0;
  }
  async start(deviceId=''){
    this.stop();const generation=this.generation;
    const current=()=>generation===this.generation;
    try{
      const stream=await this.media.getUserMedia({audio:false,video:{...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:'user'}),width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}}});
      if(!current()){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;
      stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(current())this.fail(Error('Camera disconnected. Reconnect it and start again.'));}));
      await this.video.play();if(!current())return;
      this.worker=new this.WorkerClass('/static/eye/worker.js');
      await new Promise((resolve,reject)=>{
        this.rejectReady=reject;
        this.readyTimer=setTimeout(()=>reject(Error('Head tracker took too long to load. Reload and check the local model files.')),45000);
        this.worker.onerror=()=>this.fail(Error('Head tracking worker failed. Try a current Chrome or Safari browser.'));
        this.worker.onmessage=({data})=>{
          if(!current())return;
          if(data.type==='ready'){clearTimeout(this.readyTimer);this.rejectReady=null;resolve();}
          else if(data.type==='error')this.fail(Error(data.message));
          else if(data.type==='observation'){
            this.busy=false;clearTimeout(this.frameTimer);
            this.onObservation(data.observation,data.time,this.clock.now(),data.cost);
          }
        };
        this.worker.postMessage({type:'init'});
      });
      if(!current())return;
      this.onReady();this.lastVideoTime=-1;
      this.interval=setInterval(()=>this.tick(generation),C.frameIntervalMs);
    }catch(error){if(current())this.fail(error);}
  }
  async tick(generation=this.generation){
    if(generation!==this.generation||this.busy||!this.worker||this.video.paused||this.video.readyState<2||this.lastVideoTime===this.video.currentTime)return;
    this.lastVideoTime=this.video.currentTime;this.busy=true;
    const time=this.clock.now();
    try{
      const bitmap=await this.bitmap(this.video,{resizeWidth:640,resizeHeight:Math.round(640*this.video.videoHeight/this.video.videoWidth)});
      if(generation!==this.generation){bitmap.close();return;}
      this.frameTimer=setTimeout(()=>this.fail(Error('Head tracker stopped responding. Start again to reload it.')),5000);
      this.worker.postMessage({type:'frame',time,bitmap},[bitmap]);
    }catch(error){if(generation===this.generation)this.fail(error);}
  }
  fail(error){const callback=this.onError;this.stop();callback(error);}
  stop(){
    this.generation++;clearInterval(this.interval);clearTimeout(this.readyTimer);clearTimeout(this.frameTimer);
    this.rejectReady?.(new Error('Camera startup cancelled'));this.rejectReady=null;
    this.worker?.terminate();this.worker=null;
    this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    this.video.srcObject=null;this.busy=false;
  }
}
