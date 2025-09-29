const supabase = require('../../lib/supabaseClient');
const { createEmbedding, generateText } = require('../../lib/openai');

const { chunkTextToPassages } = require('../../lib/chunker');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { title, author, tradition, language, estimated_date, notes, text } = req.body;
  if (!title || !text) return res.status(400).json({ error: 'title and text required' });

  // Insert document
  const { data: doc, error: dErr } = await supabase.from('document').insert([{ title, author, tradition, language, estimated_date, notes }]).select().single();
  if (dErr) return res.status(500).json({ error: dErr });
  const document_id = doc.document_id;

  // For now create a single overview per paragraph group if labeled or split into 'chapter X' when pattern found
  const passages = chunkTextToPassages(text, 300);

  // Create a generic overview label per N passages (e.g., every 100 passages as a chapter)
  const overviews = [];
  const chunkSize = Math.max(1, Math.floor(passages.length / Math.min(10, Math.max(1, Math.ceil(passages.length / 10)))));
  for (let i = 0; i < passages.length; i += chunkSize) {
    const label = `Section ${Math.floor(i / chunkSize) + 1}`;
    const summary = await generateText(`Summarize this collection of passages into one short summary:\n\n${passages.slice(i, i + chunkSize).join('\n\n')}`);
    const { data: ov, error: ovErr } = await supabase.from('overview').insert([{ document_id, label, summary }]).select().single();
    if (ovErr) return res.status(500).json({ error: ovErr });
    overviews.push(ov);
  }

  // Insert passages and embeddings
  const newPassageIds = [];
  for (let i = 0; i < passages.length; i++) {
    const overview = overviews[Math.floor(i / Math.ceil(passages.length / overviews.length))];
    const label = `P${i + 1}`;
    const content = passages[i];
    const { data: p, error: pErr } = await supabase.from('passage').insert([{ document_id, overview_id: overview.overview_id, label, content }]).select().single();
    if (pErr) return res.status(500).json({ error: pErr });
    // embedding
    try {
      const vec = await createEmbedding(content);
      await supabase.from('embedding_passage').insert([{ passage_id: p.passage_id, embedding_vector: vec }]);
      newPassageIds.push(p.passage_id);
    } catch (e) {
      console.error('embed passage failed', e.message);
    }
  }

  // Create embeddings for overviews and extract themes
  for (const ov of overviews) {
    try {
      const vec = await createEmbedding(ov.summary);
      await supabase.from('embedding_overview').insert([{ overview_id: ov.overview_id, embedding_vector: vec }]);
      // Extract themes (ask OpenAI)
      const themesText = await generateText(`Extract a list of 8-12 themes or topics (comma-separated) from this summary: ${ov.summary}`);
      const themeNames = themesText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).slice(0, 12);
      for (const name of themeNames) {
        const desc = await generateText(`Write a one-sentence description for the theme: ${name}`);
        const { data: existing } = await supabase.from('theme').select('*').eq('name', name).limit(1);
        let theme_id;
        let themeEmbedding = null;
        if (existing && existing.length) {
          theme_id = existing[0].theme_id;
          themeEmbedding = existing[0].embedding_vector || null;
        } else {
          const { data: t } = await supabase.from('theme').insert([{ name, description: desc }]).select().single();
          theme_id = t.theme_id;
        }
        // ensure theme has an embedding_vector (compute from name + description)
        if (!themeEmbedding) {
          try {
            const ev = await createEmbedding(`${name} ${desc}`);
            await supabase.from('theme').update({ embedding_vector: ev }).eq('theme_id', theme_id);
            themeEmbedding = ev;
          } catch (e) {
            console.error('theme embedding failed', e.message);
          }
        }
        // link overview_theme (score unknown)
        await supabase.from('overview_theme').upsert([{ overview_id: ov.overview_id, theme_id, score: 1.0 }]);
      }
    } catch (e) {
      console.error('overview processing failed', e.message);
    }
  }

  // fire-and-forget compute passage-theme scores for the newly inserted passages
  (async () => {
    try {
      await computePassageThemeScores(newPassageIds);
    } catch (e) {
      console.error('background scoring failed', e.message);
    }
  })();

  return res.json({ success: true, document_id });
}

// After response, asynchronously compute passage-theme scores for new passages
async function computePassageThemeScores(passageIds) {
  try {
    if (!passageIds || passageIds.length === 0) return;
    const { data: themes } = await supabase.from('theme').select('theme_id, embedding_vector').not('embedding_vector', 'is', null);
    if (!themes || themes.length === 0) return;

    const { data: passages } = await supabase.from('embedding_passage').select('passage_id, embedding_vector').in('passage_id', passageIds);
    if (!passages || passages.length === 0) return;

    const { cosine } = require('../../lib/vector');
    const upserts = [];
    for (const p of passages) {
      if (!p || !p.embedding_vector) continue;
      for (const t of themes) {
        if (!t || !t.embedding_vector) continue;
        let score = cosine(p.embedding_vector, t.embedding_vector);
        if (!Number.isFinite(score)) score = 0;
        upserts.push({ passage_id: p.passage_id, theme_id: t.theme_id, score });
      }
    }

    for (let i = 0; i < upserts.length; i += 500) {
      const slice = upserts.slice(i, i + 500);
      // ensure no null scores in slice
      for (const row of slice) if (!Number.isFinite(row.score)) row.score = 0;
      const { error } = await supabase.from('passage_theme').upsert(slice);
      if (error) console.error('passage_theme upsert error', error);
    }
  } catch (e) {
    console.error('computePassageThemeScores failed', e.message);
  }
}

