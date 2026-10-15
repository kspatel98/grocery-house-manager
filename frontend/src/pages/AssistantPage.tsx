import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import StructuredAiResponse from '../components/StructuredAiResponse';
import OverlayPortal from '../components/OverlayPortal';
import { useLanguage } from '../i18n';
import { announceBackgroundResultHydrated, getBackgroundTaskResult, makeBackgroundTaskId, runBackgroundCapableTask } from '../backgroundTasks';
import type {
  AccountBootstrap,
  AutopilotControls,
  AutopilotOverview,
  AutopilotTripOption,
  House,
  HouseholdAgentResponse,
  HouseholdDigitalTwin,
  HouseholdPlan,
  KitchenCheck,
  KitchenVisionApplyResponse,
  KitchenVisionResult,
  KitchenVisionReviewItem,
  PremiumTryStatus,
  PlanName,
  UserProfile,
  RecipeMissingAddResponse,
  ReceiptGuardianIssue,
  ShoppingList,
  WeeklyAssistant,
  WeeklyAssistantRecipe,
} from '../types';

const localeByLanguage = { en: 'en-CA', gu: 'gu-IN', hi: 'hi-IN', fr: 'fr-CA' } as const;
type AutopilotView = 'today' | 'intelligence' | 'insights' | 'plan' | 'spend' | 'protect';
type AgentMode = 'intelligence' | 'plan' | 'save' | 'protect';
type AgentContextSource = 'inventory' | 'shopping' | 'receipts' | 'expenses' | 'recipes';
type AgentConversationTurn = {
  id: string;
  question: string;
  response: HouseholdAgentResponse;
  askedAt?: string;
  answeredAt?: string;
};

const agentModeMeta: Record<AgentMode, { label: string; icon: string; hint: string }> = {
  intelligence: { label: 'Intelligence', icon: '✦', hint: 'Explain & decide' },
  plan: { label: 'Plan', icon: '◫', hint: 'Meals & routines' },
  save: { label: 'Save', icon: '$', hint: 'Prices & spending' },
  protect: { label: 'Protect', icon: '🛡', hint: 'Expiry & receipts' },
};

const agentContextMeta: Record<AgentContextSource, { label: string; icon: string }> = {
  inventory: { label: 'Inventory', icon: '▣' },
  shopping: { label: 'Shopping list', icon: '🛒' },
  receipts: { label: 'Receipts', icon: '🧾' },
  expenses: { label: 'Expenses', icon: '$' },
  recipes: { label: 'Recipes', icon: '🍲' },
};

function detectAgentMode(text: string): AgentMode {
  const q = text.toLowerCase();
  if (/expire|expiry|expired|recall|safe to eat|food safety|duplicate charge|receipt issue|protect|spoiled|spoil/.test(q)) return 'protect';
  if (/cook|meal|recipe|dinner|lunch|breakfast|serving|guest|what can i make|what should we eat|pav bhaji|dish/.test(q)) return 'plan';
  if (/price|cheapest|cost|save|saving|budget|spend|spending|store|where should.*buy|shopping trip|deal|flyer/.test(q)) return 'save';
  return 'intelligence';
}

function defaultContextForMode(mode: AgentMode): AgentContextSource[] {
  if (mode === 'plan') return ['inventory', 'shopping', 'recipes'];
  if (mode === 'save') return ['shopping', 'receipts', 'expenses', 'inventory'];
  if (mode === 'protect') return ['inventory', 'receipts'];
  return ['inventory', 'shopping', 'receipts', 'expenses'];
}

function actionLinksForMode(mode: AgentMode, houseId: number) {
  if (mode === 'plan') return [
    { label: 'Open meals & recipes', href: `/houses/${houseId}/meals`, icon: '🍲' },
    { label: 'Open shopping list', href: `/houses/${houseId}/shopping`, icon: '🛒' },
  ];
  if (mode === 'save') return [
    { label: 'Open shopping', href: `/houses/${houseId}/shopping`, icon: '🛒' },
    { label: 'Compare prices', href: '/market', icon: '$' },
    { label: 'View expenses', href: `/houses/${houseId}/expenses`, icon: '↗' },
  ];
  if (mode === 'protect') return [
    { label: 'Review inventory', href: `/houses/${houseId}/inventory`, icon: '▣' },
    { label: 'Open receipts', href: `/houses/${houseId}/receipts`, icon: '🧾' },
  ];
  return [
    { label: 'Household insights', href: `/assistant?house=${houseId}&view=insights`, icon: '📈' },
    { label: 'Open reports', href: '/reports', icon: '↗' },
  ];
}


function userInitials(user: UserProfile | null) {
  const source = String(user?.full_name || user?.email || 'You').replace(/@.*/, '').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || 'Y').toUpperCase();
}

function formatAgentTime(value: string | undefined, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function nextDayNames(count: number, locale = 'en-CA') {
  const start = new Date();
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatter.format(date);
  });
}

