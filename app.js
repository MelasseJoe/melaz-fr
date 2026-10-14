(() => {
 'use strict';
 const BACKGROUND_OPACITY = 0.15;
 const OPENING = 0.9;
 const root = document.getElementById('hub-galerie');
 const page = root.querySelector('.workspace');
 const section = root;
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const source = 'assets/chevalier.png';
 const config = { opacity: BACKGROUND_OPACITY, width: 0.6, strength: 1 };
 page.style.setProperty('--bg-opacity', BACKGROUND_OPACITY);
 page.style.setProperty('--opening', OPENING);
 const paths = {
  sparkles: '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"/><path d="M20 2v4M18 4h4"/>',
  braces: '<path d="M8 3H6a2 2 0 0 0-2 2v4a3 3 0 0 1-2 3 3 3 0 0 1 2 3v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4a3 3 0 0 0 2 3 3 3 0 0 0-2 3v4a2 2 0 0 1-2 2h-2"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  waves: '<path d="M2 6c3-5 7 5 10 0s7 5 10 0M2 12c3-5 7 5 10 0s7 5 10 0M2 18c3-5 7 5 10 0s7 5 10 0"/>',
  ellipsis: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
 };
 const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.braces) + '</svg>';
 const grid = page.querySelector('.folders');
 const dialog = page.querySelector('.project-dialog');
 const projects = Array.isArray(window.HUB_PROJECTS) ? window.HUB_PROJECTS : [];
 const validURL = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const parsed = new URL(value, document.baseURI); return ['http:', 'https:', 'file:'].includes(parsed.protocol) ? value : null; } catch { return null; }
 };
 projects.forEach((project, i) => {
  const url = validURL(project.url);
  const item = document.createElement(url ? 'a' : 'button');
  if (url) item.href = url; else item.type = 'button';
  item.className = 'project';
  item.setAttribute('aria-label', (url ? 'Ouvrir ' : 'Découvrir ') + project.title);
  const preview = document.createElement('span');
  preview.className = 'folder-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML = '<span class="folder-shadow"></span><span class="folder-object" style="--angle:' + [-5,5,-3,3,-7,2][i % 6] + 'deg"><span class="book-back"></span><span class="book-pages"></span><span class="book-page"></span><span class="book-ribbon"></span><span class="book-cover"><span class="book-cover-edge"></span><span class="book-cover-bottom"></span><span class="object-icon">' + icon(project.icon) + '</span><span class="object-number">' + String(i+1).padStart(2,'0') + '</span></span></span>';
  const caption = document.createElement('span');
  caption.className = 'folder-caption';
  const label = document.createElement('span');
  label.className = 'project-label';
  const title = document.createElement('strong');
  title.textContent = project.title;
  label.append(title);
  const meta = document.createElement('span');
  meta.className = 'project-meta';
  meta.textContent = 'Dossier ' + String(i+1).padStart(3,'0') + ' · ' + (project.description || (url ? 'Explorer' : 'À venir'));
  caption.append(label, meta);
  item.append(preview, caption);
  grid.append(item);
  if (!url) item.addEventListener('click', () => { dialog.querySelector('h2').textContent = project.title; dialog.showModal(); });
  item.addEventListener('pointermove', event => {
   if (reduced.matches || event.pointerType === 'touch') return;
   const r = item.getBoundingClientRect(), x = (event.clientX-r.left)/r.width-.5, y = (event.clientY-r.top)/r.height-.5;
   const folder = item.querySelector('.folder-object');
   folder.style.setProperty('--lean-y', x*14+'deg');
   folder.style.setProperty('--lean-x', -y*10+'deg');
   item.style.setProperty('--shadow-x', x*13+'px');
  });
  item.addEventListener('pointerleave', () => {
   const folder = item.querySelector('.folder-object');
   folder.style.setProperty('--lean-y', '0deg'); folder.style.setProperty('--lean-x', '0deg'); item.style.setProperty('--shadow-x', '0px');
  });
 });
 dialog.querySelector('button').addEventListener('click', () => dialog.close());
 dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });

  const background=page.querySelector('.effect-canvas'),ctx=background.getContext('2d');
  const probe=document.createElement('span');probe.className='fx-probe';probe.setAttribute('aria-hidden','true');page.append(probe);
  const fx={x:0,y:240,tx:0,ty:240,width:0,height:0,frame:0,last:0,active:false,color:'',strength:1};
  const color=()=>{fx.color=getComputedStyle(probe).backgroundColor;};
  const drawPattern=()=>{
   if(!ctx||section.hidden)return;
   ctx.clearRect(0,0,fx.width,fx.height);ctx.strokeStyle=fx.color;ctx.lineWidth=config.width;
   const warp=(x,y)=>{
    const dx=x-fx.x,dy=y-fx.y,d=Math.hypot(dx,dy),bend=Math.exp(-d*d/(2*220*220))*8*fx.strength;
    return [x+dx/(d+70)*bend,y+dy/(d+70)*bend];
   };
   if(page.dataset.bg==='weave'){
    for(let y=-20;y<fx.height+30;y+=47){ctx.beginPath();for(let x=-20;x<fx.width+30;x+=16){const p=warp(x,y+Math.sin(x*.004+y*.002)*2.8);if(x===-20)ctx.moveTo(...p);else ctx.lineTo(...p);}ctx.stroke();}
    for(let x=-20;x<fx.width+30;x+=59){ctx.beginPath();for(let y=-20;y<fx.height+30;y+=16){const p=warp(x+Math.sin(y*.004+x*.002)*2.8,y);if(y===-20)ctx.moveTo(...p);else ctx.lineTo(...p);}ctx.stroke();}
   } else if(page.dataset.bg==='waves'){
    for(let y=19;y<fx.height+30;y+=68){ctx.beginPath();for(let x=-20;x<fx.width+30;x+=16){const dx=x-fx.x,dy=y-fx.y,d=Math.hypot(dx,dy);const bend=Math.cos(d*.011)*Math.exp(-d*d/(2*270*270))*6*fx.strength;const py=y+Math.sin(x*.004+y*.0015)*5+bend;if(x===-20)ctx.moveTo(x,py);else ctx.lineTo(x,py);}ctx.stroke();}
   } else {
    const shift=(fx.x/Math.max(1,fx.width)-.5)*2.5*fx.strength;
    for(let x=-20;x<fx.width+30;x+=32){ctx.beginPath();for(let y=-20;y<fx.height+30;y+=16){const dx=x-fx.x,dy=y-fx.y,d=Math.hypot(dx,dy);const bend=dx/(d+60)*Math.exp(-d*d/(2*260*260))*4.5*fx.strength;const px=x+Math.sin(y*.004+x*.009)*5+shift+bend;if(y===-20)ctx.moveTo(px,y);else ctx.lineTo(px,y);}ctx.stroke();}
   }
  };
  const tickBackground=now=>{
   fx.frame=0;if(section.hidden||reduced.matches)return;
   const dt=Math.min(50,fx.last?now-fx.last:16);fx.last=now;const blend=1-Math.exp(-dt/200);
   fx.x+=(fx.tx-fx.x)*blend;fx.y+=(fx.ty-fx.y)*blend;drawPattern();
   if(Math.hypot(fx.tx-fx.x,fx.ty-fx.y)>.2)fx.frame=requestAnimationFrame(tickBackground);
  };
  const wakeBackground=()=>{if(!fx.frame&&!reduced.matches&&!section.hidden)fx.frame=requestAnimationFrame(tickBackground);};
  const stage=page.querySelector('.knight-scene'),art=stage.querySelector('img'),eyeCanvas=stage.querySelector('canvas'),eyeCtx=eyeCanvas.getContext('2d');
  const eyes=[{x:512,y:556,rx:34,ry:49,angle:-.065},{x:744,y:537,rx:34,ry:47,angle:.065}];
  const gaze={x:0,y:0,tx:0,ty:0,frame:0,last:0};
  const mapping=()=>{const width=stage.clientWidth,height=stage.clientHeight,scale=Math.min(width/1280,height/1280);return {width,height,scale,ox:(width-1280*scale)/2,oy:(height-1280*scale)/2};};
  const paintEyes=()=>{
   if(!eyeCtx||section.hidden)return;const m=mapping();eyeCtx.clearRect(0,0,m.width,m.height);
   if(!art.complete||!art.naturalWidth)return;
   eyeCtx.save();eyeCtx.translate(m.ox,m.oy);eyeCtx.scale(m.scale,m.scale);
   eyes.forEach(eye=>{
    eyeCtx.save();eyeCtx.translate(eye.x,eye.y);eyeCtx.rotate(eye.angle);eyeCtx.beginPath();eyeCtx.ellipse(0,0,eye.rx,eye.ry,0,0,Math.PI*2);eyeCtx.clip();
    const x=gaze.x*11.5,y=gaze.y*11;const iris=eyeCtx.createRadialGradient(x-8,y-10,2,x,y,33);iris.addColorStop(0,'#aa815b');iris.addColorStop(.45,'#704d34');iris.addColorStop(1,'#342820');
    eyeCtx.fillStyle=iris;eyeCtx.beginPath();eyeCtx.ellipse(x,y,21.5,31,0,0,Math.PI*2);eyeCtx.fill();eyeCtx.fillStyle='#231d19';eyeCtx.beginPath();eyeCtx.ellipse(x+.5,y+1,13,22,0,0,Math.PI*2);eyeCtx.fill();
    const shine=eyeCtx.createRadialGradient(x-6,y-12,0,x-6,y-12,9);shine.addColorStop(0,'#fffaf5');shine.addColorStop(1,'#fffaf500');eyeCtx.fillStyle=shine;eyeCtx.beginPath();eyeCtx.ellipse(x-6,y-12,6.2,8.3,-.18,0,Math.PI*2);eyeCtx.fill();eyeCtx.fillStyle='#ffe9ccba';eyeCtx.beginPath();eyeCtx.ellipse(x+7,y+14,2,2.7,0,0,Math.PI*2);eyeCtx.fill();eyeCtx.restore();
   });eyeCtx.restore();
  };
  const tickEyes=now=>{
   gaze.frame=0;if(section.hidden)return;const dt=Math.min(50,gaze.last?now-gaze.last:16);gaze.last=now;const blend=1-Math.exp(-dt/65);gaze.x+=(gaze.tx-gaze.x)*blend;gaze.y+=(gaze.ty-gaze.y)*blend;paintEyes();
   if(Math.hypot(gaze.tx-gaze.x,gaze.ty-gaze.y)>.0015)gaze.frame=requestAnimationFrame(tickEyes);
  };
  const aim=(x,y)=>{gaze.tx=x;gaze.ty=y;if(reduced.matches){gaze.x=x;gaze.y=y;paintEyes();return;}if(!gaze.frame&&!section.hidden)gaze.frame=requestAnimationFrame(tickEyes);};
  page.addEventListener('pointermove',event=>{
   if(event.pointerType==='touch'||dialog.open||section.hidden)return;
   if(!reduced.matches){const r=page.getBoundingClientRect();fx.tx=event.clientX-r.left;fx.ty=event.clientY-r.top;fx.active=true;wakeBackground();}
   const r=stage.getBoundingClientRect(),m=mapping();if(!r.width)return;
   aim(Math.tanh((event.clientX-r.left-m.ox-m.scale*628)/(r.width*.9)),Math.tanh((event.clientY-r.top-m.oy-m.scale*547)/(r.height*.9)));
  });
  page.addEventListener('pointerleave',()=>{fx.active=false;fx.tx=fx.width*.74;fx.ty=240;wakeBackground();aim(0,0);});
  const resizeBackground=()=>{if(section.hidden||!page.clientWidth)return;fx.width=page.clientWidth;fx.height=page.clientHeight;const dpr=Math.min(devicePixelRatio||1,1.5);if(ctx){background.width=Math.round(fx.width*dpr);background.height=Math.round(fx.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}if(!fx.active){fx.x=fx.tx=fx.width*.74;fx.y=fx.ty=240;}color();drawPattern();};
  const resizeEyes=()=>{if(section.hidden||!stage.clientWidth)return;const m=mapping(),dpr=Math.min(devicePixelRatio||1,1.8);if(eyeCtx){eyeCanvas.width=Math.round(m.width*dpr);eyeCanvas.height=Math.round(m.height*dpr);eyeCtx.setTransform(dpr,0,0,dpr,0,0);}paintEyes();};
  new ResizeObserver(resizeBackground).observe(page);new ResizeObserver(resizeEyes).observe(stage);art.addEventListener('load',resizeEyes);art.src=source;resizeBackground();resizeEyes();
  const stop=()=>{if(fx.frame)cancelAnimationFrame(fx.frame);if(gaze.frame)cancelAnimationFrame(gaze.frame);fx.frame=gaze.frame=0;fx.active=false;gaze.x=gaze.y=gaze.tx=gaze.ty=0;};
  reduced.addEventListener('change',()=>{stop();resizeBackground();resizeEyes();});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{color();drawPattern();});

 document.addEventListener("visibilitychange",()=>{if(document.hidden)stop();else{resizeBackground();resizeEyes();}});
})();
