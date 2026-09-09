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
    service: 'web-spoofer-agent-host',
    mode: 'client-webgpu',
    model: 'onnx-community/Qwen2.5-0.5B-Instruct',
    dtype: 'q4f16',
    modelBytes: 483003582,
    ready: true,
  });
}
