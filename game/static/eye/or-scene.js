// OR scene: a clipart SO-101 arm in the middle of the stage, the surgeon's hand-off point below it
// and the instrument trays (the target cards around it). Purely visual: app.js reports what the
// real robot is doing (startRun / returning / deliver / cancel) and the scene animates to match.
const NS='http://www.w3.org/2000/svg';
const STEEL='fill="url(#or-steel)" stroke="#475569" stroke-width="1.3" stroke-linejoin="round"';
const RINGS=(color='#64748b')=>`<circle cx="-37" cy="-8" r="7" fill="none" stroke="${color}" stroke-width="3"/><circle cx="-37" cy="8" r="7" fill="none" stroke="${color}" stroke-width="3"/><path d="M-30 -6 L4 0 M-30 6 L4 0" stroke="#64748b" stroke-width="3.2" stroke-linecap="round"/><path d="M-24 -3l3 3l3-3l3 3" stroke="#475569" stroke-width="1" fill="none"/>`;

// Clipart instruments, drawn lengthwise around (0,0), about 96 x 30.
export const INSTRUMENTS={
  scalpel:{name:'Scalpel',art:`<rect x="-46" y="-4.5" width="56" height="9" rx="4" ${STEEL}/><path d="M-38 -1.5h22M-38 1.5h22" stroke="#64748b" stroke-width=".8"/><path d="M10 -3.5L28 -5Q44 -5 47 2Q36 4.5 10 3.5Z" fill="#e2e8f0" stroke="#475569" stroke-width="1.3" stroke-linejoin="round"/><path d="M14 2.4Q34 3.4 45 1.6" stroke="#fff" stroke-width="1" fill="none"/>`},
  needle:{name:'Suture needle',art:`<path d="M-24 8A30 26 0 0 1 30 6" fill="none" stroke="#64748b" stroke-width="3.6" stroke-linecap="round"/><path d="M-24 8A30 26 0 0 1 30 6" fill="none" stroke="#e2e8f0" stroke-width="1.2" stroke-linecap="round"/><path d="M-24 8C-32 14 -38 4 -44 10S-48 18 -38 16" fill="none" stroke="#7c3aed" stroke-width="1.7" stroke-linecap="round"/>`},
  scissors:{name:'Scissors',art:`<circle cx="-36" cy="-8" r="7.5" fill="none" stroke="#64748b" stroke-width="3"/><circle cx="-36" cy="8" r="7.5" fill="none" stroke="#64748b" stroke-width="3"/><path d="M-29 -6L0 -1L46 -4.5L46 -1.5L0 2Z" ${STEEL}/><path d="M-29 6L0 1L46 4.5L46 1.5L0 -2Z" ${STEEL}/><circle r="2.4" fill="#334155"/>`},
  forceps:{name:'Forceps',art:`<path d="M-46 -2.5L40 -9Q46 -9 46 -6.5L-40 1Z" ${STEEL}/><path d="M-46 2.5L40 9Q46 9 46 6.5L-40 -1Z" ${STEEL}/><path d="M-6 -5.5v-2.4M0 -6v-2.4M6 -6.6v-2.4M-6 5.5v2.4M0 6v2.4M6 6.6v2.4" stroke="#64748b" stroke-width="1"/>`},
  hemostat:{name:'Hemostat',art:`${RINGS()}<path d="M4 -2.2L46 -1.2L46 1.2L4 2.2Z" ${STEEL}/><path d="M14 -1.6v3.2M20 -1.5v3M26 -1.4v2.8M32 -1.3v2.6M38 -1.2v2.4" stroke="#475569" stroke-width=".8"/><circle cx="4" r="2.6" fill="#334155"/>`},
  needleHolder:{name:'Needle holder',art:`${RINGS('#c9971c')}<path d="M4 -3.6L30 -2.8Q37 0 30 2.8L4 3.6Z" ${STEEL}/><path d="M10 -2v4M15 -2v4M20 -2v4M25 -2v4" stroke="#475569" stroke-width=".8"/><circle cx="4" r="2.6" fill="#334155"/>`},
  retractor:{name:'Retractor',art:`<rect x="-46" y="-3.5" width="64" height="7" rx="3.5" ${STEEL}/><path d="M14 -4H27Q31 -4 31 0V20H23V4H14Z" ${STEEL}/><path d="M-46 -3.5V-14H-39V-3.5" ${STEEL}/>`},
  probe:{name:'Probe',art:`<rect x="-46" y="-4" width="30" height="8" rx="3" ${STEEL}/><path d="M-40 -4v8M-34 -4v8M-28 -4v8M-22 -4v8" stroke="#64748b" stroke-width=".8"/><path d="M-16 0H41" stroke="#64748b" stroke-width="2.6" stroke-linecap="round"/><circle cx="44" r="3.6" fill="#e2e8f0" stroke="#475569" stroke-width="1.2"/>`},
  elevator:{name:'Elevator',art:`<path d="M-46 -4.5H0L6 -2V2L0 4.5H-46Z" ${STEEL}/><path d="M6 0H30" stroke="#64748b" stroke-width="3"/><ellipse cx="38" rx="10" ry="6" ${STEEL}/>`},
};

