const supabase = require('../../../lib/supabaseClient');

export default async function handler(req, res) {
  const { id } = req.query;
  if (req.method === 'GET') {
    const { data: overviews, error: ovErr } = await supabase.from('overview').select('*').eq('document_id', id).order('overview_id');
    if (ovErr) return res.status(500).json({ error: ovErr });
    const { data: passages, error: pErr } = await supabase.from('passage').select('*').eq('document_id', id).order('passage_id');
    if (pErr) return res.status(500).json({ error: pErr });
    return res.json({ overviews, passages });
  }
  res.status(405).end();
}
