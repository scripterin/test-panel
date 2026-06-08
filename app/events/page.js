'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import UserCard from '../../components/UserCard';
import styles from './events.module.css';

const CAN_MANAGE = ['Adjunct PR', 'Manager PR', 'Supervizor PR', 'Conducere Spital'];
const ASSISTANCE = {
  medical_1: { icon:'🏥', label:'Asistență medicală (1 medic)',  price:'100.000$ truse', extra:'1.000$ / min extra' },
  medical_2: { icon:'🏥', label:'Asistență medicală (2 medici)', price:'125.000$ truse', extra:'1.250$ / min extra' },
};
const REACTIONS = [
  { key:'bifa',   emoji:'✅', label:'Prezent' },
  { key:'thumbs', emoji:'👍', label:'OK' },
  { key:'x',      emoji:'❌', label:'Absent' },
  { key:'plaja',  emoji:'🏖️', label:'Concediu' },
];
const EV_STATUS = [
  { key:'in_asteptare', label:'În așteptare', color:'#f59e0b' },
  { key:'finalizat',    label:'Finalizat',    color:'#22c55e' },
];
const FIN_STATUS = [
  { key:'neincasat', label:'Neîncasat', color:'#ef4444' },
  { key:'incasat',   label:'Încasat',   color:'#22c55e' },
];

