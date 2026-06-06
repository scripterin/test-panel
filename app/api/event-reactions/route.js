import { createServiceClient } from '../../../lib/supabase';

export async function POST(req) {
  try {
    const { event_id, discord_id, full_name, callsign, rank, reaction } = await req.json();
    const supabase = createServiceClient();

    // Găsește orice react existent al acestui user pentru acest eveniment
    const { data: existing } = await supabase
      .from('event_reactions')
      .select('id, reaction')
      .eq('event_id', event_id)
      .eq('discord_id', discord_id)
      .maybeSingle();

    if (existing) {
      if (existing.reaction === reaction) {
        // Același react — toggle off
        await supabase.from('event_reactions').delete().eq('id', existing.id);
        return Response.json({ action: 'removed' });
      } else {
        // React diferit — înlocuiește
        const { data, error } = await supabase
          .from('event_reactions')
          .update({ reaction, created_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select().single();
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ action: 'changed', reaction: data });
      }
    } else {
      // Nu există — adaugă
      const { data, error } = await supabase
        .from('event_reactions')
        .insert({ event_id, discord_id, full_name, callsign, rank, reaction })
        .select().single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ action: 'added', reaction: data });
    }
  } catch (e) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
