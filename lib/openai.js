const fs = require('fs');
const fetch = require('node-fetch');

let OPENAI_KEY = process.env.OPENAI_KEY;
if (!OPENAI_KEY) {
  try {
    const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    OPENAI_KEY = cfg.openaiKey || cfg.openAIKey || cfg.OPENAI_KEY;
  } catch (e) {
    // ignore
  }
}

if (!OPENAI_KEY) {
  console.warn('OpenAI key not found in env or config.json.');
}

const OPENAI_BASE = 'https://api.openai.com/v1';

// Configurable concurrency & timeouts via env
const OPENAI_CONCURRENCY = parseInt(process.env.OPENAI_CONCURRENCY || '4', 10);
const OPENAI_REQ_TIMEOUT_MS = parseInt(process.env.OPENAI_REQ_TIMEOUT_MS || '20000', 10); // applies to text; embeddings overrides internally
const OPENAI_EMBED_BATCH = Math.max(1, parseInt(process.env.OPENAI_EMBED_BATCH || '1', 10)); // if >1, we send array input to embeddings endpoint

// Simple concurrency limiter (promise pool)
class Limiter {
  constructor(limit) { this.limit = Math.max(1, limit); this.active = 0; this.queue = []; }
  run(fn) {
    return new Promise((resolve, reject) => {
      const task = () => {
        this.active++;
        Promise.resolve().then(fn).then(
          (v) => { this.active--; this._next(); resolve(v); },
          (e) => { this.active--; this._next(); reject(e); }
        );
      };
      if (this.active < this.limit) task(); else this.queue.push(task);
    });
  }
  _next() { if (this.queue.length && this.active < this.limit) { const t = this.queue.shift(); t(); } }
}

const globalLimiter = new Limiter(OPENAI_CONCURRENCY);

function limited(fn) { return (...args) => globalLimiter.run(() => fn(...args)); }

async function _createEmbeddingInternal(input, model = process.env.OPENAI_MODEL || 'text-embedding-3-small') {
  // input can be string or array of strings (batch)
  const isBatch = Array.isArray(input);
  // Retry with exponential backoff for transient errors (5xx, 429, connection resets)
  const maxAttempts = 4;
  const baseTimeoutMs = 15_000; // per-request timeout for embeddings

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), baseTimeoutMs);
    try {
      const res = await fetch(`${OPENAI_BASE}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({ input, model }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text().catch(() => '<no-body>');
        const statusText = `${res.status} ${res.statusText}`;
        const errMsg = `Create embedding failed: ${statusText} - ${body}`;
        // Retry on 429 (rate limit) and 5xx server errors
        if ((res.status >= 500 && res.status < 600) || res.status === 429) {
          if (attempt < maxAttempts) {
            const backoff = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
            console.warn(`${errMsg} — retrying in ${backoff}ms (attempt ${attempt}/${maxAttempts})`);
            await sleep(backoff);
            continue;
          }
        }
        throw new Error(errMsg);
      }

      const json = await res.json();
      if (!json || !json.data || !json.data.length) {
        throw new Error('Create embedding failed: malformed response');
      }
      // Return array if batch, else single embedding
      return isBatch ? json.data.map(d => d.embedding) : json.data[0].embedding;
    } catch (err) {
      clearTimeout(timeout);
      // If aborted or network errors, consider retrying
      const msg = err && err.message ? err.message : String(err);
      const retryable = msg.includes('Abort') || msg.includes('ECONNRESET') || msg.includes('EPIPE') || msg.includes('upstream') || msg.includes('502') || msg.includes('503') || msg.includes('timeout') || msg.includes('socket');
      if (attempt < maxAttempts && retryable) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
        console.warn(`Create embedding attempt ${attempt} failed: ${msg} — retrying in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      // Non-retryable or out of attempts
      throw new Error(`Create embedding failed ${msg}`);
    }
  }
}

// Public embedding helper with batching & concurrency
async function createEmbedding(text, model) {
  // Single input path, still goes through limiter
  return limited(_createEmbeddingInternal)(text, model);
}

async function createEmbeddingsBatch(texts, model) {
  if (!Array.isArray(texts) || !texts.length) return [];
  // If batch size is 1, just do limited singles sequentially
  if (OPENAI_EMBED_BATCH === 1) {
    const out = [];
    for (const t of texts) out.push(await createEmbedding(t, model));
    return out;
  }
  // chunk texts into OPENAI_EMBED_BATCH and issue limited calls
  const chunks = [];
  for (let i = 0; i < texts.length; i += OPENAI_EMBED_BATCH) chunks.push(texts.slice(i, i + OPENAI_EMBED_BATCH));
  const results = [];
  for (const c of chunks) {
    // Use a single API call with array input
    const embArray = await limited(_createEmbeddingInternal)(c, model);
    results.push(...embArray);
  }
  return results;
}

async function _generateTextInternal(prompt, maxTokens = 800, timeoutOverrideMs = null) {
  // Retry logic for completions (handles 5xx/502/503/520/html responses)
  const maxAttempts = 4;
  const baseTimeoutMs = timeoutOverrideMs || OPENAI_REQ_TIMEOUT_MS;

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), baseTimeoutMs);
    try {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await res.text().catch(() => '');
      // detect HTML error pages (Cloudflare 520 etc.) and treat as retryable
      const isHtml = text.trim().startsWith('<!DOCTYPE html>') || text.includes('<title>api.openai.com');

      if (!res.ok) {
        const statusText = `${res.status} ${res.statusText}`;
        const errMsg = `Completion failed: ${statusText} - ${text}`;
        if (isHtml || (res.status >= 500 && res.status < 600) || res.status === 429) {
          if (attempt < maxAttempts) {
            const backoff = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
            console.warn(`${errMsg} — retrying in ${backoff}ms (attempt ${attempt}/${maxAttempts})`);
            await sleep(backoff);
            continue;
          }
        }
        throw new Error(errMsg);
      }

      // parse JSON (we already consumed text); handle empty or non-json bodies
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new Error(`Completion failed: invalid JSON response - ${text.slice(0, 200)}`);
      }
      if (!json || !json.choices || !json.choices[0] || !json.choices[0].message) {
        throw new Error(`Completion failed: malformed response - ${JSON.stringify(json).slice(0,200)}`);
      }
      return json.choices[0].message.content;
    } catch (err) {
      clearTimeout(timeout);
      const msg = err && err.message ? err.message : String(err);
      const retryable = msg.includes('Abort') || msg.includes('ECONNRESET') || msg.includes('EPIPE') || msg.includes('upstream') || msg.includes('502') || msg.includes('503') || msg.includes('520') || msg.includes('timeout') || msg.includes('socket');
      if (attempt < maxAttempts && retryable) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
        console.warn(`Completion attempt ${attempt} failed: ${msg} — retrying in ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      throw new Error(`Completion failed: ${msg}`);
    }
  }
}

async function generateText(prompt, maxTokens = 800) {
  return limited(_generateTextInternal)(prompt, maxTokens, null);
}

async function generateTextWithOptions(prompt, { maxTokens = 800, timeoutMs = null } = {}) {
  return limited(_generateTextInternal)(prompt, maxTokens, timeoutMs);
}

module.exports = { createEmbedding, createEmbeddingsBatch, generateText, generateTextWithOptions };
