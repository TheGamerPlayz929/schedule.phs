/* Read-only rendering surface for the actual student-site components. */
window.PhsStudentWidget=true;
const widgetParams=new URLSearchParams(location.search);
const widgetReducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let widgetTitleAnimation=null;
function finishWidgetTitleReveal(){widgetTitleAnimation?.cancel();widgetTitleAnimation=null;}
const setWidgetTheme=theme=>{document.documentElement.dataset.widgetTheme=theme==='light'?'light':'dark';};
setWidgetTheme(widgetParams.get('theme'));
document.documentElement.dataset.widgetDesign=widgetParams.get('design')==='atlas'?'atlas':'default';
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==widgetParams.get('parentOrigin'))return;
  if(event.data?.type==='phs:student-theme')setWidgetTheme(event.data.theme);
  if(event.data?.type==='phs:student-motion'){
    document.documentElement.dataset.widgetMotion=event.data.paused?'paused':'playing';
    if(event.data.paused)finishWidgetTitleReveal();
  }
});
widgetReducedMotion.addEventListener('change',()=>{if(widgetReducedMotion.matches)finishWidgetTitleReveal();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishWidgetTitleReveal();});
document.documentElement.dataset.widgetPanel=['today','clock'].includes(widgetParams.get('panel'))?widgetParams.get('panel'):'weather';
window.addEventListener('DOMContentLoaded',()=>{
  // Texture the existing live progress arc. Its geometry and timing remain owned by main.js.
  if(document.documentElement.dataset.widgetDesign==='atlas'){
    // Observe the real renderer's title; never derive a second current period.
    const title=document.getElementById('hero-title');
    if(title&&document.documentElement.dataset.widgetPanel==='clock'){
      const readTitle=()=>title.textContent.trim().replace(/\s+/g,' ');
      let previous=readTitle(),hasTitle=Boolean(previous&&!/^[—–-]$/.test(previous));
      new MutationObserver(()=>{
        const next=readTitle();if(next===previous)return;
        const shouldReveal=hasTitle&&next&& !/^[—–-]$/.test(next);
        previous=next;if(next&&!/^[—–-]$/.test(next))hasTitle=true;
        finishWidgetTitleReveal();
        if(!shouldReveal||widgetReducedMotion.matches||document.hidden||document.documentElement.dataset.widgetMotion==='paused')return;
        if(typeof title.animate==='function')widgetTitleAnimation=title.animate([
          {clipPath:'inset(-0.12em 100% -0.12em -0.12em)'},
          {clipPath:'inset(-0.12em -0.12em -0.12em -0.12em)'}
        ],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
      }).observe(title,{childList:true,characterData:true,subtree:true});
    }
    const svg=document.querySelector('.progress-ring'),defs=svg?.querySelector('defs');
    if(defs){
      const ns='http://www.w3.org/2000/svg',pattern=document.createElementNS(ns,'pattern');
      pattern.id='studio-ring-grain';pattern.setAttribute('patternUnits','userSpaceOnUse');pattern.setAttribute('width','3.5');pattern.setAttribute('height','3.5');
      const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx','1.75');dot.setAttribute('cy','1.75');dot.setAttribute('r','1');dot.setAttribute('fill','white');pattern.append(dot);
      const mask=document.createElementNS(ns,'mask');mask.id='studio-ring-material';mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width','220');mask.setAttribute('height','220');
      const rect=document.createElementNS(ns,'rect');rect.setAttribute('width','220');rect.setAttribute('height','220');rect.setAttribute('fill','url(#studio-ring-grain)');mask.append(rect);defs.append(pattern,mask);
      document.getElementById('ring-fill')?.setAttribute('mask','url(#studio-ring-material)');
    }
  }
  let queued=false;
  const notify=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{
    queued=false;
    const parentOrigin=widgetParams.get('parentOrigin');
    try{const target=new URL(parentOrigin);if(!['http:','https:'].includes(target.protocol))return;
      parent.postMessage({type:'phs:student-widget',height:Math.ceil(document.querySelector('.hero').getBoundingClientRect().height)},target.origin);
    }catch{}
  });};
  new ResizeObserver(notify).observe(document.querySelector('.hero'));
  window.addEventListener('load',notify);notify();
});
