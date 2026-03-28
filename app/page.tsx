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
  const [activeCommitmentEditorKey, setActiveCommitmentEditorKey] = useState<string | null>(null);
  const [openCommitmentMenuKey, setOpenCommitmentMenuKey] = useState<string | null>(null);
  const [selectedHomeMonthKey, setSelectedHomeMonthKey] = useState<string | null>(null);
  const [operationAmountDraft, setOperationAmountDraft] = useState('');
  const [operationStatusDraft, setOperationStatusDraft] = useState<'received' | 'paid'>('paid');

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

        const amount = Number(obligation.am
