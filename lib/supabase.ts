import { createClient } from "@supabase/supabase-js";

const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL??"https://idzahhvslobjywqyklml.supabase.co";
const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??"sb_publishable_b5Sy7_MiCapOrVFS5JysAw_PNiISL6L";
export type Language="en"|"de"|"ar"; export type CandidateStatus="draft"|"submitted"|"under_review"|"verified"|"rejected";
export type CandidateDocument={id:string;document_type:string;file_name:string;storage_path:string;storage_provider:"supabase"|"r2";storage_bucket:string;mime_type:string|null;file_size:number|null;verification_status:"pending"|"verified"|"rejected";verification_note:string|null;created_at:string;updated_at:string};
export type JobPreferences={desired_role:string;preferred_region:string;possible_start:string;workplace:string};
export type CandidateWorkspace={candidate:null|{id:string;full_name:string|null;email:string|null;phone:string|null;nationality:string|null;residence:string|null;avatar_path:string|null;preferred_language:Language;status:CandidateStatus;reference_number:string|null;submitted_at:string|null};answers:Record<string,string>;documents:CandidateDocument[];preferences:JobPreferences};
export const supabase=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});

export async function getAuthenticatedCandidate(){
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user)return null;
  if(data.user.is_anonymous){
    await supabase.auth.signOut({scope:"local"});
    return null;
  }
  return data.user;
}

export async function registerCandidate(email:string,password:string){
  const result=await supabase.auth.signUp({email:email.trim().toLowerCase(),password});
  if(result.error)throw result.error;
  return result.data;
}

export async function signInCandidate(email:string,password:string){
  const result=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
  if(result.error||!result.data.user)throw result.error??new Error("AUTHENTICATION_FAILED");
  if(result.data.user.is_anonymous){
    await supabase.auth.signOut({scope:"local"});
    throw new Error("AUTHENTICATION_FAILED");
  }
  return result.data.user;
}

export async function signOutCandidate(){
  const result=await supabase.auth.signOut();
  if(result.error)throw result.error;
}

async function requireCandidateUser(){
  const user=await getAuthenticatedCandidate();
  if(!user)throw new Error("AUTH_REQUIRED");
  return user;
}
const emptyPreferences:JobPreferences={desired_role:"",preferred_region:"",possible_start:"",workplace:""};

const documentSelection="id,document_type,file_name,storage_path,storage_provider,storage_bucket,mime_type,file_size,verification_status,verification_note,created_at,updated_at";
export async function getCandidateWorkspace():Promise<CandidateWorkspace>{const user=await requireCandidateUser();const [candidate,intake,documents,preferences]=await Promise.all([supabase.from("candidates").select("id,full_name,email,phone,nationality,residence,avatar_path,preferred_language,status,reference_number,submitted_at").eq("id",user.id).maybeSingle(),supabase.from("candidate_intakes").select("answers").eq("candidate_id",user.id).maybeSingle(),supabase.from("candidate_documents").select(documentSelection).eq("candidate_id",user.id).order("created_at",{ascending:false}),supabase.from("candidate_job_preferences").select("desired_role,preferred_region,possible_start,workplace").eq("candidate_id",user.id).maybeSingle()]);for(const result of [candidate,intake,documents,preferences])if(result.error)throw result.error;return{candidate:candidate.data as CandidateWorkspace["candidate"],answers:(intake.data?.answers??{}) as Record<string,string>,documents:(documents.data??[]) as CandidateDocument[],preferences:{...emptyPreferences,...preferences.data}}}

export async function saveCandidateDraft(answers:Record<string,string>,language:Language){const user=await requireCandidateUser();const now=new Date().toISOString();const {data:current}=await supabase.from("candidates").select("status").eq("id",user.id).maybeSingle();const status:CandidateStatus=current?.status&&current.status!=="draft"?current.status:"draft";const candidate=await supabase.from("candidates").upsert({id:user.id,full_name:answers.fullName||null,email:answers.email||user.email||null,phone:answers.phone||null,nationality:answers.nationality||null,residence:answers.residence||null,preferred_language:language,status,last_draft_saved_at:now,updated_at:now});if(candidate.error)throw candidate.error;const intake=await supabase.from("candidate_intakes").upsert({candidate_id:user.id,answers,updated_at:now},{onConflict:"candidate_id"});if(intake.error)throw intake.error}
export async function saveCandidateLanguage(language:Language){const workspace=await getCandidateWorkspace();await saveCandidateDraft(workspace.answers,language)}

async function invokeDocumentFunction<T>(body:Record<string,unknown>):Promise<T>{const result=await supabase.functions.invoke("candidate-documents",{body});if(result.error)throw result.error;if(result.data?.error)throw new Error(result.data.error);return result.data as T}

