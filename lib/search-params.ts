import type { SearchParams } from "./candidate-search";

/** Parse a URLSearchParams / plain record into a typed SearchParams. */
export function parseSearchParams(
  sp: URLSearchParams | Record<string, string | string[] | undefined>
): SearchParams {
  const get = (key: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const getAll = (key: string): string[] => {
    if (sp instanceof URLSearchParams) return sp.getAll(key);
    const v = sp[key];
    if (v === undefined) return [];
    return Array.isArray(v) ? v : [v];
  };

  // Multi-value facets accept either repeated params or comma-separated values.
  const multi = (key: string): string[] => {
    const all = getAll(key).flatMap((v) => v.split(",")).map((v) => v.trim());
    return all.filter(Boolean);
  };

  const num = (key: string): number | undefined => {
    const v = get(key);
    if (v === undefined || v === "") return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const sortRaw = get("sort");
  const sort: SearchParams["sort"] =
    sortRaw === "newest" ||
    sortRaw === "oldest" ||
    sortRaw === "name_asc" ||
    sortRaw === "name_desc" ||
    sortRaw === "relevance"
      ? sortRaw
      : "relevance";

  return {
    q: get("q"),
    skills: multi("skills"),
    tags: multi("tags"),
    status: multi("status"),
    source: multi("source"),
    city: multi("city"),
    minExperience: num("minExperience"),
    maxExperience: num("maxExperience"),
    createdFrom: get("createdFrom"),
    createdTo: get("createdTo"),
    sort,
    page: num("page") ?? 1,
    pageSize: num("pageSize") ?? 20,
  };
}
