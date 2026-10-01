import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ChevronLeft, ChevronRight, FileCode2, LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import { getHanziCharacters, loadA0StrokeIndex, loadA0StrokeShard } from "./data/a0Stroke";
import { loadA1StrokeCharacter, loadA1StrokeIndex } from "./data/a1Stroke";

const BLUE = "#087ee6";
const REMAINING = "#d7e7f3";
const COMPLETED = "#0d4d91";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function handwritingEase(value) {
  const smoothStep = value * value * (3 - 2 * value);
  return value * 0.38 + smoothStep * 0.62;
}

function pointDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function smoothGuidePoints(points) {
  const distinct = points.filter((point, index) => index === 0 || pointDistance(points[index - 1], point) > 1.25);
  if (distinct.length < 3) return distinct;
  let smoothed = distinct;
  for (let pass = 0; pass < 2; pass += 1) {
    smoothed = smoothed.map((point, index, source) => {
      if (index === 0 || index === source.length - 1) return point;
      const previous = source[index - 1];
      const next = source[index + 1];
      return {
        x: previous.x * 0.2 + point.x * 0.6 + next.x * 0.2,
        y: previous.y * 0.2 + point.y * 0.6 + next.y * 0.2,
      };
    });
  }
  return smoothed;
}

function createSmoothGuidePath(points) {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const controlOne = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const controlTwo = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    };
    path += ` C ${controlOne.x.toFixed(2)} ${controlOne.y.toFixed(2)} ${controlTwo.x.toFixed(2)} ${controlTwo.y.toFixed(2)} ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

function createWritingGuide(pathNode, stroke) {
  const box = pathNode.getBBox();
  if (Array.isArray(stroke.median) && stroke.median.length > 1) {
    const points = stroke.median.map(([x, y]) => ({ x, y }));
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
      length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }
    const guidePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
    return {
      path: guidePath,
      length: Math.max(length, 1),
      brushWidth: clamp(Math.max(Math.min(box.width, box.height) * 0.24, 28), 20, 170),
      duration: clamp(250, 750, 220 + length * 0.75),
    };
  }
  const outlineLength = pathNode.getTotalLength();
  const sampleCount = clamp(Math.ceil(outlineLength / 14), 16, 96);
  const points = [];
  const widths = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const edgeA = pathNode.getPointAtLength(outlineLength * progress * 0.5);
    const edgeB = pathNode.getPointAtLength(outlineLength * (1 - progress * 0.5));
    points.push({ x: (edgeA.x + edgeB.x) / 2, y: (edgeA.y + edgeB.y) / 2 });
    widths.push(Math.hypot(edgeA.x - edgeB.x, edgeA.y - edgeB.y));
  }
  let guidePoints = smoothGuidePoints(points);
  let length = guidePoints.reduce((total, point, index) => index ? total + pointDistance(guidePoints[index - 1], point) : total, 0);
  const sortedWidths = widths.slice().sort((first, second) => first - second);
  const medianWidth = sortedWidths[Math.floor(sortedWidths.length / 2)] || 24;
  if (length < 1) {
    const center = points[0] || { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    guidePoints = [{ x: center.x - 0.5, y: center.y }, { x: center.x + 0.5, y: center.y }];
    length = 1;
  }
  const guidePath = createSmoothGuidePath(guidePoints);
  return {
    path: guidePath,
    length,
    brushWidth: clamp(Math.max(medianWidth * 1.2, Math.min(box.width, box.height) * 0.9), 18, 180),
    duration: clamp(310, 880, 250 + length * 0.82 + (stroke.commands?.length || 0) * 6),
  };
}

function StrokeGeometry({ transform, children }) {
  return transform ? <g transform={transform}>{children}</g> : <>{children}</>;
}

function StrokePreview({ decoded, activeStroke, onClick, label }) {
  return <button type="button" className="stroke-step" onClick={onClick} aria-label={label}>
    <svg viewBox={decoded.viewBox} role="img" aria-hidden="true">
      <StrokeGeometry transform={decoded.geometryTransform}>
        {decoded.strokes.map((stroke, index) => {
          return <path key={stroke.index} d={stroke.path} fill={index === activeStroke ? BLUE : REMAINING} />;
        })}
        {decoded.strokes[activeStroke] && <path d={decoded.strokes[activeStroke].path} fill="none" stroke="#075da9" strokeWidth="7" opacity=".95" />}
      </StrokeGeometry>
    </svg>
  </button>;
}

const StrokeCanvas = forwardRef(function StrokeCanvas({ decoded, activeStroke, label, onClick, onGuidesReady }, ref) {
  const sourcePathsRef = useRef([]);
  const activeGuideRef = useRef(null);
  const activeGuideLengthRef = useRef(1);
  const [guides, setGuides] = useState([]);
  const activeGuide = guides[activeStroke];
  const maskId = `stroke-writing-mask-${decoded.character.codePointAt(0)}-${activeStroke}`;

  useLayoutEffect(() => {
    const nextGuides = decoded.strokes.map((stroke, index) => createWritingGuide(sourcePathsRef.current[index], stroke));
    setGuides(nextGuides);
  }, [decoded]);

  useEffect(() => {
    if (guides.length === decoded.strokeCount) onGuidesReady();
  }, [decoded.strokeCount, guides, onGuidesReady]);

  useLayoutEffect(() => {
    if (!activeGuideRef.current || !activeGuide) return;
    const measuredLength = Math.max(activeGuideRef.current.getTotalLength(), 1);
    activeGuideLengthRef.current = measuredLength;
    activeGuideRef.current.style.strokeDasharray = `${measuredLength} ${measuredLength}`;
    activeGuideRef.current.style.strokeDashoffset = String(measuredLength);
  }, [activeGuide, activeStroke]);

  useImperativeHandle(ref, () => ({
    getDuration: (index) => guides[index]?.duration || null,
    setProgress: (progress) => {
      if (!activeGuideRef.current || !activeGuide) return;
      activeGuideRef.current.style.strokeDashoffset = String(activeGuideLengthRef.current * (1 - clamp(progress, 0, 1)));
    },
  }), [activeGuide, guides]);

  return <button type="button" className="stroke-animation" onClick={onClick} aria-label={label}>
    <svg viewBox={decoded.viewBox} role="img" aria-hidden="true">
      <defs>
        {decoded.strokes.map((stroke, index) => <path key={stroke.index} ref={(node) => { sourcePathsRef.current[index] = node; }} d={stroke.path} fill="none" visibility="hidden" />)}
        {activeGuide && <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#000"/><StrokeGeometry transform={decoded.geometryTransform}><path ref={activeGuideRef} className="stroke-writing-guide" d={activeGuide.path} fill="none" stroke="#fff" strokeWidth={activeGuide.brushWidth} strokeLinecap="round" strokeLinejoin="round"/></StrokeGeometry></mask>}
      </defs>
      <StrokeGeometry transform={decoded.geometryTransform}>
        {decoded.strokes.map((stroke, index) => {
          if (index < activeStroke) return <path key={stroke.index} d={stroke.path} fill={COMPLETED} />;
          if (index === activeStroke) return <g key={stroke.index}><path d={stroke.path} fill={REMAINING}/>{activeGuide && <path d={stroke.path} fill={BLUE} mask={`url(#${maskId})`}/>}</g>;
          return <path key={stroke.index} d={stroke.path} fill={REMAINING} />;
        })}
      </StrokeGeometry>
    </svg>
  </button>;
});

