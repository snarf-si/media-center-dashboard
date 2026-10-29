'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],B=document.body;
const DRY=new URLSearchParams(location.search).has('dry');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(p,b){const r=await fetch('/api/'+p,b?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(DRY?{...b,dryRun:true}:b)}:{});if(r.status===401){location.reload();throw new Error('Please log in again.')}const d=await r.json().catch(()=>({error:'Bad reply ('+r.status+')'}));if(!r.ok)throw new Error(d.error||'Something went wrong');return d}
const gb=b=>b==null?'':b>=1e12?(b/1e12).toFixed(1)+' TB':b>=1e9?(b/1e9).toFixed(1)+' GB':Math.max(1,Math.round(b/1e6))+' MB';
const say=(t,ok)=>{const m=$('#msg');m.textContent=t||'';m.className='msg '+(ok?'m-ok':'m-err')};
function seg(id,fn){$$(id+' [role=tab]').forEach(b=>b.onclick=e=>{e.preventDefault();setSeg(id,b.dataset.v);fn(b.dataset.v)})}
function setSeg(id,v){$$(id+' [role=tab]').forEach(x=>x.setAttribute('aria-selected',x.dataset.v===v))}
function tab(t){if(t==='library'){t='status';setView('lib')}else if(t==='status'&&window.__libtab){setView('st')}window.__libtab=false;B.dataset.tab=t;const cur=t==='status'&&typeof VIEW!=='undefined'&&VIEW==='lib'?'library':t;$$('.tabs button').forEach(x=>x.setAttribute('aria-current',x.dataset.t===cur?'page':'false'))}
$$('.tabs button').forEach(b=>b.onclick=()=>{if(b.dataset.t==='status'&&VIEW==='lib'){setView('st')}tab(b.dataset.t)});
const pl=(n,w)=>n+' '+w+(n===1?'':'s');
const mobile=()=>matchMedia('(max-width:760px)').matches;

/* ---------- 1. Find ---------- */
let SC='all',sel=null,opts={},items=[];
let BY='title';const PH={title:'Type a title',actor:'Type an actor, like Tom Hanks',director:'Type a director, like Greta Gerwig'};
seg('#by',v=>{BY=v;$('#q').placeholder=PH[v];$('#ql').textContent=v==='title'?'Search titles':'Search by '+v;B.classList.toggle('bypeople',v!=='title');if($('#q').value.trim())run()});
seg('#scope',v=>{SC=v;run()});$('#sf').onsubmit=e=>{e.preventDefault();run()};
const posterHTML=(x,lg)=>`<span class="poster${lg?' lg':''}${x.poster?'':' none'}" aria-hidden="true">${x.poster?`<img src="${esc(x.poster)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('none');this.replaceWith(document.createElement('i'))">`:'<i></i>'}</span>`;
const meta=x=>[x.type==='tv'?'TV':'Movie',x.year,x.type==='tv'&&x.seasons?x.seasons+' season'+(x.seasons===1?'':'s'):'',x.status&&x.type==='tv'?x.status[0].toUpperCase()+x.status.slice(1):''].filter(Boolean).join(' · ');
const badge=x=>x.inLibrary&&x.type==='tv'&&x.epFiles!=null&&(x.epFiles<x.epCount||!x.epFiles)?`<span class="tag">${x.epFiles?'In library, '+(x.epCount-x.epFiles)+' missing':'Added, none downloaded'}</span>`:x.inLibrary?(x.monitored?'<span class="tag lime">In library</span>':'<span class="tag">In library</span>'):'<span class="tag">New</span>';
async function run(){if(BY!=='title')return runPeople();const q=$('#q').value.trim(),R=$('#res');
 if(SC!=='lib'&&!q)return recs();
 $('#rc').textContent='Searching';R.setAttribute('aria-busy','true');R.innerHTML='<li><div class="sk"></div><div class="sk"></div><div class="sk"></div></li>';
 try{const types=SC==='tv'?['tv']:SC==='movie'?['movie']:['tv','movie'];
  const got=await Promise.allSettled(types.map(t=>api((SC==='lib'?'library?type=':'search?type=')+t+(SC==='lib'?'':'&q='+encodeURIComponent(q))).then(a=>a.map(x=>({...x,type:t})))));
  const ok=got.filter(g=>g.status==='fulfilled').flatMap(g=>g.value),bad=got.filter(g=>g.status==='rejected');
  if(!ok.length&&bad.length)throw bad[0].reason;
  items=SC==='lib'?ok.filter(x=>!q||x.title.toLowerCase().includes(q.toLowerCase())):ok;
  if(SC==='all'){const tv=items.filter(x=>x.type==='tv'),mv=items.filter(x=>x.type==='movie');items=[];for(let i=0;i<Math.max(tv.length,mv.length);i++){if(tv[i])items.push(tv[i]);if(mv[i])items.push(mv[i])}}
  R.removeAttribute('aria-busy');$('#rc').textContent=items.length?pl(items.length,'result'):'No results';
  if(!items.length){R.innerHTML=`<li class="ib"><b>${SC==='lib'?(q?'Nothing in your library matches '+esc(q):'Your library is empty'):'No matches for '+esc(q)}</b><p>${SC==='lib'?'Try Everything to search for new titles.':'Check the spelling or try fewer words. My library shows what you already have.'}</p></li>`;return}
  R.innerHTML=(bad.length?'<li class="st-inline">Some results are missing: '+esc(bad[0].reason.message)+'</li>':'')+items.map((x,i)=>`<li><button class="r${sel&&sel.type===x.type&&sel.title===x.title&&sel.year===x.year?' sel':''}" data-i="${i}">${posterHTML(x)}<span><b>${esc(x.title)}</b><small>${esc(meta(x))}</small></span>${badge(x)}</button></li>`).join('');
  $$('#res .r').forEach(b=>b.onclick=()=>{$$('#res .r').forEach(r=>r.classList.remove('sel'));b.classList.add('sel');choose(items[+b.dataset.i]);if(mobile())tab('do')});
  if(SC!=='lib')avail(items);
 }catch(e){R.removeAttribute('aria-busy');$('#rc').textContent='Search did not work';R.innerHTML=`<li class="ib" role="alert"><span class="big err" aria-hidden="true">!</span><b>Search did not work</b><p>${esc(e.message)}</p><button class="primary" id="rTry">Try again</button></li>`;$('#rTry').onclick=run}}

/* availability in linked sources (Prowlarr), cached 6h server side, checked lazily 4 at a time */
let AVG=0;const AVC={};
async function avail(list){const g=++AVG,R=$('#res'),lis=$$('#res .r');let no=0,yes=0,err=0,pend=0,libc=0;
 const mark=(i,v)=>{const b=lis[i];if(!b)return;const li=b.parentNode;li.dataset.av=v;let t=b.querySelector('.av');if(!t){t=document.createElement('span');t.className='av';b.querySelector('span:not(.poster)').appendChild(t)}t.textContent=v==='yes'?'Available':v==='lib'?'In your library':''};
 const todo=[];list.forEach((x,i)=>{if(x.inLibrary){mark(i,'lib');libc++;return}const k=x.type+':'+(x.tmdbId||x.tvdbId||x.title);if(AVC[k]){mark(i,AVC[k]);AVC[k]==='yes'?yes++:no++}else{mark(i,'chk');pend++;todo.push([i,k,x])}});
 const foot=()=>{let f=$('#avt');if(!f){f=document.createElement('li');f.id='avt';f.className='avt';R.appendChild(f)}
  if(pend){f.innerHTML=`<div class="sk avsk"></div><small>Checking ${pend} more with your sources</small>`}
  else if(!yes){f.innerHTML=`<div class="ib"><b>Nothing ${libc?'new ':''}available from your sources yet</b><p>${err?'Some titles could not be checked. ':''}Only titles your linked sources can download are shown.</p><button class="primary" id="avSrc">Open Sources</button></div>`;$('#avSrc').onclick=openIx}
  else f.innerHTML=err?`<small>${err} could not be checked and are hidden.</small>`:'';
  if(BY==='title')$('#rc').textContent=pend?'Checking with your sources':pl(yes+libc,'title')};
 foot();
 for(let j=0;j<todo.length;j+=4){if(g!==AVG)return;const part=todo.slice(j,j+4);
  try{const r=await api('avail',{items:part.map(([i,k,x])=>({key:k,type:x.type,title:x.title,year:x.year,tmdbId:x.tmdbId,tvdbId:x.tvdbId}))});if(g!==AVG)return;
   for(const [i,k] of part){const v=r[k];const s2=!v||v.error?'err':v.n>0?'yes':'no';if(s2!=='err')AVC[k]=s2;mark(i,s2);pend--;s2==='yes'?yes++:s2==='no'?no++:err++}}
  catch{if(g!==AVG)return;for(const [i] of part){mark(i,'err');pend--;err++}}foot()}}
async function recs(){const R=$('#res'),g=++AVG;const types=SC==='tv'?['tv']:SC==='movie'?['movie']:['movie','tv'];$('#rc').textContent='Recommended';R.innerHTML='<li><div class="sk"></div><div class="sk"></div></li>';
 try{const got=await Promise.all(types.map(t=>api('recs?type='+t).then(d=>({...d,items:d.items.map(x=>({...x,type:t}))}))));if(g!==AVG)return;
  const at=Math.min(...got.map(d=>d.at));let it=[];const L=Math.max(...got.map(d=>d.items.length));for(let i=0;i<L;i++)for(const d of got)if(d.items[i])it.push(d.items[i]);it=it.slice(0,12);
  const hr=Math.round((Date.now()-at)/36e5);$('#rc').textContent='Recommended · Updated '+(hr<1?Math.max(1,Math.round((Date.now()-at)/6e4))+' min ago':hr+' hr ago');
  R.innerHTML=it.length?'<li class="st-inline">Popular in your sources right now. Tap one to look it up.</li>'+it.map((x,i)=>`<li><button class="r" data-k="${i}"><span class="poster none" aria-hidden="true"><i></i></span><span><b>${esc(x.title)}</b><small>${esc([x.type==='tv'?'TV':'Movie',x.year,pl(x.releases,'release')].filter(Boolean).join(' · '))}</small></span><span class="tag">${x.type==='tv'?'TV':'Movie'}</span></button></li>`).join(''):'<li class="ib"><b>No recommendations yet</b><p>Type a title and press Search.</p></li>';
  $$('#res [data-k]').forEach(b=>b.onclick=()=>{const x=it[+b.dataset.k];$('#q').value=x.title+(x.year?' '+x.year:'');run()})}
 catch(e){if(g!==AVG)return;$('#rc').textContent='';R.innerHTML=`<li class="ib"><b>Find something to watch</b><p>Type a title and press Search, or open My library.</p></li>`}}

