const supabase = require('../../lib/supabaseClient');
const { createEmbedding, generateText } = require('../../lib/openai');
const { cosine, coerce } = require('../../lib/vector');

const DEFAULT_TOP_N = 8;
const BATCH_SIZE = 100;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const topN = parseInt(req.body && req.body.top_n, 10) || DEFAULT_TOP_N;
  const document_id = req.body && req.body.document_id ? req.body.document_id : null;
  const reset = !!req.body?.reset;

  try {
    // fetch overviews (optionally for a document)
    let overviews = [];
    if (document_id) {
      const { data, error } = await supabase.from('overview').select('overview_id, document_id, summary').eq('document_id', document_id);
      if (error) return res.status(500).json({ error });
      overviews = data || [];
    } else {
      // full set in batches
      let offset = 0;
      while (true) {
        const { data, error } = await supabase.from('overview').select('overview_id, document_id, summary').range(offset, offset + BATCH_SIZE - 1);
        if (error) return res.status(500).json({ error });
        if (!data || data.length === 0) break;
        overviews.push(...data);
        offset += BATCH_SIZE;
      }
    }

    if (!overviews || overviews.length === 0) return res.json({ success: true, note: 'no overviews found' });

    // handle reset: delete overview_theme rows for this document or all
    if (reset) {
      if (document_id) {
        const { data: ovRows, error: ovErr } = await supabase.from('overview').select('overview_id').eq('document_id', document_id);
        if (ovErr) return res.status(500).json({ error: ovErr });
        const ids = (ovRows || []).map(r => r.overview_id);
        if (ids.length) {
          const { error: delErr } = await supabase.from('overview_theme').delete().in('overview_id', ids);
          if (delErr) return res.status(500).json({ error: delErr });
        }
      } else {
        const { error: delAllErr } = await supabase.from('overview_theme').delete().neq('overview_id', -1);
        if (delAllErr) return res.status(500).json({ error: delAllErr });
      }
    }

    let processed = 0;
    const errors = [];

    for (const ov of overviews) {
      try {
        // ensure overview embedding exists
        let { data: ovEmbData } = await supabase.from('embedding_overview').select('overview_id, embedding_vector').eq('overview_id', ov.overview_id).limit(1);
        let ovEmbedding = ovEmbData && ovEmbData[0] ? ovEmbData[0].embedding_vector : null;
        if (!ovEmbedding) {
          try {
            ovEmbedding = await createEmbedding(ov.summary || '');
            await supabase.from('embedding_overview').insert([{ overview_id: ov.overview_id, embedding_vector: ovEmbedding }]);
          } catch (e) {
            console.error('overview embedding failed', e.message);
            // skip this overview
            continue;
          }
        }

        // ask LLM for themes (comma-separated, short list)
        const themesText = await generateText(`Extract a list of ${Math.max(3, topN)} concise themes (comma-separated) from this summary: ${ov.summary}`);
        const themeNames = themesText.split(/[,\n]+/).map(s => s.trim()).filter(Boolean).slice(0, Math.max(3, topN));

        // for each theme, get description and ensure theme row and embedding
        const themeObjs = [];
        for (const name of themeNames) {
          const cleanName = name.slice(0, 200);
          // description
          let desc = await generateText(`Write a one-sentence description for the theme: ${cleanName}`);
          desc = desc && desc.length > 0 ? desc.slice(0, 500) : '';

          // upsert theme by name
          const { data: existing } = await supabase.from('theme').select('*').eq('name', cleanName).limit(1);
          let theme_id;
          let themeEmbedding = null;
          if (existing && existing.length) {
            theme_id = existing[0].theme_id;
            themeEmbedding = existing[0].embedding_vector || null;
            // update description if missing
            if (!existing[0].description && desc) {
              await supabase.from('theme').update({ description: desc }).eq('theme_id', theme_id);
            }
          } else {
            const { data: t } = await supabase.from('theme').insert([{ name: cleanName, description: desc }]).select().single();
            theme_id = t.theme_id;
          }

          // ensure theme embedding exists
          if (!themeEmbedding) {
            try {
              themeEmbedding = await createEmbedding(`${cleanName} ${desc}`);
              await supabase.from('theme').update({ embedding_vector: themeEmbedding }).eq('theme_id', theme_id);
            } catch (e) {
              console.error('theme embedding failed', e.message);
            }
          }

          if (theme_id && themeEmbedding) themeObjs.push({ theme_id, embedding: themeEmbedding });
        }

        // compute similarities between overview and theme embeddings and keep topN
        const ovVec = coerce(ovEmbedding);
        if (!ovVec || !ovVec.length) continue;
        const scored = [];
        for (const t of themeObjs) {
          const tVec = coerce(t.embedding);
          if (!tVec || tVec.length !== ovVec.length) continue;
          let score = cosine(ovVec, tVec);
          if (!Number.isFinite(score)) score = 0;
          scored.push({ theme_id: t.theme_id, score });
        }
        if (!scored.length) continue;
        scored.sort((a, b) => b.score - a.score);
        const keep = scored.slice(0, topN).map(s => ({ overview_id: ov.overview_id, theme_id: s.theme_id, score: s.score }));

        // upsert overview_theme in chunks
        for (let i = 0; i < keep.length; i += 500) {
          const slice = keep.slice(i, i + 500);
          const { error } = await supabase.from('overview_theme').upsert(slice);
          if (error) console.error('overview_theme upsert error', error);
        }

        processed++;
      } catch (e) {
        console.error('processing overview failed', e.message);
        errors.push({ overview_id: ov.overview_id, error: e.message });
      }
    }

    return res.json({ success: true, processed, errors });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
