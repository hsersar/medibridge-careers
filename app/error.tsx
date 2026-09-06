"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/supabase";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { void reportClientError(error, window.location.pathname); }, [error]);
  return <main className="welcome-shell"><section className="welcome-card"><h1>Etwas ist schiefgelaufen.</h1><p>Bitte versuche es erneut.</p><button className="primary-button" onClick={reset}>Erneut versuchen</button></section></main>;
}
