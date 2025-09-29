const supabase = require('../../lib/supabaseClient');
const { generateText } = require('../../lib/openai');

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
  const prompt = `You are given a Postgres database set up like this: 

        CREATE EXTENSION IF NOT EXISTS vector;

create table if not exists document (
    document_id serial primary key,
    title text not null,
    author text,
    tradition text,
    rhetoric_type text,
    language text,
    estimated_date text,
    notes text
);

create table if not exists overview (
    overview_id serial primary key,
    document_id int references document(document_id) on delete cascade,
    label text not null,
    summary text not null,
    unique(document_id, label)
);

create table if not exists passage (
    passage_id serial primary key,
    document_id int references document(document_id) on delete cascade,
    overview_id int references overview(overview_id) on delete cascade,
    label text not null,
    content text not null,
    unique(document_id, label)
);

create table if not exists embedding_overview (
    overview_id int primary key references overview(overview_id) on delete cascade,
    embedding_vector vector(1536) not null
);

create index if not exists embedding_overview_idx on embedding_overview using ivfflat (embedding_vector vector_cosine_ops) with (lists = 100);

create table if not exists embedding_passage (
    passage_id int primary key references passage(passage_id) on delete cascade,
    embedding_vector vector(1536) not null
);

create index if not exists embedding_passage_idx on embedding_passage using ivfflat (embedding_vector vector_cosine_ops) with (lists = 100);

create table if not exists theme (
    theme_id serial primary key,
    name text not null unique,
    description text,
    embedding_vector vector(1536)
);

create index if not exists theme_embedding_idx on theme using ivfflat (embedding_vector vector_cosine_ops) with (lists = 50);

create table if not exists passage_theme (
    passage_id int references passage(passage_id) on delete cascade,
    theme_id int references theme(theme_id) on delete cascade,
    score real,
    primary key (passage_id, theme_id)
);

create table if not exists overview_theme (
    overview_id int references overview(overview_id) on delete cascade,
    theme_id int references theme(theme_id) on delete cascade,
    score real,
    primary key (overview_id, theme_id)
);

create index if not exists passage_theme_theme_idx on passage_theme(theme_id);
create index if not exists overview_theme_theme_idx on overview_theme(theme_id);

An example of the Documents data is: 
    title: "Genesis"
    author: "KJV"
    tradition: "Christian, Jewish"
    rhetoric_type: "Narrative"
    language: "English"
    estimated_date: "1000 BC"
    notes: "First book of the Bible"

   Write a postgtres SQL statement (or call the search_passages_by_embedding RPC) that answers: ${question}. 
  Only return the SQL statement.`;


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

    // pass the parameter name p_sql to match the function signature
    let data, error;
    // Use the safe RPC by default
    ({ data, error } = await supabase.rpc('execute_sql', { p_sql: transformedSql }));
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
    const summary = await generateText(`Answer this question ${question} entirely based on the results:\n\n${JSON.stringify(data).slice(0,2000)}`);
    const resp = { sql: finalSql, data, summary };
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
