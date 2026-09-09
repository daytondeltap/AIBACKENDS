export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  return res.status(200).json({
    ok: true,
    service: 'web-spoofer-agent',
    model: process.env.AI_MODEL || 'alibaba/qwen3.8-flash',
    authMode: 'vercel-ai-sdk-oidc',
    ready: true,
  });
}
