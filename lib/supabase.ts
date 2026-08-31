import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://idzahhvslobjywqyklml.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_b5Sy7_MiCapOrVFS5JysAw_PNiISL6L";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

async function ensureCandidateSession() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("Candidate session could not be created.");
  return data.user;
}

type IntakeSubmission = {
  answers: Record<string, string>;
  documentFiles: Record<string, File>;
  language: "en" | "de" | "ar";
};

export async function submitCandidateIntake({ answers, documentFiles, language }: IntakeSubmission) {
  const user = await ensureCandidateSession();
  const candidate = {
    id: user.id,
    full_name: answers.fullName,
    email: answers.email,
    phone: answers.phone,
    nationality: answers.nationality,
    residence: answers.residence,
    preferred_language: language,
    status: "submitted",
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: candidateError } = await supabase.from("candidates").upsert(candidate);
  if (candidateError) throw candidateError;

  const { error: intakeError } = await supabase.from("candidate_intakes").upsert({
    candidate_id: user.id,
    answers,
    consent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "candidate_id" });
  if (intakeError) throw intakeError;

  for (const [documentType, file] of Object.entries(documentFiles)) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = `${user.id}/${documentType}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("candidate-documents").upload(storagePath, file, { upsert: false });
    if (uploadError) throw uploadError;
    const { error: metadataError } = await supabase.from("candidate_documents").insert({
      candidate_id: user.id,
      document_type: documentType,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size: file.size,
      verification_status: "pending",
    });
    if (metadataError) throw metadataError;
  }

  return user.id;
}
