'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

type EntryFormState = {
  title: string;
  amount: string;
  recurrenceType: 'monthly' | 'one_time';
  startDate: string;
  endDate: string;
  dueDay: string;
  blockType: '10' | '25';
  isActive: boolean;
};

type ObligationFormState = {
  title: string;
  amount: string;
  type: 'fixa' | 'unica' | 'parcelada';
  recurrenceType: 'monthly' | 'one_time';
  totalInstallments: string;
  startDate: string;
  endDate: string;
  dueDay: string;
  blockType: '10' | '25';
  isActive: boolean;
};

type EntryRow = {
  amount: number;
  recurrence_type: 'monthly' | 'one_time';
  start_date: string;
  end_date: string | null;
  block_type: '10' | '25';
};

type ObligationRow = {
  amount: number;
  type: 'fixa' | 'unica' | 'parcelada';
  recurrence_type: 'monthly' | 'one_time';
  total_installments: number | null;
  start_date: string;
  end_date: string | null;
  block_type: '10' | '25';
};

type BlockProjection = {
  entries: number;
  obligations: number;
  balance: number;
};

type ProjectionMonth = {
  key: string;
  label: string;
  totalEntries: number;
  totalObligations: number;
  balance: number;
  block10: BlockProjection;
  block25: BlockProjection;
};

const PROJECTION_MONTHS = 6;

const initialEntryForm: EntryFormState = {
  title: '',
  amount: '',
  recurrenceType: 'monthly',
  startDate: '',
  endDate: '',
  dueDay: '',
  blockType: '10',
  isActive: true
};

const initialObligationForm: ObligationFormState = {
  title: '',
  amount: '',
  type: 'fixa',
  recurrenceType: 'monthly',
  totalInstallments: '',
  startDate: '',
  endDate: '',
  dueDay: '',
  blockType: '10',
  isActive: true
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);


const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1);

const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);


const isMonthInRange = (target: Date, startDate: string, endDate?: string | null) => {
  const startMonth = getMonthStart(new Date(startDate));
  const endMonth = endDate ? getMonthStart(new Date(endDate)) : null;

  if (target < startMonth) {
    return false;
  }

  if (endMonth && target > endMonth) {
    return false;
  }

  return true;
};

