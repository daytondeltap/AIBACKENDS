# AIBACKENDS

Browser-side model host/registry for Web Spoofer.

## Architecture

Web Spoofer creates a hidden offscreen iframe pointing to `https://aibackends.vercel.app/engine.html`.

That normal HTTPS page loads Transformers.js and the pinned browser-ready Qwen model from their CDNs, then runs inference with WebGPU. The extension sends compact page snapshots to the iframe and receives one JSON browser action at a time.

This avoids:

- Supabase or any database
- Ollama or another local server
- Vercel AI Gateway inference billing
- shipping a ~483 MB model inside the extension ZIP

The first Qwen load still downloads the model once because inference runs on the user's GPU. Transformers.js browser caching allows subsequent loads to reuse downloaded assets.

## Model

- `onnx-community/Qwen2.5-0.5B-Instruct`
- revision `516c8d04add8a80c5228f32102b57953b8d421a9`
- WebGPU `q4f16`
- `onnx/model_q4f16.onnx`
- 483,003,582 bytes
- SHA-256 `b11c1dd99efd57e6c6e5bc4443a019931a5fbd5dd500d48644d8225f5ce0b2cb`

## Routes

- `/engine.html` — hidden browser inference host used by Web Spoofer
- `/engine.js` — WebGPU Qwen runtime
- `GET /api/health` — host readiness metadata
- `GET /api/model` — pinned model/revision/checksum manifest

There is intentionally no server-side `/api/agent` inference route.

## Agent execution

The model only plans actions. Web Spoofer validates and executes them in the page:

- click
- type into ordinary text/search fields
- select
- submit ordinary forms/search boxes
- scroll
- navigate to HTTP(S) pages
- wait
- finish

Passwords, file inputs, card/CVV/bank/payment fields, and payment/purchase/transfer controls remain blocked by the extension execution layer.