const GLOVE='#9fd3f0',GLOVE_LINE='#3a86b8';
const HAND=`<g class="or-glove">
  <rect x="-30" y="-56" width="13" height="42" rx="6.5" fill="${GLOVE}" stroke="${GLOVE_LINE}" stroke-width="2"/>
  <rect x="-15" y="-64" width="13" height="50" rx="6.5" fill="${GLOVE}" stroke="${GLOVE_LINE}" stroke-width="2"/>
  <rect x="1" y="-62" width="13" height="48" rx="6.5" fill="${GLOVE}" stroke="${GLOVE_LINE}" stroke-width="2"/>
  <rect x="16" y="-52" width="12" height="38" rx="6" fill="${GLOVE}" stroke="${GLOVE_LINE}" stroke-width="2"/>
  <rect x="-52" y="-12" width="13" height="38" rx="6.5" transform="rotate(-38 -45 7)" fill="${GLOVE}" stroke="${GLOVE_LINE}" stroke-width="2"/>
  <rect x="-32" y="-22" width="62" height="60" rx="26" fill="${GLOVE}" stroke="${GLOVE_LINE}" stroke-width="2"/>
  <path d="M-16 6q14 8 30 0" stroke="${GLOVE_LINE}" stroke-width="1.2" fill="none" opacity=".5"/>
  <rect x="-27" y="34" width="54" height="28" rx="7" fill="#3b82c4"/><path d="M-27 41h54" stroke="#2f6da6" stroke-width="2"/>
</g>`;

const ease=k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
const easeOut=k=>1-Math.pow(1-k,3);
const lerp=(a,b,k)=>a+(b-a)*k;
const lerpP=(a,b,k)=>({x:lerp(a.x,b.x,k),y:lerp(a.y,b.y,k)});
const angLerp=(a,b,k)=>a+((((b-a)%360)+540)%360-180)*k;
const deg=180/Math.PI;

export class OrScene {
  constructor({stage,targets,doc=document,win=window,onDelivered=()=>{}}){
    Object.assign(this,{stage,targets,doc,win,onDelivered});
    this.speed=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches?.35:1;
    this.mode='rest';this.previewColor=null;this.run=null;this.anim=false;this.token=0;this.pending=null;
    this.p={x:0,y:-60};this.grip=.4;this.lift=0;this.handOff=1;this.handItem=null;this.held=null;this.morph=0;
    this.rr={};this.counts={};
    for(const [color,t] of Object.entries(targets)){
      this.rr[color]=0;this.counts[color]=0;
      const el=this.tray(color);
      el.querySelector('.tray-items').textContent=t.items.map(i=>INSTRUMENTS[i].name).join(' · ');
    }
    this.svg=doc.createElementNS(NS,'svg');this.svg.classList.add('or-layer');this.svg.setAttribute('aria-hidden','true');
    stage.appendChild(this.svg);
    this.layout();
    new win.ResizeObserver(()=>this.layout()).observe(stage);
    const frame=now=>{this.tick(now);win.requestAnimationFrame(frame);};
    win.requestAnimationFrame(frame);
  }
  tray(color){return this.doc.getElementById(`target-${color}`);}
  rel(el){const s=this.stage.getBoundingClientRect(),r=el.getBoundingClientRect();return {left:r.left-s.left,top:r.top-s.top,right:r.right-s.left,bottom:r.bottom-s.top,cx:(r.left+r.right)/2-s.left,cy:(r.top+r.bottom)/2-s.top};}

