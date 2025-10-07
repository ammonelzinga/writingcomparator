const supabase = require('../../lib/supabaseClient');
const { createEmbedding } = require('../../lib/openai');

// GET or POST { q, mode: 'text'|'vector', limit, offset, document_id }
export default async function handler(req, res) {
  const body = req.method === 'GET' ? req.query : req.body;
  const q = body.q || '';
  const mode = body.mode || 'text';
  const limit = Math.min(100, parseInt(body.limit || 10, 10));
  const offset = parseInt(body.offset || 0, 10); // unused with new RPC but retained for compatibility
  const document_id = body.document_id || null; // backward compatibility
  const theme_filter = body.theme || body.theme_filter || null;
  const document_filter = body.document || body.document_filter || null;

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
    // New hybrid RPC signature: (query_embedding, match_limit, theme_filter, document_filter)
    const { data, error } = await supabase.rpc('search_passages_by_embedding', {
      query_embedding: emb,
      match_limit: limit,
      theme_filter,
      document_filter: document_filter || (document_id ? String(document_id) : null),
    });
    if (error) return res.status(500).json({ error, mode: 'vector' });
    return res.json({ results: data, mode: 'vector' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
