import { dateWindow, calendarWindow, countSportDays, mondayFor, validDate, bridgeDays, seriesSummary } from './core.mjs';
import { TempoStore } from './store.mjs';

(() => {
 const root=document.getElementById('tempo-app');
 const now=new Date();
 const parisParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Paris'}).formatToParts(now).map(p=>[p.type,p.value]));
 let {end,start,yearEnd,days}=dateWindow(parisParts.year+'-'+parisParts.month+'-'+parisParts.day);
 let selectedPeriod='recent';
 const dayMS=86400000;
 const store=new TempoStore();
 let active=new Set(),ready=false,mutating=false,syncGeneration=0,syncInFlight=false;
 const networkStatus=(message,retry=false)=>{const box=root.querySelector('.sync-status');if(!box)return;box.hidden=!message;box.querySelector('span').textContent=message;box.querySelector('button').hidden=!retry;};
 const iso=d=>d.toISOString().slice(0,10);
 const format=d=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(d);
 const monthNames=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
 const palettes=[{"name": "Objets graphiques", "theme": "dark", "colors": {"bg": "#171d1c", "panel": "#222c29", "ink": "#edf6f1", "muted": "#acbeb4", "line": "#35483f", "empty": "#222c29", "active": "#8de0bb", "accent": "#8de0bb", "accent-ink": "#17221d"}, "mix": 23, "marker": "space", "insight": 2}];
 const configs=palettes.map(p=>({...p,cls:'tempo',brand:'tempo',title:'On tombe, on réessaye.',subtitle:'La semaine devant toi. L’année en perspective.',layout:'week',chart:'months'}));
 const yearMarkup=()=>'<div class="year-panel"><nav class="period-nav" aria-label="Choisir une période"></nav><div class="period-summary" aria-live="polite"><span class="period-label">13 mois glissants</span><span class="period-total"></span></div><canvas class="heatmap" role="img" aria-label="Calendrier de treize mois glissants"></canvas></div>';
 const insightsMarkup=()=>'<div class="insights" aria-label="Ton rythme en deux regards">'+[['pulse','Le pouls','Sur les 28 derniers jours'],['thread','Le fil','Série actuelle · 3 jours de sport par semaine']].map(([key,title,detail])=>'<article class="insight '+key+'" aria-label="'+title+'"><div class="insight-copy"><div class="insight-value" data-insight-value="'+key+'"></div><p class="insight-detail" data-insight-detail="'+key+'">'+detail+'</p></div><div class="insight-visual"><canvas class="insight-canvas" data-insight-chart="'+key+'" role="img" aria-label="'+title+'"></canvas><div class="insight-caption" data-insight-caption="'+key+'"></div></div></article>').join('')+'</div>';

 const views=[];
 root.querySelectorAll('section').forEach((section,index)=>{
  const config=configs[index];
  const page=document.createElement('div');page.className='fit '+config.cls;page.setAttribute('aria-label',config.name+' — Tempo');section.append(page);page.style.colorScheme=config.theme;Object.entries(config.colors).forEach(([key,value])=>page.style.setProperty('--'+key,value));page.style.setProperty('--bridge','color-mix(in srgb,var(--active) '+config.mix+'%,var(--empty))');
  const body='<div class="week-days" aria-label="Cette semaine"></div>'+yearMarkup();
  page.innerHTML='<div class="screen-content"><a class="hub-return" href="../../" aria-label="Retour au hub"><span aria-hidden="true">←</span>Hub</a><div class="intro"><div><h1>'+config.title+'</h1></div></div><div class="sync-status" role="status" aria-live="polite"><span>Chargement de tes séances…</span><button type="button" hidden>Réessayer</button></div>'+body+insightsMarkup()+'<span class="message" aria-live="polite"></span></div>';
  const canvas=page.querySelector('.heatmap'),ctx=canvas.getContext('2d');
  const probes={};['ink','muted','empty','active','bridge','line','accent-ink','bg'].forEach(token=>{const p=document.createElement('span');p.className='probe';p.style.background='var(--'+token+')';page.append(p);probes[token]=p;});
  page.dataset.marker=config.marker;page.dataset.insight=config.insight;
  const state={background:config.colors.bg,squares:config.colors.active,radius:config.cls==='pause'?6:config.cls==='swiss'||config.cls==='sprint'||config.cls==='bloc'||config.cls==='atlas'?1:3,hits:[]};
  const colours=()=>Object.fromEntries(Object.entries(probes).map(([k,p])=>[k,getComputedStyle(p).backgroundColor]));
  const shortDate=d=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',timeZone:'UTC',...(d.getUTCFullYear()!==end.getUTCFullYear()?{year:'numeric'}:{})}).format(d);
  const sportLabel=n=>n===1?'jour de sport':'jours de sport';
  const totalLabel=n=>n===1?'jour au total':'jours au total';
  const drawInsights=()=>{
   const ordered=[...active].filter(k=>k<=iso(end)).sort();
   const total=ordered.length;
   if(!ready){page.querySelectorAll('.insight-value').forEach(el=>el.textContent='—');page.querySelectorAll('.insight-detail,.insight-caption').forEach(el=>el.textContent='');return;}
   const recentStart=new Date(+end-27*dayMS);
   const recent=ordered.filter(k=>k>=iso(recentStart)).length;
   const {current:chain,record,currentDuration,recordDuration,currentWeeks,recordWeeks,currentStart,currentEnd,recordStart,recordEnd,thisWeekCount}=seriesSummary(active,iso(end));
   const best=record.length;
   const viewStart=chain.length?new Date(Math.max(+new Date(currentStart),+new Date(currentEnd)-27*dayMS)):end;
   const chainEnd=chain.length?new Date(currentEnd):end;
   const sequence=Array.from({length:Math.max(1,Math.round((chainEnd-viewStart)/dayMS)+1)},(_,i)=>new Date(+viewStart+i*dayMS));
   page.querySelector('[data-insight-value="pulse"]').innerHTML=recent+'<small>/ 28 jours</small>';
   page.querySelector('[data-insight-value="thread"]').innerHTML='<span class="series-label">Série en cours · '+currentWeeks+' sem.</span><div class="series-numbers"><div><b>'+chain.length+'</b><span>'+sportLabel(chain.length)+'</span></div><div><b>'+currentDuration+'</b><span>'+totalLabel(currentDuration)+'</span></div></div>';

   page.querySelector('[data-insight-detail="pulse"]').textContent='Du '+shortDate(recentStart)+' au '+shortDate(end);
   page.querySelector('[data-insight-detail="thread"]').innerHTML='<span class="series-label">Meilleure série · '+recordWeeks+' sem.</span><span class="series-numbers"><span><b>'+best+'</b><span>'+sportLabel(best)+'</span></span><span><b>'+recordDuration+'</b><span>'+totalLabel(recordDuration)+'</span></span></span><span class="series-dates">'+(record.length?shortDate(new Date(recordStart))+' — '+shortDate(new Date(recordEnd)):'Aucune série enregistrée')+'</span>';

   page.querySelector('[data-insight-caption="pulse"]').textContent='';
   page.querySelector('[data-insight-caption="thread"]').textContent=chain.length?(shortDate(new Date(currentStart))+' — '+shortDate(chainEnd)):'Aucune série en cours';


   const colors=colours();
   page.querySelectorAll('.insight-canvas').forEach(chart=>{
    const key=chart.dataset.insightChart,W=chart.clientWidth,H=parseFloat(getComputedStyle(chart).height);
    if(!W)return;const context=chart.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2);
    chart.width=Math.round(W*dpr);chart.height=Math.round(H*dpr);context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,W,H);
    context.font='14px "DM Sans",sans-serif';context.textBaseline='middle';
    const line=(points,color,width=1.7)=>{if(!points.length)return;context.beginPath();points.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.strokeStyle=color;context.lineWidth=width;context.lineJoin='round';context.stroke();};
    const dot=(x,y,r,color)=>{context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fillStyle=color;context.fill();};
    const label=(text,x,y,align='left',color=colors.muted)=>{context.textAlign=align;context.fillStyle=color;context.fillText(text,x,y);};
    if(key==='pulse'&&config.insight===2){
     const cx=W/2,cy=H/2,R=Math.min(W/2-20,H/2-16),segment=Math.PI*2/28;
     for(let i=0;i<28;i++){const date=new Date(+recentStart+i*dayMS);context.beginPath();context.arc(cx,cy,R,-Math.PI/2+i*segment+.035,-Math.PI/2+(i+1)*segment-.035);context.strokeStyle=active.has(iso(date))?colors.active:colors.line;context.lineWidth=6;context.lineCap='round';context.stroke();}
     context.font='500 44px "Space Grotesk",sans-serif';label(Math.round(recent/28*100)+' %',cx,cy-14,'center',colors.ink);
     context.font='18px "DM Sans",sans-serif';label('de jours avec sport',cx,cy+26,'center');
     chart.setAttribute('aria-label',recent+' '+sportLabel(recent)+' sur les 28 derniers jours. Anneau de 28 segments, un par jour.');
    }else if(key==='thread'){
     const cx=W/2,R=Math.min(W/2-22,H-80),cy=(H+R)/2-15;context.beginPath();context.arc(cx,cy,R,Math.PI,Math.PI*2);context.strokeStyle=colors.line;context.lineWidth=1.5;context.stroke();
     if(!chain.length){label('Cette semaine : '+thisWeekCount+' / 3 jours',cx,cy+28,'center');}
     else{
      sequence.forEach((d,i)=>{const a=Math.PI+i/(sequence.length-1||1)*Math.PI;dot(cx+Math.cos(a)*R,cy+Math.sin(a)*R,active.has(iso(d))?5.5:3,active.has(iso(d))?colors.active:colors.bridge);});label('Cette semaine : '+thisWeekCount+' / 3 jours',cx,cy+28,'center');
     }
     chart.setAttribute('aria-label','Série actuelle : '+chain.length+' '+sportLabel(chain.length)+' sur '+currentDuration+' '+totalLabel(currentDuration)+'. Meilleure série : '+best+' '+sportLabel(best)+' sur '+recordDuration+' '+totalLabel(recordDuration)+'. Au moins trois jours de sport du lundi au dimanche valident une semaine. Une semaine terminée sous ce seuil coupe le fil.');
    }
   });
  };

  const draw=()=>{
   if(section.hidden||!ctx||!canvas.clientWidth)return;
   drawInsights();
   const monday=new Date(+start-((start.getUTCDay()+6)%7)*dayMS),weeks=Math.ceil((Math.round((yearEnd-monday)/dayMS)+1)/7);
   const bridges=bridgeDays(active,iso(end));const w=canvas.clientWidth,c=colours(),bands=w>=660?1:w>=440?2:3,columns=Math.ceil(weeks/bands),left=36,pitch=Math.min(22,(w-left-4-(config.marker==='space'?60:0))/columns),size=Math.max(3,pitch-1.8),rowPitch=Math.max(18,Math.min(22,(w-left-4)/columns)*1.3),block=44+rowPitch*7+24,h=bands*block-10,dpr=Math.min(devicePixelRatio||1,2);
   canvas.style.height=h+'px';canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);state.hits=[];ctx.font=(w>=660?'12':'11')+'px "Space Grotesk",sans-serif';ctx.textBaseline='middle';

   for(let band=0;band<bands;band++){
    const y0=band*block+42;ctx.fillStyle=c.muted;['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach((name,i)=>ctx.fillText(name,0,y0+i*rowPitch+size/2));
    let lastMonth=-1,lastLabelX=-100;const bandDate=new Date(Math.max(+start,+monday+band*columns*7*dayMS)),bandMonth=bandDate.getUTCFullYear()*12+bandDate.getUTCMonth();
    for(let column=0;column<columns;column++){
     const week=band*columns+column;if(week>=weeks)continue;
     for(let row=0;row<7;row++){
      const d=new Date(+monday+(week*7+row)*dayMS);if(d<start||d>yearEnd)continue;
      const x=left+column*pitch+(config.marker==='space'?(d.getUTCFullYear()*12+d.getUTCMonth()-bandMonth)*4+(d.getUTCFullYear()-bandDate.getUTCFullYear())*12:0),y=y0+row*rowPitch,future=d>end,played=active.has(iso(d));
      const inSeries=bridges.has(iso(d));ctx.fillStyle=played?c.active:inSeries?c.bridge:c.empty;ctx.globalAlpha=future?.35:1;ctx.beginPath();ctx.roundRect(x,y,size,size,Math.min(state.radius,size/2));ctx.fill();if(!played&&!inSeries){ctx.strokeStyle=c.line;ctx.lineWidth=.55;ctx.stroke();}ctx.globalAlpha=1;
      if(!future)state.hits.push({x,y,width:size,height:size,date:iso(d)});
      if(d.getUTCMonth()!==lastMonth&&x-lastLabelX>28){ctx.fillStyle=c.muted;const label=monthNames[d.getUTCMonth()],labelX=Math.min(x,w-ctx.measureText(label).width);ctx.fillText(label,labelX,y0-15);if(d.getUTCMonth()===0||lastMonth===-1){ctx.save();ctx.fillStyle=c.ink;ctx.fillText(String(d.getUTCFullYear()),labelX,y0-31);ctx.restore();}lastMonth=d.getUTCMonth();lastLabelX=labelX;}
     }
    }
   }
  };
  const toggleDay=async key=>{
   if(mutating||!ready||!validDate(key)||key<'2000-01-01'||key>iso(end))return;
   const on=!active.has(key);
   const focusedDay=page.querySelector('.week-day:focus')?.dataset.date;
   mutating=true;syncGeneration++;
   root.setAttribute('aria-busy','true');updateAll();
   networkStatus('');
   page.querySelector('.message').textContent='Enregistrement…';
   try{
    await store.setDay(key,on);
    if(on)active.add(key);else active.delete(key);
    networkStatus('');
    page.querySelector('.message').textContent=format(new Date(key+'T00:00:00Z'))+' · '+(on?'séance enregistrée':'séance retirée');
   }catch(error){networkStatus(error.message,true);}
   finally{
    mutating=false;root.removeAttribute('aria-busy');updateAll();
    if(focusedDay)page.querySelector('.week-day[data-date="'+focusedDay+'"]').focus({preventScroll:true});
   }
  };
  canvas.addEventListener('click',event=>{const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;const hit=state.hits.find(p=>x>=p.x-1.5&&x<=p.x+p.width+1.5&&y>=p.y-1.5&&y<=p.y+p.height+1.5);if(hit)toggleDay(hit.date);});
  const update=()=>{
   const nav=page.querySelector('.period-nav'),currentYear=end.getUTCFullYear();
   const earliest=Math.min(currentYear-4,selectedPeriod==='recent'?currentYear-4:Number(selectedPeriod),...[...active].map(key=>Number(key.slice(0,4))));
   const periods=['recent',...Array.from({length:currentYear-Math.max(2000,earliest)},(_,i)=>String(currentYear-i-1))];
   if(nav.dataset.periods!==periods.join(',')){
    nav.dataset.periods=periods.join(',');
    nav.innerHTML=periods.map(period=>'<button type="button" data-period="'+period+'" aria-pressed="false">'+(period==='recent'?'13 mois':period)+'</button>').join('');
    nav.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
     selectedPeriod=button.dataset.period;
     ({end,start,yearEnd,days}=calendarWindow(iso(end),selectedPeriod));updateAll();
    }));
   }
   nav.querySelectorAll('button').forEach(button=>{button.disabled=!ready;button.setAttribute('aria-pressed',String(button.dataset.period===selectedPeriod));});
   const label=selectedPeriod==='recent'?'13 mois glissants':selectedPeriod;
   const count=countSportDays(active,{start,yearEnd,end});
   page.querySelector('.period-label').textContent=label;
   page.querySelector('.period-total').textContent=ready?count+' '+sportLabel(count):'—';
   canvas.setAttribute('aria-label','Calendrier '+(selectedPeriod==='recent'?'de treize mois glissants':'de l’année '+selectedPeriod)+', du '+format(start)+' au '+format(yearEnd)+'. '+count+' '+sportLabel(count)+'. Lignes de lundi à dimanche. Menthe : sport ; teinte légère : repos dans une semaine validée.');
   const week=page.querySelector('.week-days');if(week){const bridges=bridgeDays(active,iso(end));week.innerHTML=Array.from({length:7},(_,i)=>{const d=new Date(+mondayFor(end)+i*dayMS),key=iso(d),sport=active.has(key),inSeries=bridges.has(key);return '<button type="button" class="week-day cursor-interaction '+(sport?'is-active':inSeries?'is-bridge':'')+'" data-date="'+key+'" aria-label="'+format(d)+(sport?', sport':inSeries?', pause dans la série':', hors série')+'" '+(d>end||!ready||mutating?'disabled':'')+'><span class="weekday">'+['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][i]+'</span><b>'+d.getUTCDate()+'</b><span class="day-status">'+(sport?'Sport':inSeries?'Pause':'—')+'</span></button>';}).join('');week.querySelectorAll('button:not([disabled])').forEach(button=>button.addEventListener('click',()=>toggleDay(button.dataset.date)));}
   draw();
  };
  views.push({update,draw,section});
  const chartObserver=new ResizeObserver(draw);chartObserver.observe(canvas);page.querySelectorAll('.insight-canvas').forEach(el=>chartObserver.observe(el));
  new MutationObserver(()=>{if(!section.hidden)draw();}).observe(section,{attributes:true,attributeFilter:['hidden']});

 });
 const updateAll=()=>views.forEach(v=>v.update());
 updateAll();
 async function sync(silent=false){
  if(mutating||syncInFlight)return;
  syncInFlight=true;const generation=syncGeneration;
  if(!silent)networkStatus('Chargement de tes séances…');
  try{
   const data=await store.load();if(generation!==syncGeneration||mutating)return;
   const changed=!ready||JSON.stringify([...active].sort())!==JSON.stringify([...new Set(data.days)].sort())||data.today!==iso(end);
   active=new Set(data.days);({end,start,yearEnd,days}=calendarWindow(data.today,selectedPeriod));ready=true;
   if(changed)updateAll();networkStatus('');
  }catch(error){if(generation===syncGeneration)networkStatus(error.message,true);}
  finally{syncInFlight=false;}
 }
 root.querySelector('.sync-status button').addEventListener('click',()=>sync());
 window.addEventListener('focus',()=>sync(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){sync(true);}});
 window.addEventListener('online',()=>sync(true));
 setInterval(()=>{if(!document.hidden)sync(true);},30000);
 sync();
 document.fonts?.ready.then(()=>views.forEach(v=>v.draw()));
})();
