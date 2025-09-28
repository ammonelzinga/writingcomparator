const supabase = require('../../lib/supabaseClient');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('document').select('*').order('title');
    if (error) return res.status(500).json({ error });
    return res.json({ documents: data });
  }
  res.status(405).end();
}
