'use client';

import { Suspense } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function CallbackInner() {
  const router    = useRouter();
  const params    = useSearchParams();
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = params.get('code');
    if (!code) { router.replace('/'); return; }

    fetch('/api/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error === 'not_whitelisted') { router.replace('/?denied=1'); return; }
        if (data.member) {
          sessionStorage.setItem('pr_user', JSON.stringify(data.member));
          router.replace('/hub');
          return;
        }
        router.replace('/?error=1');
      })
      .catch(() => router.replace('/?error=1'));
  }, []);

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      background:'#050308', gap:20,
    }}>
      <div className="cb-spinner"/>
      <p style={{ color:'#4A4560', fontSize:13, letterSpacing:'.5px', fontFamily:'var(--font-body)' }}>
        Se verifică accesul...
      </p>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#050308' }}>
        <div className="cb-spinner"/>
      </div>
    }>
      <CallbackInner/>
    </Suspense>
  );
}
