const supabase = require('../../lib/supabaseClient');
const { createEmbedding } = require('../../lib/openai');

// GET or POST { q, mode: 'text'|'vector', limit, offset, document_id }
export default async function handler(req, res) {
  const body = req.method === 'GET' ? req.query : req.body;
  const q = body.q || '';
  const mode = body.mode || 'text';
  const limit = Math.min(100, parseInt(body.limit || 10, 10));
  const offset = parseInt(body.offset || 0, 10);
  const document_id = body.document_id || null;

  if (!q) return res.status(400).json({ error: 'q required' });

  try {
    if (mode === 'text') {
      // simple full-text search using plainto_tsquery
      const sql = `select passage_id, content, ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank from passage where to_tsvector('english', content) @@ plainto_tsquery('english', $1)` + (document_id ? ' and document_id = $2' : '') + ' order by rank desc limit $3 offset $4';
      // use execute_sql RPC to run arbitrary select
      const params = document_id ? { p_sql: sql.replace('$1', q).replace('$2', document_id).replace('$3', limit).replace('$4', offset) } : { p_sql: sql.replace('$1', q).replace('$3', limit).replace('$4', offset) };
      const { data, error } = await supabase.rpc('execute_sql', params);
      if (error) return res.status(500).json({ error });
      return res.json({ results: data });
    }

    // vector mode: create embedding and do approximate search via Postgres RPC
    const emb = await createEmbedding(q);
    // Call a dedicated RPC that accepts the embedding array as a parameter to avoid SQL injection
    const { data, error } = await supabase.rpc('search_passages_by_embedding', {
      p_embedding: emb,
      p_limit: limit,
      p_offset: offset,
      p_document_id: document_id,
    });
    if (error) return res.status(500).json({ error });
    return res.json({ results: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
