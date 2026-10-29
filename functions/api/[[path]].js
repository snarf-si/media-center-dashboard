import { json } from '../_lib.js';
const APPS = { movie: ['RADARR','v3'], tv: ['SONARR','v3'], prowlarr: ['PROWLARR','v1'] };
async function call(env, app, path, method='GET', body) {
  const [P, v] = APPS[app]; const base = env[P+'_URL'], key = env[P+'_KEY'];
  if (!base || !key) return { ok:false, status:0, data:{error: P.toLowerCase()+' is not set up'} };
  const h = { 'X-Api-Key': key, 'content-type':'application/json', accept:'application/json' };
  if (env.UPSTREAM_USER && env.UPSTREAM_PASS) h.authorization = 'Basic ' + btoa(env.UPSTREAM_USER+':'+env.UPSTREAM_PASS);
  try {
    const r = await fetch(base.replace(/\/$/,'') + `/api/${v}/` + path, { method, headers:h, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let d; try { d = t ? JSON.parse(t) : null; } catch { d = { error: 'Bad reply ('+r.status+')' }; }
    return { ok: r.ok, status: r.status, data: d };
  } catch (e) { return { ok:false, status:0, data:{error:'Could not reach '+P.toLowerCase()} }; }
}

// Episode list for a show: from Sonarr if in library (id), else from the public Sonarr metadata service (tvdbId).
async function episodeList(env, id, tvdbId) {
  if (id) {
    const r = await call(env, 'tv', 'episode?seriesId='+id); if (!r.ok) return r;
    return { ok:true, data: r.data.map(e=>({ s:e.seasonNumber, e:e.episodeNumber, title:e.title, air:e.airDateUtc||e.airDate||'', id:e.id, mon:e.monitored, has:e.hasFile })) };
  }
  try {
    const r = await fetch('https://skyhook.sonarr.tv/v1/tvdb/shows/en/'+Number(tvdbId), { headers:{ 'user-agent':'media-dashboard/1.0', accept:'application/json' } }); if (!r.ok) return { ok:false, status:r.status, data:{error:'Could not load episodes ('+r.status+')'} };
    const d = await r.json(); return { ok:true, data:(d.episodes||[]).map(e=>({ s:e.seasonNumber, e:e.episodeNumber, title:e.title, air:e.airDateUtc||e.airDate||'' })) };
  } catch { return { ok:false, status:0, data:{error:'Could not load episodes'} }; }
}
// pick = {mode:'all'|'seasons'|'episodes', seasons:[n], eps:['s:e']}; newOnly keeps only episodes airing from now on.
function chosen(list, pick, newOnly) {
  const now = Date.now(), ss = new Set((pick.seasons||[]).map(Number)), es = new Set((pick.eps||[]).map(String));
  return list.filter(x => (pick.mode==='seasons' ? ss.has(x.s) : es.has(x.s+':'+x.e)) && (!newOnly || (x.air && Date.parse(x.air) >= now)));
}
const validPick = p => p && (p.mode==='seasons' || p.mode==='episodes');
async function applyPick(env, id, list, pick, newOnly, search) {
  const want = chosen(list, pick, newOnly), ids = new Set(want.map(x=>x.id));
  const g = await call(env, 'tv', 'series/'+id); if (!g.ok) return g;
  const seasonsOn = new Set(want.map(x=>x.s)); g.data.monitored = true;
  g.data.seasons = (g.data.seasons||[]).map(x=>({...x, monitored: seasonsOn.has(x.seasonNumber)}));
  let r = await call(env, 'tv', 'series/'+id, 'PUT', g.data); if (!r.ok) return r;
  const off = list.filter(x=>!ids.has(x.id)).map(x=>x.id), on = [...ids];
  if (off.length) { r = await call(env, 'tv', 'episode/monitor', 'PUT', { episodeIds: off, monitored:false }); if (!r.ok) return r; }
  if (on.length) { r = await call(env, 'tv', 'episode/monitor', 'PUT', { episodeIds: on, monitored:true }); if (!r.ok) return r; }
  if (search && on.length) { r = await call(env, 'tv', 'command', 'POST', { name:'EpisodeSearch', episodeIds: on }); if (!r.ok) return r; }
  return { ok:true, data:{ seasons: seasonsOn.size, episodes: on.length, searching: !!(search && on.length) } };
}

// Per-user disk quota from the Swizzin panel (/stats/quota on the same host). Read only.
const UNITS={B:1,KiB:1024,MiB:1024**2,GiB:1024**3,TiB:1024**4,PiB:1024**5,KB:1e3,MB:1e6,GB:1e9,TB:1e12};
const toBytes=v=>{const m=/^\s*([\d.]+)\s*([KMGTP]?i?B)\s*$/.exec(String(v||''));return m&&UNITS[m[2]]?Math.round(parseFloat(m[1])*UNITS[m[2]]):null};
async function quota(env){
  try{const base=new URL(env.SONARR_URL||env.RADARR_URL).origin;const h={accept:'application/json'};
    if(env.UPSTREAM_USER&&env.UPSTREAM_PASS)h.authorization='Basic '+btoa(env.UPSTREAM_USER+':'+env.UPSTREAM_PASS);
    const r=await fetch(base+'/stats/quota',{headers:h});if(!r.ok)return null;const q=(await r.json()).quota;if(!q)return null;
    const total=toBytes(q.disktotal),used=toBytes(q.diskused);return total&&used!=null?{quotaTotal:total,used}:null}catch{return null}}

// People search (actor / director). Uses TMDB when a TMDB_KEY secret exists; otherwise free keyless sources:
// Wikidata (movies, with TMDB and IMDb ids) and TVmaze (TV, with TVDB and IMDb ids).
const UA={ 'user-agent':'media-dashboard/1.0 (personal use)', accept:'application/json' };
async function jget(u,h){const r=await fetch(u,{headers:{...UA,...(h||{})}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
async function peopleTMDB(env,q,role){const H={authorization:'Bearer '+env.TMDB_KEY};const auth=env.TMDB_KEY.length<40?'&api_key='+encodeURIComponent(env.TMDB_KEY):'';const h=auth?{}:H;
  const s=await jget('https://api.themoviedb.org/3/search/person?include_adult=false&query='+encodeURIComponent(q)+auth,h);const p=(s.results||[])[0];if(!p)return{person:null,items:[]};
  const c=await jget('https://api.themoviedb.org/3/person/'+p.id+'/combined_credits?'+auth.slice(1),h);
  const L=role==='director'?(c.crew||[]).filter(x=>x.job==='Director'||x.job==='Creator'||x.department==='Directing'):(c.cast||[]);
  const seen=new Set(),items=[];for(const x of L){const k=x.media_type+x.id;if(seen.has(k))continue;seen.add(k);
    items.push({type:x.media_type==='tv'?'tv':'movie',title:x.title||x.name,year:+(String(x.release_date||x.first_air_date||'').slice(0,4))||null,tmdbId:x.media_type==='movie'?x.id:undefined,tmdbTv:x.media_type==='tv'?x.id:undefined,role:role==='director'?x.job:(x.character||''),poster:x.poster_path?'https://image.tmdb.org/t/p/w92'+x.poster_path:'',pop:x.popularity||0})}
  items.sort((a,b)=>(b.year||0)-(a.year||0));return{person:{name:p.name,known:p.known_for_department},items,source:'TMDB'}}
async function peopleFree(q,role){
  const name=q.replace(/["\\]/g,'').trim();
  const prop=role==='director'?'P57':'P161';
  const wdq=async()=>{let ids=[];try{const ws=await jget('https://www.wikidata.org/w/api.php?action=wbsearchentities&type=item&language=en&limit=5&format=json&search='+encodeURIComponent(name));ids=(ws.search||[]).map(x=>x.id)}catch{}
    if(!ids.length){const tc=name.toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());const lr=await jget('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(`SELECT DISTINCT ?p WHERE { VALUES ?l { "${tc}"@en "${name}"@en } ?p rdfs:label ?l; wdt:P31 wd:Q5. } LIMIT 5`),{accept:'application/sparql-results+json'});ids=lr.results.bindings.map(b=>b.p.value.split('/').pop())}
    ids=ids.filter(x=>/^Q\d+$/.test(x));if(!ids.length)return{results:{bindings:[]}};
    const sparql=`SELECT ?p ?f ?fLabel ?tmdb ?imdb (MIN(YEAR(?d)) AS ?y) WHERE { VALUES ?p { ${ids.map(i=>'wd:'+i).join(' ')} } ?p wdt:P31 wd:Q5. ?f wdt:${prop} ?p; wdt:P4947 ?tmdb. OPTIONAL{?f wdt:P345 ?imdb} OPTIONAL{?f wdt:P577 ?d} SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?p ?f ?fLabel ?tmdb ?imdb LIMIT 400`;
    const r=await jget('https://query.wikidata.org/sparql?format=json&query='+encodeURIComponent(sparql),{accept:'application/sparql-results+json'});
    const best=ids.find(i=>r.results.bindings.some(b=>b.p.value.endsWith('/'+i)));r.results.bindings=r.results.bindings.filter(b=>best&&b.p.value.endsWith('/'+best));return r};
  const [wd,tm]=await Promise.allSettled([
    wdq(),
    (async()=>{const s=await jget('https://api.tvmaze.com/search/people?q='+encodeURIComponent(name));const p=s[0]&&s[0].person;if(!p)return{p:null,c:[]};
      const c=await jget('https://api.tvmaze.com/people/'+p.id+'/'+(role==='director'?'crewcredits':'castcredits')+'?embed=show');return{p,c}})()]);
  const items=[];const seen=new Set();
  if(wd.status==='fulfilled')for(const b of wd.value.results.bindings){const id=+b.tmdb.value;if(seen.has('m'+id))continue;seen.add('m'+id);items.push({type:'movie',title:b.fLabel?.value||'',year:b.y?+b.y.value:null,tmdbId:id,imdbId:b.imdb?.value,poster:'',role:''})}
  let pname=null;
  if(tm.status==='fulfilled'&&tm.value.p){pname=tm.value.p.name;for(const x of tm.value.c){if(role==='director'&&!/director|creator|executive producer/i.test(x.type||''))continue;const sh=x._embedded?.show;if(!sh||!sh.externals?.thetvdb)continue;const k='t'+sh.externals.thetvdb;if(seen.has(k))continue;seen.add(k);
    items.push({type:'tv',title:sh.name,year:+(String(sh.premiered||'').slice(0,4))||null,tvdbId:sh.externals.thetvdb,imdbId:sh.externals.imdb,poster:sh.image?.medium||'',role:x.type||''})}}
  if(wd.status==='rejected'&&tm.status==='rejected')throw new Error('People search is not reachable right now');
  items.sort((a,b)=>(b.year||0)-(a.year||0));return{person:{name:pname||name},items,source:'Wikidata and TVmaze',partial:wd.status==='rejected'||tm.status==='rejected'}}
const errText = (r) => (r.data && (r.data.message || r.data.error || (Array.isArray(r.data) && r.data.map(e=>e.errorMessage).join(' ')))) || ('Error '+r.status);

const normT = t => String(t||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const relMatch = (rel, it) => { const r = normT(rel), t = normT(it.title).replace(/^the /,''), r2 = r.replace(/^the /,'');
  if (!t || !r2.startsWith(t+' ')) return false; const rest = r2.slice(t.length+1);
  if (it.type==='tv') return /^((19|20)\d\d )?(s\d{1,2}(e\d{1,3})?\b|season \d|complete|series|\d{1,2}x\d{2}\b)/.test(rest);
  const y = /^((19|20)\d\d)\b/.exec(rest); return !!y && (!it.year || Math.abs(+y[1]-it.year) <= 1); };
async function availCheck(env, it, fresh) {
  const T2 = it.type==='tv' ? 'tv' : 'movie', id = String(it.tmdbId||it.tvdbId||it.title||'').slice(0,60), k = 'av3:'+T2+':'+id;
  if (!fresh) { const c = env.AUTH && await env.AUTH.get(k, 'json'); if (c) return c; }
  const term = String(it.title||'').replace(/[^\p{L}\p{N} ]+/gu,' ').replace(/\s+/g,' ').trim() + (T2==='movie' && it.year ? ' '+it.year : '');
  const r = await call(env,'prowlarr','search?type=search&limit=100&categories='+(T2==='tv'?5000:2000)+'&query='+encodeURIComponent(term));
  if (!r.ok || !Array.isArray(r.data)) return { error:true };
  const match = r.data.filter(x=>relMatch(x.title, { ...it, type:T2 }));
  const usable = (x) => x.protocol==='torrent' ? (x.seeders||0) >= 1 : (x.size||0) > 0 && !!(x.downloadUrl||x.magnetUrl);
  const good = match.filter(usable);
  const v = { n: good.length, dead: match.length - good.length, seen: r.data.length, seeders: good.reduce((a,x)=>a+(x.seeders||0),0), at: Date.now() };
  if (env.AUTH) await env.AUTH.put(k, JSON.stringify(v), { expirationTtl: (good.length ? 6 : 3)*3600 }); return v;
}
const NA = (v) => json({ error: v && v.error ? 'Could not check your sources right now. Nothing was added.' : (v && v.dead ? 'Your sources list it, but no one is sharing it right now (0 seeders). Nothing was added.' : 'Not available from your sources yet. Nothing was added.'), unavailable:true }, 409);
const out = (r) => r.ok ? json(r.data) : json({ error: (r.data && (r.data.error || r.data.message || (Array.isArray(r.data) && r.data[0]?.errorMessage))) || ('Error '+r.status) }, r.status >= 400 ? r.status : 502);
const slim = (x, type) => ({ id:x.id||0, title:x.title, year:x.year, tvdbId:x.tvdbId, tmdbId:x.tmdbId, overview:(x.overview||'').slice(0,220),
  poster:(x.images||[]).find(i=>i.coverType==='poster')?.remoteUrl||'', inLibrary: !!x.id, monitored:x.monitored, status:x.status,
  seasons: type==='tv' ? (x.statistics?.seasonCount ?? x.seasons?.length) : undefined, hasFile: x.hasFile, sizeOnDisk: x.statistics?.sizeOnDisk ?? x.sizeOnDisk, epFiles: type==='tv' ? x.statistics?.episodeFileCount : undefined, epCount: type==='tv' ? x.statistics?.episodeCount : undefined });

export async function onRequest({ request, env, params }) {
  const p = (params.path||[]).join('/'); const u = new URL(request.url); const q = u.searchParams;
  const type = q.get('type') === 'tv' ? 'tv' : 'movie'; const M = request.method;
  let b = {}; if (M === 'POST') { try { b = await request.json(); } catch {} }
  const T = b.type === 'tv' ? 'tv' : (b.type === 'movie' ? 'movie' : type);

  if (p === 'config' && M === 'GET') return json({ jf: env.JF_BASE||'', ombi: env.OMBI_BASE||'' });
  if (p === 'people' && M === 'GET') {
    const term=(q.get('q')||'').trim().slice(0,80); const role=q.get('role')==='director'?'director':'actor'; if(!term) return json({person:null,items:[]});
    try { return json(env.TMDB_KEY ? await peopleTMDB(env,term,role) : await peopleFree(term,role)); } catch(e) { return json({error: String(e.message||e)}, 502); }
  }
  if (p === 'search' && M === 'GET') {
    const term = (q.get('q')||'').trim().slice(0,100); if (!term) return json([]);
    const r = await call(env, type, (type==='tv'?'series':'movie')+'/lookup?term='+encodeURIComponent(term));
    return r.ok ? json((r.data||[]).slice(0,12).map(x=>slim(x,type))) : out(r);
  }
  if (p === 'options' && M === 'GET') {
    const [qp, rf] = await Promise.all([call(env,type,'qualityprofile'), call(env,type,'rootfolder')]);
    if (!qp.ok) return out(qp); if (!rf.ok) return out(rf);
    return json({ profiles: qp.data.map(x=>({id:x.id,name:x.name})), folders: rf.data.map(x=>({path:x.path,id:x.id,free:x.freeSpace})) });
  }
  if (p === 'library' && M === 'GET') {
    const r = await call(env, type, type==='tv'?'series':'movie');
    return r.ok ? json(r.data.map(x=>slim(x,type)).sort((a,b)=>a.title.localeCompare(b.title))) : out(r);
  }
  if (p === 'episodes' && M === 'GET') {
    const r = await episodeList(env, Number(q.get('id'))||0, q.get('tvdbId')); if (!r.ok) return out(r);
    return json(r.data.sort((a,b)=>a.s-b.s||a.e-b.e));
  }
  if (p === 'pick' && M === 'POST') {
    const id = Number(b.id); if (!id || !validPick(b.pick)) return json({error:'Missing show or choice'},400);
    const sg = await call(env, 'tv', 'series/'+id); if (!sg.ok) return out(sg);
    { const av = await availCheck(env, { type:'tv', title:sg.data.title, year:sg.data.year, tvdbId:sg.data.tvdbId }, true); if (!(av.n > 0)) return NA(av); }
    const l = await episodeList(env, id); if (!l.ok) return out(l);
    const want = chosen(l.data, b.pick, !!b.newOnly);
    if (b.dryRun) return json({dryRun:true, id, seasons:new Set(want.map(x=>x.s)).size, episodes:want.length, search:!!b.search});
    const r = await applyPick(env, id, l.data, b.pick, !!b.newOnly, !!b.search); return r.ok ? json({ok:true, ...r.data}) : out(r);
  }
  if (p === 'add' && M === 'POST') {
    const term = T==='tv' ? 'tvdb:'+Number(b.tvdbId) : 'tmdb:'+Number(b.tmdbId);
    const look = await call(env, T, (T==='tv'?'series':'movie')+'/lookup?term='+encodeURIComponent(term));
    if (!look.ok || !look.data?.[0]) return json({error:'Could not find that title again'}, 404);
    const item = look.data[0]; if (item.id) return json({error:'Already in your library'}, 409);
    { const av = await availCheck(env, { type:T, title:item.title, year:item.year, tmdbId:item.tmdbId, tvdbId:item.tvdbId }, true); if (!(av.n > 0)) return NA(av); }
    item.qualityProfileId = Number(b.qualityProfileId); item.rootFolderPath = String(b.rootFolderPath||''); item.monitored = true;
    if (T==='tv') { item.seasonFolder = true; item.addOptions = { monitor: ['all','future','none','firstSeason','latestSeason'].includes(b.monitor)?b.monitor:'all', searchForMissingEpisodes: b.search !== false }; }
    else { item.minimumAvailability = 'released'; item.addOptions = { searchForMovie: b.search !== false }; }
    const P = T==='tv' && validPick(b.pick) ? b.pick : null; let preview = null;
    if (P) {
      const l = await episodeList(env, 0, item.tvdbId); if (!l.ok) return out(l);
      const want = chosen(l.data, P, !!b.newOnly); if (!want.length) return json({error:'Nothing selected'},400);
      const on = new Set(want.map(x=>x.s));
      item.seasons = (item.seasons||[]).map(x=>({...x, monitored: P.mode==='seasons' && !b.newOnly && on.has(x.seasonNumber)}));
      item.addOptions = { monitor: P.mode==='seasons' && !b.newOnly ? 'unknown' : 'none', searchForMissingEpisodes: false };
      preview = { seasons:on.size, episodes:want.length };
    }
    if (b.dryRun) return json({dryRun:true, wouldAdd:{title:item.title, year:item.year, qualityProfileId:item.qualityProfileId, rootFolderPath:item.rootFolderPath, ...(preview||{})}});
    const r = await call(env, T, T==='tv'?'series':'movie', 'POST', item);
    if (!r.ok) return out(r);
    if (P) { // episodes appear after Sonarr refreshes the new show; wait up to ~20s
      let l = { ok:true, data:[] };
      for (let i=0; i<10 && !l.data.length; i++) { await new Promise(z=>setTimeout(z,2000)); l = await episodeList(env, r.data.id); if (!l.ok) break; }
      if (!l.ok || !l.data.length) return json({added:true, id:r.data.id, title:r.data.title, warning:'Added, but episodes were not ready yet. Use Schedule to pick them.'});
      const a = await applyPick(env, r.data.id, l.data, P, !!b.newOnly, b.search !== false);
      return json({added:true, id:r.data.id, title:r.data.title, ...(a.ok ? a.data : {warning:'Added, but picking episodes failed. Use Schedule.'})});
    }
    return json({added:true, id:r.data.id, title:r.data.title});
  }
  if (p === 'libremove' && M === 'POST') {
    const id = Number(b.id), TT = b.type==='tv' ? 'tv' : 'movie'; if (!id) return json({error:'Missing id'},400);
    const g = await call(env, TT, (TT==='tv'?'series/':'movie/')+id); if (!g.ok) return out(g);
    if (b.confirmTitle !== g.data.title) return json({error:'Tap Remove again to confirm.'},400);
    const scope = TT==='movie' ? 'all' : (['all','season','episode'].includes(b.scope) ? b.scope : null); if (!scope) return json({error:'Pick what to remove'},400);
    if (scope==='all') {
      const size = TT==='tv' ? (g.data.statistics?.sizeOnDisk||0) : (g.data.sizeOnDisk||g.data.statistics?.sizeOnDisk||0);
      if (b.dryRun) return json({dryRun:true, would:'remove '+g.data.title+' and delete its files', freed:size});
      const r = await call(env, TT, (TT==='tv'?'series/':'movie/')+id+'?deleteFiles=true&addImportExclusion=false&addImportListExclusion=false', 'DELETE');
      return r.ok ? json({removed:true, title:g.data.title, freed:size}) : out(r);
    }
    const [ep, ef] = await Promise.all([call(env,'tv','episode?seriesId='+id), call(env,'tv','episodefile?seriesId='+id)]); if (!ep.ok) return out(ep);
    const sn = Number(b.season), eid = Number(b.episodeId);
    const eps = ep.data.filter(e => scope==='season' ? e.seasonNumber===sn : e.id===eid); if (!eps.length) return json({error:'Nothing found to remove'},404);
    const fids = [...new Set(eps.map(e=>e.episodeFileId).filter(x=>x>0))]; const fm = new Map((ef.ok?ef.data:[]).map(x=>[x.id,x.size||0]));
    const size = fids.reduce((a,x)=>a+(fm.get(x)||0),0);
    const what = scope==='season' ? (sn===0?'Specials':'season '+sn) : ('S'+String(eps[0].seasonNumber).padStart(2,'0')+'E'+String(eps[0].episodeNumber).padStart(2,'0'));
    if (b.dryRun) return json({dryRun:true, would:'remove '+what+' of '+g.data.title+' and delete '+fids.length+' file(s)', freed:size});
    const um = await call(env,'tv','episode/monitor','PUT',{ episodeIds:eps.map(e=>e.id), monitored:false }); if (!um.ok) return out(um);
    if (scope==='season') { const s2 = g.data; s2.seasons = (s2.seasons||[]).map(x=>x.seasonNumber===sn?{...x,monitored:false}:x); const pu = await call(env,'tv','series/'+id,'PUT',s2); if (!pu.ok) return out(pu); }
    if (fids.length) { const d = await call(env,'tv','episodefile/bulk','DELETE',{ episodeFileIds:fids }); if (!d.ok) return out(d); }
    return json({removed:true, title:g.data.title+' '+what, freed:size});
  }
  if (p === 'remove' && M === 'POST') {
    const id = Number(b.id); if (!id) return json({error:'Missing id'},400);
    const g = await call(env, T, (T==='tv'?'series/':'movie/')+id); if (!g.ok) return out(g);
    if (b.confirmTitle !== g.data.title) return json({error:'Confirm step missing', needConfirm:true, title:g.data.title}, 400);
    const del = b.deleteFiles === true;
    if (b.dryRun) return json({dryRun:true, wouldRemove:g.data.title, deleteFiles:del});
    const r = await call(env, T, (T==='tv'?'series/':'movie/')+id+'?deleteFiles='+del+'&addImportExclusion=false', 'DELETE');
    return r.ok ? json({removed:true, title:g.data.title, deleteFiles:del}) : out(r);
  }
  if (p === 'monitor' && M === 'POST') {
    const id = Number(b.id); const mode = ['all','future','none','missing','latestSeason'].includes(b.monitor) ? b.monitor : null;
    if (!id || !mode) return json({error:'Missing show or choice'},400);
    const sg = await call(env, 'tv', 'series/'+id); if (!sg.ok) return out(sg);
    if (mode!=='none') { const av = await availCheck(env, { type:'tv', title:sg.data.title, year:sg.data.year, tvdbId:sg.data.tvdbId }, true); if (!(av.n > 0)) return NA(av); }
    if (b.dryRun) return json({dryRun:true, id, title:sg.data.title, monitor:mode});
    const r = await call(env, 'tv', 'seasonpass', 'POST', { series:[{ id, monitored: mode!=='none' }], monitoringOptions:{ monitor: mode } });
    return r.ok ? json({ok:true, monitor:mode}) : out(r);
  }
  if (p.startsWith('indexers')) {
    const SECRET = (f) => ['password','apiKey','userName'].includes(f.privacy) || f.type==='password' || (f.type==='textbox' && /key|pass|cookie|token|secret/i.test(f.name));
    const pub = (x) => ({ key:x.name||x.definitionName, name:x.name||x.definitionName, description:(x.description||'').slice(0,160), privacy:x.privacy, protocol:x.protocol });
    const schemaOf = async (key) => { const r = await call(env,'prowlarr','indexer/schema'); if (!r.ok) return { r };
      const x = r.data.find(y=>(y.name||y.definitionName)===key); return x ? { x } : { r:{ok:false,status:404,data:{error:'Unknown indexer type'}} } };
    const build = async () => { const { x, r } = await schemaOf(String(b.key||'')); if (!x) return { r };
      const v = b.values && typeof b.values==='object' ? b.values : {};
      for (const fl of x.fields) if (Object.prototype.hasOwnProperty.call(v, fl.name)) fl.value = fl.type==='number' ? (v[fl.name]===''||v[fl.name]==null ? null : Number(v[fl.name])) : fl.type==='checkbox' ? !!v[fl.name] : fl.type==='select' && /^-?\d+$/.test(String(v[fl.name])) && fl.name!=='baseUrl' ? Number(v[fl.name]) : v[fl.name];
      const ap = await call(env,'prowlarr','appprofile'); x.appProfileId = ap.ok && ap.data[0] ? ap.data[0].id : 1;
      x.name = String(b.name||x.name||x.definitionName).slice(0,60); x.enable = true; if (b.proxyTag!=null && b.proxyTag!=='' && !/^\d+$/.test(String(b.proxyTag))) { const nm = /711/.test(String(b.proxyTag)) ? '711Proxy' : 'HProxy'; return { r:{ok:false,status:400,data:{error:nm+" isn't set up yet. Pick None, or add the real "+nm+" login under Proxies first."}} }; } const pt = Number(b.proxyTag); x.tags = pt>0 ? [pt] : []; return { x } };
    const errs = (r) => { const d=r.data; return Array.isArray(d) ? d.map(e=>e.errorMessage).filter(Boolean).join(' ') : (d?.message||d?.error||'Test failed') };

    if (p === 'indexers/proxies' && M === 'GET') {
      const [r, tg] = await Promise.all([call(env,'prowlarr','indexerProxy'), call(env,'prowlarr','tag')]); if (!r.ok) return out(r);
      const tn = new Map((tg.ok?tg.data:[]).map(t=>[t.id,t.label]));
      const list = r.data.filter(x=>['Http','Socks4','Socks5','FlareSolverr'].includes(x.implementation)).map(x=>({ id:x.id, name:x.name, kind:x.implementation, host:x.fields.find(f=>f.name==='host')?.value||'', port:x.fields.find(f=>f.name==='port')?.value||'', login: !!x.fields.find(f=>f.name==='username')?.value, tag:(x.tags||[])[0]??null, tagName: tn.get((x.tags||[])[0])||null }));
      const L = list.slice(); if (!list.some(x=>/^hproxy/i.test(x.name)||x.tagName==='hproxy')) L.push({ id:null, name:'HProxy (waiting for funds, not usable yet)', kind:'Socks5', host:'', port:'', login:false, tag:null, pending:'hproxy' });
      if (!list.some(x=>/711/.test(x.name)||x.tagName==='711proxy')) L.push({ id:null, name:'711Proxy (not set up yet)', kind:'Socks5', host:'', port:'', login:false, tag:null, pending:'711proxy', hint:'Fixed home-internet style address, about $3.50 per address with unlimited traffic; good for a source blocked in your region. Pay as you go.' }); return json(L);
    }
    if (p === 'indexers/proxy' && M === 'POST') {
      const kind = ['Http','Socks4','Socks5','FlareSolverr'].includes(b.kind) ? b.kind : null; if (!kind) return json({error:'Pick Http, Socks4, Socks5 or FlareSolverr'},400);
      const FS = kind==='FlareSolverr'; const host = String(b.host||'').trim(), port = Number(b.port);
      if (FS ? !/^https?:\/\/[a-z0-9.\-]+(:\d{1,5})?\/?$/i.test(host) : (!/^[a-z0-9.\-:\[\]]{1,253}$/i.test(host) || !(port>0 && port<65536))) return json({error: FS ? 'Host must look like http://name:8191' : 'Check the host and port'},400);
      const sc = await call(env,'prowlarr','indexerProxy/schema'); const t = sc.ok ? sc.data.find(x=>x.implementation===kind) : null; if (!t) return json({error:'Proxy type not available'},502);
      const name = String(b.name||'').trim().slice(0,40) || (kind+' '+host); const label = /^hproxy/i.test(name) ? 'hproxy' : /711/.test(name) ? '711proxy' : (FS ? 'flaresolverr-' : 'proxy-')+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30);
      t.name = name; for (const f of t.fields) { if (f.name==='host') f.value=FS && !host.endsWith('/') ? host+'/' : host; if (f.name==='port') f.value=port; if (f.name==='requestTimeout') f.value=Number(b.timeout)||60; if (f.name==='username') f.value=String(b.username||''); if (f.name==='password') f.value=String(b.password||''); }
      const tst = await call(env,'prowlarr','indexerProxy/test','POST',{ ...t, tags:[] }); if (!tst.ok) return json({ error:'Proxy test failed: '+errs(tst) }, 400);
      if (b.dryRun) return json({ dryRun:true, would:'add proxy '+name });
      const tg = await call(env,'prowlarr','tag'); let tag = (tg.ok?tg.data:[]).find(x=>x.label===label);
      if (!tag) { const nt = await call(env,'prowlarr','tag','POST',{ label }); if (!nt.ok) return out(nt); tag = nt.data; }
      t.tags = [tag.id]; const r = await call(env,'prowlarr','indexerProxy','POST',t); return r.ok ? json({ ok:true, id:r.data.id, tag:tag.id }) : json({ error: errs(r) }, 400);
    }
    if (p === 'indexers/proxy/edit' && M === 'POST') {
      const id = Number(b.id); const g = await call(env,'prowlarr','indexerProxy/'+id); if (!g.ok) return json({error:'Proxy not found'},404);
      const t = g.data; const FS = t.implementation==='FlareSolverr'; const host = String(b.host||'').trim(), port = Number(b.port);
      if (FS ? !/^https?:\/\/[a-z0-9.\-]+(:\d{1,5})?\/?$/i.test(host) : (!/^[a-z0-9.\-:\[\]]{1,253}$/i.test(host) || !(port>0 && port<65536))) return json({error:'Check the host and port'},400);
      if (b.name) t.name = String(b.name).trim().slice(0,40);
      for (const f of t.fields) { if (f.name==='host') f.value=host; if (!FS && f.name==='port') f.value=port; if (f.name==='username' && b.username!=null) f.value=String(b.username); if (f.name==='password' && b.password) f.value=String(b.password); }
      const tst = await call(env,'prowlarr','indexerProxy/test','POST',{ ...t, tags:[] }); if (!tst.ok) return json({ error:'Proxy test failed: '+errs(tst) }, 400);
      if (b.dryRun) return json({ dryRun:true, would:'update proxy '+t.name });
      const r = await call(env,'prowlarr','indexerProxy/'+id,'PUT',t); return r.ok ? json({ ok:true }) : json({ error: errs(r) }, 400);
    }
    if (p === 'indexers/proxy/remove' && M === 'POST') {
      const id = Number(b.id); const g = await call(env,'prowlarr','indexerProxy/'+id); if (!g.ok) return json({error:'Proxy not found'},404);
      if (b.dryRun) return json({ dryRun:true, would:'remove '+g.data.name });
      const r = await call(env,'prowlarr','indexerProxy/'+id,'DELETE'); return r.ok ? json({ ok:true }) : out(r);
    }
    if (p === 'indexers' && M === 'GET') {
      const [ix, is, apps] = await Promise.all([call(env,'prowlarr','indexer'), call(env,'prowlarr','indexerstatus'), call(env,'prowlarr','applications')]);
      if (!ix.ok) return out(ix); const bad = new Map((is.ok?is.data:[]).map(s=>[s.indexerId,s]));
      return json({ indexers: ix.data.map(x=>({ id:x.id, name:x.name, enable:x.enable, protocol:x.protocol, privacy:x.privacy, health: !x.enable ? 'off' : bad.has(x.id) ? 'failing' : 'ok', failingUntil: bad.get(x.id)?.disabledTill||null })),
        sync: (apps.ok?apps.data:[]).map(a=>({ name:a.name, level:a.syncLevel, enable:a.enable!==false })) });
    }
    if (p === 'indexers/types' && M === 'GET') {
      const t = (q.get('q')||'').toLowerCase().trim(); if (t.length<2) return json([]); const r = await call(env,'prowlarr','indexer/schema'); if (!r.ok) return out(r);
      return json(r.data.filter(x=>!t || (x.name||'').toLowerCase().includes(t) || (x.definitionName||'').toLowerCase().includes(t)).slice(0,25).map(pub));
    }
    if (p === 'indexers/fields' && M === 'GET') {
      const { x, r } = await schemaOf(String(q.get('key')||'')); if (!x) return out(r);
      return json({ ...pub(x), fields: x.fields.filter(f=>!f.advanced && f.type!=='info' && f.type!=='cardigannCaptcha' && f.hidden!=='hidden').map(f=>({ name:f.name, label:f.label||f.name, type:f.type, help:(f.helpText||'').slice(0,200), secret:SECRET(f),
        options:(f.selectOptions||[]).map(o=>({value:o.value, name:o.name})), urls: f.name==='baseUrl' ? (x.indexerUrls||[]) : undefined, value: SECRET(f) ? '' : (f.name==='baseUrl' ? (f.value || (x.indexerUrls||[])[0] || '') : f.value) })) });
    }
    if ((p === 'indexers/test' || p === 'indexers/save') && M === 'POST') {
      const { x, r } = await build(); if (!x) return out(r);
      const t = await call(env,'prowlarr','indexer/test','POST',x);
      if (!t.ok) return json({ ok:false, error: errs(t) }, 400);
      if (p === 'indexers/test') return json({ ok:true });
      if (b.dryRun) return json({ dryRun:true, wouldSave:{ name:x.name } });
      const s2 = await call(env,'prowlarr','indexer','POST',x); return s2.ok ? json({ ok:true, id:s2.data.id, name:s2.data.name }) : json({ error: errs(s2) }, 400);
    }
    if (p === 'indexers/toggle' && M === 'POST') {
      const id = Number(b.id); const g = await call(env,'prowlarr','indexer/'+id); if (!g.ok) return json({error:'Source not found'},404);
      if (b.dryRun) return json({ dryRun:true, id, name:g.data.name, enable:!!b.enable });
      g.data.enable = !!b.enable; const r = await call(env,'prowlarr','indexer/'+id,'PUT',g.data); return r.ok ? json({ ok:true, enable:r.data.enable }) : out(r);
    }
    if (p === 'indexers/seed' && M === 'GET') {
      const g = await call(env,'prowlarr','indexer/'+Number(q.get('id'))); if (!g.ok) return json({error:'Source not found'},404);
      const f = g.data.fields.find(x=>x.name==='torrentBaseSettings.seedRatio'); return json({ id:g.data.id, name:g.data.name, protocol:g.data.protocol, privacy:g.data.privacy, has: !!f, seedRatio: f ? f.value ?? null : null });
    }
    if (p === 'indexers/seed' && M === 'POST') {
      const id = Number(b.id); const g = await call(env,'prowlarr','indexer/'+id); if (!g.ok) return json({error:'Source not found'},404);
      const f = g.data.fields.find(x=>x.name==='torrentBaseSettings.seedRatio'); if (!f || g.data.protocol!=='torrent') return json({error:'This source has no seed ratio'},400);
      const v = b.seedRatio===''||b.seedRatio==null ? null : Number(b.seedRatio); if (v!=null && !(v>=0 && v<=100)) return json({error:'Bad ratio'},400);
      if (b.dryRun) return json({ dryRun:true, name:g.data.name, seedRatio:v }); f.value = v;
      const r = await call(env,'prowlarr','indexer/'+id,'PUT',g.data); return r.ok ? json({ ok:true, seedRatio:v }) : json({ error: errs(r) }, 400);
    }
    if (p === 'indexers/remove' && M === 'POST') {
      const id = Number(b.id); const g = await call(env,'prowlarr','indexer/'+id); if (!g.ok) return json({error:'Source not found'},404);
      if (String(b.confirmName||'') !== g.data.name) return json({error:'Name does not match'},400);
      if (b.dryRun) return json({ dryRun:true, wouldRemove:g.data.name });
      const r = await call(env,'prowlarr','indexer/'+id,'DELETE'); return r.ok ? json({ ok:true }) : out(r);
    }
    return json({error:'Not found'},404);
  }
  if (p.startsWith('settings')) {
    const A = (b.type||q.get('type')) === 'tv' ? 'tv' : 'movie', K = A==='tv' ? 'sonarr' : 'radarr';
    const bundle = async () => (await (await env.ASSETS.fetch(new URL('/recommended-settings.json', request.url))).json());
    if (p === 'settings' && M === 'GET') {
      const [bd, nm, qp, cf, rf] = await Promise.all([bundle(), call(env,A,'config/naming'), call(env,A,'qualityprofile'), call(env,A,'customformat'), call(env,A,'rootfolder')]);
      if (!nm.ok) return out(nm); const T = bd.apps[K]; const have = new Set((cf.ok?cf.data:[]).map(c=>c.name));
      const bks = env.AUTH ? (await env.AUTH.list({prefix:'bk:'+K+':'})).keys.map(k=>k.name).slice(-5) : [];
      return json({ source: bd.source, fetched: bd.fetched, guide: T.profile.guide_url,
        naming: Object.entries(T.naming).map(([k,v])=>({ key:k, now: nm.data[k]??'', rec: v, same: nm.data[k]===v })), renameOn: !!(nm.data.renameMovies ?? nm.data.renameEpisodes),
        profile: { name: T.profile.name, exists: (qp.ok?qp.data:[]).some(x=>x.name===T.profile.name) }, profiles: (qp.ok?qp.data:[]).map(x=>x.name),
        formats: { total: T.customFormats.length, missing: T.customFormats.filter(c=>!have.has(c.name)).length },
        folders: (rf.ok?rf.data:[]).map(x=>({ path:x.path, free:x.freeSpace })), backups: bks });
    }
    if (p === 'settings/backup' && M === 'POST') {
      const [nm, qp, cf, md] = await Promise.all([call(env,A,'config/naming'), call(env,A,'qualityprofile'), call(env,A,'customformat'), call(env,A,'config/mediamanagement')]);
      if (!nm.ok || !qp.ok || !cf.ok) return json({error:'Could not read current settings'},502);
      const key = 'bk:'+K+':'+new Date().toISOString(); const body = { app:K, at:Date.now(), naming:nm.data, qualityprofile:qp.data, customformat:cf.data, mediamanagement: md.ok?md.data:null };
      if (b.dryRun) return json({ dryRun:true, key, size: JSON.stringify(body).length });
      await env.AUTH.put(key, JSON.stringify(body), { expirationTtl: 3600*24*180 }); return json({ ok:true, key });
    }
    if (p === 'settings/apply' && M === 'POST') {
      if (!b.confirm) return json({error:'Confirm first'},400);
      if (!b.dryRun && !(b.backupKey && String(b.backupKey).startsWith('bk:'+K+':') && await env.AUTH.get(b.backupKey))) return json({error:'Make a backup first'},400);
      const T = (await bundle()).apps[K];
      if (b.step === 'naming') { const nm = await call(env,A,'config/naming'); if (!nm.ok) return out(nm); const n = { ...nm.data, ...T.naming }; if (A==='movie') n.renameMovies = true; else n.renameEpisodes = true;
        if (b.dryRun) return json({ dryRun:true, would:'naming' }); const r = await call(env,A,'config/naming','PUT',n); return r.ok ? json({ok:true}) : out(r); }
      if (b.step === 'cf') { const i = Number(b.index); const c = T.customFormats[i]; if (!c) return json({ done:true });
        const ex = await call(env,A,'customformat'); const old = (ex.ok?ex.data:[]).find(x=>x.name===c.name);
        const body = { name:c.name, includeCustomFormatWhenRenaming:c.includeCustomFormatWhenRenaming, specifications:c.specifications };
        if (b.dryRun) return json({ dryRun:true, name:c.name, total:T.customFormats.length });
        const r = old ? await call(env,A,'customformat/'+old.id,'PUT',{...body,id:old.id}) : await call(env,A,'customformat','POST',body);
        return r.ok ? json({ ok:true, name:c.name, total:T.customFormats.length }) : out(r); }
      if (b.step === 'profile') {
        const [sc, cf, qp] = await Promise.all([call(env,A,'qualityprofile/schema'), call(env,A,'customformat'), call(env,A,'qualityprofile')]); if (!sc.ok) return out(sc);
        const flat = []; for (const it of sc.data.items) { if (it.quality) flat.push(it.quality); else for (const x of it.items||[]) flat.push(x.quality); }
        const byName = new Map(flat.map(qq=>[qq.name,qq])); let gid = 1000; const items = []; let cutoff = null;
        for (const it of [...T.profile.items].reverse()) {
          if (it.items) { const id = gid++; items.push({ id, name: it.name, allowed: it.allowed, items: it.items.filter(n=>byName.has(n)).map(n=>({ quality: byName.get(n), items:[], allowed: it.allowed })) }); if (it.name===T.profile.cutoff) cutoff = id; }
          else if (byName.has(it.name)) { const qq = byName.get(it.name); items.push({ quality: qq, items:[], allowed: it.allowed }); if (it.name===T.profile.cutoff) cutoff = qq.id; }
        }
        const used = new Set(items.flatMap(x=>x.quality?[x.quality.id]:x.items.map(y=>y.quality.id)));
        for (const qq of flat) if (!used.has(qq.id)) items.unshift({ quality: qq, items:[], allowed:false });
        const score = new Map(T.customFormats.map(c=>[c.name,c.score]));
        const prof = { ...sc.data, name: T.profile.name, upgradeAllowed: T.profile.upgradeAllowed, cutoff, items, minFormatScore: T.profile.minFormatScore, cutoffFormatScore: T.profile.cutoffFormatScore, minUpgradeFormatScore: T.profile.minUpgradeFormatScore ?? 1,
          formatItems: (cf.ok?cf.data:[]).map(c=>({ format:c.id, name:c.name, score: score.get(c.name) ?? 0 })) };
        if (A==='movie' && T.profile.language==='Original') prof.language = { id:-2, name:'Original' };
        if (b.dryRun) return json({ dryRun:true, would:'profile', name: prof.name, cutoff });
        const old = (qp.ok?qp.data:[]).find(x=>x.name===prof.name);
        const r = old ? await call(env,A,'qualityprofile/'+old.id,'PUT',{...prof,id:old.id}) : await call(env,A,'qualityprofile','POST',prof); return r.ok ? json({ ok:true, id:r.data.id }) : out(r);
      }
      return json({error:'Unknown step'},400);
    }
    if (p === 'settings/restore' && M === 'POST') {
      if (!b.confirm) return json({error:'Confirm first'},400); const k = String(b.key||''); if (!k.startsWith('bk:'+K+':')) return json({error:'Pick a backup'},400);
      const bk = await env.AUTH.get(k,'json'); if (!bk) return json({error:'Backup not found'},404);
      if (b.dryRun) return json({ dryRun:true, would:'restore naming and profiles from '+k.split(':').slice(2).join(':') });
      const r1 = await call(env,A,'config/naming','PUT',bk.naming); const cur = await call(env,A,'qualityprofile'); let n = 0;
      for (const qp2 of bk.qualityprofile) { if ((cur.ok?cur.data:[]).some(x=>x.id===qp2.id)) { const r = await call(env,A,'qualityprofile/'+qp2.id,'PUT',qp2); if (r.ok) n++; } }
      return json({ ok: r1.ok, profiles: n });
    }
    return json({error:'Not found'},404);
  }
  if (p === 'avail' && M === 'POST') {
    const list = (Array.isArray(b.items) ? b.items : []).slice(0, 4); const outv = {};
    await Promise.all(list.map(async (it) => { outv[it.key] = await availCheck(env, it, false); }));
    return json(outv);
  }
  if (p === 'recs' && M === 'GET') {
    const T2 = type; const k = 'recs:'+T2; const c = env.AUTH && await env.AUTH.get(k, 'json');
    const fresh = c && Date.now()-c.at < 8*3600e3;
    const build = async () => {
      const [r, lib] = await Promise.all([call(env,'prowlarr','search?type=search&limit=100&query=&categories='+(T2==='tv'?5000:2000)), call(env,T2,T2==='tv'?'series':'movie')]);
      if (!r.ok) throw new Error('Could not reach your sources');
      const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      const have = new Set((lib.ok?lib.data:[]).map(x=>norm(x.title)));
      const agg = new Map();
      for (const x of r.data) { const raw = String(x.title||''); let m, title, year = null;
        if (T2==='tv') { m = /^(.+?)[ ._-]+(?:S\d{1,2}(?:E\d{1,3})?|\d{4}[ ._]\d{2}[ ._]\d{2})\b/i.exec(raw); if (!m) continue; title = m[1]; }
        else { m = /^(.+?)[ ._(\[]+((?:19|20)\d{2})\b/.exec(raw); if (!m) continue; title = m[1]; year = +m[2]; }
        title = title.replace(/[._]+/g,' ').replace(/\s+/g,' ').trim(); if (T2==='tv') title = title.replace(/ (?:19|20)\d{2}$/,''); const key = norm(title)+'|'+(year||''); if (!title || have.has(norm(title))) continue;
        const a = agg.get(key) || { title, year, score:0, releases:0 }; a.score += (x.seeders||0) + (x.grabs||0); a.releases++; agg.set(key, a); }
      const v = { at: Date.now(), items: [...agg.values()].sort((a,b)=>b.score-a.score).slice(0,12) };
      if (env.AUTH) await env.AUTH.put(k, JSON.stringify(v), { expirationTtl: 24*3600 }); return v;
    };
    if (fresh) return json(c);
    try { return json(await build()); } catch (e) { return c ? json({ ...c, stale:true }) : json({ error:String(e.message||e) }, 502); }
  }
  if (p === 'releases' && M === 'GET') {
    const T2 = type, id = Number(q.get('id')); if (!id) return json({error:'Missing id'},400);
    const r = await call(env, T2, 'release?'+(T2==='tv'?'episodeId=':'movieId=')+id); if (!r.ok) return out(r);
    return json(r.data.slice().sort((a,b2)=>(b2.customFormatScore||0)-(a.customFormatScore||0)||(b2.seeders||0)-(a.seeders||0)).slice(0,25).map(x=>({ guid:x.guid, indexerId:x.indexerId, title:x.title, size:x.size, seeders:x.seeders, quality:x.quality?.quality?.name, score:x.customFormatScore||0, rejected:!!x.rejected, why:(x.rejections||[]).slice(0,2).join('; ') })));
  }
  if (p === 'dropwait' && M === 'POST') {
    const TT = b.type==='tv' ? 'tv' : 'movie', id = Number(b.id), qid = Number(b.qid)||0; if (!id) return json({error:'Missing id'},400);
    const g = await call(env, TT, (TT==='tv'?'series/':'movie/')+id); if (!g.ok) return out(g);
    if (b.confirmTitle !== g.data.title) return json({error:'Tap Remove again to confirm.'},400);
    if (TT==='movie' && g.data.hasFile && !qid) return json({error:'This movie has a file. Use Remove from library instead.'},400);
    if (b.dryRun) return json({ dryRun:true, would:'remove '+g.data.title+' from Waiting' });
    if (qid) { const d = await call(env, TT, 'queue/'+qid+'?removeFromClient=true&blocklist=true&skipRedownload=true', 'DELETE'); if (!d.ok && d.status!==404) return out(d); }
    if (TT==='movie') { if (!g.data.hasFile) { const d = await call(env,'movie','movie/'+id+'?deleteFiles=false&addImportExclusion=false','DELETE'); if (!d.ok) return out(d); } else { g.data.monitored=false; await call(env,'movie','movie/'+id,'PUT',g.data); } }
    else if (Number(b.eid)) { await call(env,'tv','episode/monitor','PUT',{ episodeIds:[Number(b.eid)], monitored:false }); }
    return json({ ok:true, title:g.data.title });
  }
  if (p === 'grab' && M === 'POST') {
    if (!b.guid || !b.indexerId) return json({error:'Missing release'},400);
    if (b.dryRun) return json({ dryRun:true, would:'grab '+String(b.title||'release').slice(0,80) });
    const r = await call(env, T, 'release', 'POST', { guid:String(b.guid), indexerId:Number(b.indexerId) }); return r.ok ? json({ ok:true }) : out(r);
  }
  if (p === 'blocklist' && M === 'POST') {
    const id = Number(b.qid); if (!id) return json({error:'Missing download'},400);
    if (b.dryRun) return json({ dryRun:true, would:'blocklist and search again' });
    const r = await call(env, T, 'queue/'+id+'?removeFromClient=true&blocklist=true&skipRedownload=false', 'DELETE'); return r.ok ? json({ ok:true }) : out(r);
  }
  if (p === 'system' && M === 'GET') {
    const apps = [['tv','Sonarr'],['movie','Radarr'],['prowlarr','Prowlarr']];
    const res = await Promise.all(apps.map(async ([a,n]) => { const [st2, up] = await Promise.all([call(env,a,'system/status'), call(env,a,'update')]);
      const latest = up.ok ? up.data[0] : null; return { app:a, name:n, version: st2.ok ? st2.data.version : null, docker: st2.ok ? !!st2.data.isDocker : null,
        latest: latest?.version || null, canUpdate: !!(latest && !latest.installed && latest.installable), managed: !!(latest && !latest.installed && !latest.installable) }; }));
    const nt = await Promise.all([['tv','Sonarr'],['movie','Radarr']].map(async ([a,n]) => { const r = await call(env,a,'notification'); const x = r.ok ? r.data.find(y=>y.implementation==='Ntfy' && y.name==='Media remote') : null;
      return { app:a, name:n, on: !!x, topic: x ? (x.fields.find(f=>f.name==='topics')?.value||[])[0] || null : null }; }));
    return json({ apps: res, notify: nt });
  }
  if (p === 'system/update' && M === 'POST') {
    const a = ['tv','movie','prowlarr'].includes(b.app) ? b.app : null; if (!a || !b.confirm) return json({error:'Confirm first'},400);
    const up = await call(env,a,'update'); const l = up.ok ? up.data[0] : null; if (!l || l.installed || !l.installable) return json({error:'No update this app can install itself. It is updated by the seedbox.'},400);
    if (b.dryRun) return json({ dryRun:true, would:'update to '+l.version });
    const r = await call(env,a,'command','POST',{ name:'ApplicationUpdate' }); return r.ok ? json({ ok:true, version:l.version }) : out(r);
  }
  if (p === 'system/notify' && M === 'POST') {
    if (!b.confirm) return json({error:'Confirm first'},400);
    const rnd = crypto.getRandomValues(new Uint8Array(12)); const topic = 'mr-' + [...rnd].map(x=>x.toString(16).padStart(2,'0')).join('');
    if (b.dryRun) return json({ dryRun:true, would:'add ntfy alerts to Sonarr and Radarr' });
    const outr = {};
    for (const [a] of [['tv'],['movie']]) {
      const sc = await call(env,a,'notification/schema'); const t = sc.ok ? sc.data.find(x=>x.implementation==='Ntfy') : null; if (!t) { outr[a]='no ntfy'; continue; }
      const ex = await call(env,a,'notification'); const old = ex.ok ? ex.data.find(y=>y.implementation==='Ntfy' && y.name==='Media remote') : null;
      const body = { ...(old||t), name:'Media remote', onGrab:false, onDownload:true, onUpgrade:true, onImportComplete:true, onHealthIssue:false, onManualInteractionRequired:true };
      for (const f of body.fields) { if (f.name==='serverUrl') f.value='https://ntfy.sh'; if (f.name==='topics') f.value=[ (old ? (old.fields.find(g=>g.name==='topics')?.value||[])[0] : null) || topic ]; if (f.name==='priority') f.value=3; }
      const r = old ? await call(env,a,'notification/'+old.id,'PUT',body) : await call(env,a,'notification','POST',body); outr[a] = r.ok ? 'ok' : errText(r);
    }
    return json({ ok:true, result:outr });
  }
  if (p === 'system/export' && M === 'GET') {
    const pick = async (a) => { const [nm, qp, cf, md] = await Promise.all([call(env,a,'config/naming'), call(env,a,'qualityprofile'), call(env,a,'customformat'), call(env,a,'config/mediamanagement')]); return { naming:nm.data, qualityprofile:qp.data, customformat:cf.data, mediamanagement:md.data }; };
    const [sn, rd, ix] = await Promise.all([pick('tv'), pick('movie'), call(env,'prowlarr','indexer')]);
    return new Response(JSON.stringify({ exportedAt:new Date().toISOString(), note:'No passwords or API keys are included.', sonarr:sn, radarr:rd, prowlarrSources:(ix.ok?ix.data:[]).map(x=>({ name:x.name, definition:x.definitionName, enable:x.enable })) }, null, 1),
      { headers:{ 'content-type':'application/json', 'content-disposition':'attachment; filename="media-remote-backup.json"', 'cache-control':'no-store' } });
  }
  if (p === 'activity' && M === 'GET') {
    const [hm, ht, mv, wt, qm, qs] = await Promise.all([
      call(env,'movie','history?pageSize=40&sortKey=date&sortDirection=descending&includeMovie=true'),
      call(env,'tv','history?pageSize=40&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true'),
      call(env,'movie','movie'), call(env,'tv','wanted/missing?pageSize=500&monitored=true&includeSeries=true&sortKey=airDateUtc&sortDirection=descending'),
      call(env,'movie','queue?pageSize=100&includeMovie=true'), call(env,'tv','queue?pageSize=100&includeSeries=true&includeEpisode=true')]);
    const EV = { grabbed:'grabbed', downloadFolderImported:'imported', episodeFileImported:'imported', movieFileImported:'imported', downloadFailed:'failed', importFailed:'failed' };
    const poster = (x) => (x?.images||[]).find(i=>i.coverType==='poster')?.remoteUrl || '';
    const movies = mv.ok ? mv.data : [];
    const have = new Map(movies.map(m=>[m.id,m]));
    const ep = (e) => `S${String(e?.seasonNumber??0).padStart(2,'0')}E${String(e?.episodeNumber??0).padStart(2,'0')}`;
    const recent = [
      ...(hm.ok ? hm.data.records : []).filter(r=>EV[r.eventType]).map(r=>({ type:'movie', id:r.movieId, title:r.movie?.title||r.sourceTitle, event:EV[r.eventType], at:r.date, inLibrary: !!have.get(r.movieId)?.hasFile, poster: poster(r.movie) })),
      ...(ht.ok ? ht.data.records : []).filter(r=>EV[r.eventType]).map(r=>({ type:'tv', id:r.seriesId, title:(r.series?.title||r.sourceTitle)+' '+ep(r.episode), event:EV[r.eventType], at:r.date, inLibrary: !!r.episode?.hasFile || EV[r.eventType]==='imported', poster: poster(r.series) }))
    ].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,30);
    const inQm = new Set((qm.ok ? qm.data.records : []).map(x=>x.movieId)), inQs = new Set((qs.ok ? qs.data.records : []).map(x=>x.episodeId));
    const waiting = [
      ...movies.filter(m=>m.monitored && !m.hasFile && !inQm.has(m.id)).map(m=>({ type:'movie', id:m.id, title:m.title, year:m.year, lastSearch:m.lastSearchTime||null, available: m.isAvailable !== false, poster: poster(m) })),
      ...(() => { const by = new Map(); const nowI = new Date().toISOString();
        for (const e of (wt.ok ? wt.data.records : [])) { if (e.monitored===false || e.hasFile || inQs.has(e.id) || !e.airDateUtc || e.airDateUtc > nowI) continue;
          const g = by.get(e.seriesId) || { type:'series', id:e.seriesId, title:e.series?.title||'', missing:0, have:e.series?.statistics?.episodeFileCount ?? null, total:e.series?.statistics?.episodeCount ?? null, lastSearch:null, available:true, poster:poster(e.series) };
          g.missing++; if (e.lastSearchTime && (!g.lastSearch || e.lastSearchTime > g.lastSearch)) g.lastSearch = e.lastSearchTime; by.set(e.seriesId, g); }
        return [...by.values()]; })()
    ];
    const stuck = (x) => x.status==='warning' || x.trackedDownloadStatus==='warning' || /stall|no seed|no connection|metadata/i.test(JSON.stringify(x.statusMessages||[])+' '+(x.errorMessage||'')+' '+(x.status||''));
    for (const [r2, ty] of [[qm,'movie'],[qs,'tv']]) for (const x of (r2.ok ? r2.data.records : [])) if (stuck(x)) waiting.unshift({ type:ty, id: ty==='movie' ? x.movieId : x.seriesId, eid:x.episodeId||null, qid:x.id, title: ty==='movie' ? (x.movie?.title||x.title) : (x.series?.title||x.title)+' '+ep(x.episode), stalled:true, noSeed:true, poster: poster(ty==='movie'?x.movie:x.series) });
    if (env.AUTH) await Promise.all(waiting.filter(w=>w.type==='movie' && !w.stalled).map(async w => { const m = have.get(w.id); const c = m && await env.AUTH.get('av3:movie:'+String(m.tmdbId||m.title).slice(0,60), 'json'); if (c && !c.n) { w.noSeed = true; w.dead = c.dead||0; } }));
    return json({ recent, waiting, up:{ radarr: hm.ok, sonarr: ht.ok } });
  }
  if (p === 'searchagain' && M === 'POST') {
    const id = Number(b.id); if (!id) return json({error:'Missing id'},400);
    const T2 = b.type === 'tv' || b.type === 'series' ? 'tv' : 'movie', SER = b.type === 'series';
    const chk = await call(env, T2, SER ? 'series/'+id : T2==='tv' ? 'episode/'+id : 'movie/'+id); if (!chk.ok) return json({error:'Not found in your library'},404);
    if (!chk.data.monitored) return json({error:'Not monitored'},400);
    if (b.dryRun) return json({dryRun:true, wouldSearch:{type:T2, id, title: chk.data.title}});
    const r = await call(env, T2, 'command', 'POST', SER ? {name:'MissingEpisodeSearch', seriesId:id, monitored:true} : T2==='tv' ? {name:'EpisodeSearch', episodeIds:[id]} : {name:'MoviesSearch', movieIds:[id]});
    return r.ok ? json({ok:true, started:true}) : out(r);
  }
  if (p === 'libstats' && M === 'GET') {
    const [mv, sr, dsk] = await Promise.all([call(env,'movie','movie'), call(env,'tv','series'), call(env,'movie','diskspace')]);
    const poster = (x) => (x?.images||[]).find(i=>i.coverType==='poster')?.remoteUrl || '';
    const M2 = mv.ok ? mv.data : [], S2 = sr.ok ? sr.data : [];
    const g = {}; for (const x of [...M2, ...S2]) for (const k of (x.genres||[]).slice(0,3)) g[k]=(g[k]||0)+1;
    const dec = {}; for (const x of [...M2, ...S2]) if (x.year) { const d = Math.floor(x.year/10)*10; dec[d]=(dec[d]||0)+1; }
    const all = [...M2.map(x=>({type:'movie',id:x.id,title:x.title,year:x.year,added:x.added,poster:poster(x),hasFile:x.hasFile,overview:(x.overview||'').slice(0,300),size:x.sizeOnDisk||0,genres:(x.genres||[]).slice(0,3)})), ...S2.map(x=>({type:'tv',id:x.id,title:x.title,year:x.year,added:x.added,poster:poster(x),hasFile:(x.statistics?.episodeFileCount||0)>0,overview:(x.overview||'').slice(0,300),size:x.statistics?.sizeOnDisk||0,episodes:x.statistics?.episodeFileCount||0,genres:(x.genres||[]).slice(0,3)}))];
    return json({
      movies: M2.length, moviesOnDisk: M2.filter(x=>x.hasFile).length, shows: S2.length,
      episodes: S2.reduce((a,x)=>a+(x.statistics?.episodeFileCount||0),0),
      size: M2.reduce((a,x)=>a+(x.sizeOnDisk||0),0) + S2.reduce((a,x)=>a+(x.statistics?.sizeOnDisk||0),0),
      recent: all.sort((a,b)=>String(b.added).localeCompare(String(a.added))).slice(0,8).map(({overview,...r})=>r), items: all.map(x=>x),
      genres: Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,n])=>({name,n})),
      decades: Object.entries(dec).sort((a,b)=>a[0]-b[0]).map(([d,n])=>({d:+d,n})),
      free: dsk.ok && dsk.data.length ? Math.max(...dsk.data.map(d=>d.freeSpace||0)) : null,
      up:{ radarr: mv.ok, sonarr: sr.ok }
    });
  }
  if (p === 'status' && M === 'GET') {
    const now = new Date(), end = new Date(Date.now()+8*864e5);
    const [sq, rq, cal, ds, hs, hr, hp] = await Promise.all([
      call(env,'tv','queue?pageSize=20&includeSeries=true&includeEpisode=true'), call(env,'movie','queue?pageSize=20&includeMovie=true'),
      call(env,'tv',`calendar?start=${now.toISOString()}&end=${end.toISOString()}&includeSeries=true`),
      call(env,'movie','diskspace'), call(env,'tv','health'), call(env,'movie','health'), call(env,'prowlarr','health')]);
    const qt = await quota(env); const [ixs, mcal] = await Promise.all([call(env,'prowlarr','indexerstatus'), call(env,'movie',`calendar?start=${now.toISOString()}&end=${new Date(Date.now()+30*864e5).toISOString()}`)]);
    const q2 = (r, k) => (r.ok ? (r.data.records||[]) : []).map(x=>({ title: k==='tv' ? `${x.series?.title||x.title} S${String(x.episode?.seasonNumber??'').padStart(2,'0')}E${String(x.episode?.episodeNumber??'').padStart(2,'0')}` : (x.movie?.title||x.title),
      qid: x.id, mid: x.movieId||null, eid: x.episodeId||null, pct: x.size ? Math.round(100*(1-(x.sizeleft/x.size))) : 0, left: x.timeleft||'', state: x.trackedDownloadState||x.status, type:k,
      size: x.size ?? null, sizeleft: x.sizeleft ?? null, timeleft: x.timeleft || null, status: x.status || null, trackedDownloadState: x.trackedDownloadState || null, trackedDownloadStatus: x.trackedDownloadStatus || null }));
    const health = (r, name) => r.ok ? r.data.map(h=>({app:name, type:h.type, msg:h.message})) : [{app:name, type:'error', msg:'Not reachable'}];
    return json({
      queue: [...q2(sq,'tv'), ...q2(rq,'movie')],
      upcoming: cal.ok ? cal.data.map(e=>({ show:e.series?.title, ep:`S${String(e.seasonNumber).padStart(2,'0')}E${String(e.episodeNumber).padStart(2,'0')}`, name:e.title, at:e.airDateUtc, hasFile:e.hasFile })) : [],
      disk: ds.ok ? ds.data.map(d=>({path:d.path, free:d.freeSpace, total:d.totalSpace})) : [],
      health: [...health(hs,'Sonarr'), ...health(hr,'Radarr'), ...health(hp,'Prowlarr')],
      movieCal: mcal.ok ? mcal.data.flatMap(m=>[['digitalRelease','Digital release'],['physicalRelease','Disc release'],['inCinemas','In cinemas']].filter(([k])=>m[k]&&m[k]>=now.toISOString()&&m[k]<=new Date(Date.now()+30*864e5).toISOString()).map(([k,l])=>({ show:m.title, ep:l, name:m.year?String(m.year):'', at:m[k], hasFile:m.hasFile, type:'movie' }))) : [],
      badIndexers: ixs.ok ? ixs.data.length : 0,
      storage: qt ? { quotaTotal: qt.quotaTotal, used: qt.used } : null,
      up: { sonarr: sq.ok, radarr: rq.ok, prowlarr: hp.ok }
    });
  }
  return json({error:'Unknown action'}, 404);
}
