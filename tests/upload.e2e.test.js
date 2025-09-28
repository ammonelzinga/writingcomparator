jest.mock('../lib/openai', () => ({
  createEmbedding: jest.fn(async (text) => new Array(1536).fill(0.001)),
  generateText: jest.fn(async (prompt) => 'short summary'),
}));

jest.mock('../lib/supabaseClient', () => {
  const makeQuery = (table) => ({
    insert: (payload) => ({
      select: () => ({
        single: async () => ({ data: { ...payload[0], document_id: 1 }, error: null }),
      }),
    }),
    select: async () => ({ data: [], error: null }),
    update: async () => ({ data: [], error: null }),
    upsert: async () => ({ data: [], error: null }),
    eq: () => ({ select: async () => ({ data: [], error: null }) }),
    in: () => ({ select: async () => ({ data: [], error: null }) }),
  });
  return {
    from: (table) => makeQuery(table),
    rpc: async () => ({ data: [], error: null }),
  };
});

const handler = require('../pages/api/upload').default;

test('upload handler runs with mocked dependencies', async () => {
  const req = { method: 'POST', body: { title: 'T', text: 'para1\n\npara2' } };
  const res = { status: (s) => ({ end: () => {}, json: (j) => j }), json: (j) => j };
  const result = await handler(req, res);
  // expecting a response object
  expect(result).toBeDefined();
});
