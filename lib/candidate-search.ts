import { esClient, CANDIDATES_INDEX, esIsUp } from "./elasticsearch";
import { buildTextQuery, buildFallbackTextQuery } from "./boolean-query-parser";
import { prisma } from "./prisma";
import { toCandidateView, type CandidateView } from "./candidate";

export interface SearchParams {
  q?: string;
  skills?: string[];
  tags?: string[];
  status?: string[];
  source?: string[];
  city?: string[];
  minExperience?: number;
  maxExperience?: number;
  createdFrom?: string; // ISO date
  createdTo?: string; // ISO date
  sort?: "relevance" | "newest" | "oldest" | "name_asc" | "name_desc";
  page?: number;
  pageSize?: number;
}

export interface FacetBucket {
  key: string;
  count: number;
}

export interface SearchResult {
  hits: CandidateView[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    skills: FacetBucket[];
    tags: FacetBucket[];
    status: FacetBucket[];
    source: FacetBucket[];
    city: FacetBucket[];
  };
  usedFallback: boolean;
}

function buildFilters(params: SearchParams): Record<string, unknown>[] {
  const filters: Record<string, unknown>[] = [];

  if (params.skills?.length) filters.push({ terms: { skills: params.skills } });
  if (params.tags?.length) filters.push({ terms: { tags: params.tags } });
  if (params.status?.length) filters.push({ terms: { status: params.status } });
  if (params.source?.length) filters.push({ terms: { source: params.source } });
  if (params.city?.length) filters.push({ terms: { city: params.city } });

  if (params.minExperience != null || params.maxExperience != null) {
    const range: Record<string, number> = {};
    if (params.minExperience != null) range.gte = params.minExperience;
    if (params.maxExperience != null) range.lte = params.maxExperience;
    filters.push({ range: { experienceYears: range } });
  }

  if (params.createdFrom || params.createdTo) {
    const range: Record<string, string> = {};
    if (params.createdFrom) range.gte = params.createdFrom;
    if (params.createdTo) range.lte = params.createdTo;
    filters.push({ range: { createdAt: range } });
  }

  return filters;
}

function buildSort(sort: SearchParams["sort"], hasQuery: boolean): unknown[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }];
    case "oldest":
      return [{ createdAt: "asc" }];
    case "name_asc":
      return [{ "lastName.keyword": "asc" }, { "firstName.keyword": "asc" }];
    case "name_desc":
      return [{ "lastName.keyword": "desc" }, { "firstName.keyword": "desc" }];
    case "relevance":
    default:
      // Relevance when there's a query; otherwise newest first.
      return hasQuery ? ["_score", { createdAt: "desc" }] : [{ createdAt: "desc" }];
  }
}

/** Execute a search against Elasticsearch, with a MySQL fallback if ES is down. */
export async function searchCandidates(params: SearchParams): Promise<SearchResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const hasQuery = Boolean(params.q && params.q.trim());

  const up = await esIsUp();
  if (!up) {
    return mysqlFallback(params, page, pageSize);
  }

  const filters = buildFilters(params);

  let textQuery: Record<string, unknown>;
  try {
    textQuery = buildTextQuery(params.q ?? "");
  } catch {
    textQuery = buildFallbackTextQuery(params.q ?? "");
  }

  const body = {
    query: {
      bool: {
        must: [textQuery],
        filter: filters,
      },
    },
    sort: buildSort(params.sort, hasQuery),
    from,
    size: pageSize,
    aggs: {
      skills: { terms: { field: "skills", size: 50 } },
      tags: { terms: { field: "tags", size: 50 } },
      status: { terms: { field: "status", size: 10 } },
      source: { terms: { field: "source", size: 10 } },
      city: { terms: { field: "city", size: 50 } },
    },
    track_total_hits: true,
  };

  try {
    const resp = await esClient.search({ index: CANDIDATES_INDEX, ...(body as any) });
    return parseEsResponse(resp, page, pageSize);
  } catch (err) {
    // query_string may reject genuinely malformed input; retry with fallback.
    try {
      const retryBody = {
        ...body,
        query: { bool: { must: [buildFallbackTextQuery(params.q ?? "")], filter: filters } },
      };
      const resp = await esClient.search({ index: CANDIDATES_INDEX, ...(retryBody as any) });
      return parseEsResponse(resp, page, pageSize);
    } catch (err2) {
      console.error("[ES] search failed, falling back to MySQL:", err2);
      return mysqlFallback(params, page, pageSize);
    }
  }
}

