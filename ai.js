// 수도 내신분석 — AI로 시험지 읽기 (Claude 또는 GPT, Worker를 거쳐서)
window.SudoAI = (function () {
  const MODELS = {
    claude: [['claude-sonnet-5-5', 'Claude Sonnet 5.5 (권장 · 빠름)'], ['claude-opus-5-5', 'Claude Opus 5.5 (가장 꼼꼼 · 비쌈)']],
    openai: [['gpt-5.6', 'GPT-5.6'], ['gpt-5.6-mini', 'GPT-5.6 mini (저렴)']]
  };
  const DIFFS = ['기본', '응용', '실력', '심화'];
  const BEHS = ['이해', '계산', '추론', '문제해결'];

  const ITEM = {
    type: 'object', additionalProperties: false,
    required: ['no', 'pts', 'diff', 'beh', 'essay', 'code', 'big', 'mid', 'type', 'conf', 'note'],
    properties: {
      no: { type: 'integer', description: '문항 번호. 서답형은 객관식 다음 번호로 이어서' },
      pts: { type: ['number', 'null'], description: '배점. 시험지나 배점표에 없으면 null' },
      diff: { type: 'string', enum: DIFFS },
      beh: { type: 'string', enum: BEHS },
      essay: { type: 'boolean', description: '서답형·서술형이면 true' },
      code: { type: 'string', description: '유형 목록에서 고른 코드. 맞는 것이 없으면 빈 문자열' },
      big: { type: 'string', description: '대단원 (예: Ⅰ.수와 식)' },
      mid: { type: 'string', description: '중단원, "NN.이름" 형식 (예: 01.유리수와 소수)' },
      type: { type: 'string', description: '유형 이름' },
      conf: { type: 'number', description: '0~1. 배점·난이도·유형이 애매하면 낮게' },
      note: { type: 'string', description: '문항이 묻는 것 15자 안팎' }
    }
  };
  // 정답까지 풀 때: 풀이 요지(sol)를 먼저 쓰고 정답(ans)을 쓰게 순서를 둔다
  const ITEM_ANS = JSON.parse(JSON.stringify(ITEM));
  ITEM_ANS.properties = Object.assign({}, ITEM.properties, {
    sol: { type: 'string', description: '직접 푼 풀이의 핵심 (식·값 위주 80자 이내)' },
    ans: { type: 'string', description: '정답. 객관식은 ①~⑤ (복수 정답은 ②,④), 서답형은 최종 값이나 식' }
  });
  ITEM_ANS.required = ITEM.required.concat(['sol', 'ans']);
  const schemaFor = withAns => ({
    type: 'object', additionalProperties: false, required: ['items', 'total_pts', 'warnings'],
    properties: {
      items: { type: 'array', items: withAns ? ITEM_ANS : ITEM },
      total_pts: { type: ['number', 'null'], description: '배점 합계 (보이는 경우)' },
      warnings: { type: 'array', items: { type: 'string' }, description: '흐릿한 쪽, 빠진 문항 등 원장님이 볼 점' }
    }
  });
  const SCHEMA = {
    type: 'object', additionalProperties: false, required: ['items', 'total_pts', 'warnings'],
    properties: {
      items: { type: 'array', items: ITEM },
      total_pts: { type: ['number', 'null'], description: '배점 합계 (보이는 경우)' },
      warnings: { type: 'array', items: { type: 'string' }, description: '흐릿한 쪽, 빠진 문항 등 원장님이 볼 점' }
    }
  };

  function prompt(meta, catalogLines, example, withAns) {
    return [
      `다음은 ${meta.school} ${meta.year}학년도 ${meta.grade}학년 ${meta.sem}학기 ${meta.exam}고사 수학 시험지입니다 (과정: ${meta.course}).`,
      '모든 문항을 빠짐없이 번호 순서대로 분석해 save_items 형식으로 돌려주세요.',
      '',
      '[배점] 시험지에 적힌 배점([3.5점], 4.2점 등)을 그대로 씁니다. 시험지에 없으면 함께 준 정답·배점표에서 찾습니다. 그래도 없으면 null.',
      '[서답형] 서답형·서술형 문항은 essay=true. 번호는 객관식 마지막 번호 다음부터 이어 붙입니다 (객관식 20개면 서답형 1번 → 21).',
      '[난이도] 기본=개념·공식을 바로 적용하는 한두 단계 / 응용=개념 두세 개를 엮거나 조건을 한 번 바꿔 생각 / 실력=여러 개념 결합·조건 해석이 필요한 상위권 변별 문항 / 심화=최상위 변별, 낯선 상황·긴 풀이.',
      '[행동영역] 이해=개념·용어·성질 확인 / 계산=식 계산·값 구하기가 중심 / 추론=성질·조건으로 판단, 참거짓, 규칙 찾기 / 문제해결=상황을 식으로 세워 푸는 활용·도형 응용.',
      '[유형] 아래 유형 목록에서 가장 가까운 code를 고르고 big·mid·type에 그 이름을 적습니다. 꼭 맞는 것이 없으면 code는 ""로 두고, 교과서 단원 순서에 맞춰 big("Ⅰ.이름"), mid("NN.이름"), type(새 유형 이름)을 제안합니다.',
      '[확신도] 배점이 안 보이거나, 난이도·유형이 둘 사이에서 애매하면 conf를 0.6 아래로 둡니다.',
      withAns ? '[정답] 모든 문항을 직접 풀어서 sol에 풀이 핵심을 먼저 적고 ans에 정답을 적습니다. 객관식은 보기 번호(①~⑤), 서답형은 최종 값이나 식. 정답지가 함께 있으면 정답지를 따르되 직접 푼 답과 다르면 warnings에 문항 번호를 적습니다. 문제가 흐려서 확실히 풀 수 없으면 conf를 0.5 아래로 둡니다.' : '',
      '[주의] 정답지·채점기준이 같이 들어 있으면 문항 분석은 시험지 기준으로 하고, 정답지는 배점 확인에만 씁니다. 흐릿하거나 잘린 쪽이 있으면 warnings에 적습니다.',
      '',
      catalogLines.length ? `[유형 목록] code | 대단원 | 중단원 | 유형\n${catalogLines.join('\n')}` : '[유형 목록] 이 과정은 아직 목록이 없습니다. 모든 문항을 code ""로 두고 단원·유형을 제안해 주세요.',
      example ? `\n[참고: 같은 과정 지난 시험을 원장님이 분석한 결과] 번호 | 배점 | 난이도 | 행동 | code\n${example}` : ''
    ].join('\n');
  }

  async function fileParts(files) {
    const out = [];
    for (const f of files) {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = () => rej(new Error(f.name + ' 파일을 읽지 못했습니다'));
        r.readAsDataURL(f);
      });
      const t = (f.type || '').toLowerCase(), n = f.name.toLowerCase();
      const kind = t === 'application/pdf' || n.endsWith('.pdf') ? 'pdf' : /\.(jpe?g)$/.test(n) || t === 'image/jpeg' ? 'image/jpeg' : /\.png$/.test(n) || t === 'image/png' ? 'image/png' : null;
      if (!kind) throw new Error(f.name + ': PDF·JPG·PNG만 읽을 수 있습니다 (한글 파일은 PDF로 저장해서 넣어 주세요)');
      out.push({ name: f.name, kind, b64 });
    }
    return out;
  }

  function claudeBody(model, parts, text, schema) {
    const content = parts.map(p => p.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.b64 }, title: p.name }
      : { type: 'image', source: { type: 'base64', media_type: p.kind, data: p.b64 } });
    content.push({ type: 'text', text });
    return {
      model, max_tokens: 16000,
      system: '당신은 한국 중학교 수학 내신 시험지를 문항별로 분석하는 꼼꼼한 조교입니다. 반드시 save_items 도구 하나로만 답합니다.',
      tools: [{ name: 'save_items', description: '문항별 분석 결과를 저장한다', input_schema: schema }],
      tool_choice: { type: 'tool', name: 'save_items' },
      messages: [{ role: 'user', content }]
    };
  }
  function openaiBody(model, parts, text, schema) {
    const content = parts.map(p => p.kind === 'pdf'
      ? { type: 'input_file', filename: p.name, file_data: 'data:application/pdf;base64,' + p.b64 }
      : { type: 'input_image', image_url: `data:${p.kind};base64,${p.b64}` });
    content.push({ type: 'input_text', text });
    return {
      model,
      instructions: '당신은 한국 중학교 수학 내신 시험지를 문항별로 분석하는 꼼꼼한 조교입니다. 주어진 JSON 형식으로만 답합니다.',
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: 'save_items', schema, strict: true } }
    };
  }
  function pick(provider, data) {
    if (provider === 'claude') {
      const t = (data.content || []).find(c => c.type === 'tool_use');
      if (!t) throw new Error('AI가 문항표를 돌려주지 않았습니다' + (data.stop_reason ? ` (${data.stop_reason})` : ''));
      if (data.stop_reason === 'max_tokens') throw new Error('답이 길어 잘렸습니다. 파일을 나눠서 다시 해 주세요');
      return { result: t.input, usage: { in: data.usage && data.usage.input_tokens, out: data.usage && data.usage.output_tokens } };
    }
    const msg = (data.output || []).find(o => o.type === 'message');
    const txt = msg && (msg.content || []).find(c => c.type === 'output_text');
    if (!txt) throw new Error('AI가 문항표를 돌려주지 않았습니다' + (data.status ? ` (${data.status})` : ''));
    return { result: JSON.parse(txt.text), usage: { in: data.usage && data.usage.input_tokens, out: data.usage && data.usage.output_tokens } };
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  // settings: {url, provider, model}, getToken: () => Promise<idToken>
  async function analyze({ settings, getToken, files, meta, catalogLines, example, signal, withAns }) {
    const parts = await fileParts(files);
    const size = parts.reduce((s, p) => s + p.b64.length, 0);
    if (size > 30e6) throw new Error('파일이 너무 큽니다 (합계 22MB 이하로 넣어 주세요)');
    const text = prompt(meta, catalogLines, example, withAns);
    const schema = schemaFor(!!withAns);
    const body = JSON.stringify(settings.provider === 'claude' ? claudeBody(settings.model, parts, text, schema) : openaiBody(settings.model, parts, text, schema));
    const base = settings.url.replace(/\/+$/, '');
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${base}/${settings.provider}`, {
        method: 'POST', signal, body,
        headers: { 'Authorization': 'Bearer ' + await getToken(), 'Content-Type': 'application/json' }
      });
      let data; try { data = await res.json(); } catch (_) { data = {}; }
      if (res.ok) return pick(settings.provider, data);
      const msg = (data.error && (data.error.message || data.error.type)) || ('HTTP ' + res.status);
      if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 3) { await wait(8000 * (attempt + 1)); continue; }
      throw new Error(msg);
    }
  }
  async function status(settings, getToken) {
    const res = await fetch(settings.url.replace(/\/+$/, '') + '/status', { headers: { 'Authorization': 'Bearer ' + await getToken() } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((d.error && d.error.message) || 'HTTP ' + res.status);
    return d;
  }
  return { MODELS, analyze, status, prompt, SCHEMA };
})();
