import "./load-env";
import { faker } from "@faker-js/faker";
import type { Prisma, Candidate } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { esIsUp } from "../lib/elasticsearch";
import { ensureCandidatesIndex } from "../lib/es-index";
import { bulkIndexCandidates } from "../lib/candidate-service";

/**
 * Seed a large batch of realistic, varied dummy candidates for testing the
 * list, search, filters, and Elasticsearch queries.
 *
 * Re-run safety: generation is deterministic (fixed faker seed), and inserts
 * use `skipDuplicates`. With WIPE_EXISTING=true, the exact set of generated
 * emails is deleted first, so re-running is idempotent regardless of each
 * record's (intentionally varied) `source` value.
 *
 * Nothing here touches the Prisma schema or the ES mapping — it reuses the
 * existing bulk-index logic in lib/candidate-service.ts.
 */

// ---- Configuration (bump these without touching the logic below) ----
const TOTAL_CANDIDATES = 500;
const BATCH_SIZE = 50;
const FAKER_SEED = 20260827; // fixed => reproducible dataset across runs
const WIPE_EXISTING = true; // delete this run's generated emails before inserting

// ---- Reference data ----

const CANDIDATE_STATUSES = ["Active", "Placed", "Do Not Contact", "Blacklisted"] as const;
const CANDIDATE_SOURCES = ["Seed", "Manual", "Import"] as const;

const TAG_POOL = [
  "Remote OK",
  "Urgent",
  "Top Candidate",
  "Needs Follow-up",
  "Visa Sponsorship",
  "Relocating",
  "Passive",
  "Referral",
];

const EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "hotmail.com",
  "icloud.com",
  "protonmail.com",
  // a few "custom company" style domains
  "workmail.co",
  "careers.io",
  "talentbox.net",
];

const COUNTRIES = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "India",
  "Singapore",
  "Ireland",
  "Netherlands",
  "Spain",
  "Brazil",
  "United Arab Emirates",
];

// Industry -> matching titles + skills, so skills always fit the role.
const INDUSTRIES = [
  {
    key: "Software / IT",
    titles: [
      "Frontend Developer",
      "Backend Developer",
      "Full Stack Engineer",
      "DevOps Engineer",
      "Data Scientist",
      "Machine Learning Engineer",
      "QA Automation Engineer",
      "Mobile Developer",
      "Site Reliability Engineer",
      "Engineering Manager",
      "Solutions Architect",
    ],
    skills: [
      "JavaScript", "TypeScript", "React", "Node.js", "Python", "AWS", "Docker",
      "Kubernetes", "GraphQL", "PostgreSQL", "CI/CD", "Go", "Terraform",
      "REST APIs", "Redis", "System Design", "Microservices",
    ],
  },
  {
    key: "Sales & Marketing",
    titles: [
      "Account Executive",
      "Sales Development Representative",
      "SEO Specialist",
      "Content Marketer",
      "Marketing Manager",
      "Growth Marketer",
      "Brand Manager",
      "Social Media Manager",
      "Demand Generation Manager",
    ],
    skills: [
      "Salesforce", "HubSpot", "SEO", "Google Analytics", "Content Strategy",
      "Copywriting", "Email Marketing", "PPC", "CRM", "Lead Generation",
      "A/B Testing", "Marketo", "Cold Outreach", "Negotiation",
    ],
  },
  {
    key: "Healthcare",
    titles: [
      "Registered Nurse",
      "Medical Assistant",
      "Physical Therapist",
      "Pharmacist",
      "Radiologic Technologist",
      "Nurse Practitioner",
      "Phlebotomist",
      "Healthcare Administrator",
      "Licensed Practical Nurse",
    ],
    skills: [
      "Patient Care", "Phlebotomy", "EMR/EHR", "Vital Signs",
      "Medication Administration", "CPR/BLS", "Wound Care", "HIPAA Compliance",
      "Triage", "IV Therapy", "Clinical Documentation", "Patient Education",
    ],
  },
  {
    key: "Finance & Accounting",
    titles: [
      "Financial Analyst",
      "Staff Accountant",
      "Bookkeeper",
      "Controller",
      "Internal Auditor",
      "Investment Analyst",
      "Tax Specialist",
      "Payroll Specialist",
      "Finance Manager",
    ],
    skills: [
      "Financial Modeling", "QuickBooks", "Excel", "GAAP", "Accounts Payable",
      "Accounts Receivable", "Budgeting", "Forecasting", "SAP", "Auditing",
      "Tax Preparation", "Reconciliation", "Variance Analysis",
    ],
  },
  {
    key: "Skilled Trades",
    titles: [
      "Electrician",
      "HVAC Technician",
      "Plumber",
      "Welder",
      "Carpenter",
      "CNC Machinist",
      "Maintenance Technician",
      "Automotive Mechanic",
      "Facilities Technician",
    ],
    skills: [
      "Electrical Wiring", "HVAC Repair", "Plumbing", "MIG/TIG Welding",
      "Blueprint Reading", "Preventive Maintenance", "OSHA Safety",
      "Troubleshooting", "Power Tools", "Refrigeration", "Hydraulics",
    ],
  },
  {
    key: "Admin & Operations",
    titles: [
      "Executive Assistant",
      "Operations Manager",
      "Office Manager",
      "Administrative Coordinator",
      "Project Coordinator",
      "Customer Success Manager",
      "Supply Chain Analyst",
      "Logistics Coordinator",
    ],
    skills: [
      "Scheduling", "Microsoft Office", "Project Management", "Data Entry",
      "Vendor Management", "Process Improvement", "Customer Service",
      "Inventory Management", "Calendar Management", "Jira", "Stakeholder Communication",
    ],
  },
];

