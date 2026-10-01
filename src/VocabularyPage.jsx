import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Bookmark, Check, ChevronDown, ChevronRight, Flame, Headphones, Lightbulb, ListPlus, MoreHorizontal, PenLine, Search, Sparkles, Star, Volume2 } from "lucide-react";
import "./vocabulary.css";
import "./vocabulary-ref.css";
import { tocflVocabulary } from "./data/tocfl";
import A0StrokePanel from "./A0StrokePanel";

const cefrLevels = [
  ["all", "All Levels", "", ""],
  ["A0", "A0", "0–150", "Complete Beginner"],
  ["A1", "A1", "~500", "Beginner"],
  ["A2", "A2", "~1K–1.2K", "Elementary"],
  ["B1", "B1", "~2K–2.5K", "Intermediate"],
  ["B2", "B2", "~4K–5K", "Upper-Intermediate"],
  ["C1", "C1", "~8K", "Advanced"],
  ["C2", "C2", "~16K+", "Proficient"],
].map(([value, label, range, tier]) => ({ value, label, range, tier }));

const categories = [
  ["Common Words", "Common Words"], ["Daily Life", "Daily Life"], ["Food & Drinks", "Food & Drinks"],
  ["At Work", "Work at ASE"], ["In School", "In School"], ["Numbers", "Numbers"],
  ["Time", "Time"], ["Places", "Places"], ["More", "All Topics"],
];
const words = tocflVocabulary;
const searchIndex = new Map(words.map(word => [word.id, [word.hanzi, word.pinyin, word.basic_definition, word.english, word.definition].filter(Boolean).join(" ").toLowerCase()]));
const WORD_ROW_HEIGHT = 66;
const WORD_OVERSCAN = 6;

function CefrBadge({ level }) { return level ? <span className={"cefr-badge level-"+level.toLowerCase()}>{level}</span> : null; }
function CefrFilter({ value, onChange }) {
  const [open,setOpen]=useState(false); const ref=useRef(null);
  useEffect(()=>{const close=e=>!ref.current?.contains(e.target)&&setOpen(false);document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close)},[]);
  return <div className="cefr-filter" ref={ref}><button type="button" className={open?"open":""} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span>Vocab Level</span>{value!=="all"&&<strong>{value}</strong>}<ChevronDown/></button>{open&&<div className="cefr-menu" role="listbox"><header><strong>CEFR Level</strong><small>BD10 targets · approximate ranges</small></header>{cefrLevels.map(level=><button type="button" role="option" aria-selected={value===level.value} className={value===level.value?"selected":""} key={level.value} onClick={()=>{onChange(level.value);setOpen(false)}}>{level.value==="all"?<strong className="cefr-all">All Levels</strong>:<><strong>{level.label}</strong><span>{level.range}</span><em>{level.tier}</em></>}{value===level.value&&<Check/>}</button>)}<p>BD10 learning targets only — not official CEFR vocabulary requirements.</p></div>}</div>
}
const VocabularyRow = React.memo(function VocabularyRow({word, selected, onSelect, top}) {
  return <button type="button" style={{ position: "absolute", top, left: 0, right: 0, height: WORD_ROW_HEIGHT }} className={selected ? "active" : ""} onClick={() => onSelect(word.id)}><div><strong>{word.hanzi}</strong><CefrBadge level={word.cefr}/></div><span><b>{word.pinyin}</b><small>{word.basic_definition||word.english||`TOCFL ${word.tocflLevel}`}</small></span><Volume2/><ChevronRight/></button>;
}, (previous, next) => previous.word === next.word && previous.selected === next.selected && previous.onSelect === next.onSelect && previous.top === next.top);

