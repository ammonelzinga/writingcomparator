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
  // Validate inputs: must be arrays of the same length with finite numbers
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length !== b.length) return 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
  }

  const d = dot(a, b);
  const n = norm(a) * norm(b);
  if (!Number.isFinite(d) || !Number.isFinite(n) || n === 0) return 0;
  const v = d / n;
  // ensure finite numeric output
  return Number.isFinite(v) ? v : 0;
}

module.exports = { cosine };
