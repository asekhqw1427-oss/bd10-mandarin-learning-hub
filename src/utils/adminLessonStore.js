import { isSupabaseConfigured, supabase } from "./supabaseClient";
import { convertPptxToPngs, isPptxFile } from "./pptxSlideConverter";

const STORAGE_KEY = "bd10-admin-lessons-v1";
async function siteApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Lesson storage request failed (${response.status}).`);
  return result;
}

function mergeLessons(primary = [], legacy = [], hiddenIds = []) {
  const hidden = new Set(hiddenIds);
  const merged = new Map();
  for (const lesson of legacy) if (lesson?.id && !hidden.has(lesson.id)) merged.set(lesson.id, lesson);
  for (const lesson of primary) if (lesson?.id && !hidden.has(lesson.id)) merged.set(lesson.id, lesson);
  return [...merged.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function uploadSiteFile(lessonId, file, kind, order) {
  const form = new FormData();
  form.append("file", file, file.name || `${kind}-${order}.png`);
  return siteApi(`/api/admin/materials/${encodeURIComponent(lessonId)}/assets?kind=${kind}&order=${order}`, { method: "POST", body: form });
}

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeAll(lessons, notify = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons));
  if (notify) window.dispatchEvent(new CustomEvent("bd10-admin-lessons-updated"));
}

function rowToLesson(row) {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    chineseTitle: row.chinese_title,
    pinyin: row.pinyin,
    description: row.description,
    level: row.level,
    estimatedTime: row.estimated_time,
    practiceType: row.practice_type,
    status: row.status,
    fileNames: row.file_names || [],
    sourceFileType: row.source_file_type || "",
    sourceFileUrl: row.source_file_url || "",
    slides: row.slides || [],
    updatedAt: row.updated_at || row.created_at,
    storageBackend: "supabase",
  };
}

function lessonToRow(lesson) {
  return {
    id: lesson.id,
    number: lesson.number,
    title: lesson.title,
    chinese_title: lesson.chineseTitle,
    pinyin: lesson.pinyin || "",
    description: lesson.description || "",
    level: lesson.level || "Beginner",
    estimated_time: lesson.estimatedTime || "15 min",
    practice_type: lesson.practiceType || "Speaking Mission",
    status: lesson.status || "draft",
    file_names: lesson.fileNames || [],
    source_file_type: lesson.sourceFileType || "",
    source_file_url: lesson.sourceFileUrl || null,
    slides: lesson.slides || [],
    updated_at: new Date().toISOString(),
  };
}

async function uploadRenderedSlides(lessonId, lessonTitle, renderedSlides) {
  const slides = [];
  for (const [index, rendered] of renderedSlides.entries()) {
    const file = new File([rendered.blob], `slide-${index + 1}.png`, { type: "image/png" });
    const uploaded = await uploadSiteFile(lessonId, file, "slide", index + 1);
    slides.push({
      id: `${lessonId}-slide-${index + 1}`,
      order: index + 1,
      image: uploaded.url,
      thumbnail: uploaded.url,
      alt: `${lessonTitle} slide ${index + 1}`,
    });
  }
  return slides;
}

async function uploadLessonFiles(lesson, files = []) {
  if (!files.length) return { slides: lesson.slides || [], sourceFileUrl: lesson.sourceFileUrl || "", sourceFileType: lesson.sourceFileType || "" };

  const slides = [];
  let sourceFileUrl = "";
  let sourceFileType = "";
  let pptxFile = null;
  for (const [index, file] of files.entries()) {
    if (file.type.startsWith("image/")) {
      const uploaded = await uploadSiteFile(lesson.id, file, "slide", index + 1);
      slides.push({
        id: `${lesson.id}-slide-${index + 1}`,
        order: index + 1,
        image: uploaded.url,
        thumbnail: uploaded.url,
        alt: file.name,
      });
    } else if (!sourceFileUrl) {
      const uploaded = await uploadSiteFile(lesson.id, file, "source", index + 1);
      sourceFileUrl = uploaded.url;
      sourceFileType = file.type || "application/octet-stream";
      if (isPptxFile(file)) pptxFile = file;
    }
  }

  if (pptxFile && lesson.status === "published") {
    const renderedSlides = await convertPptxToPngs(await pptxFile.arrayBuffer());
    slides.push(...await uploadRenderedSlides(lesson.id, lesson.title, renderedSlides));
  }
  return { slides, sourceFileUrl, sourceFileType };
}

export function readAdminLessons() {
  return readAll();
}

export function readPublishedLessons() {
  return readAll().filter((lesson) => lesson.status === "published");
}

export async function loadAdminLessons() {
  const { lessons: siteLessons = [], hiddenIds = [] } = await siteApi("/api/admin/materials", { method: "GET" });
  let legacy = [];
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from("lesson_materials").select("*").order("updated_at", { ascending: false });
      if (!error) legacy = (data || []).map(rowToLesson);
    } catch (error) {
      console.warn("Legacy lesson source is unavailable; showing Site storage only.", error);
    }
  }
  const lessons = mergeLessons(siteLessons, legacy, hiddenIds);
  writeAll(lessons, false);
  return lessons;
}

// One-time backfill for lessons published before slide-image conversion was added.
// It is called only from the admin console, never from the learner-facing page.
export async function materializePublishedLessonSlides(lesson) {
  if (lesson.status !== "published" || lesson.slides?.length || !lesson.sourceFileUrl || !isPptxFile(`${lesson.sourceFileType || ""} ${lesson.sourceFileUrl}`)) return lesson;
  const response = await fetch(lesson.sourceFileUrl);
  if (!response.ok) throw new Error(`Unable to load ${lesson.title} (${response.status})`);
  const renderedSlides = await convertPptxToPngs(await response.arrayBuffer());
  const slides = await uploadRenderedSlides(lesson.id, lesson.title, renderedSlides);
  const updated = { ...lesson, slides, storageBackend: "sites" };
  const { lesson: saved } = await siteApi(`/api/admin/materials/${encodeURIComponent(lesson.id)}`, { method: "PUT", body: JSON.stringify(updated) });
  return saved;
}

export async function loadPublishedLessons() {
  const { lessons: siteLessons = [], hiddenIds = [] } = await siteApi("/api/materials", { method: "GET" });
  let legacy = [];
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from("lesson_materials").select("*").eq("status", "published").order("updated_at", { ascending: false });
      if (!error) legacy = (data || []).map(rowToLesson);
    } catch (error) {
      console.warn("Legacy published lessons are unavailable; showing Site storage only.", error);
    }
  }
  const lessons = mergeLessons(siteLessons, legacy, hiddenIds);
  writeAll([...readAll().filter((lesson) => lesson.status !== "published"), ...lessons], false);
  return lessons;
}

export async function saveAdminLesson(lesson, files = []) {
  const uploaded = await uploadLessonFiles(lesson, files);
  const savedLesson = {
    ...lesson,
    slides: files.length ? uploaded.slides : lesson.slides || [],
    sourceFileUrl: files.length ? uploaded.sourceFileUrl : lesson.sourceFileUrl || "",
    sourceFileType: files.length ? uploaded.sourceFileType : lesson.sourceFileType || "",
    storageBackend: "sites",
  };
  const { lesson: saved } = await siteApi(`/api/admin/materials/${encodeURIComponent(lesson.id)}`, { method: "PUT", body: JSON.stringify(savedLesson) });
  const current = readAll();
  writeAll([saved, ...current.filter((item) => item.id !== saved.id)]);
  return saved;
}

export async function removeAdminLesson(id) {
  await siteApi(`/api/admin/materials/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (isSupabaseConfigured) {
    try { await supabase.from("lesson_materials").delete().eq("id", id); } catch (error) {
      console.warn("Legacy lesson cleanup skipped after Site deletion.", error);
    }
  }
  writeAll(readAll().filter((lesson) => lesson.id !== id));
}

export function clearAdminLessons() {
  writeAll([]);
}

export function subscribeToLessonChanges(onChange) {
  let channel;
  if (supabase) channel = supabase
    .channel("bd10-lesson-materials")
    .on("postgres_changes", { event: "*", schema: "public", table: "lesson_materials" }, onChange)
    .subscribe();
  const poll = window.setInterval(onChange, 15000);
  return () => {
    window.clearInterval(poll);
    if (channel) supabase.removeChannel(channel);
  };
}
