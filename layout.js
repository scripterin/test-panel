import { createServiceClient } from '../../../lib/supabase';

export async function POST(req) {
  const { code } = await req.json();

  if (!code) {
    return Response.json({ error: 'Missing code' }, { status: 400 });
  }

  try {
    // 1. Schimbă codul pentru token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  process.env.DISCORD_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return Response.json({ error: 'Token exchange failed', details: tokenData }, { status: 400 });
    }

    // 2. Ia datele userului de la Discord
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const discordUser = await userRes.json();
    if (!userRes.ok || !discordUser.id) {
      return Response.json({ error: 'Failed to fetch Discord user' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 3. Verifică whitelist
    const { data: whitelistEntry, error: wErr } = await supabase
      .from('whitelist')
      .select('*')
      .eq('discord_id', discordUser.id)
      .single();

    if (wErr || !whitelistEntry) {
      return Response.json({ error: 'not_whitelisted' }, { status: 403 });
    }

    // 4. Upsert member în tabelul members
    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    const { data: member, error: mErr } = await supabase
      .from('members')
      .upsert({
        discord_id:     discordUser.id,
        discord_tag:    discordUser.username,
        discord_avatar: avatar,
        full_name:      whitelistEntry.full_name,
        rank:           whitelistEntry.rank,
        
        status:         'activ',
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'discord_id' })
      .select()
      .single();

    if (mErr) {
      return Response.json({ error: 'DB error', details: mErr }, { status: 500 });
    }

    // 5. Log login
    await supabase.from('logs').insert({
      action:     'LOGIN',
      message:    `${member.full_name} (${member.rank}) s-a conectat via Discord`,
      discord_id: member.discord_id,
    });

    return Response.json({ member });

  } catch (e) {
    console.error('discord-auth error', e);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
