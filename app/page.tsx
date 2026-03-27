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

type MonthPlannedVsActual = {
  totalEntriesPlanned: number;
  totalEntriesReceived: number;
  totalEntriesPending: number;
  totalObligationsPlanned: number;
  totalObligationsPaid: number;
  totalObligationsPending: number;
  plannedBalance: number;
  partialActualBalance: number;
};

type MonthRiskAnalysis = {
  level: 'seguro' | 'atenção' | 'risco';
  messages: string[];
};

type DashboardSection = 'home' | 'lancamentos' | 'projecao' | 'perfil';
type LaunchesView = 'entries' | 'obligations' | 'history';

const PROJECTION_MONTHS = 6;
const MONTH_KEY_REGEX = /^(\d{4})-(\d{1,2})$/;
const PROJECTION_VIEW_MODE_STORAGE_KEY = 'casa-em-dia:projection-view-mode';
const EXPANDED_MONTH_KEYS_STORAGE_KEY = 'casa-em-dia:expanded-month-keys';

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

const getCurrentMonthSituation = (partialActualBalance: number, plannedBalance: number) => {
  if (partialActualBalance < 0) {
    return {
      level: 'negativo',
      message: 'Mês negativo até agora'
    };
  }

  if (partialActualBalance === 0) {
    return {
      level: 'risco',
      message: 'Mês em risco'
    };
  }

  if (plannedBalance > 0 && partialActualBalance <= plannedBalance * 0.2) {
    return {
      level: 'risco',
      message: 'Mês em risco'
    };
  }

  return {
    level: 'positivo',
    message: 'Mês positivo até agora'
  };
};

const getExpectedComparison = (partialActualBalance: number, plannedBalance: number) => {
  const difference = partialActualBalance - plannedBalance;
  const threshold = Math.max(Math.abs(plannedBalance) * 0.1, 50);

  if (difference > threshold) {
    return {
      level: 'acima',
      message: 'O mês está mais leve que o planejado'
    };
  }

  if (difference < -threshold) {
    return {
      level: 'abaixo',
      message: 'Você já comprometeu grande parte do saldo'
    };
  }

  return {
    level: 'dentro',
    message: 'Você está dentro do esperado'
  };
};

const getBalanceTone = (balance: number) => {
  if (balance > 0) {
    return 'status-positive';
  }

  if (balance < 0) {
    return 'status-negative';
  }

  return 'status-tight';
};

const getRiskTone = (riskLevel: MonthRiskAnalysis['level']) => {
  if (riskLevel === 'risco') {
    return 'status-negative';
  }

  if (riskLevel === 'atenção') {
    return 'status-tight';
  }

  return 'status-positive';
};

const getRiskBadgeLabel = (riskLevel: MonthRiskAnalysis['level']) => {
  if (riskLevel === 'risco') {
    return 'Risco';
  }

  if (riskLevel === 'atenção') {
    return 'Atenção';
  }

  return 'Ok';
};

const normalizeSourceType = (sourceType: string) => {
  const normalizedValue = sourceType.trim().toLowerCase();

  if (normalizedValue === 'entries') {
    return 'entry';
  }

  if (normalizedValue === 'obligations') {
    return 'obligation';
  }

  if (normalizedValue === 'entry' || normalizedValue === 'obligation') {
    return normalizedValue;
  }

  return '';
};

const toDatabaseSourceType = (sourceType: 'entry' | 'obligation') => {
  if (sourceType === 'entry') {
    return 'entries';
  }

  return 'obligations';
};

const normalizeMonthKey = (monthKey: string) => {
  const normalizedValue = monthKey.trim();
  const matchedMonth = normalizedValue.match(MONTH_KEY_REGEX);

  if (!matchedMonth) {
    return '';
  }

  const [, year, month] = matchedMonth;
  return `${year}-${month.padStart(2, '0')}`;
};

const normalizeBlockType = (blockType: unknown): '10' | '25' => {
  if (blockType === 10 || blockType === '10') {
    return '10';
  }

  return '25';
};

