import {HEAD_CONFIG as C} from './config.js';
import {HeadSession} from './session.js';
import {CameraPipeline} from './camera.js';
import {RobotAdapter} from './adapter.js';
import {OrScene,INSTRUMENTS} from './or-scene.js';

export function mountHeadControl({doc=document,win=window,media=navigator.mediaDevices,Pipeline=CameraPipeline,adapter=new RobotAdapter(),clock=performance}={}){
  const $=id=>doc.getElementById(id),session=new HeadSession();
  let running=false,loading=false,generation=0,frameId,toastTimer,pollTimer,cost=0,robot=null,sending=false,pollSeq=0,lastState=null,runColor=null;
  const robotBusy=()=>sending||['running','returning'].includes(robot?.state);
  const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  const reasons={face:'Bring your face into view',multiple:'One person at a time',pose:'Keep your face clearly visible',distance:'Sit at a comfortable camera distance',position:'Return to your starting position',unassigned:'Face forward · this direction is unassigned','neutral-zone':'Turn a little farther, or face forward',stale:'Waiting for fresh camera frames',locked:'Robot is running · only DOWN works'};
  for(const [id,t] of Object.entries(C.targets)){
    const el=$(`target-${id}`);el.classList.remove('top','left','right');el.classList.add(t.position);el.style.setProperty('--t-color',t.color);
    el.querySelector('h2').textContent=t.label;
    el.querySelector('.direction').textContent={top:'↑ LOOK UP',left:'← LOOK LEFT',right:'LOOK RIGHT →'}[t.position];
  }
  const showToast=(title,detail)=>{text('toastTitle',title);text('toastDetail',detail);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},3200);};
  const scene=win.ResizeObserver?new OrScene({doc,win,stage:$('stage'),targets:C.targets,
    onDelivered:(color,item)=>showToast(`${INSTRUMENTS[item].name} returned`,`Placed in the ${C.targets[color].category.toLowerCase()} tray`)}):null;
  const showError=message=>{$('error').hidden=!message;text('error',message);};
  const pipeline=new Pipeline($('camera'),{
    media,
    onReady:()=>{loading=false;running=true;session.begin();$('cameraPlaceholder').hidden=true;void listCameras();updateButtons();},
    onError:error=>{
      loading=running=false;session.pause();$('cameraPlaceholder').hidden=false;
      const messages={NotAllowedError:'Camera permission was denied. Allow camera access for localhost in your browser, then try again.',NotFoundError:'No camera was found. Connect a webcam and try again.',NotReadableError:'The camera is busy. Close other apps using it and try again.'};
      showError(messages[error.name]||error.message||'The camera could not start.');updateButtons();
    },
    onObservation:(o,time,receivedAt,ms)=>{
      if(!running)return;cost=ms;
      const selected=session.observe(o,time,receivedAt);
      if(selected==='down')void stopRobot();
      else if(selected)void confirm(selected);
    },
  });
  function updateButtons(){
    $('start').disabled=loading||running;
    $('start').textContent=loading?'Loading head tracker…':session.phase==='paused'?'Resume camera ↗':'Start camera ↗';
    $('pause').disabled=!running&&!loading;$('recalibrate').disabled=!running;$('cameraDevice').disabled=loading;
  }
  async function listCameras(){
    try{
      const devices=await media?.enumerateDevices();if(!devices)return;
      const selected=$('cameraDevice').value;
      $('cameraDevice').replaceChildren();const initial=doc.createElement('option');initial.value='';initial.textContent='Default laptop camera';$('cameraDevice').appendChild(initial);
      devices.filter(d=>d.kind==='videoinput').forEach((d,i)=>{const option=doc.createElement('option');option.value=d.deviceId;option.textContent=d.label||`Camera ${i+1}`;$('cameraDevice').appendChild(option);});
      $('cameraDevice').value=selected;
    }catch{/* camera start will provide actionable errors */}
  }
  async function start(){
    if(running||loading)return;
    if(!win.isSecureContext){showError('Open http://localhost:8000/head-control on this laptop, or use HTTPS for camera access.');return;}
    if(!media?.getUserMedia){showError('This browser cannot access the webcam. Try a current Chrome or Safari browser.');return;}
    generation++;showError('');loading=true;updateButtons();
    await pipeline.start($('cameraDevice').value);
  }
  function pause(message='Camera paused. Resume to capture your forward position again.'){
    generation++;pipeline.stop();running=loading=false;session.pause();$('cameraPlaceholder').hidden=false;
    clearTimeout(toastTimer);$('toast').hidden=true;updateButtons();
  }
  function recalibrate(){if(!running)return;generation++;showError('');session.begin();clearTimeout(toastTimer);$('toast').hidden=true;}
  async function confirm(color){
    const current=generation,target=C.targets[color];
    const selection={id:win.crypto.randomUUID(),color,task:target.task,confirmedAt:new Date().toISOString()};
    sending=adapter.robot;syncMode();
    try{
      const result=await adapter.submitSelection(selection).finally(()=>{sending=false;});
      if(result.robot){robot=result.robot;renderRobot();pollRobot();}
      if(current!==generation)return;
      const sent=adapter.robot?'Sent to robot':'Demo · not sent';
      $('lastSelection').replaceChildren();
      const dot=doc.createElement('span');dot.className='selection-dot';dot.style.background=target.color;
      const info=doc.createElement('div'),label=doc.createElement('strong'),task=doc.createElement('p');label.textContent=`${target.label} tray`;task.textContent=sent;info.append(label,task);$('lastSelection').append(dot,info);
      $('history').replaceChildren();
      for(const item of adapter.history){
        const li=doc.createElement('li'),mark=doc.createElement('span'),name=doc.createElement('span'),time=doc.createElement('time');
        mark.className='history-dot';mark.style.background=C.targets[item.color].color;name.textContent=`${C.targets[item.color].label} · ${item.status}`;time.dateTime=item.confirmedAt;time.textContent=new Date(item.confirmedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});li.append(mark,name,time);$('history').appendChild(li);
      }
      text('historyCount',String(adapter.history.length));
      showToast(`${target.category} tray selected`,adapter.robot?'The arm is taking the instrument · look down once it is in the tray':'Demo command ready · not sent');
    }catch(error){showError(`Selection was not sent: ${error.message}. Face forward to choose again.`);syncMode();}
  }
  // Colors only while the arm is at rest; only DOWN while it runs, so a marker can't be picked
  // mid-run; nothing while a selection is being sent or the arm is returning.
  function syncMode(){
    session.setAllowed(sending||robot?.state==='returning'?[]:robot?.state==='running'?['down']:Object.keys(C.targets));
  }
  const robotLabels={idle:'At rest',running:'Working',returning:'Returning to rest',error:'Needs attention'};
  function renderRobot(){
    if(!adapter.robot)return;
    const color=robot?.color&&C.targets[robot.color];
    text('robotState',robot?(robot.state==='running'&&color?`To ${color.label} tray`:robotLabels[robot.state]||robot.state):'Not connected');
    text('robotMessage',robot?.message||'');
    // Mirror the real arm in the OR scene; once it is back at rest, animate the delivery.
    const state=robot?.state??null;
    if(scene&&state!==lastState){
      if(state==='running')scene.startRun(robot.color);
      else if(state==='returning')scene.returning();
      else if(state==='idle'&&runColor&&['running','returning'].includes(lastState))void scene.deliver(runColor);
      else if(state==='error')scene.cancel();
    }
    if(state==='running')runColor=robot.color;
    lastState=state;
    syncMode();updateButtons();
  }
  async function pollRobot(){
    clearTimeout(pollTimer);
    if(!adapter.robot)return;
    const seq=++pollSeq;
    let status=null;try{status=await adapter.status();}catch{/* shown as not connected */}
    if(seq!==pollSeq)return;  // a newer poll took over
    robot=status;renderRobot();
    // Poll quickly while the arm is moving, slowly while it is at rest.
    pollTimer=setTimeout(pollRobot,robotBusy()?700:4000);
  }
  async function stopRobot(){
    if(robot?.state!=='running')return;
    robot={...robot,state:'returning'};renderRobot();
    showToast('Sending the arm to rest','The return animation plays once it is back');
    try{robot=await adapter.stop();}catch(error){showError(`Could not stop the robot: ${error.message}`);}
    renderRobot();pollRobot();
  }
  function render(){
    const now=clock.now();session.tick(now);const phase=session.phase,target=session.target;
    $('stage').classList.toggle('guiding',phase==='calibrating');
    for(const id of [...Object.keys(C.targets),'down','center']){
      const el=$(`target-${id}`),active=id===target;
      el.classList.toggle('active',active);
      if(id!=='center')el.classList.toggle('disabled',!session.selector.allowed.has(id));
      el.style.setProperty('--progress',active?Math.min(1,session.progress):0);
    }
    $('centerProgress').style.width=`${target==='center'?Math.min(100,session.progress*100):0}%`;
    let title='Start camera',count='2s to select';
    if(loading){title='Opening camera…';count='';}
    if(phase==='calibrating'){
      title='Face forward · hold still';count=`${Math.max(0,(C.settleMs+C.sampleMs-session.calibration.elapsed)/1000).toFixed(1)}s`;
    }else if(phase==='ready'){
      const {armed,candidate,elapsed}=session.selector,stopping=robot?.state==='running';
      if(robotBusy()&&!stopping){title=sending?'Sending to the robot…':'Arm is returning to rest';count='';}
      else if(stopping){
        title=!armed?'Face forward, then look down to send the arm to rest':candidate==='down'?'Sending the arm to rest':'Arm is returning the instrument · look down once it is in the tray';
        count=armed?(candidate==='down'?`${(Math.max(0,C.dwellMs-elapsed)/1000).toFixed(1)}s`:'2s to stop'):'0.5s to reset';
      }else{
        title=armed?(candidate?`Selecting the ${C.targets[candidate].category.toLowerCase()} tray`:'Look at the tray this instrument belongs in'):'Face forward to reset';
        count=armed?(candidate?`${(Math.max(0,C.dwellMs-elapsed)/1000).toFixed(1)}s`:'2s to select'):'0.5s to reset';
      }
    }else if(!loading&&robot?.state==='running'){title='Camera off · start it, then look down to send the arm to rest';count='';
    }else if(phase==='paused'&&!loading){title='Camera paused';count='';}
    text('instructionTitle',title);text('instructionCount',count);
    scene?.preview(phase==='ready'&&!robotBusy()&&session.selector.armed&&C.targets[session.selector.candidate]?session.selector.candidate:null);
    const angles=session.angles;
    text('centerTitle',phase==='ready'?(session.direction==='center'?'Forward':session.direction?{yellow:'Left',red:'Right',green:'Up',down:'Down'}[session.direction]:'—'):phase==='calibrating'?'Hold still':'—');
    text('centerHint',angles?`${Math.abs(angles.yaw).toFixed(0)}° ${angles.yaw>=0?'left':'right'} · ${Math.abs(angles.pitch).toFixed(0)}° ${angles.pitch>=0?'up':'down'}`:'');
    const status=!running?(loading?'Loading tracker…':'Camera off'):reasons[session.reason]||'Head tracked';
    text('trackingStatus',status);$('statusDot').classList.toggle('good',running&&!session.reason);
    text('latency',running?`${Math.round(cost)} ms`:'—');
    frameId=win.requestAnimationFrame(render);
  }
  $('start').onclick=start;$('pause').onclick=()=>pause();$('recalibrate').onclick=recalibrate;
  $('previewToggle').onclick=()=>{const collapsed=$('preview').classList.toggle('collapsed');$('previewToggle').setAttribute('aria-expanded',String(!collapsed));text('previewToggle',collapsed?'Show preview':'Hide preview');};
  $('cameraDevice').onchange=()=>{pause();showError('');};
  win.addEventListener('resize',()=>{if(running)recalibrate();});
  win.addEventListener('pagehide',()=>pause());
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&(running||loading))pause();});
  media?.addEventListener?.('devicechange',()=>void listCameras());
  void listCameras();updateButtons();render();void pollRobot();
  return {session,pipeline,adapter,start,pause,recalibrate,destroy(){pause();clearTimeout(pollTimer);win.cancelAnimationFrame(frameId);}};
}
if(typeof document!=='undefined')mountHeadControl();
