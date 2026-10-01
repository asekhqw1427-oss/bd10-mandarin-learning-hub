import { supabase } from "./supabaseClient";

const DEMO_STORAGE_KEY = "bd10-lesson-progress-v1";
const USER_STORAGE_PREFIX = "bd10-lesson-progress-v2:";
const UPDATE_EVENT = "bd10-lesson-progress-updated";
const SYNC_DELAY_MS = 12_000;

let accountId = null;
let syncTimer = null;
let syncChain = Promise.resolve();
let syncBlocked = false;

function missingProgressTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function storageKey() {
  return accountId ? `${USER_STORAGE_PREFIX}${accountId}` : DEMO_STORAGE_KEY;
}

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey()) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeAll(records) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(records));
  } catch {
    // The lesson remains usable when browser storage is unavailable.
  }
}

function notify(detail) {
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail }));
}

function emptyProgress(lessonId) {
  return {
    lessonId,
    status: "new",
    progress: 0,
    currentSlide: 0,
    maxViewedSlide: -1,
    slideCount: 0,
    activeSeconds: 0,
    completed: false,
    updatedAt: null,
  };
}

export function readLessonProgress(lessonId) {
  if (!lessonId) return emptyProgress(lessonId);
  return { ...emptyProgress(lessonId), ...(readAll()[lessonId] || {}) };
}

export function requiredStudySeconds(lesson) {
  const configured = lesson.minimumLearningMinutes ?? lesson.estimatedTime;
  const minutes = typeof configured === "number"
    ? configured
    : Number.parseFloat(String(configured ?? "").replace(",", "."));
  return Number.isFinite(minutes) && minutes > 0 ? Math.ceil(minutes * 60) : 15 * 60;
}

function applyCurrentRequirement(lesson, progress) {
  if (!progress.completed || (Number(progress.activeSeconds) || 0) >= requiredStudySeconds(lesson)) return progress;
  return { ...progress, completed: false, status: "progress", progress: Math.min(99, progress.progress) };
}

export function readEffectiveLessonProgress(lesson) {
  return applyCurrentRequirement(lesson, readLessonProgress(lesson.id));
}

function fromRow(row) {
  return {
    lessonId: row.lesson_id,
    status: row.status,
    progress: row.progress,
    currentSlide: row.current_slide,
    maxViewedSlide: row.max_viewed_slide,
    slideCount: row.slide_count,
    activeSeconds: row.active_seconds,
    completed: row.completed,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    needsSync: false,
  };
}

function toRow(userId, record) {
  return {
    user_id: userId,
    lesson_id: record.lessonId,
    status: record.status,
    progress: record.progress,
    current_slide: record.currentSlide,
    max_viewed_slide: record.maxViewedSlide,
    slide_count: record.slideCount,
    active_seconds: Math.floor(Number(record.activeSeconds) || 0),
    completed: Boolean(record.completed),
    completed_at: record.completedAt || null,
    updated_at: record.updatedAt,
  };
}

function scheduleSync() {
  if (!supabase || !accountId || syncTimer || syncBlocked) return;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    flushLessonProgress().catch(() => {});
  }, SYNC_DELAY_MS);
}

export function setLessonProgressAccount(userId) {
  const next = userId || null;
  if (accountId === next) return;
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = null;
  syncBlocked = false;
  accountId = next;
  notify({ type: "account" });
}

export async function loadCloudLessonProgress(userId = accountId) {
  if (!supabase || !userId || accountId !== userId) return;
  syncBlocked = false;
  const { data, error } = await supabase.from("lesson_progress")
    .select("lesson_id,status,progress,current_slide,max_viewed_slide,slide_count,active_seconds,completed,completed_at,updated_at")
    .eq("user_id", userId);
  if (error) {
    if (missingProgressTable(error)) syncBlocked = true;
    throw error;
  }
  if (accountId !== userId) return;

  const local = readAll();
  const merged = Object.fromEntries((data || []).map((row) => [row.lesson_id, fromRow(row)]));
  for (const [lessonId, record] of Object.entries(local)) {
    if (record.needsSync) merged[lessonId] = record;
  }
  writeAll(merged);
  notify({ type: "loaded" });
  if (Object.values(merged).some((record) => record.needsSync)) scheduleSync();
}

export function flushLessonProgress() {
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = null;
  if (!supabase || !accountId) return Promise.resolve();
  const userId = accountId;

  const upload = async () => {
    if (accountId !== userId) return;
    const dirty = Object.values(readAll()).filter((record) => record.needsSync);
    if (!dirty.length) return;
    const { error } = await supabase.from("lesson_progress")
      .upsert(dirty.map((record) => toRow(userId, record)), { onConflict: "user_id,lesson_id" });
    if (error) {
      if (missingProgressTable(error)) syncBlocked = true;
      if (accountId === userId) scheduleSync();
      throw error;
    }
    if (accountId !== userId) return;
    const current = readAll();
    for (const saved of dirty) {
      if (current[saved.lessonId]?.revision === saved.revision) {
        current[saved.lessonId] = { ...current[saved.lessonId], needsSync: false };
      }
    }
    writeAll(current);
    if (Object.values(current).some((record) => record.needsSync)) scheduleSync();
  };
  syncChain = syncChain.catch(() => {}).then(upload);
  return syncChain;
}