  // ---- geometry ------------------------------------------------------------------------------
  layout(){
    const w=this.stage.clientWidth,h=this.stage.clientHeight;if(!w||!h)return;
    const L1=Math.max(60,Math.min(125,Math.min(w,h)*.17)),L2=L1*.9,G=38;
    Object.assign(this,{w,h,L1,L2,G,B:{x:w/2,y:h*.47}});
    const reach=L1+L2+G,rest=this.rel(this.tray('down'));
    this.H={x:w/2,y:Math.min(this.B.y+reach*.78,rest.top-70)};
    this.R={x:-reach*.24,y:-reach*.36};  // folded rest pose, gripper tip relative to the base
    // Sterile field behind the arm, drawn by the stage background so it sits under the trays.
    for(const [k,v] of Object.entries({'--fx':this.B.x,'--fy':this.B.y,'--fr':reach*1.04}))this.stage.style.setProperty(k,`${v}px`);
    this.build();
  }
  build(){
    const {w,h,L1,L2,G,B,H}=this;
    const defs=Object.entries(INSTRUMENTS).map(([id,i])=>`<g id="or-ins-${id}">${i.art}</g>`).join('');
    this.svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    this.svg.innerHTML=`<defs>
      <linearGradient id="or-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset=".55" stop-color="#b6c2cc"/><stop offset="1" stop-color="#dbe3e9"/></linearGradient>
      <filter id="or-soft" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0f2a3a" flood-opacity=".18"/></filter>
      <filter id="or-lift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow class="or-lift-shadow" dx="0" dy="3" stdDeviation="2" flood-color="#0f2a3a" flood-opacity=".25"/></filter>
      ${defs}</defs>
      <path class="or-route"/>
      <g class="or-handoff" transform="translate(${H.x} ${H.y})"><circle class="or-pad" r="54"/><text class="or-label" x="64" y="-6">SURGEON</text><text class="or-label" x="64" y="8">HAND-OFF</text></g>
      <g class="or-hand">${HAND}</g>
      <g class="or-hand-item"><use/></g>
      <g class="or-arm" filter="url(#or-soft)" transform="translate(${B.x} ${B.y})">
        <rect x="-42" y="-42" width="84" height="84" rx="16" class="or-base"/>
        <rect x="-24" y="-20" width="48" height="40" rx="7" class="or-servo"/>
        <text class="or-model" y="56">SO-101</text>
        <g class="or-link1">
          <rect x="-17" y="-17" width="${L1+34}" height="34" rx="17" class="or-link"/>
          <rect x="10" y="-4" width="${L1-20}" height="8" rx="4" class="or-stripe"/>
          <circle r="11" class="or-horn"/>
          <g class="or-link2" transform="translate(${L1} 0)">
            <rect x="-13" y="-13" width="${L2+26}" height="26" rx="13" class="or-link"/>
            <rect x="12" y="-3" width="${L2-24}" height="6" rx="3" class="or-stripe"/>
            <rect x="-19" y="-16" width="38" height="32" rx="6" class="or-servo"/><circle r="7" class="or-horn"/>
            <g class="or-wrist" filter="url(#or-lift)">
              <rect x="-15" y="-14" width="32" height="28" rx="5" class="or-servo"/>
              <path d="M12 -14H40L52 -7.5V-3H22V-6H12Z" class="or-jaw"/>
              <g class="or-held"><use/></g>
              <g class="or-movjaw"><path d="M12 6H22V3H52V7.5L40 14H12Z" class="or-jaw"/></g>
              <circle cx="4" r="5" class="or-horn"/>
            </g>
          </g>
        </g>
      </g>
      <g class="or-free"></g><g class="or-fx"></g>`;
    const q=s=>this.svg.querySelector(s);
    this.el={link1:q('.or-link1'),link2:q('.or-link2'),wrist:q('.or-wrist'),movjaw:q('.or-movjaw'),held:q('.or-held'),
      hand:q('.or-hand'),handItem:q('.or-hand-item'),route:q('.or-route'),free:q('.or-free'),fx:q('.or-fx'),liftShadow:q('.or-lift-shadow')};
    this.setRoute(this.run&&this.mode==='work'?this.run.color:null);
    this.draw();
  }
  // Two-link IK for the gripper tip (the gripper counts as part of the forearm).
  solve(p){
    const a=this.L1,b=this.L2+this.G;
    let d=Math.hypot(p.x,p.y)||1;d=Math.max(Math.abs(a-b)+4,Math.min(a+b-.5,d));
    const c2=Math.max(-1,Math.min(1,(d*d-a*a-b*b)/(2*a*b))),t2=Math.acos(c2);
    const t1=Math.atan2(p.y,p.x)-Math.atan2(b*Math.sin(t2),a+b*Math.cos(t2));
    return {t1,t2};
  }
  tipWorld(){
    const {t1,t2}=this.solve(this.p),ta=t1+t2,s=1+.12*this.lift,{L1,L2,G,B}=this;
    return {x:B.x+L1*Math.cos(t1)+(L2+G*s)*Math.cos(ta),y:B.y+L1*Math.sin(t1)+(L2+G*s)*Math.sin(ta),rot:ta*deg+90,scale:.8*s};
  }
  dropPoint(color){
    const r=this.rel(this.tray(color)),{B}=this;
    const x=Math.max(r.left,Math.min(r.right,B.x)),y=Math.max(r.top,Math.min(r.bottom,B.y));
    const dx=r.cx-x,dy=r.cy-y,n=Math.hypot(dx,dy)||1;
    return {x:x+dx/n*30-B.x,y:y+dy/n*30-B.y};
  }
  setRoute(color){
    if(!this.el)return;
    if(!color){this.el.route.classList.remove('on');return;}
    const d=this.dropPoint(color),{H,B}=this,end={x:B.x+d.x,y:B.y+d.y};
    const mid={x:(H.x+end.x)/2,y:(H.y+end.y)/2},ctrl={x:mid.x+(mid.x-B.x)*.6,y:mid.y+(mid.y-B.y)*.6};
    this.el.route.setAttribute('d',`M${H.x} ${H.y}Q${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`);
    this.el.route.style.setProperty('--route',this.targets[color].color);
    this.el.route.classList.add('on');
  }

