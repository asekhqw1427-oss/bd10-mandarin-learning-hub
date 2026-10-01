import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Expand,
  Minus,
  Plus,
  Target,
} from "lucide-react";
import { addActiveLearningSecond, flushLearningTime, readLearningTime } from "./utils/learningTime";
import { completeLesson, flushLessonProgress, hasLessonStudySession, readLessonProgress, readLessonStudySeconds, recordLessonSlide, reopenLessonIfUnderMinimum, requiredStudySeconds, saveLessonStudySeconds, subscribeToLessonProgress } from "./utils/lessonProgress";
import "./lesson-viewer.css";

const INACTIVITY_LIMIT_MS = 60_000;
const ZOOM_MIN = 70;
const ZOOM_MAX = 140;

function formatElapsed(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const secs = String(safeSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

function formatStudyDuration(value) {
  const minutes = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} min` : "15 min";
}

export default function LessonViewer({ lesson, onBack, onTimeUpdate = () => {}, notify = () => {} }) {
  const slides = lesson.slides || [];
  const pptxUrl = !slides.length && lesson.sourceFileUrl && /(?:powerpoint|presentation|\.pptx?(?:$|\?))/i.test(`${lesson.sourceFileType || ""} ${lesson.sourceFileUrl}`)
    ? lesson.sourceFileUrl
    : "";
  const [activeIndex, setActiveIndex] = useState(() => readLessonProgress(lesson.id).currentSlide || 0);
  const [pptxSlideCount, setPptxSlideCount] = useState(0);
  const [pptxReady, setPptxReady] = useState(false);
  const [pptxError, setPptxError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => readLessonStudySeconds(lesson.id));
  const [running, setRunning] = useState(true);
  const [inactive, setInactive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const viewerRef = useRef(null);
  const thumbnailPanelRef = useRef(null);
  const thumbRefs = useRef([]);
  const pptxMainRef = useRef(null);
  const pptxThumbRef = useRef(null);
  const pptxMainViewerRef = useRef(null);
  const pptxThumbViewerRef = useRef(null);
  const pptxThumbClickRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const elapsedRef = useRef(elapsedSeconds);

  const slideCount = slides.length || pptxSlideCount;
  const minimumSeconds = requiredStudySeconds(lesson);
  const remainingStudySeconds = Math.max(0, minimumSeconds - elapsedSeconds);
  const activeSlide = slides[activeIndex];
  const progress = slideCount ? ((activeIndex + 1) / slideCount) * 100 : 0;
  const canPrevious = activeIndex > 0;
  const isFinalSlide = slideCount > 0 && activeIndex === slideCount - 1;

  const keepThumbnailInPanel = (node) => {
    const panel = thumbnailPanelRef.current;
    if (!panel || !node) return;
    const panelRect = panel.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const topGap = nodeRect.top - panelRect.top;
    const bottomGap = nodeRect.bottom - panelRect.bottom;
    if (topGap < 0) panel.scrollBy({ top: topGap - 8, behavior: "smooth" });
    else if (bottomGap > 0) panel.scrollBy({ top: bottomGap + 8, behavior: "smooth" });
  };

  const goPrevious = () => setActiveIndex((index) => Math.max(0, index - 1));
  const goNext = () => {
    if (isFinalSlide) {
      if (elapsedRef.current < minimumSeconds) return;
      const progress = completeLesson(lesson.id, slideCount, activeIndex, {
        elapsedSeconds: elapsedRef.current,
        minimumSeconds,
      });
      if (!progress.completed) return;
      notify(`${lesson.title} lesson completed.`);
      return;
    }
    setActiveIndex((index) => Math.min(slideCount - 1, index + 1));
  };

  useEffect(() => {
    setActiveIndex(readLessonProgress(lesson.id).currentSlide || 0);
    setElapsedSeconds(readLessonStudySeconds(lesson.id));
    setPptxSlideCount(0);
    setPptxReady(false);
    setPptxError("");
    pptxMainViewerRef.current = null;
    pptxThumbViewerRef.current = null;
  }, [lesson.id, pptxUrl]);

  useEffect(() => subscribeToLessonProgress((change) => {
    if (change?.type !== "loaded") return;
    setActiveIndex(readLessonProgress(lesson.id).currentSlide || 0);
    setElapsedSeconds((seconds) => Math.max(seconds, readLessonStudySeconds(lesson.id)));
  }), [lesson.id]);

  useEffect(() => {
    if (!slideCount) return;
    setActiveIndex((index) => Math.min(index, slideCount - 1));
  }, [slideCount]);

  useEffect(() => {
    if (!slideCount || !hasLessonStudySession(lesson.id)) return;
    const previous = readLessonProgress(lesson.id);
    if (!previous.completed || readLessonStudySeconds(lesson.id) >= minimumSeconds) return;
    // An earlier version allowed final-slide completion without enforcing
    // the administrator's configured learning-time requirement.
    reopenLessonIfUnderMinimum(lesson.id, readLessonStudySeconds(lesson.id), minimumSeconds);
    notify(`This lesson requires at least ${Math.ceil(minimumSeconds / 60)} active study minutes. Its completion status was reset.`);
  }, [lesson.id, minimumSeconds, notify, slideCount]);

  useEffect(() => {
    if (!slideCount) return;
    recordLessonSlide(lesson.id, activeIndex, slideCount);
  }, [activeIndex, lesson.id, slideCount]);

  useEffect(() => {
    if (!pptxUrl || !pptxMainRef.current || !pptxThumbRef.current) return undefined;
    let cancelled = false;
    const mainContainer = pptxMainRef.current;
    const thumbContainer = pptxThumbRef.current;

    const markThumbnailState = (selectedIndex = 0) => {
      const nodes = thumbContainer.querySelectorAll("[class*='pptx-preview-slide-wrapper-']");
      nodes.forEach((node, index) => {
        node.dataset.slideLabel = `Slide ${index + 1}`;
        node.classList.toggle("is-active", index === selectedIndex);
        node.setAttribute("role", "button");
        node.setAttribute("tabindex", "0");
        node.setAttribute("aria-label", `Open slide ${index + 1}`);
      });
      keepThumbnailInPanel(nodes[selectedIndex]);
    };

    const handleThumbnailClick = (event) => {
      const node = event.target.closest?.("[class*='pptx-preview-slide-wrapper-']");
      if (!node || !thumbContainer.contains(node)) return;
      const match = [...node.classList].find((name) => name.startsWith("pptx-preview-slide-wrapper-"));
      const index = Number(match?.replace("pptx-preview-slide-wrapper-", ""));
      if (Number.isInteger(index)) setActiveIndex(index);
    };

    const handleThumbnailKeyDown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      handleThumbnailClick(event);
      event.preventDefault();
    };

    const loadPptx = async () => {
      try {
        const [{ init }, response] = await Promise.all([
          import("pptx-preview"),
          fetch(pptxUrl),
        ]);
        if (!response.ok) throw new Error(`Unable to load PPTX (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        const width = Math.max(320, viewerRef.current?.clientWidth || 960);
        const height = Math.round(width * 9 / 16);
        const mainViewer = init(mainContainer, { width, height, mode: "slide" });
        const thumbViewer = init(thumbContainer, { width: 170, height: 96, mode: "list" });
        const [mainPptx, thumbPptx] = await Promise.all([
          mainViewer.preview(buffer),
          thumbViewer.preview(buffer),
        ]);
        if (cancelled) {
          mainViewer.destroy();
          thumbViewer.destroy();
          return;
        }
        pptxMainViewerRef.current = mainViewer;
        pptxThumbViewerRef.current = thumbViewer;
        const count = mainPptx?.slides?.length || thumbPptx?.slides?.length || mainViewer.slideCount || 0;
        setPptxSlideCount(count);
        setPptxReady(true);
        markThumbnailState(0);
        thumbContainer.addEventListener("click", handleThumbnailClick);
        thumbContainer.addEventListener("keydown", handleThumbnailKeyDown);
        pptxThumbClickRef.current = () => {
          thumbContainer.removeEventListener("click", handleThumbnailClick);
          thumbContainer.removeEventListener("keydown", handleThumbnailKeyDown);
        };
      } catch (error) {
        if (!cancelled) setPptxError(error?.message || "Unable to preview this PPTX file.");
      }
    };

    loadPptx();
    return () => {
      cancelled = true;
      pptxThumbClickRef.current?.();
      pptxThumbClickRef.current = null;
      pptxMainViewerRef.current?.destroy?.();
      pptxThumbViewerRef.current?.destroy?.();
      pptxMainViewerRef.current = null;
      pptxThumbViewerRef.current = null;
      mainContainer.innerHTML = "";
      thumbContainer.innerHTML = "";
    };
  }, [pptxUrl]);

  useEffect(() => {
    if (!pptxReady || !pptxUrl) return;
    pptxMainViewerRef.current?.renderSingleSlide?.(activeIndex);
    const nodes = pptxThumbRef.current?.querySelectorAll("[class*='pptx-preview-slide-wrapper-']") || [];
    nodes.forEach((node, index) => node.classList.toggle("is-active", index === activeIndex));
    keepThumbnailInPanel(nodes[activeIndex]);
  }, [activeIndex, pptxReady, pptxUrl]);

  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
    saveLessonStudySeconds(lesson.id, elapsedSeconds);
  }, [elapsedSeconds, lesson.id]);

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
      setInactive(false);
      setRunning(true);
    };
    const pauseForVisibility = () => {
      if (document.hidden) {
        setRunning(false);
        setInactive(true);
        flushLessonProgress().catch(() => {});
        flushLearningTime().catch(() => {});
      } else {
        markActive();
      }
    };
    const pauseForBlur = () => {
      setRunning(false);
      setInactive(true);
    };
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"];
    events.forEach((eventName) => window.addEventListener(eventName, markActive, { passive: true }));
    document.addEventListener("visibilitychange", pauseForVisibility);
    window.addEventListener("blur", pauseForBlur);
    window.addEventListener("focus", markActive);
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActive));
      document.removeEventListener("visibilitychange", pauseForVisibility);
      window.removeEventListener("blur", pauseForBlur);
      window.removeEventListener("focus", markActive);
    };
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const interval = window.setInterval(() => {
      if (document.hidden || Date.now() - lastActivityRef.current > INACTIVITY_LIMIT_MS) {
        setRunning(false);
        setInactive(true);
        return;
      }
      setElapsedSeconds((seconds) => seconds + 1);
      const learningTime = addActiveLearningSecond(lesson.id);
      onTimeUpdate(learningTime);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [running, onTimeUpdate, lesson.id]);

  useEffect(() => () => {
    saveLessonStudySeconds(lesson.id, elapsedRef.current);
    flushLessonProgress().catch(() => {});
    flushLearningTime().catch(() => {});
    onTimeUpdate(readLearningTime());
  }, [lesson.id, onTimeUpdate]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowLeft") goPrevious();
      if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    keepThumbnailInPanel(thumbRefs.current[activeIndex]);
  }, [activeIndex]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const timerStatus = useMemo(() => {
    if (running) return "Learning Time · Auto tracking";
    if (inactive) return "Paused while inactive";
    return "Waiting for activity";
  }, [inactive, running]);

  const toggleFullscreen = async () => {
    if (!viewerRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await viewerRef.current.requestFullscreen();
  };

  const handleBack = () => {
    setRunning(false);
    if (slideCount) recordLessonSlide(lesson.id, activeIndex, slideCount);
    saveLessonStudySeconds(lesson.id, elapsedRef.current);
    flushLessonProgress().catch(() => {});
    flushLearningTime().catch(() => {});
    sessionStorage.removeItem("bd10-active-lesson");
    onTimeUpdate(readLearningTime());
    onBack();
  };

  return (
    <main className="lesson-viewer-page">
      <header className="lesson-viewer-info">
        <div>
          <span className="lesson-viewer-kicker">Lesson {lesson.number}</span>
          <h1>{lesson.title} <span>{lesson.chineseTitle}</span></h1>
          <p><strong>{lesson.pinyin}</strong><span aria-hidden="true">·</span>{lesson.description}</p>
        </div>
        <div className="lesson-viewer-meta" aria-label="Lesson details">
          <span>🌐 {lesson.level}</span>
          <span title="Minimum active learning time"><Clock3 />{formatStudyDuration(lesson.estimatedTime)}</span>
          <span><Target />{lesson.practiceType}</span>
        </div>
      </header>

      <div className="lesson-viewer-layout">
        <section className="lesson-stage-column">
          <div className={`lesson-slide-shell ${fullscreen ? "is-fullscreen" : ""}`} ref={viewerRef}>
            <div className="lesson-slide-scroll">
              {activeSlide ? (
                <img
                  className="lesson-slide-image"
                  src={activeSlide.image}
                  alt={activeSlide.alt}
                  style={{ transform: `scale(${zoom / 100})` }}
                />
              ) : pptxUrl ? (
                <div
                  ref={pptxMainRef}
                  className="lesson-pptx-main"
                  style={{ "--pptx-zoom": zoom / 100 }}
                  aria-label="PPTX slide viewer"
                >
                  {!pptxReady && !pptxError && <div className="lesson-slide-empty">Converting PPTX slides…</div>}
                  {pptxError && <div className="lesson-slide-empty">Unable to preview this PPTX file.<br />{pptxError}</div>}
                </div>
              ) : (
                <div className="lesson-slide-empty">Slide material is not available for this lesson yet.</div>
              )}
            </div>
          </div>

          <div className="lesson-viewer-controls">
            <button type="button" onClick={goPrevious} disabled={!canPrevious}><ArrowLeft /><span><small>上一頁</small>Previous</span></button>
            <div className="lesson-viewer-progress">
              <strong>{slideCount ? activeIndex + 1 : 0} / {slideCount}</strong>
              <div><span style={{ width: `${progress}%` }} /></div>
            </div>
            <button className="next" type="button" onClick={goNext} disabled={!slideCount || (isFinalSlide && remainingStudySeconds > 0)}>
              <span><small>{isFinalSlide ? "完成課程" : "下一頁"}</small>{isFinalSlide ? "Complete Lesson" : "Next"}</span><ArrowRight />
            </button>
          </div>

          <div className="lesson-zoom-controls" aria-label="Slide viewer controls">
            <button type="button" onClick={() => setZoom((value) => Math.max(ZOOM_MIN, value - 10))} disabled={zoom === ZOOM_MIN} aria-label="Zoom out"><Minus /></button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(ZOOM_MAX, value + 10))} disabled={zoom === ZOOM_MAX} aria-label="Zoom in"><Plus /></button>
            <button type="button" onClick={toggleFullscreen}><Expand />Fullscreen</button>
          </div>
        </section>

        <aside className="lesson-viewer-side">
          <button className="back-to-lessons" type="button" onClick={handleBack}><ArrowLeft />Back to Lessons <span>返回課程列表</span></button>
          <section className="study-timer-card">
            <div className="study-timer-heading"><Clock3 /><div><strong>Study Timer</strong><span>學習計時</span></div></div>
            <time>{formatElapsed(elapsedSeconds)}</time>
            <p>{timerStatus}</p>
            <div className={`study-timer-live ${running ? "active" : "idle"}`}><span />{running ? "Tracking now" : "Auto-resumes with activity"}</div>
            {isFinalSlide && remainingStudySeconds > 0 && <div className="study-minimum-note">Complete after {formatElapsed(remainingStudySeconds)} more active study.</div>}
          </section>
          <div ref={thumbnailPanelRef} className="lesson-thumbnails" aria-label="Lesson slides">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                ref={(node) => { thumbRefs.current[index] = node; }}
                className={activeIndex === index ? "active" : ""}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Open slide ${index + 1}`}
                aria-current={activeIndex === index ? "page" : undefined}
              >
                <span>Slide {index + 1}</span>
                <img src={slide.thumbnail || slide.image} alt="" loading={index === 0 ? "eager" : "lazy"} />
              </button>
            ))}
            {pptxUrl && <div ref={pptxThumbRef} className="lesson-pptx-thumbnails" aria-label="PPTX slide thumbnails" />}
          </div>
        </aside>
      </div>
    </main>
  );
}
