"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,CheckCircle2,ChevronRight,ClipboardList,FileText,Filter,LogOut,Mail,MessageSquarePlus,Pencil,Plus,Save,Search,ShieldCheck,Trash2,UserRound,XCircle,type LucideIcon} from "lucide-react";
import {addInternalNote,createCandidateInterest,EmailDeliveryError,getBackofficeSession,getCandidateActivity,listBackofficeCandidates,listCandidateInterests,listEmailTemplates,prepareCandidateEmail,removeCandidateInterest,reviewCandidateDocument,saveEmailTemplate,signInBackoffice,signOutBackoffice,updateCandidateInterest,updateCandidateProfile,updateCandidateStatus,type BackofficeCandidate,type BackofficeInterest,type BackofficeMembership,type EmailLog,type EmailTemplate,type InternalNote,type StatusHistoryEntry} from "@/lib/backoffice";
import {listBackofficeJobs,type Job} from "@/lib/jobs";
import {getCandidateDocumentUrl,type CandidateDocument,type CandidateStatus} from "@/lib/supabase";
import "./backoffice.css";

const statusLabels:Record<CandidateStatus,string>={draft:"Entwurf",submitted:"Eingereicht",under_review:"In Prüfung",verified:"Verifiziert",rejected:"Abgelehnt"};
const documentLabels:Record<string,string>={passport:"Pass / Identität",qualification:"Berufsabschluss",language:"Sprachzertifikat",reference:"Arbeitszeugnis",general:"Weiteres Dokument"};
const languageLabels:Record<string,string>={en:"Englisch",de:"Deutsch",ar:"Arabisch"};
const PAGE_SIZE=20;

