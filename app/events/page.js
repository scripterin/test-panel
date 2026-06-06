'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import styles from './events.module.css';

const CAN_MANAGE = ['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'];

const ASSISTANCE = {
  medical_1: { icon: '🏥', label: 'Asistență medicală (1 medic)',  price: '100.000$ truse', extra: '1.000$ / min extra' },
  medical_2: { icon: '🏥', label: 'Asistență medicală (2 medici)', price: '125.000$ truse', extra: '1.250$ / min extra' },
};

const REACTIONS = [
  { key: 'bifa',   emoji: '✅', label: 'Prezent' },
  { key: 'thumbs', emoji: '👍', label: 'OK' },
  { key: 'x',      emoji: '❌', label: 'Absent' },
  { key: 'plaja',  emoji: '🏖️', label: 'Concediu' },
];

const EVENT_STATUS = [
  { key: 'in_asteptare', label: 'În așteptare', color: '#f59e0b' },
  { key: 'finalizat',    label: 'Finalizat',    color: '#22c55e' },
];
const FIN_STATUS = [
  { key: 'neincasat', label: 'Neîncasat', color: '#ef4444' },
  { key: 'incasat',   label: 'Încasat',   color: '#22c55e' },
];

export default function EventsPage() {
  const router = useRouter();
  const [user,    setUser]    = useState(null);
  const [events,  setEvents]  = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openEvent,  setOpenEvent]  = useState(null);
  const [reactions,  setReactions]  = useState([]);
  const [postModal,  setPostModal]  = useState(false);
  const [offerModal, setOfferModal] = useState(false);
  const [form, setForm] = useState({
    date: '', time: '', type: '', organizer_name: '',
    location: '', phone: '', assistance_type: 'medical_1', image_url: '',
  });
  const [offerForm, setOfferForm] = useState({ member_id: '', event_id: '', event_date: '' });
  const [saving, setSaving] = useState(false);
  const [toast,  setToast]  = useState(null);
  const toastRef   = useRef();
  const reactChanRef = useRef(null);

  const canManage = user && (CAN_MANAGE.includes(user.rank));

  useEffect(() => {
    const stored = sessionStorage.getItem('pr_user');
    if (!stored) { router.replace('/'); return; }
    const u = JSON.parse(stored);
    setUser(u);
    fetchAll();

    // Realtime pentru events
    const ch = supabase.channel('events-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fetchEvents)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // Realtime reactions când e deschis un eveniment
  useEffect(() => {
    if (reactChanRef.current) supabase.removeChannel(reactChanRef.current);
    if (!openEvent) return;
    const ch = supabase.channel(`reactions-${openEvent.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'event_reactions',
        filter: `event_id=eq.${openEvent.id}`,
      }, () => fetchReactions(openEvent.id))
      .subscribe();
    reactChanRef.current = ch;
    return () => supabase.removeChannel(ch);
  }, [openEvent?.id]);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchEvents(), fetchMembersList()]);
    setLoading(false);
  }
  async function fetchEvents() {
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    setEvents(data || []);
  }
  async function fetchMembersList() {
    const { data } = await supabase.from('members').select('id, full_name, rank, callsign')
      .in('rank', ['Membru PR', 'Adjunct PR', 'Manager PR']).order('full_name');
    setMembers(data || []);
  }
  async function fetchReactions(eventId) {
    const { data } = await supabase.from('event_reactions').select('*')
      .eq('event_id', eventId).order('created_at', { ascending: true });
    setReactions(data || []);
  }

  async function openDetail(ev) {
    setOpenEvent(ev);
    await fetchReactions(ev.id);
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function toggleReaction(reactionKey) {
    if (!openEvent || !user) return;
    const myReact = reactions.find(r => r.discord_id === user.discord_id);

    // Optimistic update imediat
    if (myReact) {
      if (myReact.reaction === reactionKey) {
        // Toggle off
        setReactions(prev => prev.filter(r => r.discord_id !== user.discord_id));
      } else {
        // Schimbă
        setReactions(prev => prev.map(r =>
          r.discord_id === user.discord_id
            ? { ...r, reaction: reactionKey, created_at: new Date().toISOString() }
            : r
        ));
      }
    } else {
      // Adaugă nou
      setReactions(prev => [...prev, {
        id: 'temp-' + Date.now(),
        event_id:   openEvent.id,
        discord_id: user.discord_id,
        full_name:  user.full_name,
        callsign:   user.callsign || '',
        rank:       user.rank,
        reaction:   reactionKey,
        created_at: new Date().toISOString(),
      }]);
    }

    // Server call (realtime va sincroniza restul)
    await fetch('/api/event-reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id:   openEvent.id,
        discord_id: user.discord_id,
        full_name:  user.full_name,
        callsign:   user.callsign || '',
        rank:       user.rank,
        reaction:   reactionKey,
      }),
    });
  }

  async function updateStatus(field, value) {
    if (!openEvent || !canManage) return;
    const now = new Date().toISOString();
    const patch = {
      id: openEvent.id,
      [field]: value,
      [`${field}_set_by`]: user.full_name,
      [`${field}_set_at`]: now,
    };
    const res = await fetch('/api/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = { ...openEvent, ...patch };
      setOpenEvent(updated);
      setEvents(prev => prev.map(e => e.id === openEvent.id ? updated : e));
    }
  }

  async function submitEvent() {
    if (!form.date || !form.time || !form.type || !form.organizer_name || !form.location || !form.phone) {
      showToast('Completează toate câmpurile obligatorii.', 'error'); return;
    }
    setSaving(true);
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        responsible_callsign: user.callsign || '',
        responsible_name:     user.full_name,
        responsible_rank:     user.rank,
        created_by:           user.full_name,
        event_status:         'in_asteptare',
        financial_status:     'neincasat',
      }),
    });
    if (res.ok) {
      showToast('Eveniment postat!');
      setPostModal(false);
      setForm({ date: '', time: '', type: '', organizer_name: '', location: '', phone: '', assistance_type: 'medical_1', image_url: '' });
    } else showToast('Eroare la postare.', 'error');
    setSaving(false);
  }

  async function submitOffer() {
    if (!offerForm.member_id || !offerForm.event_id || !offerForm.event_date) {
      showToast('Completează toate câmpurile.', 'error'); return;
    }
    setSaving(true);
    const member = members.find(m => m.id === offerForm.member_id);
    const res = await fetch('/api/member-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id:    offerForm.event_id,
        member_id:   offerForm.member_id,
        member_name: member?.full_name || '',
        event_date:  offerForm.event_date,
        offered_by:  user.full_name,
      }),
    });
    if (res.ok) {
      showToast('Eveniment oferit!');
      setOfferModal(false);
      setOfferForm({ member_id: '', event_id: '', event_date: '' });
    } else showToast('Eroare.', 'error');
    setSaving(false);
  }

  function logout() { sessionStorage.removeItem('pr_user'); router.replace('/'); }

  return (
    <div className={styles.root}>
      <div className={styles.bgOrb1}/><div className={styles.bgOrb2}/><div className={styles.bgGrid}/>

      {/* SIDEBAR */}
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
            <a className={styles.navItem} onClick={() => router.push('/members')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Membri
            </a>
            <a className={`${styles.navItem} ${styles.navActive}`}>
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

      {/* MAIN */}
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.headerTitle}>Evenimente</h1>
            <p className={styles.headerSub}>{events.length} evenimente înregistrate</p>
          </div>
          {canManage && (
            <div className={styles.headerActions}>
              <button className={styles.offerBtn} onClick={() => setOfferModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Oferă Eveniment
              </button>
              <button className={styles.postBtn} onClick={() => setPostModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Postează Eveniment
              </button>
            </div>
          )}
        </header>

        {loading ? (
          <div className={styles.loadState}><div className={styles.spinner}/><span>Se încarcă...</span></div>
        ) : events.length === 0 ? (
          <div className={styles.emptyState}><span style={{fontSize:40}}>📋</span><p>Niciun eveniment postat încă.</p></div>
        ) : (
          <div className={styles.eventGrid}>
            {events.map((ev, i) => <EventCard key={ev.id} ev={ev} index={i} onClick={() => openDetail(ev)}/>)}
          </div>
        )}
      </main>

      {/* ── EVENT DETAIL ── */}
      {openEvent && (
        <div className={styles.overlay} onClick={() => setOpenEvent(null)}>
          <div className={styles.detailModal} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className={styles.dmHeader}>
              <div className={styles.dmHeaderLeft}>
                <div className={styles.dmType}>{openEvent.type}</div>
                <div className={styles.dmMeta}>
                  <span>📅 {new Date(openEvent.date).toLocaleDateString('ro-RO', {day:'numeric',month:'long',year:'numeric'})}</span>
                  <span className={styles.dmMetaDot}/>
                  <span>🕐 {openEvent.time}</span>
                </div>
                <div className={styles.dmStatusRow}>
                  {(() => { const s = EVENT_STATUS.find(x => x.key === openEvent.event_status); return s ? <span className={styles.dmBadge} style={{color:s.color,borderColor:s.color+'44',background:s.color+'14'}}>{s.label}</span> : null; })()}
                  {(() => { const s = FIN_STATUS.find(x => x.key === openEvent.financial_status); return s ? <span className={styles.dmBadge} style={{color:s.color,borderColor:s.color+'44',background:s.color+'14'}}>{s.label}</span> : null; })()}
                </div>
              </div>
              <button className={styles.dmClose} onClick={() => setOpenEvent(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className={styles.dmBody}>
              {/* Info cards */}
              <div className={styles.dmInfoGrid}>
                {[
                  { label: 'Organizator',    val: openEvent.organizer_name },
                  { label: 'Locație',        val: openEvent.location },
                  { label: 'Telefon',        val: openEvent.phone },
                  { label: 'Tip Asistență',  val: `${ASSISTANCE[openEvent.assistance_type]?.icon} ${ASSISTANCE[openEvent.assistance_type]?.label}` },
                ].map(it => (
                  <div key={it.label} className={styles.dmInfoCard}>
                    <span className={styles.dmInfoLabel}>{it.label}</span>
                    <span className={styles.dmInfoVal}>{it.val}</span>
                  </div>
                ))}
                <div className={styles.dmInfoCard}>
                  <span className={styles.dmInfoLabel}>Preț</span>
                  <span className={styles.dmInfoVal} style={{color:'#4ade80'}}>
                    {ASSISTANCE[openEvent.assistance_type]?.price}
                    <span style={{color:'rgba(255,255,255,.35)',margin:'0 6px'}}>·</span>
                    {ASSISTANCE[openEvent.assistance_type]?.extra}
                  </span>
                </div>
                <div className={styles.dmInfoCard}>
                  <span className={styles.dmInfoLabel}>Responsabil</span>
                  <span className={styles.dmInfoVal}>
                    {openEvent.responsible_callsign && <span className={styles.csBadge}>{openEvent.responsible_callsign}</span>}
                    {openEvent.responsible_name}
                    <span style={{color:'rgba(255,255,255,.3)',fontSize:11,marginLeft:4}}>{openEvent.responsible_rank}</span>
                  </span>
                </div>
              </div>

              {openEvent.image_url && (
                <img src={openEvent.image_url} alt="Locație" className={styles.dmImage}/>
              )}

              {/* Status desfășurare */}
              <StatusBlock
                title="Status Desfășurare"
                options={EVENT_STATUS}
                current={openEvent.event_status}
                setBy={openEvent.event_status_set_by}
                setAt={openEvent.event_status_set_at}
                canEdit={canManage}
                onChange={val => updateStatus('event_status', val)}
              />

              {/* Status financiar */}
              <StatusBlock
                title="Status Financiar"
                options={FIN_STATUS}
                current={openEvent.financial_status}
                setBy={openEvent.financial_status_set_by}
                setAt={openEvent.financial_status_set_at}
                canEdit={canManage}
                onChange={val => updateStatus('financial_status', val)}
              />

              {/* Prezență */}
              <div className={styles.reactBlock}>
                <div className={styles.blockTitle}>Prezență Membri</div>
                <div className={styles.reactBtnsRow}>
                  {REACTIONS.map(r => {
                    const myReact  = reactions.find(rx => rx.discord_id === user?.discord_id);
                    const isActive = myReact?.reaction === r.key;
                    const count    = reactions.filter(rx => rx.reaction === r.key).length;
                    return (
                      <button key={r.key}
                        className={`${styles.reactBtn} ${isActive ? styles.reactActive : ''}`}
                        onClick={() => toggleReaction(r.key)}>
                        <span className={styles.reactEmoji}>{r.emoji}</span>
                        {count > 0 && <span className={styles.reactCount}>{count}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Logs */}
                <div className={styles.reactLogs}>
                  {reactions.length === 0 ? (
                    <div className={styles.reactEmpty}>Nicio reacție înregistrată.</div>
                  ) : reactions.map(rx => {
                    const rDef = REACTIONS.find(r => r.key === rx.reaction);
                    return (
                      <div key={rx.id} className={styles.reactLogRow}>
                        <span className={styles.reactLogEmoji}>{rDef?.emoji}</span>
                        <div className={styles.reactLogInfo}>
                          <span className={styles.reactLogName}>
                            {rx.callsign && <span className={styles.csBadge}>{rx.callsign}</span>}
                            {rx.full_name}
                          </span>
                          <span className={styles.reactLogRank}>{rx.rank}</span>
                        </div>
                        <span className={styles.reactLogTime}>
                          {new Date(rx.created_at).toLocaleString('ro-RO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── POST MODAL ── */}
      {postModal && (
        <div className={styles.overlay} onClick={() => setPostModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Postează Eveniment</h3>
              <button className={styles.dmClose} onClick={() => setPostModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.formGrid}>
              <Field label="Data *"><input type="date" className={styles.input} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></Field>
              <Field label="Ora *"><input type="time" className={styles.input} value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></Field>
              <Field label="Tip Eveniment *"><input className={styles.input} placeholder="ex: Nuntă, Corporate..." value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}/></Field>
              <Field label="Organizator *"><input className={styles.input} placeholder="Nume și prenume" value={form.organizer_name} onChange={e=>setForm(f=>({...f,organizer_name:e.target.value}))}/></Field>
              <Field label="Locație *"><input className={styles.input} placeholder="Adresa locației" value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></Field>
              <Field label="Telefon *"><input className={styles.input} placeholder="07xx xxx xxx" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></Field>

              <div className={styles.fieldFull}>
                <div className={styles.fieldLabel}>Tip Asistență *</div>
                <div className={styles.assistGrid}>
                  {Object.entries(ASSISTANCE).map(([key,val]) => (
                    <button key={key} className={`${styles.assistCard} ${form.assistance_type===key?styles.assistActive:''}`}
                      onClick={()=>setForm(f=>({...f,assistance_type:key}))}>
                      <span className={styles.assistEmoji}>{val.icon}</span>
                      <div>
                        <div className={styles.assistLabel}>{val.label}</div>
                        <div className={styles.assistPrice}>{val.price}</div>
                        <div className={styles.assistExtra}>{val.extra}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.fieldFull}>
                <div className={styles.fieldLabel}>Responsabil</div>
                <div className={styles.respBox}>
                  {user?.callsign && <span className={styles.csBadge}>{user.callsign}</span>}
                  <span className={styles.respName}>{user?.full_name}</span>
                  <span className={styles.respRank}>{user?.rank}</span>
                </div>
              </div>

              <div className={styles.fieldFull}>
                <div className={styles.fieldLabel}>URL Imagine <span className={styles.optLabel}>(opțional)</span></div>
                <input className={styles.input} placeholder="https://..." value={form.image_url} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))}/>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={()=>setPostModal(false)}>Anulează</button>
              <button className={styles.saveBtn} onClick={submitEvent} disabled={saving}>
                {saving?<><span className={styles.savingDot}/>Se postează...</>:<>✓ Postează</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OFFER MODAL ── */}
      {offerModal && (
        <div className={styles.overlay} onClick={()=>setOfferModal(false)}>
          <div className={`${styles.modal} ${styles.modalSm}`} onClick={e=>e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Oferă Eveniment</h3>
              <button className={styles.dmClose} onClick={()=>setOfferModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <Field label="Eveniment">
                <select className={styles.select} value={offerForm.event_id} onChange={e=>setOfferForm(f=>({...f,event_id:e.target.value}))}>
                  <option value="">-- Selectează eveniment --</option>
                  {events.map(ev=><option key={ev.id} value={ev.id}>{ev.type} · {new Date(ev.date).toLocaleDateString('ro-RO')}</option>)}
                </select>
              </Field>
              <Field label="Membru">
                <select className={styles.select} value={offerForm.member_id} onChange={e=>setOfferForm(f=>({...f,member_id:e.target.value}))}>
                  <option value="">-- Selectează membrul --</option>
                  {members.map(m=><option key={m.id} value={m.id}>{m.full_name} · {m.rank}</option>)}
                </select>
              </Field>
              <Field label="Data Participării">
                <input type="date" className={styles.input} value={offerForm.event_date} onChange={e=>setOfferForm(f=>({...f,event_date:e.target.value}))}/>
              </Field>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={()=>setOfferModal(false)}>Anulează</button>
              <button className={styles.saveBtn} onClick={submitOffer} disabled={saving}>
                {saving?<><span className={styles.savingDot}/>Se salvează...</>:'Oferă Eveniment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`${styles.toast} ${toast.type==='error'?styles.toastError:styles.toastSuccess}`}>
          {toast.type==='error'
            ?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            :<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */
function EventCard({ ev, index, onClick }) {
  const ast   = ASSISTANCE[ev.assistance_type];
  const evSt  = EVENT_STATUS.find(s => s.key === ev.event_status);
  const finSt = FIN_STATUS.find(s => s.key === ev.financial_status);
  return (
    <div className={styles.card} style={{animationDelay:`${index*.05}s`}} onClick={onClick}>
      <div className={styles.cardHeader}>
        <span className={styles.cardType}>{ev.type}</span>
        <div className={styles.cardBadges}>
          {evSt  && <span className={styles.cardBadge} style={{color:evSt.color, background:evSt.color+'18', borderColor:evSt.color+'44'}}>{evSt.label}</span>}
          {finSt && <span className={styles.cardBadge} style={{color:finSt.color,background:finSt.color+'18',borderColor:finSt.color+'44'}}>{finSt.label}</span>}
        </div>
      </div>
      <div className={styles.cardRows}>
        <div className={styles.cardRow}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>{new Date(ev.date).toLocaleDateString('ro-RO')} · {ev.time}</span>
        </div>
        <div className={styles.cardRow}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>{ev.location}</span>
        </div>
        <div className={styles.cardRow}>
          <span style={{fontSize:13}}>{ast?.icon}</span>
          <span>{ast?.label}</span>
        </div>
      </div>
      <div className={styles.cardFooter}>
        <div className={styles.cardOrg}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          {ev.organizer_name}
        </div>
        {ev.responsible_callsign && <span className={styles.csBadge}>{ev.responsible_callsign}</span>}
      </div>
    </div>
  );
}

function StatusBlock({ title, options, current, setBy, setAt, canEdit, onChange }) {
  return (
    <div className={styles.statusBlock}>
      <div className={styles.blockTitle}>{title}</div>
      <div className={styles.statusBtns}>
        {options.map(opt => (
          <button key={opt.key}
            className={`${styles.statusBtn} ${current===opt.key?styles.statusBtnActive:''}`}
            style={current===opt.key?{color:opt.color,background:opt.color+'18',borderColor:opt.color+'55'}:{}}
            onClick={()=>canEdit && onChange(opt.key)}
            disabled={!canEdit}>
            <span className={styles.statusDot} style={{background: current===opt.key ? opt.color : 'rgba(255,255,255,.2)'}}/>
            {opt.label}
          </button>
        ))}
      </div>
      {setBy && setAt && (
        <div className={styles.statusMeta}>
          Setat de <strong>{setBy}</strong> · {new Date(setAt).toLocaleString('ro-RO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}
