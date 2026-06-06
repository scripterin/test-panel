import { createServiceClient } from '../../../lib/supabase';

export async function POST(req) {
  try {
    const body = await req.json();
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('member_events')
      .insert(body)
      .select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ data });
  } catch (e) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