export default function BackofficePage(){
  const [session,setSession]=useState<BackofficeMembership|null|undefined>(undefined);
  const [candidates,setCandidates]=useState<BackofficeCandidate[]>([]);
  const [total,setTotal]=useState(0);
  const [statusCounts,setStatusCounts]=useState<{under_review:number;verified:number}>({under_review:0,verified:0});
  const [selectedId,setSelectedId]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("all");
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const load=async(nextPage=page,nextFilter=filter,nextQuery=query)=>{
    setLoading(true);
    try{
      const result=await listBackofficeCandidates({page:nextPage,pageSize:PAGE_SIZE,status:nextFilter,query:nextQuery});
      setCandidates(result.rows);
      setTotal(result.total);
      if(!selectedId&&result.rows[0])setSelectedId(result.rows[0].id);
      const [reviewCount,verifiedCount]=await Promise.all([
        listBackofficeCandidates({status:"under_review",page:1,pageSize:1}),
        listBackofficeCandidates({status:"verified",page:1,pageSize:1}),
      ]);
      setStatusCounts({under_review:reviewCount.total,verified:verifiedCount.total});
    }catch{
      setError("Kandidaten konnten nicht geladen werden.");
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{getBackofficeSession().then(value=>{setSession(value);if(value)void load(1,filter,query)})},[]);
  useEffect(()=>{if(!session)return;const handle=setTimeout(()=>{setPage(1);void load(1,filter,query)},350);return()=>clearTimeout(handle)},[query]);

  const changeFilter=(value:string)=>{setFilter(value);setPage(1);void load(1,value,query)};
  const changePage=(next:number)=>{setPage(next);void load(next,filter,query)};

  const selected=candidates.find(x=>x.id===selectedId)||null;
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));

  if(session===undefined)return <main className="bo-login"><img src="/medibridge-logo.svg" alt="MediBridge"/><p>Backoffice wird geladen …</p></main>;
  if(!session)return <Login onSuccess={value=>{setSession(value);void load(1)}}/>;

  return <main className="bo-shell">
    <aside className={`bo-sidebar ${selected?"has-selection":""}`}>
      <header>
        <img src="/medibridge-logo.svg" alt="MediBridge"/>
        <div><strong>Backoffice</strong><span>{session.display_name}</span></div>
        <nav className="bo-nav-links">
          <Link href="/backoffice/jobs">Jobs</Link>
          <Link href="/backoffice/communications">Kommunikation</Link>
          <Link href="/backoffice/privacy">Datenschutz</Link>
          <Link href="/backoffice/roles">Rollen</Link>
          <Link href="/backoffice/audit">Audit</Link>
        </nav>
        <button title="Abmelden" onClick={async()=>{await signOutBackoffice();setSession(null)}}><LogOut/></button>
      </header>
      <section className="bo-summary">
        <div><span>Kandidaten</span><strong>{total}</strong></div>
        <div><span>In Prüfung</span><strong>{statusCounts.under_review}</strong></div>
        <div><span>Verifiziert</span><strong>{statusCounts.verified}</strong></div>
      </section>
      <div className="bo-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, E-Mail oder Vorgang"/></div>
      <div className="bo-filter"><Filter/>{["all","submitted","under_review","verified","rejected","draft"].map(value=><button className={filter===value?"active":""} onClick={()=>changeFilter(value)} key={value}>{value==="all"?"Alle":statusLabels[value as CandidateStatus]}</button>)}</div>
      <div className="bo-list">
        {loading&&<p className="bo-empty">Wird geladen …</p>}
        {!loading&&candidates.length===0&&<p className="bo-empty">Keine Kandidaten gefunden.</p>}
        {candidates.map(candidate=><button className={candidate.id===selectedId?"active":""} onClick={()=>setSelectedId(candidate.id)} key={candidate.id}><span className="bo-avatar">{initials(candidate.full_name)}</span><span><strong>{candidate.full_name||"Unvollständiges Profil"}</strong><small>{candidate.email||candidate.residence||"Keine Kontaktdaten"}</small><i className={`bo-status ${candidate.status}`}>{statusLabels[candidate.status]}</i></span><ChevronRight/></button>)}
      </div>
      <div className="bo-pagination"><button disabled={page<=1||loading} onClick={()=>changePage(page-1)}>Zurück</button><span>Seite {page} / {pages}</span><button disabled={page>=pages||loading} onClick={()=>changePage(page+1)}>Weiter</button></div>
    </aside>
    <section className="bo-detail">
      {error&&<p className="bo-error">{error}</p>}
      {selected?<CandidateDetail candidate={selected} onUpdated={()=>load(page,filter,query)} onBack={()=>setSelectedId("")} key={selected.id}/>:<div className="bo-placeholder"><UserRound/><h2>Kandidat auswählen</h2><p>Links einen Kandidaten öffnen, um Profil, Dokumente und Prüfprozess zu bearbeiten.</p></div>}
    </section>
  </main>;
}

