import { supabase } from "./supabaseClient";

// Keep the original device-local timer for the 123/123 demonstration account.
// Authenticated learners store independent study sessions for safe merging.
const STORAGE_KEY = "bd10-learning-time-v1";
const USER_STORAGE_PREFIX = "bd10-learning-time-sessions-v1:";
const UPDATE_EVENT = "bd10-learning-time-updated";
const SYNC_DELAY_MS = 15_000;
const PAGE_SIZE = 1000;
let accountId = null;
let activeSession = null;
let syncTimer = null;
let syncChain = Promise.resolve();
let syncBlocked = false;

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyRecord() {
  return { date: todayKey(), todaySeconds: 0, totalSeconds: 0 };
}

function storageKey() {
  return `${USER_STORAGE_PREFIX}${accountId}`;
}

function readSessions() {
  try {
    const sessions = JSON.parse(localStorage.getItem(storageKey()) || "{}");
    return sessions && typeof sessions === "object" && !Array.isArray(sessions) ? sessions : {};
  } catch {
    return {};
  }
}

function writeSessions(sessions) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(sessions));
  } catch {
    // Keep the lesson timer usable when device storage is unavailable.
  }
}

function notifyTime() {
  window.dispatchEvent(new Event(UPDATE_EVENT));
}

function scheduleSync() {
  if (!supabase || !accountId || syncTimer || syncBlocked) return;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    flushLearningTime().catch(() => {});
  }, SYNC_DELAY_MS);
}

export function setLearningTimeAccount(userId) {
  const next = userId || null;
  if (accountId === next) return;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = null;
  syncBlocked = false;
  activeSession = null;
  accountId = next;
  notifyTime();
}

export async function loadCloudLearningTime(userId = accountId) {
  if (!supabase || !userId || accountId !== userId) return;
  syncBlocked = false;
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from("learning_time_sessions")
      .select("session_id,lesson_id,study_date,active_seconds,updated_at")
      .eq("user_id", userId)
      .order("session_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") syncBlocked = true;
      throw error;
    }
    if (accountId !== userId) return;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const local = readSessions();
  const merged = Object.fromEntries(rows.map((row) => [row.session_id, {
    sessionId: row.session_id,
    lessonId: row.lesson_id,
    date: row.study_date,
    seconds: row.active_seconds,
    updatedAt: row.updated_at,
    needsSync: false,
  }]));
  for (const [sessionId, record] of Object.entries(local)) {
    if (record.needsSync) {
      const remote = merged[sessionId];
      merged[sessionId] = remote
        ? { ...record, seconds: Math.max(record.seconds, remote.seconds) }
        : record;
    }
  }
  if (accountId !== userId) return;
  writeSessions(merged);
  notifyTime();
  if (Object.values(merged).some((record) => record.needsSync)) scheduleSync();
}

export function flushLearningTime() {
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = null;
  if (!supabase || !accountId) return Promise.resolve();
  const userId = accountId;
  const upload = async () => {
    if (accountId !== userId) return;
    const dirty = Object.values(readSessions()).filter((record) => record.needsSync);
    for (let offset = 0; offset < dirty.length; offset += PAGE_SIZE) {
      const batch = dirty.slice(offset, offset + PAGE_SIZE);
      const { error } = await supabase.from("learning_time_sessions").upsert(batch.map((record) => ({
        user_id: userId,
        session_id: record.sessionId,
        lesson_id: record.lessonId,
        study_date: record.date,
        active_seconds: record.seconds,
        updated_at: record.updatedAt,
      })), { onConflict: "user_id,session_id" });
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") syncBlocked = true;
        if (accountId === userId) scheduleSync();
        throw error;
      }
      if (accountId !== userId) return;
      const current = readSessions();
      for (const saved of batch) {
        if (current[saved.sessionId]?.revision === saved.revision) {
          current[saved.sessionId] = { ...current[saved.sessionId], needsSync: false };
        }
      }
      writeSessions(current);
    }
    if (accountId === userId && Object.values(readSessions()).some((record) => record.needsSync)) scheduleSync();
  };
  syncChain = syncChain.catch(() => {}).then(upload);
  return syncChain;
}

export function readLearningTime() {
  if (accountId) {
    const sessions = Object.values(readSessions());
    const date = todayKey();
    return {
      date,
      todaySeconds: sessions.reduce((sum, record) => sum + (record.date === date ? Number(record.seconds) || 0 : 0), 0),
      totalSeconds: sessions.reduce((sum, record) => sum + (Number(record.seconds) || 0), 0),
    };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return emptyRecord();
    return {
      date: todayKey(),
      todaySeconds: saved.date === todayKey() ? Number(saved.todaySeconds) || 0 : 0,
      totalSeconds: Number(saved.totalSeconds) || 0,
    };
  } catch {
    return emptyRecord();
  }
}

export function addActiveLearningSecond(lessonId) {
  if (accountId) {
    if (!lessonId) return readLearningTime();
    const date = todayKey();
    if (!activeSession || activeSession.userId !== accountId || activeSession.lessonId !== lessonId || activeSession.date !== date) {
      activeSession = { userId: accountId, lessonId, date, id: crypto.randomUUID() };
    }
    const all = readSessions();
    const current = all[activeSession.id];
    all[activeSession.id] = {
      sessionId: activeSession.id,
      lessonId,
      date,
      seconds: (Number(current?.seconds) || 0) + 1,
      revision: (Number(current?.revision) || 0) + 1,
      updatedAt: new Date().toISOString(),
      needsSync: true,
    };
    writeSessions(all);
    notifyTime();
    scheduleSync();
    return readLearningTime();
  }
  const current = readLearningTime();
  const next = {
    ...current,
    todaySeconds: current.todaySeconds + 1,
    totalSeconds: current.totalSeconds + 1,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The timer remains usable when storage is unavailable.
  }
  notifyTime();
  return next;
}

export function subscribeToLearningTime(onChange) {
  const handleChange = () => onChange(readLearningTime());
  const handleStorage = (event) => {
    if (event.key === (accountId ? storageKey() : STORAGE_KEY)) handleChange();
  };
  window.addEventListener(UPDATE_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function learningTimeMinutes(record = readLearningTime()) {
  return {
    todayLearningMinutes: record.todaySeconds / 60,
    totalLearningMinutes: record.totalSeconds / 60,
  };
}