export async function uploadCandidateDocument(documentType:string,file:File):Promise<CandidateDocument>{await requireCandidateUser();if(file.size>10*1024*1024)throw new Error("FILE_TOO_LARGE");if(!["application/pdf","image/jpeg","image/png"].includes(file.type))throw new Error("INVALID_FILE_TYPE");const signed=await invokeDocumentFunction<{key:string;uploadUrl:string;headers:Record<string,string>}>({action:"create-upload",documentType,fileName:file.name,mimeType:file.type,fileSize:file.size});const uploaded=await fetch(signed.uploadUrl,{method:"PUT",headers:signed.headers,body:file});if(!uploaded.ok)throw new Error("R2_UPLOAD_FAILED");const finalized=await invokeDocumentFunction<{document:CandidateDocument}>({action:"finalize-upload",key:signed.key,documentType,fileName:file.name,mimeType:file.type,fileSize:file.size});return finalized.document}
export async function deleteCandidateDocument(document:CandidateDocument){if(document.storage_provider==="r2"){await invokeDocumentFunction({action:"delete",documentId:document.id});return}const removed=await supabase.storage.from("candidate-documents").remove([document.storage_path]);if(removed.error)throw removed.error;const deleted=await supabase.from("candidate_documents").delete().eq("id",document.id);if(deleted.error)throw deleted.error}
export async function replaceCandidateDocument(document:CandidateDocument,file:File){const replacement=await uploadCandidateDocument(document.document_type,file);await deleteCandidateDocument(document);return replacement}
export async function getCandidateDocumentUrl(document:CandidateDocument,download=false){if(document.storage_provider==="r2"){const result=await invokeDocumentFunction<{url:string}>({action:"download",documentId:document.id,download});return result.url}const result=await supabase.storage.from("candidate-documents").createSignedUrl(document.storage_path,300,{download:download?document.file_name:undefined});if(result.error)throw result.error;return result.data.signedUrl}
export async function saveJobPreferences(preferences:JobPreferences){const user=await requireCandidateUser();const result=await supabase.from("candidate_job_preferences").upsert({candidate_id:user.id,...preferences,updated_at:new Date().toISOString()},{onConflict:"candidate_id"});if(result.error)throw result.error}
export async function submitCandidateIntake({answers,documentFiles,language}:{answers:Record<string,string>;documentFiles:Record<string,File>;language:Language}){await saveCandidateDraft(answers,language);const user=await requireCandidateUser();for(const [type,file] of Object.entries(documentFiles))await uploadCandidateDocument(type,file);const reference=`MB-${new Date().getFullYear()}-${user.id.slice(0,8).toUpperCase()}`;const now=new Date().toISOString();const candidate=await supabase.from("candidates").update({status:"submitted",reference_number:reference,submitted_at:now,updated_at:now}).eq("id",user.id);if(candidate.error)throw candidate.error;const intake=await supabase.from("candidate_intakes").update({consent_at:now,updated_at:now}).eq("candidate_id",user.id);if(intake.error)throw intake.error;return reference}
export async function getCandidateAvatarUrl(path:string|null){if(!path)return"";const result=await supabase.storage.from("candidate-avatars").createSignedUrl(path,3600);if(result.error)throw result.error;return result.data.signedUrl}
export async function uploadCandidateAvatar(file:File){const user=await requireCandidateUser();if(file.size>5*1024*1024)throw new Error("FILE_TOO_LARGE");if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("INVALID_FILE_TYPE");const current=await supabase.from("candidates").select("avatar_path").eq("id",user.id).maybeSingle();const extension=file.name.split(".").pop()?.toLowerCase()||"jpg";const path=`${user.id}/avatar-${crypto.randomUUID()}.${extension}`;const upload=await supabase.storage.from("candidate-avatars").upload(path,file,{upsert:false});if(upload.error)throw upload.error;const update=await supabase.from("candidates").update({avatar_path:path,updated_at:new Date().toISOString()}).eq("id",user.id);if(update.error){await supabase.storage.from("candidate-avatars").remove([path]);throw update.error}if(current.data?.avatar_path)await supabase.storage.from("candidate-avatars").remove([current.data.avatar_path]);return{path,url:await getCandidateAvatarUrl(path)}}
export async function deleteCandidateAvatar(path:string|null){const user=await requireCandidateUser();if(path){const removed=await supabase.storage.from("candidate-avatars").remove([path]);if(removed.error)throw removed.error}const update=await supabase.from("candidates").update({avatar_path:null,updated_at:new Date().toISOString()}).eq("id",user.id);if(update.error)throw update.error}
