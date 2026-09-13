import {
  adminClient,
  e2eEnvironment,
  ensureTestUser,
  findUserByEmail,
  removeCandidateDocuments,
  sprint7JobReference,
  sprint7JobTitle,
} from "./support";

export default async function globalSetup() {
  const environment = e2eEnvironment();
  const client = adminClient(environment);
  const transient = await findUserByEmail(client, environment.E2E_REGISTRATION_EMAIL);
  if (transient) {
    const deleted = await client.auth.admin.deleteUser(transient.id);
    if (deleted.error) throw deleted.error;
  }
  const candidate = await ensureTestUser(client, environment.E2E_CANDIDATE_EMAIL, environment.E2E_CANDIDATE_PASSWORD);
  const staff = await ensureTestUser(client, environment.E2E_STAFF_EMAIL, environment.E2E_STAFF_PASSWORD);

  await removeCandidateDocuments(client, candidate.id, environment.E2E_CANDIDATE_EMAIL, environment.E2E_CANDIDATE_PASSWORD);

  const avatarObjects = await client.storage.from("candidate-avatars").list(candidate.id);
  if (avatarObjects.error) throw avatarObjects.error;
  if (avatarObjects.data.length) {
    const removed = await client.storage.from("candidate-avatars").remove(
      avatarObjects.data.map((object) => `${candidate.id}/${object.name}`),
    );
    if (removed.error) throw removed.error;
  }

  for (const table of [
    "candidate_saved_jobs",
    "candidate_applications",
    "candidate_job_interests",
    "candidate_notifications",
    "candidate_interviews",
    "candidate_device_tokens",
    "pilot_feedback",
    "data_subject_requests",
    "consent_events",
    "candidate_internal_notes",
    "candidate_emails",
    "candidate_status_history",
    "candidate_job_preferences",
    "candidate_intakes",
    "candidates",
  ]) {
    const result = await client.from(table).delete().eq("candidate_id", candidate.id);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
  }

  const staffMembership = await client.from("backoffice_users").upsert({
    user_id: staff.id,
    display_name: "Sprint 7 Reviewer",
    role: "admin",
  });
  if (staffMembership.error) throw staffMembership.error;

  const previousJobs = await client.from("jobs").select("id").eq("employer_reference", sprint7JobReference);
  if (previousJobs.error) throw previousJobs.error;
  if (previousJobs.data.length) {
    const ids = previousJobs.data.map((job) => job.id);
    for (const table of ["candidate_saved_jobs", "candidate_applications", "candidate_job_interests"]) {
      const removed = await client.from(table).delete().in("job_id", ids);
      if (removed.error) throw removed.error;
    }
    const removedJobs = await client.from("jobs").delete().in("id", ids);
    if (removedJobs.error) throw removedJobs.error;
  }

  const job = await client.from("jobs").insert({
    title: sprint7JobTitle,
    region: "Nordrhein-Westfalen",
    employment_type: "full_time",
    salary_text: "3.500–4.100 € / Monat",
    german_level: "Deutsch B2",
    description: "Anonymisierte E2E-Stelle für die Sprint-7-Abnahme.",
    support_text: "MediBridge begleitet Anerkennung, Einreise und Integration.",
    employer_reference: sprint7JobReference,
    status: "published",
    published_at: new Date().toISOString(),
    created_by: staff.id,
  }).select("id").single();
  if (job.error) throw job.error;

  const template = await client.from("email_templates").upsert({
    key: "sprint7-e2e",
    label: "Sprint 7 Abnahme",
    subject: "MediBridge Sprint 7 E2E",
    body: "Hallo {{name}}, dies ist die automatisierte Sprint-7-Abnahme.",
    updated_by: staff.id,
  }, { onConflict: "key" });
  if (template.error) throw template.error;
}
