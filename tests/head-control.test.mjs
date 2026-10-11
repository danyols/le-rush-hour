import assert from 'node:assert/strict';
import {HEAD_CONFIG as C} from '../game/static/eye/config.js';
import {extractObservation,relativeAngles,classifyHead,NeutralCalibration} from '../game/static/eye/head-core.js';
import {DwellSelector} from '../game/static/eye/dwell.js';
import {HeadSession} from '../game/static/eye/session.js';
import {DemoAdapter} from '../game/static/eye/adapter.js';
const r=d=>d*Math.PI/180;
function pose(yaw=0,pitch=0,roll=0){
 const y=r(yaw),p=r(pitch),z=r(roll),cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p),cz=Math.cos(z),sz=Math.sin(z);
 // Rz * Ry * Rx(-pitch), stored as columns, matching unmirrored MediaPipe output.
 const columns=[[cz*cy,sz*cy,-sy],[-cz*sy*sp-sz*cp,-sz*sy*sp+cz*cp,-cy*sp],[cz*sy*cp-sz*sp,sz*sy*cp+cz*sp,cy*cp]];
 return {columns,x:.5,y:.5,scale:.4};
}
const neutral=pose();
function result(p=neutral){const landmarks=Array.from({length:478},(_,i)=>({x:i%2?.3:.7,y:i%2?.3:.7,z:0}));return {faceLandmarks:[landmarks],facialTransformationMatrixes:[{rows:4,columns:4,data:[...p.columns[0].map(x=>x*1.2),0,...p.columns[1].map(x=>x*1.2),0,...p.columns[2].map(x=>x*1.2),0,3,4,-40,1]}]};}
for(const [id,p] of [['center',neutral],['yellow',pose(16)],['red',pose(-16)],['green',pose(0,14)]]){
 const o=extractObservation(result(p));assert.equal(o.valid,true);assert.equal(classifyHead(relativeAngles(o.pose,neutral)),id,`correct column-major direction: ${id}`);
}
let face=result();face.faceLandmarks[0].splice(468);assert.equal(extractObservation(face).valid,true,'iris landmarks are not needed');
face.faceLandmarks[0][159]=face.faceLandmarks[0][145];assert.equal(extractObservation(face).valid,true,'blinking is not a direction signal');
assert.equal(extractObservation({...face,faceLandmarks:[...face.faceLandmarks,...face.faceLandmarks]}).reason,'multiple');
assert.equal(extractObservation({...face,facialTransformationMatrixes:[]}).reason,'pose');
const invalid=result();invalid.facialTransformationMatrixes[0].data[0]=NaN;assert.equal(extractObservation(invalid).valid,false);
assert.equal(classifyHead(relativeAngles(pose(0,-15),neutral)),null,'down is unassigned');
assert.equal(classifyHead(relativeAngles(pose(20,20),neutral)),null,'diagonal is ambiguous');
assert.equal(classifyHead(relativeAngles(pose(0,0,25),neutral)),null,'roll is not a command');
assert.equal(classifyHead(relativeAngles(pose(45),neutral)),null);
assert.equal(classifyHead(relativeAngles(pose(3,2),neutral)),'center');
assert.equal(classifyHead(relativeAngles(pose(10),neutral)),null);
assert.equal(classifyHead(relativeAngles(pose(10),neutral),'yellow'),'yellow','exit threshold prevents edge jitter');
const tilted=pose(8,6);const same=relativeAngles(tilted,tilted);assert.ok(Math.abs(same.yaw)<1e-8&&Math.abs(same.pitch)<1e-8,'comfortable neutral orientation is subtracted');
const cal=new NeutralCalibration();for(let t=0;t<800;t+=60)cal.observe({valid:true,pose:neutral},t);cal.observe({valid:true,pose:pose(15)},850);assert.equal(cal.elapsed,0,'movement restarts neutral capture');
cal.observe({valid:false},900);assert.equal(cal.reference,null);

let time=0;const s=new HeadSession();s.begin();
const feed=(p,ms)=>{let selected=null;for(let i=0;i<ms;i+=60){time+=60;selected=s.observe({valid:true,pose:p},time,time+10)||selected;}return selected;};
feed(neutral,1620);assert.equal(s.phase,'ready','one neutral hold replaces four-point setup and check');
feed(neutral,600);assert.equal(s.selector.armed,true);
feed(pose(16),1800);assert.equal(s.selector.candidate,'yellow');assert.ok(s.selector.elapsed<2000);
assert.equal(feed(pose(16),500),'yellow');assert.equal(feed(pose(16),3000),null,'holding cannot repeat');
feed(neutral,800);assert.equal(feed(pose(-16),2300),'red');
feed(neutral,800);assert.equal(feed(pose(0,14),2300),'green');
feed(neutral,800);feed(pose(16),800);feed(pose(0,-15),60);assert.equal(s.selector.elapsed,0,'down immediately clears progress');
assert.equal(feed(pose(0,-15),4000),null);
feed(neutral,800);feed(pose(-16),800);s.tick(time+300);assert.equal(s.selector.elapsed,0,'stale stream clears progress');
time+=400;s.observe({valid:false,reason:'face'},time,time);assert.equal(s.direction,null);
feed(neutral,800);feed(pose(16),600);s.observe({valid:false,reason:'multiple'},time+=60,time);assert.equal(s.selector.elapsed,0);
s.pause();assert.equal(feed(pose(16),3000),null);s.begin();assert.equal(s.model,null);
const d=new DwellSelector();for(let t=0;t<=600;t+=50)d.observe('center',t);for(let t=650;t<=1500;t+=50)d.observe('red',t);d.observe('red',1550,1900);assert.equal(d.elapsed,0);d.observe('yellow',1500,1900);assert.equal(d.lastTime,1550);
const adapter=new DemoAdapter();const cmd={id:'one',color:'green',task:C.targets.green.task,confirmedAt:new Date().toISOString()};assert.equal((await adapter.submitSelection(cmd)).status,'not sent');await adapter.submitSelection(cmd);assert.equal(adapter.history.length,1);
console.log('PASS: matrix layout/scale, user-left/right/up mapping, eye-independent extraction, neutral setup stability, head thresholds/hysteresis, downward rejection, dwell, rearm, staleness and demo-only adapter.');
