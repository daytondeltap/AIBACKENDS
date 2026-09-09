import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.0';

const CHANNEL = 'web-spoofer-agent-v1';
const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
const REVISION = '516c8d04add8a80c5228f32102b57953b8d421a9';
const DTYPE = 'q4f16';
const statusNode = document.getElementById('status');

let generatorPromise = null;
let ready = false;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

function post(type, payload = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ ns: CHANNEL, type, ...payload }, '*');
}

function progressUpdate(update) {
  const progress = Number(update?.progress);
  const file = String(update?.file || update?.name || 'model');
  const state = String(update?.status || 'loading');
  const value = Number.isFinite(progress)
    ? Math.max(0, Math.min(100, progress))
    : null;

  statusNode.textContent = value === null
    ? `${state} ${file}`
    : `${state} ${file} ${Math.round(value)}%`;

  post('progress', { progress: value, file, status: state });
}

async function createGenerator() {
  if (!navigator.gpu) {
    throw new Error('WebGPU is unavailable in this browser/device');
  }

  statusNode.textContent = 'loading qwen model';

  const generator = await pipeline(
    'text-generation',
    MODEL,
    {
      revision: REVISION,
      dtype: DTYPE,
      device: 'webgpu',
      progress_callback: progressUpdate,
    },
  );

  ready = true;
  statusNode.textContent = 'qwen ready';
  post('ready', { model: MODEL, revision: REVISION, dtype: DTYPE });
  return generator;
}

async function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = createGenerator().catch((error) => {
      generatorPromise = null;
      ready = false;
      throw error;
    });
  }
  return generatorPromise;
}

function normalizeText(output) {
  const value = output?.[0]?.generated_text;
  if (typeof value === 'string') return value.trim();

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const item = value[index];
      if (item?.role === 'assistant' && typeof item.content === 'string') {
        return item.content.trim();
      }
    }
    const last = value[value.length - 1];
    if (typeof last?.content === 'string') return last.content.trim();
  }

  return '';
}

function looksDegenerate(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  if (!compact) return true;
  if (/(.)\1{18,}/.test(compact)) return true;

  if (compact.length >= 24) {
    const diversity = new Set(compact).size;
    if (diversity <= 4) return true;
  }

  return false;
}

async function generate(messages) {
  const generator = await getGenerator();

  const safeMessages = Array.isArray(messages)
    ? messages.slice(-2).map((message) => ({
        role: ['system', 'user', 'assistant'].includes(message?.role)
          ? message.role
          : 'user',
        content: String(message?.content || '').slice(0, 9000),
      }))
    : [];

  const output = await generator(safeMessages, {
    max_new_tokens: 48,
    do_sample: false,
    num_beams: 1,
    repetition_penalty: 1.15,
    no_repeat_ngram_size: 3,
    return_full_text: false,
  });

  const text = normalizeText(output);
  if (!text) throw new Error('local Qwen returned an empty response');

  if (looksDegenerate(text)) {
    throw new Error('local Qwen produced a degenerate repeated response');
  }

  return text;
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent) return;

  const message = event.data;
  if (!message || message.ns !== CHANNEL || !message.id) return;

  try {
    if (message.type === 'status') {
      post('response', {
        id: message.id,
        ok: true,
        value: {
          ready,
          loading: Boolean(generatorPromise && !ready),
          webgpu: Boolean(navigator.gpu),
          model: MODEL,
          revision: REVISION,
          dtype: DTYPE,
        },
      });
      return;
    }

    if (message.type === 'prepare') {
      await getGenerator();
      post('response', {
        id: message.id,
        ok: true,
        value: { ready: true, model: MODEL, dtype: DTYPE },
      });
      return;
    }

    if (message.type === 'generate') {
      const text = await generate(message.messages || []);
      post('response', {
        id: message.id,
        ok: true,
        value: {
          text,
          model: MODEL,
          device: 'webgpu',
          dtype: DTYPE,
        },
      });
      return;
    }

    throw new Error(`unknown engine request: ${message.type}`);
  } catch (error) {
    statusNode.textContent = String(error?.message || 'engine error');
    post('response', {
      id: message.id,
      ok: false,
      error: String(error?.message || 'engine request failed'),
    });
  }
});

post('host-loaded', {
  webgpu: Boolean(navigator.gpu),
  model: MODEL,
  dtype: DTYPE,
});
