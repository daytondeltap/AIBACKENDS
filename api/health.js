import { generateText } from 'ai';

const MODEL = process.env.AI_MODEL || 'alibaba/qwen3.8-flash';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (String(req.query?.smoke || '') === '1') {
    try {
      const { text } = await generateText({
        model: MODEL,
        prompt: 'Return exactly the word OK.',
        temperature: 0,
        maxOutputTokens: 8,
        abortSignal: AbortSignal.timeout(25_000),
      });

      return res.status(200).json({
        ok: true,
        service: 'web-spoofer-agent',
        model: MODEL,
        authMode: 'vercel-ai-sdk-oidc',
        ready: true,
        smoke: String(text || '').trim(),
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        ready: false,
        model: MODEL,
        error: String(error?.message || 'smoke_failed'),
      });
    }
  }

  return res.status(200).json({
    ok: true,
    service: 'web-spoofer-agent',
    model: MODEL,
    authMode: 'vercel-ai-sdk-oidc',
    ready: true,
  });
}
