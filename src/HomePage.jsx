import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronRight, Clock3, Flame, Headphones, ListChecks, Mic, Sparkles, Target, Volume2 } from "lucide-react";
import { loadPublishedLessons, readPublishedLessons, subscribeToLessonChanges } from "./utils/adminLessonStore";
import { readEffectiveLessonProgress, subscribeToLessonProgress } from "./utils/lessonProgress";
import { lessonPath, pathForPage } from "./utils/appRouting";
import { learningTimeMinutes, readLearningTime, subscribeToLearningTime } from "./utils/learningTime";
import "./home.css";
import "./home-lesson-status.css";

function formatMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 min";
  if (value < 1) return "<1 min";
  return `${Math.round(value)} min`;
}

function statusText(status, progress) {
  if (status === "completed") return "Completed";
  if (status === "progress") return `In Progress · ${progress}%`;
  return "Not Started";
}

function LessonStatusCard({ lessons, onOpen, onViewAll }) {
  const completed = lessons.filter((lesson) => lesson.learningStatus === "completed").length;
  const inProgress = lessons.filter((lesson) => lesson.learningStatus === "progress").length;
  const notStarted = lessons.length - completed - inProgress;

  return (
    <section className="home-lesson-status card">
      <header>
        <h2><BookOpen /> Lesson Status</h2>
        <button type="button" onClick={onViewAll}>View all <ChevronRight /></button>
      </header>
      <p>Progress for materials published by your administrator.</p>
      <div className="home-lesson-counts" aria-label="Published lesson counts">
        <span><b>{inProgress}</b>In Progress</span>
        <span><b>{notStarted}</b>Not Started</span>
        <span><b>{completed}</b>Completed</span>
      </div>
      {lessons.length ? <div className="home-lesson-list">
        {lessons.slice(0, 4).map((lesson) => (
          <button type="button" className="home-lesson-row" key={lesson.id} onClick={() => onOpen(lesson)}>
            <span className={`home-lesson-icon ${lesson.learningStatus}`}>
              {lesson.learningStatus === "completed" ? <Check /> : <BookOpen />}
            </span>
            <span className="home-lesson-copy">
              <strong>Lesson {lesson.number} · {lesson.title}</strong>
              <small>{lesson.chineseTitle || lesson.description || "Published learning material"}</small>
            </span>
            <span className={`home-lesson-badge ${lesson.learningStatus}`}>{statusText(lesson.learningStatus, lesson.progress)}</span>
            <ChevronRight className="home-lesson-chevron" />
          </button>
        ))}
      </div> : <div className="home-no-lessons">
        <BookOpen />
        <span><strong>No published lessons yet</strong><small>Materials published by the administrator will appear here.</small></span>
      </div>}
    </section>
  );
}

