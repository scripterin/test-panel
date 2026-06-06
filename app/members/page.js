'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './members.module.css';

const ALL_GRADES   = ['Conducere Spital', 'Supervizor PR', 'Manager PR', 'Adjunct PR', 'Membru PR'];
const GRADE_OPTIONS = ALL_GRADES;
const CAN_EDIT_GRADES = ['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'];
const GRADE_ORDER  = ['Conducere Spital', 'Supervizor PR', 'Manager PR', 'Adjunct PR', 'Membru PR'];

const STATUS_OPTIONS = ['Activ', 'Inactiv', 'Concediu', 'Concediu Civil'];
const STATUS_COLORS  = {
  'Activ':          { bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.25)',   text: '#4ade80' },
  'activ':          { bg: 'rgba(34,197,94,.1)',   border: 'rgba(34,197,94,.25)',   text: '#4ade80' },
  'Inactiv':        { bg: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.2)',  text: '#94a3b8' },
  'inactiv':        { bg: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.2)',  text: '#94a3b8' },
  'Concediu':       { bg: 'rgba(245,158,11,.1)',  border: 'rgba(245,158,11,.25)',  text: '#fbbf24' },
  'Concediu Civil': { bg: 'rgba(99,102,241,.1)',  border: 'rgba(99,102,241,.25)',  text: '#818cf8' },
};

const GRADE_ACCENT = {
  'Membru PR':        '#8b5cf6',
  'Adjunct PR':       '#6366f1',
  'Manager PR':       '#f59e0b',
  'Supervizor PR':    '#3b82f6',
  'Conducere Spital': '#10b981',
};

const sortByGrade = arr => [...arr].sort((a, b) => GRADE_ORDER.indexOf(a.rank) - GRADE_ORDER.indexOf(b.rank));