function Login({onSuccess}:{onSuccess:(value:BackofficeMembership)=>void}){const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");return <main className="bo-login"><section><img src="/medibridge-logo.svg" alt="MediBridge"/><span className="bo-secure"><ShieldCheck/>Geschützter Bereich</span><h1>MediBridge Backoffice</h1><p>Anmeldung für autorisierte Teammitglieder.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{onSuccess(await signInBackoffice(email,password))}catch{setError("Anmeldung nicht möglich oder keine Backoffice-Berechtigung.")}finally{setBusy(false)}}}><label>E-Mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Passwort<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="bo-error">{error}</p>}<button disabled={busy}>{busy?"Anmeldung …":"Anmelden"}</button></form><Link href="/">Zur Kandidaten-App</Link></section></main>}

function CandidateDetail({candidate,onUpdated,onBack}:{candidate:BackofficeCandidate;onUpdated:()=>Promise<void>;onBack:()=>void}){
  const [tab,setTab]=useState("profile");
  const [notes,setNotes]=useState<InternalNote[]>([]);
  const [emails,setEmails]=useState<EmailLog[]>([]);
  const [history,setHistory]=useState<StatusHistoryEntry[]>([]);
  const [interests,setInterests]=useState<BackofficeInterest[]>([]);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<CandidateStatus>(candidate.status);
  const [statusNote,setStatusNote]=useState("");

  useEffect(()=>{Promise.all([getCandidateActivity(candidate.id),listCandidateInterests(candidate.id)]).then(([data,current])=>{setNotes(data.notes);setEmails(data.emails);setHistory(data.history);setInterests(current)}).catch(()=>undefined)},[candidate.id]);

  const refreshActivity=async()=>{const data=await getCandidateActivity(candidate.id);setNotes(data.notes);setEmails(data.emails);setHistory(data.history);setInterests(await listCandidateInterests(candidate.id))};

  return <>
    <header className="bo-detail-header">
      <button className="bo-back" onClick={onBack}><ArrowLeft/></button>
      <span className="bo-avatar large">{initials(candidate.full_name)}</span>
      <div><small>{candidate.reference_number||"Ohne Vorgangsnummer"}</small><h1>{candidate.full_name||"Unvollständiges Profil"}</h1><p>{candidate.email||"Keine E-Mail"} · {candidate.residence||"Wohnort offen"}</p></div>
      <i className={`bo-status ${candidate.status}`}>{statusLabels[candidate.status]}</i>
    </header>
    <nav className="bo-tabs">{([["profile","Profil",UserRound],["documents","Dokumente",FileText],["notes","Notizen",MessageSquarePlus],["process","Prüfung",ClipboardList],["interests","Interessen",CheckCircle2],["email","E-Mails",Mail]] as [string,string,LucideIcon][]).map(([id,label,Icon]:[string,string,LucideIcon])=><button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}><Icon/>{label}</button>)}</nav>
    {tab==="profile"&&<ProfileTab candidate={candidate} onUpdated={onUpdated}/>}
    {tab==="documents"&&<DocumentsTab candidate={candidate} onUpdated={onUpdated}/>}
    {tab==="notes"&&<section className="bo-panel"><h2>Interne Notizen</h2><p className="bo-hint">Nur für das MediBridge-Team sichtbar.</p><textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="Gespräch, Rückfrage oder nächste Aufgabe dokumentieren …"/><button className="bo-primary" disabled={!note.trim()||busy} onClick={async()=>{setBusy(true);try{const created=await addInternalNote(candidate.id,note.trim());setNotes(current=>[created,...current]);setNote("")}finally{setBusy(false)}}}>Notiz speichern</button><div className="bo-timeline">{notes.map(item=><article key={item.id}><i/><div><span>{formatDate(item.created_at)}</span><p>{item.note}</p></div></article>)}{notes.length===0&&<p className="bo-empty">Noch keine internen Notizen.</p>}</div></section>}
    {tab==="process"&&<section className="bo-panel"><h2>Prüfprozess</h2><label className="bo-field">Neuer Status<select value={status} onChange={e=>setStatus(e.target.value as CandidateStatus)}>{Object.entries(statusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="bo-field">Begründung / nächster Schritt<textarea rows={3} value={statusNote} onChange={e=>setStatusNote(e.target.value)}/></label><button className="bo-primary" disabled={status===candidate.status||busy} onClick={async()=>{setBusy(true);try{await updateCandidateStatus(candidate.id,candidate.status,status,statusNote);await onUpdated();await refreshActivity();setStatusNote("")}finally{setBusy(false)}}}>Status aktualisieren</button><div className="bo-timeline">{history.map(item=><article key={item.id}><i/><div><span>{formatDate(item.created_at)}</span><strong>{statusLabels[item.previous_status as CandidateStatus]||"Neu"} → {statusLabels[item.new_status as CandidateStatus]}</strong>{item.note&&<p>{item.note}</p>}</div></article>)}{history.length===0&&<p className="bo-empty">Noch keine Statusänderungen.</p>}</div></section>}
    {tab==="interests"&&<InterestsTab candidate={candidate} interests={interests} onChanged={refreshActivity}/>}
    {tab==="email"&&<EmailTab candidate={candidate} emails={emails} onPrepared={item=>setEmails(current=>[item,...current])}/>}
  </>;
}

function ProfileTab({candidate,onUpdated}:{candidate:BackofficeCandidate;onUpdated:()=>Promise<void>}){
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [form,setForm]=useState(()=>({full_name:candidate.full_name||"",phone:candidate.phone||"",nationality:candidate.nationality||"",residence:candidate.residence||"",preferred_language:candidate.preferred_language,targetRole:candidate.answers.targetRole||"",qualification:candidate.answers.qualification||"",years:candidate.answers.years||"",german:candidate.answers.german||""}));
  const referralDetail=candidate.answers.referralContact||candidate.answers.referralSchoolCode||candidate.answers.referralSocialPlatform||candidate.answers.referralOther;
  const fields:[string,string|undefined][]=[["Zielsposition",candidate.answers.targetRole],["Qualifikation",candidate.answers.qualification],["Berufserfahrung",candidate.answers.years],["Deutsch",candidate.answers.german],["Anerkennung",candidate.answers.recognition],["Start",candidate.answers.start],["Einreise / Visum",candidate.answers.visa],["Empfehlungsquelle",candidate.answers.referralSource],["Empfehlungsangabe",referralDetail]];

  if(!editing)return <section className="bo-panel">
    <h2>Kandidatenprofil<button className="bo-icon-button" onClick={()=>setEditing(true)}><Pencil/>Bearbeiten</button></h2>
    <div className="bo-data-grid">
      <div><span>Telefon</span><strong>{candidate.phone||"—"}</strong></div>
      <div><span>Nationalität</span><strong>{candidate.nationality||"—"}</strong></div>
      <div><span>Wohnort</span><strong>{candidate.residence||"—"}</strong></div>
      <div><span>Sprache</span><strong>{languageLabels[candidate.preferred_language]}</strong></div>
      {fields.map(([label,value])=><div key={label}><span>{label}</span><strong>{value||"—"}</strong></div>)}
    </div>
  </section>;

  return <section className="bo-panel">
    <h2>Kandidatenprofil bearbeiten</h2>
    <div className="bo-data-grid">
      <label className="bo-field">Vollständiger Name<input value={form.full_name} onChange={e=>setForm(x=>({...x,full_name:e.target.value}))}/></label>
      <label className="bo-field">Telefon<input value={form.phone} onChange={e=>setForm(x=>({...x,phone:e.target.value}))}/></label>
      <label className="bo-field">Nationalität<input value={form.nationality} onChange={e=>setForm(x=>({...x,nationality:e.target.value}))}/></label>
      <label className="bo-field">Wohnort<input value={form.residence} onChange={e=>setForm(x=>({...x,residence:e.target.value}))}/></label>
      <label className="bo-field">Sprache<select value={form.preferred_language} onChange={e=>setForm(x=>({...x,preferred_language:e.target.value as "en"|"de"|"ar"}))}>{Object.entries(languageLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="bo-field">Zielsposition<input value={form.targetRole} onChange={e=>setForm(x=>({...x,targetRole:e.target.value}))}/></label>
      <label className="bo-field">Qualifikation<input value={form.qualification} onChange={e=>setForm(x=>({...x,qualification:e.target.value}))}/></label>
      <label className="bo-field">Berufserfahrung<input value={form.years} onChange={e=>setForm(x=>({...x,years:e.target.value}))}/></label>
      <label className="bo-field">Deutsch<input value={form.german} onChange={e=>setForm(x=>({...x,german:e.target.value}))}/></label>
    </div>
    {error&&<p className="bo-error">{error}</p>}
    <div className="bo-document-actions">
      <button onClick={()=>setEditing(false)} disabled={busy}>Abbrechen</button>
      <button className="bo-primary" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await updateCandidateProfile(candidate.id,{full_name:form.full_name||null,phone:form.phone||null,nationality:form.nationality||null,residence:form.residence||null,preferred_language:form.preferred_language},{...candidate.answers,targetRole:form.targetRole,qualification:form.qualification,years:form.years,german:form.german});await onUpdated();setEditing(false)}catch{setError("Profil konnte nicht gespeichert werden.")}finally{setBusy(false)}}}><Save/>Speichern</button>
    </div>
  </section>;
}

function DocumentsTab({candidate,onUpdated}:{candidate:BackofficeCandidate;onUpdated:()=>Promise<void>}){const [notes,setNotes]=useState<Record<string,string>>({});const [busy,setBusy]=useState("");const review=async(document:CandidateDocument,status:"verified"|"rejected")=>{setBusy(document.id);try{await reviewCandidateDocument(document.id,status,notes[document.id]||"");await onUpdated()}finally{setBusy("")}};return <section className="bo-panel"><h2>Dokumentenprüfung</h2><p className="bo-hint">Dokument öffnen, prüfen und anschließend freigeben oder zurückweisen.</p><div className="bo-documents">{candidate.documents.map(document=><article key={document.id}><div className="bo-document-row"><FileText/><div><strong>{documentLabels[document.document_type]||document.document_type}</strong><span>{document.file_name}</span></div><i className={`bo-status ${document.verification_status}`}>{document.verification_status==="verified"?"Verifiziert":document.verification_status==="rejected"?"Nachbesserung":"In Prüfung"}</i></div><textarea rows={2} value={notes[document.id]??document.verification_note??""} onChange={e=>setNotes(current=>({...current,[document.id]:e.target.value}))} placeholder="Hinweis für den Kandidaten …"/><div className="bo-document-actions"><button onClick={async()=>window.open(await getCandidateDocumentUrl(document),"_blank","noopener,noreferrer")}>Dokument öffnen</button><button className="reject" disabled={!!busy} onClick={()=>void review(document,"rejected")}><XCircle/>Zurückweisen</button><button className="verify" disabled={!!busy} onClick={()=>void review(document,"verified")}><CheckCircle2/>Verifizieren</button></div></article>)}{candidate.documents.length===0&&<p className="bo-empty">Keine Dokumente vorhanden.</p>}</div></section>}

const interestStatusLabels:Record<string,string>={expressed:"Interesse gezeigt",reviewing:"In Prüfung",introduced:"Vorgestellt",interview:"Interview",accepted:"Zusage",declined:"Abgelehnt",withdrawn:"Zurückgezogen"};

function InterestsTab({candidate,interests,onChanged}:{candidate:BackofficeCandidate;interests:BackofficeInterest[];onChanged:()=>Promise<void>}){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [selectedJob,setSelectedJob]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{listBackofficeJobs().then(setJobs).catch(()=>undefined)},[]);
  const availableJobs=useMemo(()=>jobs.filter(job=>!interests.some(item=>item.job_id===job.id)),[jobs,interests]);
  return <section className="bo-panel">
    <h2>Job-Interessen</h2>
    {interests.map(item=><article className="bo-interest" key={item.id}><strong>{jobs.find(job=>job.id===item.job_id)?.title||item.job_id}</strong><select value={item.status} onChange={async event=>{const next=event.target.value;await updateCandidateInterest(item.id,next);await onChanged()}}>{Object.entries(interestStatusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><button className="bo-icon-button" onClick={async()=>{setBusy(true);try{await removeCandidateInterest(item.id);await onChanged()}finally{setBusy(false)}}}><Trash2/></button></article>)}
    {interests.length===0&&<p className="bo-empty">Noch keine Job-Interessen.</p>}
    <div className="bo-document-actions">
      <select value={selectedJob} onChange={e=>setSelectedJob(e.target.value)}><option value="">Job auswählen …</option>{availableJobs.map(job=><option value={job.id} key={job.id}>{job.title}</option>)}</select>
      <button className="bo-primary" disabled={!selectedJob||busy} onClick={async()=>{setBusy(true);try{await createCandidateInterest(candidate.id,selectedJob);setSelectedJob("");await onChanged()}finally{setBusy(false)}}}><Plus/>Interesse hinzufügen</button>
    </div>
  </section>;
}

function EmailTab({candidate,emails,onPrepared}:{candidate:BackofficeCandidate;emails:EmailLog[];onPrepared:(item:EmailLog)=>void}){
  const [templates,setTemplates]=useState<EmailTemplate[]>([]);
  const [template,setTemplate]=useState("");
  const [subject,setSubject]=useState("");
  const [body,setBody]=useState("");
  const [busy,setBusy]=useState(false);
  const [editingTemplate,setEditingTemplate]=useState(false);
  const [sendError,setSendError]=useState("");

  useEffect(()=>{listEmailTemplates().then(rows=>{setTemplates(rows);const first=rows[0];if(first){setTemplate(first.id);setSubject(first.subject);setBody(first.body.replace("{{name}}",candidate.full_name||""))}}).catch(()=>undefined)},[]);

  const choose=(id:string)=>{const item=templates.find(x=>x.id===id);if(!item)return;setTemplate(id);setSubject(item.subject);setBody(item.body.replace("{{name}}",candidate.full_name||""))};

  return <section className="bo-panel">
    <h2>E-Mail vorbereiten</h2>
    <p className="bo-hint">Die Nachricht wird protokolliert und über den konfigurierten Anbieter versendet.</p>
    <label className="bo-field">Vorlage<select value={template} onChange={e=>choose(e.target.value)}>{templates.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
    <label className="bo-field">Empfänger<input value={candidate.email||""} readOnly/></label>
    <label className="bo-field">Betreff<input value={subject} onChange={e=>setSubject(e.target.value)}/></label>
    <label className="bo-field">Nachricht<textarea rows={9} value={body} onChange={e=>setBody(e.target.value)}/></label>
    {sendError&&<p className="bo-error">{sendError}</p>}
    <div className="bo-document-actions">
      <button className="bo-primary" disabled={!candidate.email||!subject||!body||busy} onClick={async()=>{setBusy(true);setSendError("");try{onPrepared(await prepareCandidateEmail(candidate.id,candidate.email!,subject,body))}catch(deliveryError){if(deliveryError instanceof EmailDeliveryError){onPrepared(deliveryError.email);setSendError("Zustellung fehlgeschlagen. Die E-Mail wurde als \"failed\" protokolliert.")}else{setSendError("E-Mail konnte nicht vorbereitet werden.")}}finally{setBusy(false)}}}><Mail/>E-Mail senden</button>
      <button onClick={()=>setEditingTemplate(current=>!current)}><Pencil/>Vorlage bearbeiten</button>
    </div>
    {editingTemplate&&<button className="bo-primary" disabled={busy||!template} onClick={async()=>{const current=templates.find(x=>x.id===template);if(!current)return;setBusy(true);try{const saved=await saveEmailTemplate({id:current.id,key:current.key,label:current.label,subject,body});setTemplates(rows=>rows.map(row=>row.id===saved.id?saved:row));setEditingTemplate(false)}finally{setBusy(false)}}}><Save/>Vorlage speichern</button>}
    <h3>Verlauf</h3>
    <div className="bo-timeline">{emails.map(item=><article key={item.id}><i/><div><span>{formatDate(item.created_at)} · {item.status}</span><strong>{item.subject}</strong></div></article>)}{emails.length===0&&<p className="bo-empty">Noch keine E-Mails vorbereitet.</p>}</div>
  </section>;
}

function initials(name:string|null){return(name||"MB").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()}
function formatDate(value:string){return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))}
