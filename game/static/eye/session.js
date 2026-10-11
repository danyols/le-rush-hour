import {HEAD_CONFIG as C} from './config.js';
import {NeutralCalibration,relativeAngles,positionMatches,classifyHead} from './head-core.js';
import {DwellSelector} from './dwell.js';
export class HeadSession {
  constructor(){this.selector=new DwellSelector();this.phase='idle';this.lastTime=null;}
  // Which directions can be selected: the colors while choosing a marker, only 'down' while the
  // robot runs, nothing while it returns to rest. Changing it needs a fresh forward hold to rearm.
  setAllowed(directions){
    const next=new Set(directions);
    if([...next].join()===[...this.selector.allowed].join())return;
    this.selector.allowed=next;this.selector.reset();
  }
  begin(){this.calibration=new NeutralCalibration();this.model=null;this.phase='calibrating';this.lastTime=null;this.direction=null;this.reason='face';this.angles=null;this.selector.reset();}
  pause(){this.phase='paused';this.model=null;this.direction=null;this.angles=null;this.selector.reset();}
  invalid(reason,time){
    this.reason=reason;this.direction=null;this.angles=null;
    if(this.phase==='calibrating')this.calibration.observe({valid:false},time);
    if(this.phase==='ready')this.selector.observe(null,time,time);
  }
  observe(o,time,receivedAt){
    if(!['calibrating','ready'].includes(this.phase))return null;
    if(this.lastTime!==null&&time<=this.lastTime)return null;
    if(this.lastTime!==null&&time-this.lastTime>C.freshnessMs){this.angles=null;this.direction=null;this.selector.clearProgress();}
    this.lastTime=time;
    if(receivedAt-time>C.freshnessMs){this.invalid('stale',receivedAt);return null;}
    if(!o.valid){this.invalid(o.reason,time);return null;}
    this.reason=null;
    if(this.phase==='calibrating'){
      this.calibration.observe(o,time);
      if(this.calibration.done){this.model=this.calibration.model;this.phase='ready';this.angles=null;this.selector.reset();}
      return null;
    }
    if(!positionMatches(o.pose,this.model.pose)){this.invalid('position',time);return null;}
    const raw=relativeAngles(o.pose,this.model.pose);
    // Reject downward (unless DOWN is a command), extreme and rolled poses immediately, before smoothing.
    const down=this.selector.allowed.has('down');
    if((raw.pitch< -C.neutralDegrees&&!down)||Math.abs(raw.yaw)>C.maxYaw||Math.abs(raw.pitch)>C.maxPitch||Math.abs(raw.roll)>C.maxRoll){this.invalid('unassigned',time);return null;}
    this.angles=this.angles?Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,this.angles[k]+.55*(v-this.angles[k])])):raw;
    this.direction=classifyHead(this.angles,this.direction,{down});
    if(!this.direction)this.reason='neutral-zone';
    else if(this.direction!=='center'&&!this.selector.allowed.has(this.direction))this.reason='locked';
    return this.selector.observe(this.direction,time,receivedAt);
  }
  tick(now){
    if(this.lastTime!==null&&now-this.lastTime>C.freshnessMs){
      this.direction=null;this.reason='stale';this.angles=null;this.selector.expire(now);
      if(this.phase==='calibrating')this.calibration.restart();
    }
  }
  get target(){return this.phase==='calibrating'?'center':this.phase==='ready'?(this.selector.armed?this.selector.candidate:'center'):null;}
  get progress(){return this.phase==='calibrating'?this.calibration.progress:this.phase==='ready'?(this.selector.armed?this.selector.progress:this.selector.centerMs/C.rearmMs):0;}
}
