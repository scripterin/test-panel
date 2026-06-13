'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './hub.module.css';

const CAN_MANAGE = ['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'];

export default function HubPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ members: 0, active: 0, events: 0, weekEvents: 0 });
  const [leaving, setLeaving] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const stored = sessionStorage.getItem('pr_user');
    if (!stored) { router.replace('/'); return; }
    const u = JSON.parse(stored);
    setUser(u);
    fetchStats();

    const clock = setInterval(() => setNow(new Date()), 60000);

    const ch = supabase.channel('hub-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members' }, (p) => {
        const s2 = sessionStorage.getItem('pr_user');
        if (s2) {
          const ses = JSON.parse(s2);
          if (ses.discord_id === p.new.discord_id) {
            const upd = { ...ses, ...p.new };
            sessionStorage.setItem('pr_user', JSON.stringify(upd));
            setUser(upd);
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fetchStats)
      .subscribe();

    return () => { supabase.removeChannel(ch); clearInterval(clock); };
  }, []);

  async function fetchStats() {
    const [{ data: members }, { data: events }] = await Promise.all([
      supabase.from('members').select('status, rank'),
      supabase.from('events').select('date'),
    ]);
    const d = new Date();
    const day = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    const pr = (members||[]).filter(m => !['Supervizor PR','Conducere Spital'].includes(m.rank));
    setStats({
      members: pr.length,
      active: pr.filter(m => ['Activ','activ'].includes(m.status)).length,
      events: (events||[]).length,
      weekEvents: (events||[]).filter(e => { const dd = new Date(e.date); return dd >= mon && dd <= sun; }).length,
    });
  }

  function go(path) {
    setLeaving(path);
    setTimeout(() => router.push(path), 260);
  }

  function logout() {
    sessionStorage.removeItem('pr_user');
    router.replace('/');
  }

  if (!user) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div className="cb-spinner"/>
    </div>
  );

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return 'Bună dimineața';
    if (h < 18) return 'Bună ziua';
    return 'Bună seara';
  })();

  const canWhitelist = CAN_MANAGE.includes(user.rank);

  return (
    <div className={`${styles.root} ${leaving ? styles.leaving : ''}`}>
      <div className={styles.bgBlob1}/>
      <div className={styles.bgBlob2}/>

      {/* Top bar */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img src="/logo_pr.png" alt="PR" className={styles.brandLogo}/>
          <span className={styles.brandText}>Panel PR</span>
        </div>
        <div className={styles.userChip}>
          <div className={styles.userText}>
            <span className={styles.userName}>{user.full_name}</span>
            <span className={styles.userRank}>{user.rank}</span>
          </div>
          <img src={user.discord_avatar || '/logo_pr.png'} alt="" className={styles.userAvatar}/>
          <button className={styles.logoutBtn} onClick={logout} title="Deconectare">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Bento grid */}
      <main className={styles.grid}>

        {/* Hero / welcome */}
        <div className={`${styles.cell} ${styles.hero}`}>
          <div className={styles.heroTop}>
            <span className={styles.heroGreeting}>{greeting},</span>
            <h1 className={styles.heroName}>{user.full_name.split(' ')[0]}</h1>
          </div>
          <div className={styles.heroBottom}>
            <div className={styles.heroDate}>
              {now.toLocaleDateString('ro-RO', { weekday:'long', day:'numeric', month:'long' })}
            </div>
            <div className={styles.heroTime}>
              {now.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' })}
            </div>
          </div>
          <div className={styles.heroGlow}/>
        </div>

        {/* Stat: members */}
        <div className={`${styles.cell} ${styles.statCell}`}>
          <span className={styles.statNum}>{stats.members}</span>
          <span className={styles.statLabel}>Membri PR</span>
        </div>

        {/* Stat: active */}
        <div className={`${styles.cell} ${styles.statCell}`}>
          <span className={styles.statNum} style={{ color:'var(--green)' }}>{stats.active}</span>
          <span className={styles.statLabel}>Activi</span>
        </div>

        {/* Dashboard tile */}
        <button className={`${styles.cell} ${styles.tile} ${styles.tileWide}`} onClick={() => go('/dashboard')}>
          <div className={styles.tileIcon} style={{ '--tc':'139,92,246' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <div className={styles.tileText}>
            <span className={styles.tileLabel}>Dashboard</span>
            <span className={styles.tileDesc}>Statistici & overview general</span>
          </div>
          <svg className={styles.tileArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </button>

        {/* Members tile */}
        <button className={`${styles.cell} ${styles.tile}`} onClick={() => go('/members')}>
          <div className={styles.tileIcon} style={{ '--tc':'99,102,241' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div className={styles.tileText}>
            <span className={styles.tileLabel}>Membri</span>
            <span className={styles.tileDesc}>Lista completă</span>
          </div>
          <svg className={styles.tileArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </button>

        {/* Events tile - tall */}
        <button className={`${styles.cell} ${styles.tile} ${styles.tileTall}`} onClick={() => go('/events')}>
          <div className={styles.tileIcon} style={{ '--tc':'245,158,11' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className={styles.tileText}>
            <span className={styles.tileLabel}>Evenimente</span>
            <span className={styles.tileDesc}>Gestionare & prezență</span>
          </div>
          <div className={styles.tileBigStat}>
            <span className={styles.tileBigNum}>{stats.weekEvents}</span>
            <span className={styles.tileBigLabel}>săptămâna asta</span>
          </div>
          <svg className={styles.tileArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </button>

        {/* Whitelist tile */}
        {canWhitelist && (
          <button className={`${styles.cell} ${styles.tile}`} onClick={() => go('/whitelist')}>
            <div className={styles.tileIcon} style={{ '--tc':'16,185,129' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className={styles.tileText}>
              <span className={styles.tileLabel}>Whitelist</span>
              <span className={styles.tileDesc}>Acces & permisiuni</span>
            </div>
            <svg className={styles.tileArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="M7 17 17 7M7 7h10v10"/></svg>
          </button>
        )}

        {/* Reports tile - soon */}
        <div className={`${styles.cell} ${styles.tile} ${styles.tileSoon}`}>
          <div className={styles.tileIcon} style={{ '--tc':'59,130,246' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
              <path d="M18 20V10M12 20V4M6 20v-6"/>
            </svg>
          </div>
          <div className={styles.tileText}>
            <span className={styles.tileLabel}>Rapoarte</span>
            <span className={styles.tileDesc}>În curând</span>
          </div>
          <span className={styles.soonTag}>Soon</span>
        </div>

        {/* Info tile - soon */}
        <div className={`${styles.cell} ${styles.tile} ${styles.tileSoon}`}>
          <div className={styles.tileIcon} style={{ '--tc':'236,72,153' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <div className={styles.tileText}>
            <span className={styles.tileLabel}>Informații</span>
            <span className={styles.tileDesc}>Regulament & reguli</span>
          </div>
          <span className={styles.soonTag}>Soon</span>
        </div>

      </main>

      <div className={styles.footer}>Panel PR · Sistem Management</div>
    </div>
  );
}
