import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import AdminDashboard from "./AdminDashboard";
import { isAdminUser, isSupabaseConfigured, sendAdminLoginLink, signInAdmin, signInLearner, signOutAdmin, supabase } from "./utils/supabaseClient";
import { flushLessonProgress, loadCloudLessonProgress, setLessonProgressAccount } from "./utils/lessonProgress";
import { flushLearningTime, loadCloudLearningTime, setLearningTimeAccount } from "./utils/learningTime";
import { navigateTo, pageFromPath, subscribeToRouteChanges } from "./utils/appRouting";
import "./index.css";

const copy = {
  en: {
    switchLabel: "Interface language",
    eyebrow: "MANDARIN LEARNING HUB",
    tagline: "Speak Mandarin. Connect the World.",
    heroTitle: "Small steps. Big conversations.",
    bubbleOne: "Let’s learn Mandarin together!",
    bubbleTwo: "Speak more. Be more confident!",
    welcome: "Welcome Back!",
    intro: "Log in to continue your Mandarin learning journey.",
    employee: "Employee ID or email",
    employeeHint: "Use your Employee ID, or the exact email added in Supabase.",
    demoUser: "Use a demo ID and password supplied by your administrator.",
    password: "Password",
    remember: "Remember me",
    forgot: "Forgot password?",
    login: "Log In",
    adminLink: "Email me a secure admin sign-in link",
    adminLinkHint: "Enter ADMIN above, then check the site owner email inbox.",
    adminLinkSending: "Sending secure link…",
    or: "or",
    company: "Login with Company Account",
    quote: "“A new language is a new opportunity.”",
    quoteZh: "Learn one language · Gain one more opportunity",
    practical: "Practical Conversation",
    practicalSub: "Speak from day one",
    real: "Real-life Topics",
    realSub: "Useful every day",
    confidence: "Build Confidence",
    confidenceSub: "Practice without pressure",
    future: "A Brighter Future",
    futureSub: "Grow together",
    required: "Please enter your Employee ID and password.",
    success: "Login successful. Welcome to BD10!",
    reset: "Please contact your training administrator to reset your password.",
    sso: "Company Account login is ready for SSO integration.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    copyright: "© 2026 BD10 Mandarin Learning Hub. All rights reserved.",
    designed: "Designed for ASE People. Built for a Brighter Tomorrow.",
  },
  zh: {
    switchLabel: "介面語言",
    eyebrow: "華語學習平台",
    tagline: "開口說中文，連接更大的世界。",
    heroTitle: "小小進步，開啟更多對話。",
    bubbleOne: "一起學中文！",
    bubbleTwo: "開口說，更有自信！",
    welcome: "歡迎回來！",
    intro: "登入並繼續您的華語學習旅程。",
    employee: "員工工號或電子郵件",
    employeeHint: "輸入工號，或輸入在 Supabase 建立帳號時使用的完整電子郵件。",
    demoUser: "請使用管理員提供的示範工號和密碼。",
    password: "密碼",
    remember: "記住我",
    forgot: "忘記密碼？",
    login: "登入",
    adminLink: "寄送管理員安全登入連結",
    adminLinkHint: "請先輸入 ADMIN，再查看網站管理員的電子郵件。",
    adminLinkSending: "正在寄送安全連結…",
    or: "或",
    company: "使用公司帳號登入",
    quote: "「多學一種語言，多一個機會。」",
    quoteZh: "勇敢開口 · 自信溝通",
    practical: "實用會話",
    practicalSub: "從第一天開始說",
    real: "生活主題",
    realSub: "每天都能使用",
    confidence: "建立自信",
    confidenceSub: "輕鬆自在地練習",
    future: "創造更大的可能",
    futureSub: "一起學習成長",
    required: "請輸入員工工號和密碼。",
    success: "登入成功。歡迎來到 BD10！",
    reset: "請聯絡訓練管理員重設密碼。",
    sso: "公司帳號登入功能已準備好串接 SSO。",
    showPassword: "顯示密碼",
    hidePassword: "隱藏密碼",
    copyright: "© 2026 BD10 華語學習平台。版權所有。",
    designed: "為 ASE 夥伴而設計，共創更美好的明天。",
  },
};

