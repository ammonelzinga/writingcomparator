const supabase = require('../../lib/supabaseClient');
const { generateText } = require('../../lib/openai');

function sanitizeSql(sql) {
  // Very basic: allow only SELECT and LIMIT, prevent writes
  const lowered = sql.trim().toLowerCase();
  if (!lowered.startsWith('select')) throw new Error('Only SELECT queries are allowed');
  if (lowered.includes('insert') || lowered.includes('update') || lowered.includes('delete') || lowered.includes('drop') || lowered.includes('alter')) {
    throw new Error('Query contains disallowed statements');
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
  const prompt = `You are given a Postgres database with tables: document(document_id,title,author,tradition,rhetoric_type,language,estimated_date,notes), overview(overview_id,document_id,label,summary), passage(passage_id,document_id,overview_id,label,content), theme(theme_id,name,description,embedding_vector), passage_theme(passage_id,theme_id,score), overview_theme(overview_id,theme_id,score), embedding_passage(passage_id,embedding_vector), embedding_overview(overview_id,embedding_vector). The database supports semantic similarity search using the embedding_vector columns and the search_passages_by_embedding RPC. For theme-based queries, use the theme and passage_theme tables and their embedding vectors. When comparing estimated_date numerically, cast it appropriately. Write a single SELECT SQL statement (or call the search_passages_by_embedding RPC) that answers: ${question}. Only return the SQL statement.`;
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
    // pass the parameter name p_sql to match the function signature
    const { data, error } = await supabase.rpc('execute_sql', { p_sql: finalSql });
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
    const summary = await generateText(`Summarize these results in a friendly way for a user:\n\n${JSON.stringify(data).slice(0,2000)}`);
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
