import { validCookie, makeCookie, checkPassword, setPassword, setupValid, hasHash, json } from './_lib.js';
const CSS = `<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0714;color:#e9e6ff;font:16px system-ui;background-image:linear-gradient(#a855f722 1px,transparent 1px),linear-gradient(90deg,#a855f722 1px,transparent 1px);background-size:32px 32px}
form{box-sizing:border-box;background:#140c24;border:1px solid #a855f7;border-radius:14px;padding:28px;width:min(360px,92vw);box-shadow:0 0 30px #a855f744}
h1{margin:0 0 12px;font-size:22px;color:#22d3ee}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;font:inherit;margin-top:10px}
input{background:#0b0714;color:#fff;border:1px solid #22d3ee55}button{background:#a3e635;color:#0b0714;border:0;font-weight:700;cursor:pointer}p{color:#f472b6;min-height:1em}footer{position:fixed;bottom:8px;left:0;right:0;text-align:center;font-size:12px;color:#9a92b8}footer a{color:#22d3ee;text-decoration:none;font-weight:600}footer a:hover{color:#a3e635}</style>`;
const FOOT = `<footer>Made By <a href="https://x.com/SnarfLab" target="_blank" rel="noopener">@SnarfLab</a></footer>`;
const fails = new Map(); // per isolate, best effort
const setupPage = (t, msg='') => new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Choose your password</title>${CSS}</head>
<body><form method="post" action="/setup?t=${encodeURIComponent(t)}"><h1>Choose your password</h1><div>This link works once. Pick a password with 10 or more characters.</div>
<input type="password" name="n" placeholder="New password" autocomplete="new-password" minlength="10" required autofocus><input type="password" name="c" placeholder="New password again" autocomplete="new-password" required><button>Save and open</button><p>${msg}</p></form>${FOOT}</body></html>`,
 {status: msg ? 400 : 200, headers:{'content-type':'text/html','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer'}});
const page = (msg='', note='') => new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Media center</title>
${CSS}</head>
<body><form method="post" action="/login"><h1>Media center</h1><div>Enter your passphrase to open the remote.</div>
${note}<input type="password" name="p" autocomplete="current-password" autofocus required><button>Open</button><p>${msg}</p></form>${FOOT}</body></html>`,
 {status: msg ? 401 : 200, headers:{'content-type':'text/html','cache-control':'no-store','x-frame-options':'DENY'}});
export async function onRequest(ctx) {
  const { request: req, env } = ctx; const url = new URL(req.url);
  if (!env.DASH_PASSPHRASE || !env.SESSION_SECRET) return new Response('Not set up yet: passphrase secrets are missing.', {status:503});
  if (url.pathname === '/login' && req.method === 'POST') {
    const ip = req.headers.get('cf-connecting-ip')||'x'; const now = Date.now();
    const f = (fails.get(ip)||[]).filter(t => now - t < 15*60*1000);
    if (f.length >= 5) return page('Too many tries. Wait 15 minutes.');
    const p = (await req.formData()).get('p');
    if (await checkPassword(p, env)) {
      fails.delete(ip);
      return new Response(null, {status:303, headers:{location:'/', 'set-cookie': await makeCookie(env)}});
    }
    f.push(now); fails.set(ip, f); await new Promise(r => setTimeout(r, 800));
    return page('That passphrase did not work.');
  }
  if (url.pathname === '/setup') {
    const t = url.searchParams.get('t') || '';
    if (!(await setupValid(t, env))) return new Response('This setup link is used up or expired. Ask your bot for a new one.', {status:403, headers:{'cache-control':'no-store'}});
    if (req.method !== 'POST') return setupPage(t);
    const fd = await req.formData(); const n = String(fd.get('n')||'');
    if (n.length < 10) return setupPage(t, 'Use 10 or more characters.');
    if (n !== String(fd.get('c')||'')) return setupPage(t, 'The two passwords do not match.');
    await env.AUTH.delete('setup'); await setPassword(n, env);
    return new Response(null, {status:303, headers:{location:'/', 'set-cookie': await makeCookie(env)}});
  }
  if (url.pathname === '/logout') return new Response(null,{status:303,headers:{location:'/','set-cookie':'md_s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict'}});
  if (!(await validCookie(req, env))) return url.pathname.startsWith('/api/') ? json({error:'Please log in again.'}, 401) : page('', (await hasHash(env)) ? '' : '<div style="font-size:13px;color:#9a92b8;margin-top:8px">First time? Open the setup link your bot gave you to choose a password.</div>');
  if (req.method !== 'GET' && req.headers.get('origin') && new URL(req.headers.get('origin')).host !== url.host) return json({error:'Bad origin'}, 403);
  if (url.pathname === '/api/password' && req.method === 'POST') {
    if (!env.AUTH) return json({error:'Password storage is not set up.'}, 503);
    const ip = req.headers.get('cf-connecting-ip')||'x'; const now = Date.now();
    const f = (fails.get(ip)||[]).filter(t => now - t < 15*60*1000);
    if (f.length >= 5) return json({error:'Too many tries. Wait 15 minutes.'}, 429);
    let b = {}; try { b = await req.json(); } catch {}
    if (!(await checkPassword(b.current, env))) { f.push(now); fails.set(ip, f); await new Promise(r => setTimeout(r, 800)); return json({error:'Current password is wrong.'}, 403); }
    const n = String(b.next||'');
    if (n.length < 10) return json({error:'New password needs at least 10 characters.'}, 400);
    if (n !== String(b.confirm||'')) return json({error:'The two new passwords do not match.'}, 400);
    await setPassword(n, env);
    return new Response(JSON.stringify({ok:true}), {headers:{'content-type':'application/json','cache-control':'no-store','set-cookie': await makeCookie(env)}});
  }
  const res = await ctx.next();
  const r = new Response(res.body, res); r.headers.set('cache-control','no-store'); r.headers.set('x-frame-options','DENY'); return r;
}
