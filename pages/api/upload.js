const supabase = require('../../lib/supabaseClient');
const { createEmbedding, createEmbeddingsBatch, generateText } = require('../../lib/openai');
const { coerce, cosine } = require('../../lib/vector');

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

  // Diagnostics / progress tracking
  const overviewErrors = [];
  const overviewEmbeddingFailures = [];
  const themeEmbeddingFailures = [];
  const passageEmbeddingFailures = [];
  const themeCreationErrors = [];

  // === Stage 1: Determine overview chunk boundaries ===
  const overviews = [];
  const requestedOverviewChunks = Math.min(10, Math.max(1, Math.ceil(passages.length / 10)));
  const chunkSize = Math.max(1, Math.floor(passages.length / requestedOverviewChunks));
  const overviewChunks = [];
  for (let i = 0; i < passages.length; i += chunkSize) {
    overviewChunks.push({
      label: `Section ${Math.floor(i / chunkSize) + 1}`,
      passages: passages.slice(i, i + chunkSize)
    });
  }

  // === Stage 2: Generate all summaries (limited concurrency via generateText limiter) ===
  let summariesGenerated = 0;
  for (const oc of overviewChunks) {
    try {
      oc.summary = await generateText(`Summarize this collection of passages into one short summary:\n\n${oc.passages.join('\n\n')}`);
      summariesGenerated++;
    } catch (e) {
      overviewErrors.push({ label: oc.label, stage: 'summary', error: e.message });
    }
  }

  // === Stage 3: Insert overviews with successful summaries ===
  for (const oc of overviewChunks) {
    if (!oc.summary) continue;
    const { data: ov, error: ovErr } = await supabase.from('overview').insert([{ document_id, label: oc.label, summary: oc.summary }]).select().single();
    if (ovErr) {
      overviewErrors.push({ label: oc.label, stage: 'insert', error: ovErr.message || ovErr });
      continue;
    }
    overviews.push(ov);
  }

  // Fallback: if no overviews were created, create a single catch-all overview
  if (overviews.length === 0) {
    const fallbackSummary = passages.slice(0, 5).join('\n').slice(0, 800);
    const { data: ov, error: ovErr } = await supabase.from('overview').insert([{ document_id, label: 'Section 1', summary: fallbackSummary }]).select().single();
    if (!ovErr && ov) overviews.push(ov); else overviewErrors.push({ label: 'Section 1', stage: 'fallback', error: ovErr?.message || 'failed to create fallback overview' });
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
      passageEmbeddingFailures.push({ passage_id: p.passage_id, error: e.message });
    }
  }

  // === Stage 4: Embed all overview summaries in batch ===
  let overviewEmbeddingsCreated = 0;
  let overviewEmbeddings = [];
  try {
    const summaries = overviews.map(o => o.summary);
    overviewEmbeddings = await createEmbeddingsBatch(summaries);
  } catch (e) {
    // fallback: attempt individually if batch failed
    for (const ov of overviews) {
      try { overviewEmbeddings.push(await createEmbedding(ov.summary)); } catch (ee) { overviewEmbeddingFailures.push({ overview_id: ov.overview_id, error: ee.message }); overviewEmbeddings.push(null); }
    }
  }
  // insert embedding rows
  for (let i = 0; i < overviews.length; i++) {
    const emb = overviewEmbeddings[i];
    if (!emb) continue;
    try {
      await supabase.from('embedding_overview').insert([{ overview_id: overviews[i].overview_id, embedding_vector: emb }]);
      overviewEmbeddingsCreated++;
    } catch (e) {
      // ignore duplicates
    }
  }

  // === Stage 5: Extract theme name lists for each overview ===
  const themeNameLists = [];
  for (const ov of overviews) {
    try {
      const themesText = await generateText(`Extract a list of 8-12 themes or topics (comma-separated) from this summary: ${ov.summary}`);
      const names = themesText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).slice(0, 12);
      themeNameLists.push({ overview_id: ov.overview_id, names });
    } catch (e) {
      themeNameLists.push({ overview_id: ov.overview_id, names: [] });
    }
  }

  // === Stage 6: Consolidate unique theme names ===
  const uniqueThemeSet = new Set();
  for (const tl of themeNameLists) for (const n of tl.names) uniqueThemeSet.add(n);
  const uniqueThemes = Array.from(uniqueThemeSet).slice(0, 500); // safety cap

  // === Stage 7: Fetch existing themes and identify new ones ===
  const existingMap = new Map();
  if (uniqueThemes.length) {
    // fetch in chunks of 200
    for (let i = 0; i < uniqueThemes.length; i += 200) {
      const slice = uniqueThemes.slice(i, i + 200);
      const { data } = await supabase.from('theme').select('theme_id,name,description,embedding_vector').in('name', slice);
      for (const row of (data||[])) existingMap.set(row.name, row);
    }
  }
  const newThemeNames = uniqueThemes.filter(n => !existingMap.has(n));

  // === Stage 8: Generate descriptions for new themes ===
  let themeDescriptionsGenerated = 0;
  const newThemesWithDesc = [];
  for (const name of newThemeNames) {
    try {
      const desc = await generateText(`Write a one-sentence description for the theme: ${name}`);
      newThemesWithDesc.push({ name, description: (desc||'').slice(0,500) });
      themeDescriptionsGenerated++;
    } catch (e) {
      themeCreationErrors.push({ name, error: e.message });
    }
  }

  // === Stage 9: Insert new themes ===
  for (let i = 0; i < newThemesWithDesc.length; i += 200) {
    const slice = newThemesWithDesc.slice(i, i + 200);
    const { data: inserted, error: insErr } = await supabase.from('theme').insert(slice).select();
    if (insErr) {
      themeCreationErrors.push({ batch: true, error: insErr.message || insErr });
      continue;
    }
    if (Array.isArray(inserted)) {
      for (const row of inserted) existingMap.set(row.name, row);
    }
  }

  // === Stage 10: Ensure embeddings for all themes (existing + new) ===
  const themeRows = Array.from(existingMap.values());
  const themeNeedingEmb = themeRows.filter(r => !r.embedding_vector);
  let themeEmbeddingsCreated = 0;
  if (themeNeedingEmb.length) {
    // batch embed name+description
    const inputs = themeNeedingEmb.map(r => `${r.name} ${r.description || ''}`);
    let embeddings = [];
    try { embeddings = await createEmbeddingsBatch(inputs); } catch (e) {
      // fallback individually
      for (const inp of inputs) {
        try { embeddings.push(await createEmbedding(inp)); } catch (ee) { embeddings.push(null); themeEmbeddingFailures.push({ name: inp.split(' ')[0], error: ee.message }); }
      }
    }
    for (let i = 0; i < themeNeedingEmb.length; i++) {
      const emb = embeddings[i];
      if (!emb) continue;
      try {
        await supabase.from('theme').update({ embedding_vector: emb }).eq('theme_id', themeNeedingEmb[i].theme_id || existingMap.get(themeNeedingEmb[i].name)?.theme_id);
        themeEmbeddingsCreated++;
        // update local row cache
        themeNeedingEmb[i].embedding_vector = emb;
      } catch (e) {
        themeEmbeddingFailures.push({ name: themeNeedingEmb[i].name, error: e.message });
      }
    }
  }

  // === Stage 11: Load final theme embeddings map ===
  const finalThemes = [];
  for (const r of themeRows) if (r.embedding_vector) finalThemes.push(r);

  // === Stage 12: Compute overview_theme similarities (top N per overview) ===
  const overviewThemeLinks = [];
  const topNOverview = 8;
  for (let i = 0; i < overviews.length; i++) {
    const ov = overviews[i];
    const ovEmb = overviewEmbeddings[i];
    if (!ovEmb) continue;
    const ovVec = coerce(ovEmb);
    if (!ovVec || !ovVec.length) continue;
    const scores = [];
    for (const th of finalThemes) {
      const tVec = coerce(th.embedding_vector);
      if (!tVec || tVec.length !== ovVec.length) continue;
      let score = cosine(ovVec, tVec);
      if (!Number.isFinite(score)) score = 0;
      scores.push({ theme_id: th.theme_id, score });
    }
    scores.sort((a,b)=> b.score - a.score);
    const keep = scores.slice(0, topNOverview);
    for (const k of keep) overviewThemeLinks.push({ overview_id: ov.overview_id, theme_id: k.theme_id, score: k.score });
  }
  for (let i = 0; i < overviewThemeLinks.length; i += 500) {
    const slice = overviewThemeLinks.slice(i, i + 500);
    for (const row of slice) if (!Number.isFinite(row.score)) row.score = 0;
    try { await supabase.from('overview_theme').upsert(slice); } catch (e) { /* ignore */ }
  }

  // fire-and-forget compute passage-theme scores for the newly inserted passages
  (async () => {
    try {
      // keep top 8 themes per passage by default
      await computePassageThemeScores(newPassageIds, 8);
    } catch (e) {
      console.error('background scoring failed', e.message);
    }
  })();

  return res.json({
    success: true,
    document_id,
    passages_inserted: newPassageIds.length,
    overviews_inserted: overviews.length,
    summaries_generated: summariesGenerated,
    overview_embeddings_created: overviewEmbeddingsCreated,
    unique_themes_extracted: uniqueThemes.length,
    theme_descriptions_generated: themeDescriptionsGenerated,
    theme_embeddings_created: themeEmbeddingsCreated,
    overview_theme_links: overviewThemeLinks.length,
    overview_errors: overviewErrors,
    overview_embedding_failures: overviewEmbeddingFailures,
    passage_embedding_failures: passageEmbeddingFailures,
    theme_embedding_failures: themeEmbeddingFailures,
    theme_creation_errors: themeCreationErrors,
    message: 'Background passage theme scoring started'
  });
}

