#!/usr/bin/env python3
"""Layout QA for the dashboard. Run before every deploy:
   /workspace/.pwvenv/bin/python scripts/qa.py [outdir]
Serves public/ with mocked API data, checks many viewports and states, exits 1 on any failure."""
import sys, os, json, shutil, tempfile, threading, http.server, functools, pathlib, urllib.request
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent; OUT=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else ROOT/'qa'/'shots'); OUT.mkdir(parents=True,exist_ok=True)
tmp=pathlib.Path(tempfile.mkdtemp()); shutil.copytree(ROOT/'public',tmp,dirs_exist_ok=True)
mock=(ROOT/'scripts'/'qa-mock.html').read_text()
idx=(tmp/'index.html').read_text().replace('<script src="/app.js"></script>',mock.split('</script>\n<script>')[0]+'</script><script src="/app.js"></script><script>'+mock.split('</script>\n<script>')[1])
(tmp/'index.html').write_text(idx)
if os.environ.get('QA_BASE'):
 try: (tmp/'login.html').write_text(urllib.request.urlopen(urllib.request.Request((os.environ.get('QA_BASE','').rstrip('/')+'/login'),headers={'User-Agent':'Mozilla/5.0 qa'}),timeout=15).read().decode())
 except Exception as e: print('login page fetch failed',e)