  // ---- drawing -------------------------------------------------------------------------------
  tick(now){
    if(!this.el)return;
    if(!this.anim){
      const t=now/1000,{R}=this;let goal=R,grip=.45,lift=0;
      if(this.mode==='work'){goal={x:this.H.x-this.B.x+Math.sin(t*2.1)*10,y:this.H.y-this.B.y-30+Math.cos(t*1.7)*6};grip=.1;lift=.45+Math.sin(t*2.6)*.15;}
      else if(this.mode==='preview'&&this.previewColor){const d=this.dropPoint(this.previewColor);goal=lerpP(R,d,.32);grip=.25;lift=.25;}
      else goal={x:R.x+Math.sin(t*1.3)*2.5,y:R.y+Math.cos(t*1.1)*2};
      this.p=lerpP(this.p,goal,.08);this.grip=lerp(this.grip,grip,.08);this.lift=lerp(this.lift,lift,.08);
    }
    this.draw();
  }
  draw(){
    const {t1,t2}=this.solve(this.p),s=1+.12*this.lift;
    this.el.link1.setAttribute('transform',`rotate(${t1*deg})`);
    this.el.link2.setAttribute('transform',`translate(${this.L1} 0) rotate(${t2*deg})`);
    this.el.wrist.setAttribute('transform',`translate(${this.L2} 0) scale(${s})`);
    this.el.movjaw.setAttribute('transform',`rotate(${(1-this.grip)*26} 14 8)`);
    this.el.liftShadow.setAttribute('dy',String(3+this.lift*9));this.el.liftShadow.setAttribute('stdDeviation',String(2+this.lift*3));
    this.el.held.style.display=this.held?'':'none';
    if(this.held){this.el.held.firstChild.setAttribute('href',`#or-ins-${this.held}`);this.el.held.setAttribute('transform',`translate(${this.G} 0) rotate(90) scale(.8)`);}
    const off=this.handOff*90,{H}=this;
    this.el.hand.setAttribute('transform',`translate(${H.x} ${H.y+off})`);this.el.hand.style.opacity=String(1-this.handOff);
    this.el.handItem.style.display=this.handItem?'':'none';
    if(this.handItem){
      let x=H.x+2,y=H.y-6+off,rot=-28,sc=.95;
      if(this.morph>0){const tip=this.tipWorld(),k=this.morph;x=lerp(x,tip.x,k);y=lerp(y,tip.y,k);rot=angLerp(rot,tip.rot,k);sc=lerp(sc,tip.scale,k);}
      this.el.handItem.firstChild.setAttribute('href',`#or-ins-${this.handItem}`);
      this.el.handItem.setAttribute('transform',`translate(${x} ${y}) rotate(${rot}) scale(${sc})`);
      this.el.handItem.style.opacity=String(this.morph>0?1:1-this.handOff);
    }
  }

