import { createServiceClient } from '../../../lib/supabase';

export async function POST(req) {
  try {
    const body = await req.json();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('events')
      .insert(body)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ event: data });
  } catch (e) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const { id, ...fields } = await req.json();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('events')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ event: data });
  } catch (e) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
