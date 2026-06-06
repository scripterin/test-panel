import { createServiceClient } from '../../../lib/supabase';

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('whitelist')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(req) {
  const supabase = createServiceClient();
  const { discord_id, full_name, rank, added_by, employee_id, callsign, join_date } = await req.json();
  if (!discord_id || !full_name || !rank) {
    return Response.json({ error: 'Câmpuri lipsă' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('whitelist')
    .insert({ discord_id, full_name, rank, added_by, employee_id, callsign, join_date })
    .select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function DELETE(req) {
  const supabase = createServiceClient();
  const { id } = await req.json();
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
  const { error } = await supabase.from('whitelist').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function PATCH(req) {
  const supabase = createServiceClient();
  const { id, ...fields } = await req.json();
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
  const { data, error } = await supabase
    .from('whitelist')
    .update(fields)
    .eq('id', id)
    .select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}
