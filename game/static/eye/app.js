import {HEAD_CONFIG as C} from './config.js';
import {HeadSession} from './session.js';
import {CameraPipeline} from './camera.js';
import {DemoAdapter} from './adapter.js';

export function mountHeadControl({doc=document,win=window,media=navigator.mediaDevices,Pipeline=CameraPipeline,adapter=new DemoAdapter(),clock=performance}={}){
  const $=id=>doc.getElementById(id),session=new HeadSession();
  let running=false,loading=false,generation=0,frameId,toastTimer,cost=0;
  const text=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  const reasons={face:'Bring your face into view',multiple:'One person at a time',pose:'Keep your face clearly visible',distance:'Sit at a comfortable camera distance',position:'Return to your starting position',unassigned:'Face forward · this direction is unassigned','neutral-zone':'Turn a little farther, or face forward',stale:'Waiting for fresh camera frames'};
  for(const [id,t] of Object.entries(C.targets)){
    const el=$(`target-${id}`);el.classList.remove('top','left','right');el.classList.add(t.position);el.style.setProperty('--t-color',t.color);
    el.querySelector('h2').textContent=t.label;
    el.querySelector('.direction').textContent={top:'↑ TOP',left:'← LEFT',right:'RIGHT →'}[t.position];
  }
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
      if(selected)void confirm(selected);
    },
  });
  function updateButtons(){
    $('start').disabled=loading||running;$('start').textContent=loading?'Loading head tracker…':session.phase==='paused'?'Resume camera ↗':'Start camera ↗';
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
    try{
      await adapter.submitSelection(selection);
      if(current!==generation)return;
      $('lastSelection').replaceChildren();
      const dot=doc.createElement('span');dot.className='selection-dot';dot.style.background=target.color;
      const info=doc.createElement('div'),label=doc.createElement('strong'),task=doc.createElement('p');label.textContent=`${target.label} selected`;task.textContent='Demo · not sent';info.append(label,task);$('lastSelection').append(dot,info);
      $('history').replaceChildren();
      for(const item of adapter.history){
        const li=doc.createElement('li'),mark=doc.createElement('span'),name=doc.createElement('span'),time=doc.createElement('time');
        mark.className='history-dot';mark.style.background=C.targets[item.color].color;name.textContent=`${C.targets[item.color].label} · not sent`;time.dateTime=item.confirmedAt;time.textContent=new Date(item.confirmedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});li.append(mark,name,time);$('history').appendChild(li);
      }
      text('historyCount',String(adapter.history.length));text('toastTitle',`${target.label} selected`);$('toast').hidden=false;
      clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},2600);
    }catch(error){showError(`Selection was not sent: ${error.message}. Face forward before retrying.`);}
  }
  function render(){
    const now=clock.now();session.tick(now);const phase=session.phase,target=session.target;
    $('stage').classList.toggle('guiding',phase==='calibrating');
    for(const id of [...Object.keys(C.targets),'center']){
      const el=$(`target-${id}`),active=id===target;
      el.classList.toggle('active',active);
      el.style.setProperty('--progress',active?Math.min(1,session.progress):0);
    }
    $('centerProgress').style.width=`${target==='center'?Math.min(100,session.progress*100):0}%`;
    let title='Start camera',count='2s to select';
    if(loading){title='Opening camera…';count='';}
    if(phase==='calibrating'){
      title='Face forward · hold still';count=`${Math.max(0,(C.settleMs+C.sampleMs-session.calibration.elapsed)/1000).toFixed(1)}s`;
    }else if(phase==='ready'){
      title=session.selector.armed?(session.selector.candidate?`Selecting ${C.targets[session.selector.candidate].label}`:'Turn left, right, or up'):'Face forward to reset';
      count=session.selector.armed?(session.selector.candidate?`${(Math.max(0,C.dwellMs-session.selector.elapsed)/1000).toFixed(1)}s`:'2s to select'):'0.5s to reset';
    }else if(phase==='paused'&&!loading){title='Camera paused';count='';}
    text('instructionTitle',title);text('instructionCount',count);
    const angles=session.angles;
    text('centerTitle',phase==='ready'?(session.direction==='center'?'Forward':session.direction?{yellow:'Left',red:'Right',green:'Up'}[session.direction]:'—'):phase==='calibrating'?'Hold still':'—');
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
  void listCameras();updateButtons();render();
  return {session,pipeline,adapter,start,pause,recalibrate,destroy(){pause();win.cancelAnimationFrame(frameId);}};
}
if(typeof document!=='undefined')mountHeadControl();
