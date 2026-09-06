export type CvLanguage="en"|"de"|"ar";
export type CvAnswers=Record<string,string|undefined>;

type CvRow={label:string;value:string};
type CvSection={title:string;rows:CvRow[]};

const cvCopy={
  en:{document:"Curriculum vitae",personal:"Personal details",goal:"Professional goal",education:"Education and recognition",experience:"Professional experience",languages:"Language skills",mobility:"Mobility and readiness",generated:"Created with MediBridge Careers on",
    fullName:"Name",birthDate:"Date of birth",birthPlace:"Place of birth",nationality:"Nationality",residence:"Place of residence",phone:"Phone",email:"Email",
    targetRole:"Desired position",start:"Possible start",facility:"Preferred workplace",
    qualification:"Highest qualification",school:"School / university",graduation:"Graduation year",recognition:"Recognition status in Germany",
    years:"Years of experience",areas:"Main clinical areas",current:"Current situation",
    german:"German level",certificate:"German certificate",otherLanguages:"Other languages",
    passport:"Passport",visa:"Visa / residence status",relocation:"Willing to relocate"},
  de:{document:"Lebenslauf",personal:"Persönliche Daten",goal:"Berufliches Ziel",education:"Ausbildung und Anerkennung",experience:"Berufserfahrung",languages:"Sprachkenntnisse",mobility:"Mobilität und Bereitschaft",generated:"Erstellt mit MediBridge Careers am",
    fullName:"Name",birthDate:"Geburtsdatum",birthPlace:"Geburtsort",nationality:"Staatsangehörigkeit",residence:"Wohnort",phone:"Telefon",email:"E-Mail",
    targetRole:"Gewünschte Position",start:"Möglicher Start",facility:"Bevorzugter Arbeitgeber",
    qualification:"Höchster Abschluss",school:"Schule / Hochschule",graduation:"Abschlussjahr",recognition:"Anerkennungsstand in Deutschland",
    years:"Jahre Berufserfahrung",areas:"Wichtigste Einsatzbereiche",current:"Aktuelle Situation",
    german:"Deutschniveau",certificate:"Deutsches Sprachzertifikat",otherLanguages:"Weitere Sprachen",
    passport:"Reisepass",visa:"Visum- / Aufenthaltsstatus",relocation:"Umzugsbereitschaft"},
  ar:{document:"السيرة الذاتية",personal:"البيانات الشخصية",goal:"الهدف المهني",education:"التعليم والمعادلة",experience:"الخبرة المهنية",languages:"المهارات اللغوية",mobility:"الاستعداد للانتقال",generated:"أُنشئت عبر MediBridge Careers بتاريخ",
    fullName:"الاسم",birthDate:"تاريخ الميلاد",birthPlace:"مكان الميلاد",nationality:"الجنسية",residence:"مكان الإقامة",phone:"الهاتف",email:"البريد الإلكتروني",
    targetRole:"الوظيفة المطلوبة",start:"موعد البدء الممكن",facility:"مكان العمل المفضل",
    qualification:"أعلى مؤهل",school:"المعهد / الجامعة",graduation:"سنة التخرج",recognition:"وضع المعادلة في ألمانيا",
    years:"سنوات الخبرة",areas:"مجالات العمل الأساسية",current:"الوضع الحالي",
    german:"مستوى الألمانية",certificate:"شهادة اللغة الألمانية",otherLanguages:"لغات أخرى",
    passport:"جواز السفر",visa:"وضع التأشيرة / الإقامة",relocation:"الاستعداد للانتقال"}
} as const;

type CvSectionKey="personal"|"goal"|"education"|"experience"|"languages"|"mobility";
type CvFieldKey=Exclude<keyof typeof cvCopy["de"],CvSectionKey|"document"|"generated">;

const dateFields=new Set<CvFieldKey>(["birthDate"]);

const sectionFields:{key:CvSectionKey;fields:CvFieldKey[]}[]=[
  {key:"personal",fields:["birthDate","birthPlace","nationality","residence","phone","email"]},
  {key:"goal",fields:["targetRole","start","facility"]},
  {key:"education",fields:["qualification","school","graduation","recognition"]},
  {key:"experience",fields:["years","areas","current"]},
  {key:"languages",fields:["german","certificate","otherLanguages"]},
  {key:"mobility",fields:["passport","visa","relocation"]}
];

