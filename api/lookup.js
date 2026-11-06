/* GARMENT ARCHIVE /api/lookup — server-side product lookup for Vercel.
   OPENAI_API_KEY and APP_ACCESS_PIN must be configured in Vercel; never commit secrets. */
const API_URL = 'https://api.openai.com/v1/responses';
const validURL = value => {
  try { const u = new URL(String(value || '')); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; }
  catch { return ''; }
};
const short = (value, n = 500) => typeof value === 'string' ? value.trim().slice(0, n) : '';
const distinct = list => [...new Map(list.map(x => [x.url, x])).values()];

function parseJSON(message) {
  if (!message || typeof message !== 'string') throw Error('検索結果を読み取れませんでした');
  const s = message.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(s); }
  catch { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b < a) throw Error('JSON format'); return JSON.parse(s.slice(a, b + 1)); }
}
function collectSources(response) {
  const urls = [];
  for (const o of response.output || []) {
    for (const x of o.action?.sources || []) {
      const url = validURL(x.url); if (url) urls.push({url, title: short(x.title, 100) || new URL(url).hostname});
    }
    if (o.type === 'message') for (const c of o.content || [])
      for (const a of c.annotations || []) {
        const url = validURL(a.url); if (url) urls.push({url, title: short(a.title, 100) || new URL(url).hostname});
      }
  }
  return distinct(urls);
}
function collectImages(response) {
  const images = [];
  for (const o of response.output || []) {
    const list = Array.isArray(o.results) ? o.results : Array.isArray(o.results?.results) ? o.results.results : [];
    if (o.type !== 'web_search_call') continue;
    for (const x of list) {
      const r = x.image_result || x;
      const url = validURL(r.image_url || (r.type === 'image_result' ? r.url : ''));
      if (url) images.push({url, caption: short(r.caption || r.title, 220), sourceUrl: validURL(r.source_website_url || r.source_url)});
    }
  }
  return distinct(images).slice(0, 20);
}
function normalize(s) {return short(s, 600).normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, '');}
function photosFor(c, images) {
  const model = normalize(c.modelNumber), brand = normalize(c.brand), name = normalize(c.name);
  return images.map(x => {
    const text = normalize([x.caption, x.sourceUrl, x.url].join(' '));
    let score = 0;
    if (model.length >= 4 && text.includes(model)) score += 5;
    if (brand.length >= 3 && text.includes(brand)) score += 2;
    if (name.length >= 7 && text.includes(name.slice(0, 15))) score += 2;
    return {...x, score};
  }).filter(x => x.score >= (model.length >= 4 ? 5 : 4))
    .sort((a,b) => b.score-a.score).slice(0, 6)
    .map(({url,caption,sourceUrl}) => ({url, caption, sourceUrl}));
}
function cleanCandidate(c, sources, images) {
  const allowed = new Set(sources.map(x => x.url));
  const given = (Array.isArray(c.sources) ? c.sources : [])
    .map(x => { const url = validURL(typeof x === 'string' ? x : x?.url);
      return url && allowed.has(url) ? {url, title: short(x?.title, 100) || new URL(url).hostname} : null; })
    .filter(Boolean);
  const evidence = {};
  for (const field of ['brand','name','modelNumber','material','brandStory']) {
    const url = validURL(c.evidence?.[field]);
    if (url && allowed.has(url)) evidence[field] = url;
  }
  const acceptedSources = distinct([...given, ...sources]).slice(0, 6);
  return {
    brand:short(c.brand,150), name:short(c.name,250), modelNumber:short(c.modelNumber,130),
    material:short(c.material,1000), brandStory:short(c.brandStory,1100),
    category:['トップス','ボトムス','アウター','ワンピース','セットアップ','靴','バッグ','小物','その他'].includes(c.category) ? c.category : '',
    color:short(c.color,120), size:'', notes:'', photoUrl:'',
    photoOptions:photosFor(c,images), sources:acceptedSources, evidence,
    confidence:['high','medium','low'].includes(c.confidence) ? c.confidence : 'low',
    caveat:short(c.caveat,350)
  };
}
module.exports = async function handler(req,res) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'POSTのみ対応しています'});
  if (!process.env.APP_ACCESS_PIN || !process.env.OPENAI_API_KEY)
    return res.status(503).json({error:'検索APIの設定が完了していません。OPENAI_API_KEYとAPP_ACCESS_PINを登録してください。'});
  if (req.headers['x-access-pin'] !== process.env.APP_ACCESS_PIN)
    return res.status(401).json({error:'アクセスPINが必要です'});
  const query = short(req.body?.query,260), brand = short(req.body?.brand,100);
  if (query.length < 2) return res.status(400).json({error:'型番か商品名を入力してください'});
  try {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),55000);
    let response;
    try {
      response = await fetch(API_URL,{
        method:'POST', signal:controller.signal,
        headers:{'Authorization':'Bearer ' + process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({
          model:process.env.SEARCH_MODEL || 'gpt-5.4',
          tools:[{type:'web_search', search_context_size:'medium', search_content_types:['text','image'], image_settings:{max_results:8, caption:true}}],
          tool_choice:'required',
          include:['web_search_call.results','web_search_call.action.sources'],
          input:[
            {role:'system',content:'You are a careful clothing archivist. Use live web search for the EXACT model number. Return ONLY valid JSON (no Markdown): {"candidates":[{"brand":"","name":"","modelNumber":"","category":"","material":"","brandStory":"","color":"","confidence":"high","caveat":"","sources":[{"url":"","title":""}],"evidence":{"brand":"URL","name":"URL","modelNumber":"URL","material":"URL","brandStory":"URL"}}]}. Return at most 3 distinct real matching garments. Prefer brand official pages then reliable sellers. Do not invent model numbers, materials, photos, source URLs, or brand background. Omit unknown information. BrandStory must describe the brand, not the individual garment. User-owned size is unknowable: leave it blank. Use Japanese, except names. For no verified match, return {"candidates":[]}. Provide real searched source page URLs.'},
            {role:'user',content:'服の型番・商品名を調べてください。\n入力: ' + query + '\nブランドの手がかり: ' + (brand || 'なし') + '\n別シーズン・類似品と混同しないでください。'}
          ]
        })
      });
    } finally {clearTimeout(timeout);}
    const data = await response.json().catch(()=>null);
    if (!response.ok) {
      console.error('OpenAI error',response.status,data?.error?.message);
      return res.status(502).json({error:'検索APIに接続できませんでした。利用枠・APIキー・モデル設定を確認してください。'});
    }
    const output = (data?.output || []).filter(x=>x.type==='message').flatMap(x=>x.content||[])
      .filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
    const parsed = parseJSON(output);
    const images = collectImages(data), sources = collectSources(data);
    const candidates = (Array.isArray(parsed.candidates) ? parsed.candidates : [])
      .filter(c=>c && typeof c==='object' && (c.name||c.modelNumber))
      .slice(0,3).map(c=>cleanCandidate(c,sources,images));
    return res.status(200).json({candidates});
  } catch (error) {
    console.error('Lookup error',error?.message);
    return res.status(502).json({error:error?.name==='AbortError' ? '検索時間が長すぎました。再度お試しください。' : '検索結果を解析できませんでした。検索語を変えて試してください。'});
  }
};
