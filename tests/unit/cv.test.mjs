import assert from "node:assert/strict";
import test from "node:test";

import { createTestContext } from "./test-utils.mjs";

async function loadCv(t) {
  const ctx = await createTestContext();
  t.after(() => ctx.close());
  return ctx.load("/lib/cv.ts");
}

const answers = {
  fullName: "Amira Ben Salah",
  birthDate: "1996-04-17",
  birthPlace: "Rabat, Marokko",
  nationality: "marokkanisch",
  residence: "Rabat, Marokko",
  phone: "+212 600 000 000",
  email: "amira@example.com",
  targetRole: "Pflegefachkraft",
  qualification: "Diplom Krankenpflege",
  german: "B1",
  areas: "",
};

test("buildCurriculumVitaeSections keeps only answered fields", async (t) => {
  const { buildCurriculumVitaeSections } = await loadCv(t);
  const sections = buildCurriculumVitaeSections(answers, "de");

  assert.deepEqual(
    sections.map((section) => section.title),
    ["Persönliche Daten", "Berufliches Ziel", "Ausbildung und Anerkennung", "Sprachkenntnisse"],
  );
  assert.deepEqual(sections[0].rows[0], { label: "Geburtsdatum", value: "17.04.1996" });
  assert.deepEqual(sections[0].rows[1], { label: "Geburtsort", value: "Rabat, Marokko" });
  assert.ok(!sections.some((section) => section.rows.some((row) => row.value === "")));
});

test("buildCurriculumVitaeHtml renders a German CV document", async (t) => {
  const { buildCurriculumVitaeHtml } = await loadCv(t);
  const html = buildCurriculumVitaeHtml(answers, "de", new Date(2026, 8, 6, 12, 0, 0));

  assert.match(html, /<html lang="de" dir="ltr">/);
  assert.match(html, /<title>Lebenslauf – Amira Ben Salah<\/title>/);
  assert.match(html, /<h1>Amira Ben Salah<\/h1>/);
  assert.match(html, /Erstellt mit MediBridge Careers am 06\.09\.2026/);
});

test("buildCurriculumVitaeHtml escapes candidate provided values", async (t) => {
  const { buildCurriculumVitaeHtml } = await loadCv(t);
  const html = buildCurriculumVitaeHtml(
    { ...answers, fullName: '<img src=x onerror="alert(1)">' },
    "de",
  );

  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("buildCurriculumVitaeHtml switches direction and labels for Arabic", async (t) => {
  const { buildCurriculumVitaeHtml } = await loadCv(t);
  const html = buildCurriculumVitaeHtml(answers, "ar");

  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /البيانات الشخصية/);
});

test("curriculumVitaeFileName builds a safe slug", async (t) => {
  const { curriculumVitaeFileName } = await loadCv(t);

  assert.equal(curriculumVitaeFileName(answers), "lebenslauf-amira-ben-salah.html");
  assert.equal(curriculumVitaeFileName({ fullName: "Jürgen Müller" }), "lebenslauf-jurgen-muller.html");
  assert.equal(
    curriculumVitaeFileName({ fullName: "  ../ " }, new Date(2026, 8, 6)),
    "lebenslauf-2026-09-06.html",
  );
  assert.match(curriculumVitaeFileName({}), /^lebenslauf-\d{4}-\d{2}-\d{2}\.html$/);
});

test("curriculumVitaeMissingFields identifies the minimum CV data", async (t) => {
  const { curriculumVitaeMissingFields } = await loadCv(t);

  assert.deepEqual(curriculumVitaeMissingFields({}), ["fullName", "birthDate", "targetRole"]);
  assert.deepEqual(
    curriculumVitaeMissingFields({ fullName: "Amira Ben Salah", birthDate: "1996-04-17", targetRole: "Pflegefachkraft" }),
    [],
  );
});
