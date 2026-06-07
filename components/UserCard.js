'use client';
import { useRouter } from 'next/navigation';
import styles from './UserCard.module.css';

export default function UserCard({ user, backTo = '/hub' }) {
  const router = useRouter();

  function logout() {
    sessionStorage.removeItem('pr_user');
    router.replace('/');
  }

  if (!user) return null;

  return (
    <div className={styles.wrap}>
      {backTo && (
        <button className={styles.backBtn} onClick={() => router.push(backTo)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Înapoi
        </button>
      )}
      <div className={styles.card}>
        <img src={user.discord_avatar || '/logo_pr.png'} alt="" className={styles.avatar}/>
        <div className={styles.info}>
          <span className={styles.name}>{user.full_name}</span>
          <span className={styles.rank}>{user.rank}</span>
        </div>
        <button className={styles.logoutBtn} onClick={logout} title="Deconectare">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