/** Applies profile values without discarding completed intake answers with empty profile fields. */
export function mergeCvAnswers(answers:CvAnswers,profileValues:CvAnswers):CvAnswers{
  const merged={...answers};
  for(const [field,value] of Object.entries(profileValues)){
    if(value?.trim())merged[field]=value;
  }
  return merged;
}

export function escapeHtml(value:string){
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

/** Formats an ISO `YYYY-MM-DD` value for the given language; other values are returned trimmed. */
export function formatCvDate(value:string,language:CvLanguage){
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if(!match)return value.trim();
  const [,year,month,day]=match;
  return language==="en"?`${day}/${month}/${year}`:`${day}.${month}.${year}`;
}

function localIsoDate(date:Date){
  const month=`${date.getMonth()+1}`.padStart(2,"0");
  const day=`${date.getDate()}`.padStart(2,"0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Builds the CV sections, skipping every question the candidate has not answered yet. */
export function buildCurriculumVitaeSections(answers:CvAnswers,language:CvLanguage):CvSection[]{
  const labels=cvCopy[language];
  const sections:CvSection[]=[];
  for(const section of sectionFields){
    const rows:CvRow[]=[];
    for(const field of section.fields){
      const raw=(answers[field]??"").trim();
      if(!raw)continue;
      rows.push({label:labels[field],value:dateFields.has(field)?formatCvDate(raw,language):raw});
    }
    if(rows.length)sections.push({title:labels[section.key],rows});
  }
  return sections;
}

/**
 * Derives a safe download file name from the candidate name. Names written in a
 * non-Latin script (for example Arabic) cannot be transliterated here, so the
 * generation date is used instead of the name.
 */
export function curriculumVitaeFileName(answers:CvAnswers,generatedAt=new Date()){
  const slug=(answers.fullName??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();
  return `lebenslauf-${slug||localIsoDate(generatedAt)}.html`;
}

/** Renders a printable German-style CV document; all candidate values are HTML escaped. */
export function buildCurriculumVitaeHtml(answers:CvAnswers,language:CvLanguage,generatedAt=new Date()){
  const labels=cvCopy[language];
  const rtl=language==="ar";
  const name=(answers.fullName??"").trim();
  const headline=(answers.targetRole??"").trim();
  const sections=buildCurriculumVitaeSections(answers,language);
  const created=`${labels.generated} ${formatCvDate(localIsoDate(generatedAt),language)}`;
  const body=sections.map(section=>`      <section>
        <h2>${escapeHtml(section.title)}</h2>
        <dl>
${section.rows.map(row=>`          <div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join("\n")}
        </dl>
      </section>`).join("\n");
  return `<!doctype html>
<html lang="${language}" dir="${rtl?"rtl":"ltr"}">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${escapeHtml(name?`${labels.document} – ${name}`:labels.document)}</title>
    <style>
      *{box-sizing:border-box}
      body{margin:0;padding:32px;font-family:"Segoe UI",Arial,sans-serif;color:#12212f;background:#f5f7fa}
      main{max-width:760px;margin:0 auto;background:#fff;padding:40px;border-radius:12px;box-shadow:0 12px 32px rgba(18,33,47,.08)}
      header{border-bottom:2px solid #0f6f8c;padding-bottom:16px;margin-bottom:24px}
      h1{margin:0;font-size:28px}
      header p{margin:6px 0 0;color:#4a5b6b;font-size:16px}
      h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:#0f6f8c;margin:24px 0 8px}
      dl{margin:0;display:grid;gap:6px}
      dl div{display:grid;grid-template-columns:220px 1fr;gap:12px;align-items:start}
      dt{color:#4a5b6b}
      dd{margin:0;font-weight:600;white-space:pre-line}
      footer{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8ef;color:#6b7a89;font-size:13px}
      @media print{body{background:#fff;padding:0}main{box-shadow:none;padding:0;max-width:none}}
      @media (max-width:640px){dl div{grid-template-columns:1fr}}
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(name||labels.document)}</h1>
        ${headline?`<p>${escapeHtml(headline)}</p>`:""}
      </header>
${body}
      <footer>${escapeHtml(created)}</footer>
    </main>
  </body>
</html>
`;
}
