import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleUserRound,
  Flame,
  Gauge,
  Headphones,
  Home,
  House,
  Languages,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  NotebookTabs,
  Layers3,
  Play,
  Search,
  ShoppingBasket,
  Sparkles,
  Store,
  Target,
  Utensils,
  Volume2,
  X,
} from "lucide-react";
import "./dashboard.css";
import LessonsPage from "./LessonsPage";
import VocabularyPage from "./VocabularyPage";
import FlashcardsPage from "./FlashcardsPage";
import PronunciationPage from "./PronunciationPage";
import SpeakingChallengePage from "./SpeakingChallengePage";
import HomePage from "./HomePage";
import ProgressPage from "./ProgressPage";
import { lessonIdFromPath, lessonPath, pageFromPath, pathForPage } from "./utils/appRouting";

const ui = {
  en: {
    search: "Search lessons, words, or topics...",
    hello: "Hello, Alex!",
    lead: "Let’s speak Mandarin today.",
    heroZh: "今天也一起開口說中文吧！",
    startSpeaking: "Start Speaking Challenge",
    mission: "Today’s Speaking Mission",
    beginner: "Beginner",
    change: "Change",
    orderFood: "Order Food at a Night Market",
    orderDesc: "Learn useful sentences to order your favorite food and drinks.",
    startMission: "Start Mission",
    progress: "Your Speaking Progress",
    completed: "Conversations Completed",
    sentences: "Sentences Spoken",
    streak: "Speaking Streak",
    practiceTime: "Practice Time",
    practical: "Practical Mandarin Today",
    seeAll: "See all",
    goal: "Today’s Goal",
    goalCount: "completed",
    coach: "AI Conversation Coach",
    coachDesc: "Talk with AI in real situations.",
    startTalking: "Start Talking",
    pronunciation: "Pronunciation Practice",
    pronunciationDesc: "Listen, repeat, and speak.",
    startPractice: "Start Practice",
    topics: "Explore by Topic",
    topicsDesc: "Choose a useful speaking topic.",
    quote: "Language is the bridge to a brighter tomorrow.",
    quoteZh: "語言是通往更好的未來的橋樑。",
    speakingNow: "Speaking-first learning",
    menu: "Open navigation",
    close: "Close navigation",
    logout: "Back to login",
  },
  zh: {
    search: "搜尋課程、單字或主題……",
    hello: "Alex，你好！",
    lead: "今天一起練習說中文。",
    heroZh: "今天也一起開口說中文吧！",
    startSpeaking: "開始口說挑戰",
    mission: "今天的口說任務",
    beginner: "初級",
    change: "更換",
    orderFood: "在夜市點餐",
    orderDesc: "學習實用句子，點您喜歡的食物和飲料。",
    startMission: "開始任務",
    progress: "您的口說進度",
    completed: "完成對話",
    sentences: "已說句子",
    streak: "連續練習",
    practiceTime: "練習時間",
    practical: "今日實用中文",
    seeAll: "查看全部",
    goal: "今日目標",
    goalCount: "已完成",
    coach: "AI 對話教練",
    coachDesc: "與 AI 練習真實情境對話。",
    startTalking: "開始對話",
    pronunciation: "發音練習",
    pronunciationDesc: "聆聽、跟讀、開口說。",
    startPractice: "開始練習",
    topics: "依主題探索",
    topicsDesc: "選擇實用的口說主題。",
    quote: "語言是通往更好未來的橋樑。",
    quoteZh: "勇敢開口，自信溝通。",
    speakingNow: "以口說為核心",
    menu: "開啟導覽",
    close: "關閉導覽",
    logout: "返回登入",
  },
};

const navItems = [
  ["Home", Home],
  ["Speaking Challenge", Mic],
  ["Lessons", BookOpen],
  ["Vocabulary", NotebookTabs],
  ["Flashcards", Layers3],
  ["Pronunciation", Headphones],
  ["Practice", Target],
  ["Progress", BarChart3],
];

