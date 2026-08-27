import { esClient, CANDIDATES_INDEX } from "./elasticsearch";

// Mapping for the `candidates` index.
// - Analyzed text: firstName, lastName, currentEmployer, currentTitle, resumeText, notes
//   Each analyzed field also gets a `.keyword` sub-field for exact sort/aggregation.
// - Keyword arrays for facet filtering: skills, tags
// - Keyword scalars: status, source
// - Proper types for experienceYears / dates
// - `name` completion field powers the typeahead suggester.
export const candidatesMapping = {
  properties: {
    firstName: { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } },
    lastName: { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } },
    fullName: { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } },
    email: { type: "keyword" },
    phone: { type: "keyword" },
    currentEmployer: { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } },
    currentTitle: { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } },
    city: { type: "keyword" },
    state: { type: "keyword" },
    country: { type: "keyword" },
    location: { type: "text", fields: { keyword: { type: "keyword", ignore_above: 256 } } },
    skills: { type: "keyword" },
    tags: { type: "keyword" },
    experienceYears: { type: "integer" },
    source: { type: "keyword" },
    status: { type: "keyword" },
    notes: { type: "text" },
    resumeText: { type: "text" },
    createdAt: { type: "date" },
    updatedAt: { type: "date" },
    // Completion suggester input for typeahead (names + skills).
    suggest: { type: "completion" },
  },
} as const;

const indexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    analyzer: {
      default: { type: "standard" },
    },
  },
};

/**
 * Create the candidates index with mapping if it does not exist.
 * Idempotent. Returns whether it created a new index.
 */
export async function ensureCandidatesIndex(): Promise<boolean> {
  const exists = await esClient.indices.exists({ index: CANDIDATES_INDEX });
  if (exists) return false;

  await esClient.indices.create({
    index: CANDIDATES_INDEX,
    settings: indexSettings as any,
    mappings: candidatesMapping as any,
  });
  return true;
}

/** Drop and recreate the index. Used by the reindex script. */
export async function recreateCandidatesIndex(): Promise<void> {
  const exists = await esClient.indices.exists({ index: CANDIDATES_INDEX });
  if (exists) {
    await esClient.indices.delete({ index: CANDIDATES_INDEX });
  }
  await esClient.indices.create({
    index: CANDIDATES_INDEX,
    settings: indexSettings as any,
    mappings: candidatesMapping as any,
  });
}
