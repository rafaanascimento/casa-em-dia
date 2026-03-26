'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setError('Não foi possível verificar a sessão.');
        setIsCheckingSession(false);
        return;
      }

      if (!data.session) {
        router.replace('/login');
        return;
      }

      setUserEmail(data.session.user.email ?? '');
      setIsCheckingSession(false);
    };

    void checkSession();
  }, [router]);

  const handleLogout = async () => {
    setError('');

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError('Não foi possível sair da conta.');
      return;
    }

    router.replace('/login');
  };

  if (isCheckingSession) {
    return (
      <main>
        <h1>Casa em Dia</h1>
        <p>Verificando sessão...</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Casa em Dia</h1>
      <p>Você está autenticado.</p>
      {userEmail ? <p>Usuário: {userEmail}</p> : null}
      <button type="button" onClick={handleLogout}>
        Sair
      </button>
      {error ? <p>{error}</p> : null}
    </main>
  );
}