export default function HomePage({ notify, onNavigate = () => {}, userName = "Alex" }) {
  const [learningTime, setLearningTime] = useState(() => learningTimeMinutes(readLearningTime()));
  const [publishedLessons, setPublishedLessons] = useState(() => readPublishedLessons());
  const [progressVersion, setProgressVersion] = useState(0);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);

  const refreshLessons = useCallback(() => {
    loadPublishedLessons().then((items) => {
      setPublishedLessons(items.filter((lesson) => lesson.status === "published"));
      setLessonsLoaded(true);
    }).catch(() => {
      setPublishedLessons(readPublishedLessons());
      setLessonsLoaded(true);
    });
  }, []);

  useEffect(() => {
    refreshLessons();
    const unsubscribeLessons = subscribeToLessonChanges(refreshLessons);
    const unsubscribeProgress = subscribeToLessonProgress(() => setProgressVersion((version) => version + 1));
    const unsubscribeTime = subscribeToLearningTime((record) => setLearningTime(learningTimeMinutes(record)));
    const handleStorage = (event) => {
      if (event.key === "bd10-admin-lessons-v1") refreshLessons();
    };
    const handleFocus = () => {
      refreshLessons();
      setLearningTime(learningTimeMinutes(readLearningTime()));
    };
    window.addEventListener("bd10-admin-lessons-updated", refreshLessons);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    return () => {
      unsubscribeLessons();
      unsubscribeProgress();
      unsubscribeTime();
      window.removeEventListener("bd10-admin-lessons-updated", refreshLessons);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshLessons]);

  const lessonsWithProgress = useMemo(() => publishedLessons.map((lesson) => {
    const progress = readEffectiveLessonProgress(lesson);
    return { ...lesson, learningStatus: progress.status, progress: progress.progress, lessonProgress: progress };
  }), [publishedLessons, progressVersion]);
  const priorityLesson = lessonsWithProgress.find((lesson) => lesson.learningStatus === "progress")
    || lessonsWithProgress.find((lesson) => lesson.learningStatus === "new")
    || lessonsWithProgress[0]
    || null;
  const todayPercent = Math.min(100, Math.round((learningTime.todayLearningMinutes / 30) * 100));
  const learningStatus = learningTime.todayLearningMinutes > 0 ? `${formatMinutes(learningTime.todayLearningMinutes)} learned today` : "Ready to start learning";
  const openLesson = (lesson) => onNavigate(lessonPath(lesson.id));
  const openLessons = () => onNavigate(pathForPage("Lessons"));

  return <div className="home-page">
    <section className="home-hero">
      <img src="/assets/campus-cleanroom-hero.png" alt="BD10 cleanroom mascot"/><i/>
      <div className="home-copy">
        <h1>Welcome back,<br/><strong>{userName}! 👋</strong></h1>
        <h2>Keep Your Momentum Going</h2>
        <p>Continue learning from where you left off.</p>
        <div className="today-progress">
          <div style={{background:`conic-gradient(#10b878 ${todayPercent}%,#dcebf8 0)`}}><b>{todayPercent}%</b></div>
          <section><strong>Today’s Learning Time</strong><span>{learningStatus}</span><i><em style={{width:`${todayPercent}%`}}/></i><small>Total learning time: {formatMinutes(learningTime.totalLearningMinutes)}</small></section>
        </div>
        <div className="hero-actions">
          <button onClick={() => priorityLesson ? openLesson(priorityLesson) : openLessons()}>{priorityLesson?.learningStatus === "progress" ? "Continue Lesson" : "Continue Learning"}<ArrowRight/><small>{priorityLesson ? "Resume your lesson." : "Browse published lessons."}</small></button>
          <span>{priorityLesson ? <><b>Lesson {priorityLesson.number} · {priorityLesson.title}</b><small>{statusText(priorityLesson.learningStatus, priorityLesson.progress)}</small></> : <><b>{lessonsLoaded ? "No published lesson" : "Loading lessons…"}</b><small>Published materials appear here.</small></>}</span>
        </div>
      </div>
      <div className="learning-path"><span>🏆 Speaking Challenge</span><span>🎧 Pronunciation</span><span>▣ Flashcards</span><span>📖 Vocabulary</span><small>Vocabulary → Flashcards → Pronunciation → Speaking</small></div>
    </section>

    <div className="home-grid">
      <LessonStatusCard lessons={lessonsWithProgress} onOpen={openLesson} onViewAll={openLessons} />
      <section className="challenge card"><header><h2><Mic/> Today’s Challenge</h2><b>2 left</b></header><p>Complete your remaining speaking tasks.</p>{["Greet the AI (1/1)","Introduce yourself (1/1)","Talk about your hobbies (0/1)","Describe your daily routine (0/1)"].map((x,i)=><span key={x} className={i<2?"done":""}>{i<2?<Check/>:"○"}{x}</span>)}<button onClick={()=>notify("Start Speaking")}>Start Speaking <ArrowRight/><small>Continue today’s speaking challenge.</small></button></section>
      <section className="goal card"><header><h2><Target/> Daily Goal</h2><b>60%</b></header><p>Finish small learning goals every day.</p>{[["Learn 6 new words","4 / 6"],["Review 10 words","7 / 10"],["Speak 3 sentences","1 / 3"]].map(([x,y])=><div key={x}><span>{x}</span><i><em/></i><b>{y}</b></div>)}</section>
      <section className="activity card"><header><h2><Clock3/> Recent Activity</h2><button>View All <ChevronRight/></button></header><p>See what you practiced recently.</p>{[["Completed Pronunciation Practice","10 min ago"],["Studied Food & Drinks (Flashcards)","1 hour ago"],["Finished Lesson 1.5","3 hours ago"]].map(([x,y])=><span key={x}>● {x}<small>{y}</small></span>)}</section>
      <section className="recommended card"><header><h2><Sparkles/> Recommended for You</h2></header><p>Continue with a lesson that matches your progress.</p><div><span>🧋</span><article><strong>Food & Drinks <small>| Flashcards</small></strong><p>Learn useful words for daily life.</p><button onClick={()=>notify("Start Now")}>Start Now <ArrowRight/><small>Begin the recommended practice.</small></button></article></div></section>
      <section className="path-card"><p>A little progress<br/>every day<br/>leads to big results!</p></section>
    </div>
  </div>;
}
