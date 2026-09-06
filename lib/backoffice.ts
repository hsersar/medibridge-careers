import { supabase, type CandidateDocument, type CandidateStatus } from "./supabase";

export type BackofficeCandidate={id:string;full_name:string|null;email:string|null;phone:string|null;nationality:string|null;residence:string|null;preferred_language:"en"|"de"|"ar";status:CandidateStatus;reference_number:string|null;submitted_at:string|null;created_at:string;answers:Record<string,string>;documents:CandidateDocument[]};
export type CandidateListPage={rows:BackofficeCandidate[];total:number};
export type InternalNote={id:string;note:string;created_at:string;author_id:string};
export type EmailLog={id:string;recipient:string;subject:string;body:string;status:string;created_at:string;sent_at:string|null};
export type StatusHistoryEntry={id:string;previous_status:CandidateStatus|null;new_status:CandidateStatus;note:string|null;created_at:string};
export type BackofficeMembership={display_name:string;role:string};
export type BackofficeUser={user_id:string;display_name:string;role:string;created_at:string};
export type BackofficeInterest={id:string;job_id:string;candidate_id:string;status:string;created_at:string};
export type EmailTemplate={id:string;key:string;label:string;subject:string;body:string;updated_at:string};
export type AuditLogEntry={id:string;actor_id:string|null;action:string;entity_type:string;entity_id:string|null;metadata:Record<string,unknown>;created_at:string};
export type PrivacyRequest={id:string;candidate_id:string;request_type:string;status:string;created_at:string;completed_at:string|null};

export async function signInBackoffice(email:string,password:string){const result=await supabase.auth.signInWithPassword({email,password});if(result.error)throw result.error;const membership=await supabase.from("backoffice_users").select("display_name,role").eq("user_id",result.data.user.id).maybeSingle();if(membership.error||!membership.data){await supabase.auth.signOut();throw new Error("NOT_STAFF")}return membership.data}
export async function getBackofficeSession(){const session=await supabase.auth.getSession();if(!session.data.session?.user||session.data.session.user.is_anonymous)return null;const membership=await supabase.from("backoffice_users").select("display_name,role").eq("user_id",session.data.session.user.id).maybeSingle();return membership.data?{user:session.data.session.user,...membership.data}:null}
export async function signOutBackoffice(){await supabase.auth.signOut()}

const candidateColumns="id,full_name,email,phone,nationality,residence,preferred_language,status,reference_number,submitted_at,created_at";

export async function listBackofficeCandidates(options:{query?:string;status?:string;page?:number;pageSize?:number}={}):Promise<CandidateListPage>{
  const page=Math.max(1,options.page??1);
  const pageSize=Math.max(1,options.pageSize??20);
  const from=(page-1)*pageSize;
  const to=from+pageSize-1;
  let request=supabase.from("candidates").select(candidateColumns,{count:"exact"}).order("created_at",{ascending:false});
  if(options.status&&options.status!=="all")request=request.eq("status",options.status);
  const trimmed=(options.query??"").trim();
  if(trimmed){
    const like=`%${trimmed.replace(/[%_,()]/g,"")}%`;
    request=request.or(`full_name.ilike.${like},email.ilike.${like},reference_number.ilike.${like},residence.ilike.${like}`);
  }
  const candidates=await request.range(from,to);
  if(candidates.error)throw candidates.error;
  const ids=(candidates.data??[]).map(x=>x.id);
  if(ids.length===0)return{rows:[],total:candidates.count??0};
  const [intakes,documents]=await Promise.all([supabase.from("candidate_intakes").select("candidate_id,answers").in("candidate_id",ids),supabase.from("candidate_documents").select("id,candidate_id,document_type,file_name,storage_path,storage_provider,storage_bucket,mime_type,file_size,verification_status,verification_note,created_at,updated_at").in("candidate_id",ids)]);
  if(intakes.error)throw intakes.error;
  if(documents.error)throw documents.error;
  const rows=(candidates.data??[]).map(candidate=>({...candidate,answers:(intakes.data?.find(x=>x.candidate_id===candidate.id)?.answers??{}) as Record<string,string>,documents:(documents.data??[]).filter(x=>x.candidate_id===candidate.id) as CandidateDocument[]})) as BackofficeCandidate[];
  return{rows,total:candidates.count??rows.length};
}

export async function countCandidatesByStatus(status:string):Promise<number>{
  const result=await supabase.from("candidates").select("id",{count:"exact",head:true}).eq("status",status);
  if(result.error)throw result.error;
  return result.count??0;
}

