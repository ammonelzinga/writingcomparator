const supabase = require('../../lib/supabaseClient');

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const { data: countData, error: cErr } = await supabase.rpc('count_rows', { p_table: 'passage_theme' });
    // fallback if rpc not present
    let count = null;
    if (cErr || !countData) {
      const { data, error } = await supabase.from('passage_theme').select('passage_id', { count: 'exact' }).limit(1);
      if (error) return res.status(500).json({ error });
      count = data && data.length ? data.length : 0;
    } else {
      count = countData[0] && countData[0].count ? parseInt(countData[0].count, 10) : 0;
    }

    const { data: sample, error: sErr } = await supabase.from('passage_theme').select('*').limit(10);
    if (sErr) return res.status(500).json({ error: sErr });

    return res.json({ count, sample });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
