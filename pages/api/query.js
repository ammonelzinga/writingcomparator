const supabase = require('../../lib/supabaseClient');
const { generateText, generateTextWithOptions, createEmbedding } = require('../../lib/openai');

function sanitizeSql(sql) {
  // Allow an optional sequence of safe SET statements at the start (e.g. `SET ivfflat.probes = 10;`) followed by a single SELECT.
  // Disallow any write/DDL statements anywhere and disallow additional statements after the SELECT.
  if (!sql || typeof sql !== 'string') throw new Error('Invalid SQL');
  const trimmed = sql.trim();

  // Strip any leading SET ...; statements (one or more)
  const leadingSetRegex = /^(?:\s*SET\s+[^;]+;\s*)+/i;
  let rest = trimmed;
  if (leadingSetRegex.test(rest)) {
    rest = rest.replace(leadingSetRegex, '').trim();
  }

  const lowerRest = rest.toLowerCase();
  if (!(lowerRest.startsWith('select') || lowerRest.startsWith('with'))) {
    throw new Error('Only a single SELECT query or a WITH (CTE) + SELECT (optionally preceded by SET statements) is allowed');
  }

  // Allow semicolons/multiple statements (we'll try to execute and return rows when possible)

  // Disallow dangerous keywords anywhere in the SQL (case-insensitive)
  const forbidden = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'vacuum', 'copy', 'merge'];
  const loweredRest = rest.toLowerCase();
  for (const kw of forbidden) {
    const pattern = new RegExp('\\b' + kw + '\\b', 'i');
    if (pattern.test(loweredRest)) throw new Error('Query contains disallowed statements');
  }

  return sql;
}