export async function updateCandidateProfile(candidateId:string,patch:{full_name?:string|null;phone?:string|null;nationality?:string|null;residence?:string|null;preferred_language?:"en"|"de"|"ar"},answers?:Record<string,string>){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error("UNAUTHENTICATED");
  const updated=await supabase.from("candidates").update({...patch,updated_at:new Date().toISOString()}).eq("id",candidateId);
  if(updated.error)throw updated.error;
  if(answers){
    const intake=await supabase.from("candidate_intakes").update({answers,updated_at:new Date().toISOString()}).eq("candidate_id",candidateId);
    if(intake.error)throw intake.error;
  }
  await logAuditEvent("candidate.profile_updated","candidates",candidateId,{fields:Object.keys(patch)});
}

export async function getCandidateActivity(candidateId:string){const [notes,emails,history]=await Promise.all([supabase.from("candidate_internal_notes").select("id,note,created_at,author_id").eq("candidate_id",candidateId).order("created_at",{ascending:false}),supabase.from("candidate_emails").select("id,recipient,subject,body,status,created_at,sent_at").eq("candidate_id",candidateId).order("created_at",{ascending:false}),supabase.from("candidate_status_history").select("id,previous_status,new_status,note,created_at").eq("candidate_id",candidateId).order("created_at",{ascending:false})]);for(const result of [notes,emails,history])if(result.error)throw result.error;return{notes:(notes.data??[]) as InternalNote[],emails:(emails.data??[]) as EmailLog[],history:(history.data??[]) as StatusHistoryEntry[]}}
export async function addInternalNote(candidateId:string,note:string){const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error("UNAUTHENTICATED");const result=await supabase.from("candidate_internal_notes").insert({candidate_id:candidateId,author_id:user.id,note}).select("id,note,created_at,author_id").single();if(result.error)throw result.error;await logAuditEvent("candidate.note_added","candidates",candidateId,{});return result.data as InternalNote}

export async function updateCandidateStatus(candidateId:string,previousStatus:CandidateStatus,newStatus:CandidateStatus,note:string){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error("UNAUTHENTICATED");
  const result=await supabase.rpc("update_candidate_status",{candidate_id:candidateId,new_status:newStatus,note:note||null});
  if(result.error)throw result.error;
}

export async function listCandidateInterests(candidateId:string){const result=await supabase.from("candidate_job_interests").select("id,job_id,candidate_id,status,created_at").eq("candidate_id",candidateId).order("created_at",{ascending:false});if(result.error)throw result.error;return(result.data??[]) as BackofficeInterest[]}
export async function updateCandidateInterest(id:string,status:string){const result=await supabase.from("candidate_job_interests").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(result.error)throw result.error;await logAuditEvent("candidate_interest.updated","candidate_job_interests",id,{status})}
export async function createCandidateInterest(candidateId:string,jobId:string){const result=await supabase.from("candidate_job_interests").insert({candidate_id:candidateId,job_id:jobId,status:"expressed"}).select("id,job_id,candidate_id,status,created_at").single();if(result.error)throw result.error;await logAuditEvent("candidate_interest.created","candidate_job_interests",result.data.id,{job_id:jobId});return result.data as BackofficeInterest}
export async function removeCandidateInterest(id:string){const result=await supabase.from("candidate_job_interests").delete().eq("id",id);if(result.error)throw result.error;await logAuditEvent("candidate_interest.removed","candidate_job_interests",id,{})}

export async function reviewCandidateDocument(documentId:string,status:"pending"|"verified"|"rejected",note:string){const result=await supabase.from("candidate_documents").update({verification_status:status,verification_note:note||null,updated_at:new Date().toISOString()}).eq("id",documentId);if(result.error)throw result.error;await logAuditEvent("candidate_document.reviewed","candidate_documents",documentId,{status})}

export class EmailDeliveryError extends Error{email:EmailLog;constructor(message:string,email:EmailLog){super(message);this.name="EmailDeliveryError";this.email=email}}

