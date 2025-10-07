const supabase = require('../../lib/supabaseClient');
const { cosine, coerce } = require('../../lib/vector');

const BATCH_SIZE = 200;
const DEFAULT_TOP_N = 8;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const document_id = req.body?.document_id || null;
  const topN = parseInt(req.body?.top_n, 10) || DEFAULT_TOP_N;
  const reset = !!req.body?.reset; // if true, delete existing rows first

  try {
    if (reset) {
      if (document_id) {
        // delete passage_theme rows for passages of this document
        const { data: passIds, error: pidErr } = await supabase.from('passage').select('passage_id').eq('document_id', document_id);
        if (pidErr) return res.status(500).json({ error: pidErr });
        const ids = (passIds || []).map(r => r.passage_id);
        if (ids.length) {
          // Supabase delete with in filter
          const { error: delErr } = await supabase.from('passage_theme').delete().in('passage_id', ids);
          if (delErr) return res.status(500).json({ error: delErr });
        }
      } else {
        const { error: delAllErr } = await supabase.from('passage_theme').delete().neq('passage_id', -1); // delete all
        if (delAllErr) return res.status(500).json({ error: delAllErr });
      }
    }

    const { data: themes, error: tErr } = await supabase.from('theme').select('theme_id, embedding_vector').not('embedding_vector', 'is', null);
    if (tErr) return res.status(500).json({ error: tErr });
    if (!themes?.length) return res.json({ success: true, note: 'no themes with embeddings' });

    let passageFilterIds = null;
    if (document_id) {
      const { data: passageRows, error: prErr } = await supabase.from('passage').select('passage_id').eq('document_id', document_id);
      if (prErr) return res.status(500).json({ error: prErr });
      passageFilterIds = (passageRows || []).map(r => r.passage_id);
      if (!passageFilterIds.length) return res.json({ success: true, note: 'no passages for document after reset' });
    }

    let upsertedCount = 0;
    const upsertErrors = [];

    async function processBatch(passages) {
      const batchUpserts = [];
      for (const p of passages) {
        if (!p?.embedding_vector) continue;
        const pVec = coerce(p.embedding_vector);
        if (!pVec.length) continue;
        const scores = [];
        for (const th of themes) {
          if (!th?.embedding_vector) continue;
            const tVec = coerce(th.embedding_vector);
            if (!tVec.length || tVec.length !== pVec.length) continue;
            let score = cosine(pVec, tVec);
            if (!Number.isFinite(score)) score = 0;
            scores.push({ theme_id: th.theme_id, score });
        }
        scores.sort((a,b)=> b.score - a.score);
        for (let i = 0; i < Math.min(topN, scores.length); i++) {
          batchUpserts.push({ passage_id: p.passage_id, theme_id: scores[i].theme_id, score: scores[i].score });
        }
      }
      for (let i = 0; i < batchUpserts.length; i += 500) {
        const slice = batchUpserts.slice(i, i + 500);
        for (const r of slice) if (!Number.isFinite(r.score)) r.score = 0;
        const { error } = await supabase.from('passage_theme').upsert(slice);
        if (error) upsertErrors.push(error); else upsertedCount += slice.length;
      }
    }

    if (passageFilterIds) {
      const { data: passages, error: pErr } = await supabase.from('embedding_passage').select('passage_id, embedding_vector').in('passage_id', passageFilterIds);
      if (pErr) return res.status(500).json({ error: pErr });
      await processBatch(passages || []);
      return res.json({ success: true, reset, document_id, processed: passages?.length || 0, themes: themes.length, upserted: upsertedCount, upsertErrors });
    }

    let offset = 0;
    while (true) {
      const { data: passages, error: pErr } = await supabase.from('embedding_passage').select('passage_id, embedding_vector').range(offset, offset + BATCH_SIZE - 1);
      if (pErr) return res.status(500).json({ error: pErr });
      if (!passages?.length) break;
      await processBatch(passages);
      offset += BATCH_SIZE;
    }

    return res.json({ success: true, reset, themes: themes.length, upserted: upsertedCount, upsertErrors });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