async function runPeople(){const q=$('#q').value.trim(),R=$('#res');if(!q){R.innerHTML='<li class="ib"><b>Search by '+BY+'</b><p>Type a name and press Search to see their movies and shows.</p></li>';return}
 $('#rc').textContent='Searching';R.setAttribute('aria-busy','true');R.innerHTML='<li><div class="sk"></div><div class="sk"></div><div class="sk"></div></li>';
 try{const d=await api('people?role='+BY+'&q='+encodeURIComponent(q));R.removeAttribute('aria-busy');
  items=(d.items||[]).filter(x=>SC==='tv'?x.type==='tv':SC==='movie'?x.type==='movie':true).map(x=>({...x,fromPerson:true}));
  if(!d.person||!items.length){$('#rc').textContent='No results';R.innerHTML=`<li class="ib"><b>No ${esc(BY==='director'?'directing':'acting')} credits found for ${esc(q)}</b><p>Check the spelling, or use the full name.</p></li>`;return}
  $('#rc').textContent=d.person.name+': '+pl(items.length,'title')+' · '+(d.source==='TMDB'?'from TMDB':'from Wikidata and TVmaze')+(d.partial?' (some sources did not answer)':'');
  R.innerHTML=items.map((x,i)=>`<li><button class="r" data-i="${i}">${posterHTML(x)}<span><b>${esc(x.title)}</b><small>${esc([x.type==='tv'?'TV':'Movie',x.year,x.role].filter(Boolean).join(' · '))}</small></span><span class="tag">${x.type==='tv'?'TV':'Movie'}</span></button></li>`).join('');
  $$('#res .r').forEach(b=>b.onclick=async()=>{$$('#res .r').forEach(r=>r.classList.remove('sel'));b.classList.add('sel');const x=items[+b.dataset.i];
   try{const term=x.type==='tv'?(x.tvdbId?'tvdb:'+x.tvdbId:x.title):'tmdb:'+x.tmdbId;let r=await api('search?type='+x.type+'&q='+encodeURIComponent(term));
    if(x.type==='tv'&&!x.tvdbId)r=r.filter(y=>!x.year||y.year===x.year);if(!r.length)throw new Error('Could not find '+x.title+' in your '+(x.type==='tv'?'TV':'movie')+' app');
    choose({...r[0],type:x.type});if(mobile())tab('do')}catch(e){say(e.message);if(mobile())tab('do')}});avail(items)}
 catch(e){R.removeAttribute('aria-busy');$('#rc').textContent='Search did not work';R.innerHTML=`<li class="ib" role="alert"><span class="big err" aria-hidden="true">!</span><b>People search did not work</b><p>${esc(e.message)}</p><button class="primary" id="rTry">Try again</button></li>`;$('#rTry').onclick=run}}

/* ---------- 2. Do ---------- */
let PANEL='add',PM='seasons',EP=[],SS=new Set(),ES=new Set(),epFor=null,okTimer=0,anchor=null,OPEN=new Set(),focusS=null;
const AH={add:'Add: put it in your library as wanted.',sched:'Schedule: change what is wanted for a show you already have.',remove:'Remove: take it out of your library. You choose to keep or delete files.'};
const TH={all:'All: pick a simple rule, like every episode or new ones only.',seasons:'Seasons: tap season numbers or type a range.',episodes:'Episodes: open a season and tick single episodes.'};
seg('#act',v=>panel(v));
seg('#tvseg',v=>{if(v==='episodes'&&PM==='seasons'){ES=new Set(EP.filter(x=>SS.has(x.s)).map(key))}
 if(v==='seasons'&&PM==='episodes'){SS=new Set(seasonsOf().filter(s=>{const e=EP.filter(x=>x.s===s);return e.length&&e.every(x=>ES.has(key(x)))}))}
 PM=v;B.dataset.tv=v;$('#tvh').textContent=TH[v];drawPick()});
function panel(v){clearTimeout(okTimer);PANEL=v;B.dataset.panel=v;if(v!=='success')setSeg('#act',v);$('#ah').textContent=AH[v]||AH.add;say('');B.classList.remove('opts');$('#optb').setAttribute('aria-expanded','false');
 B.classList.toggle('roomy',!!sel&&(sel.type==='movie'||seasonsOf().filter(s=>s).length<=6)&&v==='add');
 if(v==='remove'){$('#ct').value='';$('#df').checked=false;remLabel();setTimeout(()=>$('#bCan').focus(),30)}drawDo()}
async function loadOpts(t){if(opts[t])return opts[t];try{opts[t]=await api('options?type='+t)}catch(e){opts[t]={profiles:[],folders:[],error:e.message}}return opts[t]}
async function choose(x){sel=x;epFor=null;EP=[];SS=new Set();ES=new Set();OPEN=new Set();anchor=null;B.classList.remove('nosel');
 B.classList.toggle('movie',x.type==='movie');B.classList.toggle('few',x.type==='tv'&&(x.seasons||0)<=6);
 $('#pk').className='pick';$('#pk').innerHTML=`${posterHTML(x).replace('class="poster','class="poster md')}<div style="min-width:0"><b>${esc(x.title)}</b><small>${esc(meta(x))}</small><span class="ov">${esc(x.overview||'')}</span></div>`;
 PM='seasons';B.dataset.tv='seasons';setSeg('#tvseg','seasons');$('#tvh').textContent=TH.seasons;
 const o=await loadOpts(x.type);$('#qp').innerHTML=o.profiles.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')||'<option value="">Not available</option>';
 $('#rf').innerHTML=o.folders.map(f=>`<option value="${esc(f.path)}">${esc(f.path)}${f.free?' ('+gb(f.free)+' free)':''}</option>`).join('')||'<option value="">Not available</option>';
 panel(x.inLibrary?(x.type==='tv'?'sched':'remove'):'add');if(x.type==='tv')loadEps()}
const seasonsOf=()=>{const s=[...new Set(EP.map(x=>x.s))];if(!s.length&&sel&&sel.seasons)for(let i=1;i<=sel.seasons;i++)s.push(i);return s.sort((a,b)=>a-b)};
const regular=()=>seasonsOf().filter(s=>s>0),key=x=>x.s+':'+x.e,sName=n=>n===0?'Specials':'Season '+n;
async function loadEps(){const k=sel.id?'id='+sel.id:'tvdbId='+sel.tvdbId;if(epFor===k)return;epFor=k;const me=sel;
 try{const d=await api('episodes?'+k);if(sel!==me)return;EP=d}catch(e){if(sel!==me)return;epFor=null;say('Could not load episodes: '+e.message);return}
 const reg=regular();if(sel.inLibrary){EP.forEach(x=>{if(x.mon)ES.add(key(x))});SS=new Set(seasonsOf().filter(s=>{const e=EP.filter(x=>x.s===s);return e.length&&e.every(x=>ES.has(key(x)))}))}else{SS=new Set(reg);EP.forEach(x=>x.s&&ES.add(key(x)))}
 if(reg.length)OPEN=new Set([reg[reg.length-1]]);B.classList.toggle('few',reg.length<=6);if(PANEL==='remove')remLabel();else if(PANEL==='success'){}else{B.classList.toggle('roomy',reg.length<=6&&PANEL==='add');drawDo()}}
const now=()=>Date.now();
function chosen(){return PM==='seasons'?EP.filter(x=>SS.has(x.s)):EP.filter(x=>ES.has(key(x)))}
function run1(set){const a=[...set].filter(s=>s>0).sort((x,y)=>x-y);if(!a.length||a.some((v,i)=>i&&v!==a[i-1]+1))return null;return[a[0],a[a.length-1]]}
const fdate=a=>a?new Date(a).toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'}):'TBA';
function whatTxt(){const loaded=EP.length>0;
 if(PM==='episodes'){const l=chosen(),k=new Set(l.map(x=>x.s)).size;return pl(l.length,'episode')+' from '+pl(k,'season')}
 const reg=regular(),sel2=[...SS].filter(s=>s>0),r=run1(SS),n=loaded?EP.filter(x=>SS.has(x.s)).length:null,ep=n==null?'':' ('+pl(n,'episode')+')',spc=SS.has(0)?' plus specials':'';
 if(sel2.length===reg.length&&reg.length>1)return(reg.length===2?'both seasons':'all '+reg.length+' seasons')+spc+ep;
 if(r&&r[0]===r[1])return 'season '+r[0]+spc+ep;
 if(r)return 'seasons '+r[0]+' to '+r[1]+spc+(n==null?'':' ('+pl(r[1]-r[0]+1,'season')+', '+pl(n,'episode')+')');
 if(!sel2.length&&SS.has(0))return 'specials'+ep;return pl(sel2.length,'season')+spc+ep}
function sentence(){if(!sel)return['',0];const T=sel.title,dn=$('#dnow').checked,no=$('#newonly').checked;
 if(sel.type==='movie')return['This will add '+T+', and '+(dn?'start downloading now.':'mark it as wanted to download later.'),0];
 if(no)return[sel.inLibrary?'This will change '+T+' to watch for new episodes only and grab each one as it airs.':'This will add '+T+' and watch for new episodes only, grabbing each one as it airs. Nothing that already aired is downloaded.',0];
 if(PM==='all'){const s=PANEL==='sched'?$('#smode'):$('#mon'),txt=s.selectedOptions[0].text.toLowerCase();
  if(PANEL==='sched')return[s.value==='none'?'This will stop watching '+T+' for new episodes.':'This will change '+T+' to want '+txt+'.',0];
  return['This will add '+T+' with '+txt+', and '+(dn?'start downloading now.':'mark them as wanted to download later.'),0]}
 const empty=PM==='seasons'?!SS.size:!ES.size;if(empty)return['Nothing picked yet. Tap a season or use All.',1];
 if(EP.length&&!chosen().length)return['Nothing selected airs from now on. Untick New episodes only or pick other seasons.',1];
 const w=whatTxt(),r=PM==='seasons'?run1(SS):null;
 if(PANEL==='sched'){if(no)return['This will change '+T+' to want new episodes only'+(r&&r[0]!==r[1]?' in seasons '+r[0]+' to '+r[1]:'')+'.',0];return['This will change '+T+' to want '+w+', and '+(dn?'start downloading now.':'download them later.'),0]}
 if(no)return['This will add '+T+' and download only new episodes'+(r&&r[0]!==r[1]?' in seasons '+r[0]+' to '+r[1]:'')+' as they air.',0];
 return['This will add '+T+', '+w+', and '+(dn?'start downloading now.':'mark them as wanted to download later.'),0]}
const NO=()=>!!sel&&sel.type==='tv'&&$('#newonly').checked;
function drawDo(){const b=$('#bAdd');const no=NO();B.classList.toggle('newonly',no);['#tvseg','.tv-all-v','.quick','#sg','#acc'].forEach(s=>{const e=$(s);if(no){e.setAttribute('inert','');e.setAttribute('aria-disabled','true')}else{e.removeAttribute('inert');e.removeAttribute('aria-disabled')}});
 $('#tvh').textContent=no?'Season and episode picks are paused while New episodes only is on.':TH[PM];
 const q=$('#qp').selectedOptions[0],f=$('#rf').value;$('#os').textContent='Quality '+(q?q.text:'-')+' · Folder '+(f||'-');
 if(!sel){b.textContent='Add';b.disabled=true;$('#res2').textContent='';return}
 if(sel.type==='tv')drawPick();
 const [s,warn]=sentence();const R=$('#res2');R.textContent=s;R.classList.toggle('warn',!!warn);
 if(no&&PANEL!=='remove'){b.textContent='Schedule download';b.title='Schedule download';b.disabled=false;return}
 if(PANEL==='sched'){b.textContent='Save schedule';b.disabled=sel.type!=='tv'||!sel.inLibrary||!!warn;if(!sel.inLibrary)say('Not in your library yet. Add it first.');else if(sel.type!=='tv')say('Schedule is for TV shows. Movies are wanted until they arrive.',1)}
 else{b.textContent='Add '+sel.title;b.title='Add '+sel.title;b.disabled=sel.inLibrary||!!warn;if(sel.inLibrary&&PANEL==='add')say('Already in your library. Use Schedule or Remove.',1)}
 if(PANEL==='remove'&&!sel.inLibrary)say('Not in your library yet. Add it first.')}
