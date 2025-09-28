const searchHandler = require('../pages/api/search').default;
const uploadHandler = require('../pages/api/upload').default;

function makeRes() {
  return {
    status(s) { this._status = s; return this; },
    json(j) { console.log('JSON', j); return j; },
    end() { console.log('end', this._status); },
  };
}

async function run() {
  console.log('Calling search (text)');
  await searchHandler({ method: 'GET', query: { q: 'test', mode: 'text' } }, makeRes());

  console.log('Calling search (vector)');
  await searchHandler({ method: 'POST', body: { q: 'test', mode: 'vector', limit: 3 } }, makeRes());

  console.log('Calling upload (mock)');
  await uploadHandler({ method: 'POST', body: { title: 'T', text: 'a\n\nb' } }, makeRes());
}

run().catch(e => { console.error('smoke failed', e); process.exit(1); });
