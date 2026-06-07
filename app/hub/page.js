'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './hub.module.css';

const CAN_MANAGE = ['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'];

const NODES = [
  {
    id: 'dashboard', label: 'Dashboard', path: '/dashboard',
    icon: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 3h2m2 0h2M19 14v2m0 2v2',
    iconType: 'path',
    color: '#8b5cf6', colorRgb: '139,92,246',
    desc: 'Statistici & overview',
    pos: { x: 0, y: -1 },
    access: () => true,
  },
  {
    id: 'members', label: 'Membri', path: '/members',
    icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    iconType: 'path',
    color: '#6366f1', colorRgb: '99,102,241',
    desc: 'Lista completă',
    pos: { x: 0.866, y: -0.5 },
    access: () => true,
  },
  {
    id: 'events', label: 'Evenimente', path: '/events',
    icon: 'M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M2 10h20',
    iconType: 'path',
    color: '#f59e0b', colorRgb: '245,158,11',
    desc: 'Gestionare eventi',
    pos: { x: 0.866, y: 0.5 },
    access: () => true,
  },
  {
    id: 'whitelist', label: 'Whitelist', path: '/whitelist',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    iconType: 'path',
    color: '#10b981', colorRgb: '16,185,129',
    desc: 'Acces & permisiuni',
    pos: { x: 0, y: 1 },
    access: (rank) => CAN_MANAGE.includes(rank),
  },
  {
    id: 'rapoarte', label: 'Rapoarte', path: '/reports',
    icon: 'M18 20V10M12 20V4M6 20v-6',
    iconType: 'path',
    color: '#3b82f6', colorRgb: '59,130,246',
    desc: 'Bilunar & statistici',
    pos: { x: -0.866, y: 0.5 },
    access: () => true,
    soon: true,
  },
  {
    id: 'info', label: 'Informații', path: '/info',
    icon: 'M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zM12 8v4M12 16h.01',
    iconType: 'path',
    color: '#ec4899', colorRgb: '236,72,153',
    desc: 'Regulament & reguli',
    pos: { x: -0.866, y: -0.5 },
    access: () => true,
    soon: true,
  },
];

