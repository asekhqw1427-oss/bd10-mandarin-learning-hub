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
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./utils/supabaseClient";
import { loadAdminLessons, materializePublishedLessonSlides, readAdminLessons, removeAdminLesson, saveAdminLesson } from "./utils/adminLessonStore";
import "./admin.css";

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
  const [lessons, setLessons] = useState(() => readAdminLessons());
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [busy, setBusy] = useState(false);
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
            try { await materializePublishedLessonSlides(lesson); } catch { /* keep the legacy viewer fallback if a backfill is unavailable */ }
          }
          const refreshed = legacyPublished.length ? await loadAdminLessons() : next;
          if (active) setLessons(refreshed);
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

  const removeLesson = (lesson) => {
    removeAdminLesson(lesson.id)
      .then(() => loadAdminLessons())
      .then((next) => setLessons(next))
      .then(() => notify(`${lesson.title} was removed from the admin library.`))
      .catch(() => notify("The lesson could not be removed from Site storage.", "error"));
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><img src="/assets/bd10-project-logo.png" alt="BD10 Mandarin Learning Hub" /><span>Admin Console 管理中心</span></div>
        <nav className="admin-nav" aria-label="Admin navigation">
          <button className="active" type="button"><LayoutDashboard />Dashboard</button>
          <button type="button" onClick={() => document.getElementById("admin-lessons")?.scrollIntoView({ behavior: "smooth" })}><BookOpen />Lesson Materials</button>
          <button type="button" onClick={() => uploadRef.current?.focus()}><UploadCloud />Upload Lesson</button>
          <button type="button" onClick={() => document.getElementById("admin-published")?.scrollIntoView({ behavior: "smooth" })}><CheckCircle2 />Published Lessons</button>
        </nav>
        <div className="admin-sidebar-note"><Sparkles /><strong>Manage once.</strong><span>Publish learning content for your team.</span></div>
        <button className="admin-logout" type="button" onClick={onLogout}><LogOut />Back to login</button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar"><div><span>BD10 Mandarin Learning Hub</span><strong>Admin Dashboard</strong></div><div className="admin-user"><span>ADMIN</span><button type="button" onClick={onLogout}>Log out</button></div></header>
        <div className="admin-content">
          <section className="admin-welcome"><div><span className="admin-eyebrow">CONTENT MANAGEMENT · 內容管理</span><h1>Lesson Materials</h1><p>Upload, review, and publish Mandarin learning lessons.</p></div><button className="admin-primary" type="button" onClick={() => uploadRef.current?.focus()}><Plus />Upload New Lesson</button></section>

          <section className="admin-account-card" aria-labelledby="demo-account-heading">
            <div className="admin-account-heading"><div><h2 id="demo-account-heading">Demo Accounts</h2><p>Create five learner logins and two admin logins in Supabase Auth. Passwords are shown only here after creation or reset.</p></div><div className="admin-account-actions"><button className="admin-secondary" type="button" disabled={accountBusy || !isSupabaseConfigured} onClick={() => provisionDemoAccounts(false)}>{accountBusy ? "Working…" : "Create Missing Accounts"}</button><button className="admin-secondary" type="button" disabled={accountBusy || !isSupabaseConfigured} onClick={() => provisionDemoAccounts(true)}>Reset All Demo Passwords</button></div></div>
            {accountResults && <>
              <div className="admin-account-note">Save any newly shown passwords now. Existing passwords are never read back from Supabase.</div>
              <div className="admin-account-table-wrap"><table className="admin-account-table"><thead><tr><th>Login ID</th><th>Name</th><th>Role</th><th>Password</th><th></th></tr></thead><tbody>
                {(accountResults.accounts || []).map((account) => <tr key={account.employeeId}><td><code>{account.employeeId}</code></td><td>{account.displayName}</td><td><span className={`admin-role-pill ${account.role}`}>{account.role}</span></td><td><code>{account.password || "Already exists · hidden"}</code></td><td>{account.password && <button className="admin-copy-button" type="button" onClick={() => copyAccount(account)}>Copy</button>}</td></tr>)}
                {(accountResults.errors || []).map((item) => <tr key={item.employeeId}><td><code>{item.employeeId}</code></td><td colSpan="4" className="admin-account-error">{item.message}</td></tr>)}
              </tbody></table></div>
            </>}
          </section>

          <section className="admin-stat-grid" aria-label="Lesson statistics">
            <StatCard icon={CheckCircle2} label="Published Lessons" value={publishedCount} accent="green" />
            <StatCard icon={Clock3} label="Draft Lessons" value={draftCount} accent="orange" />
            <StatCard icon={MonitorPlay} label="Slide Previews" value={slideCount} accent="blue" />
            <StatCard icon={FolderOpen} label="Learning Library" value={lessons.length} accent="purple" />
          </section>

          <div className="admin-workspace">
          <section className="admin-card admin-upload-card" id="admin-lessons">
              <div className="admin-card-heading"><div><h2><UploadCloud />{editingLessonId ? "Edit Lesson Details" : "Upload Lesson"}</h2><p>{editingLessonId ? "Update lesson information without uploading the PPT again." : "Create a lesson that will appear in the user Lessons page."}</p></div><span className="admin-demo-badge">{isSupabaseConfigured ? "Supabase cloud storage" : "Browser demo storage"}</span></div>
              <div className="admin-form-grid">
                <label><span>Lesson number</span><input name="number" value={form.number} onChange={updateField} placeholder="1.7" /></label>
                <label><span>English title</span><input name="title" value={form.title} onChange={updateField} placeholder="Factory Location" /></label>
                <label><span>Traditional Chinese title</span><input name="chineseTitle" value={form.chineseTitle} onChange={updateField} placeholder="工廠位置" /></label>
                <label><span>Pinyin</span><input name="pinyin" value={form.pinyin} onChange={updateField} placeholder="gōngchǎng wèizhì" /></label>
                <label className="wide"><span>Description</span><textarea name="description" value={form.description} onChange={updateField} placeholder="Describe what learners will practice." rows="2" /></label>
                <label><span>Level</span><select name="level" value={form.level} onChange={updateField}><option>Beginner</option><option>Intermediate</option><option>Workplace</option><option>Daily Life</option></select></label>
                <label><span>Minimum active learning time (minutes)</span><input name="estimatedTime" type="number" min="1" value={form.estimatedTime} onChange={updateField} /></label>
                <label><span>Practice type</span><select name="practiceType" value={form.practiceType} onChange={updateField}><option>Speaking Mission</option><option>Lesson Practice</option><option>Vocabulary Review</option></select></label>
              </div>
              {editingLessonId ? <div className="admin-retained-files"><FolderOpen /><span><strong>Existing material will be kept</strong><small>{lessons.find((lesson) => lesson.id === editingLessonId)?.fileNames?.join(", ") || "Uploaded slides and PPT files remain attached."}</small></span></div> : <>
                <label className="admin-file-drop"><FileUp /><span><strong>Choose PPT/PPTX or slide images</strong><small>{storageHint} · {files.map((file) => file.name).join(", ")}</small></span><input ref={uploadRef} type="file" accept=".ppt,.pptx,.pdf,image/png,image/jpeg,image/webp" multiple onChange={chooseFiles} /></label>
                <p className="admin-file-note">Slide images preview immediately. Published PPT/PPTX files are converted into stable slide images for a cleaner lesson experience.</p>
              </>}
              <div className="admin-form-actions">{editingLessonId ? <><button className="admin-secondary" type="button" onClick={cancelEdit} disabled={busy}>Cancel</button><button className="admin-primary" type="button" onClick={() => submitLesson(lessons.find((lesson) => lesson.id === editingLessonId)?.status)} disabled={busy}><CheckCircle2 />Save Changes</button></> : <><button className="admin-secondary" type="button" onClick={() => submitLesson("draft")} disabled={busy}><Archive />Save Draft</button><button className="admin-primary" type="button" onClick={() => submitLesson("published")} disabled={busy}><Send />Publish Lesson</button></>}</div>
            </section>

            <section className="admin-card admin-library-card" id="admin-published">
              <div className="admin-card-heading"><div><h2><BookOpen />Lesson Library</h2><p>Minimum active study time is required before learners can complete a lesson. Changes sync to the user Lessons page.</p></div><span className="admin-count-pill">{lessons.length} items</span></div>
              <div className="admin-lesson-list">
                {!lessons.length && <div className="admin-empty"><FolderOpen /><strong>No lessons uploaded yet</strong><span>Use the form to add your first lesson.</span></div>}
                {lessons.map((lesson) => <article className="admin-lesson-item" key={lesson.id}><span className={`admin-status-dot ${lesson.status}`} /><div><strong>Lesson {lesson.number} · {lesson.title}</strong><span>{lesson.chineseTitle} · {lesson.level} · {lesson.fileNames?.length || 0} file(s)</span><small>Required active learning: {durationLabel(lesson.estimatedTime)} · Updated {formatUpdated(lesson.updatedAt)}</small></div><div className="admin-item-actions"><span className={`admin-status-label ${lesson.status}`}>{lesson.status}</span><button className="edit-lesson-button" type="button" title="Edit lesson details" aria-label={`Edit Lesson ${lesson.number} ${lesson.title}`} onClick={() => editLesson(lesson)}><Pencil /></button><button type="button" title="Remove lesson" aria-label={`Remove Lesson ${lesson.number} ${lesson.title}`} onClick={() => removeLesson(lesson)}><Trash2 /></button></div></article>)}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