export default function MembersPage() {
  const router = useRouter();
  const [user,       setUser]       = useState(null);
  const [members,    setMembers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [editForm,   setEditForm]   = useState({});
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);
  const toastRef = useRef();

  useEffect(() => {
    const stored = sessionStorage.getItem('pr_user');
    if (!stored) { router.replace('/'); return; }
    const u = JSON.parse(stored);
    setUser(u);
    fetchMembers();

    // Realtime — orice modificare la members
    const ch = supabase.channel('members-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setMembers(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
          // Dacă userul curent a fost modificat, actualizează sesiunea
          const stored2 = sessionStorage.getItem('pr_user');
          if (stored2) {
            const session = JSON.parse(stored2);
            if (session.discord_id === payload.new.discord_id) {
              const updated = { ...session, ...payload.new };
              sessionStorage.setItem('pr_user', JSON.stringify(updated));
              setUser(updated);
            }
          }
        } else if (payload.eventType === 'INSERT') {
          setMembers(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'DELETE') {
          setMembers(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  const canEdit = user && CAN_EDIT_GRADES.includes(user.rank);

  async function fetchMembers() {
    setLoading(true);
    const { data } = await supabase.from('members').select('*');
    setMembers(data || []);
    setLoading(false);
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3200);
  }

  function openEdit(member) {
    setEditTarget(member);
    setEditForm({
      full_name:   member.full_name   || '',
      rank:        member.rank        || '',
      status:      member.status      || 'Activ',
      callsign:    member.callsign    || '',
      discord_id:  member.discord_id  || '',
      employee_id: member.employee_id || '',
      notes:       member.notes       || '',
    });
  }

  async function saveEdit() {
    if (!editTarget) return;
    setSaving(true);
    const res = await fetch('/api/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editTarget.id, ...editForm }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('Eroare: ' + (data.error || 'necunoscută'), 'error');
    } else {
      showToast('Modificările au fost salvate!');
      setEditTarget(null);
    }
    setSaving(false);
  }

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      m.full_name?.toLowerCase().includes(q) ||
      m.rank?.toLowerCase().includes(q) ||
      m.callsign?.toLowerCase().includes(q) ||
      m.discord_id?.includes(q) ||
      m.employee_id?.includes(q)
    );
  });

  const prMembers   = sortByGrade(filtered.filter(m => ['Membru PR','Adjunct PR','Manager PR'].includes(m.rank)));
  const supMembers  = sortByGrade(filtered.filter(m => m.rank === 'Supervizor PR'));
  const hospMembers = sortByGrade(filtered.filter(m => m.rank === 'Conducere Spital'));

  function logout() { sessionStorage.removeItem('pr_user'); router.replace('/'); }

  return (
    <div className={styles.root}>
      <div className={styles.bgOrb1}/><div className={styles.bgOrb2}/><div className={styles.bgGrid}/>

      <aside className={styles.sidebar}>
        <div className={styles.sideTop}>
          <div className={styles.sideLogo}>
            <img src="/logo_pr.png" alt="PR"/>
            <div className={styles.sideLogoText}>
              <span className={styles.sideTitle}>Panel PR</span>
              <span className={styles.sideSub}>Sistem Management</span>
            </div>
          </div>
          <nav className={styles.nav}>
            <a className={styles.navItem} onClick={() => router.push('/dashboard')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
              Dashboard
            </a>
            <a className={`${styles.navItem} ${styles.navActive}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Membri
            </a>
            <a className={styles.navItem} onClick={() => router.push('/events')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Evenimente
            </a>
            {(['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'].includes(user?.rank)) && (
              <a className={styles.navItem} onClick={() => router.push('/whitelist')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Whitelist
              </a>
            )}
          </nav>
        </div>
        <div className={styles.sideUser}>
          <img src={user?.discord_avatar || '/logo_pr.png'} alt="" className={styles.sideAvatar}/>
          <div className={styles.sideUserInfo}>
            <span className={styles.sideUserName}>{user?.full_name}</span>
            <span className={styles.sideUserRank}>{user?.rank}</span>
          </div>
          <button className={styles.logoutBtn} onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Membri</h1>
            <p className={styles.headerSub}>{members.length} membri înregistrați total</p>
          </div>
          <div className={styles.headerSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className={styles.searchInput} placeholder="Caută după nume, grad, callsign, ID..." value={search} onChange={e => setSearch(e.target.value)}/>
            {search && <button className={styles.searchClear} onClick={() => setSearch('')}>✕</button>}
          </div>
        </header>

        {loading ? (
          <div className={styles.loadState}><div className={styles.spinner}/><span>Se încarcă membrii...</span></div>
        ) : (
          <div className={styles.allSections}>
            <MemberSection title="Relații Publice"  members={prMembers}   accent="#8b5cf6" canEdit={canEdit} onEdit={openEdit} statusColors={STATUS_COLORS}/>
            {supMembers.length  > 0 && <MemberSection title="Supervizori PR"   members={supMembers}  accent="#3b82f6" canEdit={canEdit} onEdit={openEdit} statusColors={STATUS_COLORS}/>}
            {hospMembers.length > 0 && <MemberSection title="Conducere Spital" members={hospMembers} accent="#10b981" canEdit={canEdit} onEdit={openEdit} statusColors={STATUS_COLORS}/>}
          </div>
        )}
      </main>

      {editTarget && (
        <div className={styles.overlay} onClick={() => setEditTarget(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTop}>
              <div className={styles.modalProfile}>
                <img src={editTarget.discord_avatar || '/logo_pr.png'} alt="" className={styles.modalAvatar}/>
                <div>
                  <div className={styles.modalName}>{editTarget.full_name}</div>
                  <div className={styles.modalSub}>
                    <span className={styles.modalRankBadge} style={{ '--a': GRADE_ACCENT[editTarget.rank] || '#8b5cf6' }}>{editTarget.rank}</span>
                  </div>
                </div>
              </div>
              <button className={styles.modalClose} onClick={() => setEditTarget(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.modalDivider}/>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label}>Nume Complet</label>
                <input className={styles.input} value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}/>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Grad</label>
                <select className={styles.select} value={editForm.rank} onChange={e => setEditForm(f => ({ ...f, rank: e.target.value }))}>
                  {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Status</label>
                <div className={styles.statusGrid}>
                  {STATUS_OPTIONS.map(s => {
                    const sc = STATUS_COLORS[s] || STATUS_COLORS['Inactiv'];
                    const active = editForm.status === s;
                    return (
                      <button key={s}
                        className={`${styles.statusOption} ${active ? styles.statusSelected : ''}`}
                        style={active ? { background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text } : {}}
                        onClick={() => setEditForm(f => ({ ...f, status: s }))}>
                        <span className={styles.statusDot} style={{ background: active ? sc.text : 'rgba(255,255,255,.2)' }}/>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>ID Angajat</label>
                <input className={styles.input} placeholder="ex: PR-001" value={editForm.employee_id} onChange={e => setEditForm(f => ({ ...f, employee_id: e.target.value }))}/>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Callsign</label>
                <input className={styles.input} placeholder="ex: PR-7" value={editForm.callsign} onChange={e => setEditForm(f => ({ ...f, callsign: e.target.value }))}/>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Discord ID</label>
                <input className={styles.input} value={editForm.discord_id} onChange={e => setEditForm(f => ({ ...f, discord_id: e.target.value }))}/>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Notițe</label>
                <textarea className={styles.textarea} placeholder="Observații..." value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}/>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => setEditTarget(null)}>Anulează</button>
              <button className={styles.saveBtn} onClick={saveEdit} disabled={saving}>
                {saving ? <><span className={styles.savingDot}/>Se salvează...</> : <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
                  Salvează
                </>}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === 'error'
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function MemberSection({ title, members, accent, canEdit, onEdit, statusColors }) {
  if (members.length === 0) return null;
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionDot} style={{ background: accent }}/>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionCount}>{members.length}</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Membru</th><th>Grad</th><th>Status</th>
              <th>ID Angajat</th><th>Callsign</th><th>Discord ID</th>
              <th>Data Angajării</th>
              {canEdit && <th style={{ textAlign: 'right' }}>Acțiuni</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const sc = statusColors[m.status] || { bg: 'rgba(148,163,184,.1)', border: 'rgba(148,163,184,.2)', text: '#94a3b8' };
              const ga = GRADE_ACCENT[m.rank] || accent;
              return (
                <tr key={m.id} className={styles.row} style={{ animationDelay: `${i * .03}s` }}>
                  <td>
                    <div className={styles.memberCell}>
                      <img src={m.discord_avatar || '/logo_pr.png'} alt={m.full_name} className={styles.avatar}/>
                      <span className={styles.memberName}>{m.full_name}</span>
                    </div>
                  </td>
                  <td><span className={styles.gradeBadge} style={{ '--ga': ga }}>{m.rank}</span></td>
                  <td>
                    <span className={styles.statusBadge} style={{ background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text }}>
                      <span className={styles.statusDot} style={{ background: sc.text }}/>
                      {m.status || '—'}
                    </span>
                  </td>
                  <td className={styles.mono}>{m.employee_id || <span className={styles.dash}>—</span>}</td>
                  <td className={styles.mono}>{m.callsign   || <span className={styles.dash}>—</span>}</td>
                  <td className={styles.mono}>{m.discord_id || <span className={styles.dash}>—</span>}</td>
                  <td className={styles.dateCell}>
                    {m.join_date ? new Date(m.join_date).toLocaleDateString('ro-RO') : <span className={styles.dash}>—</span>}
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button className={styles.editBtn} onClick={() => onEdit(m)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editează
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