function drawPick(){const reg=regular(),all=seasonsOf();
 const r=run1(SS);$('#rfrom').value=r?r[0]:'';$('#rto').value=r?r[1]:'';$('#rfrom').placeholder=$('#rto').placeholder='-';$('#rfrom').max=$('#rto').max=reg.length?reg[reg.length-1]:1;
 const isAll=reg.length&&reg.every(s=>SS.has(s))&&!SS.has(0),lat=reg[reg.length-1];
 $('#qAll').setAttribute('aria-pressed',!!isAll);$('#qNone').setAttribute('aria-pressed',SS.size===0);$('#qLat').setAttribute('aria-pressed',SS.size===1&&SS.has(lat));
 if(PM==='seasons'){const few=B.classList.contains('few'),tl=$('#tiles'),foc=document.activeElement&&document.activeElement.classList.contains('tile')?+document.activeElement.dataset.s:null;
  const ft=focusS??foc??(r?r[0]:reg[0]);
  tl.innerHTML=reg.map(s=>`<li style="display:contents"><button class="tile${r&&r[0]!==r[1]&&(s===r[0]||s===r[1])?' edge':''}" data-s="${s}" aria-pressed="${SS.has(s)}" tabindex="${s===ft?0:-1}" aria-label="Season ${s}">${few?'Season '+s:s}</button></li>`).join('')+
   (all.includes(0)?`<li style="display:contents"><button class="tile sp" data-s="0" aria-pressed="${SS.has(0)}" tabindex="${ft===0?0:-1}" aria-label="Specials">Specials</button></li>`:'')+(reg.length?'':'<li class="hint">Loading seasons...</li>');
  if(foc!=null){const t=tl.querySelector(`[data-s="${foc}"]`);if(t)t.focus()}focusS=null}
 if(PM==='episodes'){const A=$('#acc'),st=A.scrollTop;A.innerHTML=[...all].reverse().map(s=>{const e=EP.filter(x=>x.s===s),n=e.filter(x=>ES.has(key(x))).length,o=OPEN.has(s);
   return `<div class="sea"><div class="sh"><button class="tg" data-s="${s}" aria-expanded="${o}" aria-controls="e${s}">${sName(s)}</button><span class="cnt${n?' on':''}">${n} of ${e.length}</span><label><span class="sr">Whole ${sName(s).toLowerCase()}</span><input type="checkbox" class="sa" data-s="${s}" ${n&&n===e.length?'checked':''}></label></div>`+
   (o?`<div id="e${s}" role="group" aria-label="${sName(s)} episodes">`+e.map(x=>{const fut=x.air&&Date.parse(x.air)>now();return `<label class="eprow"><input type="checkbox" data-k="${key(x)}" ${ES.has(key(x))?'checked':''}><span>E${String(x.e).padStart(2,'0')}</span><b title="${esc(x.title||'TBA')}">${esc(x.title||'TBA')}</b><em class="${fut?'soon':''}">${fdate(x.air)}</em></label>`}).join('')+'</div>':'')+'</div>'}).join('')||'<p class="hint" style="padding:12px">Loading episodes...</p>';
  A.scrollTop=st;
  $$('#acc .sa').forEach(c=>{const e=EP.filter(x=>x.s===+c.dataset.s),n=e.filter(x=>ES.has(key(x))).length;c.indeterminate=n>0&&n<e.length;c.onchange=()=>{e.forEach(x=>c.checked?ES.add(key(x)):ES.delete(key(x)));drawDo()}});
  $$('#acc .tg').forEach(b=>b.onclick=e=>{e.preventDefault();const s=+b.dataset.s;OPEN.has(s)?OPEN.delete(s):OPEN.add(s);drawDo()});
  $$('#acc .eprow input').forEach(c=>c.onchange=()=>{c.checked?ES.add(c.dataset.k):ES.delete(c.dataset.k);drawDo()})}}
$('#tiles').addEventListener('click',e=>{const t=e.target.closest('.tile');if(!t)return;const s=+t.dataset.s;
 if(e.shiftKey&&anchor!=null&&s&&anchor){const[a,b]=[Math.min(anchor,s),Math.max(anchor,s)];for(let i=a;i<=b;i++)if(regular().includes(i))SS.add(i)}else{SS.has(s)?SS.delete(s):SS.add(s);anchor=s}focusS=s;drawDo()});
$('#tiles').addEventListener('keydown',e=>{const t=$$('#tiles .tile'),i=t.indexOf(document.activeElement);if(i<0)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();SS=new Set(regular());drawDo();return}
 const cols=getComputedStyle($('#tiles')).gridTemplateColumns.split(' ').length,d={ArrowRight:1,ArrowLeft:-1,ArrowDown:cols,ArrowUp:-cols,Home:-i,End:t.length-1-i}[e.key];
 if(d!=null){e.preventDefault();const j=Math.max(0,Math.min(t.length-1,i+d));t[i].tabIndex=-1;t[j].tabIndex=0;t[j].focus();
  if(e.shiftKey){const a=+t[i].dataset.s,b=+t[j].dataset.s;if(anchor==null)anchor=a;const[lo,hi]=[Math.min(anchor,b),Math.max(anchor,b)];for(let k=lo;k<=hi;k++)if(k)SS.add(k);focusS=b;drawDo()}}
 if(e.key===' '||e.key==='Enter'){e.preventDefault();const s=+t[i].dataset.s;SS.has(s)?SS.delete(s):SS.add(s);anchor=s;focusS=s;drawDo()}});
function setRange(){const reg=regular();if(!reg.length)return;const max=reg[reg.length-1];let a=parseInt($('#rfrom').value),b=parseInt($('#rto').value);if(isNaN(a)&&isNaN(b))return;if(isNaN(a))a=b;if(isNaN(b))b=a;
 a=Math.max(1,Math.min(max,a));b=Math.max(1,Math.min(max,b));if(a>b)[a,b]=[b,a];SS=new Set(reg.filter(s=>s>=a&&s<=b));anchor=a;
 if(PM==='episodes')ES=new Set(EP.filter(x=>SS.has(x.s)).map(key));drawDo()}
$('#rfrom').onchange=setRange;$('#rto').onchange=setRange;
const quick=f=>e=>{e.preventDefault();f();if(PM==='episodes')ES=new Set(EP.filter(x=>SS.has(x.s)).map(key));drawDo()};
$('#qAll').onclick=quick(()=>SS=new Set(regular()));$('#qNone').onclick=quick(()=>SS=new Set());$('#qLat').onclick=quick(()=>{const r=regular();SS=new Set(r.length?[r[r.length-1]]:[])});
['#newonly','#dnow','#mon','#smode','#qp','#rf'].forEach(s=>$(s).addEventListener('change',drawDo));
$('#optb').onclick=e=>{e.preventDefault();const o=B.classList.toggle('opts');$('#optb').setAttribute('aria-expanded',o);if(o)$('#qp').focus()};
$('#done').onclick=e=>{e.preventDefault();B.classList.remove('opts');$('#optb').setAttribute('aria-expanded','false');$('#optb').focus()};
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||$('#pwd').open)return;if(B.classList.contains('opts'))$('#done').click();else if(PANEL==='remove')$('#bCan').click()});
const pickBody=()=>PM==='all'?null:PM==='seasons'?{mode:'seasons',seasons:[...SS]}:{mode:'episodes',eps:[...ES]};
function success(title,line){say('');$('#okT').textContent=(DRY?'Dry run: would add ':'Added ')+title;$('#okP').textContent=line;
 const q=$('#qp').selectedOptions[0];$('#okL').innerHTML=`<li>Quality: ${esc(q?q.text:'-')}</li><li>Folder: ${esc($('#rf').value||'-')}</li>`;B.dataset.panel='success';PANEL='success';
 okTimer=setTimeout(()=>{if(PANEL==='success')panel(sel&&sel.inLibrary&&sel.type==='tv'?'sched':'add')},8000)}
$('#bSee').onclick=()=>{setSeg('#stab','dl');SP='dl';drawS();if(mobile())tab('status');panel(sel&&sel.inLibrary&&sel.type==='tv'?'sched':'add')};
$('#bAnother').onclick=()=>{panel('add');if(mobile())tab('find');$('#q').focus();$('#q').select()};
$('#bAdd').onclick=async()=>{const b=$('#bAdd');if(NO())return schedNew();if(PANEL==='sched')return sched();b.disabled=true;const lbl=b.textContent;b.textContent='Adding...';say('');
 try{const dn=$('#dnow').checked;const r=await api('add',{type:sel.type,tmdbId:sel.tmdbId,tvdbId:sel.tvdbId,qualityProfileId:$('#qp').value,rootFolderPath:$('#rf').value,monitor:$('#mon').value,search:dn,pick:sel.type==='tv'?pickBody():null,newOnly:false});
  b.textContent=lbl;
  if(r.dryRun){const w=r.wouldAdd;success(w.title,(w.episodes!=null?pl(w.seasons,'season')+', '+pl(w.episodes,'episode')+' would be wanted. ':'')+'Nothing was changed.');b.disabled=false;return}
  sel.inLibrary=true;sel.id=r.id;if(r.warning){say(r.warning);drawDo();return}
  const n=r.episodes!=null?pl(r.seasons,'season')+', '+pl(r.episodes,'episode')+' are wanted. ':'';success(r.title,n+(dn?'Downloading '+(sel.type==='movie'?'it':'them')+' now.':'Marked as wanted. Turn on Download now in Schedule when you are ready.'));loadS();if(dn)checkGrab(r.title)}
 catch(e){b.textContent=lbl;say(e.message);b.disabled=false}};
async function schedNew(){const b=$('#bAdd');b.disabled=true;b.textContent='Scheduling...';say('');const dn=$('#dnow').checked;
 try{if(sel.inLibrary){const r=await api('monitor',{id:sel.id,monitor:'future'});say((r.dryRun?'Dry run, nothing changed: would watch ':'Scheduled: watching ')+sel.title+' for new episodes only.',1)}
  else{const r=await api('add',{type:'tv',tvdbId:sel.tvdbId,qualityProfileId:$('#qp').value,rootFolderPath:$('#rf').value,monitor:'future',search:dn,pick:null,newOnly:false});
   if(r.dryRun){success(r.wouldAdd.title,'Would watch for new episodes only. Nothing was changed.')}else{sel.inLibrary=true;sel.id=r.id;success(r.title,'Watching for new episodes only. Each one downloads as it airs.');loadS()}}}
 catch(e){say(e.message)}b.textContent='Schedule download';b.disabled=false;drawDo()}
