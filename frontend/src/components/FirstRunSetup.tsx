import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import type {
  OnboardingCookingFrequency,
  OnboardingFriction,
  OnboardingGoal,
  OnboardingPreferences,
  OnboardingReceiptHabit,
  OnboardingRecipeHabit,
  OnboardingStatus,
} from '../types';

type FirstRunSetupProps = {
  onStatus?: (status: OnboardingStatus) => void;
};

type GoalOption = { key: OnboardingGoal; icon: string; label: string; copy: string };
type ChoiceOption<T extends string> = { key: T; icon: string; label: string; copy?: string };

const GOALS: GoalOption[] = [
  { key: 'save_money', icon: '💰', label: 'Save money', copy: 'Spot better buying choices and understand where grocery money goes.' },
  { key: 'know_inventory', icon: '▣', label: 'Know what we already have', copy: 'Keep a useful picture of food and household essentials at home.' },
  { key: 'remember_shopping', icon: '🛒', label: 'Stop forgetting groceries', copy: 'Keep the next trip shared, current and easier to finish.' },
  { key: 'plan_meals', icon: '🍲', label: 'Plan meals', copy: 'Turn what you already own into practical meal ideas and shortages.' },
  { key: 'reduce_waste', icon: '♻️', label: 'Reduce food waste', copy: 'Use food before expiry and avoid unnecessary duplicate buying.' },
  { key: 'manage_expenses', icon: '$', label: 'Manage shared expenses', copy: 'Track household spending, shares and reimbursements clearly.' },
];

const FRICTIONS: ChoiceOption<OnboardingFriction>[] = [
  { key: 'duplicates', icon: '↺', label: 'Buying things we already have' },
  { key: 'meal_ideas', icon: '🍽️', label: 'Not knowing what to cook' },
  { key: 'overspending', icon: '💸', label: 'Spending more than expected' },
  { key: 'expiring_food', icon: '⏳', label: 'Food expiring or being wasted' },
  { key: 'coordination', icon: '👥', label: 'Keeping everyone coordinated' },
  { key: 'tracking_spending', icon: '🧾', label: 'Tracking who spent what' },
  { key: 'other', icon: '✦', label: 'A mix of these' },
];

const COOKING: ChoiceOption<OnboardingCookingFrequency>[] = [
  { key: 'daily', icon: '🔥', label: 'Almost every day' },
  { key: 'most_days', icon: '🍳', label: 'Most days' },
  { key: 'few_times_week', icon: '🥘', label: 'A few times a week' },
  { key: 'rarely', icon: '🥡', label: 'Rarely' },
];

const RECEIPTS: ChoiceOption<OnboardingReceiptHabit>[] = [
  { key: 'keep', icon: '🧾', label: 'I usually keep them' },
  { key: 'discard', icon: '🗑️', label: 'I usually throw them away' },
  { key: 'track_manually', icon: '✍️', label: 'I track spending manually' },
  { key: 'nothing', icon: '—', label: 'I do nothing with them' },
];

const RECIPES: ChoiceOption<OnboardingRecipeHabit>[] = [
  { key: 'memory', icon: '🧠', label: 'Mostly in my head' },
  { key: 'social_media', icon: '▶', label: 'Instagram / TikTok / social media' },
  { key: 'websites', icon: '🌐', label: 'Recipe websites' },
  { key: 'notes', icon: '📝', label: 'Notes, screenshots or messages' },
  { key: 'mixed', icon: '✦', label: 'A mix of places' },
];

const DEFAULT_PREFS: OnboardingPreferences = {
  goals: ['know_inventory', 'remember_shopping'],
  biggest_friction: 'other',
  cooking_frequency: 'few_times_week',
  receipt_habit: 'nothing',
  recipe_habit: 'mixed',
};

const INITIAL_PREFS: OnboardingPreferences = {
  ...DEFAULT_PREFS,
  goals: [],
};

function focusForGoal(goal: OnboardingGoal) {
  return GOALS.find((item) => item.key === goal) || GOALS[0];
}

