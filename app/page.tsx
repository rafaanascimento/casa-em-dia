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
  id: string;
  title: string;
  amount: number;
  recurrence_type: 'monthly' | 'one_time';
  start_date: string;
  end_date: string | null;
  block_type: '10' | '25';
};

type ObligationRow = {
  id: string;
  title: string;
  amount: number;
  type: 'fixa' | 'unica' | 'parcelada';
  recurrence_type: 'monthly' | 'one_time';
  total_installments: number | null;
  start_date: string;
  end_date: string | null;
  block_type: '10' | '25';
};

type EntryListRow = {
  id: string;
  title: string;
  amount: number;
  recurrence_type: 'monthly' | 'one_time';
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  block_type: '10' | '25';
  is_active: boolean;
};

type ObligationListRow = {
  id: string;
  title: string;
  amount: number;
  type: 'fixa' | 'unica' | 'parcelada';
  recurrence_type: 'monthly' | 'one_time';
  total_installments: number | null;
  start_date: string;
  end_date: string | null;
  due_day: number | null;
  block_type: '10' | '25';
  is_active: boolean;
};

type MonthlyOccurrenceRow = {
  family_id: string;
  source_type: 'entry' | 'obligation' | 'entries' | 'obligations';
  source_id: string;
  month_key: string;
  title: string;
  amount: number;
  block_type: '10' | '25';
  status: 'pending' | 'received' | 'paid';
  processed_at: string | null;
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

const doesEntryApplyToMonth = (entry: EntryRow, currentMonth: Date) => {
  if (entry.recurrence_type === 'one_time') {
    return monthDiff(entry.start_date, currentMonth) === 0;
  }

  return isMonthInRange(currentMonth, entry.start_date, entry.end_date);
};

const doesObligationApplyToMonth = (obligation: ObligationRow, currentMonth: Date) => {
  if (obligation.type === 'unica') {
    return monthDiff(obligation.start_date, currentMonth) === 0;
  }

  if (obligation.type === 'parcelada') {
    const installments = obligation.total_installments ?? 0;
    const diff = monthDiff(obligation.start_date, currentMonth);

    return (
      installments > 0 &&
      diff >= 0 &&
      diff < installments &&
      isMonthInRange(currentMonth, obligation.start_date, obligation.end_date)
    );
  }

  return isMonthInRange(currentMonth, obligation.start_date, obligation.end_date);
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

const getMonthAlerts = (month: ProjectionMonth) => {
  const alerts: string[] = [];

  if (month.balance < 0) {
    alerts.push('Mês negativo');
  } else if (month.balance === 0) {
    alerts.push('Mês apertado');
  }

  if (month.block10.balance < 0) {
    alerts.push('Bloco 10 negativo');
  } else if (month.block10.balance === 0) {
    alerts.push('Bloco 10 apertado');
  }

  if (month.block25.balance < 0) {
    alerts.push('Bloco 25 negativo');
  } else if (month.block25.balance === 0) {
    alerts.push('Bloco 25 apertado');
  }

  return alerts;
};

const normalizeSourceType = (sourceType: string) => {
  if (sourceType === 'entries') {
    return 'entry';
  }

  if (sourceType === 'obligations') {
    return 'obligation';
  }

  return sourceType;
};

const normalizeMonthKey = (monthKey: string) => monthKey.slice(0, 7);

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
  const [entryForm, setEntryForm] = useState<EntryFormState>(initialEntryForm);
  const [obligationForm, setObligationForm] = useState<ObligationFormState>(initialObligationForm);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [obligations, setObligations] = useState<ObligationRow[]>([]);
  const [entryList, setEntryList] = useState<EntryListRow[]>([]);
  const [obligationList, setObligationList] = useState<ObligationListRow[]>([]);
  const [monthlyOccurrences, setMonthlyOccurrences] = useState<MonthlyOccurrenceRow[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingObligationId, setEditingObligationId] = useState<string | null>(null);
  const [editingEntryForm, setEditingEntryForm] = useState<EntryFormState>(initialEntryForm);
  const [editingObligationForm, setEditingObligationForm] = useState<ObligationFormState>(initialObligationForm);
  const [isUpdatingEntry, setIsUpdatingEntry] = useState(false);
  const [isUpdatingObligation, setIsUpdatingObligation] = useState(false);
  const [isUpdatingOccurrenceKey, setIsUpdatingOccurrenceKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [entrySuccessMessage, setEntrySuccessMessage] = useState('');
  const [obligationSuccessMessage, setObligationSuccessMessage] = useState('');

  const loadFinancialData = async (currentFamilyId: string) => {
    setIsLoadingProjectionData(true);

    const [
      { data: entriesData, error: entriesError },
      { data: obligationsData, error: obligationsError },
      { data: entriesListData, error: entriesListError },
      { data: obligationsListData, error: obligationsListError },
      { data: occurrencesData, error: occurrencesError }
    ] = await Promise.all([
        supabase
          .from('entries')
          .select('id, title, amount, recurrence_type, start_date, end_date, block_type')
          .eq('family_id', currentFamilyId)
          .eq('is_active', true),
        supabase
          .from('obligations')
          .select('id, title, amount, type, recurrence_type, total_installments, start_date, end_date, block_type')
          .eq('family_id', currentFamilyId)
          .eq('is_active', true),
        supabase
          .from('entries')
          .select('id, title, amount, recurrence_type, start_date, end_date, due_day, block_type, is_active')
          .eq('family_id', currentFamilyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('obligations')
          .select(
            'id, title, amount, type, recurrence_type, total_installments, start_date, end_date, due_day, block_type, is_active'
          )
          .eq('family_id', currentFamilyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('monthly_occurrences')
          .select('family_id, source_type, source_id, month_key, title, amount, block_type, status, processed_at')
          .eq('family_id', currentFamilyId)
      ]);

    if (entriesError || obligationsError || entriesListError || obligationsListError || occurrencesError) {
      setError('Não foi possível carregar os dados para projeção mensal.');
      setIsLoadingProjectionData(false);
      return;
    }

    setEntries((entriesData ?? []) as EntryRow[]);
    setObligations((obligationsData ?? []) as ObligationRow[]);
    setEntryList((entriesListData ?? []) as EntryListRow[]);
    setObligationList((obligationsListData ?? []) as ObligationListRow[]);
    const normalizedOccurrences = ((occurrencesData ?? []) as MonthlyOccurrenceRow[]).map((occurrence) => ({
      ...occurrence,
      source_type: normalizeSourceType(occurrence.source_type) as MonthlyOccurrenceRow['source_type'],
      month_key: normalizeMonthKey(occurrence.month_key)
    }));

    setMonthlyOccurrences(normalizedOccurrences);
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
        const shouldIncludeEntry = doesEntryApplyToMonth(entry, currentMonth);

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
        const shouldIncludeObligation = doesObligationApplyToMonth(obligation, currentMonth);

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

  const nextMonthAlertsByKey = useMemo(() => {
    const alertsMap = new Map<string, string[]>();

    projection.forEach((currentMonth, index) => {
      const nextMonth = projection[index + 1];

      if (!nextMonth) {
        alertsMap.set(currentMonth.key, []);
        return;
      }

      const alerts: string[] = [];

      if (nextMonth.totalObligations < currentMonth.totalObligations) {
        alerts.push('Próximo mês mais leve');
      } else if (nextMonth.totalObligations > currentMonth.totalObligations) {
        alerts.push('Próximo mês mais pesado');
      }

      if (nextMonth.balance > currentMonth.balance) {
        alerts.push('Saldo melhora no próximo mês');
      } else if (nextMonth.balance < currentMonth.balance) {
        alerts.push('Saldo piora no próximo mês');
      }

      const [currentYear, currentMonthNumber] = currentMonth.key.split('-').map(Number);
      const [nextYear, nextMonthNumber] = nextMonth.key.split('-').map(Number);
      const currentDate = new Date(currentYear, currentMonthNumber - 1, 1);
      const nextDate = new Date(nextYear, nextMonthNumber - 1, 1);

      const currentObligationIds = new Set(
        obligations.filter((obligation) => doesObligationApplyToMonth(obligation, currentDate)).map((item) => item.id)
      );
      const nextObligationIds = new Set(
        obligations.filter((obligation) => doesObligationApplyToMonth(obligation, nextDate)).map((item) => item.id)
      );

      const expenseEnded = [...currentObligationIds].some((id) => !nextObligationIds.has(id));
      const expenseStarted = [...nextObligationIds].some((id) => !currentObligationIds.has(id));

      if (expenseEnded) {
        alerts.push('Uma despesa deixa de existir no mês seguinte');
      }

      if (expenseStarted) {
        alerts.push('Uma nova despesa começa a aparecer no mês seguinte');
      }

      alertsMap.set(currentMonth.key, alerts);
    });

    return alertsMap;
  }, [projection, obligations]);

  const monthDetailsByKey = useMemo(() => {
    const detailsMap = new Map<
      string,
      {
        entries: EntryRow[];
        obligations: ObligationRow[];
      }
    >();

    projection.forEach((month) => {
      const [year, monthNumber] = month.key.split('-').map(Number);
      const currentDate = new Date(year, monthNumber - 1, 1);

      const monthEntries = entries.filter((entry) => doesEntryApplyToMonth(entry, currentDate));
      const monthObligations = obligations.filter((obligation) =>
        doesObligationApplyToMonth(obligation, currentDate)
      );

      detailsMap.set(month.key, {
        entries: monthEntries,
        obligations: monthObligations
      });
    });

    return detailsMap;
  }, [projection, entries, obligations]);

  const getOccurrence = (sourceType: 'entry' | 'obligation', sourceId: string, monthKey: string) =>
    monthlyOccurrences.find(
      (occurrence) =>
        occurrence.family_id === familyId &&
        normalizeSourceType(occurrence.source_type) === sourceType &&
        occurrence.source_id === sourceId &&
        normalizeMonthKey(occurrence.month_key) === normalizeMonthKey(monthKey)
    );

  const handleSetOccurrenceStatus = async (
    sourceType: 'entry' | 'obligation',
    sourceId: string,
    monthKey: string,
    title: string,
    amount: number,
    blockType: '10' | '25',
    status: 'received' | 'paid'
  ) => {
    const occurrenceKey = `${sourceType}-${sourceId}-${monthKey}`;
    setError('');
    setIsUpdatingOccurrenceKey(occurrenceKey);

    const { error: upsertError } = await supabase.from('monthly_occurrences').upsert(
      {
        family_id: familyId,
        source_type: sourceType,
        source_id: sourceId,
        month_key: normalizeMonthKey(monthKey),
        title,
        amount,
        block_type: blockType,
        status,
        processed_at: new Date().toISOString()
      },
      {
        onConflict: 'family_id,source_type,source_id,month_key'
      }
    );

    if (upsertError) {
      setError('Não foi possível atualizar o status mensal do lançamento.');
      setIsUpdatingOccurrenceKey(null);
      return;
    }

    setMonthlyOccurrences((previous) => {
      const normalizedMonthKey = normalizeMonthKey(monthKey);
      const updatedOccurrence: MonthlyOccurrenceRow = {
        family_id: familyId,
        source_type: sourceType,
        source_id: sourceId,
        month_key: normalizedMonthKey,
        title,
        amount,
        block_type: blockType,
        status,
        processed_at: new Date().toISOString()
      };

      const withoutCurrent = previous.filter(
        (occurrence) =>
          !(
            occurrence.family_id === familyId &&
            normalizeSourceType(occurrence.source_type) === sourceType &&
            occurrence.source_id === sourceId &&
            normalizeMonthKey(occurrence.month_key) === normalizedMonthKey
          )
      );

      return [...withoutCurrent, updatedOccurrence];
    });

    setIsUpdatingOccurrenceKey(null);
    await loadFinancialData(familyId);
  };

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

  const handleStartEditEntry = (entryItem: EntryListRow) => {
    setEditingEntryId(entryItem.id);
    setEditingEntryForm({
      title: entryItem.title,
      amount: String(entryItem.amount),
      recurrenceType: entryItem.recurrence_type,
      startDate: entryItem.start_date,
      endDate: entryItem.end_date ?? '',
      dueDay: entryItem.due_day ? String(entryItem.due_day) : '',
      blockType: entryItem.block_type,
      isActive: entryItem.is_active
    });
  };

  const handleUpdateEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingEntryId) {
      return;
    }

    setError('');
    setIsUpdatingEntry(true);

    const { error: updateEntryError } = await supabase
      .from('entries')
      .update({
        title: editingEntryForm.title.trim(),
        amount: Number(editingEntryForm.amount),
        recurrence_type: editingEntryForm.recurrenceType,
        start_date: editingEntryForm.startDate,
        end_date: editingEntryForm.endDate || null,
        due_day: Number(editingEntryForm.dueDay),
        block_type: editingEntryForm.blockType,
        is_active: editingEntryForm.isActive
      })
      .eq('id', editingEntryId)
      .eq('family_id', familyId);

    if (updateEntryError) {
      setError('Não foi possível atualizar a entrada.');
      setIsUpdatingEntry(false);
      return;
    }

    setEditingEntryId(null);
    setEditingEntryForm(initialEntryForm);
    setIsUpdatingEntry(false);
    await loadFinancialData(familyId);
  };

  const handleStartEditObligation = (obligationItem: ObligationListRow) => {
    setEditingObligationId(obligationItem.id);
    setEditingObligationForm({
      title: obligationItem.title,
      amount: String(obligationItem.amount),
      type: obligationItem.type,
      recurrenceType: obligationItem.recurrence_type,
      totalInstallments: obligationItem.total_installments ? String(obligationItem.total_installments) : '',
      startDate: obligationItem.start_date,
      endDate: obligationItem.end_date ?? '',
      dueDay: obligationItem.due_day ? String(obligationItem.due_day) : '',
      blockType: obligationItem.block_type,
      isActive: obligationItem.is_active
    });
  };

  const handleUpdateObligation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingObligationId) {
      return;
    }

    setError('');
    setIsUpdatingObligation(true);

    const installments =
      editingObligationForm.type === 'parcelada' ? Number(editingObligationForm.totalInstallments) : null;

    const { error: updateObligationError } = await supabase
      .from('obligations')
      .update({
        title: editingObligationForm.title.trim(),
        amount: Number(editingObligationForm.amount),
        type: editingObligationForm.type,
        recurrence_type: editingObligationForm.recurrenceType,
        total_installments: installments,
        start_date: editingObligationForm.startDate,
        end_date: editingObligationForm.endDate || null,
        due_day: Number(editingObligationForm.dueDay),
        block_type: editingObligationForm.blockType,
        is_active: editingObligationForm.isActive
      })
      .eq('id', editingObligationId)
      .eq('family_id', familyId);

    if (updateObligationError) {
      setError('Não foi possível atualizar a despesa.');
      setIsUpdatingObligation(false);
      return;
    }

    setEditingObligationId(null);
    setEditingObligationForm(initialObligationForm);
    setIsUpdatingObligation(false);
    await loadFinancialData(familyId);
  };

  const handleDeleteEntry = async (entryId: string) => {
    const shouldDelete = window.confirm('Tem certeza que deseja excluir esta entrada?');

    if (!shouldDelete) {
      return;
    }

    setError('');

    const { error: deleteEntryError } = await supabase
      .from('entries')
      .delete()
      .eq('id', entryId)
      .eq('family_id', familyId);

    if (deleteEntryError) {
      setError('Não foi possível excluir a entrada.');
      return;
    }

    if (editingEntryId === entryId) {
      setEditingEntryId(null);
      setEditingEntryForm(initialEntryForm);
    }

    await loadFinancialData(familyId);
  };

  const handleDeleteObligation = async (obligationId: string) => {
    const shouldDelete = window.confirm('Tem certeza que deseja excluir esta despesa?');

    if (!shouldDelete) {
      return;
    }

    setError('');

    const { error: deleteObligationError } = await supabase
      .from('obligations')
      .delete()
      .eq('id', obligationId)
      .eq('family_id', familyId);

    if (deleteObligationError) {
      setError('Não foi possível excluir a despesa.');
      return;
    }

    if (editingObligationId === obligationId) {
      setEditingObligationId(null);
      setEditingObligationForm(initialObligationForm);
    }

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

      <div>
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
                <th>Alertas</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((month) => (
                <tr key={month.key}>
                  <td>{month.label}</td>
                  <td>{currencyFormatter.format(month.totalEntries)}</td>
                  <td>{currencyFormatter.format(month.totalObligations)}</td>
                  <td>{currencyFormatter.format(month.balance)}</td>
                  <td>{getMonthAlerts(month).join(' • ') || 'Sem alertas'}</td>
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
                <th>Alertas</th>
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
                  <td>{getMonthAlerts(month).join(' • ') || 'Sem alertas'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {!isLoadingProjectionData ? (
          <section>
            <h3>Resumos mensais</h3>
            {projection.map((month) => {
              const monthAlerts = getMonthAlerts(month);
              const nextMonthAlerts = nextMonthAlertsByKey.get(month.key) ?? [];
              const monthDetails = monthDetailsByKey.get(month.key);

              return (
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
                  <p>Alertas automáticos básicos:</p>
                  <ul>
                    {monthAlerts.length > 0 ? (
                      monthAlerts.map((alert) => <li key={`${month.key}-${alert}`}>{alert}</li>)
                    ) : (
                      <li>Sem alertas para este mês.</li>
                    )}
                  </ul>
                  <p>Mudanças para o próximo mês:</p>
                  <ul>
                    {nextMonthAlerts.length > 0 ? (
                      nextMonthAlerts.map((alert) => (
                        <li key={`${month.key}-next-${alert}`}>{alert}</li>
                      ))
                    ) : (
                      <li>Sem mudanças relevantes para o próximo mês.</li>
                    )}
                  </ul>
                  <details>
                    <summary>Detalhamento do mês</summary>

                    <p>Entradas do mês:</p>
                    <ul>
                      {(monthDetails?.entries ?? []).length > 0 ? (
                        (monthDetails?.entries ?? []).map((entryItem) => {
                          const occurrence = getOccurrence('entry', entryItem.id, month.key);
                          const isReceived = occurrence?.status === 'received';
                          const occurrenceKey = `entry-${entryItem.id}-${month.key}`;

                          return (
                            <li key={`${month.key}-entry-${entryItem.id}`}>
                              {entryItem.title} — {currencyFormatter.format(Number(entryItem.amount))} (
                              {entryItem.recurrence_type}, bloco {entryItem.block_type}) —{' '}
                              {isReceived ? 'Recebida' : 'Pendente'}
                              <button
                                type="button"
                                disabled={isReceived || isUpdatingOccurrenceKey === occurrenceKey}
                                onClick={() =>
                                  handleSetOccurrenceStatus(
                                    'entry',
                                    entryItem.id,
                                    month.key,
                                    entryItem.title,
                                    Number(entryItem.amount),
                                    entryItem.block_type,
                                    'received'
                                  )
                                }
                              >
                                {isUpdatingOccurrenceKey === occurrenceKey
                                  ? 'Salvando...'
                                  : 'Marcar como recebida'}
                              </button>
                            </li>
                          );
                        })
                      ) : (
                        <li>Sem entradas neste mês.</li>
                      )}
                    </ul>

                    <p>Despesas do mês:</p>
                    <ul>
                      {(monthDetails?.obligations ?? []).length > 0 ? (
                        (monthDetails?.obligations ?? []).map((obligationItem) => {
                          const occurrence = getOccurrence('obligation', obligationItem.id, month.key);
                          const isPaid = occurrence?.status === 'paid';
                          const occurrenceKey = `obligation-${obligationItem.id}-${month.key}`;

                          return (
                            <li key={`${month.key}-obligation-${obligationItem.id}`}>
                              {obligationItem.title} — {currencyFormatter.format(Number(obligationItem.amount))} (
                              {obligationItem.type}
                              {obligationItem.type === 'parcelada' && obligationItem.total_installments
                                ? `, parcelada em ${obligationItem.total_installments}x`
                                : ''}
                              , bloco {obligationItem.block_type}) — {isPaid ? 'Paga' : 'Pendente'}
                              <button
                                type="button"
                                disabled={isPaid || isUpdatingOccurrenceKey === occurrenceKey}
                                onClick={() =>
                                  handleSetOccurrenceStatus(
                                    'obligation',
                                    obligationItem.id,
                                    month.key,
                                    obligationItem.title,
                                    Number(obligationItem.amount),
                                    obligationItem.block_type,
                                    'paid'
                                  )
                                }
                              >
                                {isUpdatingOccurrenceKey === occurrenceKey
                                  ? 'Salvando...'
                                  : 'Marcar como paga'}
                              </button>
                            </li>
                          );
                        })
                      ) : (
                        <li>Sem despesas neste mês.</li>
                      )}
                    </ul>

                    <p>Totais do mês:</p>
                    <p>Entradas: {currencyFormatter.format(month.totalEntries)}</p>
                    <p>Despesas: {currencyFormatter.format(month.totalObligations)}</p>
                    <p>Saldo: {currencyFormatter.format(month.balance)}</p>
                  </details>
                </article>
              );
            })}
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

        <section>
          <h2>Entradas cadastradas</h2>
          {editingEntryId ? (
            <form onSubmit={handleUpdateEntry}>
              <h3>Editar entrada</h3>
              <div>
                <label htmlFor="editEntryTitle">Título</label>
                <input
                  id="editEntryTitle"
                  type="text"
                  value={editingEntryForm.title}
                  onChange={(event) =>
                    setEditingEntryForm({ ...editingEntryForm, title: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editEntryAmount">Valor</label>
                <input
                  id="editEntryAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editingEntryForm.amount}
                  onChange={(event) =>
                    setEditingEntryForm({ ...editingEntryForm, amount: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editEntryRecurrenceType">Recorrência</label>
                <select
                  id="editEntryRecurrenceType"
                  value={editingEntryForm.recurrenceType}
                  onChange={(event) =>
                    setEditingEntryForm({
                      ...editingEntryForm,
                      recurrenceType: event.target.value as EntryFormState['recurrenceType']
                    })
                  }
                >
                  <option value="monthly">Mensal</option>
                  <option value="one_time">Avulsa</option>
                </select>
              </div>

              <div>
                <label htmlFor="editEntryStartDate">Data inicial</label>
                <input
                  id="editEntryStartDate"
                  type="date"
                  value={editingEntryForm.startDate}
                  onChange={(event) =>
                    setEditingEntryForm({ ...editingEntryForm, startDate: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editEntryEndDate">Data final</label>
                <input
                  id="editEntryEndDate"
                  type="date"
                  value={editingEntryForm.endDate}
                  onChange={(event) =>
                    setEditingEntryForm({ ...editingEntryForm, endDate: event.target.value })
                  }
                />
              </div>

              <div>
                <label htmlFor="editEntryDueDay">Dia de vencimento</label>
                <input
                  id="editEntryDueDay"
                  type="number"
                  min="1"
                  max="31"
                  value={editingEntryForm.dueDay}
                  onChange={(event) =>
                    setEditingEntryForm({ ...editingEntryForm, dueDay: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editEntryBlockType">Bloco</label>
                <select
                  id="editEntryBlockType"
                  value={editingEntryForm.blockType}
                  onChange={(event) =>
                    setEditingEntryForm({
                      ...editingEntryForm,
                      blockType: event.target.value as EntryFormState['blockType']
                    })
                  }
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                </select>
              </div>

              <div>
                <label htmlFor="editEntryIsActive">Ativo</label>
                <input
                  id="editEntryIsActive"
                  type="checkbox"
                  checked={editingEntryForm.isActive}
                  onChange={(event) =>
                    setEditingEntryForm({ ...editingEntryForm, isActive: event.target.checked })
                  }
                />
              </div>

              <button type="submit" disabled={isUpdatingEntry}>
                {isUpdatingEntry ? 'Atualizando...' : 'Salvar entrada'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingEntryId(null);
                  setEditingEntryForm(initialEntryForm);
                }}
              >
                Cancelar
              </button>
            </form>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Valor</th>
                <th>Recorrência</th>
                <th>Data inicial</th>
                <th>Bloco</th>
                <th>Ativo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {entryList.map((entryItem, index) => (
                <tr key={`${entryItem.title}-${entryItem.start_date}-${entryItem.amount}-${index}`}>
                  <td>{entryItem.title}</td>
                  <td>{currencyFormatter.format(Number(entryItem.amount))}</td>
                  <td>{entryItem.recurrence_type}</td>
                  <td>{entryItem.start_date}</td>
                  <td>{entryItem.block_type}</td>
                  <td>{entryItem.is_active ? 'Sim' : 'Não'}</td>
                  <td>
                    <button type="button" onClick={() => handleStartEditEntry(entryItem)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => handleDeleteEntry(entryItem.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Despesas cadastradas</h2>
          {editingObligationId ? (
            <form onSubmit={handleUpdateObligation}>
              <h3>Editar despesa</h3>
              <div>
                <label htmlFor="editObligationTitle">Título</label>
                <input
                  id="editObligationTitle"
                  type="text"
                  value={editingObligationForm.title}
                  onChange={(event) =>
                    setEditingObligationForm({ ...editingObligationForm, title: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editObligationAmount">Valor</label>
                <input
                  id="editObligationAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editingObligationForm.amount}
                  onChange={(event) =>
                    setEditingObligationForm({ ...editingObligationForm, amount: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editObligationType">Tipo</label>
                <select
                  id="editObligationType"
                  value={editingObligationForm.type}
                  onChange={(event) =>
                    setEditingObligationForm({
                      ...editingObligationForm,
                      type: event.target.value as ObligationFormState['type'],
                      totalInstallments:
                        event.target.value === 'parcelada' ? editingObligationForm.totalInstallments : ''
                    })
                  }
                >
                  <option value="fixa">Fixa</option>
                  <option value="unica">Única</option>
                  <option value="parcelada">Parcelada</option>
                </select>
              </div>

              <div>
                <label htmlFor="editObligationRecurrenceType">Recorrência</label>
                <select
                  id="editObligationRecurrenceType"
                  value={editingObligationForm.recurrenceType}
                  onChange={(event) =>
                    setEditingObligationForm({
                      ...editingObligationForm,
                      recurrenceType: event.target.value as ObligationFormState['recurrenceType']
                    })
                  }
                >
                  <option value="monthly">Mensal</option>
                  <option value="one_time">Avulsa</option>
                </select>
              </div>

              {editingObligationForm.type === 'parcelada' ? (
                <div>
                  <label htmlFor="editObligationInstallments">Total de parcelas</label>
                  <input
                    id="editObligationInstallments"
                    type="number"
                    min="1"
                    value={editingObligationForm.totalInstallments}
                    onChange={(event) =>
                      setEditingObligationForm({
                        ...editingObligationForm,
                        totalInstallments: event.target.value
                      })
                    }
                    required
                  />
                </div>
              ) : null}

              <div>
                <label htmlFor="editObligationStartDate">Data inicial</label>
                <input
                  id="editObligationStartDate"
                  type="date"
                  value={editingObligationForm.startDate}
                  onChange={(event) =>
                    setEditingObligationForm({ ...editingObligationForm, startDate: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editObligationEndDate">Data final</label>
                <input
                  id="editObligationEndDate"
                  type="date"
                  value={editingObligationForm.endDate}
                  onChange={(event) =>
                    setEditingObligationForm({ ...editingObligationForm, endDate: event.target.value })
                  }
                />
              </div>

              <div>
                <label htmlFor="editObligationDueDay">Dia de vencimento</label>
                <input
                  id="editObligationDueDay"
                  type="number"
                  min="1"
                  max="31"
                  value={editingObligationForm.dueDay}
                  onChange={(event) =>
                    setEditingObligationForm({ ...editingObligationForm, dueDay: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="editObligationBlockType">Bloco</label>
                <select
                  id="editObligationBlockType"
                  value={editingObligationForm.blockType}
                  onChange={(event) =>
                    setEditingObligationForm({
                      ...editingObligationForm,
                      blockType: event.target.value as ObligationFormState['blockType']
                    })
                  }
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                </select>
              </div>

              <div>
                <label htmlFor="editObligationIsActive">Ativo</label>
                <input
                  id="editObligationIsActive"
                  type="checkbox"
                  checked={editingObligationForm.isActive}
                  onChange={(event) =>
                    setEditingObligationForm({
                      ...editingObligationForm,
                      isActive: event.target.checked
                    })
                  }
                />
              </div>

              <button type="submit" disabled={isUpdatingObligation}>
                {isUpdatingObligation ? 'Atualizando...' : 'Salvar despesa'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingObligationId(null);
                  setEditingObligationForm(initialObligationForm);
                }}
              >
                Cancelar
              </button>
            </form>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>Título</th>
                <th>Valor</th>
                <th>Tipo</th>
                <th>Recorrência</th>
                <th>Parcelas</th>
                <th>Data inicial</th>
                <th>Bloco</th>
                <th>Ativo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {obligationList.map((obligationItem, index) => (
                <tr
                  key={`${obligationItem.title}-${obligationItem.start_date}-${obligationItem.amount}-${index}`}
                >
                  <td>{obligationItem.title}</td>
                  <td>{currencyFormatter.format(Number(obligationItem.amount))}</td>
                  <td>{obligationItem.type}</td>
                  <td>{obligationItem.recurrence_type}</td>
                  <td>{obligationItem.total_installments ?? '-'}</td>
                  <td>{obligationItem.start_date}</td>
                  <td>{obligationItem.block_type}</td>
                  <td>{obligationItem.is_active ? 'Sim' : 'Não'}</td>
                  <td>
                    <button type="button" onClick={() => handleStartEditObligation(obligationItem)}>
                      Editar
                    </button>
                    <button type="button" onClick={() => handleDeleteObligation(obligationItem.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <button type="button" onClick={handleLogout}>
        Sair
      </button>
      {error ? <p>{error}</p> : null}
    </main>
  );
}
