'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isCreatingFamily, setIsCreatingFamily] = useState(false);
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [hasFamilyMembership, setHasFamilyMembership] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkSessionAndFamily = async () => {
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

      const authenticatedUser = data.session.user;
      setUserId(authenticatedUser.id);
      setUserEmail(authenticatedUser.email ?? '');

      const { data: familyMember, error: familyMembershipError } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', authenticatedUser.id)
        .limit(1)
        .maybeSingle();

      if (familyMembershipError) {
        setError('Não foi possível verificar o vínculo familiar.');
        setIsCheckingSession(false);
        return;
      }

      setHasFamilyMembership(Boolean(familyMember));
      setIsCheckingSession(false);
    };

    void checkSessionAndFamily();
  }, [router]);

  const handleCreateFamily = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsCreatingFamily(true);

    const trimmedFamilyName = familyName.trim();

    const { data: newFamily, error: createFamilyError } = await supabase
      .from('families')
      .insert({
        name: trimmedFamilyName,
        created_by: userId
      })
      .select('id')
      .single();

    if (createFamilyError) {
      setError('Não foi possível criar a família.');
      setIsCreatingFamily(false);
      return;
    }

    const { error: createFamilyMemberError } = await supabase.from('family_members').insert({
      family_id: newFamily.id,
      user_id: userId,
      role: 'admin'
    });

    if (createFamilyMemberError) {
      setError('Família criada, mas não foi possível criar o vínculo familiar.');
      setIsCreatingFamily(false);
      return;
    }

    setHasFamilyMembership(true);
    setIsCreatingFamily(false);
  };

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

  if (!hasFamilyMembership) {
    return (
      <main>
        <h1>Casa em Dia</h1>
        <p>Vamos criar sua primeira família.</p>

        <form onSubmit={handleCreateFamily}>
          <div>
            <label htmlFor="familyName">Nome da família</label>
            <input
              id="familyName"
              type="text"
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={isCreatingFamily}>
            {isCreatingFamily ? 'Criando...' : 'Criar família'}
          </button>
        </form>

        {error ? <p>{error}</p> : null}
      </main>
    );
  }

  return (
    <main>
      <h1>Casa em Dia</h1>
      <p>Você está autenticado e já possui vínculo com uma família.</p>
      {userEmail ? <p>Usuário: {userEmail}</p> : null}
      <button type="button" onClick={handleLogout}>
        Sair
      </button>
      {error ? <p>{error}</p> : null}
    </main>
  );
}
