"use client";

import {FormEvent,useEffect,useState} from "react";
import {ArrowLeft,Check,KeyRound,ShieldCheck} from "lucide-react";
import {signOutCandidate,supabase,updateCandidatePassword} from "@/lib/supabase";

type RecoveryState="checking"|"ready"|"invalid"|"saved";

export default function ResetPasswordPage(){
  const [state,setState]=useState<RecoveryState>("checking");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    let active=true;
    const recoveryHint=window.location.hash.includes("type=recovery")||window.location.search.includes("type=recovery");
    const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{
      if(active&&event==="PASSWORD_RECOVERY")setState("ready");
    });
    void supabase.auth.getSession().then(({data})=>{
      if(!active)return;
      if(data.session&&recoveryHint)setState("ready");
      else window.setTimeout(()=>{if(active)setState(current=>current==="checking"?"invalid":current)},1200);
    });
    return()=>{active=false;subscription.unsubscribe()};
  },[]);

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError("");
    if(password.length<8){setError("يجب أن تتكوّن كلمة المرور من 8 أحرف على الأقل.");return}
    if(password!==confirmation){setError("كلمتا المرور غير متطابقتين.");return}
    setBusy(true);
    try{await updateCandidatePassword(password);setState("saved")}
    catch(error){console.error(error);setError("تعذر حفظ كلمة المرور الجديدة. اطلب رابطاً جديداً وحاول مرة أخرى.")}
    finally{setBusy(false)}
  };

  return <main className="welcome-shell" dir="rtl" lang="ar"><section className="welcome-card auth-card reset-card"><img className="brand-logo" src="/medibridge-logo.svg" alt="MediBridge"/>{state==="saved"?<><div className="reset-status-icon success"><Check/></div><div className="auth-heading"><p className="eyebrow">MEDIBRIDGE CAREERS</p><h1>تم تغيير كلمة المرور</h1><p className="lead">يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.</p></div><button className="primary-button" type="button" onClick={async()=>{await signOutCandidate();window.location.href="/"}}>العودة إلى تسجيل الدخول<ArrowLeft size={18}/></button></>:state==="invalid"?<><div className="reset-status-icon"><KeyRound/></div><div className="auth-heading"><p className="eyebrow">MEDIBRIDGE CAREERS</p><h1>الرابط غير صالح</h1><p className="lead">انتهت صلاحية رابط إعادة التعيين أو تم استخدامه من قبل. اطلب رابطاً جديداً من صفحة تسجيل الدخول.</p></div><a className="primary-button" href="/">طلب رابط جديد<ArrowLeft size={18}/></a></>:<><div className="reset-status-icon"><ShieldCheck/></div><div className="auth-heading"><p className="eyebrow">MEDIBRIDGE CAREERS</p><h1>اختر كلمة مرور جديدة</h1><p className="lead">استخدم 8 أحرف على الأقل ولا تشارك كلمة المرور مع أي شخص.</p></div>{state==="checking"?<p className="auth-message success" role="status">جارٍ التحقق من الرابط…</p>:<form className="auth-form" onSubmit={submit}><label><span>كلمة المرور الجديدة</span><input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event=>setPassword(event.target.value)}/></label><label><span>تأكيد كلمة المرور</span><input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>{error&&<p className="auth-message error" role="alert">{error}</p>}<button className="primary-button" disabled={busy} type="submit">{busy?"جارٍ الحفظ…":"حفظ كلمة المرور الجديدة"}<KeyRound size={18}/></button></form>}</>}</section></main>;
}
