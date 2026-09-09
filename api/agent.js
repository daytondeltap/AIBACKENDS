const MODEL = process.env.AI_MODEL || 'alibaba/qwen3.8-flash';
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MAX_BODY_CHARS = 120_000;
const MAX_TASK_CHARS = 1_500;
const MAX_RESULT_CHARS = 500;
const MAX_PAGE_CHARS = 90_000;

const recentRequests = new Map();

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  return forwarded.split(',')[0].trim() || String(req.socket?.remoteAddress || 'unknown');
}

function allowRequest(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 90;
  const current = recentRequests.get(ip) || [];
  const fresh = current.filter((stamp) => now - stamp < windowMs);

  if (fresh.length >= limit) return false;

  fresh.push(now);
  recentRequests.set(ip, fresh);

  if (recentRequests.size > 500) {
    for (const [key, stamps] of recentRequests.entries()) {
      if (!stamps.some((stamp) => now - stamp < windowMs)) recentRequests.delete(key);
    }
  }

  return true;
}

function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

function compactPage(page) {
  if (!page || typeof page !== 'object') return {};

  const compact = {
    u: clip(page.u || page.url, 2_000),
    t: clip(page.t || page.title, 300),
    y: Number(page.y || 0),
    vh: Number(page.vh || 0),
    ph: Number(page.ph || 0),
    x: clip(page.x || page.text, 12_000),
    e: Array.isArray(page.e || page.elements)
      ? (page.e || page.elements).slice(0, 120)
      : [],
    sv: clip(page.sv || page.snapshotVersion, 120),
  };

  const serialized = JSON.stringify(compact);
  if (serialized.length <= MAX_PAGE_CHARS) return compact;

  compact.x = compact.x.slice(0, 4_000);
  compact.e = compact.e.slice(0, 60);
  return compact;
}

function parseAction(text) {
  const raw = String(text || '').trim();
  let value;

  try {
    value = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('model_returned_invalid_json');
    value = JSON.parse(match[0]);
  }

  if (!value || typeof value.action !== 'string') {
    throw new Error('model_returned_no_action');
  }

  const allowed = new Set([
    'click',
    'type',
    'select',
    'submit',
    'scroll',
    'navigate',
    'wait',
    'finish',
  ]);

  if (!allowed.has(value.action)) {
    throw new Error(`unsupported_action:${value.action}`);
  }

  return value;
}

function systemPrompt(step, maxSteps) {
  return `You are Web Spoofer's browser agent planner. Return exactly ONE JSON object and no markdown.

Allowed actions:
{"action":"click","id":"a12","sv":"snapshot-version"}
{"action":"type","id":"a5","text":"search words","sv":"snapshot-version"}
{"action":"select","id":"a8","value":"option","sv":"snapshot-version"}
{"action":"submit","id":"a5","sv":"snapshot-version"}
{"action":"scroll","direction":"down","amount":650}
{"action":"navigate","url":"https://example.com/path"}
{"action":"wait","ms":700}
{"action":"finish","message":"task completed"}

Page fields are compact: u=url, t=title, x=relevant visible text, e=interactive elements, sv=snapshot version.
Element fields can include i=id, k=kind, l=label, h=href, n=name, p=placeholder, v=value, o=options.

Rules:
- Use only element ids that exist in the CURRENT e list.
- Copy the current sv into click/type/select/submit actions.
- Normal text/search fields are allowed. You may type search queries and submit forms/search boxes.
- Password fields are always off-limits.
- Payment/financial credential fields and payment/purchase/transfer buttons are off-limits.
- File inputs are off-limits.
- Do not use javascript:, data:, file:, chrome:, or other non-http(s) navigation.
- Use one action at a time; the extension will inspect the changed page again afterward.
- If the prior result says the element became stale, choose again from the new snapshot instead of repeating an old id.
- Do not claim success unless the current page state supports it.
- Step ${step}/${maxSteps}.`;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (!allowRequest(req)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }

  const auth = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!auth) {
    return res.status(503).json({
      ok: false,
      error: 'gateway_auth_missing',
      hint: 'Deploy on Vercel with OIDC or set AI_GATEWAY_API_KEY.',
    });
  }

  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (raw.length > MAX_BODY_CHARS) {
      return res.status(413).json({ ok: false, error: 'request_too_large' });
    }

    const body = jsonBody(req);
    const task = clip(body.task, MAX_TASK_CHARS).trim();
    const lastResult = clip(body.lastResult || 'none', MAX_RESULT_CHARS);
    const step = Math.max(1, Math.min(30, Number(body.step) || 1));
    const maxSteps = Math.max(step, Math.min(30, Number(body.maxSteps) || 12));
    const page = compactPage(body.page);

    if (!task) return res.status(400).json({ ok: false, error: 'task_required' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    let gatewayResponse;
    try {
      gatewayResponse = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt(step, maxSteps) },
            {
              role: 'user',
              content: JSON.stringify({ task, lastResult, page }),
            },
          ],
          temperature: 0,
          max_tokens: 220,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const gatewayText = await gatewayResponse.text();
    let gatewayJson = {};
    try {
      gatewayJson = JSON.parse(gatewayText);
    } catch {
      gatewayJson = { raw: gatewayText.slice(0, 1_000) };
    }

    if (!gatewayResponse.ok) {
      console.error('AI Gateway error', gatewayResponse.status, gatewayJson);
      return res.status(502).json({
        ok: false,
        error: 'model_backend_failed',
        status: gatewayResponse.status,
      });
    }

    const content = gatewayJson?.choices?.[0]?.message?.content || '';
    const action = parseAction(content);

    return res.status(200).json({
      ok: true,
      action,
      model: gatewayJson.model || MODEL,
      usage: gatewayJson.usage || null,
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    console.error('agent endpoint error', error);
    return res.status(aborted ? 504 : 500).json({
      ok: false,
      error: aborted ? 'model_timeout' : String(error?.message || 'agent_failed'),
    });
  }
}
