export type BackgroundTaskStatus = 'running' | 'ready' | 'failed';

export type BackgroundTaskRecord = {
  id: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  status: BackgroundTaskStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  openedAt?: number;
};

const TASKS_KEY = 'ghm_background_tasks_v120';
const RESULT_PREFIX = 'ghm_background_result_v120:';
const runtime = new Map<string, Promise<unknown>>();
const runtimeResults = new Map<string, unknown>();

const FOCUS_KEY = 'ghm_background_result_focus_v123';

export function requestBackgroundResultFocus(id: string) {
  try { sessionStorage.setItem(FOCUS_KEY, id); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent('ghm:background-focus-requested', { detail: { id } }));
}

export function pendingBackgroundResultFocus(): string | null {
  try { return sessionStorage.getItem(FOCUS_KEY); } catch { return null; }
}

export function clearPendingBackgroundResultFocus(id?: string) {
  try {
    const current = sessionStorage.getItem(FOCUS_KEY);
    if (!id || current === id) sessionStorage.removeItem(FOCUS_KEY);
  } catch { /* noop */ }
}

function readTasks(): BackgroundTaskRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeTasks(tasks: BackgroundTaskRecord[]) {
  try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.slice(-30))); } catch { /* storage can be unavailable */ }
  window.dispatchEvent(new Event('ghm:background-tasks-changed'));
}

function upsertTask(record: BackgroundTaskRecord) {
  const tasks = readTasks().filter((row) => row.id !== record.id);
  tasks.push(record);
  writeTasks(tasks);
}

export function backgroundTasks(): BackgroundTaskRecord[] {
  return readTasks().sort((a, b) => b.startedAt - a.startedAt);
}


export function getBackgroundTask(id: string): BackgroundTaskRecord | null {
  return readTasks().find((row) => row.id === id) || null;
}

export function markBackgroundTaskOpened(id: string) {
  const tasks = readTasks();
  const next = tasks.map((row) => row.id === id ? { ...row, openedAt: row.openedAt || Date.now() } : row);
  writeTasks(next);
}


export function announceBackgroundResultHydrated(id: string) {
  window.dispatchEvent(new CustomEvent('ghm:background-result-hydrated', { detail: { id } }));
}

export function makeBackgroundTaskId(kind: string) {
  return `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function getBackgroundTaskResult<T>(id: string): T | null {
  if (runtimeResults.has(id)) return runtimeResults.get(id) as T;
  try {
    const raw = localStorage.getItem(`${RESULT_PREFIX}${id}`) || sessionStorage.getItem(`${RESULT_PREFIX}${id}`);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

function removeTaskRecord(id: string) {
  writeTasks(readTasks().filter((row) => row.id !== id));
}

export function clearBackgroundTask(id: string) {
  const tasks = readTasks().filter((row) => row.id !== id);
  runtimeResults.delete(id);
  try { localStorage.removeItem(`${RESULT_PREFIX}${id}`); sessionStorage.removeItem(`${RESULT_PREFIX}${id}`); } catch { /* noop */ }
  writeTasks(tasks);
}

export function runBackgroundCapableTask<T>({
  id,
  kind,
  title,
  message,
  href,
  task,
}: {
  id: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  task: () => Promise<T>;
}): Promise<T> {
  const existing = runtime.get(id) as Promise<T> | undefined;
  if (existing) return existing;

  const startedAt = Date.now();
  const startLocation = `${window.location.pathname}${window.location.search}`;
  upsertTask({ id, kind, title, message, href, status: 'running', startedAt });
  window.dispatchEvent(new CustomEvent('ghm:background-task-started', { detail: { id, title, message, href } }));

  const promise = task()
    .then((result) => {
      runtimeResults.set(id, result);
      try {
        const serialized = JSON.stringify(result);
        try { localStorage.setItem(`${RESULT_PREFIX}${id}`, serialized); }
        catch { sessionStorage.setItem(`${RESULT_PREFIX}${id}`, serialized); }
      } catch { /* runtime result still remains available for this app session */ }
      const finishedAt = Date.now();
      const currentLocation = `${window.location.pathname}${window.location.search}`;
      const shouldNotify = finishedAt - startedAt >= 45000 || currentLocation !== startLocation;
      if (shouldNotify) {
        upsertTask({ id, kind, title, message: 'Your result is ready.', href, status: 'ready', startedAt, finishedAt });
        window.dispatchEvent(new CustomEvent('ghm:background-task-ready', { detail: { id, title, href } }));
      } else {
        removeTaskRecord(id);
        window.dispatchEvent(new CustomEvent('ghm:background-task-completed', { detail: { id, title, href } }));
      }
      return result;
    })
    .catch((error) => {
      const detail = typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : (error?.message || 'The background task could not be completed.');
      upsertTask({ id, kind, title, message: detail, href, status: 'failed', startedAt, finishedAt: Date.now(), error: detail });
      window.dispatchEvent(new CustomEvent('ghm:background-task-failed', { detail: { id, title, href, error: detail } }));
      throw error;
    })
    .finally(() => runtime.delete(id));

  runtime.set(id, promise);
  return promise;
}
