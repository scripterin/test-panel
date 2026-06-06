'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './dashboard.module.css';

const PR_GRADES = ['Membru PR', 'Adjunct PR', 'Manager PR'];
const EXCLUDE   = ['Supervizor PR', 'Conducere Spital'];

function getWeekRange() {
  const now   = new Date();
  const day   = now.getDay() || 7;
  const mon   = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0,0,0,0);
  const sun   = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { mon, sun };
}

function AnimatedNumber({ value, duration = 1200 }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef();
  useEffect(() => {
    const start = performance.now();
    const from  = 0;
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * ease));
      if (p < 1) raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <span>{display}</span>;
}

export default function Dashboard() {
  const router  = useRouter();
  const [user,  setUser]  = useState(null);
  const [data,  setData]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [annModal, setAnnModal] = useState(false);
  const [sysModal, setSysModal] = useState(false);
  const [annForm, setAnnForm]   = useState({ title: '', body: '' });
  const [sysForm, setSysForm]   = useState({ title: '', body: '' });
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('pr_user');
    if (!stored) { router.replace('/'); return; }
    const u = JSON.parse(stored);
    setUser(u);
    fetchAll(u);

    // Realtime membri
    const ch = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => fetchAll(u))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => fetchAll(u))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => fetchAll(u))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_updates' }, () => fetchAll(u))
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  async function fetchAll(u) {
    setLoading(true);
    try {
      const [membersRes, eventsRes, announcementsRes, updatesRes] = await Promise.all([
        supabase.from('members').select('*'),
        supabase.from('events').select('*'),
        supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('system_updates').select('*').order('created_at', { ascending: false }).limit(5),
      ]);

      const members      = membersRes.data  || [];
      const events       = eventsRes.data   || [];
      const announcements= announcementsRes.data || [];
      const sysUpdates   = updatesRes.data  || [];

      // Stats
      const prMembers    = members.filter(m => !EXCLUDE.includes(m.rank));
      const activeCount  = prMembers.filter(m => m.status === 'activ').length;
      const adjCount     = prMembers.filter(m => m.rank === 'Adjunct PR').length;
      const managerCount = prMembers.filter(m => m.rank === 'Manager PR').length;

      // Events this week
      const { mon, sun } = getWeekRange();
      const weekEvents   = events.filter(e => {
        const d = new Date(e.date);
        return d >= mon && d <= sun;
      });

      // Recent members (last 5)
      const recent = [...members]
        .sort((a, b) => new Date(b.join_date) - new Date(a.join_date))
        .slice(0, 5);

      // Grade distribution
      const distribution = PR_GRADES.map(g => ({
        grade: g,
        count: prMembers.filter(m => m.rank === g).length,
      }));

      setData({
        totalPR: prMembers.length,
        activeCount,
        adjCount,
        managerCount,
        weekEvents: weekEvents.length,
        recent,
        announcements,
        sysUpdates,
        distribution,
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const isLeadership = user && ['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'].includes(user.rank);

  async function submitAnnouncement() {
    if (!annForm.title.trim() || !annForm.body.trim()) return;
    setSaving(true);
    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       annForm.title,
        body:        annForm.body,
        author:      user.full_name,
        author_rank: user.rank,
      }),
    });
    if (res.ok) {
      setAnnForm({ title: '', body: '' });
      setAnnModal(false);
      fetchAll(user);
    }
    setSaving(false);
  }

  async function submitSysUpdate() {
    if (!sysForm.title.trim() || !sysForm.body.trim()) return;
    setSaving(true);
    const res = await fetch('/api/system-updates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:  sysForm.title,
        body:   sysForm.body,
        author: user.full_name,
      }),
    });
    if (res.ok) {
      setSysForm({ title: '', body: '' });
      setSysModal(false);
      fetchAll(user);
    }
    setSaving(false);
  }

  function logout() {
    sessionStorage.removeItem('pr_user');
    router.replace('/');
  }

  if (!user || loading) {
    return (
      <div className={styles.loadWrap}>
        <div className={styles.loadSpinner} />
        <p>Se încarcă datele...</p>
      </div>
    );
  }

  const maxDist = Math.max(...(data?.distribution.map(d => d.count) || [1]), 1);

  return (
    <div className={styles.root}>
      {/* BG Effects */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />
      <div className={styles.bgGrid} />

      {/* ── SIDEBAR ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sideTop}>
          <div className={styles.sideLogo}>
            <img src="/logo_pr.png" alt="PR" />
            <div className={styles.sideLogoText}>
              <span className={styles.sideTitle}>Panel PR</span>
              <span className={styles.sideSub}>Sistem Management</span>
            </div>
          </div>

          <nav className={styles.nav}>
            <a className={`${styles.navItem} ${styles.navActive}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
              </svg>
              Dashboard
            </a>
            <a className={styles.navItem} onClick={() => router.push('/members')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Membri
            </a>
            <a className={styles.navItem} onClick={() => router.push('/events')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Evenimente
            </a>
            {(['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'].includes(user?.rank)) && (
              <a className={styles.navItem} onClick={() => router.push('/whitelist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Whitelist
              </a>
            )}
          </nav>
        </div>

        <div className={styles.sideUser}>
          <img
            src={user.discord_avatar || '/logo_pr.png'}
            alt={user.discord_tag}
            className={styles.sideAvatar}
          />
          <div className={styles.sideUserInfo}>
            <span className={styles.sideUserName}>{user.full_name}</span>
            <span className={styles.sideUserRank}>{user.rank}</span>
          </div>
          <button className={styles.logoutBtn} onClick={logout} title="Deconectare">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className={styles.main}>

        {/* Header */}
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Dashboard</h1>
            <p className={styles.headerSub}>
              {new Date().toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.headerUser}>
              <span>Bun venit, <strong>{user.full_name.split(' ')[0]}</strong></span>
            </div>
          </div>
        </header>

        {/* ── STAT CARDS ── */}
        <section className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statPurple}`}>
            <div className={styles.statIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className={styles.statBody}>
              <div className={styles.statNum}><AnimatedNumber value={data.totalPR} /></div>
              <div className={styles.statLabel}>Total Membri PR</div>
            </div>
            <div className={styles.statGlow} />
          </div>

          <div className={`${styles.statCard} ${styles.statGreen}`}>
            <div className={styles.statIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div className={styles.statBody}>
              <div className={styles.statNum}><AnimatedNumber value={data.activeCount} /></div>
              <div className={styles.statLabel}>Membri Activi</div>
            </div>
            <div className={styles.statGlow} />
          </div>

          <div className={`${styles.statCard} ${styles.statBlue}`}>
            <div className={styles.statIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className={styles.statBody}>
              <div className={styles.statNum}><AnimatedNumber value={data.adjCount + data.managerCount} /></div>
              <div className={styles.statLabel}>Conducere PR</div>
              <div className={styles.statDetail}>{data.managerCount} mgr · {data.adjCount} adj</div>
            </div>
            <div className={styles.statGlow} />
          </div>

          <div className={`${styles.statCard} ${styles.statOrange}`}>
            <div className={styles.statIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className={styles.statBody}>
              <div className={styles.statNum}><AnimatedNumber value={data.weekEvents} /></div>
              <div className={styles.statLabel}>Evenimente Săptămâna Asta</div>
            </div>
            <div className={styles.statGlow} />
          </div>
        </section>

        {/* ── MIDDLE ROW ── */}
        <div className={styles.midRow}>

          {/* Distribuție grade */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Distribuție Grade</h2>
              <span className={styles.cardBadge}>{data.totalPR} total</span>
            </div>
            <div className={styles.distList}>
              {data.distribution.map((d, i) => (
                <div key={d.grade} className={styles.distItem} style={{ animationDelay: `${i * .1}s` }}>
                  <div className={styles.distLabel}>
                    <span>{d.grade}</span>
                    <span className={styles.distCount}>{d.count}</span>
                  </div>
                  <div className={styles.distBar}>
                    <div
                      className={styles.distFill}
                      style={{
                        width: `${(d.count / maxDist) * 100}%`,
                        '--color': i === 0 ? '#8b5cf6' : i === 1 ? '#6366f1' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Membri recenți */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Membri Recenți</h2>
              <span className={styles.cardBadge}>ultimii 5</span>
            </div>
            <div className={styles.recentList}>
              {data.recent.length === 0 && (
                <p className={styles.empty}>Niciun membru înregistrat încă.</p>
              )}
              {data.recent.map((m, i) => (
                <div key={m.id} className={styles.recentItem} style={{ animationDelay: `${i * .08}s` }}>
                  <img
                    src={m.discord_avatar || '/logo_pr.png'}
                    alt={m.full_name}
                    className={styles.recentAvatar}
                  />
                  <div className={styles.recentInfo}>
                    <span className={styles.recentName}>{m.full_name}</span>
                    <span className={styles.recentRank}>{m.rank}</span>
                  </div>
                  <span className={`${styles.recentStatus} ${m.status === 'activ' ? styles.statusActive : styles.statusInactive}`}>
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW ── */}
        <div className={styles.botRow}>

          {/* Anunțuri */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>
                </svg>
                Anunțuri
              </h2>
              {isLeadership && (
                <button className={styles.addBtn} onClick={() => setAnnModal(true)}>+ Adaugă</button>
              )}
            </div>
            <div className={styles.feedList}>
              {data.announcements.length === 0 && (
                <p className={styles.empty}>Niciun anunț momentan.</p>
              )}
              {data.announcements.map((a, i) => (
                <div key={a.id} className={styles.feedItem} style={{ animationDelay: `${i * .07}s` }}>
                  <div className={styles.feedDot} style={{ '--dot': '#8b5cf6' }} />
                  <div className={styles.feedContent}>
                    <div className={styles.feedTitle}>{a.title}</div>
                    <div className={styles.feedBody}>{a.body}</div>
                    <div className={styles.feedMeta}>
                      <span>{a.author} · {a.author_rank}</span>
                      <span>{new Date(a.created_at).toLocaleDateString('ro-RO')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actualizări sistem */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                  <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                </svg>
                Actualizări Sistem
              </h2>
              {isLeadership && (
                <button className={styles.addBtn} onClick={() => setSysModal(true)}>+ Adaugă</button>
              )}
            </div>
            <div className={styles.feedList}>
              {data.sysUpdates.length === 0 && (
                <p className={styles.empty}>Nicio actualizare momentan.</p>
              )}
              {data.sysUpdates.map((u, i) => (
                <div key={u.id} className={styles.feedItem} style={{ animationDelay: `${i * .07}s` }}>
                  <div className={styles.feedDot} style={{ '--dot': '#f59e0b' }} />
                  <div className={styles.feedContent}>
                    <div className={styles.feedTitle}>{u.title}</div>
                    <div className={styles.feedBody}>{u.body}</div>
                    <div className={styles.feedMeta}>
                      <span>{u.author}</span>
                      <span>{new Date(u.created_at).toLocaleDateString('ro-RO')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── MODAL ANUNȚ ── */}
      {annModal && (
        <div className={styles.modalOverlay} onClick={() => setAnnModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Anunț nou</h3>
              <button className={styles.modalClose} onClick={() => setAnnModal(false)}>✕</button>
            </div>
            <input
              className={styles.modalInput}
              placeholder="Titlu anunț..."
              value={annForm.title}
              onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))}
            />
            <textarea
              className={styles.modalTextarea}
              placeholder="Conținut anunț..."
              value={annForm.body}
              onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))}
            />
            <div className={styles.modalFooter}>
              <button className={styles.modalCancel} onClick={() => setAnnModal(false)}>Anulează</button>
              <button className={styles.modalSubmit} onClick={submitAnnouncement} disabled={saving}>
                {saving ? 'Se salvează...' : 'Publică Anunț'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ACTUALIZARE ── */}
      {sysModal && (
        <div className={styles.modalOverlay} onClick={() => setSysModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Actualizare sistem nouă</h3>
              <button className={styles.modalClose} onClick={() => setSysModal(false)}>✕</button>
            </div>
            <input
              className={styles.modalInput}
              placeholder="Titlu actualizare..."
              value={sysForm.title}
              onChange={e => setSysForm(f => ({ ...f, title: e.target.value }))}
            />
            <textarea
              className={styles.modalTextarea}
              placeholder="Detalii actualizare..."
              value={sysForm.body}
              onChange={e => setSysForm(f => ({ ...f, body: e.target.value }))}
            />
            <div className={styles.modalFooter}>
              <button className={styles.modalCancel} onClick={() => setSysModal(false)}>Anulează</button>
              <button className={styles.modalSubmit} onClick={submitSysUpdate} disabled={saving}>
                {saving ? 'Se salvează...' : 'Publică Actualizare'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
