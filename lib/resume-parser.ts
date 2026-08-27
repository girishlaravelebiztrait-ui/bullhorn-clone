import mammoth from "mammoth";

/**
 * Local, heuristic resume parsing for phase 1 — no paid APIs.
 *
 * Pipeline:
 *   1. Extract raw text from PDF / DOCX / plain text.
 *   2. Run regex/keyword heuristics to suggest: email, phone, name, skills,
 *      years of experience.
 *
 * Everything here is best-effort and non-authoritative — the UI presents the
 * results as *suggestions* the admin can accept or override.
 */

export interface ParsedResume {
  text: string;
  suggested: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    skills: string[];
    experienceYears?: number;
  };
}

// A pragmatic skills dictionary. Extend freely; matching is case-insensitive,
// word-boundary aware. Kept local so phase 1 needs no external service.
const SKILL_DICTIONARY = [
  "JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "C", "Go", "Golang",
  "Ruby", "PHP", "Swift", "Kotlin", "Rust", "Scala", "Perl", "R", "MATLAB",
  "React", "React Native", "Next.js", "Vue", "Angular", "Svelte", "Node.js",
  "Express", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", ".NET",
  "Rails", "Laravel", "Redux", "GraphQL", "REST", "gRPC",
  "HTML", "CSS", "Sass", "Tailwind", "Bootstrap",
  "MySQL", "PostgreSQL", "MongoDB", "Redis", "Elasticsearch", "SQLite",
  "Oracle", "SQL Server", "DynamoDB", "Cassandra", "Kafka", "RabbitMQ",
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "Terraform",
  "Ansible", "Jenkins", "CircleCI", "GitHub Actions", "GitLab CI",
  "Git", "Linux", "Bash", "PowerShell",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas",
  "NumPy", "scikit-learn", "NLP", "Computer Vision",
  "Agile", "Scrum", "Jira", "Salesforce", "SAP", "Tableau", "Power BI",
  "Figma", "Photoshop", "Excel",
  "Project Management", "Product Management", "Data Analysis",
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// Reasonably permissive international-ish phone matcher.
const PHONE_RE =
  /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{3,4}([\s.-]?\d{2,4})?/;
const YEARS_RE = /(\d{1,2})\+?\s*(?:years|yrs)\b[^.\n]*\bexperience\b/i;
const YEARS_RE_ALT = /\bexperience\b[^.\n]*?(\d{1,2})\+?\s*(?:years|yrs)\b/i;

/** Extract raw text from a resume file buffer, dispatching on file type. */
export async function extractResumeText(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<string> {
  const lower = fileName.toLowerCase();
  const isPdf = lower.endsWith(".pdf") || mimeType === "application/pdf";
  const isDocx =
    lower.endsWith(".docx") ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isDoc = lower.endsWith(".doc") || mimeType === "application/msword";

  if (isPdf) {
    // pdf-parse ships CommonJS with a debug harness that runs on import of the
    // package index; import the library entry directly to avoid it.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
      b: Buffer
    ) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text || "";
  }

  if (isDocx || isDoc) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  // Fallback: treat as UTF-8 text (covers .txt).
  return buffer.toString("utf8");
}

function extractSkills(text: string): string[] {
  const found = new Set<string>();
  for (const skill of SKILL_DICTIONARY) {
    // Escape regex metacharacters in the skill token (e.g. C++, C#, .NET).
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, "i");
    if (re.test(text)) found.add(skill);
  }
  return Array.from(found);
}

function extractName(text: string, email?: string): { firstName?: string; lastName?: string } {
  // Heuristic 1: the first non-empty line that looks like a person's name
  // (2-3 capitalized words, no digits/@).
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const line of lines) {
    if (line.length > 60) continue;
    if (/[@\d]/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    const looksLikeName = words.every((w) => /^[A-Z][a-zA-Z'.-]+$/.test(w));
    if (looksLikeName) {
      return { firstName: words[0], lastName: words[words.length - 1] };
    }
  }

  // Heuristic 2: derive from the email local-part (e.g. john.doe@...).
  if (email) {
    const local = email.split("@")[0];
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      return { firstName: cap(parts[0]), lastName: cap(parts[1]) };
    }
  }

  return {};
}

/** Run all heuristics against already-extracted text. */
export function extractFields(text: string): ParsedResume["suggested"] {
  const email = text.match(EMAIL_RE)?.[0];
  const phoneMatch = text.match(PHONE_RE)?.[0]?.trim();
  // Guard against matching things that are clearly too short to be a phone.
  const phone =
    phoneMatch && phoneMatch.replace(/\D/g, "").length >= 7 ? phoneMatch : undefined;

  const { firstName, lastName } = extractName(text, email);
  const skills = extractSkills(text);

  const yearsMatch = text.match(YEARS_RE) || text.match(YEARS_RE_ALT);
  const experienceYears = yearsMatch ? parseInt(yearsMatch[1], 10) : undefined;

  return { firstName, lastName, email, phone, skills, experienceYears };
}

/** Full parse: extract text + suggested fields from a file buffer. */
export async function parseResume(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<ParsedResume> {
  const text = await extractResumeText(buffer, fileName, mimeType);
  return { text, suggested: extractFields(text) };
}