// After response, asynchronously compute passage-theme scores for new passages
async function computePassageThemeScores(passageIds, topN = 8) {
  try {
    if (!passageIds || passageIds.length === 0) return;
    const { data: themes } = await supabase.from('theme').select('theme_id, embedding_vector').not('embedding_vector', 'is', null);
    if (!themes || themes.length === 0) return;

    const { data: passages } = await supabase.from('embedding_passage').select('passage_id, embedding_vector').in('passage_id', passageIds);
    if (!passages || passages.length === 0) return;

    const { cosine, coerce } = require('../../lib/vector');

    // Pre-coerce theme vectors once for speed
    const themeVecs = themes.map(t => ({ theme_id: t.theme_id, vec: coerce(t.embedding_vector) })).filter(t => t.vec && t.vec.length);
    if (!themeVecs.length) return;

    const upserts = [];
    for (const p of passages) {
      if (!p || !p.embedding_vector) continue;
      const pVec = coerce(p.embedding_vector);
      if (!pVec || !pVec.length) continue;

      // compute scores to all themes but keep only topN
      const scores = [];
      for (const t of themeVecs) {
        if (t.vec.length !== pVec.length) continue;
        let score = cosine(pVec, t.vec);
        if (!Number.isFinite(score)) score = 0;
        scores.push({ theme_id: t.theme_id, score });
      }
      if (!scores.length) continue;
      scores.sort((a, b) => b.score - a.score);
      const take = Math.min(topN, scores.length);
      for (let i = 0; i < take; i++) {
        upserts.push({ passage_id: p.passage_id, theme_id: scores[i].theme_id, score: scores[i].score });
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