function parseEsResponse(resp: any, page: number, pageSize: number): SearchResult {
  const total =
    typeof resp.hits.total === "number" ? resp.hits.total : resp.hits.total?.value ?? 0;

  const hits: CandidateView[] = resp.hits.hits.map((h: any) => {
    const s = h._source;
    return {
      id: h._id,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      phone: s.phone ?? null,
      currentEmployer: s.currentEmployer ?? null,
      currentTitle: s.currentTitle ?? null,
      city: s.city ?? null,
      state: s.state ?? null,
      country: s.country ?? null,
      skills: s.skills ?? [],
      tags: s.tags ?? [],
      experienceYears: s.experienceYears ?? null,
      source: s.source,
      status: s.status,
      notes: s.notes ?? null,
      resumeUrl: null,
      resumeText: null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });

  const buckets = (agg: any): FacetBucket[] =>
    (agg?.buckets ?? []).map((b: any) => ({ key: String(b.key), count: b.doc_count }));

  return {
    hits,
    total,
    page,
    pageSize,
    facets: {
      skills: buckets(resp.aggregations?.skills),
      tags: buckets(resp.aggregations?.tags),
      status: buckets(resp.aggregations?.status),
      source: buckets(resp.aggregations?.source),
      city: buckets(resp.aggregations?.city),
    },
    usedFallback: false,
  };
}

/**
 * Degraded MySQL search used only when ES is unreachable. Supports plain text
 * matching + the structured filters, but not boolean syntax or relevance.
 */
async function mysqlFallback(
  params: SearchParams,
  page: number,
  pageSize: number
): Promise<SearchResult> {
  const where: Record<string, unknown> = {};
  const and: unknown[] = [];

  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    and.push({
      OR: [
        { firstName: { contains: q } },
        { lastName: { contains: q } },
        { email: { contains: q } },
        { currentEmployer: { contains: q } },
        { currentTitle: { contains: q } },
        { resumeText: { contains: q } },
      ],
    });
  }
  if (params.status?.length) and.push({ status: { in: params.status } });
  if (params.source?.length) and.push({ source: { in: params.source } });
  if (params.city?.length) and.push({ city: { in: params.city } });
  if (params.minExperience != null || params.maxExperience != null) {
    const gte = params.minExperience ?? undefined;
    const lte = params.maxExperience ?? undefined;
    and.push({ experienceYears: { gte, lte } });
  }
  if (params.createdFrom || params.createdTo) {
    and.push({
      createdAt: {
        gte: params.createdFrom ? new Date(params.createdFrom) : undefined,
        lte: params.createdTo ? new Date(params.createdTo) : undefined,
      },
    });
  }
  if (and.length) where.AND = and;

  const orderBy =
    params.sort === "name_asc"
      ? [{ lastName: "asc" as const }, { firstName: "asc" as const }]
      : params.sort === "name_desc"
      ? [{ lastName: "desc" as const }, { firstName: "desc" as const }]
      : params.sort === "oldest"
      ? [{ createdAt: "asc" as const }]
      : [{ createdAt: "desc" as const }];

  const [total, rows] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    hits: rows.map(toCandidateView),
    total,
    page,
    pageSize,
    // Facets can't be computed cheaply here; return empty and let the UI note
    // it's in degraded mode.
    facets: { skills: [], tags: [], status: [], source: [], city: [] },
    usedFallback: true,
  };
}

/** Typeahead suggestions via the completion suggester. Best effort. */
export async function suggestCandidates(prefix: string): Promise<string[]> {
  if (!prefix.trim()) return [];
  try {
    const resp: any = await esClient.search({
      index: CANDIDATES_INDEX,
      suggest: {
        candidate_suggest: {
          prefix,
          completion: { field: "suggest", size: 8, skip_duplicates: true },
        },
      } as any,
      _source: false,
    });
    const options = resp.suggest?.candidate_suggest?.[0]?.options ?? [];
    return options.map((o: any) => o.text as string);
  } catch (err) {
    console.error("[ES] suggest failed:", err);
    return [];
  }
}

/** Fetch ALL candidate IDs matching the current search (for export). */
export async function searchAllIds(params: SearchParams): Promise<string[]> {
  const up = await esIsUp();
  if (!up) {
    // Fallback: pull IDs from MySQL applying structured filters.
    const result = await mysqlFallback({ ...params, page: 1, pageSize: 10000 }, 1, 10000);
    return result.hits.map((h) => h.id);
  }

  const filters = buildFilters(params);
  let textQuery: Record<string, unknown>;
  try {
    textQuery = buildTextQuery(params.q ?? "");
  } catch {
    textQuery = buildFallbackTextQuery(params.q ?? "");
  }

  const ids: string[] = [];
  const resp: any = await esClient.search({
    index: CANDIDATES_INDEX,
    query: { bool: { must: [textQuery], filter: filters } },
    sort: buildSort(params.sort, Boolean(params.q?.trim())) as any,
    size: 10000,
    _source: false,
  });
  for (const h of resp.hits.hits) ids.push(h._id);
  return ids;
}
