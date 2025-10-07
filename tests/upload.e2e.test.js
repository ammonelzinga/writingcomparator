jest.mock('../lib/openai', () => ({
  createEmbedding: jest.fn(async (text) => new Array(1536).fill(0.001)),
  createEmbeddingsBatch: jest.fn(async (inputs) => inputs.map(() => new Array(1536).fill(0.002))),
  generateText: jest.fn(async (prompt) => 'short summary'),
}));

jest.mock('../lib/supabaseClient', () => {
  const chainable = () => ({
    select: () => chainable(),
    single: async () => ({ data: { document_id: 1 }, error: null }),
    in: () => chainable(),
    eq: () => chainable(),
    range: () => ({ data: [], error: null }),
    insert: (payload) => ({
      select: () => ({
        single: async () => ({ data: { ...(payload && payload[0] ? payload[0] : {}), document_id: 1, overview_id: 1, theme_id: 1 }, error: null }),
        // emulate returning inserted rows for batch insert
        then: undefined,
        [Symbol.asyncIterator]: undefined,
        // custom method to simulate .select() returning list
      }),
    }),
    update: () => ({ data: [], error: null }),
    upsert: async () => ({ data: [], error: null }),
    delete: () => chainable(),
    not: () => chainable(),
    then: undefined // prevent thenable detection
  });
  return {
    from: () => chainable(),
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
