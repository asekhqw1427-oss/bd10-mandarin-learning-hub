import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileUp,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./utils/supabaseClient";
import { loadAdminLessons, materializePublishedLessonSlides, readAdminLessons, removeAdminLesson, saveAdminLesson } from "./utils/adminLessonStore";
import "./admin.css";
import AdminStudentRecords from "./AdminStudentRecords";
import { adminTranslate } from "./adminTranslations";

const emptyForm = {
  number: "",
  title: "",
  chineseTitle: "",
  pinyin: "",
  description: "",
  level: "Beginner",
  estimatedTime: "15",
  practiceType: "Speaking Mission",
};

function formatUpdated(value) {
  if (!value) return "Not published yet";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function durationMinutes(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "15";
}

function durationLabel(value) {
  const minutes = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} min` : "15 min";
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatCard({ icon: Icon, label, value, accent }) {
  return <div className={`admin-stat-card ${accent}`}><span><Icon /></span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

export default function AdminDashboard({ notify = () => {}, onLogout }) {
  const [lang, setLang] = useState(() => localStorage.getItem("bd10-admin-language") || "en");
  const [view, setView] = useState("dashboard");
  const t = value => adminTranslate(lang, value);
  const changeLanguage = value => { setLang(value); localStorage.setItem("bd10-admin-language", value); };
  const showMaterials = callback => { setView("dashboard"); window.setTimeout(callback, 0); };
  const [lessons, setLessons] = useState(() => readAdminLessons());
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deletingIds, setDeletingIds] = useState([]);
  const removedIds = useRef(new Set());
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountResults, setAccountResults] = useState(null);
  const uploadRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (isSupabaseConfigured) {
      loadAdminLessons()
        .then(async (next) => {
          const legacyPublished = next.filter((lesson) => lesson.status === "published" && !lesson.slides?.length && lesson.sourceFileUrl);
          for (const lesson of legacyPublished) {
            if (!active || removedIds.current.has(lesson.id)) continue;
            try { await materializePublishedLessonSlides(lesson); } catch { /* keep the legacy viewer fallback if a backfill is unavailable */ }
          }
          const refreshed = legacyPublished.length ? await loadAdminLessons() : next;
          if (active) setLessons(refreshed.filter((lesson) => !removedIds.current.has(lesson.id)));
        })
        .catch((error) => notify(error?.message || "Site lesson storage is not ready yet. Please try again shortly.", "error"));
    }
    return () => { active = false; };
  }, []);

  const publishedCount = lessons.filter((lesson) => lesson.status === "published").length;
  const draftCount = lessons.filter((lesson) => lesson.status === "draft").length;
  const slideCount = lessons.reduce((total, lesson) => total + (lesson.slides?.length || 0), 0);
  const storageHint = useMemo(() => files.length ? `${files.length} file${files.length > 1 ? "s" : ""} selected` : "PPT/PPTX or slide images", [files.length]);

  const provisionDemoAccounts = async (rotateExisting = false) => {
    if (rotateExisting && !window.confirm("This resets the passwords for all seven demo accounts. Continue?")) return;
    if (!supabase) {
      notify("Connect Supabase before creating backend demo accounts.", "error");
      return;
    }
    setAccountBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("provision-demo-accounts", {
        body: { rotateExisting },
      });
      if (error) throw error;
      setAccountResults(data);
      const successCount = data?.accounts?.length || 0;
      const errorCount = data?.errors?.length || 0;
      if (errorCount) notify(`${successCount} accounts ready; ${errorCount} need a retry.`, "error");
      else notify(rotateExisting ? "All seven demo passwords were reset." : "Demo accounts are ready in Supabase.", "success");
    } catch (error) {
      notify(error?.message || "Could not create the demo accounts. Verify your admin session and retry.", "error");
    } finally {
      setAccountBusy(false);
    }
  };

  const copyAccount = async (account) => {
    if (!account.password) return;
    try {
      await navigator.clipboard.writeText(`ID: ${account.employeeId}\nPassword: ${account.password}`);
      notify(`Login details copied for ${account.employeeId}.`, "success");
    } catch {
      notify("Clipboard access is unavailable. Select and copy the password manually.", "error");
    }
  };

  useEffect(() => {
    // Once the authenticated administrator opens this dashboard, create any
    // missing demo accounts automatically. Password rotation remains manual.
    if (isSupabaseConfigured) provisionDemoAccounts(false);
  }, []);

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const chooseFiles = (event) => setFiles(Array.from(event.target.files || []));

  const cancelEdit = () => {
    setEditingLessonId(null);
    setForm(emptyForm);
    setFiles([]);
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const editLesson = (lesson) => {
    setEditingLessonId(lesson.id);
    setForm({
      number: String(lesson.number || ""),
      title: lesson.title || "",
      chineseTitle: lesson.chineseTitle || "",
      pinyin: lesson.pinyin || "",
      description: lesson.description || "",
      level: lesson.level || "Beginner",
      estimatedTime: durationMinutes(lesson.estimatedTime),
      practiceType: lesson.practiceType || "Speaking Mission",
    });
    setFiles([]);
    if (uploadRef.current) uploadRef.current.value = "";
    document.getElementById("admin-lessons")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitLesson = async (status) => {
    const existingLesson = editingLessonId ? lessons.find((item) => item.id === editingLessonId) : null;
    if (!form.number.trim() || !form.title.trim() || !form.chineseTitle.trim() || (!existingLesson && !files.length)) {
      notify(existingLesson ? "Add the lesson number, English title, and Chinese title." : "Add the lesson number, title, Chinese title, and at least one lesson file.", "error");
      return;
    }
    setBusy(true);
    try {
      const images = [];
      const fileNames = files.map((file) => file.name);
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          images.push({ id: `${Date.now()}-${images.length}`, order: images.length + 1, image: await readImageFile(file), thumbnail: await readImageFile(file), alt: file.name });
        }
      }
      const lesson = {
        ...(existingLesson || {}),
        id: existingLesson?.id || `admin-lesson-${Date.now()}`,
        number: form.number.trim(),
        title: form.title.trim(),
        chineseTitle: form.chineseTitle.trim(),
        pinyin: form.pinyin.trim(),
        description: form.description.trim() || (existingLesson ? "" : "Practice practical Mandarin for everyday work and life."),
        level: form.level,
        estimatedTime: `${Math.max(1, Number(form.estimatedTime) || 15)} min`,
        practiceType: form.practiceType,
        status: existingLesson?.status || status,
        fileNames: existingLesson && !files.length ? existingLesson.fileNames || [] : fileNames,
        sourceFileType: existingLesson && !files.length ? existingLesson.sourceFileType || "" : files[0]?.type || "application/octet-stream",
        slides: existingLesson && !files.length ? existingLesson.slides || [] : images,
        updatedAt: new Date().toISOString(),
      };
      await saveAdminLesson(lesson, existingLesson ? [] : files);
      setLessons(await loadAdminLessons());
      cancelEdit();
      notify(existingLesson ? "Lesson details updated. The existing slide files were kept." : status === "published" ? "Lesson published to the learning dashboard." : "Lesson saved as a draft.", "success");
    } catch {
      notify("The lesson could not be saved to Site storage. Check your admin sign-in and try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeLesson = async (lesson) => {
    if (deletingIds.includes(lesson.id)) return;
    removedIds.current.add(lesson.id);
    setDeletingIds((ids) => [...ids, lesson.id]);
    try {
      await removeAdminLesson(lesson.id);
      setLessons((current) => current.filter((item) => item.id !== lesson.id));
      if (editingLessonId === lesson.id) cancelEdit();
      notify(`${lesson.title} was removed from the admin library.`);
    } catch (error) {
      removedIds.current.delete(lesson.id);
      notify(error?.message || "The lesson could not be removed from Site storage.", "error");
    } finally {
      setDeletingIds((ids) => ids.filter((id) => id !== lesson.id));
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><img src="/assets/bd10-project-logo.png" alt="BD10 Mandarin Learning Hub" /><span>{t("Admin Console \u7ba1\u7406\u4e2d\u5fc3")}</span></div>
        <nav className="admin-nav" aria-label="Admin navigation">
          <button className={view === "dashboard" ? "active" : ""} type="button" onClick={() => setView("dashboard")}><LayoutDashboard />{t("Dashboard")}</button>
          <button type="button" onClick={() => showMaterials(() => document.getElementById("admin-lessons")?.scrollIntoView({ behavior: "smooth" }))}><BookOpen />{t("Lesson Materials")}</button>
          <button type="button" onClick={() => showMaterials(() => uploadRef.current?.focus())}><UploadCloud />{t("Upload Lesson")}</button>
          <button type="button" onClick={() => showMaterials(() => document.getElementById("admin-published")?.scrollIntoView({ behavior: "smooth" }))}><CheckCircle2 />{t("Published Lessons")}</button>
          <button className={view === "students" ? "active" : ""} type="button" onClick={() => setView("students")}><Users />{t("Student Record")}</button>
        </nav>
        <div className="admin-sidebar-note"><Sparkles /><strong>{t("Manage once.")}</strong><span>{t("Publish learning content for your team.")}</span></div>
        <button className="admin-logout" type="button" onClick={onLogout}><LogOut />{t("Back to login")}</button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar"><div><span>{t("BD10 Mandarin Learning Hub")}</span><strong>{t("Admin Dashboard")}</strong></div><div className="admin-user"><div className="admin-language" role="group" aria-label="Language"><button className={lang === "en" ? "active" : ""} onClick={() => changeLanguage("en")}>EN</button><button className={lang === "zh" ? "active" : ""} onClick={() => changeLanguage("zh")}>繁體中文</button></div><span>{t("ADMIN")}</span><button type="button" onClick={onLogout}>{t("Log out")}</button></div></header>
        <div className="admin-content"><div className="admin-mobile-pages"><button onClick={() => setView("dashboard")}>{t("Lesson Materials")}</button><button onClick={() => setView("students")}>{t("Student Record")}</button></div>
          {view === "students" ? <AdminStudentRecords lang={lang} lessons={lessons} /> : <>
          <section className="admin-welcome"><div><span className="admin-eyebrow">{t("CONTENT MANAGEMENT \u00b7 \u5167\u5bb9\u7ba1\u7406")}</span><h1>{t("Lesson Materials")}</h1><p>{t("Upload, review, and publish Mandarin learning lessons.")}</p></div><button className="admin-primary" type="button" onClick={() => showMaterials(() => uploadRef.current?.focus())}><Plus />{t("Upload New Lesson")}</button></section>

          <section className="admin-account-card" aria-labelledby="demo-account-heading">
            <div className="admin-account-heading"><div><h2 id="demo-account-heading">{t("Demo Accounts")}</h2><p>{t("Create five learner logins and two admin logins in Supabase Auth. Passwords are shown only here after creation or reset.")}</p></div><div className="admin-account-actions"><button className="admin-secondary" type="button" disabled={accountBusy || !isSupabaseConfigured} onClick={() => provisionDemoAccounts(false)}>{accountBusy ? t("Working…") : t("Create Missing Accounts")}</button><button className="admin-secondary" type="button" disabled={accountBusy || !isSupabaseConfigured} onClick={() => provisionDemoAccounts(true)}>{t("Reset All Demo Passwords")}</button></div></div>
            {accountResults && <>
              <div className="admin-account-note">{t("Save any newly shown passwords now. Existing passwords are never read back from Supabase.")}</div>
              <div className="admin-account-table-wrap"><table className="admin-account-table"><thead><tr><th>{t("Login ID")}</th><th>{t("Name")}</th><th>{t("Role")}</th><th>{t("Password")}</th><th></th></tr></thead><tbody>
                {(accountResults.accounts || []).map((account) => <tr key={account.employeeId}><td><code>{account.employeeId}</code></td><td>{account.displayName}</td><td><span className={`admin-role-pill ${account.role}`}>{t(account.role)}</span></td><td><code>{account.password || t("Already exists · hidden")}</code></td><td>{account.password && <button className="admin-copy-button" type="button" onClick={() => copyAccount(account)}>{t("Copy")}</button>}</td></tr>)}
                {(accountResults.errors || []).map((item) => <tr key={item.employeeId}><td><code>{item.employeeId}</code></td><td colSpan="4" className="admin-account-error">{item.message}</td></tr>)}
              </tbody></table></div>
            </>}
          </section>

          <section className="admin-stat-grid" aria-label="Lesson statistics">
            <StatCard icon={CheckCircle2} label={t("Published Lessons")} value={publishedCount} accent="green" />
            <StatCard icon={Clock3} label={t("Draft Lessons")} value={draftCount} accent="orange" />
            <StatCard icon={MonitorPlay} label={t("Slide Previews")} value={slideCount} accent="blue" />
            <StatCard icon={FolderOpen} label={t("Learning Library")} value={lessons.length} accent="purple" />
          </section>

          <div className="admin-workspace">
          <section className="admin-card admin-upload-card" id="admin-lessons">
              <div className="admin-card-heading"><div><h2><UploadCloud />{editingLessonId ? t("Edit Lesson Details") : t("Upload Lesson")}</h2><p>{editingLessonId ? t("Update lesson information without uploading the PPT again.") : t("Create a lesson that will appear in the user Lessons page.")}</p></div><span className="admin-demo-badge">{isSupabaseConfigured ? t("Supabase cloud storage") : t("Browser demo storage")}</span></div>
              <div className="admin-form-grid">
                <label><span>{t("Lesson number")}</span><input name="number" value={form.number} onChange={updateField} placeholder="1.7" /></label>
                <label><span>{t("English title")}</span><input name="title" value={form.title} onChange={updateField} placeholder="Factory Location" /></label>
                <label><span>{t("Traditional Chinese title")}</span><input name="chineseTitle" value={form.chineseTitle} onChange={updateField} placeholder="工廠位置" /></label>
                <label><span>{t("Pinyin")}</span><input name="pinyin" value={form.pinyin} onChange={updateField} placeholder="gōngchǎng wèizhì" /></label>
                <label className="wide"><span>{t("Description")}</span><textarea name="description" value={form.description} onChange={updateField} placeholder={t("Describe what learners will practice.")} rows="2" /></label>
                <label><span>{t("Level")}</span><select name="level" value={form.level} onChange={updateField}><option value="Beginner">{t("Beginner")}</option><option value="Intermediate">{t("Intermediate")}</option><option value="Workplace">{t("Workplace")}</option><option value="Daily Life">{t("Daily Life")}</option></select></label>
                <label><span>{t("Minimum active learning time (minutes)")}</span><input name="estimatedTime" type="number" min="1" value={form.estimatedTime} onChange={updateField} /></label>
                <label><span>{t("Practice type")}</span><select name="practiceType" value={form.practiceType} onChange={updateField}><option value="Speaking Mission">{t("Speaking Mission")}</option><option value="Lesson Practice">{t("Lesson Practice")}</option><option value="Vocabulary Review">{t("Vocabulary Review")}</option></select></label>
              </div>
              {editingLessonId ? <div className="admin-retained-files"><FolderOpen /><span><strong>{t("Existing material will be kept")}</strong><small>{lessons.find((lesson) => lesson.id === editingLessonId)?.fileNames?.join(", ") || t("Uploaded slides and PPT files remain attached.")}</small></span></div> : <>
                <label className="admin-file-drop"><FileUp /><span><strong>{t("Choose PPT/PPTX or slide images")}</strong><small>{storageHint} · {files.map((file) => file.name).join(", ")}</small></span><input ref={uploadRef} type="file" accept=".ppt,.pptx,.pdf,image/png,image/jpeg,image/webp" multiple onChange={chooseFiles} /></label>
                <p className="admin-file-note">{t("Slide images preview immediately. Published PPT/PPTX files are converted into stable slide images for a cleaner lesson experience.")}</p>
              </>}
              <div className="admin-form-actions">{editingLessonId ? <><button className="admin-secondary" type="button" onClick={cancelEdit} disabled={busy}>{t("Cancel")}</button><button className="admin-primary" type="button" onClick={() => submitLesson(lessons.find((lesson) => lesson.id === editingLessonId)?.status)} disabled={busy}><CheckCircle2 />{t("Save Changes")}</button></> : <><button className="admin-secondary" type="button" onClick={() => submitLesson("draft")} disabled={busy}><Archive />{t("Save Draft")}</button><button className="admin-primary" type="button" onClick={() => submitLesson("published")} disabled={busy}><Send />{t("Publish Lesson")}</button></>}</div>
            </section>

            <section className="admin-card admin-library-card" id="admin-published">
              <div className="admin-card-heading"><div><h2><BookOpen />{t("Lesson Library")}</h2><p>{t("Minimum active study time is required before learners can complete a lesson. Changes sync to the user Lessons page.")}</p></div><span className="admin-count-pill">{lessons.length} {t("items")}</span></div>
              <div className="admin-lesson-list">
                {!lessons.length && <div className="admin-empty"><FolderOpen /><strong>{t("No lessons uploaded yet")}</strong><span>{t("Use the form to add your first lesson.")}</span></div>}
                {lessons.map((lesson) => <article className="admin-lesson-item" key={lesson.id}><span className={`admin-status-dot ${lesson.status}`} /><div><strong>{t("Lesson")} {lesson.number} · {lesson.title}</strong><span>{lesson.chineseTitle} · {t(lesson.level)} · {lesson.fileNames?.length || 0} {t("file(s)")}</span><small>{t("Required active learning")}: {durationLabel(lesson.estimatedTime)} · {t("Updated")} {formatUpdated(lesson.updatedAt)}</small></div><div className="admin-item-actions"><span className={`admin-status-label ${lesson.status}`}>{t(lesson.status)}</span><button className="edit-lesson-button" type="button" title={t("Edit lesson details")} aria-label={`Edit Lesson ${lesson.number} ${lesson.title}`} onClick={() => editLesson(lesson)}><Pencil /></button><button type="button" disabled={deletingIds.includes(lesson.id)} title={deletingIds.includes(lesson.id) ? t("Removing lesson…") : t("Remove lesson")} aria-label={`Remove Lesson ${lesson.number} ${lesson.title}`} onClick={() => removeLesson(lesson)}>{deletingIds.includes(lesson.id) ? t("Removing…") : <Trash2 />}</button></div></article>)}
              </div>
            </section>
          </div>
          </>}
        </div>
      </main>
    </div>
  );
}
