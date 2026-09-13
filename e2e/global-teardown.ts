import { adminClient, e2eEnvironment, findUserByEmail } from "./support";

export default async function globalTeardown() {
  const environment = e2eEnvironment();
  const client = adminClient(environment);
  const candidate = await findUserByEmail(client, environment.E2E_CANDIDATE_EMAIL);
  if (!candidate) return;

  // Keep the two seeded Auth users for stable CI identities, but remove any
  // one-off registration account created by the authentication test.
  const transient = await findUserByEmail(client, environment.E2E_REGISTRATION_EMAIL);
  if (transient) await client.auth.admin.deleteUser(transient.id);
}