// ---- Helpers ----

/** Weighted pick: items paired with relative weights. */
function weightedPick<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = faker.number.float({ min: 0, max: total });
  for (const [item, w] of entries) {
    if (r < w) return item;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

/** Varied phone formats. */
function randomPhone(): string {
  const style = faker.number.int({ min: 0, max: 3 });
  const d = (n: number) => faker.string.numeric(n);
  switch (style) {
    case 0:
      return `(${d(3)}) ${d(3)}-${d(4)}`;
    case 1:
      return `+1-${d(3)}-${d(3)}-${d(4)}`;
    case 2:
      return `${d(3)}.${d(3)}.${d(4)}`;
    default:
      return `+${d(2)} ${d(4)} ${d(6)}`;
  }
}

/** Weighted experience years — more juniors/mids than 20+ veterans. */
function randomExperience(): number {
  const [min, max] = weightedPick<[number, number]>([
    [[0, 2], 22],
    [[3, 5], 30],
    [[6, 10], 25],
    [[11, 15], 13],
    [[16, 20], 7],
    [[21, 30], 3],
  ]);
  return faker.number.int({ min, max });
}

/** Fake-but-plausible resume text mentioning the role and skills. */
function buildResumeText(
  firstName: string,
  lastName: string,
  title: string,
  employer: string,
  skills: string[],
  years: number
): string {
  const intro = `${firstName} ${lastName}\n${title}\n\n`;
  const summary = `Summary\n${firstName} is a ${title.toLowerCase()} with ${years}+ years of experience, currently at ${employer}. ${faker.lorem.sentence()} ${faker.lorem.sentence()}\n\n`;
  const skillsBlock = `Core Skills\n${skills.join(" • ")}\n\n`;
  const exp = `Experience\n${title} — ${employer}\n${faker.lorem.sentences(2)}\n${faker.lorem.sentences(2)}\n\n`;
  const edu = `Education\n${faker.helpers.arrayElement([
    "B.S.",
    "B.A.",
    "Associate Degree",
    "Certification",
  ])} — ${faker.company.name()} Institute\n`;
  return intro + summary + skillsBlock + exp + edu;
}

function buildNote(title: string): string {
  const templates = [
    `Strong ${title.toLowerCase()} — ${faker.lorem.sentence()}`,
    `Reached out on ${faker.date.recent({ days: 60 }).toLocaleDateString()}. ${faker.lorem.sentence()}`,
    `Referred by ${faker.person.firstName()}. ${faker.lorem.sentence()}`,
    `Open to relocation. ${faker.lorem.sentence()}`,
    `Salary expectation discussed. ${faker.lorem.sentence()}`,
  ];
  return faker.helpers.arrayElement(templates);
}

// ---- Build one candidate record ----

function buildCandidate(usedEmails: Set<string>): Prisma.CandidateCreateManyInput {
  const industry = faker.helpers.arrayElement(INDUSTRIES);
  const title = faker.helpers.arrayElement(industry.titles);
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  // Unique, name-derived email across a mix of domains.
  const domain = faker.helpers.arrayElement(EMAIL_DOMAINS);
  const base = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, "");
  let local = base;
  let n = 1;
  while (usedEmails.has(`${local}@${domain}`)) {
    local = `${base}${n++}`;
  }
  const email = `${local}@${domain}`;
  usedEmails.add(email);

  const skills = faker.helpers.arrayElements(
    industry.skills,
    faker.number.int({ min: 3, max: 8 })
  );
  const tags = faker.helpers.arrayElements(TAG_POOL, faker.number.int({ min: 0, max: 3 }));

  const status = weightedPick<(typeof CANDIDATE_STATUSES)[number]>([
    ["Active", 60],
    ["Placed", 16],
    ["Do Not Contact", 14],
    ["Blacklisted", 10],
  ]);
  const source = weightedPick<(typeof CANDIDATE_SOURCES)[number]>([
    ["Seed", 50],
    ["Manual", 25],
    ["Import", 25],
  ]);

  // Some optional fields intentionally left null to test missing-data handling.
  const employer = faker.datatype.boolean(0.92) ? faker.company.name() : null;
  const phone = faker.datatype.boolean(0.9) ? randomPhone() : null;
  const experienceYears = faker.datatype.boolean(0.92) ? randomExperience() : null;

  const hasLocation = faker.datatype.boolean(0.9);
  const country = hasLocation ? faker.helpers.arrayElement(COUNTRIES) : null;
  const city = hasLocation ? faker.location.city() : null;
  const state = hasLocation && faker.datatype.boolean(0.7) ? faker.location.state() : null;

  const notes = faker.datatype.boolean(0.4) ? buildNote(title) : null;

  const resumeText =
    faker.datatype.boolean(0.2) && employer
      ? buildResumeText(firstName, lastName, title, employer, skills, experienceYears ?? 5)
      : null;

  const createdAt = faker.date.past({ years: 1 });

  return {
    firstName,
    lastName,
    email,
    phone,
    currentEmployer: employer,
    currentTitle: faker.datatype.boolean(0.95) ? title : null,
    city,
    state,
    country,
    skills: skills as Prisma.InputJsonValue,
    tags: tags as Prisma.InputJsonValue,
    experienceYears,
    source,
    status,
    notes,
    resumeUrl: null,
    resumeText,
    createdAt,
  };
}

