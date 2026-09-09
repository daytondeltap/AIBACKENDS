const MODEL = {
  id: 'onnx-community/Qwen2.5-0.5B-Instruct',
  revision: '516c8d04add8a80c5228f32102b57953b8d421a9',
  dtype: 'q4f16',
  device: 'webgpu',
  modelFile: 'onnx/model_q4f16.onnx',
  modelBytes: 483003582,
  sha256: 'b11c1dd99efd57e6c6e5bc4443a019931a5fbd5dd500d48644d8225f5ce0b2cb',
  transformersVersion: '3.8.0',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  return res.status(200).json({
    ok: true,
    ...MODEL,
    inferenceHost: 'https://aibackends.vercel.app/engine.html',
    source: `https://huggingface.co/${MODEL.id}/tree/${MODEL.revision}`,
  });
}
