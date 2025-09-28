import { supabaseClient } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const overviewId = parseInt(id);

  if (!overviewId || isNaN(overviewId)) {
    return res.status(400).json({ error: 'Invalid overview ID' });
  }

  try {
    // Get the specific overview
    const { data: overview, error: overviewError } = await supabaseClient
      .from('overview')
      .select('*')
      .eq('overview_id', overviewId)
      .single();

    if (overviewError) {
      return res.status(500).json({ error: overviewError.message });
    }

    if (!overview) {
      return res.status(404).json({ error: 'Overview not found' });
    }

    // Get passages for this overview
    const { data: passages, error: passagesError } = await supabaseClient
      .from('passage')
      .select('*')
      .eq('overview_id', overviewId)
      .order('passage_id');

    if (passagesError) {
      return res.status(500).json({ error: passagesError.message });
    }

    res.json({ overview, passages: passages || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}