async function sched(){const b=$('#bAdd');b.disabled=true;try{if(PM==='all'){const r=await api('monitor',{id:sel.id,monitor:$('#smode').value});say((r.dryRun?'Dry run, nothing changed: ':'Schedule saved: ')+$('#smode').selectedOptions[0].text+'.',1)}
 else{const r=await api('pick',{id:sel.id,pick:pickBody(),newOnly:false,search:$('#dnow').checked});say((r.dryRun?'Dry run, nothing changed: ':'Saved: ')+pl(r.seasons,'season')+', '+pl(r.episodes,'episode')+(r.searching?', downloading now.':'.'),1);if(!r.dryRun){epFor=null;EP=[];loadEps()}}}catch(e){say(e.message)}b.disabled=false}
function remLabel(){if(!sel)return;const d=$('#df').checked,sz=sel.sizeOnDisk?gb(sel.sizeOnDisk):'',n=sel.type==='tv'&&EP.length?EP.filter(x=>x.has).length:null;
 const what=n!=null?pl(n,'episode')+(sz?' ('+sz+')':''):(sz?'files ('+sz+')':'files');
 $('#dz').textContent='Remove '+sel.title+'?';$('#dfh').textContent='Unticked keeps the '+what+' on your server. Ticked deletes them for good.';
 $('#dzp').textContent='It leaves your library and stops looking for '+(sel.type==='tv'?'new episodes':'it')+'.'+(d?' Its files are deleted too.':' Files stay on the server.');
 $('#rres').textContent=d?'This will remove '+sel.title+' and delete its '+what+' for good.':'This will remove '+sel.title+' from your library and keep its files.';
 $('#bRem').textContent=d?'Remove and delete files':'Remove, keep files';$('#bRem').disabled=!sel.inLibrary||$('#ct').value.trim()!==sel.title}
$('#df').onchange=remLabel;$('#ct').oninput=remLabel;
$('#bCan').onclick=e=>{e.preventDefault();panel(sel&&sel.type==='tv'&&sel.inLibrary?'sched':'add')};
$('#bRem').onclick=async()=>{const df=$('#df').checked;$('#bRem').disabled=true;
 try{const r=await api('remove',{type:sel.type,id:sel.id,deleteFiles:df,confirmTitle:$('#ct').value.trim()});
  if(r.dryRun){say('Dry run: would remove '+r.wouldRemove+(r.deleteFiles?' and delete its files.':', keeping files.')+' Nothing was changed.',1);remLabel();return}
  sel.inLibrary=false;sel.id=0;panel('add');say('Removed '+r.title+(r.deleteFiles?' and its files.':'. Files kept.'),1);if(SC==='lib')run()}catch(e){say(e.message);remLabel()}};