const sectionSubtitleBySection: Record<DashboardSection, string> = {
  home: 'Resumo do mês com visão rápida da família.',
  lancamentos: 'Cadastre e ajuste entradas e despesas com clareza.',
  projecao: 'Acompanhe cenários futuros para planejar com segurança.',
  perfil: 'Gerencie sua conta e preferências do app.'
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
  const [activeSection, setActiveSection] = useState<DashboardSection>('home');
  const [launchTarget, setLaunchTarget] = useState<'entry' | 'obligation' | null>(null);
  const [launchesView, setLaunchesView] = useState<LaunchesView>('entries');
  const [isFabOpen, setIsFabOpen] = useState(false);
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
  const [expandedMonthKeys, setExpandedMonthKeys] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [entrySuccessMessage, setEntrySuccessMessage] = useState('');
  const [obligationSuccessMessage, setObligationSuccessMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedProjectionViewMode = window.localStorage.getItem(PROJECTION_VIEW_MODE_STORAGE_KEY);

    if (storedProjectionViewMode === 'monthly' || storedProjectionViewMode === 'blocks') {
      setProjectionViewMode(storedProjectionViewMode);
    }

    const storedExpandedMonthKeys = window.localStorage.getItem(EXPANDED_MONTH_KEYS_STORAGE_KEY);

    if (!storedExpandedMonthKeys) {
      return;
    }

    try {
      const parsedExpandedMonthKeys = JSON.parse(storedExpandedMonthKeys);

      if (Array.isArray(parsedExpandedMonthKeys)) {
        const validMonthKeys = parsedExpandedMonthKeys.filter(
          (monthKey): monthKey is string => typeof monthKey === 'string' && Boolean(normalizeMonthKey(monthKey))
        );

        setExpandedMonthKeys(validMonthKeys);
      }
    } catch (storageError) {
      console.error('Não foi possível recuperar meses expandidos do armazenamento local.', storageError);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PROJECTION_VIEW_MODE_STORAGE_KEY, projectionViewMode);
  }, [projectionViewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(EXPANDED_MONTH_KEYS_STORAGE_KEY, JSON.stringify(expandedMonthKeys));
  }, [expandedMonthKeys]);

  useEffect(() => {
    if (activeSection !== 'lancamentos' || !launchTarget) {
      return;
    }

    const targetId = launchTarget === 'entry' ? 'entry-create-section' : 'obligation-create-section';
    setLaunchesView(launchTarget === 'entry' ? 'entries' : 'obligations');

    const frameId = window.requestAnimationFrame(() => {
      const targetElement = document.getElementById(targetId);

      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      setLaunchTarget(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSection, launchTarget]);

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

    const normalizedEntries = ((entriesData ?? []) as EntryRow[]).map((entry) => ({
      ...entry,
      block_type: normalizeBlockType(entry.block_type)
    }));

    const normalizedObligations = ((obligationsData ?? []) as ObligationRow[]).map((obligation) => ({
      ...obligation,
      block_type: normalizeBlockType(obligation.block_type)
    }));

    const normalizedEntryList = ((entriesListData ?? []) as EntryListRow[]).map((entry) => ({
      ...entry,
      block_type: normalizeBlockType(entry.block_type)
    }));

    const normalizedObligationList = ((obligationsListData ?? []) as ObligationListRow[]).map((obligation) => ({
      ...obligation,
      block_type: normalizeBlockType(obligation.block_type)
    }));

    setEntries(normalizedEntries);
    setObligations(normalizedObligations);
    setEntryList(normalizedEntryList);
    setObligationList(normalizedObligationList);

    const normalizedOccurrences = ((occurrencesData ?? []) as MonthlyOccurrenceRow[])
      .map((occurrence) => ({
        ...occurrence,
        source_type: normalizeSourceType(occurrence.source_type) as MonthlyOccurrenceRow['source_type'],
        month_key: normalizeMonthKey(occurrence.month_key),
        source_id: occurrence.source_id.trim(),
        block_type: normalizeBlockType(occurrence.block_type)
      }))
      .filter((occurrence) => occurrence.source_type && occurrence.month_key && occurrence.source_id);

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

        if (normalizeBlockType(entry.block_type) === '10') {
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

        if (normalizeBlockType(obligation.block_type) === '10') {
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


  const launchHistoryItems = useMemo(
    () =>
      [
        ...entryList.map((item) => ({
          id: item.id,
          title: item.title,
          amount: Number(item.amount),
          date: item.start_date,
          typeLabel: 'Entrada',
          blockType: normalizeBlockType(item.block_type),
          isActive: item.is_active,
          detailLabel: item.recurrence_type === 'monthly' ? 'Mensal' : 'Avulsa',
          source: 'entry' as const,
          originalItem: item
        })),
        ...obligationList.map((item) => ({
          id: item.id,
          title: item.title,
          amount: Number(item.amount),
          date: item.start_date,
          typeLabel: 'Despesa',
          blockType: normalizeBlockType(item.block_type),
          isActive: item.is_active,
          detailLabel:
            item.type === 'parcelada' && item.total_installments
              ? `Parcelada (${item.total_installments}x)`
              : item.type === 'fixa'
                ? 'Fixa'
                : 'Única',
          source: 'obligation' as const,
          originalItem: item
        }))
      ].sort((firstItem, secondItem) => secondItem.date.localeCompare(firstItem.date)),
    [entryList, obligationList]
  );

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
    monthlyOccurrences.find((occurrence) => {
      const normalizedSourceType = normalizeSourceType(occurrence.source_type);
      const normalizedMonthKey = normalizeMonthKey(occurrence.month_key);

      return (
        occurrence.family_id === familyId &&
        normalizedSourceType === sourceType &&
        occurrence.source_id === sourceId &&
        normalizedMonthKey === normalizeMonthKey(monthKey)
      );
    });

  const getOccurrenceStatus = (sourceType: 'entry' | 'obligation', sourceId: string, monthKey: string) =>
    getOccurrence(sourceType, sourceId, monthKey)?.status ?? 'pending';

  const currentMonthKey = useMemo(() => {
    const currentDate = new Date();
    return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const greetingMessage = useMemo(() => {
    const currentHour = new Date().getHours();

    if (currentHour < 12) {
      return 'Bom dia';
    }

    if (currentHour < 18) {
      return 'Boa tarde';
    }

    return 'Boa noite';
  }, []);

  const currentMonthPendingMessages = useMemo(() => {
    const currentMonthDetails = monthDetailsByKey.get(currentMonthKey);
    const currentMonthEntries = currentMonthDetails?.entries ?? [];
    const currentMonthObligations = currentMonthDetails?.obligations ?? [];

    const hasPendingEntries = currentMonthEntries.some(
      (entryItem) => getOccurrenceStatus('entry', entryItem.id, currentMonthKey) === 'pending'
    );
    const hasPendingObligations = currentMonthObligations.some(
      (obligationItem) => getOccurrenceStatus('obligation', obligationItem.id, currentMonthKey) === 'pending'
    );
    const messages: string[] = [];

    if (hasPendingEntries) {
      messages.push('Você possui entradas não recebidas neste mês');
    }

    if (hasPendingObligations) {
      messages.push('Você possui despesas não pagas neste mês');
    }

    if (hasPendingEntries || hasPendingObligations) {
      messages.push('Existem pendências financeiras no mês atual');
    }

    return messages;
  }, [monthDetailsByKey, currentMonthKey, monthlyOccurrences, familyId]);

  const currentMonthProjection = useMemo(
    () => projection.find((month) => month.key === currentMonthKey) ?? null,
    [projection, currentMonthKey]
  );

  const currentMonthPendingSummary = useMemo(() => {
    const currentMonthDetails = monthDetailsByKey.get(currentMonthKey);
    const currentMonthEntries = currentMonthDetails?.entries ?? [];
    const currentMonthObligations = currentMonthDetails?.obligations ?? [];

    const pendingEntries = currentMonthEntries.filter(
      (entryItem) => getOccurrenceStatus('entry', entryItem.id, currentMonthKey) === 'pending'
    ).length;
    const pendingObligations = currentMonthObligations.filter(
      (obligationItem) => getOccurrenceStatus('obligation', obligationItem.id, currentMonthKey) === 'pending'
    ).length;

    return {
      pendingEntries,
      pendingObligations
    };
  }, [monthDetailsByKey, currentMonthKey, monthlyOccurrences, familyId]);

  const currentMonthReferenceDate = useMemo(() => {
    const [year, month] = currentMonthKey.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }, [currentMonthKey]);

  const currentMonthLabel = useMemo(() => {
    const monthName = currentMonthReferenceDate.toLocaleDateString('pt-BR', { month: 'long' });
    const formattedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    return {
      month: formattedMonth,
      year: String(currentMonthReferenceDate.getFullYear())
    };
  }, [currentMonthReferenceDate]);

  const currentMonthCommitments = useMemo(() => {
    const entriesCommitments = entryList
      .filter((entryItem) => doesEntryApplyToMonth(entryItem as EntryRow, currentMonthReferenceDate))
      .map((entryItem) => ({
        id: entryItem.id,
        title: entryItem.title,
        amount: Number(entryItem.amount),
        dueDay: entryItem.due_day,
        blockType: normalizeBlockType(entryItem.block_type),
        kind: 'Entrada',
        status: getOccurrenceStatus('entry', entryItem.id, currentMonthKey)
      }));

    const obligationsCommitments = obligationList
      .filter((obligationItem) => doesObligationApplyToMonth(obligationItem as ObligationRow, currentMonthReferenceDate))
      .map((obligationItem) => ({
        id: obligationItem.id,
        title: obligationItem.title,
        amount: Number(obligationItem.amount),
        dueDay: obligationItem.due_day,
        blockType: normalizeBlockType(obligationItem.block_type),
        kind: 'Despesa',
        status: getOccurrenceStatus('obligation', obligationItem.id, currentMonthKey)
      }));

    return [...entriesCommitments, ...obligationsCommitments].sort((firstItem, secondItem) => {
      const firstDueDay = firstItem.dueDay ?? 99;
      const secondDueDay = secondItem.dueDay ?? 99;

      if (firstDueDay !== secondDueDay) {
        return firstDueDay - secondDueDay;
      }

      return firstItem.title.localeCompare(secondItem.title);
    });
  }, [entryList, obligationList, currentMonthReferenceDate, currentMonthKey, monthlyOccurrences, familyId]);

  const currentMonthBlock10Items = useMemo(
    () => currentMonthCommitments.filter((item) => item.blockType === '10'),
    [currentMonthCommitments]
  );

  const currentMonthBlock25Items = useMemo(
    () => currentMonthCommitments.filter((item) => item.blockType === '25'),
    [currentMonthCommitments]
  );

  const monthPlannedVsActualByKey = useMemo(() => {
    const plannedVsActualMap = new Map<string, MonthPlannedVsActual>();

    projection.forEach((month) => {
      const monthDetails = monthDetailsByKey.get(month.key);
      const monthEntries = monthDetails?.entries ?? [];
      const monthObligations = monthDetails?.obligations ?? [];

      const totalEntriesPlanned = monthEntries.reduce(
        (total, entryItem) => total + Number(entryItem.amount),
        0
      );
      const totalEntriesReceived = monthEntries.reduce((total, entryItem) => {
        const currentStatus = getOccurrenceStatus('entry', entryItem.id, month.key);

        if (currentStatus === 'received') {
          return total + Number(entryItem.amount);
        }

        return total;
      }, 0);
      const totalEntriesPending = totalEntriesPlanned - totalEntriesReceived;

      const totalObligationsPlanned = monthObligations.reduce(
        (total, obligationItem) => total + Number(obligationItem.amount),
        0
      );
      const totalObligationsPaid = monthObligations.reduce((total, obligationItem) => {
        const currentStatus = getOccurrenceStatus('obligation', obligationItem.id, month.key);

        if (currentStatus === 'paid') {
          return total + Number(obligationItem.amount);
        }

        return total;
      }, 0);
      const totalObligationsPending = totalObligationsPlanned - totalObligationsPaid;

      plannedVsActualMap.set(month.key, {
        totalEntriesPlanned,
        totalEntriesReceived,
        totalEntriesPending,
        totalObligationsPlanned,
        totalObligationsPaid,
        totalObligationsPending,
        plannedBalance: month.balance,
        partialActualBalance: totalEntriesReceived - totalObligationsPaid
      });
    });

    return plannedVsActualMap;
  }, [projection, monthDetailsByKey, monthlyOccurrences, familyId]);

  const monthRiskByKey = useMemo(() => {
    const riskMap = new Map<string, MonthRiskAnalysis>();

    projection.forEach((month, index) => {
      const previousMonth = projection[index - 1];
      const messages: string[] = [];
      let riskLevel: MonthRiskAnalysis['level'] = 'seguro';

      if (month.balance < 0) {
        riskLevel = 'risco';
        messages.push('Risco de saldo negativo neste mês');
      }

      const nearZeroThreshold = Math.max(month.totalEntries * 0.1, 50);

      if (Math.abs(month.balance) <= nearZeroThreshold) {
        if (riskLevel !== 'risco') {
          riskLevel = 'atenção';
        }

        messages.push('Seu orçamento está apertado');
      }

      if (month.totalEntries > 0 && month.totalObligations / month.totalEntries > 0.8) {
        if (riskLevel !== 'risco') {
          riskLevel = 'atenção';
        }

        messages.push('Nível de despesas elevado');
      }

      if (previousMonth && month.balance < previousMonth.balance) {
        if (riskLevel === 'seguro') {
          riskLevel = 'atenção';
        }

        messages.push('Tendência de piora nos próximos meses');
      }

      if (messages.length === 0) {
        messages.push('Situação estável para este mês');
      }

      riskMap.set(month.key, {
        level: riskLevel,
        messages
      });
    });

    return riskMap;
  }, [projection]);

  const currentMonthPlannedVsActual = useMemo(
    () => monthPlannedVsActualByKey.get(currentMonthKey) ?? null,
    [monthPlannedVsActualByKey, currentMonthKey]
  );

  const currentMonthRisk = useMemo<MonthRiskAnalysis>(
    () => monthRiskByKey.get(currentMonthKey) ?? { level: 'seguro', messages: ['Situação estável para este mês'] },
    [monthRiskByKey, currentMonthKey]
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
    const normalizedSourceType = normalizeSourceType(sourceType);
    const normalizedSourceId = sourceId.trim();
    const normalizedMonthKey = normalizeMonthKey(monthKey);
    const sourceTypeForDatabase = toDatabaseSourceType(sourceType);
    const occurrenceKey = `${sourceType}-${sourceId}-${monthKey}`;
    setError('');
    setIsUpdatingOccurrenceKey(occurrenceKey);

    if (!familyId) {
      console.error('Falha ao atualizar status mensal: family_id ausente.', {
        sourceType,
        sourceId,
        monthKey
      });
      setError('Não foi possível atualizar o status mensal: família não identificada.');
      setIsUpdatingOccurrenceKey(null);
      return;
    }

    if (!normalizedSourceType || !normalizedSourceId || !normalizedMonthKey) {
      console.error('Falha ao atualizar status mensal: parâmetros inválidos.', {
        familyId,
        sourceType,
        sourceId,
        monthKey,
        normalizedSourceType,
        normalizedSourceId,
        normalizedMonthKey
      });
      setError('Não foi possível atualizar o status mensal por inconsistência nos dados.');
      setIsUpdatingOccurrenceKey(null);
      return;
    }

    const { error: upsertError } = await supabase.from('monthly_occurrences').upsert(
      {
        family_id: familyId,
        source_type: sourceTypeForDatabase,
        source_id: normalizedSourceId,
        month_key: normalizedMonthKey,
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
      console.error('Erro ao persistir status mensal em monthly_occurrences.', {
        code: upsertError.code,
        message: upsertError.message,
        details: upsertError.details,
        hint: upsertError.hint,
        payload: {
          family_id: familyId,
          source_type: sourceTypeForDatabase,
          source_id: normalizedSourceId,
          month_key: normalizedMonthKey,
          title,
          amount,
          block_type: blockType,
          status
        }
      });
      setError(`Não foi possível atualizar o status mensal do lançamento: ${upsertError.message}`);
      setIsUpdatingOccurrenceKey(null);
      return;
    }

    setMonthlyOccurrences((previous) => {
      const updatedOccurrence: MonthlyOccurrenceRow = {
        family_id: familyId,
        source_type: sourceTypeForDatabase,
        source_id: normalizedSourceId,
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
            occurrence.source_id === normalizedSourceId &&
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
      blockType: normalizeBlockType(entryItem.block_type),
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
      blockType: normalizeBlockType(obligationItem.block_type),
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

  const handleMonthDetailsToggle = (monthKey: string, isOpen: boolean) => {
    setExpandedMonthKeys((previous) => {
      if (isOpen) {
        if (previous.includes(monthKey)) {
          return previous;
        }

        return [...previous, monthKey];
      }

      return previous.filter((key) => key !== monthKey);
    });
  };

  if (isCheckingSession) {
    return (
      <main className="app-shell">
        <h1 className="app-title">Casa em Dia</h1>
        <p>Verificando sessão...</p>
      </main>
    );
  }

  if (!hasFamilyMembership) {
    return (
      <main className="app-shell">
        <h1 className="app-title">Casa em Dia</h1>
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
    <main className="app-shell">
      <header className="app-header card">
        <div className="brand-row">
          <div className="brand-logo-placeholder" aria-hidden="true">
            🏠
          </div>
          <div>
            <p className="brand-greeting">
              {greetingMessage}
              {userEmail ? `, ${userEmail.split('@')[0]}` : ''}.
            </p>
            <h1 className="app-title">Casa em Dia</h1>
            <p className="brand-subtitle">{sectionSubtitleBySection[activeSection]}</p>
          </div>
        </div>
      </header>
      {activeSection === 'home' && currentMonthPendingMessages.length > 0 ? (
        <section className="card pending-alerts pending-alerts-compact">
          <details>
            <summary className="pending-alerts-summary">
              ⚠️ Pendências do mês: {currentMonthPendingSummary.pendingEntries + currentMonthPendingSummary.pendingObligations}
            </summary>
            <ul className="pending-alerts-list">
              {currentMonthPendingMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      <div className="content-grid">
        {activeSection === 'home' ? (
        <>
        <section className="card home-main-card">
          {currentMonthProjection ? (
            <>
              <header className="home-month-header">
                <p className="home-month-title">
                  {currentMonthLabel.month} <span>{currentMonthLabel.year}</span>
                </p>
                <span className={`status-pill ${getRiskTone(currentMonthRisk.level)}`}>
                  {getRiskBadgeLabel(currentMonthRisk.level)}
                </span>
              </header>

              <section className="home-commitments">
                <h3>Compromissos do mês</h3>
                {currentMonthCommitments.length > 0 ? (
                  <ul className="home-commitments-list">
                    {currentMonthCommitments.map((item) => (
                      <li
                        key={`commitment-${item.kind}-${item.id}`}
                        className={`home-commitment-item ${
                          item.kind === 'Entrada' ? 'commitment-entry' : 'commitment-obligation'
                        }`}
                      >
                        <div className="home-commitment-row-main">
                          <p className="home-commitment-title">{item.title}</p>
                          <p className="home-commitment-value">{currencyFormatter.format(item.amount)}</p>
                        </div>
                        <div className="home-commitment-row-meta">
                          <p className="home-commitment-meta">
                            Vencimento: {item.dueDay ? String(item.dueDay).padStart(2, '0') : '--'}
                          </p>
                          <p className="home-commitment-meta">{item.kind}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Sem compromissos ativos para este mês.</p>
                )}
              </section>

              <section className="current-month-blocks">
                <h3>Blocos do mês</h3>
                <details className="home-block-details">
                  <summary>
                    Bloco 10 • {currentMonthBlock10Items.length} itens
                  </summary>
                  {currentMonthBlock10Items.length > 0 ? (
                    <ul className="home-block-list">
                      {currentMonthBlock10Items.map((item) => (
                        <li key={`block10-${item.kind}-${item.id}`} className="home-block-list-item">
                          <span>{item.title}</span>
                          <span>{item.dueDay ? String(item.dueDay).padStart(2, '0') : '--'}</span>
                          <span>{currencyFormatter.format(item.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sem lançamentos no bloco 10.</p>
                  )}
                  <p className="home-block-mini-summary">
                    Entradas: {currencyFormatter.format(currentMonthProjection.block10.entries)} • Despesas:{' '}
                    {currencyFormatter.format(currentMonthProjection.block10.obligations)} • Saldo:{' '}
                    <span className={`money-value ${getBalanceTone(currentMonthProjection.block10.balance)}`}>
                      {currencyFormatter.format(currentMonthProjection.block10.balance)}
                    </span>
                  </p>
                </details>

                <details className="home-block-details">
                  <summary>
                    Bloco 25 • {currentMonthBlock25Items.length} itens
                  </summary>
                  {currentMonthBlock25Items.length > 0 ? (
                    <ul className="home-block-list">
                      {currentMonthBlock25Items.map((item) => (
                        <li key={`block25-${item.kind}-${item.id}`} className="home-block-list-item">
                          <span>{item.title}</span>
                          <span>{item.dueDay ? String(item.dueDay).padStart(2, '0') : '--'}</span>
                          <span>{currencyFormatter.format(item.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sem lançamentos no bloco 25.</p>
                  )}
                  <p className="home-block-mini-summary">
                    Entradas: {currencyFormatter.format(currentMonthProjection.block25.entries)} • Despesas:{' '}
                    {currencyFormatter.format(currentMonthProjection.block25.obligations)} • Saldo:{' '}
                    <span className={`money-value ${getBalanceTone(currentMonthProjection.block25.balance)}`}>
                      {currencyFormatter.format(currentMonthProjection.block25.balance)}
                    </span>
                  </p>
                </details>
              </section>

              <section className="home-month-total">
                <h3>Total geral do mês</h3>
                <p>
                  Entradas: <span className="money-value">{currencyFormatter.format(currentMonthProjection.totalEntries)}</span>
                </p>
                <p>
                  Despesas:{' '}
                  <span className="money-value">{currencyFormatter.format(currentMonthProjection.totalObligations)}</span>
                </p>
                <p>
                  Saldo final:{' '}
                  <span className={`money-value ${getBalanceTone(currentMonthProjection.balance)}`}>
                    {currencyFormatter.format(currentMonthProjection.balance)}
                  </span>
                </p>
              </section>
            </>
          ) : (
            <p>Sem dados disponíveis para o mês atual.</p>
          )}
        </section>
        <section className="card executive-card home-support-card">
          <details className="home-executive-details">
            <summary>
              Resumo executivo{' '}
              <span className={`status-pill ${getRiskTone(currentMonthRisk.level)}`}>
                {getRiskBadgeLabel(currentMonthRisk.level)}
              </span>
            </summary>
            <ul>
              {currentMonthRisk.messages.map((message) => (
                <li key={`current-risk-${message}`}>{message}</li>
              ))}
            </ul>
            <p>
              Saldo planejado:{' '}
              <span className={`money-value ${getBalanceTone(currentMonthPlannedVsActual?.plannedBalance ?? 0)}`}>
                {currencyFormatter.format(currentMonthPlannedVsActual?.plannedBalance ?? 0)}
              </span>
            </p>
            <p>
              Saldo parcial realizado:{' '}
              <span className={`money-value ${getBalanceTone(currentMonthPlannedVsActual?.partialActualBalance ?? 0)}`}>
                {currencyFormatter.format(currentMonthPlannedVsActual?.partialActualBalance ?? 0)}
              </span>
            </p>
          </details>
        </section>
        </>
        ) : null}

        {activeSection === 'projecao' ? (
          <section className="card projection-section">
            <h2>Projeção completa</h2>
            <p>Acompanhe os próximos meses em uma leitura objetiva para celular.</p>

            <details>
              <summary>Expandir projeção mensal</summary>

              <div className="button-row projection-view-toggle">
                <button type="button" onClick={() => setProjectionViewMode('monthly')}>
                  Visão mensal
                </button>
                <button type="button" onClick={() => setProjectionViewMode('blocks')}>
                  Visão por blocos
                </button>
              </div>

              {isLoadingProjectionData ? <p>Carregando projeção...</p> : null}

              {!isLoadingProjectionData ? (
                <div className="projection-month-grid">
                  {projection.map((month) => {
                    const monthRisk = monthRiskByKey.get(month.key);
                    const riskLevel = monthRisk?.level ?? 'seguro';

                    return (
                      <article
                        key={`projection-card-${month.key}`}
                        className={`projection-month-card ${
                          riskLevel === 'risco'
                            ? 'projection-month-card-risk'
                            : riskLevel === 'atenção'
                              ? 'projection-month-card-warning'
                              : 'projection-month-card-safe'
                        }`}
                      >
                        <header className="projection-month-header">
                          <p className="projection-month-title">
                            {month.label}
                            {month.key === currentMonthKey ? <span className="badge-current">Atual</span> : null}
                          </p>
                          <span className={`status-pill ${getRiskTone(riskLevel)}`}>
                            {getRiskBadgeLabel(riskLevel)}
                          </span>
                        </header>

                        {projectionViewMode === 'monthly' ? (
                          <div className="projection-month-metrics">
                            <p>
                              Entradas:{' '}
                              <span className="money-value">{currencyFormatter.format(month.totalEntries)}</span>
                            </p>
                            <p>
                              Despesas:{' '}
                              <span className="money-value">{currencyFormatter.format(month.totalObligations)}</span>
                            </p>
                            <p>
                              Saldo previsto:{' '}
                              <span className={`money-value ${getBalanceTone(month.balance)}`}>
                                {currencyFormatter.format(month.balance)}
                              </span>
                            </p>
                          </div>
                        ) : (
                          <div className="projection-blocks-grid">
                            <article className="projection-block-card">
                              <h4>Bloco 10</h4>
                              <p>Entradas: {currencyFormatter.format(month.block10.entries)}</p>
                              <p>Despesas: {currencyFormatter.format(month.block10.obligations)}</p>
                              <p>
                                Saldo:{' '}
                                <span className={`money-value ${getBalanceTone(month.block10.balance)}`}>
                                  {currencyFormatter.format(month.block10.balance)}
                                </span>
                              </p>
                            </article>
                            <article className="projection-block-card">
                              <h4>Bloco 25</h4>
                              <p>Entradas: {currencyFormatter.format(month.block25.entries)}</p>
                              <p>Despesas: {currencyFormatter.format(month.block25.obligations)}</p>
                              <p>
                                Saldo:{' '}
                                <span className={`money-value ${getBalanceTone(month.block25.balance)}`}>
                                  {currencyFormatter.format(month.block25.balance)}
                                </span>
                              </p>
                            </article>
                          </div>
                        )}

                        <p className="projection-month-alerts">{getMonthAlerts(month).join(' • ') || 'Sem alertas'}</p>
                      </article>
                    );
                  })}
                </div>
              ) : null}

              {!isLoadingProjectionData ? (
                <section>
                  <h3>Resumos mensais</h3>
                  {projection.map((month) => {
                    const monthAlerts = getMonthAlerts(month);
                    const nextMonthAlerts = nextMonthAlertsByKey.get(month.key) ?? [];
                    const monthDetails = monthDetailsByKey.get(month.key);
                    const monthPlannedVsActual = monthPlannedVsActualByKey.get(month.key);
                    const monthRisk = monthRiskByKey.get(month.key);
                    const plannedBalance = monthPlannedVsActual?.plannedBalance ?? month.balance;
                    const partialActualBalance = monthPlannedVsActual?.partialActualBalance ?? 0;
                    const currentSituation = getCurrentMonthSituation(partialActualBalance, plannedBalance);
                    const expectedComparison = getExpectedComparison(partialActualBalance, plannedBalance);

                    return (
                      <article
                        key={`summary-${month.key}`}
                        className={`month-summary ${
                          monthRisk?.level === 'risco'
                            ? 'month-summary-risk'
                            : monthRisk?.level === 'atenção'
                              ? 'month-summary-warning'
                              : 'month-summary-safe'
                        }`}
                      >
                        <header className="month-summary-header">
                          <h4>
                            {month.label}
                            {month.key === currentMonthKey ? <span className="badge-current">Atual</span> : null}
                          </h4>
                          <span className={`status-pill ${getRiskTone(monthRisk?.level ?? 'seguro')}`}>
                            {getRiskBadgeLabel(monthRisk?.level ?? 'seguro')}
                          </span>
                        </header>

                        <div className="month-summary-groups month-summary-groups-primary">
                          <section className="month-summary-group">
                            <h5>Visão geral</h5>
                            <p>Entradas: {currencyFormatter.format(month.totalEntries)}</p>
                            <p>Despesas: {currencyFormatter.format(month.totalObligations)}</p>
                            <p>Saldo previsto: {currencyFormatter.format(month.balance)}</p>
                            <p>
                              Status do mês:{' '}
                              <span className={`status-pill ${getBalanceTone(month.balance)}`}>{getMonthStatus(month.balance)}</span>
                            </p>
                          </section>

                          <section className="month-summary-group">
                            <h5>Blocos</h5>
                            <p>Total do bloco 10: {currencyFormatter.format(month.block10.balance)}</p>
                            <p>Total do bloco 25: {currencyFormatter.format(month.block25.balance)}</p>
                          </section>
                        </div>

                        <details className="month-summary-extra">
                          <summary>Ver análise completa</summary>

                          <div className="month-summary-groups">
                            <section className="month-summary-group">
                              <h5>Previsto x realizado</h5>
                              <p>Entradas previstas: {currencyFormatter.format(monthPlannedVsActual?.totalEntriesPlanned ?? 0)}</p>
                              <p>Entradas recebidas: {currencyFormatter.format(monthPlannedVsActual?.totalEntriesReceived ?? 0)}</p>
                              <p>Entradas pendentes: {currencyFormatter.format(monthPlannedVsActual?.totalEntriesPending ?? 0)}</p>
                              <p>Despesas previstas: {currencyFormatter.format(monthPlannedVsActual?.totalObligationsPlanned ?? 0)}</p>
                              <p>Despesas pagas: {currencyFormatter.format(monthPlannedVsActual?.totalObligationsPaid ?? 0)}</p>
                              <p>Despesas pendentes: {currencyFormatter.format(monthPlannedVsActual?.totalObligationsPending ?? 0)}</p>
                              <p>Saldo realizado parcial: {currencyFormatter.format(monthPlannedVsActual?.partialActualBalance ?? 0)}</p>
                            </section>

                            <section className="month-summary-group month-summary-executive">
                              <h5>Leitura executiva</h5>
                              <ul>
                                <li>{currentSituation.message}</li>
                                <li>{expectedComparison.message}</li>
                                {(monthRisk?.messages ?? ['Situação estável para este mês']).map((riskMessage) => (
                                  <li key={`${month.key}-risk-${riskMessage}`}>{riskMessage}</li>
                                ))}
                              </ul>
                            </section>

                            <section className="month-summary-group">
                              <h5>Alertas</h5>
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
                            </section>
                          </div>
                        </details>

                        <details
                          open={expandedMonthKeys.includes(month.key)}
                          onToggle={(event) =>
                            handleMonthDetailsToggle(
                              month.key,
                              (event.currentTarget as HTMLDetailsElement).open
                            )
                          }
                        >
                          <summary>Detalhamento do mês</summary>

                          <p>Entradas do mês:</p>
                          <ul>
                            {(monthDetails?.entries ?? []).length > 0 ? (
                              (monthDetails?.entries ?? []).map((entryItem) => {
                                const currentStatus = getOccurrenceStatus('entry', entryItem.id, month.key);
                                const isReceived = currentStatus === 'received';
                                const occurrenceKey = `entry-${entryItem.id}-${month.key}`;

                                return (
                                  <li key={`${month.key}-entry-${entryItem.id}`}>
                                    {entryItem.title} — {currencyFormatter.format(Number(entryItem.amount))} (
                                    {entryItem.recurrence_type}, bloco {normalizeBlockType(entryItem.block_type)}) —{' '}
                                    <span className={`status-pill ${isReceived ? 'status-success' : 'status-pending'}`}>
                                      {isReceived ? 'Recebida' : 'Pendente'}
                                    </span>
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
                                          normalizeBlockType(entryItem.block_type),
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
                                const currentStatus = getOccurrenceStatus('obligation', obligationItem.id, month.key);
                                const isPaid = currentStatus === 'paid';
                                const occurrenceKey = `obligation-${obligationItem.id}-${month.key}`;

                                return (
                                  <li key={`${month.key}-obligation-${obligationItem.id}`}>
                                    {obligationItem.title} — {currencyFormatter.format(Number(obligationItem.amount))} (
                                    {obligationItem.type}
                                    {obligationItem.type === 'parcelada' && obligationItem.total_installments
                                      ? `, parcelada em ${obligationItem.total_installments}x`
                                      : ''}
                                    , bloco {normalizeBlockType(obligationItem.block_type)}) —{' '}
                                    <span className={`status-pill ${isPaid ? 'status-success' : 'status-pending'}`}>
                                      {isPaid ? 'Paga' : 'Pendente'}
                                    </span>
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
                                          normalizeBlockType(obligationItem.block_type),
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
            </details>
          </section>
        ) : null}

        {activeSection === 'lancamentos' ? (
          <section className="card launch-area">
            <h2>Lançamentos</h2>
            <p className="launch-subtitle">Gerencie entradas e despesas sem perder o contexto do que já foi cadastrado.</p>

            <div className="launch-segmented-control" role="tablist" aria-label="Navegação de lançamentos">
              <button
                type="button"
                role="tab"
                aria-selected={launchesView === 'entries'}
                className={launchesView === 'entries' ? 'is-active' : ''}
                onClick={() => setLaunchesView('entries')}
              >
                Entradas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={launchesView === 'obligations'}
                className={launchesView === 'obligations' ? 'is-active' : ''}
                onClick={() => setLaunchesView('obligations')}
              >
                Despesas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={launchesView === 'history'}
                className={launchesView === 'history' ? 'is-active' : ''}
                onClick={() => setLaunchesView('history')}
              >
                Histórico
              </button>
            </div>

            {entrySuccessMessage ? <p className="launch-feedback launch-feedback-success">{entrySuccessMessage}</p> : null}
            {obligationSuccessMessage ? (
              <p className="launch-feedback launch-feedback-success">{obligationSuccessMessage}</p>
            ) : null}

            {launchesView === 'entries' ? (
              <section className="launch-panel" id="entry-create-section">
                <h3>Nova entrada</h3>
                <form className="modern-form" onSubmit={handleCreateEntry}>
                  <div className="form-block">
                    <p className="form-block-title">Informações principais</p>
                    <div className="form-grid">
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
                        <label htmlFor="entryAmount">Valor (R$)</label>
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
                    </div>
                  </div>

                  <div className="form-block">
                    <p className="form-block-title">Recorrência e período</p>
                    <div className="form-grid">
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
                        <label htmlFor="entryStartDate">Início</label>
                        <input
                          id="entryStartDate"
                          type="date"
                          value={entryForm.startDate}
                          onChange={(event) => setEntryForm({ ...entryForm, startDate: event.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="entryEndDate">Fim (opcional)</label>
                        <input
                          id="entryEndDate"
                          type="date"
                          value={entryForm.endDate}
                          onChange={(event) => setEntryForm({ ...entryForm, endDate: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-block">
                    <p className="form-block-title">Organização</p>
                    <div className="form-grid">
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
                    </div>
                  </div>

                  <div className="form-inline-toggle">
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
              </section>
            ) : null}

            {launchesView === 'obligations' ? (
              <section className="launch-panel" id="obligation-create-section">
                <h3>Nova despesa</h3>
                <form className="modern-form" onSubmit={handleCreateObligation}>
                  <div className="form-block">
                    <p className="form-block-title">Informações principais</p>
                    <div className="form-grid">
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
                        <label htmlFor="obligationAmount">Valor (R$)</label>
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
                    </div>
                  </div>

                  <div className="form-block">
                    <p className="form-block-title">Tipo e recorrência</p>
                    <div className="form-grid">
                      <div>
                        <label htmlFor="obligationType">Tipo</label>
                        <select
                          id="obligationType"
                          value={obligationForm.type}
                          onChange={(event) =>
                            setObligationForm({
                              ...obligationForm,
                              type: event.target.value as ObligationFormState['type'],
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
                    </div>
                  </div>

                  <div className="form-block">
                    <p className="form-block-title">Período e organização</p>
                    <div className="form-grid">
                      <div>
                        <label htmlFor="obligationStartDate">Início</label>
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
                        <label htmlFor="obligationEndDate">Fim (opcional)</label>
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
                    </div>
                  </div>

                  <div className="form-inline-toggle">
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
              </section>
            ) : null}

            {launchesView === 'history' ? (
              <section className="launch-panel">
                <h3>Histórico de lançamentos</h3>
                <p className="launch-subtitle">Consulte, edite e exclua lançamentos com ações rápidas em cada item.</p>

                {editingEntryId ? (
                  <form className="launch-edit-form" onSubmit={handleUpdateEntry}>
                    <h4>Editar entrada</h4>
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

                    <div className="button-row">
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
                    </div>
                  </form>
                ) : null}

                {editingObligationId ? (
                  <form className="launch-edit-form" onSubmit={handleUpdateObligation}>
                    <h4>Editar despesa</h4>
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

                    <div className="button-row">
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
                    </div>
                  </form>
                ) : null}

                <div className="mobile-list-grid launch-history-grid">
                  {launchHistoryItems.length > 0 ? (
                    launchHistoryItems.map((historyItem) => (
                      <article
                        key={`${historyItem.source}-${historyItem.id}-${historyItem.date}`}
                        className="mobile-list-card"
                      >
                        <p className="mobile-list-title">{historyItem.title}</p>
                        <p className="mobile-list-value">{currencyFormatter.format(historyItem.amount)}</p>
                        <p>Tipo: {historyItem.typeLabel}</p>
                        <p>Categoria: {historyItem.detailLabel}</p>
                        <p>Data: {historyItem.date}</p>
                        <p>Bloco financeiro: {historyItem.blockType}</p>
                        <p>Status: {historyItem.isActive ? 'Ativo' : 'Inativo'}</p>
                        <div className="button-row">
                          <button
                            type="button"
                            onClick={() => {
                              if (historyItem.source === 'entry') {
                                handleStartEditEntry(historyItem.originalItem as EntryListRow);
                                return;
                              }

                              handleStartEditObligation(historyItem.originalItem as ObligationListRow);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (historyItem.source === 'entry') {
                                handleDeleteEntry(historyItem.id);
                                return;
                              }

                              handleDeleteObligation(historyItem.id);
                            }}
                          >
                            Excluir
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p>Nenhum lançamento cadastrado até o momento.</p>
                  )}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {activeSection === 'perfil' ? (
          <section className="card profile-card">
            <h2>Perfil</h2>
            <article className="profile-identity">
              <div className="profile-avatar" aria-hidden="true">
                👤
              </div>
              <div>
                <p className="profile-name">{userEmail ? userEmail.split('@')[0] : 'Usuário'}</p>
                <p className="profile-email">{userEmail || 'E-mail não identificado'}</p>
              </div>
            </article>

            <div className="profile-sections">
              <article className="profile-section-card">
                <h3>Conta</h3>
                <p>Dados essenciais da sua conta para identificação e acesso.</p>
              </article>

              <article className="profile-section-card">
                <h3>Preferências</h3>
                <p>Ajustes visuais e de navegação serão centralizados aqui.</p>
              </article>

              <article className="profile-section-card">
                <h3>Sobre o app</h3>
                <p>Casa em Dia foi feito para simplificar o controle financeiro da família.</p>
              </article>
            </div>

            <div className="profile-actions">
              <button type="button" className="logout-button" onClick={handleLogout}>
                Sair da conta
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <div className="bottom-safe-spacer" aria-hidden="true" />
      {isFabOpen ? (
        <button
          type="button"
          className="fab-overlay"
          aria-label="Fechar ações rápidas"
          onClick={() => setIsFabOpen(false)}
        />
      ) : null}
      <div className="fab-wrapper" onClick={(event) => event.stopPropagation()}>
        {isFabOpen ? (
          <div className="fab-actions" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setActiveSection('lancamentos');
                setLaunchTarget('entry');
                setIsFabOpen(false);
              }}
            >
              Nova entrada
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSection('lancamentos');
                setLaunchTarget('obligation');
                setIsFabOpen(false);
              }}
            >
              Nova despesa
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="fab-button"
          aria-expanded={isFabOpen}
          aria-label="Abrir ações rápidas"
          onClick={(event) => {
            event.stopPropagation();
            setIsFabOpen((previous) => !previous);
          }}
        >
          +
        </button>
      </div>

      <nav className="bottom-nav" aria-label="Navegação mobile">
        <button
          type="button"
          className={activeSection === 'home' ? 'is-section-active' : ''}
          onClick={() => setActiveSection('home')}
        >
          <span aria-hidden="true">🏠</span>
          <span>Início</span>
        </button>
        <button
          type="button"
          className={activeSection === 'lancamentos' ? 'is-section-active' : ''}
          onClick={() => setActiveSection('lancamentos')}
        >
          <span aria-hidden="true">🧾</span>
          <span>Lançamentos</span>
        </button>
        <button
          type="button"
          className={activeSection === 'projecao' ? 'is-section-active' : ''}
          onClick={() => setActiveSection('projecao')}
        >
          <span aria-hidden="true">📈</span>
          <span>Projeção</span>
        </button>
        <button
          type="button"
          className={activeSection === 'perfil' ? 'is-section-active' : ''}
          onClick={() => setActiveSection('perfil')}
        >
          <span aria-hidden="true">👤</span>
          <span>Perfil</span>
        </button>
      </nav>

      {error ? <p>{error}</p> : null}
    </main>
  );
}
