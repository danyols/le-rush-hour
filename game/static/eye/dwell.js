import {HEAD_CONFIG as C} from './config.js';
export class DwellSelector {
  constructor(){this.allowed=new Set(Object.keys(C.targets));this.reset();}
  reset(){this.armed=false;this.candidate=null;this.elapsed=0;this.centerMs=0;this.lastTime=null;this.lastDirection=null;}
  clearProgress(){this.candidate=null;this.elapsed=0;this.centerMs=0;this.lastDirection=null;}
  expire(now){if(this.lastTime!==null&&now-this.lastTime>C.freshnessMs)this.clearProgress();}
  observe(direction,time,receivedAt=time,reason=null){
    if(this.lastTime!==null&&time<=this.lastTime)return null;
    const dt=this.lastTime===null?0:time-this.lastTime;
    if(receivedAt-time>C.freshnessMs||dt>C.freshnessMs){this.clearProgress();}
    this.lastTime=time;
    if(receivedAt-time>C.freshnessMs)return null;
    if(!direction){this.clearProgress();return null;}
    if(!this.armed){
      this.centerMs=direction==='center'?(this.lastDirection==='center'?this.centerMs+dt:0):0;
      if(this.centerMs>=C.rearmMs){this.armed=true;this.centerMs=0;}
      this.lastDirection=direction;return null;
    }
    if(!this.allowed.has(direction)){this.clearProgress();this.lastDirection=direction;return null;}
    if(this.candidate!==direction){this.candidate=direction;this.elapsed=0;}
    else if(this.lastDirection===direction)this.elapsed+=dt;
    this.lastDirection=direction;
    if(this.elapsed>=C.dwellMs){const selected=direction;this.reset();this.lastTime=time;return selected;}
    return null;
  }
  get progress(){return this.elapsed/C.dwellMs;}
}
