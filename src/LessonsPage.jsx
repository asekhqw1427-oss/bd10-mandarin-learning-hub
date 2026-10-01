import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, Clock3, Target } from "lucide-react";
import LessonViewer from "./LessonViewer";
import { loadPublishedLessons, readPublishedLessons, subscribeToLessonChanges } from "./utils/adminLessonStore";
import { learningTimeMinutes, readLearningTime, subscribeToLearningTime } from "./utils/learningTime";
import { readEffectiveLessonProgress, readPublishedLessonSummary, subscribeToLessonProgress } from "./utils/lessonProgress";
import "./lessons.css";

function LessonRow({ lesson, onAction }) {
  const statusLabel = lesson.status === "completed" ? "Completed" : lesson.status === "progress" ? `In Progress · ${lesson.progress}%` : "Not Started";
  return (
    <article className="lesson-row">
      <div className={`lesson-thumb ${lesson.status}`}><BookOpen /><span>{lesson.no}</span></div>
      <strong className="lesson-number">{lesson.no}</strong>
      <div className="lesson-name"><h4>{lesson.title} <span>{lesson.zh}</span></h4><p>{lesson.pinyin} · {lesson.description}</p></div>
      <span className="lesson-level">🌐 {lesson.level}</span>
      <span className="lesson-duration" title="Minimum active learning time"><Clock3 />{formatDuration(lesson.duration)}</span>
      <span className={`lesson-status ${lesson.status}`}>{lesson.status === "completed" ? <Check /> : lesson.status === "progress" ? <span className="tiny-ring" /> : <span className="empty-dot" />}{statusLabel}</span>
      <button className={`lesson-action ${lesson.status === "progress" ? "primary" : ""}`} type="button" onClick={() => onAction(lesson)}>{lesson.status === "completed" ? "Review" : lesson.status === "progress" ? "Continue" : "Start"}{lesson.status === "progress" && <ArrowRight />}</button>
    </article>
  );
}

function formatDuration(value) {
  const minutes = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} min` : "15 min";
}

function ContinueLearning({ lesson, onOpen }) {
  if (!lesson) {
    return (
      <section className="lesson-panel continue-panel reveal delay-1">
        <h2>Continue Learning</h2>
        <div className="continue-empty">
          <span><BookOpen /></span>
          <div><strong>No published lessons yet</strong><p>Materials published by the administrator will appear here automatically.</p></div>
        </div>
      </section>
    );
  }

  const previewImage = lesson.slides?.[0]?.thumbnail || lesson.slides?.[0]?.image || "/assets/campus-cleanroom-hero.png";
  const learningStatus = lesson.learningStatus || "new";
  const progressLabel = learningStatus === "completed" ? "Completed" : learningStatus === "progress" ? `In progress · ${lesson.progress}%` : "Ready to learn";
  const buttonLabel = learningStatus === "completed" ? "Review Lesson" : learningStatus === "progress" ? "Continue Lesson" : "Open Lesson";
  return (
    <section className="lesson-panel continue-panel reveal delay-1">
      <h2>Continue Learning</h2>
      <div className="continue-layout">
        <div className="continue-image"><img src={previewImage} alt={`${lesson.title} lesson preview`} /><span>Published</span></div>
        <div className="continue-copy">
          <small>Lesson {lesson.number}</small>
          <h3>{lesson.title} <span>{lesson.chineseTitle}</span></h3>
          <p>{lesson.pinyin && <><em>{lesson.pinyin}</em> · </>}{lesson.description}</p>
          <div className="continue-meta"><span>🌐 {lesson.level}</span><span title="Minimum active learning time"><Clock3 />{formatDuration(lesson.estimatedTime)}</span><span><Target />{lesson.practiceType}</span></div>
          <div className={`continue-ready ${learningStatus}`}>{learningStatus === "progress" ? <Clock3 /> : <Check />}{progressLabel}</div>
        </div>
        <button className="continue-button" type="button" onClick={() => onOpen(lesson)}>{buttonLabel} <ArrowRight /></button>
      </div>
    </section>
  );
}

function formatLearningMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 min";
  if (value < 1) return "<1 min";
  return `${Math.round(value)} min`;
}

function OverallProgress({ todayLearningMinutes, totalLearningMinutes, completedCount, totalCount, percent }) {
  return (
    <section className="lesson-side-card overall-card reveal delay-1">
      <h2>Your Overall Progress</h2>
      <div className="overall-main"><div className="lesson-ring" style={{ background: `conic-gradient(#1483e9 ${percent}%,#d7eafb 0)` }}><strong>{percent}%</strong></div><div><strong>{completedCount} / {totalCount}</strong><span>Lessons Completed</span></div></div>
      <div className="overall-stats">
        <div><Clock3 /><span><strong>{formatLearningMinutes(todayLearningMinutes)}</strong>Today’s Learning Time</span></div>
        <div><Clock3 /><span><strong>{formatLearningMinutes(totalLearningMinutes)}</strong>Total Learning Time</span></div>
      </div>
    </section>
  );
}

