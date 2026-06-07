'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './hub.module.css';

const CAN_MANAGE = ['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'];

export default function HubPage() {
  const router  = useRouter();
  const [user,  setUser]  = useState(null);
  const [stats, setStats] = useState({ members: 0, active: 0, events: 0, weekEvents: 0 });
  const [hovered, setHovered] = useState(null);
  const [entering, setEntering] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('pr_user');
    if (!stored) { router.replace('/'); return; }
    setUser(JSON.parse(stored));
    fetchStats();
    initCanvas();
  }, []);

  function initCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    let raf;
    const pts = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
      r: Math.random() * 1.4 + .3, a: Math.random() * .6 + .2,
    }));
    function draw() {
      ctx.clearRect(0, 0, W, H);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139,92,246,${p.a * .2})`;
        ctx.fill();
      });
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(139,92,246,${(1 - d/110) * .05})`;
            ctx.lineWidth = .6;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }

  async function fetchStats() {
    const [{ data: members }, { data: events }] = await Promise.all([
      supabase.from('members').select('status, rank'),
      supabase.from('events').select('date'),
    ]);
    const now = new Date();
    const day = now.getDay() || 7;
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    const prMembers = (members || []).filter(m => !['Supervizor PR','Conducere Spital'].includes(m.rank));
    setStats({
      members:    prMembers.length,
      active:     prMembers.filter(m => m.status === 'Activ' || m.status === 'activ').length,
      events:     (events || []).length,
      weekEvents: (events || []).filter(e => { const d = new Date(e.date); return d >= mon && d <= sun; }).length,
    });
  }

  function navigate(path) {
    setEntering(path);
    setTimeout(() => router.push(path), 350);
  }

  function logout() {
    sessionStorage.removeItem('pr_user');
    router.replace('/');
  }

  if (!user) return null;

  const canManage = CAN_MANAGE.includes(user.rank);

  const NODES = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      sub: 'Statistici & overview',
      path: '/dashboard',
      angle: 270, // top
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1.5"/>
          <rect x="14" y="3" width="7" height="7" rx="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5"/>
          <rect x="14" y="14" width="7" height="7" rx="1.5"/>
        </svg>
      ),
      color: '#8b5cf6',
      stat: `${stats.members} membri PR`,
      access: true,
    },
    {
      id: 'members',
      label: 'Membri',
      sub: 'Lista completă',
      path: '/members',
      angle: 330,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      color: '#6366f1',
      stat: `${stats.active} activi`,
      access: true,
    },
    {
      id: 'events',
      label: 'Evenimente',
      sub: 'Gestionare eventi',
      path: '/events',
      angle: 30,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      color: '#f59e0b',
      stat: `${stats.weekEvents} săptămâna asta`,
      access: true,
    },
    {
      id: 'whitelist',
      label: 'Whitelist',
      sub: 'Acces & permisiuni',
      path: '/whitelist',
      angle: 90, // bottom
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      ),
      color: '#10b981',
      stat: 'Gestionare acces',
      access: canManage,
    },
    {
      id: 'rapoarte',
      label: 'Rapoart Bilunar',
      sub: 'În curând',
      path: null,
      angle: 150,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      ),
      color: '#3b82f6',
      stat: 'Coming soon',
      access: true,
      disabled: true,
    },
    {
      id: 'setari',
      label: 'Setări',
      sub: 'În curând',
      path: null,
      angle: 210,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      ),
      color: '#ec4899',
      stat: 'Coming soon',
      access: true,
      disabled: true,
    },
  ].filter(n => n.access);

  // Orbit radius responsive
  const RADIUS = 240;

  return (
    <div className={`${styles.root} ${entering ? styles.leaving : ''}`}>
      <canvas ref={canvasRef} className={styles.canvas}/>
      <div className={styles.orb1}/><div className={styles.orb2}/><div className={styles.orb3}/>
      <div className={styles.grid}/>

      <div className={styles.scene}>
        {/* Orbit ring */}
        <div className={styles.orbitRing}/>
        <div className={styles.orbitRingInner}/>

        {/* Connection lines */}
        <svg className={styles.lines} viewBox="-300 -300 600 600">
          {NODES.map(node => {
            const rad = (node.angle * Math.PI) / 180;
            const x = Math.cos(rad) * RADIUS;
            const y = Math.sin(rad) * RADIUS;
            return (
              <line key={node.id}
                x1="0" y1="0" x2={x} y2={y}
                stroke={hovered === node.id ? node.color : 'rgba(139,92,246,0.12)'}
                strokeWidth={hovered === node.id ? 1.5 : 0.8}
                strokeDasharray={hovered === node.id ? 'none' : '4 6'}
                style={{ transition: 'all .3s ease' }}
              />
            );
          })}
        </svg>

        {/* Center Logo */}
        <div className={styles.center}>
          <div className={styles.centerPulse}/>
          <div className={styles.centerPulse2}/>
          <div className={styles.centerLogo}>
            <img src="/logo_pr.png" alt="PR"/>
          </div>
          <div className={styles.centerGreet}>
            Bun venit, <strong>{user.full_name.split(' ')[0]}</strong>
          </div>
          <div className={styles.centerRank}>{user.rank}</div>
        </div>

        {/* Nodes */}
        {NODES.map(node => {
          const rad   = (node.angle * Math.PI) / 180;
          const x     = Math.cos(rad) * RADIUS;
          const y     = Math.sin(rad) * RADIUS;
          const isHov = hovered === node.id;

          return (
            <button
              key={node.id}
              className={`${styles.node} ${node.disabled ? styles.nodeDisabled : ''} ${isHov ? styles.nodeHovered : ''}`}
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: 'translate(-50%, -50%)',
                '--c': node.color,
              }}
              onMouseEnter={() => !node.disabled && setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => !node.disabled && node.path && navigate(node.path)}
            >
              <div className={styles.nodeIcon} style={{ color: node.color }}>
                {node.icon}
              </div>
              <div className={styles.nodeText}>
                <span className={styles.nodeLabel}>{node.label}</span>
                <span className={styles.nodeStat}>{node.stat}</span>
              </div>
              {isHov && !node.disabled && (
                <div className={styles.nodeArrow}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              )}
              <div className={styles.nodeGlow} style={{ background: `radial-gradient(circle, ${node.color}22, transparent 70%)` }}/>
            </button>
          );
        })}
      </div>

      {/* User card bottom right */}
      <div className={styles.userCard}>
        <img src={user.discord_avatar || '/logo_pr.png'} alt="" className={styles.userAvatar}/>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{user.full_name}</span>
          <span className={styles.userRank}>{user.rank}</span>
        </div>
        <button className={styles.logoutBtn} onClick={logout} title="Deconectare">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Bottom tagline */}
      <div className={styles.tagline}>
        Panel PR · Eclipse Medical Tower · Sistem Management
      </div>
    </div>
  );
}