function Icon({ name, className = "h-6 w-6" }) {
  const paths = {
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 4.5 6.2 4.5 9S15 17.8 12 21c-3-3.2-4.5-6.2-4.5-9S9 6.2 12 3Z"/></>,
    user: <><circle cx="12" cy="7.5" r="3.5"/><path d="M5 21v-2.2A6.8 6.8 0 0 1 11.8 12h.4a6.8 6.8 0 0 1 6.8 6.8V21"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    eye: <><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a16 16 0 0 1-2.2 2.9M6.3 6.3C3.9 8 2.5 12 2.5 12s3.4 6 9.5 6c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
    building: <><path d="M4 21V7l8-4v18M12 9h8v12M2 21h20M7 10h2M7 14h2M7 18h2M15 13h2M15 17h2"/></>,
    chat: <><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></>,
    people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M14 14.5a5 5 0 0 1 7 4.5v1"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

function AseLogo() {
  return (
    <div className="ase-lockup">
      <img src="/assets/ase-group-logo.png" alt="ASE GROUP · 日月光集團" />
    </div>
  );
}

function Brand() {
  return (
    <div className="brand-lockup">
      <img src="/assets/bd10-project-logo.png" alt="BD10 Mandarin Learning Hub" />
    </div>
  );
}

function LanguageSwitch({ lang, onChange, text }) {
  return (
    <div className="language-switch" role="group" aria-label={text.switchLabel}>
      <Icon name="globe" className="h-5 w-5" />
      <button type="button" className={lang === "en" ? "active" : ""} onClick={() => onChange("en")}>English</button>
      <span aria-hidden="true">|</span>
      <button type="button" className={lang === "zh" ? "active" : ""} onClick={() => onChange("zh")}>繁體中文</button>
    </div>
  );
}

function Benefit({ icon, title, subtitle }) {
  return (
    <div className="benefit">
      <span className="benefit-icon"><Icon name={icon} /></span>
      <span><strong>{title}</strong><small>{subtitle}</small></span>
    </div>
  );
}

function LoginCard({ text, onNotify, onLogin, onAdminLink }) {
  const [showPassword, setShowPassword] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingAdminLink, setSendingAdminLink] = useState(false);

  const requestAdminLink = async () => {
    if (employeeId.trim().toUpperCase() !== "ADMIN") return onNotify("Enter ADMIN in the Employee ID field first.", "error");
    setSendingAdminLink(true);
    try {
      await onAdminLink();
    } catch {
      onNotify("Could not request the admin sign-in link. Please try again.", "error");
    } finally {
      setSendingAdminLink(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!employeeId.trim() || !password) return onNotify(text.required, "error");
    setSubmitting(true);
    try {
      await onLogin({ employeeId: employeeId.trim(), password });
    } catch {
      onNotify("Unable to connect to Supabase. Check your connection and try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="login-card" aria-labelledby="login-heading">
      <header className="card-header">
        <img className="mobile-project-logo" src="/assets/bd10-project-logo.png" alt="BD10 Mandarin Learning Hub" />
        <p className="mobile-eyebrow">BD10 · {text.eyebrow}</p>
        <h1 id="login-heading">{text.welcome}</h1>
        <p>{text.intro}</p>
      </header>
      <form onSubmit={submit} className="login-form">
        <label className="field-wrap">
          <span className="sr-only">{text.employee}</span>
          <span className="field-icon"><Icon name="user" /></span>
          <input autoComplete="username" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder={text.employee} />
        </label>
        <p className="field-hint">{text.employeeHint}</p>

        <label className="field-wrap">
          <span className="sr-only">{text.password}</span>
          <span className="field-icon"><Icon name="lock" /></span>
          <input autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={text.password} />
          <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? text.hidePassword : text.showPassword}>
            <Icon name={showPassword ? "eyeOff" : "eye"} />
          </button>
        </label>

        <p className="demo-account-hint">{text.demoUser}</p>

        <div className="form-options">
          <label className="remember-option">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span className="check-ui"><Icon name="check" className="h-4 w-4" /></span>
            <span>{text.remember}</span>
          </label>
          <button type="button" className="text-link" onClick={() => onNotify(text.reset)}>{text.forgot}</button>
        </div>

        <button className="primary-button" type="submit" disabled={submitting}><span>{submitting ? "Signing in…" : text.login}</span><Icon name="arrow" /></button>

        {isSupabaseConfigured && employeeId.trim().toUpperCase() === "ADMIN" && <div className="admin-link-box">
          <button className="text-link" type="button" onClick={requestAdminLink} disabled={sendingAdminLink}>
            {sendingAdminLink ? text.adminLinkSending : text.adminLink}
          </button>
          <small>{text.adminLinkHint}</small>
        </div>}

        <div className="divider"><span>{text.or}</span></div>

        <button className="company-button" type="button" onClick={() => onNotify(text.sso)}>
          <Icon name="building" /><span>{text.company}</span>
        </button>
      </form>
      <div className="quote-block">
        <blockquote>{text.quote}</blockquote>
        <p>{text.quoteZh}</p>
      </div>
    </section>
  );
}

function App() {
  const [lang, setLang] = useState(() => localStorage.getItem("bd10-language") || "en");
  const [toast, setToast] = useState(null);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [sessionRole, setSessionRole] = useState(() => sessionStorage.getItem("bd10-session-role") || "");
  const [userName, setUserName] = useState(() => sessionStorage.getItem("bd10-user-name") || "Alex");
  const [restoringLearner, setRestoringLearner] = useState(() => isSupabaseConfigured && sessionStorage.getItem("bd10-session-role") === "user");
  const [restoringAdmin, setRestoringAdmin] = useState(() => isSupabaseConfigured && sessionStorage.getItem("bd10-session-role") === "admin");
  const lastCloudRefreshRef = useRef(0);
  const text = useMemo(() => copy[lang], [lang]);
  const dashboardPage = pageFromPath(pathname);
  const screen = pathname === "/admin" && sessionRole === "admin" ? restoringAdmin ? "restoring" : "admin" : dashboardPage && sessionRole === "user" ? restoringLearner ? "restoring" : "dashboard" : "login";

  useEffect(() => subscribeToRouteChanges(setPathname), []);

  useEffect(() => {
    if (!supabase) return undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event !== "SIGNED_IN" && event !== "INITIAL_SESSION") || !isAdminUser(session?.user)) return;
      sessionStorage.setItem("bd10-session-role", "admin");
      sessionStorage.removeItem("bd10-learner-user-id");
      setLessonProgressAccount(null);
      setLearningTimeAccount(null);
      setSessionRole("admin");
      setRestoringAdmin(true);
      navigateTo("/admin", { replace: true });
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionRole !== "admin") return;
    let active = true;
    const restoreAdmin = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !isAdminUser(data?.user)) {
          await supabase.auth.signOut();
          sessionStorage.removeItem("bd10-session-role");
          setSessionRole("");
          navigateTo("/login", { replace: true });
        }
      } catch {
        if (active) {
          sessionStorage.removeItem("bd10-session-role");
          setSessionRole("");
          navigateTo("/login", { replace: true });
        }
      } finally {
        if (active) setRestoringAdmin(false);
      }
    };
    if (isSupabaseConfigured) restoreAdmin();
    else setRestoringAdmin(false);
    return () => { active = false; };
  }, [sessionRole]);

  useEffect(() => {
    if (sessionRole !== "user") return;
    if (!isSupabaseConfigured) {
      setLessonProgressAccount(null);
      setLearningTimeAccount(null);
      setRestoringLearner(false);
      return;
    }
    let active = true;
    const restore = async () => {
      let data;
      let error;
      try {
        ({ data, error } = await supabase.auth.getUser());
      } catch {
        if (active) {
          setLessonProgressAccount(null);
          setLearningTimeAccount(null);
          sessionStorage.removeItem("bd10-session-role");
          sessionStorage.removeItem("bd10-learner-user-id");
          setSessionRole("");
          setRestoringLearner(false);
          notify("Unable to verify your session. Please sign in again.", "error");
          navigateTo("/login", { replace: true });
        }
        return;
      }
      const expectedId = sessionStorage.getItem("bd10-learner-user-id");
      if (!active) return;
      if (error || !data?.user || (expectedId && expectedId !== data.user.id)) {
        setLessonProgressAccount(null);
        setLearningTimeAccount(null);
        sessionStorage.removeItem("bd10-session-role");
        sessionStorage.removeItem("bd10-learner-user-id");
        setSessionRole("");
        setRestoringLearner(false);
        navigateTo("/login", { replace: true });
        return;
      }
      sessionStorage.setItem("bd10-learner-user-id", data.user.id);
      setLessonProgressAccount(data.user.id);
      setLearningTimeAccount(data.user.id);
      const results = await Promise.allSettled([
        loadCloudLessonProgress(data.user.id),
        loadCloudLearningTime(data.user.id),
      ]);
      if (active && results.some((result) => result.status === "rejected")) {
        notify("Learning progress or time could not sync. This session is saved on this device until syncing is available.", "error");
      }
      if (active) setRestoringLearner(false);
    };
    restore();
    return () => { active = false; };
  }, [sessionRole]);

  useEffect(() => {
    if (sessionRole !== "user" || !isSupabaseConfigured) return;
    const refreshFromOtherDevices = () => {
      if (document.hidden) return;
      const userId = sessionStorage.getItem("bd10-learner-user-id");
      if (!userId || Date.now() - lastCloudRefreshRef.current < 10_000) return;
      lastCloudRefreshRef.current = Date.now();
      Promise.allSettled([loadCloudLessonProgress(userId), loadCloudLearningTime(userId)]);
    };
    window.addEventListener("focus", refreshFromOtherDevices);
    return () => window.removeEventListener("focus", refreshFromOtherDevices);
  }, [sessionRole]);

  useEffect(() => {
    const pageTitle = pathname === "/admin" ? "Admin · BD10 Mandarin Learning Hub" : dashboardPage ? `${dashboardPage} · BD10 Mandarin Learning Hub` : "BD10 Mandarin Learning Hub";
    document.title = pageTitle;
  }, [dashboardPage, pathname]);

  const openRoute = (path, options) => navigateTo(path, options);

  const logoutUser = async () => {
    if (sessionRole === "user") {
      await Promise.allSettled([flushLessonProgress(), flushLearningTime()]);
      await signOutAdmin();
    }
    setLessonProgressAccount(null);
    setLearningTimeAccount(null);
    sessionStorage.removeItem("bd10-session-role");
    sessionStorage.removeItem("bd10-user-name");
    sessionStorage.removeItem("bd10-learner-user-id");
    setUserName("Alex");
    setSessionRole("");
    setRestoringLearner(false);
    openRoute("/login");
  };

  const changeLanguage = (next) => {
    setLang(next);
    localStorage.setItem("bd10-language", next);
    document.documentElement.lang = next === "zh" ? "zh-Hant" : "en";
  };

  const notify = (message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.bd10ToastTimer);
    window.bd10ToastTimer = window.setTimeout(() => setToast(null), 3200);
  };

  const benefits = [
    ["chat", text.practical, text.practicalSub],
    ["people", text.real, text.realSub],
    ["chart", text.confidence, text.confidenceSub],
    ["globe", text.future, text.futureSub],
  ];

  if (screen === "restoring") {
    return <main className="page-shell" style={{ display: "grid", gridTemplateColumns: "1fr", gridTemplateRows: "1fr", placeItems: "center" }} role="status"><p>Restoring your lesson progress…</p></main>;
  }

  if (screen === "dashboard") {
    return (
      <>
        <Dashboard lang={lang} onLanguageChange={setLang} onLogout={logoutUser} notify={notify} pathname={pathname} onNavigate={openRoute} userName={userName} />
        {toast && <div role="status" className={`toast ${toast.type}`}><span>{toast.message}</span></div>}
      </>
    );
  }

  if (screen === "admin") {
    return <AdminDashboard notify={notify} onLogout={async () => { await signOutAdmin(); await logoutUser(); }} />;
  }

  return (
    <main className="page-shell">
      <img className="campus-background" src="/assets/campus-cleanroom-hero.png" alt="" />
      <div className="sky-wash" aria-hidden="true" />
      <div className="top-row">
        <AseLogo />
        <LanguageSwitch lang={lang} onChange={changeLanguage} text={text} />
      </div>

      <section className="hero-column" aria-label="BD10 Mandarin Learning Hub">
        <Brand />
        <div className="tagline">
          <strong>{lang === "en" ? "Open your voice in Mandarin" : "開口說中文"}</strong>
          <span>{text.tagline}</span>
        </div>
        <div className="speech speech-one"><strong>一起學中文！</strong><span>{text.bubbleOne}</span></div>
        <div className="speech speech-two"><strong>開口說，更有自信！</strong><span>{text.bubbleTwo}</span></div>
        <div className="benefit-bar">
          {benefits.map(([icon, title, subtitle]) => <Benefit key={title} icon={icon} title={title} subtitle={subtitle} />)}
        </div>
        <p className="handwritten">{text.heroTitle}</p>
      </section>

      <section className="form-column">
        <LoginCard text={text} onNotify={notify} onAdminLink={async () => {
          const { error } = await sendAdminLoginLink();
          if (error) {
            const message = String(error.message || "").toLowerCase();
            notify(message.includes("redirect")
              ? "Supabase must allow this website URL under Authentication → URL Configuration → Redirect URLs."
              : "Could not send the admin sign-in link. Check Supabase email delivery settings and try again.", "error");
            return;
          }
          notify("Admin sign-in link sent. Check the site owner's email inbox and open the link on this device.", "success");
        }} onLogin={async ({ employeeId, password }) => {
          if (employeeId.toUpperCase() === "ADMIN") {
            setLessonProgressAccount(null);
            setLearningTimeAccount(null);
            if (!isSupabaseConfigured) {
              notify("Admin access requires the connected Supabase account.", "error");
              return;
            }
            const { data, error } = await signInAdmin(password);
            if (error || !isAdminUser(data?.user)) {
              notify("Admin sign-in failed. Use the secure email link below or check the admin account in Supabase.", "error");
              return;
            }
            notify("Admin login successful. Welcome to the content console!", "success");
            sessionStorage.setItem("bd10-session-role", "admin");
            setSessionRole("admin");
            setRestoringAdmin(true);
            openRoute("/admin", { replace: true });
          } else {
            if (!isSupabaseConfigured) {
              notify("Demo sign-in requires the connected Supabase service.", "error");
              return;
            }
            const { data, error } = await signInLearner(employeeId, password);
            if (error || !data?.user) {
              const code = error?.code;
              const message = String(error?.message || "").toLowerCase();
              const reason = code === "invalid_learner_identifier"
                ? "Enter a valid Employee ID or the full email used in Supabase."
                : code === "email_not_confirmed" || message.includes("email not confirmed")
                  ? "This email is not confirmed yet. Ask an administrator to verify it."
                  : code === "invalid_credentials" || message.includes("invalid login credentials")
                    ? "ID or password is incorrect. Use the details issued by your administrator."
                    : "Sign-in failed. Check the account in Supabase Authentication → Users and try again.";
              notify(reason, "error");
              return;
            }
            const displayName = data.user.user_metadata?.display_name || data.user.user_metadata?.full_name || (employeeId.includes("@") ? employeeId.split("@")[0] : employeeId);
            sessionStorage.setItem("bd10-user-name", displayName);
            setUserName(displayName);
            if (isAdminUser(data.user)) {
              setLessonProgressAccount(null);
              setLearningTimeAccount(null);
              sessionStorage.removeItem("bd10-learner-user-id");
            sessionStorage.setItem("bd10-session-role", "admin");
              setSessionRole("admin");
              setRestoringAdmin(true);
              notify("Admin login successful. Welcome to the content console!", "success");
              openRoute("/admin", { replace: true });
              return;
            }
            sessionStorage.setItem("bd10-learner-user-id", data.user.id);
            setLessonProgressAccount(data.user.id);
            setLearningTimeAccount(data.user.id);
            setRestoringLearner(true);
            notify(text.success, "success");
            sessionStorage.setItem("bd10-session-role", "user");
            setSessionRole("user");
            if (!pageFromPath(pathname)) openRoute("/home", { replace: true });
          }
        }} />
        <footer><p>{text.copyright}</p><p>{text.designed}</p></footer>
      </section>

      {toast && <div role="status" className={`toast ${toast.type}`}><span>{toast.message}</span></div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