function rewriteEstimatedDateComparisons(sql) {
  // match estimated_date, optionally followed by ::int/::integer, then an operator and a 3-4 digit literal
  return sql.replace(/\bestimated_date\b(?:\s*::\s*(?:int|integer|bigint))?\s*([<>]=?|=)\s*('?)(\d{3,4})\2/gi, (match, op, _q, num) => {
    // Use NULLIF to avoid casting empty strings, then ::int. Comparison with NULL yields NULL (false).
    const safeCast = "(NULLIF(regexp_replace(estimated_date, '[^0-9]', '', 'g'), '')::int)";
    return `( ${safeCast} ${op} ${num} )`;
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'question required' });

  // Pre-compute embedding for the user's natural language question so the LLM can reference :query_embedding symbolically
  let queryEmbedding = null;
  try {
    queryEmbedding = await createEmbedding(question);
  } catch (e) {
    console.error('question embedding failed', e.message);
  }
  const requestedLimit = req.body && req.body.limit ? parseInt(req.body.limit, 10) : null;

  // Ask OpenAI to generate SQL against known tables
  // NOTE: estimated_date is stored as text in this database. If you need to compare numerically,
  // cast it first (for example using regexp_replace to strip non-digits then ::int).
  // The database also contains embedding columns for semantic similarity search:
  // - embedding_passage.embedding_vector (vector(1536))
  // - embedding_overview.embedding_vector (vector(1536))
  // - theme.embedding_vector (vector(1536))
  // You can use these columns for semantic similarity queries, e.g., using cosine similarity or calling the RPC function search_passages_by_embedding(embedding, limit, offset, document_id).
  // For theme-based queries, use the theme and passage_theme tables and their embedding vectors.
  // When comparing estimated_date numerically, cast it appropriately.
  // Write a single SELECT SQL statement (or call the search_passages_by_embedding RPC) that answers: ${question}. Only return the SQL statement.
 const prompt = `
You are a Postgres + AI embedding expert. 
You generate SQL queries for a database that stores ancient texts, metadata, and embeddings.

The schema is summarized as follows:

- **document(document_id, title, author, tradition, rhetoric_type, language, estimated_date, notes)**
- **overview(overview_id, document_id, label, summary)**
- **passage(passage_id, document_id, overview_id, label, content)**
- **embedding_overview(overview_id, embedding_vector vector(1536))**
- **embedding_passage(passage_id, embedding_vector vector(1536))**
- **theme(theme_id, name, description, embedding_vector vector(1536))**
- **passage_theme(passage_id, theme_id, score)**
- **overview_theme(overview_id, theme_id, score)**

Indexes:
- \`CREATE INDEX embedding_passage_idx ON embedding_passage USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);\`
- \`CREATE INDEX embedding_overview_idx ON embedding_overview USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);\`
- \`CREATE INDEX theme_embedding_idx ON theme USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 50);\`

Vector indexes allow semantic similarity searches using:
\`embedding_vector <=> :query_embedding\`
where smaller values mean closer semantic similarity.
Always use this operator for conceptual or theme-based questions.

---

### **Preferred Query Strategy**
1. Use **vector similarity** for all conceptual or thematic searches (e.g., "love", "creation", "atonement", "prophecy").
2. Use **metadata joins** only when the question clearly refers to a document, author, or tradition (e.g., “in Jewish texts”, “in Genesis”, “according to Paul”).
3. Use **theme joins** when the question mentions topics (e.g., “faith”, “repentance”) that may map to existing themes.
4. Use **grouping or aggregation** when the question implies comparison between sources (e.g., “compare”, “difference”, “across traditions”, “in the Bible vs D&C”).
5. Never use \`ILIKE\` for searching content — only for filtering metadata like titles, traditions, or authors.
6. Always return **only SQL code**, no explanations.

---

### **Query Patterns**

**Example 1 – Simple semantic passage search**
\`\`\`sql
SELECT p.passage_id, p.content, d.title, d.tradition,
       1 - (ep.embedding_vector <=> :query_embedding) AS similarity
FROM embedding_passage ep
JOIN passage p ON p.passage_id = ep.passage_id
JOIN document d ON d.document_id = p.document_id
ORDER BY ep.embedding_vector <=> :query_embedding
LIMIT 200;
\`\`\`

**Example 2 – Filter by theme name**
\`\`\`sql
SELECT p.passage_id, p.content, d.title, t.name AS theme_name,
       1 - (ep.embedding_vector <=> :query_embedding) AS similarity
FROM embedding_passage ep
JOIN passage p ON p.passage_id = ep.passage_id
JOIN passage_theme pt ON pt.passage_id = p.passage_id
JOIN theme t ON t.theme_id = pt.theme_id
WHERE t.name ILIKE '%forgiveness%'
ORDER BY ep.embedding_vector <=> :query_embedding
LIMIT 200;
\`\`\`

**Example 3 – Grouped by tradition or document (for comparative questions)**
\`\`\`sql
SELECT d.tradition, d.title,
       COUNT(*) AS passage_count,
       AVG(1 - (ep.embedding_vector <=> :query_embedding)) AS avg_similarity
FROM embedding_passage ep
JOIN passage p ON p.passage_id = ep.passage_id
JOIN document d ON d.document_id = p.document_id
GROUP BY d.tradition, d.title
ORDER BY avg_similarity DESC;
\`\`\`

---

### **Instruction**

You will be given a natural-language question and an already-computed embedding for that question, referenced symbolically as :query_embedding (do NOT try to generate it yourself). Example question:
> "What passages talk about turning the hearts of the children to their fathers?" or
> "Compare how different traditions describe the creation of the world."

Generate a valid, efficient **Postgres SQL statement** that answers the question.

Rules:
- Prefer semantic vector searches using the indexed embeddings.
- ALWAYS reference the embedding as :query_embedding (exact token) when doing similarity operations; do not inline numbers.
- Include joins to document metadata when comparison or attribution is needed.
- Use \`GROUP BY d.tradition\`, \`GROUP BY d.title\`, or similar when the question implies a comparison.
- Return **only valid SQL** with no explanation or commentary.

**Question:**
${question}
`;




  let sql;
  let finalSql = null;
  try {
    sql = await generateText(prompt, 4000);
    if (!sql || typeof sql !== 'string') throw new Error('LLM returned no SQL');
    // strip markdown code fences (```sql ... ```)
    finalSql = sql.replace(/```[\s\S]*?```/g, (m) => m.replace(/(^```\w*|```$)/g, '')).trim();
    // remove surrounding single backticks if present
    finalSql = finalSql.replace(/^`+|`+$/g, '').trim();
    // remove trailing semicolon for safety
    finalSql = finalSql.replace(/;\s*$/, '').trim();
  // Validate SQL using the sanitizer (allows leading SET statements) before execution
  finalSql = sanitizeSql(finalSql);
  } catch (e) {
    console.error('SQL generation/sanitization failed', e.message, { sql });
    return res.status(400).json({ error: 'SQL generation or sanitization failed', message: e.message, sql: finalSql || sql || null });
  }

  // Attempt automatic rewrite for estimated_date comparisons
  const originalSql = finalSql;
  try {
    const rewritten = rewriteEstimatedDateComparisons(finalSql);
    if (rewritten && rewritten !== finalSql) {
      finalSql = rewritten;
      req.rewrite_applied = true;
      req.original_sql = originalSql;
    }
  } catch (e) {
    // ignore rewrite errors
  }

  try {
    // If there are leading SET statements, convert them into a single-statement CTE
    // using set_config so the execute_sql RPC (which forbids semicolons) can run the query.
    let transformedSql = finalSql;
    try {
      const sets = [];
      let tmp = transformedSql;
      // consume leading SET statements
      while (/^\s*SET\b/i.test(tmp)) {
        const idx = tmp.indexOf(';');
        if (idx === -1) break;
        const stmt = tmp.slice(0, idx + 1);
        tmp = tmp.slice(idx + 1);
        // extract name and value
        const body = stmt.replace(/^\s*SET\s+/i, '').replace(/;\s*$/, '').trim();
        const eq = body.indexOf('=');
        if (eq === -1) continue; // skip malformed
        let name = body.slice(0, eq).trim();
        let val = body.slice(eq + 1).trim();
        // remove optional surrounding quotes from value
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        // escape single quotes
        val = val.replace(/'/g, "''");
        name = name.replace(/'/g, "''");
        sets.push({ name, val });
      }
      if (sets.length > 0) {
        // tmp now holds the remainder after leading SETs
        const remainder = tmp.trim();
        if (!/^select\b/i.test(remainder)) {
          throw new Error('Only a SELECT is allowed after SET statements');
        }
        // Build a SELECT wrapper that executes set_config(...) in a subselect and cross-joins with the real SELECT.
        // This ensures the final statement begins with SELECT (which execute_sql requires) and avoids semicolons.
        const cfgList = sets.map((s, i) => `set_config('${s.name}', '${s.val}', true) as __set${i}`).join(', ');
        transformedSql = `SELECT t.* FROM (SELECT ${cfgList}) __cfg, (${remainder}) t`;
      }
    } catch (e) {
      // if transformation fails, fall back to original SQL
      transformedSql = finalSql;
    }

    // If LLM references :query_embedding, attempt to call the dedicated RPC instead of executing raw SQL.
    let data, error;
    const usesSymbolicEmbedding = /:query_embedding\b/.test(transformedSql);
    if (usesSymbolicEmbedding && Array.isArray(queryEmbedding)) {
      // Detect simple patterns: direct SELECT with similarity ordering or presence of FROM embedding_passage.
      // We'll prefer the hybrid RPC for simplicity unless the SQL contains complex aggregations.
      const canRpc = /from\s+embedding_passage/i.test(transformedSql) || /passage\s+p/i.test(transformedSql);
      if (canRpc) {
        // Improved extraction of theme, document filters and limit override from the generated SQL.
        // We'll parse WHERE clause patterns such as:
        // - t.name ILIKE '%foo%'
        // - t.name = 'foo'
        // - d.title ILIKE '%bar%'
        // - d.author ILIKE '%bar%'
        // - p.document_id = 123
        // Also detect LIMIT N to use as match_limit when present.
        let themeFilter = null;
        let documentFilter = null;
        let overrideLimit = null;
        try {
          const whereMatch = transformedSql.match(/\bwhere\b([\s\S]*?)(?:\border\s+by\b|\blimit\b|$)/i);
          const whereSql = whereMatch ? whereMatch[1] : '';

          // theme name ilike or equality (supports table alias t or theme)
          const themeIlike = whereSql.match(/(?:\b(?:t|theme)\b\.)?name\s*ilike\s*'\s*%?([^%']+)%?\s*'/i);
          const themeEq = whereSql.match(/(?:\b(?:t|theme)\b\.)?name\s*=\s*'([^']+)'/i);
          if (themeIlike) themeFilter = themeIlike[1].trim();
          else if (themeEq) themeFilter = themeEq[1].trim();

          // document title/author ilike
          const docIlike = whereSql.match(/(?:\b(?:d|document)\b\.)?(?:title|author)\s*ilike\s*'\s*%?([^%']+)%?\s*'/i);
          if (docIlike) documentFilter = docIlike[1].trim();

          // document id equality
          const docId = whereSql.match(/(?:\b(?:p|d|document)\b\.)?document_id\s*=\s*(\d+)/i);
          if (docId) documentFilter = docId[1];

          // override LIMIT
          const limitMatch = transformedSql.match(/\blimit\s+(\d+)\b/i);
          if (limitMatch) overrideLimit = Math.max(1, Math.min(1000, parseInt(limitMatch[1], 10)));
        } catch (e) {
          // fall back silently
        }

        const matchLimit = overrideLimit || requestedLimit || 200;
        ({ data, error } = await supabase.rpc('search_passages_by_embedding', {
          query_embedding: queryEmbedding,
          match_limit: matchLimit,
          theme_filter: themeFilter,
          document_filter: documentFilter,
        }));
        // Provide trace info
        transformedSql = '-- executed via RPC search_passages_by_embedding; original generated SQL below\n' + finalSql;
      } else {
        // Fallback: inline the embedding array literal (vector extension expects cast to vector)
        const vectorLiteral = `'[${queryEmbedding.slice(0,1536).join(',')}]'::vector`;
        transformedSql = transformedSql.replace(/:query_embedding\b/g, vectorLiteral);
        ({ data, error } = await supabase.rpc('execute_sql', { p_sql: transformedSql }));
      }
    } else {
      // No symbolic embedding reference; just use execute_sql
      ({ data, error } = await supabase.rpc('execute_sql', { p_sql: transformedSql }));
    }
    // NOTE: If execute_sql rpc doesn't exist, fallback to running via supabase.from
    if (error) {
      // Try raw query via PostgREST - select from a function isn't available; return error
      const errMsg = error && error.message ? error.message : JSON.stringify(error);
      // Provide a helpful hint for a common issue: comparing numeric literal to a text column
      let hint = null;
      if ((errMsg.includes('operator does not exist') || errMsg.includes('invalid input syntax for')) && finalSql.toLowerCase().includes('estimated_date')) {
        hint = [
          'Note: the column estimated_date is stored as text in the database.',
          'Comparisons like estimated_date > 1700 may fail.',
          "Try casting to integer, for example: WHERE (regexp_replace(estimated_date, '[^0-9]', '', 'g')::int) > 1700",
          'or ask the assistant to cast the column to an integer before comparison.'
        ].join(' ');
      }
      return res.status(400).json({ error: 'Execution failed', details: error, sql: finalSql, hint });
    }
  // === Summarization Preparation (Robust Dedupe & Aggregation) ===
  const rawRows = Array.isArray(data) ? data : [];
  const raw_row_count = rawRows.length;
  // Map by passage_id if present, else by content hash (first 160 chars + length)
  const map = new Map();
  for (const row of rawRows) {
    if (!row || !row.content) continue;
    const key = row.passage_id ? `id:${row.passage_id}` : `c:${row.content.slice(0,160)}::${row.content.length}`;
    const existing = map.get(key);
    if (!existing) {
      const clone = { ...row };
      clone._themes = new Set();
      if (row.theme_name) clone._themes.add(row.theme_name);
      map.set(key, clone);
    } else {
      // keep max similarity
      if ((row.similarity || 0) > (existing.similarity || 0)) {
        existing.similarity = row.similarity;
        // optionally update other metadata if missing
        if (!existing.document_id && row.document_id) existing.document_id = row.document_id;
        if (!existing.title && row.title) existing.title = row.title;
      }
      if (row.theme_name) existing._themes.add(row.theme_name);
    }
  }
  // Build deduped list
  let deduped = Array.from(map.values());
  // finalize theme names array
  deduped = deduped.map(r => {
    if (r._themes) {
      r.theme_names = Array.from(r._themes).slice(0, 12);
      delete r._themes;
    }
    return r;
  });
  // sort by similarity desc and cap
  deduped.sort((a,b)=> (b.similarity||0) - (a.similarity||0));
  const MAX_PASSAGES_FOR_SUMMARY = 40;
  const usedForSummary = [];
  for (const r of deduped) {
    if (r.content && r.content.length > 800) r.content = r.content.slice(0,800) + '…';
    usedForSummary.push(r);
    if (usedForSummary.length >= MAX_PASSAGES_FOR_SUMMARY) break;
  }
  const deduped_row_count = deduped.length;
  const dropped_duplicates = raw_row_count - deduped_row_count;

  const summaryPrompt = `You are a biblical text analyst summarizing semantic search results.\n\nUser question:\n"${question}"\n\nYou are given up to ${MAX_PASSAGES_FOR_SUMMARY} representative, deduplicated passages (each may include aggregated theme_names) with similarity scores (0-1). Produce a concise, 2–4 sentence narrative synthesis that: (1) Emphasizes the most similar passages; (2) Notes cross-document or cross-tradition contrasts if present; (3) States the unifying doctrinal/principle insight. Do not list IDs or raw arrays, just synthesize.\n\nPassages JSON:\n${JSON.stringify(usedForSummary, null, 2)}`;

  let summary = null;
  let summary_warning = null;
  try {
    summary = await generateTextWithOptions(summaryPrompt, { maxTokens: 500, timeoutMs: 40000 });
  } catch (e) {
    summary_warning = e.message.includes('aborted') ? 'Summary generation timed out/aborted; partial results returned.' : e.message;
  }

  const resp = { sql: finalSql, executed_sql: transformedSql, data, summary, summary_warning, raw_row_count, deduped_row_count, dropped_duplicates };
    // diagnostics: include count and sample for easier frontend debugging
    try {
      resp.data_count = Array.isArray(data) ? data.length : (data ? 1 : 0);
      resp.data_sample = Array.isArray(data) ? data.slice(0, 5) : (data ? [data] : []);
    } catch (e) {
      resp.data_count = 0;
      resp.data_sample = [];
    }
    if (req.rewrite_applied) {
      resp.original_sql = req.original_sql;
      resp.rewritten = true;
    }
    return res.json(resp);
  } catch (e) {
    return res.status(500).json({ error: e.message, sql: finalSql });
  }
}