export default function AssistantPage() {
  const { language } = useLanguage();
  const appLocale = localeByLanguage[language];
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('view') as AutopilotView | null;
  const sharedQuestion = params.get('q') || '';
  const workspace: AutopilotView = ['today', 'intelligence', 'insights', 'plan', 'spend', 'protect'].includes(requestedView || '') ? (requestedView as AutopilotView) : 'today';
  const [houses, setHouses] = useState<House[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [premiumTry, setPremiumTry] = useState<PremiumTryStatus | null>(null);
  const [stockUpTryBusy, setStockUpTryBusy] = useState(false);
  const [houseId, setHouseId] = useState<number | null>(null);
  const selectedHouse = houses.find((house) => house.id === houseId) || null;
  const housePlanKey: PlanName = selectedHouse?.owner_plan_name || 'free';
  const householdIntelligencePaid = housePlanKey === 'family' || housePlanKey === 'pro';
  const householdIntelligenceTryReady = Boolean(
    housePlanKey === 'free' &&
    selectedHouse?.role === 'owner' &&
    premiumTry?.available &&
    premiumTry.selected_feature === 'household_intelligence'
  );
  const householdIntelligenceUnlocked = householdIntelligencePaid || householdIntelligenceTryReady;
  const chooseWorkspace = (next: AutopilotView) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('view', next);
    if (houseId) nextParams.set('house', String(houseId));
    setParams(nextParams, { replace: true });
  };
  const [assistant, setAssistant] = useState<WeeklyAssistant | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotOverview | null>(null);
  const [controls, setControls] = useState<AutopilotControls | null>(null);
  const [preferredStoresText, setPreferredStoresText] = useState('');
  const [busy, setBusy] = useState(false);
  const [recipeBusy, setRecipeBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [planDays, setPlanDays] = useState(5);
  const [defaultServings, setDefaultServings] = useState(4);
  const [budget, setBudget] = useState('');
  const [skipDays, setSkipDays] = useState<string[]>([]);
  const [servingOverrides, setServingOverrides] = useState<Record<string, number>>({});
  const [plan, setPlan] = useState<HouseholdPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [kitchenBusy, setKitchenBusy] = useState(false);
  const [kitchenCheck, setKitchenCheck] = useState<KitchenCheck | null>(null);
  const [kitchenVision, setKitchenVision] = useState<KitchenVisionResult | null>(null);
  const [kitchenReview, setKitchenReview] = useState<Record<string, KitchenVisionReviewItem>>({});
  const [kitchenApplyBusy, setKitchenApplyBusy] = useState(false);
  const [kitchenAutoRestock, setKitchenAutoRestock] = useState(false);
  const [digitalTwin, setDigitalTwin] = useState<HouseholdDigitalTwin | null>(null);
  const [agentPrompt, setAgentPrompt] = useState(() => sharedQuestion);
  const [agentAnswer, setAgentAnswer] = useState<HouseholdAgentResponse | null>(null);
  const [agentTurns, setAgentTurns] = useState<AgentConversationTurn[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [pendingAgentQuestion, setPendingAgentQuestion] = useState('');
  const [pendingAgentAskedAt, setPendingAgentAskedAt] = useState<string | undefined>(undefined);
  const [agentModeOverride, setAgentModeOverride] = useState<AgentMode | null>(null);
  const [agentContexts, setAgentContexts] = useState<AgentContextSource[]>([]);
  const [agentAttachOpen, setAgentAttachOpen] = useState(false);
  const [agentListening, setAgentListening] = useState(false);
  const [newConversationConfirm, setNewConversationConfirm] = useState(false);
  const [communityPriceBusy, setCommunityPriceBusy] = useState(false);
  const [foodSuggestionsReady, setFoodSuggestionsReady] = useState(false);
  const [controlsBusy, setControlsBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState('');
  const kitchenInputRef = useRef<HTMLInputElement | null>(null);
  const agentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const agentScrollRef = useRef<HTMLDivElement | null>(null);
  const agentConversationEndRef = useRef<HTMLDivElement | null>(null);
  const agentRecognitionRef = useRef<any>(null);
  const [reminderPermission, setReminderPermission] = useState<'unsupported' | NotificationPermission>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  useEffect(() => {
    if (sharedQuestion) setAgentPrompt(sharedQuestion);
  }, [sharedQuestion]);


  useEffect(() => {
    const shouldFocus = workspace === 'intelligence' && (Boolean(sharedQuestion) || params.get('focus') === 'ask' || params.get('from') === 'tell-ghm');
    if (!shouldFocus) return;
    let attempts = 0;
    let timer = 0;
    const focusAskBox = () => {
      const input = agentInputRef.current;
      if (input) {
        input.focus({ preventScroll: true });
        return;
      }
      attempts += 1;
      if (attempts < 40) timer = window.setTimeout(focusAskBox, 120);
    };
    timer = window.setTimeout(focusAskBox, 80);
    return () => window.clearTimeout(timer);
  }, [sharedQuestion, workspace, params]);

  useEffect(() => {
    const taskId = params.get('bgTask');
    if (!taskId || !houseId) return;
    const result = getBackgroundTaskResult<HouseholdAgentResponse | HouseholdPlan | KitchenVisionResult>(taskId);
    if (!result) return;
    const timer = window.setTimeout(() => {
      if ('answer' in result) {
        const response = result as HouseholdAgentResponse;
        setAgentAnswer(response);
        if (sharedQuestion) {
          setAgentTurns((current) => current.some((turn) => turn.id === taskId)
            ? current
            : [...current, { id: taskId, question: sharedQuestion, response, askedAt: new Date().toISOString(), answeredAt: new Date().toISOString() }].slice(-8));
        }
      } else if ('days_requested' in result) setPlan(result as HouseholdPlan);
      else if ('detections' in result) {
        const vision = result as KitchenVisionResult;
        setKitchenVision(vision);
        const next: Record<string, KitchenVisionReviewItem> = {};
        vision.detections.forEach((detection) => {
          const suggested = detection.suggested_action === 'update' || detection.suggested_action === 'add' ? detection.suggested_action : 'ignore';
          next[detection.detection_id] = { detection_id: detection.detection_id, action: suggested, product_id: detection.matched_product_id || null, name: detection.matched_product_name || detection.detected_name, quantity: detection.estimated_quantity ?? detection.current_quantity ?? 1, unit: detection.unit || detection.current_unit || 'pcs' };
        });
        setKitchenReview(next);
      }
      announceBackgroundResultHydrated(taskId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [params, houseId, sharedQuestion]);


  async function loadHouses() {
    try {
      const { data } = await api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } });
      const list = data.houses || [];
      setCurrentUser(data.user || null);
      setHouses(list);
      setPremiumTry(data.subscription.premium_try || null);
      const requested = Number(params.get('house'));
      const selected = list.find((row) => row.id === requested)?.id || list[0]?.id || null;
      setHouseId(selected);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function maybeShowHouseholdReminder(selected: number, brief: WeeklyAssistant) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (localStorage.getItem('ghm_smart_reminders') !== '1') return;
    const urgent = brief.out_of_stock.length + brief.low_stock.length + brief.expiring_soon.length + brief.expired.length;
    if (!urgent) return;
    const key = `ghm_autopilot_reminder_${selected}`;
    const lastShown = Number(localStorage.getItem(key) || 0);
    if (Date.now() - lastShown < 20 * 60 * 60 * 1000) return;
    const body = `${urgent} household item${urgent === 1 ? '' : 's'} need attention in ${brief.house_name}. Autopilot has prepared the next actions.`;
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('GHM Autopilot', {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `ghm-autopilot-${selected}`,
          data: { url: `/assistant?house=${selected}` },
        });
      } else {
        new Notification('GHM Autopilot', { body, icon: '/icon-192.png' });
      }
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // Device reminders are optional and must never block the household workspace.
    }
  }

  async function enableReminders() {
    if (typeof Notification === 'undefined') {
      setReminderPermission('unsupported');
      setMessage('This browser does not support web-app notifications. Autopilot still works normally.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setReminderPermission(permission);
      if (permission === 'granted') {
        localStorage.setItem('ghm_smart_reminders', '1');
        setMessage('Autopilot household reminders are enabled on this device.');
        if (houseId && assistant) await maybeShowHouseholdReminder(houseId, assistant);
      } else if (permission === 'denied') {
        localStorage.removeItem('ghm_smart_reminders');
        setMessage('Notifications are blocked for this site. You can change this later in browser or phone settings.');
      }
    } catch {
      setMessage('This browser could not enable notifications. Autopilot still works normally.');
    }
  }

  async function loadAutopilot(selected: number) {
    try {
      setBusy(true);
      setError('');
      const [assistantRes, autopilotRes, controlsRes, twinRes] = await Promise.all([
        api.get<WeeklyAssistant>(`/insights/houses/${selected}/weekly-assistant`, { params: { t: Date.now() } }),
        api.get<AutopilotOverview>(`/insights/houses/${selected}/autopilot`, { params: { t: Date.now() } }),
        api.get<AutopilotControls>(`/insights/houses/${selected}/autopilot-controls`, { params: { t: Date.now() } }),
        api.get<HouseholdDigitalTwin>(`/ai/houses/${selected}/digital-twin`, { params: { t: Date.now() } }),
      ]);
      setAssistant(assistantRes.data);
      setAutopilot(autopilotRes.data);
      setControls(controlsRes.data);
      setPreferredStoresText((controlsRes.data.preferred_stores || []).join(', '));
      setDigitalTwin(twinRes.data);
      void maybeShowHouseholdReminder(selected, assistantRes.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadHouses(); }, []);
  useEffect(() => { void api.get<{ configured: boolean }>('/food/capabilities').then(({ data }) => setFoodSuggestionsReady(Boolean(data.configured))).catch(() => setFoodSuggestionsReady(false)); }, []);
  useEffect(() => {
    if (!houseId) return;
    const nextParams = new URLSearchParams(params);
    nextParams.set('house', String(houseId));
    if (workspace === 'today') nextParams.delete('view');
    else nextParams.set('view', workspace);
    setParams(nextParams, { replace: true });
    setPlan(null);
    setKitchenCheck(null);
    setKitchenVision(null);
    setKitchenReview({});
    if (!params.get('bgTask')) setAgentAnswer(null);
    try {
      const saved = JSON.parse(sessionStorage.getItem(`ghm_agent_conversation_v123:${houseId}`) || '[]');
      setAgentTurns(Array.isArray(saved) ? saved.slice(-8) : []);
    } catch { setAgentTurns([]); }
    loadAutopilot(houseId);
  }, [houseId]);

  useEffect(() => {
    if (!houseId) return;
    try { sessionStorage.setItem(`ghm_agent_conversation_v123:${houseId}`, JSON.stringify(agentTurns.slice(-8))); } catch { /* noop */ }
  }, [houseId, agentTurns]);


  useEffect(() => {
    if (workspace !== 'intelligence' || (!agentTurns.length && !agentAnswer && !pendingAgentQuestion && !agentBusy)) return;
    const timer = window.setTimeout(() => {
      const scroller = agentScrollRef.current;
      if (!scroller) return;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [workspace, agentTurns.length, agentAnswer, pendingAgentQuestion, agentBusy]);

  useEffect(() => () => { agentRecognitionRef.current?.stop?.(); }, []);

  async function saveControls() {
    if (!houseId || !controls) return;
    try {
      setControlsBusy(true);
      setError('');
      const payload = {
        ...controls,
        preferred_stores: preferredStoresText.split(',').map((row) => row.trim()).filter(Boolean),
      };
      const { data } = await api.post<AutopilotControls>(`/insights/houses/${houseId}/autopilot-controls`, payload);
      setControls(data);
      setPreferredStoresText((data.preferred_stores || []).join(', '));
      setMessage('Autopilot household controls saved. The decision engine will use them on future suggestions.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setControlsBusy(false);
    }
  }

  async function chooseTripOption(option: AutopilotTripOption) {
    if (!houseId || !controls) return;
    try {
      setDecisionBusy(option.key);
      setError('');
      const recommendation = controls.trip_options.find((row) => row.recommended)?.key || null;
      const { data } = await api.post(`/insights/houses/${houseId}/autopilot-decisions`, {
        decision_kind: 'trip',
        recommendation,
        selected_option: option.key,
        delta_cost: option.extra_cost_vs_cheapest,
        context: {
          stores: option.store_names,
          estimated_total: option.estimated_total,
        },
      });
      setControls((current) => current ? {
        ...current,
        learned_pattern: data.learned_pattern,
        trip_options: current.trip_options.map((row) => ({ ...row, recommended: row.key === option.key })),
      } : current);
      setMessage(data.message || 'Trip choice saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDecisionBusy('');
    }
  }

  const latestAgentQuestion = agentPrompt.trim() || agentTurns[agentTurns.length - 1]?.question || sharedQuestion;
  const inferredAgentMode = detectAgentMode(latestAgentQuestion || '');
  const activeAgentMode = agentModeOverride || inferredAgentMode;
  const effectiveAgentContexts = agentContexts.length ? agentContexts : defaultContextForMode(activeAgentMode);
  const visiblePlanDays = useMemo(() => nextDayNames(planDays, appLocale), [planDays, appLocale]);
  const controlPercent = Math.max(0, 100 - (autopilot?.attention_score || 0));

  async function addSuggestedItems() {
    if (!houseId || !assistant?.suggested_items.length) return;
    try {
      setBusy(true);
      setMessage('');
      const items = assistant.suggested_items.map((item) => ({
        product_id: item.product_id,
        requested_quantity: item.requested_quantity || 1,
        bought_quantity: item.requested_quantity || 1,
        message: `GHM Autopilot · ${item.reason}`,
      }));
      let updated: ShoppingList;
      if (assistant.active_list_id) {
        const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists/${assistant.active_list_id}/items`, { items });
        updated = data;
        setMessage(`${items.length} restock suggestion${items.length === 1 ? '' : 's'} added to ${updated.title}.`);
      } else {
        const { data } = await api.post<ShoppingList>(`/houses/${houseId}/shopping-lists`, { title: 'Autopilot grocery list', items });
        updated = data;
        setMessage(`Created ${updated.title} with ${items.length} household restock suggestion${items.length === 1 ? '' : 's'}.`);
      }
      await loadAutopilot(houseId);
      window.dispatchEvent(new Event('account:refresh'));
      window.dispatchEvent(new CustomEvent('ghm:success-moment', { detail: { type: 'inventory_check', message: 'Your approved Kitchen Vision changes were applied and the household inventory is now refreshed.' } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addRecipeMissing(recipe: WeeklyAssistantRecipe) {
    if (!houseId || !recipe.missing_items.length) return;
    try {
      setRecipeBusy(recipe.name);
      setMessage('');
      setError('');
      const { data } = await api.post<RecipeMissingAddResponse>(`/insights/houses/${houseId}/recipes/add-missing`, {
        ingredients: recipe.missing_items,
        list_id: assistant?.active_list_id || undefined,
        recipe_name: recipe.name,
      });
      setMessage(data.message);
      await loadAutopilot(houseId);
      window.dispatchEvent(new Event('account:refresh'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRecipeBusy('');
    }
  }

  function toggleSkipDay(day: string) {
    setSkipDays((current) => current.includes(day) ? current.filter((row) => row !== day) : [...current, day]);
  }

  function applyHouseholdRoutine(key: 'normal' | 'busy' | 'guests' | 'away') {
    const days = nextDayNames(key === 'normal' ? 5 : key === 'busy' ? 3 : 5, appLocale);
    if (key === 'normal') {
      setPlanDays(5); setSkipDays([]); setServingOverrides({});
    } else if (key === 'busy') {
      setPlanDays(3); setSkipDays(days.slice(1, 2)); setServingOverrides({});
    } else if (key === 'guests') {
      setPlanDays(5); setSkipDays([]); setServingOverrides({ [days[2]]: Math.max(defaultServings + 2, 6) });
    } else {
      setPlanDays(5); setSkipDays(days.slice(2)); setServingOverrides({});
    }
    setMessage(key === 'normal' ? 'Normal-week routine applied.' : key === 'busy' ? 'Busy-week routine applied. One day is marked away/eating out.' : key === 'guests' ? 'Guest-week routine applied with a larger midweek serving count.' : 'Away-week routine applied. Adjust the away days before building if needed.');
  }

  async function buildHouseholdPlan() {
    if (!houseId) return;
    try {
      setPlanBusy(true);
      setError('');
      const usingPremiumTry = Boolean(premiumTry?.available && premiumTry.selected_feature === 'autopilot_planner');
      if (usingPremiumTry && !window.confirm('Use GHM Autopilot Planner as your one free Premium Try? The try is used only after GHM successfully builds the household plan.')) return;
      const taskId = makeBackgroundTaskId(`household-plan-${houseId}`);
      const href = `/assistant?house=${houseId}&view=plan&bgTask=${encodeURIComponent(taskId)}`;
      setMessage('This plan can take longer than 45–50 seconds. You can leave this section and keep using GHM; we’ll notify you when it is ready.');
      const data = await runBackgroundCapableTask<HouseholdPlan>({
        id: taskId,
        kind: 'household-plan',
        title: 'Household plan',
        message: 'GHM is building your plan from household data. You can keep using the app.',
        href,
        task: async () => (await api.post<HouseholdPlan>(`/insights/houses/${houseId}/household-plan`, {
          days: planDays,
          default_servings: defaultServings,
          skip_days: skipDays,
          guest_servings: servingOverrides,
          budget: budget.trim() ? Number(budget) : null,
        }, { headers: usingPremiumTry ? { 'X-GHM-Premium-Try': 'autopilot_planner' } : undefined, timeout: 120000 })).data,
      });
      setPlan(data);
      if (usingPremiumTry) {
        const refreshed = await api.get<PremiumTryStatus>('/billing/premium-try', { params: { t: Date.now() } }).catch(() => null);
        if (refreshed?.data) setPremiumTry(refreshed.data);
        window.dispatchEvent(new Event('account:refresh'));
      }
      window.dispatchEvent(new CustomEvent('ghm:success-moment', { detail: { type: 'meal_plan', message: `Your ${data.days_requested}-day household plan is ready with ${data.planned_days} meal day${data.planned_days === 1 ? '' : 's'} planned.` } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPlanBusy(false);
    }
  }

  async function runStockUpPremiumTry() {
    if (!houseId) return;
    try {
      setStockUpTryBusy(true);
      setError('');
      const { data } = await api.get<AutopilotOverview['stock_up']>(`/insights/houses/${houseId}/stock-up`, { headers: { 'X-GHM-Premium-Try': 'smart_stock_up' }, params: { t: Date.now() } });
      setAutopilot((current) => current ? { ...current, stock_up: data, stock_up_unlocked: true } : current);
      if (data.length) {
        const refreshed = await api.get<PremiumTryStatus>('/billing/premium-try', { params: { t: Date.now() } }).catch(() => null);
        if (refreshed?.data) setPremiumTry(refreshed.data);
        window.dispatchEvent(new Event('account:refresh'));
        setMessage(`Smart Stock-Up found ${data.length} history-aware opportunit${data.length === 1 ? 'y' : 'ies'}. Your one free Premium Try has been used.`);
      } else {
        setMessage('GHM did not find a high-confidence stock-up signal yet, so your one free Premium Try was not used.');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStockUpTryBusy(false);
    }
  }

  async function addPlanGroceries() {
    if (!houseId || !plan?.grocery_items.length) return;
    try {
      setPlanBusy(true);
      setMessage('');
      const chunks: string[][] = [];
      for (let index = 0; index < plan.grocery_items.length; index += 8) chunks.push(plan.grocery_items.slice(index, index + 8));
      let listId = assistant?.active_list_id || undefined;
      let listTitle = assistant?.active_list_title || 'Autopilot grocery list';
      for (const chunk of chunks) {
        const { data } = await api.post<RecipeMissingAddResponse>(`/insights/houses/${houseId}/recipes/add-missing`, {
          ingredients: chunk,
          list_id: listId,
          recipe_name: 'Autopilot weekly plan',
        });
        listId = data.list_id;
        listTitle = data.list_title;
      }
      setMessage(`${plan.grocery_items.length} planned ingredient${plan.grocery_items.length === 1 ? '' : 's'} are ready in ${listTitle}.`);
      await loadAutopilot(houseId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPlanBusy(false);
    }
  }

  async function runKitchenCheck() {
    if (!houseId) return;
    const files = Array.from(kitchenInputRef.current?.files || []);
    if (!files.length) {
      setError('Choose 1–4 fridge, freezer or pantry photos first.');
      return;
    }
    try {
      setKitchenBusy(true);
      setError('');
      const form = new FormData();
      files.slice(0, 4).forEach((file) => form.append('images', file));
      const { data } = await api.post<KitchenCheck>(`/insights/houses/${houseId}/kitchen-check`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setKitchenCheck(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setKitchenBusy(false);
    }
  }

  async function runKitchenVision() {
    if (!houseId) return;
    const files = Array.from(kitchenInputRef.current?.files || []);
    if (!files.length) {
      setError('Choose kitchen photos or a short video first.');
      return;
    }
    try {
      setKitchenBusy(true);
      setError('');
      setMessage('');
      const form = new FormData();
      files.slice(0, 6).forEach((file) => form.append('media', file));
      const taskId = makeBackgroundTaskId(`kitchen-vision-${houseId}`);
      const href = `/assistant?house=${houseId}&view=intelligence&bgTask=${encodeURIComponent(taskId)}`;
      setMessage('Kitchen Vision can take longer than 45–50 seconds for several images or video. You can leave this section and keep using GHM; we’ll notify you when the review is ready.');
      const data = await runBackgroundCapableTask<KitchenVisionResult>({
        id: taskId,
        kind: 'kitchen-vision',
        title: 'Kitchen Vision review',
        message: 'GHM is analyzing your kitchen media. You can continue using the app.',
        href,
        task: async () => (await api.post<KitchenVisionResult>(`/ai/houses/${houseId}/kitchen-vision`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })).data,
      });
      setKitchenVision(data);
      const review: Record<string, KitchenVisionReviewItem> = {};
      data.detections.forEach((detection) => {
        const suggested = detection.suggested_action === 'update' || detection.suggested_action === 'add' ? detection.suggested_action : 'ignore';
        review[detection.detection_id] = {
          detection_id: detection.detection_id,
          action: suggested,
          product_id: detection.matched_product_id || null,
          name: detection.matched_product_name || detection.detected_name,
          quantity: detection.estimated_quantity ?? detection.current_quantity ?? 1,
          unit: detection.unit || detection.current_unit || 'pcs',
        };
      });
      setKitchenReview(review);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setKitchenBusy(false);
    }
  }

  function updateKitchenReview(id: string, patch: Partial<KitchenVisionReviewItem>) {
    setKitchenReview((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function applyKitchenVision() {
    if (!houseId || !kitchenVision) return;
    try {
      setKitchenApplyBusy(true);
      setError('');
      const items = kitchenVision.detections.map((detection) => kitchenReview[detection.detection_id]).filter(Boolean);
      const { data } = await api.post<KitchenVisionApplyResponse>(`/ai/houses/${houseId}/kitchen-vision/apply`, {
        items,
        add_depleted_staples_to_list: kitchenAutoRestock,
      });
      setMessage(data.message + (data.added_to_list.length ? ` Added to shopping: ${data.added_to_list.join(', ')}.` : ''));
      setKitchenVision(null);
      setKitchenReview({});
      if (kitchenInputRef.current) kitchenInputRef.current.value = '';
      await loadAutopilot(houseId);
      window.dispatchEvent(new Event('account:refresh'));
      window.dispatchEvent(new CustomEvent('ghm:success-moment', { detail: { type: 'inventory_check', message: 'Your approved Kitchen Vision changes were applied and the household inventory is now refreshed.' } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setKitchenApplyBusy(false);
    }
  }

  async function askHouseholdAgent() {
    if (!houseId || !agentPrompt.trim()) return;
    try {
      setAgentBusy(true);
      setError('');
      setMessage('');
      const prompt = agentPrompt.trim();
      const askedAt = new Date().toISOString();
      setPendingAgentQuestion(prompt);
      setPendingAgentAskedAt(askedAt);
      setAgentPrompt('');
      const mode = agentModeOverride || detectAgentMode(prompt);
      const contextSources = agentContexts.length ? agentContexts : defaultContextForMode(mode);
      const taskId = makeBackgroundTaskId(`household-intelligence-${houseId}`);
      const href = `/assistant?house=${houseId}&view=intelligence&q=${encodeURIComponent(prompt)}&bgTask=${encodeURIComponent(taskId)}`;
      const history = agentTurns.slice(-6).flatMap((turn) => [
        { role: 'user' as const, content: turn.question },
        { role: 'assistant' as const, content: turn.response.answer },
      ]);
      setAgentAttachOpen(false);
      const data = await runBackgroundCapableTask<HouseholdAgentResponse>({
        id: taskId,
        kind: 'household-intelligence',
        title: 'Ask GHM answer',
        message: 'GHM is working with your household context. You can continue using the app.',
        href,
        task: async () => (await api.post<HouseholdAgentResponse>(`/ai/houses/${houseId}/household-agent`, {
          prompt,
          language,
          history,
          mode,
          context_sources: contextSources,
        }, {
          timeout: 120000,
          headers: householdIntelligenceTryReady ? { 'X-GHM-Premium-Try': 'household_intelligence' } : undefined,
        })).data,
      });
      setAgentAnswer(data);
      setAgentTurns((current) => [...current, { id: taskId, question: prompt, response: data, askedAt, answeredAt: new Date().toISOString() }].slice(-8));
      setPendingAgentQuestion('');
      setPendingAgentAskedAt(undefined);
      setAgentModeOverride(null);
      if (householdIntelligenceTryReady) {
        await loadHouses();
        window.dispatchEvent(new Event('account:refresh'));
      }
    } catch (err) {
      setError(errorMessage(err));
      setPendingAgentQuestion('');
      setPendingAgentAskedAt(undefined);
    } finally {
      setAgentBusy(false);
    }
  }

  function toggleAgentContext(source: AgentContextSource) {
    setAgentContexts((current) => {
      const mode = agentModeOverride || detectAgentMode(agentPrompt.trim() || agentTurns[agentTurns.length - 1]?.question || '');
      const base = current.length ? current : defaultContextForMode(mode);
      return base.includes(source) ? base.filter((item) => item !== source) : [...base, source];
    });
  }

  function startAgentVoice() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setError('Voice input is not available in this browser. You can type the same question instead.');
      return;
    }
    try {
      agentRecognitionRef.current?.stop?.();
      const recognition = new Recognition();
      recognition.lang = appLocale;
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onstart = () => setAgentListening(true);
      recognition.onend = () => setAgentListening(false);
      recognition.onerror = () => {
        setAgentListening(false);
        setError('GHM could not hear that clearly. Try again or type your question.');
      };
      recognition.onresult = (event: any) => {
        const spoken = String(event.results?.[0]?.[0]?.transcript || '').trim();
        if (spoken) {
          setAgentPrompt((current) => current ? `${current} ${spoken}` : spoken);
          window.setTimeout(() => agentInputRef.current?.focus({ preventScroll: true }), 60);
        }
      };
      recognition.start();
      agentRecognitionRef.current = recognition;
    } catch {
      setAgentListening(false);
      setError('Voice input could not start. Try typing your question.');
    }
  }

  function startNewConversation() {
    setAgentTurns([]);
    setAgentAnswer(null);
    setAgentPrompt('');
    setPendingAgentQuestion('');
    setPendingAgentAskedAt(undefined);
    setAgentModeOverride(null);
    setAgentContexts([]);
    setAgentAttachOpen(false);
    if (houseId) sessionStorage.removeItem(`ghm_agent_conversation_v123:${houseId}`);
    const nextParams = new URLSearchParams(params);
    nextParams.delete('q');
    nextParams.delete('bgTask');
    nextParams.delete('focus');
    nextParams.delete('from');
    setParams(nextParams, { replace: true });
    setNewConversationConfirm(false);
    window.setTimeout(() => {
      agentInputRef.current?.focus({ preventScroll: true });
    }, 80);
  }

  async function copyReceiptInquiry(issue: ReceiptGuardianIssue) {
    const store = issue.store_name || 'the store';
    const purchaseDate = issue.receipt_date ? ` on ${issue.receipt_date}` : '';
    const item = issue.product_name ? ` for ${issue.product_name}` : '';
    const amount = issue.amount_to_review != null ? ` The amount I would like verified is ${money(issue.amount_to_review, autopilot?.currency_code)}.` : '';
    const text = `Hello, I am reviewing a receipt from ${store}${purchaseDate}${item}. ${issue.detail}${amount} Could you please verify whether the receipt was charged correctly? Thank you.`;
    try {
      await navigator.clipboard.writeText(text);
      setMessage('A neutral store inquiry was copied. Review the receipt and promotion conditions before sending it.');
    } catch {
      setMessage(text);
    }
  }

  async function toggleCommunityPriceSharing() {
    if (!houseId || !autopilot || selectedHouse?.role !== 'owner') return;
    const nextEnabled = !autopilot.community_price_pulse.sharing_enabled;
    try {
      setCommunityPriceBusy(true);
      setError('');
      const { data } = await api.post(`/insights/houses/${houseId}/community-price-sharing`, { enabled: nextEnabled });
      setAutopilot((current) => current ? { ...current, community_price_pulse: data } : current);
      setHouses((current) => current.map((house) => house.id === houseId ? { ...house, contribute_community_prices: nextEnabled } : house));
      setMessage(nextEnabled
        ? 'Community Price Pulse is on. Future reviewed receipt prices can contribute privacy-protected local observations.'
        : 'Community Price Pulse sharing is off and this household’s prior contributions were removed.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCommunityPriceBusy(false);
    }
  }

  if (!houses.length && !busy && !error) {
    return (
      <main className="page shell wide autopilot-page cinematic-page">
        <section className="autopilot-empty panel">
          <span>🏡</span><div><p className="eyebrow">GHM AUTOPILOT</p><h1>Create or join a Grocery Home first</h1><p>Autopilot becomes useful as soon as the household has a few groceries, a list or a receipt.</p></div>
          <Link to="/houses" className="primary center-link">Set up my home</Link>
        </section>
      </main>
    );
  }

  if (workspace === 'intelligence') {
    if (!householdIntelligenceUnlocked) {
      const freeOwner = housePlanKey === 'free' && selectedHouse?.role === 'owner';
      return (
        <main className="page shell wide v125-ask-page" data-workspace="intelligence">
          <section className="v129-feature-lock">
            <span className="v129-feature-lock-icon" aria-hidden="true">✦</span>
            <div>
              <p className="eyebrow">ASK GHM · HOUSEHOLD INTELLIGENCE</p>
              <h1>Household-aware AI starts with Family Plus.</h1>
              <p>Ask GHM can reason across inventory, shopping, receipts, expenses and saved recipes. Free Starter keeps the core household tools free and lets the account owner try one Premium workflow once.</p>
              <div className="v129-feature-lock-actions">
                {freeOwner && premiumTry?.available ? <Link className="primary center-link" to={`/premium-try?feature=household_intelligence&house=${houseId || ''}`}>Try Ask GHM once free →</Link> : null}
                <Link className={freeOwner && premiumTry?.available ? 'secondary center-link' : 'primary center-link'} to="/pricing">See Family Plus →</Link>
              </div>
              {housePlanKey === 'basic' ? <small>This Grocery Home is on Basic Home. Upgrade the house owner to Family Plus or Household Pro to use Ask GHM.</small> : null}
            </div>
          </section>
        </main>
      );
    }
    const suggestedPrompts = [
      'What can we cook tonight with what we already have?',
      'What should we buy this week?',
      'Why is our grocery spending higher?',
      'What should we use before it expires?',
    ];
    return (
      <main className="page shell wide v125-ask-page" data-workspace="intelligence">
        <section className="v125-ask-shell">
          <div className="v127-ask-scroll-area" ref={agentScrollRef}>
            <div className="v132-chat-tools" aria-label="Ask GHM conversation controls">
              <label className="v132-chat-select"><span>Household</span><select value={houseId || ''} onChange={(event) => setHouseId(Number(event.target.value))}>{houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label>
              <label className="v132-chat-select"><span>Mode</span><select value={agentModeOverride || 'auto'} onChange={(event) => setAgentModeOverride(event.target.value === 'auto' ? null : event.target.value as AgentMode)}><option value="auto">✦ {agentModeMeta[inferredAgentMode].label} · Auto</option>{(Object.keys(agentModeMeta) as AgentMode[]).map((mode) => <option key={mode} value={mode}>{agentModeMeta[mode].icon} {agentModeMeta[mode].label}</option>)}</select></label>
              {houseId ? <Link className="secondary v132-tool-action" to={`/assistant?house=${houseId}&view=insights`}>📈 Insights</Link> : null}
              {agentTurns.length ? <button type="button" className="secondary v132-tool-action" onClick={() => setNewConversationConfirm(true)}>＋ New conversation</button> : null}
            </div>

            {error ? <div className="error v125-ask-message v132-chat-error">{error}</div> : null}

            <div className="v125-chat-transcript v132-chat-transcript" aria-live="polite">
              {!agentTurns.length && !agentAnswer && !agentBusy ? <section className="v132-welcome-thread">
                <div className="v132-ghm-line">
                  <img className="v132-ghm-avatar-image" src="/brand/grocery-house-manager-icon.png" alt="" aria-hidden="true" />
                  <div className="v132-welcome-bubble">
                    <header><strong>GHM</strong><time>Now</time></header>
                    <p>Hi! 👋 I’m your Grocery House Manager assistant. I can help with groceries, meal planning, recipes, receipts, prices and household spending.</p>
                    <p>What would you like to do today?</p>
                  </div>
                </div>
                <div className="v132-quick-prompts">{suggestedPrompts.slice(0, 4).map((prompt) => <button key={prompt} type="button" onClick={() => { setAgentPrompt(prompt); window.setTimeout(() => agentInputRef.current?.focus({ preventScroll: true }), 50); }}>{prompt}<span>→</span></button>)}</div>
              </section> : null}

              {agentTurns.map((turn, index) => {
                const turnMode = detectAgentMode(turn.question);
                const actions = houseId ? actionLinksForMode(turnMode, houseId) : [];
                return <article key={turn.id} className="v125-chat-turn v132-chat-turn">
                  <div className="v132-user-line">
                    <div className="v125-user-message v132-user-message"><header><strong>You</strong>{turn.askedAt ? <time>{formatAgentTime(turn.askedAt, appLocale)}</time> : null}</header><p>{turn.question}</p></div>
                    <div className="v133-user-avatar" aria-hidden="true">{currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt="" /> : <span>{userInitials(currentUser)}</span>}</div>
                  </div>
                  <div className="v132-ghm-line">
                    <img className="v132-ghm-avatar-image" src="/brand/grocery-house-manager-icon.png" alt="" aria-hidden="true" />
                    <div data-ghm-background-result={index === agentTurns.length - 1 ? 'true' : undefined} className={`v125-ghm-message v132-ghm-message ${turn.response.configured ? 'live' : 'setup'}`} tabIndex={-1}>
                      <header><div><strong>GHM</strong><small>{agentModeMeta[turnMode].label} · household context</small></div>{turn.answeredAt ? <time>{formatAgentTime(turn.answeredAt, appLocale)}</time> : null}</header>
                      <StructuredAiResponse text={turn.response.answer} />
                      {turn.response.configured && actions.length ? <div className="v125-answer-actions">{actions.map((action) => <Link key={action.href} to={action.href} className="secondary"><span aria-hidden="true">{action.icon}</span>{action.label}</Link>)}</div> : null}
                    </div>
                  </div>
                </article>;
              })}

              {!agentTurns.length && agentAnswer ? <div className="v132-ghm-line"><img className="v132-ghm-avatar-image" src="/brand/grocery-house-manager-icon.png" alt="" aria-hidden="true" /><div data-ghm-background-result="true" className={`v125-ghm-message v132-ghm-message ${agentAnswer.configured ? 'live' : 'setup'}`} tabIndex={-1}><header><div><strong>GHM</strong><small>{agentModeMeta[activeAgentMode].label} · household context</small></div></header><StructuredAiResponse text={agentAnswer.answer} /></div></div> : null}

              {pendingAgentQuestion ? <div className="v132-user-line v132-pending-user"><div className="v125-user-message v132-user-message"><header><strong>You</strong>{pendingAgentAskedAt ? <time>{formatAgentTime(pendingAgentAskedAt, appLocale)}</time> : null}</header><p>{pendingAgentQuestion}</p></div><div className="v133-user-avatar" aria-hidden="true">{currentUser?.avatar_url ? <img src={currentUser.avatar_url} alt="" /> : <span>{userInitials(currentUser)}</span>}</div></div> : null}

              {agentBusy ? <div className="v132-ghm-line"><img className="v132-ghm-avatar-image" src="/brand/grocery-house-manager-icon.png" alt="" aria-hidden="true" /><div className="v125-ghm-message v132-ghm-message v125-thinking"><header><div><strong>GHM</strong><small>Thinking with your household…</small></div></header><div className="v125-thinking-dots"><i/><i/><i/></div></div></div> : null}
              <div ref={agentConversationEndRef} />
            </div>
          </div>

          <div className="v125-composer-zone v132-composer-zone">
            {agentAttachOpen ? <section className="v125-context-picker" aria-label="Choose household context">
              <header><div><strong>Bring household context into this question</strong><small>GHM uses these categories plus baseline household safety and pattern signals for this turn.</small></div><button type="button" className="icon-button" onClick={() => setAgentAttachOpen(false)} aria-label="Close context picker">×</button></header>
              <div>{(Object.keys(agentContextMeta) as AgentContextSource[]).map((source) => {
                const selected = agentContexts.length ? agentContexts.includes(source) : effectiveAgentContexts.includes(source);
                return <button type="button" key={source} className={selected ? 'selected' : ''} onClick={() => toggleAgentContext(source)}><span>{agentContextMeta[source].icon}</span><strong>{agentContextMeta[source].label}</strong><i>{selected ? '✓' : '+'}</i></button>;
              })}</div>
              <footer><button type="button" className="ghost-button" onClick={() => setAgentContexts([])}>Use automatic context</button><small>{agentContexts.length ? `${agentContexts.length} selected manually` : `Auto: ${effectiveAgentContexts.map((source) => agentContextMeta[source].label).join(', ')}`}</small></footer>
            </section> : null}

            <div className="v125-context-summary"><span>{agentContexts.length ? 'Using selected context' : 'Automatic context'}</span>{effectiveAgentContexts.map((source) => <em key={source}>{agentContextMeta[source].icon} {agentContextMeta[source].label}</em>)}</div>

            <div className={`v125-ask-composer ${agentListening ? 'is-listening' : ''}`}>
              <button type="button" className="v125-compose-icon" onClick={() => setAgentAttachOpen((open) => !open)} aria-label="Attach household context" title="Attach household context">＋</button>
              <textarea ref={agentInputRef} rows={1} value={agentPrompt} onChange={(event) => setAgentPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void askHouseholdAgent(); }} placeholder={agentTurns.length ? 'Ask a follow-up…' : 'Ask GHM anything…'} />
              <button type="button" className="v125-compose-icon mic" onClick={startAgentVoice} aria-label={agentListening ? 'Listening' : 'Speak to Ask GHM'} title={agentListening ? 'Listening…' : 'Speak'}>{agentListening ? <span className="v125-mic-live" aria-hidden="true">◉</span> : <img src="/brand/mic-symbol.png" alt="" className="v125-mic-image" aria-hidden="true" />}</button>
              <button type="button" className="v125-send" onClick={() => void askHouseholdAgent()} disabled={agentBusy || !agentPrompt.trim()} aria-label="Send to Ask GHM">➤</button>
            </div>
            <small className="v125-composer-hint">Continue naturally with follow-up questions. Press Ctrl/⌘ + Enter to send.</small>
          </div>
        </section>

        {newConversationConfirm ? <OverlayPortal>
          <div className="modal-backdrop v124-conversation-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewConversationConfirm(false); }}>
            <section className="compact-dialog focus-dialog v124-conversation-confirm" role="dialog" aria-modal="true" aria-label="Start a new conversation?" onMouseDown={(event) => event.stopPropagation()}>
              <header className="focus-dialog-titlebar"><div><p className="eyebrow">NEW CONVERSATION</p><h2>Start a new conversation?</h2><p>Your current Ask GHM conversation will be cleared from this browser session.</p></div><button type="button" className="icon-button" data-dialog-close="true" aria-label="Close" onClick={() => setNewConversationConfirm(false)}>×</button></header>
              <div className="focus-dialog-scroll v124-conversation-confirm-copy"><p>Use a new conversation when you want GHM to stop using the current follow-up context.</p></div>
              <footer className="focus-dialog-actions v124-conversation-confirm-actions"><button type="button" className="secondary" onClick={() => setNewConversationConfirm(false)}>Keep conversation</button><button type="button" className="primary" onClick={startNewConversation}>Start new conversation</button></footer>
            </section>
          </div>
        </OverlayPortal> : null}
      </main>
    );
  }

  return (
    <main className="page shell wide autopilot-page cinematic-page" data-workspace={workspace}>
      <header className="autopilot-hero">
        <div className="autopilot-hero-copy">
          <div className="autopilot-kicker-row"><span className="autopilot-live-dot" /> <p className="eyebrow">GHM AUTOPILOT · YOUR HOUSEHOLD, ONE STEP AHEAD</p>{autopilot ? <Link to="/pricing" className={`autopilot-plan-chip plan-${autopilot.plan_key}`}>{autopilot.plan_key === 'pro' ? 'Household Pro' : autopilot.plan_key === 'family' ? 'Family Plus' : autopilot.plan_key === 'basic' ? 'Basic Home' : 'Free Starter'}</Link> : null}</div>
          <h1>{autopilot?.headline || 'Your household, one step ahead.'}</h1>
          <p>{autopilot?.subheadline || 'Building a plan from your inventory, receipts, shopping list, saved prices and expiry dates.'}</p>
          <div className="autopilot-hero-actions">
            {autopilot?.best_next_action_href ? <Link className="primary center-link" to={autopilot.best_next_action_href}>{autopilot.best_next_action} →</Link> : null}
            {reminderPermission === 'default' ? <button type="button" className="secondary" onClick={enableReminders}>🔔 Enable smart reminders</button> : null}
            {reminderPermission === 'granted' ? <span className="autopilot-reminder-on">✓ Reminders on</span> : null}
          </div>
        </div>
        <div className="autopilot-control-card" aria-label="Household control score">
          <div className="autopilot-ring" style={{ '--control': `${controlPercent}%` } as CSSProperties}><span><strong>{controlPercent}</strong><small>/100</small></span></div>
          <div><span>HOUSEHOLD CONTROL</span><strong>{controlPercent >= 85 ? 'Calm & ready' : controlPercent >= 60 ? 'A few actions' : 'Needs attention'}</strong><small>Based on stock, expiry, receipts and safety checks—not a financial or food-safety guarantee.</small></div>
        </div>
      </header>

      <section className="autopilot-toolbar">
        <label><span>Household</span><select value={houseId || ''} onChange={(event) => setHouseId(Number(event.target.value))}>{houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label>
        <button type="button" className="secondary" onClick={() => houseId && loadAutopilot(houseId)} disabled={!houseId || busy}>{busy ? 'Refreshing…' : '↻ Refresh intelligence'}</button>
        <button type="button" className={`secondary v125-insights-toolbar-button ${workspace === 'insights' ? 'active' : ''}`} onClick={() => chooseWorkspace('insights')}>📈 Household insights</button>
        <nav className="v95-autopilot-tabs" aria-label="Autopilot workspaces">
          <button type="button" className={workspace === 'today' ? 'active' : ''} onClick={() => chooseWorkspace('today')}><span>✦</span><strong>Today</strong><small>Next action</small></button>
          <button type="button" onClick={() => chooseWorkspace('intelligence')}><span>✦</span><strong>Ask GHM</strong><small>Household AI</small></button>
          <button type="button" className={workspace === 'plan' ? 'active' : ''} onClick={() => chooseWorkspace('plan')}><span>◫</span><strong>Plan</strong><small>Week & meals</small></button>
          <button type="button" className={workspace === 'spend' ? 'active' : ''} onClick={() => chooseWorkspace('spend')}><span>$</span><strong>Shop smarter</strong><small>Prices & value</small></button>
          <button type="button" className={workspace === 'protect' ? 'active' : ''} onClick={() => chooseWorkspace('protect')}><span>🛡</span><strong>Protect</strong><small>Receipts & vision</small></button>
        </nav>
      </section>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <section id="today" className="autopilot-metric-grid" data-v95-view="today">
        <article className="autopilot-metric money"><span>💰</span><div><small>Verified savings · {autopilot?.savings_ledger.month_label || 'this month'}</small><strong>{money(autopilot?.verified_savings || 0, autopilot?.currency_code)}</strong><em>Evidence-backed only</em></div></article>
        <article className="autopilot-metric opportunity"><span>✨</span><div><small>Current opportunities</small><strong>{money(autopilot?.potential_savings || 0, autopilot?.currency_code)}</strong><em>Not counted as saved yet</em></div></article>
        <article className="autopilot-metric trip"><span>🛒</span><div><small>Next trip</small><strong>{autopilot?.active_list_items || 0} items</strong><em>{autopilot?.restock_items || 0} restock suggestions</em></div></article>
        <article className={`autopilot-metric protect ${(autopilot?.receipt_issues || 0) + (autopilot?.recall_matches || 0) ? 'attention' : ''}`}><span>🛡️</span><div><small>Protection checks</small><strong>{(autopilot?.receipt_issues || 0) + (autopilot?.recall_matches || 0)}</strong><em>receipt + recall signals</em></div></article>
      </section>

      <section className="autopilot-command-deck" data-v95-view="today">
        <article className="autopilot-command primary-command">
          <div><p className="eyebrow">WHAT SHOULD I DO TODAY?</p><h2>{autopilot?.headline || 'Autopilot is building your next move'}</h2><p>{autopilot?.subheadline}</p></div>
          <div className="autopilot-command-facts">
            <span><strong>{autopilot?.expiring_items || 0}</strong><small>expiry actions</small></span>
            <span><strong>{autopilot?.restock_items || 0}</strong><small>restock actions</small></span>
            <span><strong>{autopilot?.receipt_issues || 0}</strong><small>receipt checks</small></span>
          </div>
          {autopilot?.best_next_action_href ? <Link to={autopilot.best_next_action_href} className="primary center-link full">{autopilot.best_next_action}</Link> : null}
        </article>

        <article className="autopilot-command restock-command">
          <div className="panel-title-row"><div><p className="eyebrow">PREDICTIVE RESTOCK</p><h2>Likely needed next</h2></div><span className="badge">Inventory-aware</span></div>
          <p>{assistant?.message}</p>
          <div className="autopilot-chip-cloud">
            {assistant?.suggested_items.slice(0, 6).map((item) => <span key={item.product_id}><strong>{item.product_name}</strong><small>{item.reason} · {item.requested_quantity}</small></span>)}
            {!assistant?.suggested_items.length ? <span className="autopilot-clear-chip">✓ Low-stock items are already covered.</span> : null}
          </div>
          {assistant?.suggested_items.length ? <button type="button" className="secondary full" onClick={addSuggestedItems} disabled={busy}>{assistant.active_list_id ? `Add ${assistant.suggested_items.length} to current list` : 'Create my smart list'}</button> : <Link to={`/houses/${houseId}/shopping`} className="secondary center-link full">Open shopping</Link>}
        </article>
      </section>

      <section className="autopilot-section v93-intelligence-section" data-v95-view="insights">
        <header className="autopilot-section-heading"><div><p className="eyebrow">HOUSEHOLD FORECAST · LEARNING FROM YOUR HOME</p><h2>GHM learns how your home actually runs.</h2><p>Predictions come from real purchase cadence, current inventory and the choices your household actually makes—not from made-up AI numbers.</p></div><span className="autopilot-feature-number">AI</span></header>
        <div className="v93-twin-grid">
          <article className="v93-twin-overview">
            <div className="v93-twin-orb"><strong>{digitalTwin?.products_likely_needed_7d || 0}</strong><small>likely needed<br/>within 7 days</small></div>
            <div><p className="eyebrow">CURRENT PATTERN</p><h3>{(digitalTwin?.decision_pattern || 'Learning').replace(/_/g, ' ')}</h3><p>{digitalTwin?.message}</p>{digitalTwin?.decision_notes.map((note) => <small key={note}>• {note}</small>)}</div>
          </article>
          <article className="v93-twin-forecast">
            <div className="panel-title-row"><div><p className="eyebrow">DEPLETION FORECAST</p><h3>Products Autopilot is watching</h3></div><span className="badge">{digitalTwin?.products_modeled || 0} modeled</span></div>
            <div className="v93-twin-product-list">{digitalTwin?.products.slice(0, 8).map((product) => <div key={product.product_id} className={product.likely_needed_within_7_days ? 'soon' : ''}><span><strong>{product.product_name}</strong><small>{product.current_quantity} {product.unit} in inventory · {product.confidence} confidence</small></span><b>{product.predicted_days_remaining != null ? `~${product.predicted_days_remaining}d` : 'Learning'}</b><p>{product.reason}</p></div>)}</div>
          </article>
        </div>
        <div className="v125-insights-return"><Link className="primary center-link" to={houseId ? `/assistant?house=${houseId}&view=intelligence` : '/assistant?view=intelligence'}>✦ Ask GHM about these insights</Link></div>
      </section>

      <section id="weekly-plan" className="autopilot-section autopilot-week-section" data-v95-view="plan">
        <header className="autopilot-section-heading"><div><p className="eyebrow">THIS WEEK · MEALS + BUDGET</p><h2>Tell us only what changed. Autopilot handles the groceries.</h2><p>Choose how many days you are planning, servings, days you are away, and an optional budget. The planner prioritizes food already at home and items that should be used soon.</p></div><span className="autopilot-feature-number">01</span></header>
        {(autopilot?.planner_unlocked || (premiumTry?.selected_feature === 'autopilot_planner' && (premiumTry.available || Boolean(plan)))) ? <div className="autopilot-plan-layout">
          <div className="autopilot-plan-controls">
            <div className="v98-routine-strip">
              <div><small>HOUSEHOLD ROUTINES</small><strong>Start from real life, not a blank form.</strong></div>
              <div><button type="button" onClick={() => applyHouseholdRoutine('normal')}>Normal week</button><button type="button" onClick={() => applyHouseholdRoutine('busy')}>Busy week</button><button type="button" onClick={() => applyHouseholdRoutine('guests')}>Guests coming</button><button type="button" onClick={() => applyHouseholdRoutine('away')}>Going away</button></div>
            </div>
            <div className="autopilot-control-grid">
              <label><span>Plan length</span><select value={planDays} onChange={(event) => { setPlanDays(Number(event.target.value)); setSkipDays([]); setServingOverrides({}); }}><option value={3}>3 days</option><option value={5}>5 days</option><option value={7}>7 days</option></select></label>
              <label><span>Default servings</span><input type="number" min={1} max={20} value={defaultServings} onChange={(event) => setDefaultServings(Math.max(1, Number(event.target.value) || 1))} /></label>
              <label><span>Grocery budget <small>optional</small></span><input inputMode="decimal" placeholder="e.g. 75" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^0-9.]/g, ''))} /></label>
            </div>
            <div className="autopilot-day-editor">
              {visiblePlanDays.map((day) => {
                const skipped = skipDays.includes(day);
                return <div key={day} className={`autopilot-day-setting ${skipped ? 'skipped' : ''}`}><button type="button" onClick={() => toggleSkipDay(day)}><strong>{day.slice(0, 3)}</strong><small>{skipped ? 'Away / eating out' : 'Eating at home'}</small></button>{!skipped ? <label><span>Servings</span><input type="number" min={1} max={20} value={servingOverrides[day] || defaultServings} onChange={(event) => setServingOverrides((current) => ({ ...current, [day]: Math.max(1, Number(event.target.value) || defaultServings) }))} /></label> : null}</div>;
              })}
            </div>
            <button type="button" className="primary full autopilot-build-plan" onClick={buildHouseholdPlan} disabled={planBusy}>{planBusy ? 'Building from your household data…' : premiumTry?.available && premiumTry.selected_feature === 'autopilot_planner' ? '✨ Use free Premium Try — build my week' : '✨ Build my week'}</button>
            {planBusy ? <div className="v98-background-work-note"><span>✦</span><div><strong>You can keep using the rest of GHM.</strong><small>This plan is being prepared in the background. You can leave this section and continue using GHM; the notification bell will tell you when the result is ready.</small></div></div> : null}
            <p className="autopilot-trust-note">No fake grocery prices: if an ingredient has no reliable saved price, it stays clearly marked as unpriced.</p>
          </div>

          <div className="autopilot-plan-result" data-ghm-background-result={plan ? 'true' : undefined}>
            {!plan ? <div className="autopilot-plan-placeholder"><span>🍲</span><h3>Your week will appear here</h3><p>Autopilot will use your real inventory, expiry dates and existing shopping list before asking you to buy more.</p></div> : <>
              <div className="autopilot-plan-summary"><div><small>Planned at home</small><strong>{plan.planned_days}/{plan.days_requested} days</strong></div><div><small>Known grocery cost</small><strong>{money(plan.known_grocery_cost, plan.currency_code)}</strong></div>{plan.budget != null ? <div className={(plan.known_budget_buffer || 0) >= 0 ? 'positive' : 'negative'}><small>Known budget buffer</small><strong>{money(plan.known_budget_buffer || 0, plan.currency_code)}</strong></div> : null}</div>
              <div className="autopilot-plan-days">{plan.days.map((day) => <article key={day.day_name} className={`autopilot-plan-day ${day.status}`}><header><span>{day.day_name.slice(0, 3)}</span><div><strong>{day.status === 'away' ? 'Away / eating out' : day.recipe_name || 'Open meal'}</strong><small>{day.status === 'meal' ? `${day.servings} servings` : day.reason}</small></div></header>{day.use_soon_items.length ? <p className="use-soon">⏳ Use before expiry: {day.use_soon_items.join(', ')}</p> : null}{day.missing_items.length ? <p className="missing">🛒 Need: {day.missing_items.join(', ')}</p> : day.status === 'meal' ? <p className="ready">✓ Required ingredients already covered</p> : null}</article>)}</div>
              <div className="autopilot-plan-grocery"><div><strong>{plan.grocery_items.length ? `${plan.grocery_items.length} grocery item${plan.grocery_items.length === 1 ? '' : 's'} needed` : 'No missing ingredients for these matched meals'}</strong><small>{plan.message}</small></div>{plan.grocery_items.length ? <button type="button" className="primary" onClick={addPlanGroceries} disabled={planBusy}>Add plan to grocery list</button> : null}</div>
              {plan.unpriced_items.length ? <div className="autopilot-unpriced"><strong>Price still unknown</strong><span>{plan.unpriced_items.join(' · ')}</span><small>Autopilot refuses to guess these prices. A receipt, flyer or saved price will fill them later.</small></div> : null}
            </>}
          </div>
        </div> : <div className="autopilot-premium-lock autopilot-premium-lock-wide">
          <span className="autopilot-lock-icon">✨</span>
          <div><p className="eyebrow">FAMILY PLUS AUTOMATION</p><h3>Weekly Planner + Budget Rescue</h3><p>Family Plus turns your inventory, expiry dates, days at home, servings and known prices into a household plan without inventing unknown costs.</p><div className="autopilot-lock-points"><span>✓ Use-soon meal priority</span><span>✓ Away / eating-out days</span><span>✓ Budget-aware grocery gaps</span><span>✓ One-tap list creation</span></div></div>
          {premiumTry?.available ? <Link to={`/premium-try?feature=autopilot_planner&house=${houseId || ''}`} className="primary center-link">Try Autopilot once free →</Link> : <Link to="/pricing" className="primary center-link">Unlock Family Plus →</Link>}
        </div>}

        {foodSuggestionsReady && <div className="v98-food-tonight-inline"><span>🍽️</span><div><small>DON'T FEEL LIKE COOKING?</small><strong>Food Tonight stays one click away—not another permanent module.</strong><p>See nearby restaurants or food stores, prepare dietary ordering instructions, then return to your weekly plan.</p></div><Link className="secondary center-link" to={`/houses/${houseId}/food`}>See nearby options →</Link></div>}

        <div className="autopilot-meal-suggestions">
          <div className="panel-title-row"><div><p className="eyebrow">COOK FROM WHAT YOU OWN</p><h3>Strong inventory matches right now</h3></div><Link to={`/houses/${houseId}/meals`}>All meals & community recipes →</Link></div>
          <div className="autopilot-meal-grid">{assistant?.recipes.slice(0, 4).map((recipe) => <article key={recipe.name}><span className={recipe.status === 'ready' ? 'ready' : 'almost'}>{recipe.status === 'ready' ? '✓ READY' : '＋ ALMOST'}</span><strong>{recipe.name}</strong><p>{recipe.reason}</p>{recipe.use_soon_items.length ? <small>⏳ Use before expiry: {recipe.use_soon_items.join(', ')}</small> : null}{recipe.missing_items.length && recipe.missing_on_list.length !== recipe.missing_items.length ? <button type="button" className="secondary" disabled={Boolean(recipeBusy)} onClick={() => addRecipeMissing(recipe)}>{recipeBusy === recipe.name ? 'Adding…' : `Add ${recipe.missing_items.join(', ')}`}</button> : null}</article>)}</div>
        </div>
      </section>

      <section id="money" className="autopilot-section autopilot-money-section" data-v95-view="spend">
        <header className="autopilot-section-heading"><div><p className="eyebrow">SMART SPENDING</p><h2>Don't just track spending. Decide before you spend.</h2><p>Automatic Trip Check remains inside Shopping where it belongs; Autopilot turns its price knowledge into decisions, stock-up opportunities and a defensible savings ledger.</p></div><span className="autopilot-feature-number">02</span></header>
        {controls ? <div className="autopilot-decision-stack">
          <article className="autopilot-preference-panel">
            <header className="panel-title-row"><div><p className="eyebrow">USER CHOICE CONTROLS</p><h3>Tell Autopilot how this household likes to decide</h3></div><span className="badge active">Learns patterns</span></header>
            <div className="autopilot-control-grid v92-user-controls-grid">
              <label><span>Decision style</span><select value={controls.strategy} onChange={(event) => setControls((current) => current ? { ...current, strategy: event.target.value } : current)}><option value="balanced">Balanced</option><option value="lowest_cost">Lowest cost first</option><option value="premium">Premium / familiar first</option><option value="convenience">Convenience first</option></select></label>
              <label><span>Max stores per trip</span><select value={controls.max_stores} onChange={(event) => setControls((current) => current ? { ...current, max_stores: Number(event.target.value) } : current)}><option value={1}>1 store</option><option value={2}>2 stores</option><option value={3}>Up to 3 stores</option></select></label>
              <label><span>Preferred stores <small>comma separated</small></span><input value={preferredStoresText} onChange={(event) => setPreferredStoresText(event.target.value)} placeholder="e.g. Costco, Walmart" /></label>
              <div className="autopilot-toggle-stack">
                <button type="button" className={`autopilot-toggle ${controls.allow_premium ? 'on' : ''}`} onClick={() => setControls((current) => current ? { ...current, allow_premium: !current.allow_premium } : current)}><strong>Allow a higher-cost preferred option</strong><small>When the family wants comfort, brand loyalty or a familiar store.</small></button>
                <button type="button" className={`autopilot-toggle ${controls.allow_split_trip ? 'on' : ''}`} onClick={() => setControls((current) => current ? { ...current, allow_split_trip: !current.allow_split_trip } : current)}><strong>Allow split trips</strong><small>Let Autopilot use more than one store when savings justify it.</small></button>
                <button type="button" className={`autopilot-toggle ${controls.learning_enabled ? 'on' : ''}`} onClick={() => setControls((current) => current ? { ...current, learning_enabled: !current.learning_enabled } : current)}><strong>Learn from our choices</strong><small>Autopilot remembers the options you actually pick and adapts future suggestions.</small></button>
                <button type="button" className={`autopilot-toggle ${controls.use_community_recipes ? 'on' : ''}`} onClick={() => setControls((current) => current ? { ...current, use_community_recipes: !current.use_community_recipes } : current)}><strong>Use broader recipe inspiration</strong><small>Allow meal ideas to pull harder from community recipes when useful.</small></button>
              </div>
            </div>
            <div className="autopilot-pattern-strip"><span><strong>{controls.learned_pattern.confidence_label}</strong><small>Preferred mode: {controls.learned_pattern.preferred_mode.replace(/_/g, ' ')}</small></span><div>{controls.learned_pattern.notes.map((note) => <small key={note}>{note}</small>)}</div></div>
            <button type="button" className="primary" onClick={saveControls} disabled={controlsBusy}>{controlsBusy ? 'Saving controls…' : 'Save household controls'}</button>
          </article>

          <article className="autopilot-trip-choice-panel">
            <header className="panel-title-row"><div><p className="eyebrow">FLEXIBLE TRIP OPTIONS</p><h3>Choose the cheapest, balanced or your preferred option</h3></div><span className="badge">Choice-aware</span></header>
            {controls.trip_options.length ? <div className="autopilot-trip-choice-grid">{controls.trip_options.map((option) => <article key={`${option.key}-${option.store_names.join('-')}`} className={`autopilot-trip-choice-card ${option.recommended ? 'recommended' : ''}`}><div className="autopilot-trip-choice-head"><span>{option.badge}</span>{option.recommended ? <b>Recommended</b> : null}</div><strong>{option.title}</strong><p>{option.summary}</p><div className="autopilot-trip-choice-stores">{option.store_names.map((store) => <small key={store}>{store}</small>)}</div><div className="autopilot-trip-choice-total"><strong>{option.estimated_total != null ? money(option.estimated_total, autopilot?.currency_code) : '—'}</strong><small>{option.extra_cost_vs_cheapest > 0 ? `${money(option.extra_cost_vs_cheapest, autopilot?.currency_code)} above cheapest` : 'Lowest supported cost'}</small></div><button type="button" className={option.recommended ? 'secondary full' : 'primary full'} onClick={() => chooseTripOption(option)} disabled={decisionBusy === option.key}>{decisionBusy === option.key ? 'Saving choice…' : option.recommended ? 'Use this household preference' : 'Choose this instead'}</button></article>)}</div> : <div className="autopilot-empty-insight"><span>🧺</span><strong>No trip options yet</strong><p>Create an active grocery list first and the app will offer cost-saver, balanced and premium-style paths here.</p></div>}
          </article>
        </div> : null}

        <div className="autopilot-money-grid">
          <article className="autopilot-trip-intel">
            <div className="autopilot-card-icon">🛒</div><p className="eyebrow">NEXT TRIP</p><h3>{assistant?.active_list_title || 'No active grocery list yet'}</h3>
            {assistant?.active_list_id ? <>{assistant.best_store_name ? <div className="autopilot-trip-best"><span>Best complete saved-price option</span><strong>{assistant.best_store_name}</strong>{assistant.best_store_total != null ? <b>{money(assistant.best_store_total, assistant.currency_code)}</b> : null}</div> : <p>Open Shopping and the Automatic Trip Check will use live Canadian prices first, then active flyers, recent receipts and saved prices.</p>}{assistant.potential_store_savings ? <div className="autopilot-save-pulse">Potential store difference <strong>{money(assistant.potential_store_savings, assistant.currency_code)}</strong></div> : null}<Link to={`/houses/${houseId}/shopping`} className="primary center-link full">Run Automatic Trip Check →</Link></> : <><p>Create a list and Autopilot will hand it to Shopping for whole-basket price intelligence.</p><Link to={`/houses/${houseId}/shopping`} className="secondary center-link full">Create grocery list</Link></>}
          </article>

          <article className="autopilot-stockup-card">
            <div className="panel-title-row"><div><p className="eyebrow">BUY 1 OR BUY MORE?</p><h3>Smart stock-up opportunities</h3></div><span className="badge">History-aware</span></div>
            {autopilot?.stock_up_unlocked ? <div className="autopilot-stockup-list">{autopilot.stock_up.slice(0, 4).map((item) => <div key={item.product_id}><div><strong>{item.product_name}</strong><small>{item.store_name || 'Saved price'} · {item.history_points} price observations</small></div><span><b>{money(item.current_price, autopilot.currency_code)}</b><small>typical {money(item.typical_price, autopilot.currency_code)}</small></span><em>-{item.discount_percent}%</em><p>{item.reason}</p><footer><strong>Consider {item.recommended_quantity}</strong><small>Potential value {money(item.potential_savings, autopilot.currency_code)} · {item.caution}</small></footer></div>)}{!autopilot.stock_up.length ? <div className="autopilot-empty-insight"><span>📉</span><strong>No high-confidence stock-up signal yet</strong><p>Autopilot waits for enough real purchase history and a meaningfully lower saved price instead of calling every sale a deal.</p></div> : null}</div> : <div className="autopilot-inline-lock"><span>🔒</span><div><strong>Smart stock-up unlocks with Family Plus</strong><small>It waits for enough purchase history, compares the current saved price with your household's typical price, then suggests a conservative quantity.</small></div>{premiumTry?.available ? (premiumTry.selected_feature === 'smart_stock_up' ? <button type="button" className="primary" disabled={stockUpTryBusy} onClick={runStockUpPremiumTry}>{stockUpTryBusy ? 'Checking history…' : 'Use my free Premium Try'}</button> : <Link to={`/premium-try?feature=smart_stock_up&house=${houseId || ''}`}>Try this once free →</Link>) : <Link to="/pricing">See Family Plus →</Link>}</div>}
          </article>

          <article className="autopilot-community-price-card">
            <div className="panel-title-row"><div><p className="eyebrow">COMMUNITY PRICE PULSE</p><h3>Let opted-in receipts strengthen local price decisions.</h3></div><span className={`badge ${autopilot?.community_price_pulse.sharing_enabled ? 'active' : ''}`}>{autopilot?.community_price_pulse.sharing_enabled ? 'Sharing on' : 'Private by default'}</span></div>
            <p>{autopilot?.community_price_pulse.message}</p>
            <div className="autopilot-community-stats"><span><strong>{autopilot?.community_price_pulse.recent_observations || 0}</strong><small>recent local observations</small></span><span><strong>{autopilot?.community_price_pulse.matched_list_items || 0}</strong><small>list items matched</small></span></div>
            <div className="autopilot-community-signals">{autopilot?.community_price_pulse.signals.slice(0, 5).map((signal) => <div key={`${signal.product_name}-${signal.store_name}`}><span><strong>{signal.product_name}</strong><small>{signal.store_name}{signal.city ? ` · ${signal.city}` : ''}</small></span><b>{money(signal.price, autopilot.currency_code)}</b><em>{signal.age_days === 0 ? 'today' : `${signal.age_days}d ago`} · {signal.observation_count} obs.</em></div>)}</div>
            <div className="autopilot-community-consent"><span>🔐</span><p><strong>Opt-in and revocable.</strong> Other users never receive your household or user identity. Only product, store, price, coarse city/country and date can enter the community signal. Turning sharing off deletes this house’s contributed observations.</p></div>
            {selectedHouse?.role === 'owner' ? <button type="button" className={autopilot?.community_price_pulse.sharing_enabled ? 'secondary full' : 'primary full'} onClick={toggleCommunityPriceSharing} disabled={communityPriceBusy}>{communityPriceBusy ? 'Updating privacy setting…' : autopilot?.community_price_pulse.sharing_enabled ? 'Stop sharing & remove my contributions' : 'Contribute future reviewed receipt prices'}</button> : <small className="autopilot-community-owner-note">Only the house owner can change this privacy setting.</small>}
          </article>
        </div>

        <article className="autopilot-ledger-card">
          <header><div><p className="eyebrow">GHM SAVINGS LEDGER</p><h3>Every dollar needs evidence.</h3><p>{autopilot?.savings_ledger.message}</p></div><div className="autopilot-ledger-totals"><span><small>Verified this month</small><strong>{money(autopilot?.savings_ledger.verified_total || 0, autopilot?.currency_code)}</strong></span><span><small>Open opportunities</small><strong>{money(autopilot?.savings_ledger.potential_total || 0, autopilot?.currency_code)}</strong></span></div></header>
          <div className="autopilot-ledger-list">{autopilot?.savings_ledger.entries.slice(0, 8).map((entry) => <div key={entry.key} className={entry.verified ? 'verified' : 'potential'}><span className="ledger-status">{entry.verified ? '✓' : '◇'}</span><div><strong>{entry.title}</strong><small>{entry.evidence}</small><em>{entry.source_label}{entry.occurred_on ? ` · ${entry.occurred_on}` : ''}</em></div><b>{entry.verified ? '+' : '~'}{money(entry.amount, autopilot.currency_code)}</b></div>)}{!autopilot?.savings_ledger.entries.length ? <div className="autopilot-empty-insight"><span>🧾</span><strong>Your proof starts with normal use</strong><p>Reviewed receipt discounts and completed shopping prices automatically become ledger evidence.</p></div> : null}</div>
          <Link to="/reports" className="secondary center-link">Open full reports & exports →</Link>
        </article>
      </section>

      <section id="protect" className="autopilot-section autopilot-protect-section" data-v95-view="protect">
        <header className="autopilot-section-heading"><div><p className="eyebrow">PROTECT THE HOUSEHOLD</p><h2>Check the things people normally notice too late.</h2><p>Receipt Guardian, official recall screening and Kitchen Vision stay deliberately conservative: they surface evidence to review rather than making unsafe or accusatory conclusions automatically.</p></div><span className="autopilot-feature-number">03</span></header>
        <div className="autopilot-protection-grid">
          <article id="receipt-guardian" className="autopilot-protection-card receipt-guardian-card">
            <header><div className="autopilot-card-icon">🧾</div><div><p className="eyebrow">RECEIPT GUARDIAN</p><h3>Did anything deserve a second look?</h3></div><span className={(autopilot?.receipt_guardian.issues.length || 0) ? 'guardian-count attention' : 'guardian-count'}>{autopilot?.receipt_guardian.issues.length || 0}</span></header>
            {autopilot?.receipt_guardian_unlocked ? <><p>{autopilot.receipt_guardian.message}</p>
            <div className="guardian-issue-list">{autopilot.receipt_guardian.issues.slice(0, 5).map((issue) => <div key={issue.key} className={issue.severity}><span>{issue.issue_type === 'possible_duplicate' ? '⧉' : issue.issue_type === 'line_math' ? '∑' : '↗'}</span><div><strong>{issue.title}</strong><small>{issue.receipt_label}{issue.product_name ? ` · ${issue.product_name}` : ''}</small><p>{issue.detail}</p></div>{issue.amount_to_review != null ? <b>{money(issue.amount_to_review, autopilot.currency_code)}<small>to review</small></b> : null}<button type="button" className="guardian-copy" onClick={() => copyReceiptInquiry(issue)}>Copy inquiry</button></div>)}</div>
            <Link to={`/houses/${houseId}/receipts`} className="secondary center-link full">Open original receipts</Link></> : <div className="autopilot-inline-lock"><span>🔒</span><div><strong>Receipt Guardian unlocks with Basic Home</strong><small>It reviews recent scanned receipt lines for possible duplicates, line-math inconsistencies and unusual price jumps. Signals are always presented as items to verify—not accusations.</small></div><Link to="/pricing">See Basic Home →</Link></div>}
          </article>

          <article id="recall-guardian" className="autopilot-protection-card recall-guardian-card">
            <header><div className="autopilot-card-icon">🛡️</div><div><p className="eyebrow">FOOD RECALL GUARDIAN</p><h3>Official-alert screening for what you own</h3></div><span className={(autopilot?.recall_guardian.matches.length || 0) ? 'guardian-count danger' : 'guardian-count'}>{autopilot?.recall_guardian.matches.length || 0}</span></header>
            <p>{autopilot?.recall_guardian.message}</p>
            <div className="recall-match-list">{autopilot?.recall_guardian.matches.map((match) => <a href={match.alert_url} target="_blank" rel="noreferrer" key={`${match.product_id}-${match.alert_url}`}><span>⚠️</span><div><strong>{match.product_name}</strong><small>{match.alert_title}</small><em>{match.match_reason} · Verify UPC/lot/size</em></div><b>Official notice ↗</b></a>)}{autopilot?.recall_guardian.available && !autopilot.recall_guardian.matches.length ? <div className="autopilot-safety-clear"><span>✓</span><div><strong>No likely match found</strong><small>{autopilot.recall_guardian.checked_products} in-stock products screened against the current Government of Canada food-alert feed.</small></div></div> : null}{autopilot && !autopilot.recall_guardian.available ? <div className="autopilot-empty-insight"><span>↻</span><strong>Official feed temporarily unavailable</strong><p>Use the Government of Canada source link if you need to check immediately.</p></div> : null}</div>
            <a className="secondary center-link full" href={autopilot?.recall_guardian.source_url || 'https://recalls-rappels.canada.ca/en'} target="_blank" rel="noreferrer">Government of Canada recalls ↗</a>
          </article>

          <article className="autopilot-protection-card kitchen-map-gateway-v96">
            <div className="autopilot-card-title"><span>👁️</span><div><strong>Kitchen Map</strong><small>Scan real storage areas without turning Autopilot into another long workflow.</small></div></div>
            {autopilot?.kitchen_check_unlocked ? <>
              <p>Fridge, freezer, cupboards, pantry, racks and custom areas each keep their own scan history. GHM preserves multiple identical physical units, records scan coverage, and never treats “not visible” as “gone.”</p>
              <div className="kitchen-map-mini-rules-v96"><span><b>Quick scan</b><small>Check the area you are standing beside.</small></span><span><b>Full refresh</b><small>Walk through several areas when you want a stronger household picture.</small></span><span><b>Review only changes</b><small>Confirmed items stay out of your way.</small></span></div>
              <Link className="primary center-link full" to={`/houses/${houseId}/kitchen`}>Open Kitchen Vision →</Link>
            </> : <div className="autopilot-inline-lock"><span>🔒</span><div><strong>Kitchen Vision is a Household Pro tool</strong><small>Scan storage zones, compare physical observations with inventory, and approve only the changes that matter.</small></div><Link to="/pricing">See Household Pro →</Link></div>}
          </article>
        </div>
      </section>

      <section className="autopilot-connected-flow" data-v95-view="today">
        <div><p className="eyebrow">ONE INTELLIGENCE · EXISTING WORKFLOWS</p><h2>Autopilot doesn't replace the app. It connects it.</h2></div>
        <nav><Link to={`/houses/${houseId}/inventory`}><span>📦</span><strong>Inventory</strong><small>What you own</small></Link><i>→</i><Link to={`/houses/${houseId}/meals`}><span>🍲</span><strong>Meals</strong><small>What to use</small></Link><i>→</i><Link to={`/houses/${houseId}/shopping`}><span>🛒</span><strong>Shopping</strong><small>What & where to buy</small></Link><i>→</i><Link to={`/houses/${houseId}/scan`}><span>🧾</span><strong>Receipts</strong><small>What actually happened</small></Link><i>→</i><Link to="/reports"><span>📈</span><strong>Ledger</strong><small>What value was proven</small></Link></nav>
      </section>

      {selectedHouse ? <p className="autopilot-footer-note">Autopilot for <strong>{selectedHouse.name}</strong> uses household data you have chosen to save in Grocery House Manager. Price, recall and receipt signals are decision support and should be verified when they affect safety, refunds or purchasing decisions.</p> : null}

      {newConversationConfirm ? <OverlayPortal>
        <div className="modal-backdrop v124-conversation-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewConversationConfirm(false); }}>
          <section className="compact-dialog focus-dialog v124-conversation-confirm" role="dialog" aria-modal="true" aria-label="Start a new conversation?" onMouseDown={(event) => event.stopPropagation()}>
            <header className="focus-dialog-titlebar">
              <div><p className="eyebrow">NEW CONVERSATION</p><h2>Start a new conversation?</h2><p>Your current Ask GHM conversation will be cleared from this browser session.</p></div>
              <button type="button" className="icon-button" data-dialog-close="true" aria-label="Close" onClick={() => setNewConversationConfirm(false)}>×</button>
            </header>
            <div className="focus-dialog-scroll v124-conversation-confirm-copy"><p>Use a new conversation when you want GHM to stop using the current follow-up context.</p></div>
            <footer className="focus-dialog-actions v124-conversation-confirm-actions"><button type="button" className="secondary" onClick={() => setNewConversationConfirm(false)}>Keep conversation</button><button type="button" className="primary" onClick={startNewConversation}>Start new conversation</button></footer>
          </section>
        </div>
      </OverlayPortal> : null}
    </main>
  );
}
