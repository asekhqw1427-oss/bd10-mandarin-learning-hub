import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Users, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import { adminTranslate } from './adminTranslations';

export default function AdminStudentRecords({ lang, lessons }) {
 const t = value => adminTranslate(lang, value);
 const [students,setStudents]=useState([]), [busy,setBusy]=useState(true), [error,setError]=useState(''), [query,setQuery]=useState(''), [selected,setSelected]=useState('');
 const published=useMemo(()=>lessons.filter(l=>l.status==='published'),[lessons]);
 const load=async()=>{setBusy(true);setError('');try { if(!supabase)throw Error(); const {data,error}=await supabase.rpc('admin_student_records');if(error)throw error;setStudents(data||[]);}catch{setError('Student records could not load. Please retry.');}finally{setBusy(false);}};
 useEffect(()=>{load();},[]);
 const filtered=students.filter(s=>`${s.name} ${s.loginId}`.toLowerCase().includes(query.toLowerCase()));
 const student=students.find(s=>s.id===selected);
 const minutes=seconds=>`${(Number(seconds||0)/60).toFixed(1)} ${t('min')}`;
 const date=value=>value?new Date(value).toLocaleString(lang==='zh'?'zh-TW':'en-US',{timeZone:'Asia/Taipei'}):t('No records yet');
 const progressFor=(s,l)=>s.lessons.find(p=>p.lessonId===l.id);
 const complete=(p,l)=>Boolean(p?.completed)&&Number(p.activeSeconds)>=Math.max(1,parseFloat(l.estimatedTime)||15)*60;
 const completed=s=>published.filter(l=>complete(progressFor(s,l),l)).length;
 return <section className="admin-students">
  <div className="admin-welcome"><div><span className="admin-eyebrow">{t('Student Record')}</span><h1>{t('Student activity and lesson progress')}</h1><p>{t('Learning records synced from student accounts.')}</p></div><button className="admin-secondary" disabled={busy} onClick={load}><RefreshCw size={16}/>{t('Refresh')}</button></div>
  {error&&<p role="alert">{t(error)}</p>}
  <div className="admin-stat-grid"><div className="admin-stat-card"><Users/><div><strong>{students.length}</strong><small>{t('All students')}</small></div></div><div className="admin-stat-card"><Clock3/><div><strong>{minutes(students.reduce((sum,s)=>sum+Number(s.todaySeconds),0))}</strong><small>{t('Today’s Learning Time')}</small></div></div><div className="admin-stat-card"><Clock3/><div><strong>{minutes(students.reduce((sum,s)=>sum+Number(s.totalSeconds),0))}</strong><small>{t('Total Learning Time')}</small></div></div><div className="admin-stat-card"><CheckCircle2/><div><strong>{students.reduce((sum,s)=>sum+completed(s),0)}</strong><small>{t('Completed Lessons')}</small></div></div></div>
  <div className="admin-card"><div className="admin-card-heading"><h2><Users/>{t('Student Record')}</h2><input aria-label={t('Search name or ID')} placeholder={t('Search name or ID')} value={query} onChange={e=>setQuery(e.target.value)}/></div>
   {busy?<p className="admin-record-message" role="status">{t('Loading records…')}</p>:<div className="admin-account-table-wrap"><table className="admin-account-table"><thead><tr>{['Student','Login ID','Today’s Learning Time','Total Learning Time','Completed Lessons','Last Activity'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{filtered.map(s=><tr key={s.id} className={selected===s.id?'selected':''}><td><button className="admin-copy-button" onClick={()=>setSelected(s.id)}>{s.name}</button></td><td>{s.loginId}</td><td>{minutes(s.todaySeconds)}</td><td>{minutes(s.totalSeconds)}</td><td>{completed(s)} / {published.length}</td><td>{date(s.lastActivity)}</td></tr>)}</tbody></table>{!filtered.length&&<p className="admin-record-message">{t('No students found.')}</p>}</div>}
  </div>
  {student&&<div className="admin-card admin-student-detail"><div className="admin-card-heading"><h2>{student.name} · {t('Lesson Materials')}</h2></div><div className="admin-account-table-wrap"><table className="admin-account-table"><thead><tr>{['Lesson','Progress','Active learning','Status','Updated'].map(label=><th key={label}>{t(label)}</th>)}</tr></thead><tbody>{published.map(l=>{const p=progressFor(student,l),done=complete(p,l);return <tr key={l.id}><td>{l.number} · {lang==='zh'?l.chineseTitle||l.title:l.title}</td><td>{done?100:Math.min(99,p?.progress||0)}%</td><td>{minutes(p?.activeSeconds)} / {l.estimatedTime}</td><td>{t(done?'Completed':p?.activeSeconds||p?.progress?'In Progress':'Not Started')}</td><td>{date(p?.updatedAt)}</td></tr>;})}</tbody></table>{!published.length&&<p className="admin-record-message">{t('No published lessons')}</p>}</div></div>}
  <p className="admin-record-message">{t('Activity is recorded when students study lessons; inactive time is excluded.')}</p>
 </section>;
}
