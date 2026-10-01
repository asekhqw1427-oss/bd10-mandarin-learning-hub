import React, { useEffect, useMemo, useState } from "react";
import { Award, BarChart3, BookOpen, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Flame, Flag, Headphones, Layers3, Mic, Sparkles, Target, Trophy } from "lucide-react";
import { learningTimeMinutes, readLearningTime, subscribeToLearningTime } from "./utils/learningTime";
import { loadPublishedLessons, readPublishedLessons, subscribeToLessonChanges } from "./utils/adminLessonStore";
import { readPublishedLessonSummary, subscribeToLessonProgress } from "./utils/lessonProgress";
import "./progress.css";

const areas = [
  { label: "Vocabulary", value: 75, count: "15 / 20", Icon: BookOpen, tone: "blue" },
  { label: "Flashcards", value: 60, count: "12 / 20", Icon: Layers3, tone: "green" },
  { label: "Pronunciation", value: 45, count: "9 / 20", Icon: Headphones, tone: "purple" },
  { label: "Speaking", value: 40, count: "8 / 20", Icon: Mic, tone: "orange" },
];

const activity = [
  ["Practiced Pronunciation", "10 min ago", Headphones],
  ["Completed Lesson 1.5 (Food & Drinks)", "1 hour ago", BookOpen],
  ["Speaking Challenge", "3 hours ago", Mic],
  ["Studied 10 new words", "5 hours ago", Sparkles],
  ["Flashcards Review", "1 day ago", Layers3],
];

const goals = [
  ["Learn 6 new words", "4 / 6", "green", BookOpen],
  ["Review 10 words", "7 / 10", "blue", Layers3],
  ["Speak 3 sentences", "1 / 3", "purple", Mic],
];

function Helper({ children }) { return <p className="progress-helper">{children}</p>; }
function Ring({ value, tone = "blue" }) { return <span className={`progress-ring progress-${tone}`} style={{ "--value": `${value}%` }}><b>{value}%</b></span>; }
function CardTitle({ Icon, title, helper, action }) { return <header className="progress-card-title"><div><h2><Icon />{title}</h2>{helper && <Helper>{helper}</Helper>}</div>{action}</header>; }

function formatMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 min";
  if (value < 1) return "<1 min";
  return `${Math.round(value)} min`;
}

