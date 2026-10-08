// 수도 내신분석 — AI 호출 (Claude 또는 GPT, Worker를 거쳐서)
// 시험지·자료는 쪽 그림(JPEG)으로 보내고, 문항마다 핵심 내용과 위치(0~1000 좌표)를 함께 받는다.
window.SudoAI = (function () {
  const MODELS = {
    claude: [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (권장 · 빠름)'], ['claude-opus-5-5', 'Claude Opus 5.5 (가장 꼼꼼 · 비쌈)']],
    openai: [['gpt-5.6', 'GPT-5.6'], ['gpt-5.6-mini', 'GPT-5.6 mini (저렴)']]
  };
  const FAST = { claude: 'claude-sonnet-5-5', openai: 'gpt-5.6-mini' };
  const DIFFS = ['기본', '응용', '실력', '심화'];
  const BEHS = ['이해', '계산', '추론', '문제해결'];
  const S = (d, extra) => Object.assign({ type: 'string', description: d }, extra || {});
  const LOC = {
    q: S('문제 핵심 내용: 문제를 짧게 옮겨 적기 (수식은 x^2, sqrt(3), 2/3 처럼 글자로, 120자 이내)'),
    pg: { type: 'integer', description: '문항이 있는 쪽 번호 (보낸 그림 순서, 1부터)' },
    box: { type: 'array', items: { type: 'integer' }, description: '그 쪽 안에서 문항 전체(번호·보기·그림 포함)를 감싸는 영역 [x0,y0,x1,y1], 쪽 왼쪽 위 0 · 오른쪽 아래 1000' }
  };

  function examItem(withAns) {
    const p = {
      no: { type: 'integer', description: '문항 번호. 서답형은 객관식 다음 번호로 이어서' },
      pts: { type: ['number', 'null'], description: '배점. 시험지나 배점표에 없으면 null' },
      diff: S('', { enum: DIFFS }), beh: S('', { enum: BEHS }),
      essay: { type: 'boolean', description: '서답형·서술형이면 true' },
      code: S('유형 목록에서 고른 코드. 맞는 것이 없으면 빈 문자열'),
      big: S('대단원 (예: Ⅰ.수와 식)'), mid: S('중단원, "NN.이름" 형식 (예: 01.유리수와 소수)'), type: S('유형 이름'),
      conf: { type: 'number', description: '0~1. 배점·난이도·유형이 애매하면 낮게' },
      note: S('문항이 묻는 것 15자 안팎'),
      q: LOC.q, pg: LOC.pg, box: LOC.box
    };
    const req = ['no', 'pts', 'diff', 'beh', 'essay', 'code', 'big', 'mid', 'type', 'conf', 'note', 'q', 'pg', 'box'];
    if (withAns) {
      p.sol = S('직접 푼 풀이의 핵심 (식·값 위주 80자 이내)');
      p.ans = S('정답. 객관식은 ①~⑤ (복수 정답은 ②,④), 서답형은 최종 값이나 식');
      req.push('sol', 'ans');
    }
    return { type: 'object', additionalProperties: false, required: req, properties: p };
  }
  const examSchema = withAns => ({
    type: 'object', additionalProperties: false, required: ['items', 'total_pts', 'warnings'],
    properties: {
      items: { type: 'array', items: examItem(withAns) },
      total_pts: { type: ['number', 'null'], description: '배점 합계 (보이는 경우)' },
      warnings: { type: 'array', items: { type: 'string' }, description: '흐릿한 쪽, 빠진 문항 등 원장님이 볼 점' }
    }
  });
  const matSchema = {
    type: 'object', additionalProperties: false, required: ['problems', 'warnings'],
    properties: {
      problems: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['no', 'diff', 'beh', 'code', 'big', 'mid', 'type', 'conf', 'q', 'pg', 'box'],
        properties: { no: S('자료에 적힌 문항 번호 그대로 (없으면 쪽 안 순서)'), diff: S('', { enum: DIFFS }), beh: S('', { enum: BEHS }),
          code: S('유형 목록 코드, 없으면 ""'), big: S('대단원'), mid: S('중단원 "NN.이름"'), type: S('유형 이름'),
          conf: { type: 'number' }, q: LOC.q, pg: LOC.pg, box: LOC.box } } },
      warnings: { type: 'array', items: { type: 'string' } }
    }
  };
  const simSchema = {
    type: 'object', additionalProperties: false, required: ['picks'],
    properties: { picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'score', 'why', 'concept'],
      properties: { id: S('후보 id 그대로'), score: { type: 'integer', description: '0~100 유사도' },
        why: S('어떤 부분이 비슷한지 30자 이내 (예: 두 직선의 교점을 구한 뒤 넓이를 묻는 구조가 같음)'),
        concept: S('두 문제를 풀 때 공통으로 필요한 개념 20자 이내 (예: 연립방정식의 해 = 그래프의 교점)') } } } }
  };

  const RULES = [
    '[난이도] 기본=개념·공식을 바로 적용하는 한두 단계 / 응용=개념 두세 개를 엮거나 조건을 한 번 바꿔 생각 / 실력=여러 개념 결합·조건 해석이 필요한 상위권 변별 문항 / 심화=최상위 변별, 낯선 상황·긴 풀이.',
    '[행동영역] 이해=개념·용어·성질 확인 / 계산=식 계산·값 구하기가 중심 / 추론=성질·조건으로 판단, 참거짓, 규칙 찾기 / 문제해결=상황을 식으로 세워 푸는 활용·도형 응용.',
    '[유형] 아래 유형 목록에서 가장 가까운 code를 고르고 big·mid·type에 그 이름을 적습니다. 꼭 맞는 것이 없으면 code는 ""로 두고, 교과서 단원 순서에 맞춰 big("Ⅰ.이름"), mid("NN.이름"), type(새 유형 이름)을 제안합니다.',
    '[위치] 쪽 그림마다 앞에 "쪽 n"이라고 적혀 있습니다. pg에 그 n을, box에 문항 전체를 감싸는 영역을 0~1000 좌표로 적습니다. 두 쪽에 걸친 문항은 앞쪽만 적습니다.',
    '[핵심 내용] q에는 그 문항을 다른 자료의 비슷한 문제와 비교할 수 있도록 조건과 묻는 것을 짧게 옮겨 적습니다.'
  ];
  const catalogText = lines => lines.length ? `[유형 목록] code | 대단원 | 중단원 | 유형\n${lines.join('\n')}` : '[유형 목록] 이 과정은 아직 목록이 없습니다. code는 ""로 두고 단원·유형을 제안해 주세요.';

  function examPrompt(meta, catalogLines, example, withAns) {
    return [
      `다음은 ${meta.school} ${meta.year}학년도 ${meta.grade}학년 ${meta.sem}학기 ${meta.exam}고사 수학 시험지입니다 (과정: ${meta.course}).`,
      '모든 문항을 빠짐없이 번호 순서대로 분석해 save_items 형식으로 돌려주세요.', '',
      '[배점] 시험지에 적힌 배점([3.5점], 4.2점 등)을 그대로 씁니다. 시험지에 없으면 함께 준 정답·배점표에서 찾습니다. 그래도 없으면 null.',
      '[서답형] 서답형·서술형 문항은 essay=true. 번호는 객관식 마지막 번호 다음부터 이어 붙입니다 (객관식 20개면 서답형 1번 → 21).',
      ...RULES,
      '[확신도] 배점이 안 보이거나, 난이도·유형이 둘 사이에서 애매하면 conf를 0.6 아래로 둡니다.',
      withAns ? '[정답] 모든 문항을 직접 풀어서 sol에 풀이 핵심을 먼저 적고 ans에 정답을 적습니다. 객관식은 보기 번호(①~⑤), 서답형은 최종 값이나 식. 정답지가 함께 있으면 정답지를 따르되 직접 푼 답과 다르면 warnings에 문항 번호를 적습니다. 문제가 흐려서 확실히 풀 수 없으면 conf를 0.5 아래로 둡니다.' : '',
      '[주의] 정답지·채점기준 쪽이 섞여 있으면 문항 분석은 시험지 쪽 기준으로 하고, 정답지는 배점 확인에만 씁니다. 흐릿하거나 잘린 쪽이 있으면 warnings에 적습니다.', '',
      catalogText(catalogLines),
      example ? `\n[참고: 같은 과정 지난 시험을 원장님이 분석한 결과] 번호 | 배점 | 난이도 | 행동 | code\n${example}` : ''
    ].join('\n');
  }
  function matPrompt(meta, catalogLines) {
    return [
      `다음은 수학학원 내신대비 자료 「${meta.name}」의 일부 쪽입니다 (과정: ${meta.course}${meta.school ? ', ' + meta.school : ''}).`,
      '쪽 안의 모든 문제를 빠짐없이 찾아 save_problems 형식으로 돌려주세요. 개념 설명·정답·해설만 있는 부분은 빼고 문제만 적습니다.', '',
      ...RULES, '', catalogText(catalogLines)
    ].join('\n');
  }

  function imgContent(pages, provider) {
    const c = [];
    pages.forEach((p, i) => {
      if (provider === 'claude') { c.push({ type: 'text', text: `쪽 ${i + 1}` }); c.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.b64 } }); }
      else { c.push({ type: 'input_text', text: `쪽 ${i + 1}` }); c.push({ type: 'input_image', image_url: 'data:image/jpeg;base64,' + p.b64 }); }
    });
    return c;
  }
  function body(provider, model, content, text, tool, schema, system) {
    if (provider === 'claude') {
      return { model, max_tokens: 32000, system: system + ` 설명 글 없이 반드시 ${tool} 도구를 한 번 호출해서 결과를 모두 넘깁니다.`,
        tools: [{ name: tool, description: '결과를 저장한다', input_schema: schema }], tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: content.concat([{ type: 'text', text }]) }] };
    }
    return { model, instructions: system + ' 주어진 JSON 형식으로만 답합니다.',
      input: [{ role: 'user', content: content.concat([{ type: 'input_text', text }]) }],
      text: { format: { type: 'json_schema', name: tool, schema, strict: true } } };
  }
  function pick(provider, data, key) {
    let out = null;
    if (provider === 'claude') {
      const t = (data.content || []).find(c => c.type === 'tool_use');
      if (t) out = t.input;
      else {
        const txt = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
        const m = txt.match(new RegExp('\\{[\\s\\S]*"' + key + '"[\\s\\S]*\\}'));
        if (m) { try { out = JSON.parse(m[0]); } catch (_) {} }
      }
      if (!out) throw new Error('AI가 결과를 돌려주지 않았습니다' + (data.stop_reason ? ` (${data.stop_reason})` : ''));
      if (data.stop_reason === 'max_tokens') throw new Error('답이 길어 잘렸습니다. 쪽을 나눠서 다시 해 주세요');
    } else {
      const msg = (data.output || []).find(o => o.type === 'message');
      const txt = msg && (msg.content || []).find(c => c.type === 'output_text');
      if (!txt) throw new Error('AI가 결과를 돌려주지 않았습니다' + (data.status ? ` (${data.status})` : ''));
      out = JSON.parse(txt.text);
    }
    return { result: out, usage: { in: (data.usage && data.usage.input_tokens) || 0, out: (data.usage && data.usage.output_tokens) || 0 } };
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function send(settings, getToken, payload, key, signal) {
    const base = settings.url.replace(/\/+$/, '');
    const bodyText = JSON.stringify(payload);
    if (bodyText.length > 30e6) throw new Error('보낼 그림이 너무 큽니다. 쪽 수를 줄여 주세요');
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${base}/${settings.provider}`, { method: 'POST', signal, body: bodyText,
        headers: { 'Authorization': 'Bearer ' + await getToken(), 'Content-Type': 'application/json' } });
      let data; try { data = await res.json(); } catch (_) { data = {}; }
      if (res.ok) return pick(settings.provider, data, key);
      const msg = (data.error && (data.error.message || data.error.type)) || ('HTTP ' + res.status);
      if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 3) { await wait(8000 * (attempt + 1)); continue; }
      const hint = res.status === 403 ? ' — Claude가 요청을 막았습니다. 대개 Cloudflare가 홍콩 서버를 거쳐 보냈을 때 생깁니다. Worker 설정의 Placement를 미국으로 바꿔 주세요'
        : res.status === 401 && /api.key|x-api-key|authentication/i.test(msg) ? ' — API 키가 틀렸습니다. Worker의 키 값을 확인해 주세요'
        : /credit|balance/i.test(msg) ? ' — 크레딧이 부족합니다. 콘솔 Billing에서 충전해 주세요' : '';
      throw new Error(msg + hint);
    }
  }

  // 시험지 읽기: pages = SudoPages.load() 결과
  async function analyze({ settings, getToken, pages, meta, catalogLines, example, signal, withAns }) {
    if (!pages.length) throw new Error('읽을 쪽이 없습니다');
    const p = body(settings.provider, settings.model, imgContent(pages, settings.provider), examPrompt(meta, catalogLines, example, withAns),
      'save_items', examSchema(!!withAns), '당신은 한국 중학교 수학 내신 시험지를 문항별로 분석하는 꼼꼼한 조교입니다.');
    return send(settings, getToken, p, 'items', signal);
  }
  // 자료 색인: 쪽 몇 장씩
  async function indexMaterial({ settings, getToken, pages, meta, catalogLines, signal }) {
    const p = body(settings.provider, settings.model, imgContent(pages, settings.provider), matPrompt(meta, catalogLines),
      'save_problems', matSchema, '당신은 수학 학원 자료에서 문제를 하나씩 찾아 분류하는 조교입니다.');
    return send(settings, getToken, p, 'problems', signal);
  }
  // 유사도: 글자만 보내므로 빠르고 싸다
  async function rankSimilar({ settings, getToken, target, cands, n }) {
    const text = [
      '기준 문항은 학교 시험 문제이고, 후보는 학원이 내신대비 때 학생들과 함께 푼 자료의 문제입니다. 기준 문항과 가장 비슷한 후보를 고르세요.',
      '비슷함 = 같은 개념·같은 풀이 흐름·같은 조건 구조. 숫자만 다른 문제가 가장 비슷합니다. why에는 어떤 부분이 비슷한지, concept에는 풀이에 필요한 핵심 개념을 학부모님이 읽기 쉬운 말로 적습니다.',
      `기준: [${target.type}] [${target.diff}] ${target.q}`, '', '후보 (id | 유형 | 난이도 | 내용):',
      ...cands.map(c => `${c.id} | ${c.type} | ${c.diff} | ${c.q}`), '',
      `가장 비슷한 순서로 최대 ${n || 3}개를 save_picks 로 돌려주세요.`
    ].join('\n');
    const s = Object.assign({}, settings, { model: FAST[settings.provider] || settings.model });
    const p = body(s.provider, s.model, [], text, 'save_picks', simSchema, '당신은 수학 문제의 유사도를 판단하는 조교입니다.');
    return send(s, getToken, p, 'picks');
  }
  async function status(settings, getToken) {
    const res = await fetch(settings.url.replace(/\/+$/, '') + '/status', { headers: { 'Authorization': 'Bearer ' + await getToken() } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((d.error && d.error.message) || 'HTTP ' + res.status);
    return d;
  }
  return { MODELS, analyze, indexMaterial, rankSimilar, status, examPrompt, examSchema };
})();