function saveLessonProgress(lessonId, changes, { announce = true } = {}) {
  const all = readAll();
  const current = { ...emptyProgress(lessonId), ...(all[lessonId] || {}) };
  const next = {
    ...current,
    ...changes,
    lessonId,
    updatedAt: new Date().toISOString(),
    revision: (current.revision || 0) + 1,
    needsSync: Boolean(accountId),
  };
  all[lessonId] = next;
  writeAll(all);
  if (announce) notify(next);
  scheduleSync();
  return next;
}

export function recordLessonSlide(lessonId, currentSlide, slideCount) {
  if (!lessonId || !Number.isFinite(slideCount) || slideCount <= 0) return readLessonProgress(lessonId);
  const current = readLessonProgress(lessonId);
  const safeSlide = Math.min(Math.max(0, Number(currentSlide) || 0), slideCount - 1);
  const maxViewedSlide = Math.max(current.maxViewedSlide ?? -1, safeSlide);
  const completed = Boolean(current.completed);
  const progress = completed ? 100 : Math.min(99, Math.round(((maxViewedSlide + 1) / slideCount) * 100));
  return saveLessonProgress(lessonId, {
    currentSlide: safeSlide,
    maxViewedSlide,
    slideCount,
    progress,
    completed,
    status: completed ? "completed" : "progress",
  });
}

export function completeLesson(lessonId, slideCount, currentSlide = 0, { elapsedSeconds = 0, minimumSeconds = Infinity } = {}) {
  if (!lessonId) return readLessonProgress(lessonId);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < minimumSeconds) return readLessonProgress(lessonId);
  const safeCount = Math.max(0, Number(slideCount) || 0);
  return saveLessonProgress(lessonId, {
    currentSlide: Math.max(0, Number(currentSlide) || 0),
    maxViewedSlide: safeCount ? safeCount - 1 : Math.max(0, Number(currentSlide) || 0),
    slideCount: safeCount,
    progress: 100,
    activeSeconds: Math.max(readLessonProgress(lessonId).activeSeconds || 0, Math.floor(elapsedSeconds)),
    completed: true,
    status: "completed",
    completedAt: new Date().toISOString(),
  });
}

function demoSessionKey(lessonId) {
  return `bd10-lesson-session:${lessonId}`;
}

export function readLessonStudySeconds(lessonId) {
  if (accountId) return Number(readLessonProgress(lessonId).activeSeconds) || 0;
  try {
    const value = JSON.parse(localStorage.getItem(demoSessionKey(lessonId)) || "null");
    return Number(value?.elapsedSeconds) || 0;
  } catch {
    return 0;
  }
}

export function hasLessonStudySession(lessonId) {
  if (accountId) return Boolean(readLessonProgress(lessonId).updatedAt);
  try {
    return localStorage.getItem(demoSessionKey(lessonId)) !== null;
  } catch {
    return false;
  }
}

export function saveLessonStudySeconds(lessonId, elapsedSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  if (accountId) {
    const current = readLessonProgress(lessonId);
    if (safeSeconds > current.activeSeconds) {
      saveLessonProgress(lessonId, { activeSeconds: safeSeconds }, { announce: false });
    }
    return;
  }
  try {
    localStorage.setItem(demoSessionKey(lessonId), JSON.stringify({ elapsedSeconds: safeSeconds, updatedAt: Date.now() }));
  } catch {
    // The lesson viewer still works when browser storage is unavailable.
  }
}

export function reopenLessonIfUnderMinimum(lessonId, elapsedSeconds, minimumSeconds) {
  const current = readLessonProgress(lessonId);
  if (!current.completed || !Number.isFinite(minimumSeconds) || minimumSeconds <= 0 || elapsedSeconds >= minimumSeconds) return current;

  const safeCount = Math.max(0, Number(current.slideCount) || 0);
  const maxViewedSlide = safeCount
    ? Math.min(safeCount - 1, Number(current.maxViewedSlide ?? current.currentSlide) || 0)
    : -1;
  const progress = safeCount && maxViewedSlide >= 0
    ? Math.min(99, Math.round(((maxViewedSlide + 1) / safeCount) * 100))
    : Math.min(99, Number(current.progress) || 0);
  return saveLessonProgress(lessonId, {
    completed: false,
    completedAt: null,
    maxViewedSlide,
    progress,
    status: progress > 0 ? "progress" : "new",
  });
}

export function readPublishedLessonSummary(lessons = []) {
  const all = readAll();
  const records = lessons.map((lesson) => applyCurrentRequirement(lesson, {
    ...emptyProgress(lesson.id),
    ...(all[lesson.id] || {}),
  }));
  const completedCount = records.filter((record) => record.completed).length;
  return {
    totalCount: lessons.length,
    completedCount,
    percent: lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0,
  };
}

export function subscribeToLessonProgress(onChange) {
  const handleCustomEvent = (event) => onChange(event.detail);
  const handleStorage = (event) => {
    if (event.key === storageKey()) onChange();
  };
  window.addEventListener(UPDATE_EVENT, handleCustomEvent);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
  };
}