export default function LessonsPage({ query = "", notify = () => {}, todayLearningMinutes, totalLearningMinutes, selectedLessonId = null, onLessonRoute = () => {} }) {
  const [trackedTime, setTrackedTime] = useState(() => learningTimeMinutes(readLearningTime()));
  const [publishedAdminLessons, setPublishedAdminLessons] = useState(() => readPublishedLessons());
  const [progressVersion, setProgressVersion] = useState(0);

  // Keep the viewer closed until the learner explicitly chooses one of the
  // administrator-published lessons below.

  // The user-facing lesson library is sourced only from administrator-published
  // Supabase rows. Drafts remain available to administrators but never enter
  // this state or the rendered lesson list.
  useEffect(() => {
    let active = true;
    const refreshPublishedLessons = () => {
      loadPublishedLessons()
        .then((next) => {
          if (active) setPublishedAdminLessons(next.filter((lesson) => lesson.status === "published"));
        })
        .catch(() => {
          if (active) setPublishedAdminLessons(readPublishedLessons());
        });
    };
    refreshPublishedLessons();
    const unsubscribe = subscribeToLessonChanges(refreshPublishedLessons);
    window.addEventListener("bd10-admin-lessons-updated", refreshPublishedLessons);
    window.addEventListener("storage", refreshPublishedLessons);
    window.addEventListener("focus", refreshPublishedLessons);
    const poll = window.setInterval(refreshPublishedLessons, 10000);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(poll);
      window.removeEventListener("bd10-admin-lessons-updated", refreshPublishedLessons);
      window.removeEventListener("storage", refreshPublishedLessons);
      window.removeEventListener("focus", refreshPublishedLessons);
    };
  }, []);

  useEffect(() => subscribeToLessonProgress(() => setProgressVersion((version) => version + 1)), []);
  useEffect(() => subscribeToLearningTime((record) => setTrackedTime(learningTimeMinutes(record))), []);

  const lessonsWithProgress = useMemo(() => publishedAdminLessons.map((lesson) => {
    const progress = readEffectiveLessonProgress(lesson);
    return { ...lesson, learningStatus: progress.status, progress: progress.progress, lessonProgress: progress };
  }), [publishedAdminLessons, progressVersion]);
  const adminLessons = useMemo(() => lessonsWithProgress.map((lesson) => ({
    id: lesson.id,
    no: lesson.number,
    title: lesson.title,
    zh: lesson.chineseTitle,
    pinyin: lesson.pinyin,
    description: lesson.description,
    level: lesson.level,
    duration: lesson.estimatedTime,
    status: lesson.learningStatus,
    progress: lesson.progress,
    viewerData: lesson,
  })), [lessonsWithProgress]);
  const visibleLessons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return adminLessons;
    return adminLessons.filter((lesson) => `${lesson.title} ${lesson.zh} ${lesson.pinyin} ${lesson.description}`.toLowerCase().includes(normalizedQuery));
  }, [adminLessons, query]);
  const latestPublishedLesson = lessonsWithProgress.find((lesson) => lesson.learningStatus === "progress")
    || lessonsWithProgress.find((lesson) => lesson.learningStatus === "new")
    || lessonsWithProgress[0]
    || null;
  const completedVisibleCount = visibleLessons.filter((lesson) => lesson.status === "completed").length;
  const overallProgress = useMemo(() => readPublishedLessonSummary(publishedAdminLessons), [publishedAdminLessons, progressVersion]);
  const handleTimeUpdate = useCallback((record) => setTrackedTime(learningTimeMinutes(record)), []);
  const openLesson = useCallback((lesson) => {
    sessionStorage.setItem("bd10-active-lesson", lesson.id);
    onLessonRoute(lesson.id);
  }, [onLessonRoute]);
  const selectedLesson = selectedLessonId ? lessonsWithProgress.find((lesson) => lesson.id === selectedLessonId) : null;

  if (selectedLesson) {
    return <LessonViewer lesson={selectedLesson} onBack={() => onLessonRoute(null)} onTimeUpdate={handleTimeUpdate} notify={notify} />;
  }

  return (
    <div className="lessons-page">
      <section className="lessons-hero reveal">
        <img src="/assets/campus-cleanroom-hero.png" alt="Cleanroom team at the ASE semiconductor campus" />
        <div className="lessons-hero-wash" />
        <div className="lessons-hero-copy"><h1>Lessons <span>學習課程</span></h1><p>Structured learning. Real-life speaking. A brighter future.</p></div>
        <div className="lessons-hero-note">Learn Today<br />Speak Tomorrow!</div>
      </section>

      <div className="lessons-page-content">
        <div className="lessons-top-row">
          <ContinueLearning lesson={latestPublishedLesson} onOpen={openLesson} />
          <OverallProgress todayLearningMinutes={todayLearningMinutes ?? trackedTime.todayLearningMinutes} totalLearningMinutes={totalLearningMinutes ?? trackedTime.totalLearningMinutes} {...overallProgress} />
        </div>
        <section className="all-lessons reveal delay-2">
          <div className="all-lessons-heading"><div><h2>All Lessons <span>所有課程</span></h2><p>Study each topic at a comfortable pace.</p></div><BookOpen aria-hidden="true" /></div>
          <div className="lesson-list">
            <div className="lesson-group-heading"><span>1</span><strong>Published Lessons 已發布課程</strong><small>{visibleLessons.length} Lessons</small><em>{completedVisibleCount} / {visibleLessons.length} completed</em></div>
            {!visibleLessons.length && <div className="lesson-list-empty"><BookOpen /><strong>{query ? "No published lessons match your search" : "No lessons have been published"}</strong><span>{query ? "Try another lesson title or topic." : "Published admin materials will appear here automatically."}</span></div>}
            {visibleLessons.map(lesson => <LessonRow key={lesson.id} lesson={lesson} onAction={(selected) => openLesson(selected.viewerData)} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
