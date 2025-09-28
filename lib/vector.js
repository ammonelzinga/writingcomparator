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
  if (!a || !b) return 0;
  const d = dot(a, b);
  const n = norm(a) * norm(b);
  if (n === 0) return 0;
  return d / n;
}

module.exports = { cosine };