const WordList = React.memo(function WordList({items,selectedId,onSelect,listRef}) {
  const [viewport, setViewport] = useState({ height: 397, scrollTop: 0 });
  const frameRef = useRef(0);

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return undefined;
    const updateHeight = () => {
      const height = element.clientHeight || 397;
      setViewport(current => current.height === height ? current : { ...current, height });
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [listRef]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) return undefined;
    const onScroll = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const scrollTop = element.scrollTop;
        setViewport(current => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [listRef]);

  useEffect(() => {
    setViewport(current => current.scrollTop === 0 ? current : { ...current, scrollTop: 0 });
  }, [items]);

  if (!items.length) return <div className="dictionary-list" ref={listRef}><div className="vocab-empty"><Search/><strong>No vocabulary found at this level yet.</strong><span>Try another CEFR level, topic, or search term.</span></div></div>;

  const first = Math.max(0, Math.floor(viewport.scrollTop / WORD_ROW_HEIGHT) - WORD_OVERSCAN);
  const last = Math.min(items.length, Math.ceil((viewport.scrollTop + viewport.height) / WORD_ROW_HEIGHT) + WORD_OVERSCAN);
  return <div className="dictionary-list" ref={listRef} style={{ position: "relative" }}>
    <div aria-hidden="true" style={{ height: items.length * WORD_ROW_HEIGHT }} />
    {items.slice(first, last).map((word, index) => <VocabularyRow key={word.id} word={word} selected={selectedId===word.id} onSelect={onSelect} top={(first + index) * WORD_ROW_HEIGHT} />)}
  </div>;
});
const relatedWords=[
  ["您好","nín hǎo","hello (polite)"],["再見","zàijiàn","goodbye"],["謝謝","xièxie","thank you"],["朋友","péngyǒu","friend"],
];
function DetailPanel({word,notify}){
  const [activeTab, setActiveTab] = useState("DICT");
  if(!word)return <section className="dictionary-detail empty"><BookOpen/><p>Select a word to view its details.</p></section>;
  const missingEnglish=!word.definition&&!word.basic_definition&&!word.english;
  const missingPinyin=!word.pinyin;
  const definition=missingEnglish ? "English meaning / definition: needs parser." : word.definition||word.basic_definition||word.english;
  const examples=word.examples?.length ? word.examples : (word.example&&word.exampleEnglish ? [{traditional:word.example,pinyin:word.examplePinyin||"",english:word.exampleEnglish}] : []);
  return <section className="dictionary-detail"><div className="detail-tabs"><button className={activeTab==="DICT"?"active":""} onClick={()=>setActiveTab("DICT")}>DICT</button><button className={activeTab==="STROKE"?"active":""} onClick={()=>setActiveTab("STROKE")}>STROKE</button><button>CHARS</button><button>WORDS</button><button>SENTS</button></div><div className="detail-head"><div><h2>{word.hanzi}</h2><button type="button" disabled={missingPinyin} onClick={()=>notify(word.pinyin)}><Volume2/></button></div><div><button type="button" onClick={()=>notify(word.hanzi+" saved.")}><Star/>Save</button><button type="button"><MoreHorizontal/></button></div></div><div className="detail-translation"><strong>{word.pinyin||"needs parser"}</strong><Volume2/><b>{word.basic_definition||word.english}</b><span className="hsk-badge">TOCFL {word.tocflLevel} · {word.cefr}</span></div>{activeTab==="STROKE" ? <A0StrokePanel word={word}/> : <><h3>Definitions</h3><p className="definition-line">1. {definition} <span>{missingEnglish?"Needs parser":word.partOfSpeech||"Dictionary"}</span></p>{!missingEnglish&&<>{examples.length>0&&<div className="example-box"><div><strong>Example Sentences</strong>{examples.slice(0,2).map((example,index)=><div className="example-item" key={`${example.traditional}-${index}`}><p>{example.traditional}</p><em>{example.pinyin}</em><span>{example.english}</span></div>)}</div><button type="button" onClick={()=>notify(examples[0]?.traditional||word.hanzi)}><Volume2/></button></div>}<h3>Related Words</h3><div className="related-words">{relatedWords.map(([hanzi,pinyin,english])=><button type="button" key={hanzi} onClick={()=>notify(`${hanzi} · ${pinyin} · ${english}`)}><strong>{hanzi}</strong><span>{pinyin}</span><small>{english}</small><Volume2/></button>)}</div></>}<div className="detail-actions"><button onClick={()=>notify(word.hanzi+" added to Flashcards.")}><ListPlus/>Add to Flashcards</button><button onClick={()=>notify(word.hanzi+" saved for later.")}><Bookmark/>Review Later</button><button disabled={missingPinyin} onClick={()=>notify("Pronunciation: "+word.hanzi)}><Headphones/>Practice Pronunciation</button><button onClick={()=>notify("Quick Quiz started.")}><Sparkles/>Start Quick Quiz</button></div></> }</section>
}
function SidePanels(){const[goals,setGoals]=useState([true,true,true,false]);return <aside className="dictionary-side"><section className="dictionary-side-card"><div className="side-title"><h2>My Learning Progress</h2><button>View Details <ArrowRight/></button></div><div className="dictionary-progress"><div className="dictionary-ring"><strong>35%</strong></div><div><strong>48 / 150</strong><span>Words Learned</span><small>Keep going!</small></div></div><div className="study-streak"><Flame/><strong>7 days<span>Study Streak</span></strong><small>Great progress!</small></div></section><section className="dictionary-side-card"><h2>Today’s Goals</h2><p>{goals.filter(Boolean).length} / 4 completed</p><div className="side-progress"><span style={{width:`${goals.filter(Boolean).length/4*100}%`}}/></div><div className="side-goals">{["Learn 6 new words","Review 10 words","Speak 3 sentences","Complete a quiz"].map((label,index)=><label key={label}><input type="checkbox" checked={goals[index]} onChange={()=>setGoals(items=>items.map((item,i)=>i===index?!item:item))}/><span>{goals[index]&&<Check/>}</span>{label}</label>)}</div></section><section className="dictionary-side-card dictionary-tip"><Lightbulb/><div><h2>Tip of the Day</h2><p>Practice a little bit every day — small steps make big progress!</p></div><img src="/assets/bd10-tab-logo.png" alt="BD10 mascot"/></section></aside>}
export default function VocabularyPage({query:headerQuery,notify}){const[search,setSearch]=useState("");const[topic,setTopic]=useState("All Topics");const[cefr,setCefr]=useState("all");const[selectedId,setSelectedId]=useState(words[0]?.id??null);const listRef=useRef(null);const effectiveSearch=useDeferredValue(`${headerQuery||""} ${search}`.trim().toLowerCase());const filtered=useMemo(()=>{const result=[];for(const word of words){if(cefr!=="all"&&word.cefr!==cefr)continue;if(topic!=="All Topics"&&word.topic!==topic)continue;if(effectiveSearch&&!searchIndex.get(word.id)?.includes(effectiveSearch))continue;result.push(word);}return result;},[cefr,topic,effectiveSearch]);const selectedById=useMemo(()=>new Map(filtered.map(word=>[word.id,word])),[filtered]);const selected=selectedById.get(selectedId)??filtered[0]??null;useEffect(()=>{setSelectedId(filtered[0]?.id??null);listRef.current?.scrollTo({top:0,behavior:"smooth"})},[cefr,topic,effectiveSearch,filtered]);return <div className="dictionary-page"><section className="dictionary-hero"><img src="/assets/campus-cleanroom-hero.png" alt="ASE cleanroom learning environment"/><div/><span><BookOpen/>Dictionary &amp; Learning Tools</span><h1>Vocabulary</h1><h2>Search, learn, and review words with confidence.</h2><p>Build your Chinese vocabulary, one word at a time!</p></section><section className="dictionary-searchbar"><label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search words, pinyin, or English..."/></label><button className="search-submit"><Search/>Search</button><button className="handwriting" onClick={()=>notify("Handwriting input demo opened.")}><PenLine/>Handwriting</button><div className="dictionary-categories">{categories.map(([label,value])=><button className={topic===value&&value!=="All Topics"?"active":""} onClick={()=>setTopic(value)} key={label}>{label}{label==="More"&&<ChevronDown/>}</button>)}</div></section><div className="dictionary-layout"><main className="dictionary-main"><section className="word-list-card"><header><div><h2>Word List</h2><span>({words.length.toLocaleString("en-US")} words)</span></div><CefrFilter value={cefr} onChange={setCefr}/></header><WordList items={filtered} selectedId={selected?.id} onSelect={setSelectedId} listRef={listRef}/><footer>Showing {filtered.length?`1–${Math.min(filtered.length,6)} of ${filtered.length.toLocaleString("en-US")}`:"0 of 0"}<span><button type="button" disabled>‹</button><button type="button">›</button></span></footer></section><DetailPanel word={selected} notify={notify}/></main><SidePanels/></div></div>}