class Q(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*a):pass
H=functools.partial(Q,directory=str(tmp))
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H); port=srv.server_address[1]; threading.Thread(target=srv.serve_forever,daemon=True).start()
VIEW=[(844,390),(768,1024),(1280,800),(1366,768),(1440,900),(1920,1080),(1280,650),(1100,600),(1024,768),(800,600),(1280,560),(1024,560),(390,844),(360,640),(390,560)]
STATES=['all','no-all','no-seasons','no-episodes','no-lib','s31','s31opts','s2','eps658','movie','remove','sched','success','long','full','dl0','dl100','coming','health','staterr','loading','emptylib','nomatch','searcherr','pwd','ppl','ppldir','pplpick','pplempty','pplerr','done','doneempty','acterr','wait','waitsearch','lib','libempty','addnone','idxlist','idxadd','idxfail','idxpass','idxremove','idxseed','idxusenet','pxform','pxfs','pxlist','pxadd','pxnone','addna','schedna','playclosed','playopen','playerr','setview','setbackup','setapplied','avhide','recs','recserr','avnone','averr','fixopen','fixwait','sysview','sysnotify','mlib','mlibfilter','mlibdet','mlibplay']
import os
if os.environ.get('QA_STATES'):STATES=os.environ['QA_STATES'].split(',')
CHK=r"""()=>{const W=innerWidth,H=innerHeight,de=document.documentElement,fail=[];
const vis=x=>{if(!x)return false;const r=x.getBoundingClientRect(),cs=getComputedStyle(x);return r.width>1&&r.height>1&&cs.visibility!=='hidden'&&cs.display!=='none'&&!x.closest('[hidden]')};
if(de.scrollHeight>H+1)fail.push('page scrolls vertically '+de.scrollHeight+'>'+H);if(de.scrollWidth>W+1)fail.push('page scrolls sideways');
const clip=(x)=>{let r=x.getBoundingClientRect();for(let p=x.parentElement;p;p=p.parentElement){const cs=getComputedStyle(p);if(/(auto|scroll|hidden)/.test(cs.overflowY+cs.overflowX)){const q=p.getBoundingClientRect();if(r.top<q.top-1||r.bottom>q.bottom+1||r.left<q.left-1||r.right>q.right+1)return true}}return r.top<-1||r.bottom>H+1||r.left<-1||r.right>W+1};
// main buttons must be reachable (scroll into view inside their scroller) and then fully visible and on top
const dlg=document.querySelector('dialog[open]');const mains=dlg?[...dlg.querySelectorAll('button')]:['#bAdd','#bRem','#bCan','#bSee','#bAnother','#sf .primary'].map(s=>document.querySelector(s)).filter(vis);
for(const b of mains){if(!vis(b))continue;b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();
 if(clip(b))fail.push('button clipped: '+(b.id||b.textContent.trim()));
 else{const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(!t||!(b===t||b.contains(t)))fail.push('button covered: '+(b.id||b.textContent.trim())+' by '+(t&&(t.id||t.className||t.tagName)))}}
// overlaps between sibling blocks in the columns
const blocks=[...document.querySelectorAll('.col>*,.work>*,.tvonly>*,.foot>*,.go>*,.danger>*,.ok>*,.sheet>*')].filter(x=>vis(x)&&getComputedStyle(x).position!=='absolute'&&!x.classList.contains('sr')&&getComputedStyle(x).display!=='contents');
for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++){const a=blocks[i],b=blocks[j];if(a.contains(b)||b.contains(a))continue;if(a.parentElement!==b.parentElement)continue;
 const p=a.getBoundingClientRect(),q=b.getBoundingClientRect(),ox=Math.min(p.right,q.right)-Math.max(p.left,q.left),oy=Math.min(p.bottom,q.bottom)-Math.max(p.top,q.top);
 if(ox>2&&oy>2)fail.push('overlap: '+(a.id||a.className||a.tagName)+' / '+(b.id||b.className||b.tagName)+' '+Math.round(oy)+'px')}
// text in pinned footer and sentence must not be cut
const res=document.querySelector('#res2');if(vis(res)&&res.scrollHeight>res.clientHeight+2)fail.push('result sentence cut');
// visible text clipped by its own box without ellipsis
for(const x of document.querySelectorAll('.col b,.col small,.col .hint,.col label,.col h3,.col p')){if(!vis(x))continue;const cs=getComputedStyle(x);if(cs.textOverflow==='ellipsis'||/-webkit-box/.test(cs.display))continue;if(x.scrollWidth>x.clientWidth+2&&cs.overflowX!=='visible')fail.push('text cut: '+x.textContent.slice(0,30))}
return fail}"""
fails=[];ok=0
with sync_playwright() as p:
  br=p.chromium.launch()
  for w,h in VIEW:
    phone=w<=760
    pg=br.new_page(viewport={'width':w,'height':h},reduced_motion='reduce',has_touch=w<1000,is_mobile=w<=900,device_scale_factor=2 if w<1000 else 1);errs=[]
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None);pg.on('pageerror',lambda e: errs.append(str(e)))
    for s in STATES:
      if (w,h) in ((844,390),(768,1024)) and not s.startswith('mlib') and s not in ('lib','playopen','s31','idxadd'): continue
      tabs=(['library'] if s.startswith('mlib') else ['do']) if phone and s.startswith('mlib') else ['do'] if phone and s not in('dl0','dl100','coming','health','staterr','loading','emptylib','nomatch','searcherr','ppl','ppldir','pplempty','pplerr','done','doneempty','acterr','wait','waitsearch','lib','libempty','idxlist','idxadd','idxfail','idxpass','idxremove','idxseed','idxusenet','pxform','pxfs','pxlist','pxadd','pxnone','playclosed','playopen','playerr','setview','setbackup','setapplied','avhide','recs','recserr','avnone','averr','fixopen','fixwait','sysview','sysnotify','mlib','mlibfilter','mlibdet','mlibplay') else (['status','find'] if phone else [None])
      for t in tabs:
        errs.clear();pg.goto(f'http://127.0.0.1:{port}/index.html?state={s}'+(f'&tab={t}' if t else ''));
        try: pg.wait_for_function('window.READY===true',timeout=8000)
        except Exception:
          try: pg.reload();pg.wait_for_function('window.READY===true',timeout=12000)
          except Exception: fails.append((w,h,s,t,['never ready']));continue
        pg.wait_for_timeout(120);name=f'{w}x{h}-{s}'+(f'-{t}' if t else '')
        f=pg.evaluate(CHK)+[('console: '+e) for e in errs if 'favicon' not in e]
        exp=pg.evaluate("""(s)=>{const f=[],b=document.querySelector('#bAdd'),c=document.querySelector('#newonly'),noR=document.querySelector('#noR');
 const vis=x=>x&&x.getBoundingClientRect().height>1&&getComputedStyle(x).display!=='none';
 if(['all','no-all','no-seasons','no-episodes','s31','eps658','no-lib'].includes(s)&&!vis(noR))f.push('New episodes only not shown');
 if(s.startsWith('no-')){if(!c.checked)f.push('box not checked');if(b.textContent.trim()!=='Schedule download')f.push('button says '+b.textContent.trim());
  for(const sel of ['#tvseg','.quick','#sg','#acc','.tv-all-v']){const e=document.querySelector(sel);if(!e.hasAttribute('inert'))f.push(sel+' not inert')}
  const foc=[...document.querySelectorAll('#tvseg button,.quick button,.quick input,.tile,#acc input,#acc button,#mon')].filter(x=>{x.focus();return document.activeElement===x});if(foc.length)f.push(foc.length+' disabled controls still focusable');
  if(!/new episodes only/.test(document.querySelector('#res2').textContent))f.push('sentence not about new episodes')}
 else if(['all','s31','eps658'].includes(s)){if(/Schedule download/.test(b.textContent))f.push('unchecked but button says Schedule download');if(document.querySelector('#tvseg').hasAttribute('inert'))f.push('unchecked but picks inert')}
 const rc=document.querySelector('#rc').textContent,rs=document.querySelector('#res').textContent,n=document.querySelectorAll('#res .r').length;
 if(['ppl','ppldir','pplpick'].includes(s)){if(n!==32)f.push('expected 32 credits, got '+n);if(!/Alex Rivera: 32 titles/.test(rc))f.push('count line: '+rc);if(!/Wikidata and TVmaze/.test(rc))f.push('source not named')}
 if(s==='ppldir'&&!/some sources/.test(rc))f.push('partial not shown');
 if(s==='pplpick'&&!/Night Train/.test(document.querySelector('#do, main').textContent))f.push('pick did not open Night Train');
 if(s==='pplempty'&&!/No acting credits found/.test(rs))f.push('empty message missing');
 if(s==='pplerr'&&!document.querySelector('#rTry'))f.push('error retry missing');
 const sl=document.querySelector('#sl').textContent;
 if(s==='done'){if(!/In your library/.test(sl))f.push('no library badge');if(!/Imported 5 min ago/.test(sl))f.push('no time');if(!/Download failed/.test(sl))f.push('no failed')}
 if(s==='doneempty'&&!/Nothing finished yet/.test(sl))f.push('done empty missing');
 if(s==='acterr'&&!/Could not reach/.test(sl))f.push('activity error missing');
 if(s==='wait'){if(document.querySelectorAll('#sl [data-w]').length!==4)f.push('expected 4 Search again');if(!/Searched, nothing found yet · last search/.test(sl))f.push('no last search');if(!/Not released yet/.test(sl))f.push('no unreleased')}
 if(s==='waitsearch'&&!/Search started/.test(sl))f.push('search again did not start');
 if(s==='lib'){if(!/216/.test(sl)||!/10.5 GB/.test(sl))f.push('lib counts');if(document.querySelectorAll('#sl .lr').length!==8)f.push('recent posters');if(document.querySelectorAll('#sl .gc i').length!==4)f.push('genre chart')}
 if(s==='libempty'&&!/Nothing yet/.test(sl))f.push('lib empty');
 if(s==='addnone'&&!/no release found yet/.test(document.querySelector('main').textContent))f.push('no release message missing');
 const ix=document.querySelector('#idx'),it=ix?ix.textContent:'';
 if(s.startsWith('idx')){if(!ix.open)f.push('sources not open');if(!/Only add sources you have the legal right to use/.test(it))f.push('legal note missing')}
 if(s==='idxlist'){if(document.querySelectorAll('#ixb .ixr').length!==3)f.push('expected 3 sources');if(!/Radarr synced, Sonarr synced/.test(it))f.push('sync line');if(!/Failing/.test(it))f.push('health')}
 if(s==='idxadd'){if(!document.querySelector('#ixff input[type=password]'))f.push('api key not masked');if(!document.querySelector('#ixsave').disabled)f.push('save enabled before test')}
 if(s==='idxfail'){if(!/Test failed/.test(it))f.push('no fail msg');if(!document.querySelector('#ixsave').disabled)f.push('save enabled after fail')}
 if(s==='idxpass'){if(!/Test passed/.test(it))f.push('no pass msg');if(document.querySelector('#ixsave').disabled)f.push('save disabled after pass')}
 if(s==='idxadd'){const sr=document.querySelector('#ixff [data-f="torrentBaseSettings.seedRatio"]');if(!sr||sr.tagName!=='SELECT')f.push('no seed dropdown');else{if(sr.value!=='1'||!/1.0 \(Recommended\)/.test(sr.selectedOptions[0].textContent))f.push('seed default');if(!/Many private sites need at least 1.0/.test(it))f.push('seed note')}}
 if(s==='idxusenet'&&document.querySelector('#ixff [data-f^="torrentBaseSettings"]'))f.push('seed shown for usenet');
 if(s==='idxseed'&&(!document.querySelector('#ixsr')||!/Recommended/.test(it)))f.push('seed edit view');
 if(s==='pxform'){const p=document.querySelector('#ixpx');if(!p||p.value!==''||!/None \(Recommended\)/.test(p.selectedOptions[0].textContent))f.push('proxy default');if(p&&p.options.length!==3)f.push('proxy options');if(!document.querySelector('#ixfs').hidden)f.push('fs note shown for None');if(!/only affects searching/.test(it)||!/account sharing/.test(it))f.push('proxy note');if(!/Only add sources you have the legal right to use/.test(it))f.push('legal note')}
 if(s==='pxlist'){if(document.querySelectorAll('#ixb [data-pr]').length!==2)f.push('proxy list');if(document.querySelector('#pxw').type!=='password')f.push('proxy password not masked');if(!/often fails against current Cloudflare/.test(it))f.push('fs note in list');if(![...document.querySelectorAll('#pxk option')].some(o=>o.value==='FlareSolverr'))f.push('no fs type')}
 if(s==='pxfs'){const n=document.querySelector('#ixfs');if(!n||n.hidden||!/Leave off unless a source needs it/.test(n.textContent))f.push('fs note not shown')}
 if(s==='pxnone'&&!/No proxies yet/.test(it))f.push('empty proxies');
 if(s==='pxadd'&&(!/Proxy saved/.test(it)||document.querySelector('#pxw').value!==''))f.push('proxy save flow');
 if((s==='addna'||s==='schedna')&&!/Not available from your sources yet/.test(document.querySelector('main').textContent))f.push('not-available message missing');
 if(s==='idxremove'){if(!/Type the name to confirm/.test(it))f.push('no confirm');if(!document.querySelector('#ixgo').disabled)f.push('remove enabled before name')}
 const al=document.querySelector('#alrt');
 if(s==='health'&&(al.hidden||!/Updates are available/.test(al.title)))f.push('update alert missing');
 if(s==='full'&&!/Storage is nearly full/.test(al.textContent))f.push('storage alert missing');
 if(s==='staterr'&&!/not responding/.test(al.textContent))f.push('app down alert missing');
 const se=document.querySelector('#set'),stx=se?se.textContent:'';
 if(s.startsWith('set')&&(!se.open||!/community best practices/i.test(stx)))f.push('settings not open');
 if(s==='setview'){if(!document.querySelector('#seAp').disabled)f.push('apply enabled before backup');if(!/Differs/.test(stx))f.push('diff not shown')}
 if(s==='setbackup'&&(document.querySelector('#seCf').disabled||!/Backup saved/.test(stx)))f.push('backup flow');
 if(s==='setapplied'&&!/Recommended settings applied/.test(stx))f.push('apply flow: '+document.querySelector('#sem').textContent);
 const rc2=document.querySelector('#rc').textContent;
 if(s==='s31'&&!/Available/.test(document.querySelector('#res').textContent))f.push('no Available badge');
 if(s==='avhide'){const h=[...document.querySelectorAll('#res li[data-av=no]')];if(h.length!==1||h[0].getBoundingClientRect().height>0)f.push('unavailable not hidden');if(document.querySelector('#avs'))f.push('toggle still exists')}
 if(s==='avnone'&&document.querySelector('#res').getBoundingClientRect().height>0){if(!/Nothing (new )?available from your sources yet/.test(document.querySelector('#res').textContent))f.push('none msg');if(!document.querySelector('#avSrc'))f.push('no sources link');if([...document.querySelectorAll('#res li[data-av]')].some(l=>l.dataset.av!=='lib'&&l.getBoundingClientRect().height>0))f.push('unavailable visible')}
 if(s==='averr'&&[...document.querySelectorAll('#res li[data-av]')].some(l=>l.dataset.av!=='lib'&&l.getBoundingClientRect().height>0))f.push('failed check shown as available');
 if(s==='wait'&&!/In your library, 12 aired episodes missing/.test(document.querySelector('#sl').textContent))f.push('series waiting text');
 if(s==='recs'){if(!/Recommended · Updated 2 hr ago/.test(rc2))f.push('recs header: '+rc2);if(document.querySelectorAll('#res [data-k]').length!==4)f.push('recs count')}
 if(s==='recserr'&&!/Find something to watch/.test(document.querySelector('#res').textContent))f.push('recs fallback')
 const fx=document.querySelector('#fix');
 if(s==='coming'&&!/Digital release/.test(document.querySelector('#sl').textContent))f.push('movie release missing from calendar');
 if(s==='fixopen'){if(!fx.open)f.push('fix not open');if(!document.querySelector('#fxBl'))f.push('no blocklist');if(document.querySelectorAll('#fxl [data-g]').length!==2)f.push('releases')}
 if(s==='fixwait'&&(!fx.open||document.querySelector('#fxBl')))f.push('pick flow');
 if(s==='sysview'){const t=document.querySelector('#seb').textContent;if(document.querySelectorAll('#seb [data-up]').length!==1)f.push('update buttons');if(!/installed by the seedbox/.test(t))f.push('managed note');if(!/Turn on alerts/.test(t))f.push('notify btn')}
 if(s==='sysnotify'&&!/Topic mr-/.test(document.querySelector('#seb').textContent))f.push('topic not shown')
 if(s.startsWith('mlib')){const W=innerWidth;const sl=document.querySelector('#sl');if(!sl||sl.getBoundingClientRect().height<50)f.push('library not visible');
  if(W<=760){const lb=document.querySelector('.tabs [data-t=library]');if(!lb||lb.getAttribute('aria-current')!=='page')f.push('library tab not current')}
  const small=[...document.querySelectorAll('#sl button,#sl input,.tabs button,#play button,#play a')].filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0&&!x.closest('[hidden]')&&(r.height<43.5||r.width<43.5)});if(W<=900&&small.length)f.push(small.length+' touch targets under 44px: '+small.slice(0,3).map(x=>(x.id||x.className||x.tagName)+':'+Math.round(x.getBoundingClientRect().height)).join(','))}
 if(s==='mlib'&&document.querySelectorAll('#lgrid .lcard').length!==8)f.push('grid count '+document.querySelectorAll('#lgrid .lcard').length);
 if(s==='mlibfilter'&&document.querySelectorAll('#lgrid .lcard').length!==1)f.push('filter');
 if(s==='mlibdet'&&(!document.querySelector('.ldet .lplay')||!/Back to library/.test(document.querySelector('#sl').textContent)))f.push('detail');
 if(s==='mlibplay'){const pd2=document.querySelector('#play');if(!pd2.open||!pd2.querySelector('iframe'))f.push('player not open');const fsb=document.querySelector('#plfs');if(!fsb||fsb.hidden)f.push('no fullscreen btn');const r=pd2.getBoundingClientRect();if(r.right>innerWidth+1||r.bottom>innerHeight+1)f.push('player off screen')}
 const pd=document.querySelector('#play');
 if(s==='playclosed'){if(pd.open)f.push('player open');if(document.querySelectorAll('#sl [data-play]').length!==6)f.push('expected 6 Play buttons, got '+document.querySelectorAll('#sl [data-play]').length)}
 if(s==='playopen'){if(!pd.open)f.push('player not open');if(!pd.querySelector('iframe'))f.push('no player frame');const fsb=document.querySelector('#plfs');if(!fsb||fsb.hidden||fsb.getBoundingClientRect().width<2)f.push('fullscreen button not visible');if(!/Open in Jellyfin/.test(pd.textContent))f.push('no open link')}
 if(s==='playerr'){if(!/Could not reach Jellyfin/.test(pd.textContent))f.push('no error');if(!document.querySelector('#plr'))f.push('no retry')}
 return f}""",s)
        f+=exp
        pg.screenshot(path=str(OUT/(name+'.png')))
        if f:fails.append((w,h,s,t,f))
        else: ok+=1
    # keyboard: Tab reaches the Add button on the 31 season view
    pg.goto(f'http://127.0.0.1:{port}/index.html?state=s31'+('&tab=do' if phone else ''));pg.wait_for_function('window.READY===true')
    hit=False
    for i in range(80):
      pg.keyboard.press('Tab')
      if pg.evaluate("document.activeElement&&document.activeElement.id")=='bAdd':hit=True;break
    if not hit:fails.append((w,h,'keyboard',None,['Tab never reaches Add']))
    # typing test: every field in the Add source form must take keystrokes and keep focus
    pg.goto(f'http://127.0.0.1:{port}/index.html?state=idxadd');pg.wait_for_function('window.READY===true')
    tf=[]
    for sel,txt in [('#ixn','X'),('[data-f="baseUrl"]','abc'),('[data-f="username"]','me'),('[data-f="password"]','pw1'),('[data-f="apiKey"]','k9'),('[data-f="categories"]','2000'),('[data-f="baseSettings.queryLimit"]','12')]:
      el=pg.locator('#ixff '+sel)
      if el.count()==0: tf.append('missing '+sel);continue
      before=el.input_value();el.click();pg.keyboard.press('End')
      for ch in txt:
        pg.keyboard.type(ch);pg.wait_for_timeout(30)
        if not pg.evaluate("(s)=>document.activeElement===document.querySelector('#ixff '+s)",sel):tf.append('lost focus '+sel);break
      after=el.input_value()
      if after!=before+txt: tf.append(f'{sel} typed wrong ({len(before)}->{len(after)})')
    if pg.locator('#ixff [data-f="baseUrl"]').get_attribute('value')!='https://example-one.test/': tf.append('baseUrl default not prefilled')
    if pg.locator('#ixff [data-f="password"]').get_attribute('type')!='password': tf.append('password not masked')
    if pg.locator('#ixff [data-f="username"]').get_attribute('type')!='password': tf.append('secret username not masked')
    pg.select_option('#ixff [data-f="torrentBaseSettings.seedRatio"]','2')
    if pg.locator('#ixff [data-f="torrentBaseSettings.seedRatio"]').input_value()!='2': tf.append('seed ratio did not change')
    pg.select_option('#ixff [data-f="baseSettings.limitsUnit"]','1')
    if pg.locator('#ixff [data-f="baseSettings.limitsUnit"]').input_value()!='1': tf.append('select did not change')
    cb=pg.locator('#ixff [data-f="vip"]');cb.click()
    if not cb.is_checked(): tf.append('checkbox did not toggle')
    pg.wait_for_timeout(200)
    if pg.locator('#ixff [data-f="baseUrl"]').input_value()!='https://example-one.test/abc': tf.append('value lost after wait')
    if tf: fails.append((w,h,'typing',None,tf))
    else: ok+=1
    if (tmp/'login.html').exists():
      pg.goto(f'http://127.0.0.1:{port}/login.html');f=pg.evaluate(CHK.replace("const dlg=document.querySelector('dialog[open]');","const dlg=document.querySelector('form');"));pg.screenshot(path=str(OUT/f'{w}x{h}-login.png'))
      if f:fails.append((w,h,'login',None,f))
    pg.close()
  br.close()
srv.shutdown();shutil.rmtree(tmp)
for f in fails:print('FAIL',*f[:4],'|','; '.join(f[4]))
print(f'{ok} passed, {len(fails)} failed. Screenshots: {OUT}')
sys.exit(1 if fails else 0)