export default function ProgressPage({ notify }) {
  const [learningTime, setLearningTime] = useState(() => learningTimeMinutes(readLearningTime()));
  const [publishedLessons, setPublishedLessons] = useState(() => readPublishedLessons().filter((lesson) => lesson.status === "published"));
  const [progressVersion, setProgressVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => loadPublishedLessons()
      .then((lessons) => { if (active) setPublishedLessons(lessons.filter((lesson) => lesson.status === "published")); })
      .catch(() => { if (active) setPublishedLessons(readPublishedLessons().filter((lesson) => lesson.status === "published")); });
    refresh();
    const unsubscribeLessons = subscribeToLessonChanges(refresh);
    const unsubscribeProgress = subscribeToLessonProgress(() => setProgressVersion((version) => version + 1));
    const unsubscribeTime = subscribeToLearningTime((record) => setLearningTime(learningTimeMinutes(record)));
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      unsubscribeLessons();
      unsubscribeProgress();
      unsubscribeTime();
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const lessonSummary = useMemo(() => readPublishedLessonSummary(publishedLessons), [publishedLessons, progressVersion]);
  return <div className="progress-page">
    <section className="progress-hero">
      <img src="/assets/campus-cleanroom-hero.png" alt="BD10 cleanroom mascot encouraging learning progress" />
      <i />
      <div className="progress-hero-copy">
        <h1>My Learning Progress</h1>
        <p>Every small step brings you closer to a bigger conversation.</p>
        <section className="overall-progress-card">
          <Ring value={lessonSummary.percent} tone="green" />
          <div><h2>Overall Progress</h2><Helper>See how much of your published lessons you have completed.</Helper><p>You have completed {lessonSummary.completedCount} of {lessonSummary.totalCount} lessons.</p><span><i style={{ width: `${lessonSummary.percent}%` }} /></span><div className="learning-time-summary"><small><Clock3 /><b>{formatMinutes(learningTime.todayLearningMinutes)}</b>Today</small><small><Clock3 /><b>{formatMinutes(learningTime.totalLearningMinutes)}</b>Total</small></div></div>
        </section>
      </div>
      <div className="progress-hero-note"><strong>Keep Going!</strong><span>You’re Doing Great!</span></div>
    </section>

    <div className="progress-top-grid">
      <section className="progress-card learning-area-card">
        <CardTitle Icon={BarChart3} title="Progress by Learning Area" helper="Track your progress in each learning skill." />
        <div className="learning-area-list">{areas.map(({ label, value, count, Icon, tone }) => <div key={label} className={`area-${tone}`}><Ring value={value} tone={tone} /><strong><Icon />{label}<small>{count}</small></strong></div>)}</div>
      </section>
      <section className="progress-card weekly-card">
        <CardTitle Icon={CalendarDays} title="Weekly Progress" helper="See your learning activity across the week." action={<button type="button" className="week-select">This Week <ChevronDown /></button>} />
        <div className="weekly-bars">{[["Mon",20],["Tue",35],["Wed",50],["Thu",30],["Fri",45],["Sat",25],["Sun",40]].map(([day, value]) => <div key={day}><b>{value}</b><span style={{height:`${value * 2}px`}} /><small>{day}</small></div>)}</div>
      </section>
      <section className="progress-card streak-card">
        <CardTitle Icon={Flame} title="Learning Streak" helper="Keep your daily learning streak going." />
        <strong className="streak-number">12<small>Days in a row!</small></strong>
        <p>Great! Keep the streak going!</p>
        <div className="streak-days">{[1,2,3,4,5,6,7].map(day => <span key={day} className={day > 5 ? "off" : ""}>🔥</span>)}</div>
      </section>
    </div>

    <div className="progress-bottom-grid">
      <section className="progress-card activity-card">
        <CardTitle Icon={Clock3} title="Recent Activity" helper="Review what you learned recently." action={<button type="button" onClick={() => notify("Recent Activity")}>View All <ChevronRight /></button>} />
        <div className="activity-list">{activity.map(([label, time, Icon]) => <div key={label}><Icon /><span>{label}</span><small>{time}</small></div>)}</div>
      </section>
      <section className="progress-card upcoming-card">
        <CardTitle Icon={Flag} title="Upcoming Goals" helper="See the next goals you need to complete." action={<button type="button" onClick={() => notify("Upcoming Goals")}>View All <ChevronRight /></button>} />
        <div className="upcoming-list">{goals.map(([label, count, tone, Icon], i) => <div key={label}><Icon /><article><strong>{label}</strong><span><i className={tone} style={{width:`${[66,70,33][i]}%`}} /></span></article><b>{count}</b></div>)}</div>
      </section>
      <section className="progress-card achievements-card">
        <CardTitle Icon={Trophy} title="Achievements" helper="Unlock badges as you keep learning." action={<button type="button" onClick={() => notify("Achievements")}>View All <ChevronRight /></button>} />
        <div className="badges">{[[BookOpen,"First Lesson","Completed","green"],[Sparkles,"Words","Learned","blue"],[Mic,"First","Speaking","purple"],[Award,"7-Day","Streak","gold"]].map(([Icon,top,bottom,tone]) => <div key={`${top}-${bottom}`} className={tone}><span><Icon /></span><strong>{top}<small>{bottom}</small></strong></div>)}</div>
        <footer><p>“Small progress every day<br />leads to big results!”</p><img src="/assets/bd10-tab-logo.png" alt="BD10 mascot" /></footer>
      </section>
    </div>
  </div>;
}
