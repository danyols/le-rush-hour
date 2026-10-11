import {HEAD_CONFIG as C} from './config.js';
const deg=180/Math.PI;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const clamp=n=>Math.max(-1,Math.min(1,n));
// MediaPipe MatrixData is column-major; metric space is right handed, +Y up.
// Canonical face forward is +Z. Raw webcam +X is the person's LEFT (preview is mirrored).
export function extractObservation(result){
  if(result.faceLandmarks?.length!==1)return {valid:false,reason:result.faceLandmarks?.length>1?'multiple':'face'};
  const p=result.faceLandmarks[0],m=result.facialTransformationMatrixes?.[0]?.data;
  if(p.length<468||!m||m.length!==16||!Array.from(m).every(Number.isFinite))return {valid:false,reason:'pose'};
  const columns=[0,4,8].map(i=>Array.from(m.slice(i,i+3)));
  for(const column of columns){const length=Math.hypot(...column);if(length<1e-6)return {valid:false,reason:'pose'};for(let j=0;j<3;j++)column[j]/=length;}
  const [x,y,z]=columns;
  const cross=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
  if(Math.abs(dot(x,y))>.1||Math.abs(dot(x,z))>.1||Math.abs(dot(y,z))>.1||dot(cross,z)<.9)return {valid:false,reason:'pose'};
  // No iris or eyelid measurements. Ordinary blinking does not interrupt head control.
  const face=p.slice(0,468);
  if(face.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)))return {valid:false,reason:'pose'};
  const xs=face.map(q=>q.x),ys=face.map(q=>q.y),width=Math.max(...xs)-Math.min(...xs);
  if(width<.12||width>.85)return {valid:false,reason:'distance'};
  return {valid:true,pose:{columns,x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,scale:width}};
}
export function relativeAngles(pose,reference){
  // R_reference^T * R_current: remove the user's comfortable starting orientation.
  const x=reference.columns.map(axis=>dot(axis,pose.columns[0]));
  const forward=reference.columns.map(axis=>dot(axis,pose.columns[2]));
  return {yaw:Math.atan2(forward[0],forward[2])*deg,pitch:Math.atan2(forward[1],Math.hypot(forward[0],forward[2]))*deg,roll:Math.atan2(x[1],x[0])*deg};
}
export function rotationDistance(a,b){return Math.acos(clamp((a.columns.reduce((s,col,i)=>s+dot(col,b.columns[i]),0)-1)/2))*deg;}
export function positionMatches(pose,reference){return Math.hypot(pose.x-reference.x,pose.y-reference.y)<=C.maxCenterShift&&Math.abs(pose.scale/reference.scale-1)<=C.maxScaleChange;}
export function classifyHead({yaw,pitch,roll},previous=null){
  if(![yaw,pitch,roll].every(Number.isFinite)||Math.abs(yaw)>C.maxYaw||Math.abs(pitch)>C.maxPitch||Math.abs(roll)>C.maxRoll)return null;
  if(Math.abs(yaw)<=C.neutralDegrees&&Math.abs(pitch)<=C.neutralDegrees&&Math.abs(roll)<=C.neutralDegrees)return 'center';
  // Down and diagonal movements have no command. Hysteresis reduces edge jitter.
  if(pitch< -C.neutralDegrees)return null;
  if(Math.abs(yaw)<=C.verticalYawLimit&&pitch>=(previous==='green'?C.pitchExit:C.pitchEnter))return 'green';
  if(Math.abs(pitch)<=C.horizontalPitchLimit){
    if(yaw>=(previous==='yellow'?C.yawExit:C.yawEnter))return 'yellow';
    if(yaw<= -(previous==='red'?C.yawExit:C.yawEnter))return 'red';
  }
  return null;
}
export class NeutralCalibration {
  constructor(){this.restart();this.done=false;}
  restart(){this.reference=null;this.samples=[];this.elapsed=0;this.last=null;}
  observe(o,time){
    if(this.done)return;
    if(!o.valid){this.restart();return;}
    if(this.reference&&(rotationDistance(o.pose,this.reference)>C.neutralStabilityDegrees||!positionMatches(o.pose,this.reference)))this.restart();
    this.reference??=o.pose;
    const dt=this.last===null?0:time-this.last;this.last=time;
    if(dt<0||dt>C.freshnessMs){this.restart();return;}
    this.elapsed+=dt;
    if(this.elapsed>=C.settleMs)this.samples.push(o.pose);
    if(this.elapsed>=C.settleMs+C.sampleMs&&this.samples.length>=12){this.model={pose:this.samples[Math.floor(this.samples.length/2)]};this.done=true;}
  }
  get progress(){return Math.max(0,Math.min(1,this.elapsed/(C.settleMs+C.sampleMs)));}
}
