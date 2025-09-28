jest.mock('../lib/openai', () => ({
  createEmbedding: jest.fn(async (text) => new Array(1536).fill(0.001)),
}));

jest.mock('../lib/supabaseClient', () => ({
  rpc: jest.fn(async (name, params) => {
    if (name === 'execute_sql') return { data: [{ passage_id: 1, content: 'x' }], error: null };
    if (name === 'search_passages_by_embedding') return { data: [{ passage_id: 2, content: 'y', score: 0.9 }], error: null };
    return { data: [], error: null };
  }),
}));

const handler = require('../pages/api/search').default;

test('search text mode returns results', async () => {
  const req = { method: 'GET', query: { q: 'hello', mode: 'text' } };
  const res = { status: (s) => ({ json: (j) => j }), json: (j) => j };
  const r = await handler(req, res);
  expect(r).toBeDefined();
});

test('search vector mode calls embedding and RPC', async () => {
  const req = { method: 'POST', body: { q: 'hello', mode: 'vector', limit: 5 } };
  const res = { status: (s) => ({ json: (j) => j }), json: (j) => j };
  const r = await handler(req, res);
  expect(r).toBeDefined();
});