export default function A0StrokePanel({ word }) {
  const isSupportedLevel = word?.cefr === "A0" || word?.cefr === "A1";
  const isA1 = word?.cefr === "A1";
  const characters = useMemo(() => getHanziCharacters(word?.hanzi), [word?.hanzi]);
  const [selectedCharacter, setSelectedCharacter] = useState(characters[0] || "");
  const [strokeIndex, setStrokeIndex] = useState(null);
  const [indexError, setIndexError] = useState("");
  const [asset, setAsset] = useState(null);
  const [assetState, setAssetState] = useState("idle");
  const [assetError, setAssetError] = useState("");
  const [activeStroke, setActiveStroke] = useState(0);
  const [playing, setPlaying] = useState(false);
  const strokeProgressRef = useRef(0);
  const animationCanvasRef = useRef(null);
  const [animationRun, setAnimationRun] = useState(0);
  const [guideRevision, setGuideRevision] = useState(0);
  const onGuidesReady = useCallback(() => setGuideRevision((revision) => revision + 1), []);

  useEffect(() => {
    setSelectedCharacter(characters[0] || "");
  }, [characters]);

  useEffect(() => {
    if (!isSupportedLevel) return undefined;
    let cancelled = false;
    setStrokeIndex(null);
    setIndexError("");
    const loadIndex = isA1 ? loadA1StrokeIndex : loadA0StrokeIndex;
    loadIndex()
      .then((index) => {
        if (!cancelled) setStrokeIndex(index);
      })
      .catch((error) => {
        if (!cancelled) setIndexError(error.message || "Stroke mapping could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [isA1, isSupportedLevel]);

  useEffect(() => {
    if (!strokeIndex || !selectedCharacter) return undefined;
    const entry = strokeIndex.byCharacter.get(selectedCharacter);
    let cancelled = false;
    setAsset(null);
    setAssetError("");
    setActiveStroke(0);
    strokeProgressRef.current = 0;
    setPlaying(false);
    setAnimationRun((run) => run + 1);
    if (!entry) {
      setAssetState("missing");
      return undefined;
    }
    setAssetState("loading");
    const loadAsset = isA1 ? loadA1StrokeCharacter : loadA0StrokeShard;
    loadAsset(entry)
      .then((loadedAsset) => {
        if (!cancelled) {
          setAsset(loadedAsset);
          setAssetState("loaded");
          setPlaying(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAssetError(error.message || "Stroke asset could not be loaded.");
          setAssetState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isA1, selectedCharacter, strokeIndex]);

  const decoded = asset?.decoded;
  useEffect(() => {
    if (decoded && import.meta.env.DEV) {
      console.debug("[A0 stroke renderer]", { character: decoded.character, strokeCount: decoded.strokeCount, renderedPathCount: decoded.strokes.length });
    }
  }, [decoded]);
  useEffect(() => {
    if (!playing || !decoded?.strokeCount) return undefined;
    const duration = animationCanvasRef.current?.getDuration(activeStroke);
    if (!duration) return undefined;
    let frame;
    let advanceTimer;
    const started = performance.now() - strokeProgressRef.current * duration;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      strokeProgressRef.current = progress;
      animationCanvasRef.current?.setProgress(isA1 ? easeInOutCubic(progress) : handwritingEase(progress));
      if (progress >= 1) {
        if (activeStroke < decoded.strokeCount - 1) {
          advanceTimer = window.setTimeout(() => {
            setActiveStroke((current) => current + 1);
            strokeProgressRef.current = 0;
          }, isA1 ? 140 : 95);
        } else {
          setPlaying(false);
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (advanceTimer) window.clearTimeout(advanceTimer);
    };
  }, [playing, activeStroke, animationRun, decoded, guideRevision, isA1]);

  if (!isSupportedLevel) {
    return <div className="stroke-panel stroke-panel-unavailable"><CircleAlert/><strong>Stroke practice is currently available for A0 and A1 vocabulary.</strong><span>Select an A0 or A1 vocabulary item to view its linked Hanzi stroke asset.</span></div>;
  }

  const selectStroke = (index) => {
    setActiveStroke(index);
    strokeProgressRef.current = 0;
    setPlaying(true);
    setAnimationRun((run) => run + 1);
  };
  const previousStroke = () => {
    setActiveStroke((current) => Math.max(0, current - 1));
    strokeProgressRef.current = 0;
    setPlaying(true);
    setAnimationRun((run) => run + 1);
  };
  const nextStroke = () => {
    if (!decoded) return;
    setActiveStroke((current) => Math.min(decoded.strokeCount - 1, current + 1));
    strokeProgressRef.current = 0;
    setPlaying(true);
    setAnimationRun((run) => run + 1);
  };
  const replay = () => {
    setActiveStroke(0);
    strokeProgressRef.current = 0;
    setPlaying(true);
    setAnimationRun((run) => run + 1);
  };

  return <div className="stroke-panel">
    <div className="stroke-panel-heading"><div><h3>Hanzi Stroke</h3><p>{isA1 ? "A1 character geometry · stroke order preserved" : "Original APK geometry · stroke order preserved"}</p></div>{strokeIndex?.manifest&&<span>{strokeIndex.manifest.hanzi_stroke_shard_count || strokeIndex.manifest.uniqueCharacterCount} source shards</span>}</div>
    {characters.length > 1 && <div className="stroke-character-picker" aria-label="Select a character">{characters.map((character) => <button type="button" key={character} className={selectedCharacter === character ? "active" : ""} onClick={() => setSelectedCharacter(character)}>{character}</button>)}</div>}
    {indexError && <div className="stroke-status error"><CircleAlert/><span>{indexError}</span></div>}
    {!indexError && !strokeIndex && <div className="stroke-status"><LoaderCircle className="spin"/><span>Loading stroke mapping…</span></div>}
    {strokeIndex && <>
      {assetState === "loading" && <div className="stroke-status"><LoaderCircle className="spin"/><span>Decoding {selectedCharacter || "selected character"}…</span></div>}
      {assetState === "missing" && <div className="stroke-status error"><CircleAlert/><span>Stroke data unavailable.</span></div>}
      {assetState === "error" && <div className="stroke-status error"><CircleAlert/><span>{assetError}</span></div>}
      {assetState === "loaded" && decoded && <>
        <div className="stroke-animation-wrap">
          <StrokeCanvas ref={animationCanvasRef} decoded={decoded} activeStroke={activeStroke} label={`${selectedCharacter} stroke animation`} onGuidesReady={onGuidesReady} />
          <div className="stroke-animation-info"><strong>Stroke {Math.min(activeStroke + 1, decoded.strokeCount)} / {decoded.strokeCount}</strong><span>{decoded.strokes[activeStroke]?.name || "Original stroke path"}</span></div>
        </div>
        <div className="stroke-controls" aria-label="Stroke animation controls">
          <button type="button" onClick={previousStroke} title="Previous stroke"><ChevronLeft/>Previous</button>
          <button type="button" onClick={() => setPlaying((value) => !value)} className="primary" title={playing ? "Pause" : "Play"}>{playing ? <Pause/> : <Play/>}{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={replay} title="Replay"><RotateCcw/>Replay</button>
          <button type="button" onClick={nextStroke} title="Next stroke">Next<ChevronRight/></button>
        </div>
        <div className="stroke-step-grid" aria-label="Stroke previews">{decoded.strokes.map((stroke, index) => <div className={index === activeStroke ? "stroke-step-card active" : "stroke-step-card"} key={stroke.index}><StrokePreview decoded={decoded} activeStroke={index} onClick={() => selectStroke(index)} label={`Show stroke ${index + 1}`}/><span>{index + 1}</span><small>{stroke.name || "stroke"}</small></div>)}</div>
      </>}
    </>}
    {assetState === "loaded" && asset && <div className="stroke-source"><FileCode2/><span><strong>Source file</strong><code>{asset.stroke_file}</code></span><em>{isA1 ? "Supplied A1 character asset loaded on demand" : "Binary source preserved unchanged"}</em></div>}
    <p className="stroke-parser-note">{isA1 ? <>Loaded from the supplied A1 character stroke asset; only the selected Hanzi is fetched and cached.</> : <>Decoded from the supplied <code>.hanzi</code> payload using its original command stream. No replacement stroke dataset is used.</>}</p>
  </div>;
}