// ---- Main ----

async function main() {
  const start = Date.now();
  faker.seed(FAKER_SEED);

  console.log(`Generating ${TOTAL_CANDIDATES} candidate records…`);
  const usedEmails = new Set<string>();
  const records: Prisma.CandidateCreateManyInput[] = [];
  for (let i = 0; i < TOTAL_CANDIDATES; i++) {
    records.push(buildCandidate(usedEmails));
  }

  if (WIPE_EXISTING) {
    const emails = records.map((r) => r.email as string);
    // Delete in chunks to avoid an oversized IN() clause.
    let removed = 0;
    for (let i = 0; i < emails.length; i += 500) {
      const chunk = emails.slice(i, i + 500);
      const res = await prisma.candidate.deleteMany({ where: { email: { in: chunk } } });
      removed += res.count;
    }
    if (removed) console.log(`Cleared ${removed} previously-seeded record(s).`);
  }

  // Insert in batches.
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const res = await prisma.candidate.createMany({ data: batch, skipDuplicates: true });
    inserted += res.count;
    process.stdout.write(`  inserted ${inserted}/${records.length}\r`);
  }
  console.log(`\nInserted ${inserted} candidate(s) into MySQL.`);

  // Bulk index into Elasticsearch (reusing existing bulk logic).
  if (await esIsUp()) {
    await ensureCandidatesIndex();
    const emails = records.map((r) => r.email as string);
    let indexed = 0;
    for (let i = 0; i < emails.length; i += 500) {
      const chunk = emails.slice(i, i + 500);
      const rows: Candidate[] = await prisma.candidate.findMany({
        where: { email: { in: chunk } },
      });
      await bulkIndexCandidates(rows);
      indexed += rows.length;
      process.stdout.write(`  indexed ${indexed}/${emails.length}\r`);
    }
    console.log(`\nIndexed ${indexed} candidate(s) into Elasticsearch.`);
  } else {
    console.warn(
      "\n⚠ Elasticsearch is not reachable — skipped indexing. Run `npm run reindex` once it's up."
    );
  }

  // Summary.
  const [byStatus, bySource] = await Promise.all([
    prisma.candidate.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.candidate.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log("\n──────── Seed summary ────────");
  console.log(`Total created:      ${inserted}`);
  console.log("By status:");
  for (const s of byStatus.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${s.status.padEnd(16)} ${s._count._all}`);
  }
  console.log("By source:");
  for (const s of bySource.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`   ${s.source.padEnd(16)} ${s._count._all}`);
  }
  console.log(`Time taken:         ${elapsed}s`);
  console.log("──────────────────────────────");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