/* ---------- 3. Status ---------- */
let st=null,SP='dl',last=0,stErr=null,act=null,actErr=null,lib=null,libErr=null,VIEW='st';seg('#stab',v=>{SP=v;drawS()});
function setView(v){VIEW=v;setSeg('#sview',v);$('.c3').classList.toggle('libv',v==='lib');if(v==='lib'&&!lib)loadLib();drawS();if(mobile()&&B.dataset.tab==='status')$$('.tabs button').forEach(x=>x.setAttribute('aria-current',x.dataset.t===(v==='lib'?'library':'status')?'page':'false'))}
seg('#sview',v=>setView(v));
const when=t=>{if(!t)return '';const d=new Date(t),s=(Date.now()-d)/1000;if(s<60)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';const sameDay=new Date().toDateString()===d.toDateString();return (sameDay?'today ':d.toLocaleDateString([], {month:'short',day:'numeric'})+' ')+d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})};
const EVL={imported:['lime','In your library'],grabbed:['cy','Found, downloading'],failed:['rd','Download failed']};
function actHTML(){if(!act)return actErr?ERR('media apps',actErr):'<li><div class="sk"></div><div class="sk"></div></li>';
 if(SP==='done')return act.recent.length?act.recent.map(r=>{const [c,l]=r.event==='imported'||r.inLibrary&&r.event!=='failed'?EVL.imported:EVL[r.event];return `<li class="fin">${posterHTML(r)}<div><b title="${esc(r.title)}">${esc(r.title)}</b><small>${esc((r.event==='imported'?'Imported ':r.event==='grabbed'?'Grabbed ':'Failed ')+when(r.at))}</small></div>${r.event==='imported'?`<button class="ghost pbtn" data-play="${esc(r.title)}" aria-label="Play ${esc(r.title)}">Play</button>`:''}<span class="lab ${c==='lime'?'imp':c==='rd'?'att':'down'}">${l}</span></li>`}).join(''):'<li class="ib"><b>Nothing finished yet</b><p>Finished downloads show here with the time.</p></li>';
 return act.waiting.length?act.waiting.map((x,i)=>`<li class="wt">${posterHTML(x)}<div><b title="${esc(x.title)}">${esc(x.title)}</b><small>${x.noSeed?esc('No one is sharing this right now'+(x.stalled?'. The download is stuck at 0 seeders.':'. Your sources list it, but with 0 seeders.')+' Remove it, or keep it and it will be searched again.'):x.type==='series'?esc('In your library, '+x.missing+(x.total?' of '+x.total:'')+' aired episode'+(x.missing>1?'s':'')+' missing'):x.available?'Searched, nothing found yet':'Not released yet'}${x.lastSearch?' · last search '+esc(when(x.lastSearch)):''}</small></div>${x.noSeed?`<button class="ghost" data-dw="${i}">Remove</button>`:''}<button class="ghost" data-w="${i}">Search again</button>${x.type==='series'?'':`<button class="ghost" data-fix="${esc(JSON.stringify({id:x.id,type:x.type,title:x.title}))}" aria-label="Pick a release for ${esc(x.title)}">Pick</button>`}</li>`).join(''):'<li class="ib"><span class="big" aria-hidden="true">&#10003;</span><b>Nothing waiting</b><p>Wanted titles with no release yet show here.</p></li>'}
function libHTML(){if(!lib)return libErr?ERR('media apps',libErr):'<li><div class="sk"></div><div class="sk"></div><div class="sk"></div></li>';const L=lib,mx=Math.max(1,...L.genres.map(g=>g.n),...L.decades.map(d=>d.n));
 const chart=L.genres.length?L.genres.map(g=>`<span>${esc(g.name)}</span><i style="width:${Math.round(100*g.n/mx)}%"></i><span>${g.n}</span>`).join(''):'<span>No genres yet</span><span></span><span></span>';
 return `<li class="lib"><div class="lstat"><div><b>${L.movies}</b><small>Movies (${L.moviesOnDisk} on disk)</small></div><div><b>${L.shows}</b><small>Shows</small></div><div><b>${L.episodes}</b><small>Episodes on disk</small></div><div><b>${gb(L.size)||'0 MB'}</b><small>Size on disk</small></div>${L.free!=null?`<div><b>${gb(L.free)}</b><small>Free on seedbox</small></div>`:''}</div>
 <div class="lh">Recently added</div><div class="lrow">${L.recent.length?L.recent.map(r=>`<span class="lr" title="${esc(r.title)}">${posterHTML(r)}<span class="t">${esc(r.title)}</span><span class="t">${esc(when(r.added))}</span>${r.hasFile?`<button class="ghost pbtn" data-play="${esc(r.title)}" aria-label="Play ${esc(r.title)}">Play</button>`:''}</span>`).join(''):'<span class="lr">Nothing yet</span>'}</div>
 <div class="lh">All titles</div><div class="lfl"><input id="libq" type="search" placeholder="Filter your library" aria-label="Filter your library" value="${esc(LQ)}" autocomplete="off"><div class="seg sm" id="libt" role="tablist" aria-label="Type">${[['all','All'],['movie','Movies'],['tv','TV']].map(([v,n])=>`<button role="tab" data-v="${v}" aria-selected="${LT===v}">${n}</button>`).join('')}</div></div>
 <div class="lgrid" id="lgrid">${gridHTML()}</div>
 <div class="lh">By genre</div><div class="gc">${chart}</div></li>`}
let LQ='',LT='all',LD=null;
const libItems=()=>(lib&&lib.items||[]).filter(x=>(LT==='all'||x.type===LT)&&(!LQ||x.title.toLowerCase().includes(LQ.toLowerCase()))).sort((a,b)=>a.title.localeCompare(b.title));
function gridHTML(){const it=libItems();return it.length?it.map(x=>`<button class="lcard" data-ld="${esc(x.type+':'+x.id)}" aria-label="${esc(x.title)}${x.year?' '+x.year:''}">${posterHTML(x)}<span class="t">${esc(x.title)}</span><small>${esc([x.type==='tv'?'TV':'Movie',x.year].filter(Boolean).join(' · '))}</small></button>`).join(''):'<p class="ixsync">'+(lib&&lib.items&&lib.items.length?'Nothing matches.':'Your library is empty.')+'</p>'}
function detailHTML(x){return `<li class="lib ldet"><button class="ghost" id="ldBack">Back to library</button><div class="ldh">${posterHTML(x,1)}<div><b>${esc(x.title)}</b><small>${esc([x.type==='tv'?'TV show':'Movie',x.year,x.genres&&x.genres.join(', ')].filter(Boolean).join(' · '))}</small><small>${esc(x.type==='tv'?pl(x.episodes||0,'episode')+' on disk · ':'')}${x.hasFile?esc(gb(x.size))+' on disk':'Not downloaded yet'}</small></div></div><p class="ldo">${esc(x.overview||'No description.')}</p>
 ${x.hasFile?`<button class="primary lplay" data-play="${esc(x.title)}">Play</button>`:'<p class="ixsync">Play shows up when the file is downloaded.</p>'}
 <div class="lrm"><b>Remove from library</b>${x.type==='tv'?`<label class="fld">What to remove<select id="rmsc"><option value="all">Whole show</option></select></label><label class="fld" id="rmepw" hidden>Episode<select id="rmep"></select></label>`:''}<p class="ixsync" id="rmmsg">Deletes the files from the seedbox to free space. It will not download again.</p><button class="ghost danger" id="rmgo">Remove from library</button></div></li>`}
function wireLib(){const q=$('#libq');if(q)q.oninput=()=>{LQ=q.value;$('#lgrid').innerHTML=gridHTML()};
 $$('#libt [role=tab]').forEach(b=>b.onclick=()=>{LT=b.dataset.v;$$('#libt [role=tab]').forEach(x=>x.setAttribute('aria-selected',x===b));$('#lgrid').innerHTML=gridHTML()});
 const bk=$('#ldBack');if(bk)bk.onclick=()=>{LD=null;drawS()};if($('#rmgo'))wireRm()}
document.addEventListener('click',e=>{const c=e.target.closest('[data-ld]');if(c){e.preventDefault();LD=c.dataset.ld;drawS();$('#sl').scrollTop=0}});
function checkGrab(title){setTimeout(async()=>{try{await loadS();await loadAct();const t=String(title).toLowerCase(),hit=(st&&st.queue.some(q=>String(q.title).toLowerCase().startsWith(t)))||(act&&act.recent.some(r=>r.event!=='failed'&&String(r.title).toLowerCase().startsWith(t)&&Date.now()-new Date(r.at)<600000));
 if(!hit){const m='Added '+title+', no release found yet. It is in Waiting and will be searched again automatically.';say(m);$('#okP')&&PANEL==='success'&&($('#okP').textContent=m);setSeg('#sview','st');VIEW='st';$('.c3').classList.remove('libv');setSeg('#stab','wait');SP='wait';drawS()}}catch{}},window.GRAB_WAIT||25000)}
async function loadAct(){try{act=await api('activity');actErr=null;const n=act.waiting.length;$('#nw').hidden=!n;$('#nw').textContent=n}catch(e){actErr=e.message}if(VIEW==='st'&&(SP==='done'||SP==='wait'))drawS()}
async function loadLib(){try{lib=await api('libstats');libErr=null}catch(e){libErr=e.message}if(VIEW==='lib')drawS()}
const APPS=[['sonarr','TV app','Sonarr'],['radarr','Movie app','Radarr'],['prowlarr','Sources','Prowlarr']];
function eta(t){if(!t)return '';const m=/^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(t);if(!m)return '';const s=(+m[1]||0)*86400+(+m[2])*3600+(+m[3])*60+(+m[4]);if(!s)return '';if(s<60)return s+' sec';const h=Math.floor(s/3600),mi=Math.round((s%3600)/60);return h?(h+' hr'+(mi?' '+mi+' min':'')):mi+' min'}
function dstate(q){const t=String(q.trackedDownloadState||'').toLowerCase(),s=String(q.status||q.state||'').toLowerCase(),ts=String(q.trackedDownloadStatus||'').toLowerCase();
 if(ts==='error'||ts==='warning'||/fail|warn|error/.test(t+s)||t==='importblocked')return['att','Needs attention',0];
 if(t==='importpending'||t==='importing')return['imp','Importing',1];if(/paused/.test(s))return['pau','Paused',2];if(/queued|delay|pending/.test(s))return['que','Queued',3];
 if(t==='downloading'||s==='downloading')return['down','Downloading',0.5];return['raw',s||t||'Unknown',4]}
function dlHTML(q){const [c,l]=dstate(q),title=q.title||'Unknown item',has=q.size>0,pct=has?Math.max(0,Math.min(100,Math.round(100*(1-(q.sizeleft??q.size)/q.size)))):null;
 const det=[q.sizeleft!=null&&has&&q.sizeleft>0?gb(q.sizeleft)+' left':'',c==='imp'?'Moving to library':'',c!=='imp'&&c!=='que'?eta(q.timeleft):'',c==='que'?'waiting to start':''].filter(Boolean).join(' · ');
 return `<li><div class="dh"><b title="${esc(title)}">${esc(title)}</b><span class="lab ${c}">${esc(l)}</span>${q.qid?`<button class="ghost fxb" data-fix="${esc(JSON.stringify({qid:q.qid,id:q.type==='tv'?q.eid:q.mid,type:q.type,title}))}" aria-label="Fix ${esc(title)}">Fix</button>`:''}</div><div class="bar ${c==='down'?'':c}${has?'':' ind'}" role="progressbar" aria-label="${esc(title)}" aria-valuemin="0" aria-valuemax="100"${has?` aria-valuenow="${pct}"`:''}><i style="width:${has?pct:100}%"></i></div><div class="dm"><span>${has?pct+'%':''}</span><span>${esc(det)}</span></div></li>`}
const ERR=(what,extra,noLast)=>`<li class="ib" role="alert"><span class="big err" aria-hidden="true">!</span><b>Could not reach your ${esc(what)}</b><p>${last&&!noLast?'Last good update '+ago(last)+'. ':''}Trying again in 30 seconds.${extra?' '+esc(extra):''}</p><button class="primary" id="sTry">Try again</button></li>`;
const ago=t=>{const s=Math.round((Date.now()-t)/1000);return s<60?s+'s ago':Math.round(s/60)+' min ago'};
function drawS(){const L=$('#sl');if(VIEW==='lib'||SP==='done'||SP==='wait'){L.removeAttribute('aria-busy');if(VIEW==='lib'&&document.activeElement&&document.activeElement.id==='libq'&&$('#lgrid')){$('#lgrid').innerHTML=gridHTML();return}const det=VIEW==='lib'&&LD&&lib&&(lib.items||[]).find(x=>x.type+':'+x.id===LD);L.innerHTML=VIEW==='lib'?(det?detailHTML(det):libHTML()):actHTML();if(VIEW==='lib')wireLib();const t=$('#sTry');if(t)t.onclick=()=>{loadAct();loadLib()};
  $$('#sl [data-dw]').forEach(b=>b.onclick=async()=>{const x=act.waiting[+b.dataset.dw];if(b.dataset.c!=='1'){b.dataset.c='1';b.textContent='Tap again to remove';return}b.disabled=true;try{const g=x.type==='series'?null:x;const r=await api('dropwait',{type:x.type==='movie'?'movie':'tv',id:x.id,qid:x.qid,eid:x.eid,confirmTitle:x.type==='movie'?x.title:(lib&&lib.items||[]).find(i=>i.type==='tv'&&i.id===x.id)?.title||x.title.replace(/ S\d+E\d+$/,''),dryRun:DRY});b.textContent=r.dryRun?'Dry run ok':'Removed';await loadAct();loadLib()}catch(e){b.textContent='Could not remove';b.title=e.message}});
  $$('#sl [data-w]').forEach(b=>b.onclick=async()=>{const x=act.waiting[+b.dataset.w];b.disabled=true;b.textContent='Searching';try{const r=await api('searchagain',{type:x.type,id:x.id,dryRun:DRY});b.textContent=r.dryRun?'Dry run ok':'Search started'}catch(e){b.disabled=false;b.textContent='Search again';say(e.message)}});return}if(!st){if(stErr){L.innerHTML=ERR('media apps',stErr);$('#sTry').onclick=loadS}return}L.removeAttribute('aria-busy');const u=st.up;let h='';
 if(SP==='dl'){const down=[!u.sonarr&&'TV app',!u.radarr&&'Movie app'].filter(Boolean);
  if(!u.sonarr&&!u.radarr)h=ERR('TV and movie apps','',1);
  else{const q=[...st.queue].sort((a,b)=>dstate(a)[2]-dstate(b)[2]);h=(down.length?`<li class="st-inline">Could not reach your ${down.join(' and ')}. Showing the rest.</li>`:'')+(q.length?q.map(dlHTML).join(''):'<li class="ib"><span class="big" aria-hidden="true">&#10003;</span><b>Nothing downloading</b><p>New downloads show here with progress.</p></li>')}}
 if(SP==='up'){const cal=[...st.upcoming,...(st.movieCal||[])].sort((a,b)=>String(a.at).localeCompare(String(b.at)));if(!u.sonarr&&!u.radarr)h=ERR('TV and movie apps','',1);else h=cal.length?cal.map(e=>{const d=new Date(e.at);return `<li class="cu"><span class="when">${d.toLocaleDateString([], (d-Date.now()>6*864e5)?{month:'short',day:'numeric'}:{weekday:'short'})}<small>${d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></span><div><b>${esc(e.show)} ${esc(e.ep)}</b><small>${esc(e.type==='movie'?'Movie'+(e.name?' · '+e.name:''):(e.name||'TBA'))}</small></div>${e.hasFile?'<span class="tag lime got">Ready</span>':''}</li>`}).join(''):'<li class="ib"><span class="big" aria-hidden="true">&#10003;</span><b>Nothing coming up</b><p>New episodes (next 7 days) and movie releases (next 30 days) show here.</p></li>'}
 if(SP==='hl'){const hs=st.health.filter(x=>x.type!=='ok');h=APPS.map(([k,n,real])=>{const mine=hs.filter(x=>x.app===real&&x.msg!=='Not reachable');const c=!u[k]?['att','Down']:mine.length?['pau',mine.length+' warning'+(mine.length>1?'s':'')]:['imp','OK'];
  return `<li class="hl"><span class="lab ${c[0]}">${c[1]}</span><div><b>${n}</b><small>${!u[k]?'Could not reach it. Trying again in 30 seconds.':mine.length?mine.map(m=>esc(m.msg)).join('<br>'):'No problems found.'}</small></div></li>`}).join('')}
 L.innerHTML=h;const t=$('#sTry');if(t)t.onclick=loadS}
function alerts(){if(!st)return[];const a=[],u=st.up,H=st.health||[],has=r=>H.filter(x=>r.test(x.msg||''));
 for(const [k,n] of [['sonarr','TV app'],['radarr','Movie app'],['prowlarr','Sources app']])if(!u[k])a.push([2,'The '+n+' is not responding']);
 if(has(/download client.*(unavailable|not available|unable to communicate)|all download clients/i).length)a.push([2,'The download app is stopped or not reachable']);
 const S=st.storage;if(S&&S.quotaTotal&&S.used/S.quotaTotal>0.9)a.push([2,'Storage is nearly full ('+Math.round(100*S.used/S.quotaTotal)+'%)']);
 if(has(/indexer/i).length||st.badIndexers)a.push([1,(st.badIndexers?st.badIndexers+' source'+(st.badIndexers>1?'s are':' is'):'A source is')+' down']);
 if(has(/update is available|new update/i).length)a.push([0,'Updates are available']);
 if(st.queue.some(q=>dstate(q)[0]==='att'))a.push([1,'A download needs attention']);
 return a.sort((x,y)=>y[0]-x[0])}
function drawAlerts(){const a=alerts(),b=$('#alrt');b.hidden=!a.length;if(!a.length)return;b.classList.toggle('bad',a[0][0]>=2);b.textContent=a[0][1]+(a.length>1?' · +'+(a.length-1)+' more':'');b.title=a.map(x=>x[1]).join('. ');b.setAttribute('aria-label','Alerts: '+b.title+'. Open Health');}
$('#alrt').onclick=()=>{setSeg('#sview','st');VIEW='st';$('.c3').classList.remove('libv');setSeg('#stab','hl');SP='hl';drawS();if(mobile())tab('status')};
function drawHead(){if(!st)return;drawAlerts();const u=st.up,hs=st.health.filter(x=>x.type!=='ok'&&x.msg!=='Not reachable');
 $('#apps').innerHTML=APPS.map(([k,n,real])=>{const c=!u[k]?'down':hs.some(x=>x.app===real)?'warn':'up';return `<span><i class="dot ${c}" aria-hidden="true"></i>${n}<span class="sr"> ${c==='down'?'down':c==='warn'?'has warnings':'up'}</span></span>`}).join('');
 const n=(u.sonarr||u.radarr)?st.queue.length:0;for(const id of ['#nq','#nq2']){$(id).hidden=!n;$(id).textContent=n}
 const S=st.storage,bar=$('#spbar');if(S&&S.quotaTotal){const p=Math.min(100,Math.round(100*S.used/S.quotaTotal));$('#spb').style.width=Math.max(p,1)+'%';bar.setAttribute('aria-valuenow',p);bar.classList.toggle('hi',p>85);$('#spt').classList.toggle('hi',p>85);$('#spt').textContent=gb(S.used)+' of '+gb(S.quotaTotal)+' used';bar.hidden=false}else{bar.hidden=true;$('#spt').textContent='Not available'}}
async function loadS(){try{st=await api('status');stErr=null;last=Date.now();$('#upd').textContent='Updated just now';drawHead();drawS()}catch(e){stErr=e.message;if(!st)drawS()}}
setInterval(()=>{if(!last)return;const s=(Date.now()-last)/1000;$('#ring').style.setProperty('--p',Math.min(100,s/30*100)+'%');$('#upd').textContent='Updated '+ago(last)},1000);

/* ---------- password ---------- */
const openPw=e=>{e.preventDefault();$('#pf').reset();$('#pm').textContent='';$('#pwd').showModal()};$('#gear').onclick=openPw;$('#gear2').onclick=openPw;$('#px').onclick=()=>$('#pwd').close();
$('#pf').onsubmit=async e=>{e.preventDefault();const m=$('#pm');if($('#pn').value!==$('#pv').value){m.className='msg m-err';m.textContent='The two new passwords do not match.';return}
 try{const r=await fetch('/api/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({current:$('#pc').value,next:$('#pn').value,confirm:$('#pv').value})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not save');
  m.className='msg m-ok';m.textContent='Saved. Other devices will need to log in again.';$('#pf').reset();setTimeout(()=>$('#pwd').close(),1500)}catch(x){m.className='msg m-err';m.textContent=x.message}};

/* ---------- play (Jellyfin web player embedded; video goes browser to seedbox, never through Cloudflare) ---------- */
let JF='',OMBI='';api('config').then(c=>{JF=String(c.jf||'').replace(/\/$/,'');OMBI=String(c.ombi||'').replace(/\/$/,'')}).catch(()=>{});
const jfQ=t=>String(t||'').replace(/\s+S\d+E\d+$/i,'').trim();
const play=title=>!JF?alert('Jellyfin is not set up in this dashboard yet (JF_BASE).'):playUrl(jfQ(title),JF+'/web/#/search?query='+encodeURIComponent(jfQ(title)));
async function playUrl(q,url){const B3=$('#plb');$('#plh').textContent=q;$('#plo').href=url;
 const fs=$('#plw').requestFullscreen||$('#plw').webkitRequestFullscreen;$('#plfs').hidden=!fs;B3.innerHTML='<div class="sk"></div>';$('#play').showModal();
 try{const r=await fetch(JF+'/System/Info/Public',{cache:'no-store'});if(!r.ok)throw 0;B3.innerHTML=`<iframe title="Jellyfin player for ${esc(q)}" src="${esc(url)}" allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>`}
 catch{B3.innerHTML=`<div class="ib" role="alert"><span class="big err" aria-hidden="true">!</span><b>Could not reach Jellyfin</b><p>It may be restarting. Try Open in Jellyfin, or try again in a minute.</p><button class="primary" id="plr">Try again</button></div>`;$('#plr').onclick=()=>playUrl(q,url)}}
$('#plx').onclick=()=>{$('#plb').innerHTML='';if(document.fullscreenElement)document.exitFullscreen();$('#play').close()};$('#play').addEventListener('close',()=>{$('#plb').innerHTML=''});
$('#plfs').onclick=()=>{const p=$('#plw');(p.requestFullscreen||p.webkitRequestFullscreen).call(p)};
document.addEventListener('click',e=>{const b=e.target.closest('[data-play]');if(b){e.preventDefault();play(b.dataset.play)}});

/* ---------- settings (recommended naming, profile, custom formats) ---------- */
let SEA='movie',SED=null,SEK=null;const sem=(t,ok)=>{const m=$('#sem');m.className='msg'+(t?(ok?' m-ok':' m-err'):'');m.textContent=t||''};
const openSe=e=>{e&&e.preventDefault();sem('');SEK=null;$('#set').showModal();seLoad()};$('#setb').onclick=openSe;$('#setb2').onclick=openSe;$('#sex').onclick=()=>$('#set').close();seg('#seapp',v=>{SEA=v;SEK=null;sem('');seLoad()});
const NML={movieFolderFormat:'Movie folder',standardMovieFormat:'Movie file',seriesFolderFormat:'Show folder',seasonFolderFormat:'Season folder',standardEpisodeFormat:'Episode file',dailyEpisodeFormat:'Daily episode file',animeEpisodeFormat:'Anime episode file'};

async function seSys(){const B4=$('#seb');try{const d=await api('system');
 B4.innerHTML=`<p class="ixsync">Updates</p>${d.apps.map(a=>`<div class="ixr"><div><b>${esc(a.name)} ${esc(a.version||'?')}</b><small>${a.canUpdate?'Update '+esc(a.latest)+' available':a.managed?'Update '+esc(a.latest)+' is installed by the seedbox, not here':'Up to date'}</small></div>${a.canUpdate?`<button class="ghost" data-up="${a.app}">Update</button>`:''}</div>`).join('')}
 <p class="ixsync">Alerts when a download finishes (free, ntfy.sh)</p>${d.notify.map(n=>`<div class="ixr"><div><b>${esc(n.name)}</b><small>${n.on?'On. Topic '+esc(n.topic):'Off'}</small></div></div>`).join('')}
 <div class="ixact"><button class="ghost" id="seNt">${d.notify.some(n=>n.on)?'Turn on for both again':'Turn on alerts'}</button></div>
 <p class="ixsync">${d.notify.some(n=>n.on)?'Install the free ntfy app and subscribe to the topic above.':'Uses the free ntfy app on your phone. No account needed.'}</p>
 <p class="ixsync">Backup, requests and watching</p><div class="ixact"><a class="ghost plo" href="/api/system/export" download>Download backup</a>${OMBI?`<a class="ghost plo" href="${esc(OMBI)}" target="_blank" rel="noopener">Family requests (Ombi)</a>`:''}<button class="ghost" id="seCw">Continue watching</button></div>`;
 $$('#seb [data-up]').forEach(b=>b.onclick=async()=>{if(b.dataset.c!=='1'){b.dataset.c='1';b.textContent='Tap again to update';return}try{const r=await api('system/update',{app:b.dataset.up,confirm:true});sem(r.dryRun?'Dry run: would '+r.would+'.':'Updating to '+r.version+'. The app restarts in a minute.',1)}catch(e){sem(e.message)}});
 const nt=$('#seNt');nt.onclick=async()=>{if(nt.dataset.c!=='1'){nt.dataset.c='1';nt.textContent='Tap again to confirm';return}try{const r=await api('system/notify',{confirm:true});sem(r.dryRun?'Dry run: would '+r.would+'.':'Alerts are on.',1);if(!r.dryRun)seSys()}catch(e){sem(e.message)}};
 $('#seCw').onclick=()=>{$('#set').close();playUrl('Continue watching',JF+'/web/#/home')}}
 catch(e){B4.innerHTML='<p class="ixsync">Could not load: '+esc(e.message)+'</p>'}}
async function seLoad(){const B4=$('#seb');B4.innerHTML='<div class="sk"></div><div class="sk"></div>';if(SEA==='sys')return seSys();
 try{const d=SED=await api('settings?type='+SEA),ok=d.naming.every(n=>n.same)&&d.profile.exists&&!d.formats.missing;
  B4.innerHTML=`<p class="ixsync">Recommended from community best practices (copy from ${esc(d.fetched)}).</p>
  <div class="snr"><span class="lab ${d.profile.exists?'imp':'pau'}">${d.profile.exists?'Set':'Missing'}</span><div><b>Quality profile: ${esc(d.profile.name)}</b><code>Your profiles: ${esc(d.profiles.join(', '))}</code></div></div>
  <div class="snr"><span class="lab ${d.formats.missing?'pau':'imp'}">${d.formats.missing?d.formats.missing+' missing':'Set'}</span><div><b>Custom formats (${d.formats.total} recommended)</b><code>Scores rank releases by community best practices.</code></div></div>
  ${d.naming.map(n=>`<div class="snr"><span class="lab ${n.same?'imp':'pau'}">${n.same?'Set':'Differs'}</span><div><b>${esc(NML[n.key]||n.key)}</b><code>${esc(n.rec)}</code></div></div>`).join('')}
  <div class="snr"><span class="lab que">Info</span><div><b>Folders</b><code>${esc(d.folders.map(f=>f.path+' ('+gb(f.free)+' free)').join(', ')||'None')}</code></div></div>
  <div class="ixact"><button class="ghost" id="seBk">1. Back up current settings</button></div>
  <label class="secf"><input type="checkbox" id="seCf" disabled>I made a backup. Apply the recommended settings above.</label>
  <div class="ixact"><button class="primary" id="seAp" disabled>2. Apply recommended settings</button></div>
  ${d.backups.length?`<div class="ixact"><select id="seRk" aria-label="Backup to restore">${d.backups.map(k=>`<option value="${esc(k)}">${esc(new Date(k.split(':').slice(2).join(':')).toLocaleString())}</option>`).join('')}</select><button class="ghost" id="seRs">Restore backup</button></div>`:''}
  ${ok?'<p class="ixsync">Everything already matches the guide.</p>':''}`;
  $('#seBk').onclick=async()=>{try{const r=await api('settings/backup',{type:SEA});SEK=r.key;$('#seCf').disabled=false;sem(r.dryRun?'Dry run: backup would be saved.':'Backup saved.',1)}catch(e){sem(e.message)}};
  $('#seCf').onchange=()=>$('#seAp').disabled=!$('#seCf').checked;
  $('#seAp').onclick=async()=>{const b=$('#seAp');b.disabled=true;try{const base={type:SEA,confirm:true,backupKey:SEK};sem('Applying naming');await api('settings/apply',{...base,step:'naming'});
   for(let i=0;;i++){const r=await api('settings/apply',{...base,step:'cf',index:i});if(r.done||i>=SED.formats.total)break;sem('Custom formats '+(i+1)+' of '+SED.formats.total)}
   sem('Applying profile');await api('settings/apply',{...base,step:'profile'});sem(DRY?'Dry run: nothing was changed.':'Done. Recommended settings applied.',1);if(!DRY)seLoad()}catch(e){sem(e.message);b.disabled=false}};
  const rs=$('#seRs');if(rs)rs.onclick=async()=>{if(rs.dataset.c!=='1'){rs.dataset.c='1';rs.textContent='Tap again to restore';return}try{const r=await api('settings/restore',{type:SEA,key:$('#seRk').value,confirm:true});sem(r.dryRun?'Dry run: '+r.would:'Restored.',1)}catch(e){sem(e.message)}}}
 catch(e){B4.innerHTML='<p class="ixsync">Could not load settings: '+esc(e.message)+'</p>'}}

/* ---------- manual fixes ---------- */
const fxm=(t,ok)=>{const m=$('#fxm');m.className='msg'+(t?(ok?' m-ok':' m-err'):'');m.textContent=t||''};$('#fxx').onclick=()=>$('#fix').close();
document.addEventListener('click',e=>{const b=e.target.closest('[data-fix]');if(b){e.preventDefault();fix(JSON.parse(b.dataset.fix))}});
async function fix(x){fxm('');$('#fxh').textContent='Fix: '+x.title;$('#fix').showModal();const B5=$('#fxb');
 B5.innerHTML=`${x.qid?'<div class="ixact"><button class="ghost" id="fxBl">Blocklist this download and search again</button></div>':''}<p class="ixsync">Or pick another release:</p><div id="fxl" class="ixb"><div class="sk"></div></div>`;
 const bl=$('#fxBl');if(bl)bl.onclick=async()=>{if(bl.dataset.c!=='1'){bl.dataset.c='1';bl.textContent='Tap again to blocklist';return}try{const r=await api('blocklist',{type:x.type,qid:x.qid});fxm(r.dryRun?'Dry run: '+r.would+'.':'Blocklisted. Searching for another release.',1);if(!r.dryRun)loadS()}catch(e){fxm(e.message)}};
 if(!x.id){$('#fxl').innerHTML='<p class="ixsync">No title id for this download.</p>';return}
 try{const rs=await api('releases?type='+x.type+'&id='+x.id);const L=$('#fxl');
  L.innerHTML=rs.length?rs.map((r,i)=>`<div class="ixr"><div><b title="${esc(r.title)}">${esc(r.title)}</b><small>${esc([r.quality,gb(r.size),r.seeders!=null?r.seeders+' seeders':'','score '+r.score,r.rejected?'Not wanted: '+r.why:''].filter(Boolean).join(' · '))}</small></div><button class="ghost" data-g="${i}">Get</button></div>`).join(''):'<p class="ixsync">No releases found in your sources.</p>';
  $$('#fxl [data-g]').forEach(b=>b.onclick=async()=>{if(b.dataset.c!=='1'){b.dataset.c='1';b.textContent='Confirm';return}const r=rs[+b.dataset.g];try{const d=await api('grab',{type:x.type,guid:r.guid,indexerId:r.indexerId,title:r.title});fxm(d.dryRun?'Dry run: would '+d.would.slice(5)+'.':'Sent to download.',1);if(!d.dryRun)loadS()}catch(e){fxm(e.message)}})}
 catch(e){$('#fxl').innerHTML='<p class="ixsync">'+esc(e.message)+'</p>'}}

/* ---------- sources (Prowlarr indexers) ---------- */
let IX=null,IXT=null,IXOK=false;const ixm=(t,ok)=>{const m=$('#ixm');m.className='msg'+(t?(ok?' m-ok':' m-err'):'');m.textContent=t||''};
const openIx=e=>{e&&e.preventDefault();ixm('');$('#idx').showModal();ixList()};$('#srcb').onclick=openIx;$('#srcb2').onclick=openIx;$('#ixx').onclick=()=>$('#idx').close();
const HL={ok:['imp','Working'],failing:['att','Failing'],off:['que','Off']};
async function ixList(){const B2=$('#ixb');B2.innerHTML='<div class="sk"></div><div class="sk"></div>';
 try{IX=await api('indexers');const sy=IX.sync.length?IX.sync.map(a=>a.name+(a.enable&&a.level==='fullSync'?' synced':' not synced')).join(', '):'No apps linked';
  B2.innerHTML=`<p class="ixsync">Prowlarr pushes your sources to the TV and movie apps: ${esc(sy)}.</p>`+(IX.indexers.length?IX.indexers.map((x,i)=>{const h=HL[x.health]||HL.ok;return `<div class="ixr"><div><b>${esc(x.name)}</b><small><span class="lab ${h[0]}">${h[1]}</span> ${esc([x.protocol,x.privacy].filter(Boolean).join(' · '))}</small></div><label class="sw"><input type="checkbox" data-t="${i}" ${x.enable?'checked':''}>On</label>${x.protocol==='torrent'?`<button class="ghost" data-sd="${i}">Seeding</button>`:''}<button class="ghost" data-r="${i}">Remove</button></div>`}).join(''):'<p class="ixsync">No sources yet.</p>')+'<div class="ixact"><button class="ghost" id="ixPx">Proxies</button><button class="primary" id="ixAdd">Add your own source</button></div>';
  $$('#ixb [data-t]').forEach(c=>c.onchange=async()=>{const x=IX.indexers[+c.dataset.t];try{const r=await api('indexers/toggle',{id:x.id,enable:c.checked});ixm(r.dryRun?'Dry run: '+x.name+' would be turned '+(c.checked?'on':'off')+'.':x.name+' turned '+(c.checked?'on':'off')+'.',1);if(!r.dryRun)ixList()}catch(e){c.checked=!c.checked;ixm(e.message)}});
  $$('#ixb [data-r]').forEach(b=>b.onclick=()=>ixRemove(IX.indexers[+b.dataset.r]));$$('#ixb [data-sd]').forEach(b=>b.onclick=()=>ixSeed(IX.indexers[+b.dataset.sd]));$('#ixAdd').onclick=ixAdd;$('#ixPx').onclick=()=>ixProxies(ixList)}
 catch(e){B2.innerHTML=`<p class="ixsync">Could not load sources: ${esc(e.message)}</p><div class="ixact"><button class="primary" id="ixR">Try again</button></div>`;$('#ixR').onclick=ixList}}
async function ixSeed(x){ixm('');const B2=$('#ixb');B2.innerHTML='<div class="sk"></div>';try{const d=await api('indexers/seed?id='+x.id);
 B2.innerHTML=`<form class="ixf" id="ixsd"><b>Seeding for ${esc(d.name)}</b>${seedSel('ixsr',d.seedRatio,d.privacy!=='public')}<div class="ixact"><button type="button" class="ghost" id="ixc">Back</button><button class="primary">Save</button></div></form>`;$('#ixc').onclick=ixList;
 $('#ixsd').onsubmit=async e=>{e.preventDefault();try{const r=await api('indexers/seed',{id:x.id,seedRatio:$('#ixsr').value});ixm(r.dryRun?'Dry run: nothing was changed.':'Saved.',1)}catch(er){ixm(er.message)}}}
 catch(e){B2.innerHTML='<p class="ixsync">'+esc(e.message)+'</p><div class="ixact"><button class="ghost" id="ixc">Back</button></div>';$('#ixc').onclick=ixList}}
function ixRemove(x){ixm('');$('#ixb').innerHTML=`<div class="danger" role="alertdialog" aria-labelledby="ixd"><h3 id="ixd">Remove ${esc(x.name)}?</h3><p>It is also removed from the TV and movie apps. Type the name to confirm.</p><label class="fld">Name<input id="ixcn" autocomplete="off"></label><div class="ixact"><button class="ghost" id="ixc">Cancel</button><button class="primary" id="ixgo" disabled>Remove</button></div></div>`;
 $('#ixcn').oninput=()=>$('#ixgo').disabled=$('#ixcn').value!==x.name;$('#ixc').onclick=ixList;
 $('#ixgo').onclick=async()=>{try{const r=await api('indexers/remove',{id:x.id,confirmName:$('#ixcn').value});ixm(r.dryRun?'Dry run: would remove '+x.name+'.':'Removed '+x.name+'.',1);ixList()}catch(e){ixm(e.message)}}}
function ixAdd(){ixm('');$('#ixb').innerHTML=`<form class="ixf" id="ixs"><label class="fld">Find a source type<input id="ixq" placeholder="Type a name" autocomplete="off"></label><div class="ixact"><button class="primary">Search</button><button type="button" class="ghost" id="ixc">Back</button></div></form><div id="ixtl" class="ixb"></div>`;
 $('#ixc').onclick=ixList;$('#ixs').onsubmit=async e=>{e.preventDefault();const L=$('#ixtl');L.innerHTML='<div class="sk"></div>';try{IXT=await api('indexers/types?q='+encodeURIComponent($('#ixq').value.trim()));
  L.innerHTML=IXT.length?IXT.map((t,i)=>`<div class="ixr"><div><b>${esc(t.name)}</b><small>${esc([t.protocol,t.privacy].filter(Boolean).join(' · '))}${t.description?' · '+esc(t.description):''}</small></div><button class="ghost" data-p="${i}">Pick</button></div>`).join(''):'<p class="ixsync">No matching source types. Type at least 2 letters of the name.</p>';
  $$('#ixtl [data-p]').forEach(b=>b.onclick=()=>ixForm(IXT[+b.dataset.p].key))}catch(x){L.innerHTML='<p class="ixsync">'+esc(x.message)+'</p>'}};$('#ixq').focus()}
let PX=[];
const PXNOTE=`<small>Leave off unless a legal source you're allowed to use is blocked by region or ISP. Check the site's rules first: some treat shared VPN addresses as account sharing. A proxy only affects searching, not qBittorrent downloads.</small>`;
const FSNOTE='Only helps some Cloudflare-protected legal sources. Community experience says it often fails against current Cloudflare checks. Leave off unless a source needs it.';
const pxSel=()=>`<label class="fld">Use a proxy<select id="ixpx"><option value="">None (Recommended)</option>${PX.filter(p=>p.tag!=null).map(p=>`<option value="${p.tag}">${esc(p.name)} (${esc(p.kind)})</option>`).join('')}${PX.filter(p=>p.pending).map(p=>`<option value="pending:${esc(p.pending)}" disabled>${esc(p.name)}</option>`).join('')}</select>${PXNOTE}<small id="ixfs" class="fsn" hidden>${FSNOTE}</small></label><div class="ixact"><button type="button" class="ghost" id="ixpm">Add a proxy</button></div>`;
async function ixProxies(back){ixm('');const B2=$('#ixb');B2.innerHTML='<div class="sk"></div>';let list=[];try{list=PX=await api('indexers/proxies')}catch(e){ixm(e.message)}
 B2.innerHTML=`<b>Proxies</b><p class="ixsync">Proxies apply to a source through a tag. A proxy only affects searching, not qBittorrent downloads.</p>
 ${list.length?list.map((p,i)=>`<div class="ixr"><div><b>${esc(p.name)}</b><small>${esc(p.kind)} · ${esc(p.host)}${p.port?':'+esc(p.port):''}${p.login?' · login set':''}${p.kind==='FlareSolverr'?'<br>'+FSNOTE:''}${p.pending==='hproxy'?'<br>Not usable yet. Once your HProxy plan is bought, add it below with type Socks5, name HProxy, and the host, port and login from HProxy. It then shows in the Use a proxy list.':''}${p.pending==='711proxy'?'<br>'+esc(p.hint)+'<br>Not usable yet. After you buy an address at 711proxy.com, add it below with type Socks5, name 711Proxy, and the host, port and login from 711Proxy. It then shows in the Use a proxy list.':''}</small></div>${p.pending?'':`<span><button class="ghost" data-pe="${i}">Edit</button> <button class="ghost" data-pr="${i}">Remove</button></span>`}</div>`).join(''):'<p class="ixsync">No proxies yet.</p>'}
 <form class="ixf" id="pxf"><b>Add a proxy</b><div class="pxg"><label class="fld">Type<select id="pxk"><option>Http</option><option>Socks4</option><option selected>Socks5</option><option>FlareSolverr</option></select></label><label class="fld">Name<input id="pxn" autocomplete="off" placeholder="My VPN"></label></div>
 <div class="pxg"><label class="fld">Host<input id="pxh" autocomplete="off" spellcheck="false" required></label><label class="fld pxnf">Port<input id="pxp" type="number" min="1" max="65535" required></label></div>
 <small id="pxfn" class="fsn" hidden>${FSNOTE}</small><div class="pxg pxnf"><label class="fld">Username (optional)<input id="pxu" autocomplete="off"></label><label class="fld">Password (optional)<input id="pxw" autocomplete="new-password" type="password"></label></div>
 <div class="ixact"><button type="button" class="ghost" id="pxb">Back</button><button class="primary">Test and save</button></div></form>`;
 $('#pxb').onclick=back;$('#pxk').onchange=()=>{const fs=$('#pxk').value==='FlareSolverr';$$('.pxnf').forEach(e=>e.hidden=fs);$('#pxp').required=!fs;$('#pxh').placeholder=fs?'http://name:8191':'';$('#pxfn').hidden=!fs};
 $$('#ixb [data-pr]').forEach(b=>b.onclick=async()=>{if(b.dataset.c!=='1'){b.dataset.c='1';b.textContent='Tap again';return}try{const r=await api('indexers/proxy/remove',{id:list[+b.dataset.pr].id});if(!r.dryRun)await ixProxies(back);ixm(r.dryRun?'Dry run: would '+r.would+'.':'Proxy removed.',1)}catch(e){ixm(e.message)}});
 $$('#ixb [data-pe]').forEach(b=>b.onclick=()=>pxEdit(list[+b.dataset.pe],back));
 if(list.some(p=>p.pending==='hproxy')&&!$('#pxn').value)$('#pxn').value='HProxy';
 $('#pxf').onsubmit=async e=>{e.preventDefault();const b=$('#pxf .primary');b.disabled=true;b.textContent='Testing';try{const r=await api('indexers/proxy',{kind:$('#pxk').value,name:$('#pxn').value,host:$('#pxh').value,port:$('#pxp').value,username:$('#pxu').value,password:$('#pxw').value});$('#pxw').value='';$('#pxu').value='';if(!r.dryRun)await ixProxies(back);ixm(r.dryRun?'Dry run: '+r.would+'. Nothing was changed.':'Proxy saved.',1)}catch(x){ixm(x.message)}b.disabled=false;b.textContent='Test and save'}}
const SEEDN={private:'Many private sites need at least 1.0 or a minimum seed time. Check your site\'s rules.',public:'Seeding goals are set here, per source. 2.0 gives back fairly on public sites.'};
const seedSel=(id,val,priv,attr)=>{const rec=priv?'1':'2';const o=[['','Use the download client\'s setting'],['1','1.0'],['1.5','1.5'],['2','2.0'],['3','3.0']];const cur=val==null?rec:String(+val);
 return `<label class="fld">Seed ratio<select id="${id}" ${attr||''}>${o.map(([v,n])=>`<option value="${v}" ${v===cur?'selected':''}>${n}${v===rec?' (Recommended)':''}</option>`).join('')}${o.some(x=>x[0]===cur)?'':`<option value="${esc(cur)}" selected>${esc(cur)}</option>`}</select><small>${priv?SEEDN.private:SEEDN.public}</small></label>`};
async function ixForm(key){ixm('');IXOK=false;const B2=$('#ixb');B2.innerHTML='<div class="sk"></div>';
 try{const [d,px]=await Promise.all([api('indexers/fields?key='+encodeURIComponent(key)),api('indexers/proxies').catch(()=>[])]);PX=px;
  const fh=f=>{const id='ixv_'+f.name.replace(/\W/g,'_'),hp=f.help?`<small>${esc(f.help)}</small>`:'';
   if(/^torrentBaseSettings\./.test(f.name)&&d.protocol!=='torrent')return '';if(f.name==='torrentBaseSettings.seedRatio')return seedSel(id,f.value,d.privacy!=='public',`data-f="${esc(f.name)}"`);
   if(f.type==='checkbox')return `<label class="sw"><input type="checkbox" data-f="${esc(f.name)}" id="${id}" ${f.value?'checked':''}>${esc(f.label)}</label>${hp}`;
   if(f.name==='baseUrl'||(f.type==='select'&&!f.options.length)){const dl=(f.urls||[]).length?`<datalist id="${id}_l">${f.urls.map(u=>`<option value="${esc(u)}"></option>`).join('')}</datalist>`:'';return `<label class="fld">${esc(f.label)}<input data-f="${esc(f.name)}" id="${id}" type="${f.name==='baseUrl'?'url':'text'}" inputmode="url" autocomplete="off" spellcheck="false" ${dl?`list="${id}_l"`:''} value="${esc(f.value??'')}" placeholder="${f.name==='baseUrl'?'https://':''}">${dl}${hp||(dl?'<small>Pick a listed address or type your own.</small>':'')}</label>`}
   if(f.type==='select'&&f.options.length)return `<label class="fld">${esc(f.label)}<select data-f="${esc(f.name)}" id="${id}">${f.options.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(f.value)?'selected':''}>${esc(o.name)}</option>`).join('')}</select>${hp}</label>`;
   return `<label class="fld">${esc(f.label)}<input data-f="${esc(f.name)}" id="${id}" type="${f.secret?'password':f.type==='number'?'number':'text'}" autocomplete="${f.secret?'new-password':'off'}" value="${f.secret?'':esc(f.value??'')}">${hp}</label>`};
  B2.innerHTML=`<form class="ixf" id="ixff"><b>${esc(d.name)}</b><label class="fld">Name in your apps<input id="ixn" value="${esc(d.name)}" autocomplete="off"></label>${d.fields.map(fh).join('')}${pxSel()}<div class="ixact"><button type="button" class="ghost" id="ixc">Back</button><button type="button" class="ghost" id="ixtest">Test</button><button class="primary" id="ixsave" disabled>Save</button></div></form>`;
  const vals=()=>{const v={};$$('#ixff [data-f]').forEach(i=>v[i.dataset.f]=i.type==='checkbox'?i.checked:i.value);return v};
  $('#ixpm').onclick=()=>ixProxies(()=>ixForm(key));$('#ixpx').addEventListener('change',()=>{const p=PX.find(y=>String(y.tag)===$('#ixpx').value);$('#ixfs').hidden=!(p&&p.kind==='FlareSolverr')});$$('#ixff [data-f],#ixn,#ixpx').forEach(i=>i.oninput=i.onchange=()=>{IXOK=false;$('#ixsave').disabled=true});$('#ixc').onclick=ixAdd;
  $('#ixtest').onclick=async()=>{const b=$('#ixtest');b.disabled=true;b.textContent='Testing';try{await api('indexers/test',{key,name:$('#ixn').value,values:vals(),proxyTag:$('#ixpx').value});IXOK=true;$('#ixsave').disabled=false;ixm('Test passed. You can save it now.',1)}catch(e){IXOK=false;$('#ixsave').disabled=true;ixm('Test failed: '+e.message)}b.disabled=false;b.textContent='Test'};
  $('#ixff').onsubmit=async e=>{e.preventDefault();if(!IXOK)return;try{const r=await api('indexers/save',{key,name:$('#ixn').value,values:vals(),proxyTag:$('#ixpx').value});$$('#ixff input[type=password]').forEach(i=>i.value='');ixm(r.dryRun?'Dry run: would save '+r.wouldSave.name+'. Nothing was changed.':'Saved '+r.name+'. Prowlarr will push it to your apps.',1);if(!r.dryRun)setTimeout(ixList,800)}catch(x){ixm(x.message)}}}
 catch(e){B2.innerHTML='<p class="ixsync">'+esc(e.message)+'</p>'}}

if(DRY)document.title='Media remote (dry run)';
loadS();loadAct();setInterval(()=>{loadS();loadAct();if(VIEW==='lib')loadLib()},30000);

function pxEdit(p,back){ixm('');const FS=p.kind==='FlareSolverr';$('#ixb').innerHTML=`<form class="ixf" id="pef"><b>Edit ${esc(p.name)}</b><div class="pxg"><label class="fld">Name<input id="pen" value="${esc(p.name)}" autocomplete="off"></label></div>
 <div class="pxg"><label class="fld">Host<input id="peh" value="${esc(p.host)}" autocomplete="off" spellcheck="false" required></label>${FS?'':`<label class="fld">Port<input id="pep" type="number" min="1" max="65535" value="${esc(p.port)}" required></label>`}</div>
 ${FS?'':`<div class="pxg"><label class="fld">Username<input id="peu" autocomplete="off"></label><label class="fld">Password<input id="pew" type="password" autocomplete="new-password" placeholder="${p.login?'Saved. Leave blank to keep':''}"></label></div><small>${p.login?'A login is saved. Leave Username blank to keep it.':''}</small>`}
 <div class="ixact"><button type="button" class="ghost" id="peb">Back</button><button class="primary">Test and save</button></div></form>`;
 $('#peb').onclick=()=>ixProxies(back);
 $('#pef').onsubmit=async e=>{e.preventDefault();const b=$('#pef .primary');b.disabled=true;b.textContent='Testing';const u=$('#peu')&&$('#peu').value;
  try{const r=await api('indexers/proxy/edit',{id:p.id,name:$('#pen').value,host:$('#peh').value,port:$('#pep')?$('#pep').value:0,username:u?u:undefined,password:$('#pew')?$('#pew').value:''});if($('#pew'))$('#pew').value='';if(!r.dryRun)await ixProxies(back);ixm(r.dryRun?'Dry run: '+r.would+'. Nothing was changed.':'Proxy updated.',1)}catch(x){ixm(x.message)}b.disabled=false;b.textContent='Test and save'}}

let RMEP=[];
function wireRm(){const [ty,ids]=String(LD).split(':');const x=(lib.items||[]).find(i=>i.type===ty&&String(i.id)===ids);if(!x)return;const go=$('#rmgo'),msg=$('#rmmsg'),sc=$('#rmsc');let armed=false;
 const reset=()=>{armed=false;go.textContent='Remove from library';msg.textContent='Deletes the files from the seedbox to free space. It will not download again.'};
 if(sc){api('episodes?id='+x.id).then(d=>{RMEP=(Array.isArray(d)?d:(d.episodes||[])).filter(e=>e.has||e.hasFile);const ss=[...new Set(RMEP.map(e=>e.s))].sort((a,b)=>a-b);
   sc.innerHTML='<option value="all">Whole show</option>'+ss.map(n=>`<option value="s:${n}">${n===0?'Specials':'Season '+n}</option>`).join('')+(RMEP.length?'<option value="e">One episode</option>':'');
   $('#rmep').innerHTML=RMEP.map(e=>{const sn=e.s,en=e.e;return `<option value="${e.id}">S${String(sn).padStart(2,'0')}E${String(en).padStart(2,'0')} ${esc(e.title||'')}</option>`}).join('')}).catch(()=>{});
  sc.onchange=()=>{$('#rmepw').hidden=sc.value!=='e';reset()};$('#rmep').onchange=reset}
 const body=()=>{const v=sc?sc.value:'all';return {type:x.type,id:x.id,confirmTitle:x.title,scope:v==='all'?'all':v==='e'?'episode':'season',season:v.startsWith('s:')?+v.slice(2):undefined,episodeId:v==='e'?+$('#rmep').value:undefined}};
 go.onclick=async()=>{go.disabled=true;try{if(!armed){const d=await api('libremove',{...body(),dryRun:true});armed=true;go.textContent='Tap again to delete';msg.textContent='This will '+d.would.replace(/^remove/,'remove')+' from the seedbox'+(d.freed?', freeing about '+gb(d.freed):'')+'. This cannot be undone.'}
  else{const r=await api('libremove',body());msg.textContent='Removed '+r.title+(r.freed?'. Freed about '+gb(r.freed):'')+'.';go.textContent='Removed';if(body().scope==='all')LD=null;await loadLib();loadAct();loadS();return}}catch(e){msg.textContent=e.message;armed=false;go.textContent='Remove from library'}go.disabled=false}}
