const supabase = require('../../lib/supabaseClient');
const { createEmbedding } = require('../../lib/openai');

// POST { document_id? }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { document_id } = req.body || {};

  try {
    const results = { passages: 0, overviews: 0, themes: 0 };
    const debug = [];

    // 1) Passages without embedding (left join)
    const pSql = document_id
      ? `select p.passage_id, p.content from passage p left join embedding_passage e on p.passage_id = e.passage_id where e.passage_id is null and p.document_id = ${document_id} limit 1000`
      : `select p.passage_id, p.content from passage p left join embedding_passage e on p.passage_id = e.passage_id where e.passage_id is null limit 1000`;
    const { data: passages, error: pErr } = await supabase.rpc('execute_sql', { p_sql: pSql });
    if (pErr) console.error('passage lookup error', pErr);
    if (passages && passages.length) {
      for (let i = 0; i < passages.length; i += 20) {
        const batch = passages.slice(i, i + 20);
        const inserts = [];
        for (const p of batch) {
          try {
            const vec = await createEmbedding(p.content);
            inserts.push({ passage_id: p.passage_id, embedding_vector: vec });
          } catch (e) {
            console.error('embed passage failed', e.message);
          }
        }
        if (inserts.length) {
          const resp = await supabase.from('embedding_passage').insert(inserts).select();
          // resp is { data, error } when using supabase-js v2; capture for debug
          debug.push({ type: 'embedding_passage', batch: inserts.length, resp });
          if (resp.error) console.error('insert embedding_passage error', resp.error);
          results.passages += inserts.length;
        }
      }
    }

    // 2) Overviews without embedding
    const oSql = document_id
      ? `select o.overview_id, o.summary from overview o left join embedding_overview e on o.overview_id = e.overview_id where e.overview_id is null and o.document_id = ${document_id} limit 500`
      : `select o.overview_id, o.summary from overview o left join embedding_overview e on o.overview_id = e.overview_id where e.overview_id is null limit 500`;
    const { data: overviews, error: oErr } = await supabase.rpc('execute_sql', { p_sql: oSql });
    if (oErr) console.error('overview lookup error', oErr);
    if (overviews && overviews.length) {
      for (let i = 0; i < overviews.length; i += 20) {
        const batch = overviews.slice(i, i + 20);
        const inserts = [];
        for (const o of batch) {
          try {
            const vec = await createEmbedding(o.summary);
            inserts.push({ overview_id: o.overview_id, embedding_vector: vec });
          } catch (e) {
            console.error('embed overview failed', e.message);
          }
        }
        if (inserts.length) {
          const resp = await supabase.from('embedding_overview').insert(inserts).select();
          debug.push({ type: 'embedding_overview', batch: inserts.length, resp });
          if (resp.error) console.error('insert embedding_overview error', resp.error);
          results.overviews += inserts.length;
        }
      }
    }

    // 3) Themes without embedding_vector
    const { data: themes, error: tErr } = await supabase.from('theme').select('theme_id, name, description').is('embedding_vector', null);
    if (tErr) console.error('theme lookup error', tErr);
    if (themes && themes.length) {
      for (let i = 0; i < themes.length; i += 20) {
        const batch = themes.slice(i, i + 20);
        for (const t of batch) {
          try {
            const vec = await createEmbedding(`${t.name} ${t.description || ''}`);
            const resp = await supabase.from('theme').update({ embedding_vector: vec }).eq('theme_id', t.theme_id).select();
            debug.push({ type: 'theme_update', theme_id: t.theme_id, resp });
            if (resp.error) console.error('update theme embedding error', resp.error);
            else results.themes += 1;
          } catch (e) {
            console.error('embed theme failed', e.message);
          }
        }
      }
    }

    return res.json({ success: true, results, debug: debug.slice(0, 10) });
  } catch (e) {
    console.error('recompute-embeddings failed', e.message);
    return res.status(500).json({ error: e.message });
  }
}