const phrases = [
  { icon: "👋", hanzi: "你好", pinyin: "nǐ hǎo", english: "hello" },
  { icon: "🥤", hanzi: "我要", pinyin: "wǒ yào", english: "I want" },
  { icon: "🚻", hanzi: "廁所在哪裡？", pinyin: "cèsuǒ zài nǎlǐ?", english: "Where is the restroom?" },
  { icon: "💼", hanzi: "上班", pinyin: "shàngbān", english: "go to work" },
  { icon: "🏠", hanzi: "下班", pinyin: "xiàbān", english: "finish work" },
];

const topics = [
  { Icon: MessageCircle, label: "Greetings", hanzi: "問候", pinyin: "wènhòu" },
  { Icon: CircleUserRound, label: "Self-Introduction", hanzi: "自我介紹", pinyin: "zìwǒ jièshào" },
  { Icon: House, label: "Daily Life", hanzi: "日常生活", pinyin: "rìcháng shēnghuó" },
  { Icon: Utensils, label: "Food & Drinks", hanzi: "飲食", pinyin: "yǐnshí" },
  { Icon: BriefcaseBusiness, label: "Work at ASE", hanzi: "日月光工作", pinyin: "rìyuèguāng gōngzuò" },
  { Icon: Store, label: "Night Market", hanzi: "夜市", pinyin: "yèshì" },
];

const goalLabels = {
  en: ["Speak for 5 minutes", "Complete 1 speaking mission", "Learn 10 new words", "Practice pronunciation", "Have a conversation with AI"],
  zh: ["開口說 5 分鐘", "完成 1 個口說任務", "學習 10 個新詞", "練習發音", "與 AI 完成一段對話"],
};

function BrandLogo({ compact = false }) {
  return <img className={compact ? "dash-brand compact" : "dash-brand"} src="/assets/bd10-project-logo.png" alt="BD10 Mandarin Learning Hub" />;
}

