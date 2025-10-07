function coerce(v) {
  // Already numeric array
  if (Array.isArray(v)) return v;
  // Typed arrays
  if (v instanceof Float32Array || v instanceof Float64Array) return Array.from(v);
  // String forms: "[0.1, 0.2, ...]" or "{0.1,0.2}" (pgvector textual) or space separated
  if (typeof v === 'string') {
    let s = v.trim();
    if (!s) return [];
    // Replace curly braces with brackets
    if (s.startsWith('{') && s.endsWith('}')) s = '[' + s.slice(1, -1) + ']';
    // If still no brackets, wrap
    if (!s.startsWith('[') && s.indexOf(',') !== -1) s = '[' + s + ']';
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(n => (Number.isFinite(+n) ? +n : 0));
    } catch (_) {
      // Fallback: split on whitespace
      return s.replace(/^[\[\{]|[\]\}]$/g, '').split(/[,\s]+/).filter(Boolean).map(x => (Number.isFinite(+x) ? +x : 0));
    }
  }
  return [];
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

function cosine(a, b) {
  const A = coerce(a);
  const B = coerce(b);
  if (!A.length || !B.length || A.length !== B.length) return 0;
  for (let i = 0; i < A.length; i++) {
    if (!Number.isFinite(A[i]) || !Number.isFinite(B[i])) return 0;
  }
  const d = dot(A, B);
  const n = norm(A) * norm(B);
  if (!Number.isFinite(d) || !Number.isFinite(n) || n === 0) return 0;
  const v = d / n;
  return Number.isFinite(v) ? v : 0;
}

module.exports = { cosine, coerce };