export async function prepareCandidateEmail(candidateId:string,recipient:string,subject:string,body:string){
  const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error("UNAUTHENTICATED");
  const result=await supabase.from("candidate_emails").insert({candidate_id:candidateId,created_by:user.id,recipient,subject,body,status:"prepared"}).select("id,recipient,subject,body,status,created_at,sent_at").single();
  if(result.error)throw result.error;
  const created=result.data as EmailLog;
  try{
    const sent=await supabase.functions.invoke<{email:EmailLog;error?:string}>("send-candidate-email",{body:{emailId:created.id}});
    if(sent.error)throw sent.error;
    if(sent.data?.error)throw new Error(sent.data.error);
    await logAuditEvent("candidate_email.sent","candidate_emails",created.id,{recipient});
    return(sent.data?.email??created) as EmailLog;
  }catch(deliveryError){
    await logAuditEvent("candidate_email.failed","candidate_emails",created.id,{recipient,error:String(deliveryError)});
    const failed=await supabase.from("candidate_emails").select("id,recipient,subject,body,status,created_at,sent_at").eq("id",created.id).single();
    throw new EmailDeliveryError("EMAIL_DELIVERY_FAILED",(failed.data??created) as EmailLog);
  }
}

export async function listEmailTemplates(){const result=await supabase.from("email_templates").select("id,key,label,subject,body,updated_at").order("label");if(result.error)throw result.error;return(result.data??[]) as EmailTemplate[]}
export async function saveEmailTemplate(template:{id?:string;key:string;label:string;subject:string;body:string}){const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error("UNAUTHENTICATED");const payload={...template,updated_by:user.id,updated_at:new Date().toISOString()};const result=template.id?await supabase.from("email_templates").update(payload).eq("id",template.id).select("id,key,label,subject,body,updated_at").single():await supabase.from("email_templates").insert(payload).select("id,key,label,subject,body,updated_at").single();if(result.error)throw result.error;await logAuditEvent("email_template.saved","email_templates",result.data.id,{key:template.key});return result.data as EmailTemplate}

export type CommunicationEntry=EmailLog&{candidate_id:string;candidates:{full_name:string|null}[]|{full_name:string|null}|null};
export async function listAllCommunications(options:{page?:number;pageSize?:number}={}){const page=Math.max(1,options.page??1);const pageSize=Math.max(1,options.pageSize??25);const from=(page-1)*pageSize;const to=from+pageSize-1;const result=await supabase.from("candidate_emails").select("id,candidate_id,recipient,subject,body,status,created_at,sent_at,candidates(full_name)",{count:"exact"}).order("created_at",{ascending:false}).range(from,to);if(result.error)throw result.error;return{rows:(result.data??[]) as unknown as CommunicationEntry[],total:result.count??0}}

export async function listBackofficeUsers(){const result=await supabase.from("backoffice_users").select("user_id,display_name,role,created_at").order("display_name");if(result.error)throw result.error;return(result.data??[]) as BackofficeUser[]}
export async function setBackofficeUserRole(email:string,role:"admin"|"reviewer",displayName?:string){const result=await supabase.rpc("admin_set_backoffice_role",{target_email:email,target_role:role,target_display_name:displayName||null});if(result.error)throw result.error;return result.data as BackofficeUser}
export async function removeBackofficeUser(userId:string){const result=await supabase.rpc("admin_remove_backoffice_user",{target_user_id:userId});if(result.error)throw result.error}

export async function listPrivacyRequests(options:{status?:string}={}){let request=supabase.from("data_subject_requests").select("id,candidate_id,request_type,status,created_at,completed_at").order("created_at",{ascending:false});if(options.status&&options.status!=="all")request=request.eq("status",options.status);const result=await request;if(result.error)throw result.error;return(result.data??[]) as PrivacyRequest[]}
export async function updatePrivacyRequestStatus(id:string,status:"received"|"processing"|"completed"|"rejected"){const patch:Record<string,unknown>={status};if(status==="completed")patch.completed_at=new Date().toISOString();const result=await supabase.from("data_subject_requests").update(patch).eq("id",id);if(result.error)throw result.error;await logAuditEvent("privacy_request.updated","data_subject_requests",id,{status})}

export async function listAuditLogs(options:{page?:number;pageSize?:number}={}){const page=Math.max(1,options.page??1);const pageSize=Math.max(1,options.pageSize??50);const from=(page-1)*pageSize;const to=from+pageSize-1;const result=await supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,metadata,created_at",{count:"exact"}).order("created_at",{ascending:false}).range(from,to);if(result.error)throw result.error;return{rows:(result.data??[]) as AuditLogEntry[],total:result.count??0}}
export async function logAuditEvent(action:string,entityType:string,entityId:string,metadata:Record<string,unknown>){const user=(await supabase.auth.getUser()).data.user;if(!user)return;await supabase.from("audit_logs").insert({actor_id:user.id,action,entity_type:entityType,entity_id:entityId,metadata})}