export default function EventsPage() {
  const router = useRouter();
  const [user,      setUser]      = useState(null);
  const [events,    setEvents]    = useState([]);
  const [members,   setMembers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [openEvent, setOpenEvent] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [postModal,  setPostModal]  = useState(false);
  const [offerModal, setOfferModal] = useState(false);
  const [form, setForm] = useState({ date:'', time:'', type:'', organizer_name:'', location:'', phone:'', assistance_type:'medical_1', image_url:'' });
  const [offerForm, setOfferForm] = useState({ member_id:'', event_id:'', event_date:'' });
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const toastRef   = useRef();
  const reactCh    = useRef(null);

  const canManage = user && CAN_MANAGE.includes(user.rank);

  useEffect(() => {
    const stored = sessionStorage.getItem('pr_user');
    if (!stored) { router.replace('/'); return; }
    const u = JSON.parse(stored);
    setUser(u);
    fetchEvents();
    fetchMembers();

    // Realtime events
    const ch = supabase.channel('events-rt')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'events' }, (p) => {
        setEvents(prev => [p.new, ...prev]);
      })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'events' }, (p) => {
        setEvents(prev => prev.map(e => e.id === p.new.id ? p.new : e));
        setOpenEvent(prev => prev?.id === p.new.id ? p.new : prev);
      })
      .on('postgres_changes', { event:'DELETE', schema:'public', table:'events' }, (p) => {
        setEvents(prev => prev.filter(e => e.id !== p.old.id));
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'members' }, (p) => {
        if (p.eventType === 'UPDATE') {
          const s2 = sessionStorage.getItem('pr_user');
          if (s2) {
            const ses = JSON.parse(s2);
            if (ses.discord_id === p.new.discord_id) {
              const upd = { ...ses, ...p.new };
              sessionStorage.setItem('pr_user', JSON.stringify(upd));
              setUser(upd);
            }
          }
        }
      })
      .subscribe();

    setLoading(false);
    return () => supabase.removeChannel(ch);
  }, []);

  // Realtime reactions when event open
  useEffect(() => {
    if (reactCh.current) { supabase.removeChannel(reactCh.current); reactCh.current = null; }
    if (!openEvent) return;
    const ch = supabase.channel(`reactions-${openEvent.id}`)
      .on('postgres_changes', {
        event:'*', schema:'public', table:'event_reactions',
        filter:`event_id=eq.${openEvent.id}`,
      }, () => fetchReactions(openEvent.id))
      .subscribe();
    reactCh.current = ch;
    return () => { supabase.removeChannel(ch); reactCh.current = null; };
  }, [openEvent?.id]);

  async function fetchEvents() {
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending:false });
    setEvents(data || []);
  }
  async function fetchMembers() {
    const { data } = await supabase.from('members').select('id, full_name, rank, callsign')
      .in('rank', ['Membru PR','Adjunct PR','Manager PR']).order('full_name');
    setMembers(data || []);
  }
  async function fetchReactions(eventId) {
    const { data } = await supabase.from('event_reactions').select('*')
      .eq('event_id', eventId).order('created_at', { ascending:true });
    setReactions(data || []);
  }

  async function openDetail(ev) {
    setOpenEvent(ev);
    await fetchReactions(ev.id);
  }

  function showToast(msg, type='success') {
    setToast({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function toggleReaction(reactionKey) {
    if (!openEvent || !user) return;
    const myReact = reactions.find(r => r.discord_id === user.discord_id);
    // Optimistic update
    if (myReact) {
      if (myReact.reaction === reactionKey) {
        setReactions(prev => prev.filter(r => r.discord_id !== user.discord_id));
      } else {
        setReactions(prev => prev.map(r =>
          r.discord_id === user.discord_id ? { ...r, reaction: reactionKey, created_at: new Date().toISOString() } : r
        ));
      }
    } else {
      setReactions(prev => [...prev, {
        id: 'tmp-'+Date.now(), event_id: openEvent.id,
        discord_id: user.discord_id, full_name: user.full_name,
        callsign: user.callsign||'', rank: user.rank,
        reaction: reactionKey, created_at: new Date().toISOString(),
      }]);
    }
    await fetch('/api/event-reactions', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ event_id:openEvent.id, discord_id:user.discord_id, full_name:user.full_name, callsign:user.callsign||'', rank:user.rank, reaction:reactionKey }),
    });
  }

  async function updateStatus(field, value) {
    if (!openEvent || !canManage) return;
    const now = new Date().toISOString();
    const patch = { id:openEvent.id, [field]:value, [`${field}_set_by`]:user.full_name, [`${field}_set_at`]:now };
    // Optimistic
    const updated = { ...openEvent, ...patch };
    setOpenEvent(updated);
    setEvents(prev => prev.map(e => e.id === openEvent.id ? updated : e));
    await fetch('/api/events', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(patch) });
  }

  async function submitEvent() {
    if (!form.date||!form.time||!form.type||!form.organizer_name||!form.location||!form.phone) {
      showToast('Completează toate câmpurile obligatorii.','error'); return;
    }
    setSaving(true);
    const res = await fetch('/api/events', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...form, responsible_callsign:user.callsign||'', responsible_name:user.full_name, responsible_rank:user.rank, created_by:user.full_name, event_status:'in_asteptare', financial_status:'neincasat' }),
    });
    if (res.ok) {
      showToast('Eveniment postat!');
      setPostModal(false);
      setForm({ date:'', time:'', type:'', organizer_name:'', location:'', phone:'', assistance_type:'medical_1', image_url:'' });
    } else showToast('Eroare la postare.','error');
    setSaving(false);
  }

  async function submitOffer() {
    if (!offerForm.member_id||!offerForm.event_id||!offerForm.event_date) {
      showToast('Completează toate câmpurile.','error'); return;
    }
    setSaving(true);
    const member = members.find(m => m.id === offerForm.member_id);
    const res = await fetch('/api/member-events', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ event_id:offerForm.event_id, member_id:offerForm.member_id, member_name:member?.full_name||'', event_date:offerForm.event_date, offered_by:user.full_name }),
    });
    if (res.ok) { showToast('Eveniment oferit!'); setOfferModal(false); setOfferForm({ member_id:'', event_id:'', event_date:'' }); }
    else showToast('Eroare.','error');
    setSaving(false);
  }

  return (
    <div className={styles.root}>
      <div className={styles.bg1}/><div className={styles.bg2}/><div className={styles.grid}/>
      <UserCard user={user} title="Evenimente"/>

      <main className={styles.main}>
        <div className={styles.topRow}>
          <div>
            <p className={styles.subText}>{events.length} evenimente înregistrate</p>
          </div>
          {canManage && (
            <div className={styles.actions}>
              <button className={styles.offerBtn} onClick={() => setOfferModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Oferă Eveniment
              </button>
              <button className={styles.postBtn} onClick={() => setPostModal(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Postează
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className={styles.loadState}><div className="cb-spinner"/></div>
        ) : events.length === 0 ? (
          <div className={styles.emptyState}><span>📋</span><p>Niciun eveniment postat încă.</p></div>
        ) : (
          <div className={styles.grid2}>
            {events.map((ev, i) => <EventCard key={ev.id} ev={ev} index={i} onClick={() => openDetail(ev)}/>)}
          </div>
        )}
      </main>

      {/* Detail modal */}
      {openEvent && (
        <div className={styles.overlay} onClick={() => setOpenEvent(null)}>
          <div className={styles.detailModal} onClick={e => e.stopPropagation()}>
            <div className={styles.dmTop}>
              <div className={styles.dmTopLeft}>
                <div className={styles.dmTitle}>{openEvent.type}</div>
                <div className={styles.dmMeta}>
                  📅 {new Date(openEvent.date).toLocaleDateString('ro-RO',{day:'numeric',month:'long',year:'numeric'})} · 🕐 {openEvent.time}
                </div>
                <div className={styles.dmBadges}>
                  {EV_STATUS.map(s => openEvent.event_status===s.key && (
                    <span key={s.key} className={styles.dmBadge} style={{ color:s.color, background:s.color+'14', borderColor:s.color+'44' }}>{s.label}</span>
                  ))}
                  {FIN_STATUS.map(s => openEvent.financial_status===s.key && (
                    <span key={s.key} className={styles.dmBadge} style={{ color:s.color, background:s.color+'14', borderColor:s.color+'44' }}>{s.label}</span>
                  ))}
                </div>
              </div>
              <button className={styles.dmClose} onClick={() => setOpenEvent(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.dmBody}>
              <div className={styles.dmInfoGrid}>
                {[
                  { label:'Organizator', val:openEvent.organizer_name },
                  { label:'Locație', val:openEvent.location },
                  { label:'Telefon', val:openEvent.phone },
                  { label:'Tip Asistență', val:`${ASSISTANCE[openEvent.assistance_type]?.icon} ${ASSISTANCE[openEvent.assistance_type]?.label}` },
                  { label:'Preț', val: <span style={{color:'#4ade80'}}>{ASSISTANCE[openEvent.assistance_type]?.price} · {ASSISTANCE[openEvent.assistance_type]?.extra}</span> },
                  { label:'Responsabil', val: <span>{openEvent.responsible_callsign && <span className={styles.csBadge}>{openEvent.responsible_callsign}</span>} {openEvent.responsible_name} <span style={{color:' var(--t3)',fontSize:11}}>{openEvent.responsible_rank}</span></span> },
                ].map(it => (
                  <div key={it.label} className={styles.dmInfoCard}>
                    <span className={styles.dmInfoLabel}>{it.label}</span>
                    <span className={styles.dmInfoVal}>{it.val}</span>
                  </div>
                ))}
              </div>
              {openEvent.image_url && <img src={openEvent.image_url} alt="Locație" className={styles.dmImg}/>}

              <StatusBlock title="Status Desfășurare" opts={EV_STATUS} current={openEvent.event_status} setBy={openEvent.event_status_set_by} setAt={openEvent.event_status_set_at} canEdit={canManage} onChange={v => updateStatus('event_status',v)}/>
              <StatusBlock title="Status Financiar" opts={FIN_STATUS} current={openEvent.financial_status} setBy={openEvent.financial_status_set_by} setAt={openEvent.financial_status_set_at} canEdit={canManage} onChange={v => updateStatus('financial_status',v)}/>

              <div className={styles.reactBlock}>
                <div className={styles.blockTitle}>Prezență Membri</div>
                <div className={styles.reactBtns}>
                  {REACTIONS.map(r => {
                    const myR   = reactions.find(rx => rx.discord_id === user?.discord_id);
                    const active= myR?.reaction === r.key;
                    const count = reactions.filter(rx => rx.reaction === r.key).length;
                    return (
                      <button key={r.key} className={`${styles.reactBtn} ${active?styles.reactActive:''}`} onClick={() => toggleReaction(r.key)}>
                        <span>{r.emoji}</span>
                        {count > 0 && <span className={styles.reactCount}>{count}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className={styles.reactLogs}>
                  {reactions.length === 0 && <div className={styles.empty}>Nicio reacție.</div>}
                  {reactions.map(rx => {
                    const rDef = REACTIONS.find(r => r.key === rx.reaction);
                    return (
                      <div key={rx.id} className={styles.reactLogRow}>
                        <span className={styles.reactEmoji}>{rDef?.emoji}</span>
                        <div className={styles.reactInfo}>
                          <span className={styles.reactName}>{rx.callsign && <span className={styles.csBadge}>{rx.callsign}</span>} {rx.full_name}</span>
                          <span className={styles.reactRank}>{rx.rank}</span>
                        </div>
                        <span className={styles.reactTime}>{new Date(rx.created_at).toLocaleString('ro-RO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post modal */}
      {postModal && (
        <div className={styles.overlay} onClick={() => setPostModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.mhead}><h3>Postează Eveniment</h3><button className={styles.mx} onClick={() => setPostModal(false)}>✕</button></div>
            <div className={styles.mform}>
              <Field label="Data *"><input type="date" className={styles.inp} value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></Field>
              <Field label="Ora *"><input type="time" className={styles.inp} value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></Field>
              <Field label="Tip Eveniment *"><input className={styles.inp} placeholder="ex: Nuntă..." value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}/></Field>
              <Field label="Organizator *"><input className={styles.inp} placeholder="Nume Prenume" value={form.organizer_name} onChange={e=>setForm(f=>({...f,organizer_name:e.target.value}))}/></Field>
              <Field label="Locație *"><input className={styles.inp} placeholder="Adresa" value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></Field>
              <Field label="Telefon *"><input className={styles.inp} placeholder="07xx..." value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></Field>
              <div className={styles.fullField}>
                <div className={styles.flabel}>Tip Asistență *</div>
                <div className={styles.assistGrid}>
                  {Object.entries(ASSISTANCE).map(([key,val]) => (
                    <button key={key} className={`${styles.assistCard} ${form.assistance_type===key?styles.assistActive:''}`} style={{'--c': key==='medical_1'?'#8b5cf6':'#6366f1'}} onClick={()=>setForm(f=>({...f,assistance_type:key}))}>
                      <span style={{fontSize:22}}>{val.icon}</span>
                      <div><div className={styles.assistLabel}>{val.label}</div><div className={styles.assistPrice}>{val.price}</div><div className={styles.assistExtra}>{val.extra}</div></div>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.fullField}>
                <div className={styles.flabel}>Responsabil</div>
                <div className={styles.respBox}>
                  {user?.callsign && <span className={styles.csBadge}>{user.callsign}</span>}
                  <span className={styles.respName}>{user?.full_name}</span>
                  <span className={styles.respRank}>{user?.rank}</span>
                </div>
              </div>
              <div className={styles.fullField}>
                <div className={styles.flabel}>URL Imagine <span className={styles.opt}>(opțional)</span></div>
                <input className={styles.inp} placeholder="https://..." value={form.image_url} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))}/>
              </div>
            </div>
            <div className={styles.mfoot}>
              <button className={styles.mcancel} onClick={()=>setPostModal(false)}>Anulează</button>
              <button className={styles.msave} onClick={submitEvent} disabled={saving}>{saving?'Se postează...':'✓ Postează'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Offer modal */}
      {offerModal && (
        <div className={styles.overlay} onClick={()=>setOfferModal(false)}>
          <div className={`${styles.modal} ${styles.modalSm}`} onClick={e=>e.stopPropagation()}>
            <div className={styles.mhead}><h3>Oferă Eveniment</h3><button className={styles.mx} onClick={()=>setOfferModal(false)}>✕</button></div>
            <div style={{display:'flex',flexDirection:'column',gap:13}}>
              <Field label="Eveniment"><select className={styles.sel} value={offerForm.event_id} onChange={e=>setOfferForm(f=>({...f,event_id:e.target.value}))}><option value="">-- Selectează --</option>{events.map(ev=><option key={ev.id} value={ev.id}>{ev.type} · {new Date(ev.date).toLocaleDateString('ro-RO')}</option>)}</select></Field>
              <Field label="Membru"><select className={styles.sel} value={offerForm.member_id} onChange={e=>setOfferForm(f=>({...f,member_id:e.target.value}))}><option value="">-- Selectează --</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name} · {m.rank}</option>)}</select></Field>
              <Field label="Data Participării"><input type="date" className={styles.inp} value={offerForm.event_date} onChange={e=>setOfferForm(f=>({...f,event_date:e.target.value}))}/></Field>
            </div>
            <div className={styles.mfoot}>
              <button className={styles.mcancel} onClick={()=>setOfferModal(false)}>Anulează</button>
              <button className={styles.msave} onClick={submitOffer} disabled={saving}>{saving?'Se salvează...':'Oferă'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`${styles.toast} ${toast.type==='error'?styles.toastErr:styles.toastOk}`}>{toast.msg}</div>}
    </div>
  );
}

function EventCard({ ev, index, onClick }) {
  const ast   = ASSISTANCE[ev.assistance_type];
  const evSt  = EV_STATUS.find(s => s.key === ev.event_status);
  const finSt = FIN_STATUS.find(s => s.key === ev.financial_status);
  return (
    <div className={styles.evCard} style={{ animationDelay:`${index*.04}s` }} onClick={onClick}>
      <div className={styles.evCardTop}>
        <span className={styles.evType}>{ev.type}</span>
        <div className={styles.evBadges}>
          {evSt  && <span className={styles.evBadge} style={{ color:evSt.color,  background:evSt.color+'14',  borderColor:evSt.color+'44'  }}>{evSt.label}</span>}
          {finSt && <span className={styles.evBadge} style={{ color:finSt.color, background:finSt.color+'14', borderColor:finSt.color+'44' }}>{finSt.label}</span>}
        </div>
      </div>
      <div className={styles.evRows}>
        <div className={styles.evRow}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>{new Date(ev.date).toLocaleDateString('ro-RO')} · {ev.time}</span></div>
        <div className={styles.evRow}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>{ev.location}</span></div>
        <div className={styles.evRow}><span style={{fontSize:13}}>{ast?.icon}</span><span>{ast?.label}</span></div>
      </div>
      <div className={styles.evFoot}>
        <span className={styles.evOrg}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{ev.organizer_name}</span>
        {ev.responsible_callsign && <span className={styles.csBadge}>{ev.responsible_callsign}</span>}
      </div>
    </div>
  );
}

function StatusBlock({ title, opts, current, setBy, setAt, canEdit, onChange }) {
  return (
    <div className={styles.statusBlock}>
      <div className={styles.blockTitle}>{title}</div>
      <div className={styles.statusBtns}>
        {opts.map(opt => (
          <button key={opt.key}
            className={`${styles.statusBtn} ${current===opt.key?styles.statusActive:''}`}
            style={current===opt.key?{color:opt.color,background:opt.color+'16',borderColor:opt.color+'55'}:{}}
            onClick={() => canEdit && onChange(opt.key)}
            disabled={!canEdit}>
            <span className={styles.sDot} style={{background:current===opt.key?opt.color:'rgba(255,255,255,.2)'}}/>
            {opt.label}
          </button>
        ))}
      </div>
      {setBy && setAt && (
        <div className={styles.sMeta}>Setat de <strong>{setBy}</strong> · {new Date(setAt).toLocaleString('ro-RO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <div className={styles.field}><div className={styles.flabel}>{label}</div>{children}</div>;
}