export default function FirstRunSetup({ onStatus }: FirstRunSetupProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const previousCompletedRef = useRef<number | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState('');
  const [draft, setDraft] = useState<OnboardingPreferences>(INITIAL_PREFS);
  const [completeCollapsed, setCompleteCollapsed] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<OnboardingStatus>('/insights/onboarding', { params: { t: Date.now() } });
      setStatus(data);
      onStatus?.(data);
      if (data.preferences) setDraft(data.preferences);
      if (previousCompletedRef.current !== null && data.completed_steps > previousCompletedRef.current && !data.complete) {
        setAdvanced(true);
        window.setTimeout(() => setAdvanced(false), 1600);
      }
      previousCompletedRef.current = data.completed_steps;
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    void load();
    window.addEventListener('account:refresh', load);
    return () => window.removeEventListener('account:refresh', load);
  }, []);

  useEffect(() => {
    if (!status || status.complete) return;
    const timer = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(timer);
  }, [status?.complete]);

  const houseStep = status?.steps.find((step) => step.key === 'house');
  const teachStep = status?.steps.find((step) => step.key === 'teach_home');
  const tripStep = status?.steps.find((step) => step.key === 'first_trip');
  const hasHouse = Boolean(houseStep?.complete && status?.primary_house_id);
  const focusGoals = useMemo(() => {
    const selected = draft.goals.length ? draft.goals : DEFAULT_PREFS.goals;
    return selected.slice(0, 3).map(focusForGoal);
  }, [draft.goals]);

  function toggleGoal(goal: OnboardingGoal) {
    setDraft((current) => {
      if (current.goals.includes(goal)) return { ...current, goals: current.goals.filter((item) => item !== goal) };
      if (current.goals.length >= 3) return current;
      return { ...current, goals: [...current.goals, goal] };
    });
  }

  async function savePreferences(nextDraft = draft) {
    try {
      setSavingPreferences(true);
      setPreferenceError('');
      const payload = nextDraft.goals.length ? nextDraft : DEFAULT_PREFS;
      const { data } = await api.post<OnboardingStatus>('/insights/onboarding/preferences', payload);
      setStatus(data);
      onStatus?.(data);
      window.dispatchEvent(new Event('account:refresh'));
    } catch (err) {
      setPreferenceError(errorMessage(err));
    } finally {
      setSavingPreferences(false);
    }
  }

  if (!status) return null;

  if (!hasHouse) {
    return <section className="v128-first-value v128-first-value-house" aria-label="First-time setup">
      <div className="v128-first-value-progress"><span style={{ width: `${status.percent}%` }} /></div>
      <div className="v128-first-value-copy">
        <p className="eyebrow">START WITH ONE PRIVATE HOME</p>
        <h2>Make GHM useful before learning every feature.</h2>
        <p>Create or join one Grocery Home first. It is simply the private place where groceries, receipts, shopping, meals and household members stay connected.</p>
      </div>
      <div className="v128-value-promise-grid">
        <span><b>1</b><small>Create your home</small></span>
        <span><b>2</b><small>Give GHM one real signal</small></span>
        <span><b>3</b><small>Get your first useful result</small></span>
      </div>
      <strong className="v128-inline-nudge">Create your Grocery Home below ↓</strong>
    </section>;
  }

  if (!status.preferences_complete) {
    const totalQuestions = 6;
    const progress = Math.round(((questionIndex + 1) / totalQuestions) * 100);
    return <section className={`v128-onboarding-wizard ${advanced ? 'advanced' : ''}`} aria-label="Personalize GHM">
      <div className="v128-wizard-progress"><span style={{ width: `${progress}%` }} /></div>
      <header className="v128-wizard-head">
        <div><p className="eyebrow">MAKE GHM FEEL LIKE YOUR HOUSEHOLD</p><h2>{questionIndex === 5 ? 'Your first GHM focus is ready.' : 'A few quick choices. Then start using the app.'}</h2></div>
        <span>{questionIndex + 1} / {totalQuestions}</span>
      </header>

      {questionIndex === 0 ? <div className="v128-question-screen">
        <div className="v128-question-copy"><small>CHOOSE UP TO 3</small><h3>What would you most like GHM to help with?</h3><p>Choose outcomes, not features. You can use everything later.</p></div>
        <div className="v128-choice-grid goals">{GOALS.map((item) => <button key={item.key} type="button" className={draft.goals.includes(item.key) ? 'selected' : ''} onClick={() => toggleGoal(item.key)}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.copy}</small></div><i>{draft.goals.includes(item.key) ? '✓' : '+'}</i></button>)}</div>
      </div> : null}

      {questionIndex === 1 ? <div className="v128-question-screen">
        <div className="v128-question-copy"><small>YOUR BIGGEST FRICTION</small><h3>What is most frustrating right now?</h3><p>GHM will use this to decide which workflow to introduce first.</p></div>
        <div className="v128-choice-grid compact">{FRICTIONS.map((item) => <button key={item.key} type="button" className={draft.biggest_friction === item.key ? 'selected' : ''} onClick={() => setDraft((current) => ({ ...current, biggest_friction: item.key }))}><span>{item.icon}</span><strong>{item.label}</strong><i>{draft.biggest_friction === item.key ? '✓' : ''}</i></button>)}</div>
      </div> : null}

      {questionIndex === 2 ? <div className="v128-question-screen">
        <div className="v128-question-copy"><small>COOKING RHYTHM</small><h3>How often do you cook at home?</h3><p>This helps GHM decide how strongly to emphasize meals, expiry and restocking.</p></div>
        <div className="v128-choice-grid compact four">{COOKING.map((item) => <button key={item.key} type="button" className={draft.cooking_frequency === item.key ? 'selected' : ''} onClick={() => setDraft((current) => ({ ...current, cooking_frequency: item.key }))}><span>{item.icon}</span><strong>{item.label}</strong><i>{draft.cooking_frequency === item.key ? '✓' : ''}</i></button>)}</div>
      </div> : null}

      {questionIndex === 3 ? <div className="v128-question-screen">
        <div className="v128-question-copy"><small>AFTER YOU SHOP</small><h3>What usually happens to grocery receipts?</h3><p>A receipt can become inventory, price history and household spending instead of being re-entered manually.</p></div>
        <div className="v128-choice-grid compact four">{RECEIPTS.map((item) => <button key={item.key} type="button" className={draft.receipt_habit === item.key ? 'selected' : ''} onClick={() => setDraft((current) => ({ ...current, receipt_habit: item.key }))}><span>{item.icon}</span><strong>{item.label}</strong><i>{draft.receipt_habit === item.key ? '✓' : ''}</i></button>)}</div>
      </div> : null}

      {questionIndex === 4 ? <div className="v128-question-screen">
        <div className="v128-question-copy"><small>MEAL IDEAS</small><h3>Where do your recipes live today?</h3><p>GHM can keep its own detailed recipes while helping you turn household inventory into practical meal ideas.</p></div>
        <div className="v128-choice-grid compact">{RECIPES.map((item) => <button key={item.key} type="button" className={draft.recipe_habit === item.key ? 'selected' : ''} onClick={() => setDraft((current) => ({ ...current, recipe_habit: item.key }))}><span>{item.icon}</span><strong>{item.label}</strong><i>{draft.recipe_habit === item.key ? '✓' : ''}</i></button>)}</div>
      </div> : null}

      {questionIndex === 5 ? <div className="v128-question-screen result">
        <div className="v128-question-copy"><small>YOUR FIRST GHM FOCUS</small><h3>Start with these outcomes—not a wall of features.</h3><p>GHM will stay fully available, but your first setup is centered on what you said matters most.</p></div>
        <div className="v128-focus-grid">{focusGoals.map((item, index) => <article key={item.key}><span>{item.icon}</span><div><small>{index + 1}</small><strong>{item.label}</strong><p>{item.copy}</p></div></article>)}</div>
        <div className="v128-no-fake-stats"><span>✓</span><div><strong>No made-up savings score.</strong><small>GHM will show real household value after it has actual inventory, receipts, shopping and spending data.</small></div></div>
      </div> : null}

      {preferenceError ? <div className="error">{preferenceError}</div> : null}
      <footer className="v128-wizard-actions">
        <button type="button" className="ghost-button" disabled={questionIndex === 0 || savingPreferences} onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))}>Back</button>
        <button type="button" className="text-button v128-skip-personalization" disabled={savingPreferences} onClick={() => void savePreferences(DEFAULT_PREFS)}>Skip personalization</button>
        {questionIndex < 5 ? <button type="button" className="primary" disabled={questionIndex === 0 && draft.goals.length === 0} onClick={() => setQuestionIndex((value) => Math.min(5, value + 1))}>Continue →</button> : <button type="button" className="primary" disabled={savingPreferences} onClick={() => void savePreferences()}>{savingPreferences ? 'Saving your focus…' : 'Use this focus →'}</button>}
      </footer>
    </section>;
  }

  if (!status.complete) {
    const activationCopy = !teachStep?.complete
      ? { eyebrow: 'MAKE GHM USEFUL RIGHT NOW', title: 'Give GHM one real household signal.', copy: 'Do one useful action. You do not need to configure the whole app first.' }
      : { eyebrow: 'ONE MORE REAL ACTION', title: 'Create the shopping trip your household will actually use.', copy: 'Once GHM has household context and a live list, the rest of the system becomes much easier to understand.' };

    return <section className={`v128-activation-card ${advanced ? 'advanced' : ''}`} aria-label="First household activation">
      <div className="v128-activation-head">
        <div><p className="eyebrow">{activationCopy.eyebrow}</p><h2>{activationCopy.title}</h2><p>{activationCopy.copy}</p></div>
        <div className="v128-first-run-progress"><strong>{status.percent}%</strong><span><i style={{ width: `${status.percent}%` }} /></span></div>
      </div>

      {!teachStep?.complete && status.primary_house_id ? <div className="v128-activation-choices free-only">
        <Link to={`/houses/${status.primary_house_id}/inventory`}><span>＋</span><div><strong>Add 5 groceries</strong><small>Start with a few everyday items already in your home. This is included with Free Starter.</small></div><b>→</b></Link>
        <Link to={`/houses/${status.primary_house_id}/shopping`}><span>🛒</span><div><strong>Explore your shopping list</strong><small>See where your first real trip will live. You can create the list now or after adding groceries.</small></div><b>→</b></Link>
      </div> : null}

      {teachStep?.complete && !tripStep?.complete && status.primary_house_id ? <Link className="v128-first-trip-cta" to={`/houses/${status.primary_house_id}/shopping`}><span>🛒</span><div><strong>Create the first shopping list</strong><small>Use a real upcoming trip. GHM can connect shortages, meals and price history around it later.</small></div><b>Start list →</b></Link> : null}

      <div className="v128-activation-steps">{status.steps.map((step) => <span key={step.key} className={step.complete ? 'done' : ''}><b>{step.complete ? '✓' : '○'}</b>{step.title}</span>)}</div>
    </section>;
  }

  if (completeCollapsed) {
    return <button type="button" className="v128-ready-collapsed" onClick={() => setCompleteCollapsed(false)}><span>✓</span><strong>Your Grocery Home is ready</strong><small>Show next steps</small></button>;
  }

  return <section className="v128-ready-card" aria-label="Grocery Home ready">
    <div className="v128-ready-copy"><span>✓</span><div><p className="eyebrow">YOUR GROCERY HOME IS READY</p><h2>Now let GHM do something intelligent with real household context.</h2><p>You have enough real data to explore GHM naturally. If you want, choose one Premium workflow to experience successfully before deciding whether it is worth paying for.</p></div></div>
    <div className="v128-ready-actions">
      {status.primary_house_id ? <Link className="primary center-link" to={`/assistant?house=${status.primary_house_id}&view=intelligence`}>Ask GHM something real →</Link> : null}
      {status.primary_house_id ? <Link className="secondary center-link" to={`/premium-try?house=${status.primary_house_id}`}>Try one Premium workflow</Link> : null}
      <button type="button" className="ghost-button" onClick={() => setCompleteCollapsed(true)}>Hide this guide</button>
    </div>
    <small className="v128-ready-note">Premium Try counts only after the selected workflow completes successfully. No card required.</small>
  </section>;
}
