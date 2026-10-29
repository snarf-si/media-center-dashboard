const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
export const getVer = async (env) => (env.AUTH && await env.AUTH.get('ver')) || '0';
export async function makeCookie(env) {
  const exp = Date.now() + 30*24*3600*1000, ver = await getVer(env);
  const sig = await hmac(env.SESSION_SECRET, 'v1.' + exp + '.' + ver);
  return `md_s=v1.${exp}.${ver}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30*24*3600}`;
}
export async function validCookie(req, env) {
  if (!env.SESSION_SECRET) return false;
  const m = (req.headers.get('Cookie')||'').match(/(?:^|;\s*)md_s=v1\.(\d+)\.(\w+)\.([\w-]+)/);
  if (!m || Number(m[1]) < Date.now() || m[2] !== await getVer(env)) return false;
  const want = await hmac(env.SESSION_SECRET, 'v1.' + m[1] + '.' + m[2]);
  if (want.length !== m[3].length) return false;
  let d = 0; for (let i=0;i<want.length;i++) d |= want.charCodeAt(i) ^ m[3].charCodeAt(i);
  return d === 0;
}
export async function safeEqual(a, b, env) {
  const x = await hmac(env.SESSION_SECRET||'x', a||''), y = await hmac(env.SESSION_SECRET||'x', b||'');
  return x === y && !!a && !!b;
}
export const json = (o, s=200) => new Response(JSON.stringify(o), {status:s, headers:{'content-type':'application/json','cache-control':'no-store'}});

const hex = (b) => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function pbkdf2(pw, saltHex, iter) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h=>parseInt(h,16)));
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:iter}, k, 256));
}
// Checks the KV hash first; falls back to the DASH_PASSPHRASE secret only when no hash is stored.
export async function checkPassword(pw, env) {
  const rec = env.AUTH && await env.AUTH.get('pw', 'json');
  if (rec && rec.hash) return safeEqual(await pbkdf2(String(pw||''), rec.salt, rec.iter), rec.hash, env);
  return safeEqual(String(pw||''), env.DASH_PASSPHRASE, env);
}
export async function setPassword(pw, env) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))), iter = 100000;
  await env.AUTH.put('pw', JSON.stringify({ salt, iter, hash: await pbkdf2(pw, salt, iter), at: Date.now() }));
  await env.AUTH.put('ver', String(Date.now()));
}

export async function sha256hex(t) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(String(t||'')))); }
export const hasHash = async (env) => !!(env.AUTH && await env.AUTH.get('pw'));
// Setup token: KV key 'setup' = {h: sha256(token), exp}. Single use.
export async function setupValid(token, env) {
  if (!env.AUTH || !token || await hasHash(env)) return false;
  const rec = await env.AUTH.get('setup', 'json');
  if (!rec || !rec.h || Date.now() > rec.exp) return false;
  return safeEqual(await sha256hex(token), rec.h, env);
}
