const supabase = require('../../lib/supabaseClient');
const { cosine } = require('../../lib/vector');

// Batch size for passage processing
const BATCH_SIZE = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const document_id = req.body && req.body.document_id ? req.body.document_id : null;

  try {
    // fetch all themes with embeddings
    const { data: themes, error: tErr } = await supabase.from('theme').select('theme_id, embedding_vector').not('embedding_vector', 'is', null);
    if (tErr) return res.status(500).json({ error: tErr });

    // diagnostics
    let themesCount = (themes || []).length;
    let upsertedCount = 0;
    const upsertErrors = [];

    if (document_id) {
      // process passages belonging to the document only
      // get passage ids for the document
      const { data: passageRows, error: prErr } = await supabase.from('passage').select('passage_id').eq('document_id', document_id);
      if (prErr) return res.status(500).json({ error: prErr });
      const passageIds = (passageRows || []).map(r => r.passage_id);
      if (passageIds.length === 0) return res.json({ success: true, note: 'no passages for document' });

      // fetch embeddings for these passages
      const { data: passages, error: pErr } = await supabase.from('embedding_passage').select('passage_id, embedding_vector').in('passage_id', passageIds);
      if (pErr) return res.status(500).json({ error: pErr });

      const upserts = [];
      for (const p of passages) {
        for (const th of themes) {
          const score = cosine(p.embedding_vector, th.embedding_vector);
          upserts.push({ passage_id: p.passage_id, theme_id: th.theme_id, score });
        }
      }
      for (let i = 0; i < upserts.length; i += 500) {
        const slice = upserts.slice(i, i + 500);
        const { error: uErr } = await supabase.from('passage_theme').upsert(slice);
        if (uErr) {
          console.error('upsert error', uErr);
          upsertErrors.push(uErr);
        } else {
          upsertedCount += slice.length;
        }
      }

      return res.json({ success: true, processed: passageIds.length, themes: themesCount, upserted: upsertedCount, upsertErrors });
    }

    // Otherwise full dataset processing (existing behavior)
    let offset = 0;
    while (true) {
      const { data: passages, error: pErr } = await supabase.from('embedding_passage').select('passage_id, embedding_vector').range(offset, offset + BATCH_SIZE - 1);
      if (pErr) return res.status(500).json({ error: pErr });
      if (!passages || passages.length === 0) break;

      const upserts = [];
      for (const p of passages) {
        for (const th of themes) {
          const score = cosine(p.embedding_vector, th.embedding_vector);
          upserts.push({ passage_id: p.passage_id, theme_id: th.theme_id, score });
        }
      }

      // upsert in chunks (avoid huge single requests)
      for (let i = 0; i < upserts.length; i += 500) {
        const slice = upserts.slice(i, i + 500);
        const { error: uErr } = await supabase.from('passage_theme').upsert(slice);
        if (uErr) {
          console.error('upsert error', uErr);
          upsertErrors.push(uErr);
        } else {
          upsertedCount += slice.length;
        }
      }

      offset += BATCH_SIZE;
    }

    return res.json({ success: true, themes: themesCount, upserted: upsertedCount, upsertErrors });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
