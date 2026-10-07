// 수도 내신분석 — AI 중계 Worker (Cloudflare)
// 원장님 Google 계정(Firebase 로그인)으로 들어온 요청만 받아서
// Claude 또는 GPT로 그대로 넘겨 줍니다. API 키는 이 Worker의 '비밀 값'에만 있고
// 화면(GitHub Pages) 쪽에는 절대 내려가지 않습니다.
//
// 필요한 비밀 값 (Cloudflare 대시보드 → Worker → 설정 → 변수와 비밀):
//   ANTHROPIC_API_KEY   Claude를 쓸 때
//   OPENAI_API_KEY      GPT를 쓸 때
// 둘 중 하나만 넣어도 됩니다.

const FIREBASE_PROJECT = 'sudo-naesin';
const ALLOWED_EMAILS = ['ilmvm66@gmail.com'];
const ALLOWED_ORIGINS = ['https://hongs-sudo.github.io'];
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let JWKS = null, JWKS_AT = 0;

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'Content-Type': 'application/json; charset=utf-8' } });

function b64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function googleKeys(force) {
  if (!JWKS || force || Date.now() - JWKS_AT > 3600e3) {
    const r = await fetch(JWK_URL);
    JWKS = (await r.json()).keys; JWKS_AT = Date.now();
  }
  return JWKS;
}
// Firebase 로그인 토큰 확인
async function verify(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) throw new Error('로그인 정보가 없습니다');
  const [h, p, s] = parts;
  const td = new TextDecoder();
  const head = JSON.parse(td.decode(b64u(h)));
  const body = JSON.parse(td.decode(b64u(p)));
  if (head.alg !== 'RS256') throw new Error('토큰 형식이 맞지 않습니다');
  let jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk) jwk = (await googleKeys(true)).find(k => k.kid === head.kid);
  if (!jwk) throw new Error('토큰 키를 찾지 못했습니다');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(h + '.' + p));
  const now = Math.floor(Date.now() / 1000);
  if (!ok) throw new Error('토큰 서명이 맞지 않습니다');
  if (body.aud !== FIREBASE_PROJECT || body.iss !== 'https://securetoken.google.com/' + FIREBASE_PROJECT) throw new Error('다른 프로젝트의 토큰입니다');
  if (!(body.exp > now - 60)) throw new Error('로그인이 만료됐습니다. 새로고침해 주세요');
  if (!body.email_verified || !ALLOWED_EMAILS.includes(body.email)) throw new Error('허용되지 않은 계정입니다');
  return body.email;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const H = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (path === '/') return json({ ok: true, name: '수도 내신분석 AI 중계' }, 200, H);

    try { await verify((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')); }
    catch (e) { return json({ error: { message: e.message } }, 401, H); }

    if (path === '/status' && request.method === 'GET') {
      return json({ ok: true, claude: !!env.ANTHROPIC_API_KEY, openai: !!env.OPENAI_API_KEY, colo: (request.cf && request.cf.colo) || '' }, 200, H);
    }

    let upstream, headers;
    if (path === '/claude' && request.method === 'POST') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: { message: 'Worker에 ANTHROPIC_API_KEY가 없습니다' } }, 400, H);
      upstream = 'https://api.anthropic.com/v1/messages';
      headers = { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    } else if (path === '/openai' && request.method === 'POST') {
      if (!env.OPENAI_API_KEY) return json({ error: { message: 'Worker에 OPENAI_API_KEY가 없습니다' } }, 400, H);
      upstream = 'https://api.openai.com/v1/responses';
      headers = { 'Authorization': 'Bearer ' + env.OPENAI_API_KEY, 'content-type': 'application/json' };
    } else {
      return json({ error: { message: '없는 주소입니다' } }, 404, H);
    }

    // 본문은 풀어 보지 않고 그대로 흘려 보냅니다 (PDF가 커도 Worker 계산 시간이 거의 들지 않도록).
    const r = await fetch(upstream, { method: 'POST', headers, body: request.body });
    const out = new Headers(H);
    out.set('Content-Type', r.headers.get('Content-Type') || 'application/json');
    return new Response(r.body, { status: r.status, headers: out });
  }
};