const monthDiff = (startDate: string, target: Date) => {
  const start = getMonthStart(new Date(startDate));
  return (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
};


const getMonthStatus = (balance: number) => {
  if (balance > 0) {
    return 'positivo';
  }

  if (balance < 0) {
    return 'negativo';
  }

  return 'apertado';
};

const getBlockStatus = (balance: number) => {
  if (balance > 0) {
    return 'bloco saudável';
  }

  if (balance < 0) {
    return 'bloco negativo';
  }

  return 'bloco apertado';
};


export default function HomePage() {
  const router = useRouter();

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isCreatingFamily, setIsCreatingFamily] = useState(false);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isSavingObligation, setIsSavingObligation] = useState(false);
  const [isLoadingProjectionData, setIsLoadingProjectionData] = useState(false);



  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [hasFamilyMembership, setHasFamilyMembership] = useState(false);

  const [projectionViewMode, setProjectionViewMode] = useState<'monthly' | 'blocks'>('monthly');


  const [projectionViewMode, setProjectionViewMode] = useState<'monthly' | 'blocks'>('monthly');


  const [entryForm, setEntryForm] = useState<EntryFormState>(initialEntryForm);
  const [obligationForm, setObligationForm] = useState<ObligationFormState>(initialObligationForm);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [obligations, setObligations] = useState<ObligationRow[]>([]);
  const [error, setError] = useState('');
  const [entrySuccessMessage, setEntrySuccessMessage] = useState('');
  const [obligationSuccessMessage, setObligationSuccessMessage] = useState('');

  const loadFinancialData = async (currentFamilyId: string) => {
    setIsLoadingProjectionData(true);

    const [{ data: entriesData, error: entriesError }, { data: obligationsData, error: obligationsError }] =
      await Promise.all([
        supabase
          .from('entries')
          .select('amount, recurrence_type, start_date, end_date, block_type')
          .eq('family_id', currentFamilyId)
          .eq('is_active', true),
        supabase
          .from('obligations')
          .select('amount, type, recurrence_type, total_installments, start_date, end_date, block_type')
          .eq('family_id', currentFamilyId)
          .eq('is_active', true)
      ]);

    if (entriesError || obligationsError) {
      setError('Não foi possível carregar os dados para projeção mensal.');
      setIsLoadingProjectionData(false);
      return;
    }

    setEntries((entriesData ?? []) as EntryRow[]);
    setObligations((obligationsData ?? []) as ObligationRow[]);
    setIsLoadingProjectionData(false);
  };

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

      if (familyMember?.family_id) {
        setFamilyId(familyMember.family_id);
        setHasFamilyMembership(true);
        await loadFinancialData(familyMember.family_id);
      }

      setIsCheckingSession(false);
    };

    void checkSessionAndFamily();
  }, [router]);

  const projection = useMemo<ProjectionMonth[]>(() => {
    const nowMonth = getMonthStart(new Date());

    return Array.from({ length: PROJECTION_MONTHS }, (_, index) => {
      const currentMonth = addMonths(nowMonth, index);
      const monthLabel = currentMonth.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      });

      let totalEntries = 0;
      let totalObligations = 0;
      let block10Entries = 0;
      let block10Obligations = 0;
      let block25Entries = 0;
      let block25Obligations = 0;

      entries.forEach((entry) => {
        const shouldIncludeEntry =
          entry.recurrence_type === 'one_time'
            ? monthDiff(entry.start_date, currentMonth) === 0
            : isMonthInRange(currentMonth, entry.start_date, entry.end_date);

        if (!shouldIncludeEntry) {
          return;
        }

        const amount = Number(entry.amount);
        totalEntries += amount;

        if (entry.block_type === '10') {
          block10Entries += amount;
        } else {
          block25Entries += amount;
        }
      });

      obligations.forEach((obligation) => {
        let shouldIncludeObligation = false;

        if (obligation.type === 'unica') {
          shouldIncludeObligation = monthDiff(obligation.start_date, currentMonth) === 0;
        } else if (obligation.type === 'parcelada') {
          const installments = obligation.total_installments ?? 0;
          const diff = monthDiff(obligation.start_date, currentMonth);



          shouldIncludeObligation =
            installments > 0 &&
            diff >= 0 &&
            diff < installments &&
            isMonthInRange(currentMonth, obligation.start_date, obligation.end_date);
        } else {

          shouldIncludeObligation = isMonthInRange(currentMonth, obligation.start_date, obligation.end_date);

          shouldIncludeObligation = isMonthInRange(
            currentMonth,
            obligation.start_date,
            obligation.end_date
          );

        }

        if (!shouldIncludeObligation) {
          return;
        }

        const amount = Number(obligation.amount);
        totalObligations += amount;

        if (obligation.block_type === '10') {
          block10Obligations += amount;
        } else {
          block25Obligations += amount;
        }
      });

      return {
        key: `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`,
        label: monthLabel,
        totalEntries,
        totalObligations,
        balance: totalEntries - totalObligations,
        block10: {
          entries: block10Entries,
          obligations: block10Obligations,
          balance: block10Entries - block10Obligations
        },
        block25: {
          entries: block25Entries,
          obligations: block25Obligations,
          balance: block25Entries - block25Obligations
        }
      };
    });
  }, [entries, obligations]);

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

    setFamilyId(newFamily.id);
    setHasFamilyMembership(true);
    setIsCreatingFamily(false);
    await loadFinancialData(newFamily.id);
  };

  const handleCreateEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setEntrySuccessMessage('');
    setIsSavingEntry(true);

    const { error: createEntryError } = await supabase.from('entries').insert({
      family_id: familyId,
      title: entryForm.title.trim(),
      amount: Number(entryForm.amount),
      recurrence_type: entryForm.recurrenceType,
      start_date: entryForm.startDate,
      end_date: entryForm.endDate || null,
      due_day: Number(entryForm.dueDay),
      block_type: entryForm.blockType,
      is_active: entryForm.isActive,
      created_by: userId
    });

    if (createEntryError) {
      setError('Não foi possível cadastrar a entrada.');
      setIsSavingEntry(false);
      return;
    }

    setEntryForm(initialEntryForm);
    setEntrySuccessMessage('Entrada cadastrada com sucesso.');
    setIsSavingEntry(false);
    await loadFinancialData(familyId);
  };

  const handleCreateObligation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setObligationSuccessMessage('');
    setIsSavingObligation(true);

    const installments =
      obligationForm.type === 'parcelada' ? Number(obligationForm.totalInstallments) : null;

    const { error: createObligationError } = await supabase.from('obligations').insert({
      family_id: familyId,
      title: obligationForm.title.trim(),
      amount: Number(obligationForm.amount),
      type: obligationForm.type,
      recurrence_type: obligationForm.recurrenceType,
      total_installments: installments,
      start_date: obligationForm.startDate,
      end_date: obligationForm.endDate || null,
      due_day: Number(obligationForm.dueDay),
      block_type: obligationForm.blockType,
      is_active: obligationForm.isActive,
      created_by: userId
    });

    if (createObligationError) {
      setError('Não foi possível cadastrar a despesa.');
      setIsSavingObligation(false);
      return;
    }

    setObligationForm(initialObligationForm);
    setObligationSuccessMessage('Despesa cadastrada com sucesso.');
    setIsSavingObligation(false);
    await loadFinancialData(familyId);
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

      <section>
        <h2>Projeção mensal básica</h2>



        <div>
          <button type="button" onClick={() => setProjectionViewMode('monthly')}>
            Visão do mês
          </button>
          <button type="button" onClick={() => setProjectionViewMode('blocks')}>
            Visão por blocos
          </button>
        </div>

        {isLoadingProjectionData ? <p>Carregando projeção...</p> : null}

        {!isLoadingProjectionData && projectionViewMode === 'monthly' ? (
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Entradas</th>
                <th>Despesas</th>
                <th>Saldo previsto</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((month) => (
                <tr key={month.key}>
                  <td>{month.label}</td>
                  <td>{currencyFormatter.format(month.totalEntries)}</td>
                  <td>{currencyFormatter.format(month.totalObligations)}</td>
                  <td>{currencyFormatter.format(month.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {!isLoadingProjectionData && projectionViewMode === 'blocks' ? (
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Entradas bloco 10</th>
                <th>Despesas bloco 10</th>
                <th>Saldo bloco 10</th>
                <th>Entradas bloco 25</th>
                <th>Despesas bloco 25</th>
                <th>Saldo bloco 25</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((month) => (
                <tr key={month.key}>
                  <td>{month.label}</td>
                  <td>{currencyFormatter.format(month.block10.entries)}</td>
                  <td>{currencyFormatter.format(month.block10.obligations)}</td>
                  <td>{currencyFormatter.format(month.block10.balance)}</td>
                  <td>{currencyFormatter.format(month.block25.entries)}</td>
                  <td>{currencyFormatter.format(month.block25.obligations)}</td>
                  <td>{currencyFormatter.format(month.block25.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}


        {!isLoadingProjectionData ? (
          <section>
            <h3>Resumos mensais</h3>
            {projection.map((month) => (
              <article key={`summary-${month.key}`}>
                <h4>{month.label}</h4>
                <p>Total de entradas previstas: {currencyFormatter.format(month.totalEntries)}</p>
                <p>Total de despesas previstas: {currencyFormatter.format(month.totalObligations)}</p>
                <p>Saldo previsto: {currencyFormatter.format(month.balance)}</p>
                <p>Total do bloco 10: {currencyFormatter.format(month.block10.balance)}</p>
                <p>Total do bloco 25: {currencyFormatter.format(month.block25.balance)}</p>
                <p>Status do mês: {getMonthStatus(month.balance)}</p>
                <p>Status bloco 10: {getBlockStatus(month.block10.balance)}</p>
                <p>Status bloco 25: {getBlockStatus(month.block25.balance)}</p>
              </article>
            ))}
          </section>
        ) : null}

      </section>

      <section>
        <h2>Cadastrar entrada</h2>
        <form onSubmit={handleCreateEntry}>
          <div>
            <label htmlFor="entryTitle">Título</label>
            <input
              id="entryTitle"
              type="text"
              value={entryForm.title}
              onChange={(event) => setEntryForm({ ...entryForm, title: event.target.value })}
              required
            />
          </div>

          <div>
            <label htmlFor="entryAmount">Valor</label>
            <input
              id="entryAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={entryForm.amount}
              onChange={(event) => setEntryForm({ ...entryForm, amount: event.target.value })}
              required
            />
          </div>

          <div>
            <label htmlFor="entryRecurrenceType">Recorrência</label>
            <select
              id="entryRecurrenceType"
              value={entryForm.recurrenceType}
              onChange={(event) =>
                setEntryForm({
                  ...entryForm,
                  recurrenceType: event.target.value as EntryFormState['recurrenceType']
                })
              }
            >
              <option value="monthly">Mensal</option>
              <option value="one_time">Avulsa</option>
            </select>
          </div>

          <div>
            <label htmlFor="entryStartDate">Data inicial</label>
            <input
              id="entryStartDate"
              type="date"
              value={entryForm.startDate}
              onChange={(event) => setEntryForm({ ...entryForm, startDate: event.target.value })}
              required
            />
          </div>

          <div>
            <label htmlFor="entryEndDate">Data final (opcional)</label>
            <input
              id="entryEndDate"
              type="date"
              value={entryForm.endDate}
              onChange={(event) => setEntryForm({ ...entryForm, endDate: event.target.value })}
            />
          </div>

          <div>
            <label htmlFor="entryDueDay">Dia de vencimento</label>
            <input
              id="entryDueDay"
              type="number"
              min="1"
              max="31"
              value={entryForm.dueDay}
              onChange={(event) => setEntryForm({ ...entryForm, dueDay: event.target.value })}
              required
            />
          </div>

          <div>
            <label htmlFor="entryBlockType">Bloco financeiro</label>
            <select
              id="entryBlockType"
              value={entryForm.blockType}
              onChange={(event) =>
                setEntryForm({
                  ...entryForm,
                  blockType: event.target.value as EntryFormState['blockType']
                })
              }
            >
              <option value="10">10</option>
              <option value="25">25</option>
            </select>
          </div>

          <div>
            <label htmlFor="entryIsActive">Ativo</label>
            <input
              id="entryIsActive"
              type="checkbox"
              checked={entryForm.isActive}
              onChange={(event) => setEntryForm({ ...entryForm, isActive: event.target.checked })}
            />
          </div>

          <button type="submit" disabled={isSavingEntry}>
            {isSavingEntry ? 'Salvando entrada...' : 'Salvar entrada'}
          </button>
        </form>
        {entrySuccessMessage ? <p>{entrySuccessMessage}</p> : null}
      </section>

      <section>
        <h2>Cadastrar despesa</h2>
        <form onSubmit={handleCreateObligation}>
          <div>
            <label htmlFor="obligationTitle">Título</label>
            <input
              id="obligationTitle"
              type="text"
              value={obligationForm.title}
              onChange={(event) =>
                setObligationForm({ ...obligationForm, title: event.target.value })
              }
              required
            />
          </div>

          <div>
            <label htmlFor="obligationAmount">Valor</label>
            <input
              id="obligationAmount"
              type="number"
              step="0.01"
              min="0.01"
              value={obligationForm.amount}
              onChange={(event) =>
                setObligationForm({ ...obligationForm, amount: event.target.value })
              }
              required
            />
          </div>

          <div>
            <label htmlFor="obligationType">Tipo</label>
            <select
              id="obligationType"
              value={obligationForm.type}
              onChange={(event) =>
                setObligationForm({
                  ...obligationForm,
                  type: event.target.value as ObligationFormState['type'],

                  totalInstallments: event.target.value === 'parcelada' ? obligationForm.totalInstallments : ''

                  totalInstallments:
                    event.target.value === 'parcelada' ? obligationForm.totalInstallments : ''

                })
              }
            >
              <option value="fixa">Fixa</option>
              <option value="unica">Única</option>
              <option value="parcelada">Parcelada</option>
            </select>
          </div>

          {obligationForm.type === 'parcelada' ? (
            <div>
              <label htmlFor="obligationInstallments">Total de parcelas</label>
              <input
                id="obligationInstallments"
                type="number"
                min="1"
                value={obligationForm.totalInstallments}
                onChange={(event) =>
                  setObligationForm({ ...obligationForm, totalInstallments: event.target.value })
                }
                required
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="obligationRecurrenceType">Recorrência</label>
            <select
              id="obligationRecurrenceType"
              value={obligationForm.recurrenceType}
              onChange={(event) =>
                setObligationForm({
                  ...obligationForm,
                  recurrenceType: event.target.value as ObligationFormState['recurrenceType']
                })
              }
            >
              <option value="monthly">Mensal</option>
              <option value="one_time">Avulsa</option>
            </select>
          </div>

          <div>
            <label htmlFor="obligationStartDate">Data inicial</label>
            <input
              id="obligationStartDate"
              type="date"
              value={obligationForm.startDate}
              onChange={(event) =>
                setObligationForm({ ...obligationForm, startDate: event.target.value })
              }
              required
            />
          </div>

          <div>
            <label htmlFor="obligationEndDate">Data final (opcional)</label>
            <input
              id="obligationEndDate"
              type="date"
              value={obligationForm.endDate}

              onChange={(event) => setObligationForm({ ...obligationForm, endDate: event.target.value })}

              onChange={(event) =>
                setObligationForm({ ...obligationForm, endDate: event.target.value })
              }

            />
          </div>

          <div>
            <label htmlFor="obligationDueDay">Dia de vencimento</label>
            <input
              id="obligationDueDay"
              type="number"
              min="1"
              max="31"
              value={obligationForm.dueDay}
              onChange={(event) => setObligationForm({ ...obligationForm, dueDay: event.target.value })}
              required
            />
          </div>

          <div>
            <label htmlFor="obligationBlockType">Bloco financeiro</label>
            <select
              id="obligationBlockType"
              value={obligationForm.blockType}
              onChange={(event) =>
                setObligationForm({
                  ...obligationForm,
                  blockType: event.target.value as ObligationFormState['blockType']
                })
              }
            >
              <option value="10">10</option>
              <option value="25">25</option>
            </select>
          </div>

          <div>
            <label htmlFor="obligationIsActive">Ativo</label>
            <input
              id="obligationIsActive"
              type="checkbox"
              checked={obligationForm.isActive}
              onChange={(event) =>
                setObligationForm({ ...obligationForm, isActive: event.target.checked })
              }
            />
          </div>

          <button type="submit" disabled={isSavingObligation}>
            {isSavingObligation ? 'Salvando despesa...' : 'Salvar despesa'}
          </button>
        </form>
        {obligationSuccessMessage ? <p>{obligationSuccessMessage}</p> : null}
      </section>

      <button type="button" onClick={handleLogout}>
        Sair
      </button>

      {error ? <p>{error}</p> : null}
    </main>
  );
}
