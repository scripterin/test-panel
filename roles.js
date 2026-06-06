import { createServiceClient } from '../../../lib/supabase';

export async function PATCH(req) {
  try {
    const { id, ...fields } = await req.json();
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('members')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ member: data });
  } catch (e) {
    console.error(e);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
