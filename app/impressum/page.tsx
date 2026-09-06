import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "../privacy/privacy.css";

export default function Impressum() {
  return <main className="privacy-page"><header><Link href="/"><ArrowLeft/>Zur App</Link><img src="/medibridge-logo.svg" alt="MediBridge"/></header><article><p className="eyebrow">RECHTLICHE INFORMATIONEN</p><h1>Impressum</h1><h2>Anbieter</h2><p>MediBridge Maghreb<br/>Elsdorf bei Köln<br/>Deutschland</p><h2>Kontakt</h2><p>E-Mail: <a href="mailto:hi.sersar@gmail.com">hi.sersar@gmail.com</a></p><h2>Verantwortlich für den Inhalt</h2><p>MediBridge Maghreb, Elsdorf bei Köln.</p><p>Die Angaben werden vor dem produktiven Betrieb um die vollständige ladungsfähige Anschrift und – sofern erforderlich – Register- und Umsatzsteuerangaben ergänzt.</p><nav className="legal-links"><Link href="/privacy">Datenschutz</Link><Link href="/nutzungsbedingungen">Nutzungsbedingungen</Link></nav></article></main>;
}