function Sidebar({ active, setActive, open, setOpen, onLogout, text, notify }) {
  const choose = (name) => {
    setActive(name);
    setOpen(false);
    if (!["Home", "Speaking Challenge", "Lessons", "Vocabulary", "Flashcards", "Pronunciation"].includes(name)) notify(`${name} is ready for the next demo phase.`);
  };

  return (
    <aside className={`dash-sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-brand-row">
        <BrandLogo />
        <button className="sidebar-close" type="button" onClick={() => setOpen(false)} aria-label={text.close}><X /></button>
      </div>
      <nav className="dash-nav" aria-label="Main navigation">
        {navItems.map(([name, NavIcon]) => (
          <button type="button" key={name} className={active === name ? "active" : ""} onClick={() => choose(name)}>
            <NavIcon /><span>{name}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-support">
        <div className="support-bubble"><strong>說吧！</strong><span>You can do it!</span></div>
        <div className="support-robot"><Bot /></div>
        <img src="/assets/ase-group-logo.png" alt="ASE GROUP" />
        <strong>Small Steps<br />Big Conversations</strong>
        <div className="support-line"><span /></div>
      </div>
      <button className="sidebar-logout" type="button" onClick={onLogout}><LogOut />{text.logout}</button>
    </aside>
  );
}

function Topbar({ active, lang, setLang, openMenu, text, query, setQuery, userName }) {
  return (
    <header className="dash-topbar">
      <button className="mobile-menu" type="button" onClick={openMenu} aria-label={text.menu}><Menu /></button>
      <BrandLogo compact />
      <label className="dash-search">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={active === "Vocabulary" ? "Search words, pinyin, or English..." : text.search} />
      </label>
      <div className="topbar-streak"><Flame /><span><strong>12</strong><small>Day Streak</small></span></div>
      <div className="dashboard-language" role="group" aria-label="Interface language">
        <Languages />
        <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
        <span>/</span>
        <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")}>繁體中文</button>
      </div>
      <button className="top-icon" type="button" aria-label="Notifications"><Bell /></button>
      <button className="profile-button" type="button"><span className="profile-avatar"><img src="/assets/bd10-tab-logo.png" alt="" /></span><strong>{userName}</strong><ChevronDown /></button>
    </header>
  );
}

function PrimaryButton({ children, onClick, small = false }) {
  return <button className={`dash-primary ${small ? "small" : ""}`} type="button" onClick={onClick}>{children}<span>→</span></button>;
}

function Hero({ text, notify }) {
  return (
    <section className="dash-hero">
      <img src="/assets/campus-cleanroom-hero.png" alt="Cleanroom team at a semiconductor campus" />
      <div className="hero-overlay" />
      <div className="hero-copy">
        <span className="speaking-pill"><Sparkles />{text.speakingNow}</span>
        <h1>{text.hello} <span>👋</span></h1>
        <p>{text.lead}</p>
        <strong className="hero-chinese">{text.heroZh}</strong>
        <PrimaryButton onClick={() => notify("Speaking Challenge demo opened.")}><Mic />{text.startSpeaking}</PrimaryButton>
      </div>
      <div className="hero-bubble"><strong>說中文</strong><span>更有自信！</span></div>
    </section>
  );
}

function MissionCard({ text, notify }) {
  return (
    <section className="dash-card mission-card">
      <div className="card-title-row">
        <h2><Target />{text.mission}</h2>
        <div><span className="level-pill">🌐 {text.beginner}</span><button className="change-button" type="button">{text.change}</button></div>
      </div>
      <div className="mission-content">
        <div className="mission-visual"><ShoppingBasket /><span>夜市</span></div>
        <div className="mission-copy">
          <h3>{text.orderFood}</h3>
          <strong>在夜市點餐</strong>
          <em>zài yèshì diǎncān</em>
          <p>{text.orderDesc}</p>
          <PrimaryButton small onClick={() => notify("Night Market mission started.")}>{text.startMission}</PrimaryButton>
        </div>
      </div>
    </section>
  );
}

function ProgressCard({ text }) {
  const metrics = [
    [MessageCircle, text.completed, "48"],
    [Mic, text.sentences, "327"],
    [Flame, text.streak, "12 days"],
    [Gauge, text.practiceTime, "184 min"],
  ];
  return (
    <section className="dash-card progress-card">
      <h2>{text.progress}</h2>
      <div className="progress-main">
        <div className="progress-ring" style={{ "--progress": "68%" }}><strong>68%</strong><span>Confidence</span></div>
        <BarChart3 className="confidence-icon" />
      </div>
      <div className="metric-list">
        {metrics.map(([MetricIcon, label, value]) => <div key={label}><MetricIcon /><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>
  );
}

function PhraseCard({ phrase, notify }) {
  return (
    <article className="phrase-card">
      <button className="favorite" type="button" aria-label={`Save ${phrase.hanzi}`}>☆</button>
      <span className="phrase-emoji" aria-hidden="true">{phrase.icon}</span>
      <strong>{phrase.hanzi}</strong>
      <em>{phrase.pinyin}</em>
      <span>{phrase.english}</span>
      <button className="sound-button" type="button" onClick={() => notify(`${phrase.hanzi} · ${phrase.pinyin}`)} aria-label={`Play ${phrase.hanzi}`}><Volume2 /></button>
    </article>
  );
}

function PracticalSection({ text, query, notify }) {
  const filtered = phrases.filter((phrase) => `${phrase.hanzi} ${phrase.pinyin} ${phrase.english}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="practical-section">
      <div className="section-heading"><h2>{text.practical}</h2><button type="button">{text.seeAll} →</button></div>
      <div className="phrase-grid">
        {(filtered.length ? filtered : phrases).map((phrase) => <PhraseCard key={phrase.hanzi} phrase={phrase} notify={notify} />)}
      </div>
    </section>
  );
}

function GoalsCard({ text, lang }) {
  const [done, setDone] = useState([true, true, true, false, false]);
  const completed = done.filter(Boolean).length;
  return (
    <section className="dash-card goals-card">
      <h2>{text.goal}</h2>
      <p><strong>{completed} / {done.length}</strong> {text.goalCount}</p>
      <div className="goal-progress"><span style={{ width: `${completed / done.length * 100}%` }} /></div>
      <div className="goal-list">
        {goalLabels[lang].map((label, index) => (
          <label key={label}><input type="checkbox" checked={done[index]} onChange={() => setDone((items) => items.map((item, itemIndex) => itemIndex === index ? !item : item))} /><span className="goal-check">{done[index] && <Check />}</span>{label}</label>
        ))}
      </div>
    </section>
  );
}

function ToolCard({ Icon, title, description, button, accent, notify }) {
  return (
    <section className={`tool-card ${accent}`}>
      <div><h3><Icon />{title}</h3><p>{description}</p><PrimaryButton small onClick={() => notify(`${title} demo opened.`)}>{button}</PrimaryButton></div>
      <span className="tool-visual"><Icon /></span>
    </section>
  );
}

function TopicsCard({ text, query, notify }) {
  const filtered = topics.filter((topic) => `${topic.label} ${topic.hanzi} ${topic.pinyin}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="dash-card topics-card">
      <h2><Languages />{text.topics}</h2>
      <p>{text.topicsDesc}</p>
      <div className="topic-grid">
        {(filtered.length ? filtered : topics).map(({ Icon: TopicIcon, label, hanzi, pinyin }) => (
          <button type="button" key={label} onClick={() => notify(`${label} · ${hanzi} · ${pinyin}`)}><span><TopicIcon /></span><strong>{label}</strong><em>{hanzi}</em></button>
        ))}
      </div>
    </section>
  );
}

export default function Dashboard({ lang, onLanguageChange, onLogout, notify, pathname, onNavigate, userName = "Alex" }) {
  const active = pageFromPath(pathname) || "Home";
  const selectedLessonId = lessonIdFromPath(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const text = useMemo(() => ui[lang], [lang]);

  const changeLanguage = (next) => {
    onLanguageChange(next);
    localStorage.setItem("bd10-language", next);
    document.documentElement.lang = next === "zh" ? "zh-Hant" : "en";
  };

  return (
    <div className={`dashboard-shell ${active === "Vocabulary" ? "vocabulary-mode" : ""}`}>
      {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label={text.close} onClick={() => setSidebarOpen(false)} />}
      <Sidebar active={active} setActive={(page) => onNavigate(pathForPage(page))} open={sidebarOpen} setOpen={setSidebarOpen} onLogout={onLogout} text={text} notify={notify} />
      <div className="dashboard-main">
        <Topbar active={active} lang={lang} setLang={changeLanguage} openMenu={() => setSidebarOpen(true)} text={text} query={query} setQuery={setQuery} userName={userName} />
        {active === "Home" ? <HomePage notify={notify} onNavigate={onNavigate} userName={userName} /> : active === "Lessons" ? <LessonsPage query={query} notify={notify} selectedLessonId={selectedLessonId} onLessonRoute={(lessonId) => onNavigate(lessonId ? lessonPath(lessonId) : pathForPage("Lessons"))} /> : active === "Vocabulary" ? <VocabularyPage query={query} notify={notify} /> : active === "Flashcards" ? <FlashcardsPage notify={notify} /> : active === "Pronunciation" ? <PronunciationPage notify={notify} /> : active === "Speaking Challenge" ? <SpeakingChallengePage notify={notify} /> : active === "Progress" ? <ProgressPage notify={notify} /> : <div className="dashboard-content">
          <Hero text={text} notify={notify} />
          <div className="dashboard-grid mission-row"><MissionCard text={text} notify={notify} /><ProgressCard text={text} /></div>
          <div className="dashboard-grid learning-row"><PracticalSection text={text} query={query} notify={notify} /><GoalsCard text={text} lang={lang} /></div>
          <div className="tools-grid">
            <ToolCard Icon={Bot} title={text.coach} description={text.coachDesc} button={text.startTalking} accent="coach" notify={notify} />
            <ToolCard Icon={Headphones} title={text.pronunciation} description={text.pronunciationDesc} button={text.startPractice} accent="pronounce" notify={notify} />
            <TopicsCard text={text} query={query} notify={notify} />
          </div>
          <footer className="dashboard-quote"><p>“{text.quote}”</p><span>{text.quoteZh}</span></footer>
        </div>}
      </div>
    </div>
  );
}