  // ---- animation helpers ---------------------------------------------------------------------
  tween(ms,fn,token=this.token){
    return new Promise(resolve=>{
      const t0=performance.now(),dur=ms*this.speed;
      const step=now=>{
        if(token!==this.token)return resolve(false);
        const k=Math.min(1,(now-t0)/dur);fn(k);
        if(k<1)this.win.requestAnimationFrame(step);else resolve(true);
      };
      this.win.requestAnimationFrame(step);
    });
  }
  moveTo(to,ms,arc=.2,extra=()=>{}){
    const from={...this.p},mid={x:(from.x+to.x)/2,y:(from.y+to.y)/2},n=Math.hypot(mid.x,mid.y)||1,dist=Math.hypot(to.x-from.x,to.y-from.y);
    const c={x:mid.x+mid.x/n*arc*dist,y:mid.y+mid.y/n*arc*dist};
    return this.tween(ms,k=>{const e=ease(k),u=1-e;this.p={x:u*u*from.x+2*u*e*c.x+e*e*to.x,y:u*u*from.y+2*u*e*c.y+e*e*to.y};extra(e);});
  }
  nextItem(color){const items=this.targets[color].items;return items[this.rr[color]++%items.length];}
  burst(x,y,color){
    const g=this.doc.createElementNS(NS,'g');this.el.fx.appendChild(g);
    const dots=Array.from({length:12},(_,i)=>{const c=this.doc.createElementNS(NS,'circle');c.setAttribute('r','3.5');c.setAttribute('fill',i%3?color:'#ffffff');c.setAttribute('stroke',color);g.appendChild(c);return {c,a:i/12*Math.PI*2+Math.random()*.3,v:28+Math.random()*26};});
    const ring=this.doc.createElementNS(NS,'circle');ring.setAttribute('fill','none');ring.setAttribute('stroke',color);ring.setAttribute('stroke-width','3');g.appendChild(ring);
    const check=this.doc.createElementNS(NS,'path');check.setAttribute('d','M-9 0l6 6l12-13');check.setAttribute('class','or-check');check.setAttribute('stroke',color);g.appendChild(check);
    const t0=performance.now(),dur=900*this.speed;
    const step=now=>{
      const k=Math.min(1,(now-t0)/dur),e=easeOut(k);
      for(const d of dots){d.c.setAttribute('cx',String(x+Math.cos(d.a)*d.v*e));d.c.setAttribute('cy',String(y+Math.sin(d.a)*d.v*e));d.c.style.opacity=String(1-k);}
      ring.setAttribute('cx',String(x));ring.setAttribute('cy',String(y));ring.setAttribute('r',String(8+44*e));ring.style.opacity=String(1-k);
      check.setAttribute('transform',`translate(${x} ${y-4-18*e}) scale(${.6+.6*Math.min(1,k*3)})`);check.style.opacity=String(k<.7?1:(1-k)/.3);
      if(k<1)this.win.requestAnimationFrame(step);else g.remove();
    };
    this.win.requestAnimationFrame(step);
  }
  place(color,item,fx=true){
    const tray=this.tray(color),bed=tray.querySelector('.tray-bed');
    const icon=this.doc.createElementNS(NS,'svg');icon.setAttribute('viewBox','-50 -22 100 44');icon.classList.add('tray-ins');
    const use=this.doc.createElementNS(NS,'use');use.setAttribute('href',`#or-ins-${item}`);icon.appendChild(use);
    if(fx)icon.classList.add('new');
    bed.appendChild(icon);while(bed.children.length>6)bed.firstChild.remove();
    this.counts[color]++;
    tray.querySelector('.tray-count').textContent=`${this.counts[color]} returned`;
    if(fx){tray.classList.remove('received');void tray.offsetWidth;tray.classList.add('received');setTimeout(()=>tray.classList.remove('received'),1300);}
    this.pending=null;
  }
  interrupt(){
    this.token++;this.anim=false;
    if(this.pending)this.place(this.pending.color,this.pending.item,false);
    this.el?.free.replaceChildren();this.held=null;this.morph=0;
  }