export default function HubPage() {
  const router   = useRouter();
  const [user,   setUser]   = useState(null);
  const [stats,  setStats]  = useState({ members: 0, active: 0, events: 0, weekEvents: 0 });
  const [hovered, setHovered] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('pr_user');
    if (!stored) { router.replace('/'); return; }
    const u = JSON.parse(stored);
    setUser(u);
    fetchStats();
    startCanvas();

    // Realtime — sync user grade changes
    const ch = supabase.channel('hub-user-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members' }, (payload) => {
        const s2 = sessionStorage.getItem('pr_user');
        if (!s2) return;
        const session = JSON.parse(s2);
        if (session.discord_id === payload.new.discord_id) {
          const updated = { ...session, ...payload.new };
          sessionStorage.setItem('pr_user', JSON.stringify(updated));
          setUser(updated);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, fetchStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fetchStats)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  async function fetchStats() {
    const [{ data: members }, { data: events }] = await Promise.all([
      supabase.from('members').select('status, rank'),
      supabase.from('events').select('date'),
    ]);
    const now = new Date();
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    const pr = (members||[]).filter(m => !['Supervizor PR','Conducere Spital'].includes(m.rank));
    setStats({
      members:    pr.length,
      active:     pr.filter(m => ['Activ','activ'].includes(m.status)).length,
      events:     (events||[]).length,
      weekEvents: (events||[]).filter(e => { const d = new Date(e.date); return d >= mon && d <= sun; }).length,
    });
  }

  function startCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.18, vy: (Math.random()-.5)*.18,
      r: Math.random()*1.2+.4, a: Math.random()*.5+.1,
    }));

    function draw() {
      ctx.clearRect(0,0,W,H);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x<0) p.x=W; if (p.x>W) p.x=0;
        if (p.y<0) p.y=H; if (p.y>H) p.y=0;
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle = `rgba(139,92,246,${p.a*.18})`;
        ctx.fill();
      });
      for (let i=0; i<pts.length; i++) {
        for (let j=i+1; j<pts.length; j++) {
          const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y;
          const d=Math.sqrt(dx*dx+dy*dy);
          if (d<120) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x,pts[i].y);
            ctx.lineTo(pts[j].x,pts[j].y);
            ctx.strokeStyle=`rgba(139,92,246,${(1-d/120)*.04})`;
            ctx.lineWidth=.5;
            ctx.stroke();
          }
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    draw();
    const onResize = () => { W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; };
    window.addEventListener('resize', onResize);
  }

  function navigate(path) {
    setLeaving(true);
    setTimeout(() => router.push(path), 280);
  }

  function logout() {
    sessionStorage.removeItem('pr_user');
    router.replace('/');
  }

  if (!user) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#03020a' }}>
      <div className="cb-spinner"/>
    </div>
  );

  const RADIUS = 230;
  const visibleNodes = NODES.filter(n => n.access(user.rank));

  const statItems = [
    { label: 'Membri PR', value: stats.members, color: '#8b5cf6' },
    { label: 'Activi', value: stats.active, color: '#22c55e' },
    { label: 'Evenimente', value: stats.events, color: '#f59e0b' },
    { label: 'Săpt. asta', value: stats.weekEvents, color: '#3b82f6' },
  ];

  return (
    <div className={`${styles.root} ${leaving ? styles.leaving : ''}`}>
      <canvas ref={canvasRef} className={styles.canvas}/>

      {/* Layered bg glows */}
      <div className={styles.glow1}/>
      <div className={styles.glow2}/>
      <div className={styles.glow3}/>
      <div className={styles.gridOverlay}/>

      {/* Top bar */}
      <header className={styles.topBar}>
        <div className={styles.topLogo}>
          <img src="/logo_pr.png" alt="PR" className={styles.topLogoImg}/>
          <div>
            <div className={styles.topLogoTitle}>Panel PR</div>
            <div className={styles.topLogoSub}>Eclipse Medical Tower</div>
          </div>
        </div>
        <div className={styles.topStats}>
          {statItems.map(s => (
            <div key={s.label} className={styles.topStat}>
              <span className={styles.topStatVal} style={{ color: s.color }}>{s.value}</span>
              <span className={styles.topStatLabel}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.topUser}>
          <div className={styles.topUserInfo}>
            <span className={styles.topUserName}>{user.full_name}</span>
            <span className={styles.topUserRank}>{user.rank}</span>
          </div>
          <img src={user.discord_avatar || '/logo_pr.png'} alt="" className={styles.topUserAvatar}/>
          <button className={styles.topLogout} onClick={logout} title="Deconectare">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Main orbital scene */}
      <div className={styles.scene}>
        {/* Rings */}
        <div className={styles.ring1}/>
        <div className={styles.ring2}/>
        <div className={styles.ring3}/>

        {/* SVG connectors */}
        <svg className={styles.connectors} viewBox="-280 -280 560 560" xmlns="http://www.w3.org/2000/svg">
          {visibleNodes.map(n => {
            const x = n.pos.x * RADIUS;
            const y = n.pos.y * RADIUS;
            const isHov = hovered === n.id;
            return (
              <g key={n.id}>
                <line x1="0" y1="0" x2={x} y2={y}
                  stroke={isHov ? n.color : 'rgba(139,92,246,0.1)'}
                  strokeWidth={isHov ? 1.5 : 0.6}
                  strokeDasharray={isHov ? '0' : '3 8'}
                  style={{ transition: 'all .3s ease' }}
                />
                {isHov && (
                  <circle cx={x*.5} cy={y*.5} r="2.5"
                    fill={n.color} opacity="0.6"
                    style={{ filter: `drop-shadow(0 0 4px ${n.color})` }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Center */}
        <div className={styles.center}>
          <div className={styles.centerRing}/>
          <div className={styles.centerRing2}/>
          <div className={styles.centerImgWrap}>
            <img src="/logo_pr.png" alt="PR" className={styles.centerImg}/>
            <div className={styles.centerImgGlow}/>
          </div>
          <div className={styles.centerText}>
            <span className={styles.centerWelcome}>Bun venit</span>
            <span className={styles.centerName}>{user.full_name.split(' ')[0]}</span>
          </div>
        </div>

        {/* Nodes */}
        {visibleNodes.map(n => {
          const x = n.pos.x * RADIUS;
          const y = n.pos.y * RADIUS;
          const isHov = hovered === n.id && !n.soon;
          return (
            <button
              key={n.id}
              className={`${styles.node} ${isHov ? styles.nodeHov : ''} ${n.soon ? styles.nodeSoon : ''}`}
              style={{
                left: `calc(50% + ${x}px)`,
                top:  `calc(50% + ${y}px)`,
                '--c':    n.color,
                '--crgb': n.colorRgb,
                animationDelay: `${visibleNodes.indexOf(n) * .07}s`,
              }}
              onMouseEnter={() => !n.soon && setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => !n.soon && navigate(n.path)}
            >
              <div className={styles.nodeInner}>
                <div className={styles.nodeIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
                    <path d={n.icon} strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className={styles.nodeContent}>
                  <span className={styles.nodeLabel}>{n.label}</span>
                  <span className={styles.nodeDesc}>{n.soon ? '— în curând —' : n.desc}</span>
                </div>
                {!n.soon && (
                  <div className={styles.nodeChevron}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>
                )}
              </div>
              <div className={styles.nodeGlow}/>
              <div className={styles.nodeBorder}/>
            </button>
          );
        })}
      </div>

      {/* Bottom tagline */}
      <div className={styles.bottomBar}>
        <span>Panel PR · Sistem Management</span>
        <span className={styles.dot}>·</span>
        <span>{new Date().toLocaleDateString('ro-RO', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</span>
      </div>
    </div>
  );
}