  // ---- what the real robot is doing ----------------------------------------------------------
  preview(color){
    if(this.anim||this.mode==='work')return;
    this.previewColor=color;this.mode=color?'preview':'rest';
  }
  // The arm is handling an instrument for `color`: it waits over the surgeon's hand.
  startRun(color){
    this.interrupt();
    for(const c of Object.keys(this.targets))this.tray(c).classList.toggle('destination',c===color);
    const item=this.nextItem(color);this.run={color,item};this.handItem=item;this.mode='work';this.setRoute(color);
    const from=this.handOff;void this.tween(600,k=>{this.handOff=lerp(from,0,easeOut(k));});
  }
  returning(){this.mode='rest';this.setRoute(null);}
  cancel(){
    this.interrupt();this.run=null;this.mode='rest';this.setRoute(null);this.handItem=null;this.handOff=1;
    for(const c of Object.keys(this.targets))this.tray(c).classList.remove('destination');
  }
  // The arm is back at rest: show it picking the instrument out of the hand and placing it in its tray.
  async deliver(color){
    this.interrupt();
    const token=this.token,run=this.run?.color===color?this.run:{color,item:this.nextItem(color)};
    this.anim=true;this.mode='rest';this.setRoute(null);this.handItem=run.item;this.pending=run;
    const ok=()=>token===this.token,{B,H}=this;
    const hover={x:H.x-B.x,y:H.y-B.y-34},grab={x:H.x-B.x+2,y:H.y-B.y-6};
    const hand0=this.handOff,g0=this.grip,l0=this.lift;
    if(!await this.moveTo(hover,900,.15,e=>{this.handOff=lerp(hand0,0,e);this.grip=lerp(g0,0,e);this.lift=lerp(l0,.5,e);})||!ok())return;
    if(!await this.tween(360,k=>{const e=ease(k);this.p=lerpP(hover,grab,e);this.lift=lerp(.5,0,e);})||!ok())return;
    if(!await this.tween(320,k=>{const e=ease(k);this.grip=e;this.morph=e;})||!ok())return;
    this.held=run.item;this.handItem=null;this.morph=0;
    void this.tween(700,k=>{this.handOff=easeOut(k);},token);
    if(!await this.tween(320,k=>{const e=ease(k);this.p={x:grab.x,y:grab.y-24*e};this.lift=e;})||!ok())return;
    const drop=this.dropPoint(color);
    if(!await this.moveTo(drop,1400,.38)||!ok())return;
    if(!await this.tween(300,k=>{this.lift=lerp(1,.15,ease(k));})||!ok())return;
    // Release: the instrument drops out of the gripper and settles into the tray bed.
    const tip=this.tipWorld();this.held=null;
    const item=this.doc.createElementNS(NS,'g'),use=this.doc.createElementNS(NS,'use');use.setAttribute('href',`#or-ins-${run.item}`);item.appendChild(use);this.el.free.appendChild(item);
    const bed=this.rel(this.tray(color).querySelector('.tray-bed')),to={x:bed.cx,y:bed.cy};
    void this.tween(260,k=>{this.grip=1-ease(k);},token);
    const settled=await this.tween(620,k=>{
      const e=easeOut(k),hop=Math.sin(k*Math.PI)*-22;
      item.setAttribute('transform',`translate(${lerp(tip.x,to.x,e)} ${lerp(tip.y,to.y,e)+hop}) rotate(${angLerp(tip.rot,0,e)}) scale(${lerp(tip.scale,.6,e)})`);
    });
    item.remove();if(!settled||!ok())return;
    this.place(color,run.item);this.burst(to.x,to.y,this.targets[color].color);this.onDelivered(color,run.item);
    this.tray(color).classList.remove('destination');
    await this.moveTo(this.R,1000,.1,e=>{this.lift=lerp(.15,0,e);this.grip=lerp(0,.45,e);});
    if(ok()){this.anim=false;this.run=null;}
  }
}
