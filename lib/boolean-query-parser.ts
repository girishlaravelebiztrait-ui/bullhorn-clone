/**
 * Boolean search parser.
 *
 * Translates simple, user-friendly boolean syntax from the search box into an
 * Elasticsearch query. Supports:
 *   - AND / OR / NOT (case-insensitive)
 *   - quoted "exact phrases"
 *   - parentheses for grouping
 *   - implicit AND between adjacent terms
 *
 * We lean on ES's `query_string` query, which natively understands this syntax,
 * but we first *sanitize and normalize* the user input so that:
 *   - the human words AND/OR/NOT become the operators && / || / !
 *   - reserved characters that would otherwise throw are escaped
 *   - unbalanced quotes/parens don't cause a 400
 *
 * If, after normalization, the string still fails to parse in ES, callers should
 * fall back to a plain multi_match (see buildTextQuery). This module only builds
 * the query_string body; it does not execute anything.
 */

const DEFAULT_FIELDS = [
  "firstName^2",
  "lastName^2",
  "fullName^3",
  "currentEmployer",
  "currentTitle^2",
  "skills^2",
  "tags",
  "notes",
  "resumeText",
  "email",
];

// ES query_string reserved chars we escape when they appear as literals.
// We deliberately keep ()"  and the boolean words meaningful, so they are NOT
// escaped here. Everything else that ES treats specially is escaped.
const RESERVED = /[+\-=&|><!{}\[\]^~*?:\\/]/g;

/** Escape a raw term (used for phrase contents and stray tokens). */
function escapeTerm(term: string): string {
  return term.replace(RESERVED, (m) => `\\${m}`);
}

/**
 * Normalize human boolean syntax into ES query_string operator syntax while
 * escaping stray reserved characters inside bare words.
 */
export function normalizeBooleanQuery(input: string): string {
  const raw = input.trim();
  if (!raw) return "";

  const tokens: string[] = [];
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];

    // Preserve quoted phrases verbatim (escape reserved chars inside them).
    if (ch === '"') {
      const end = raw.indexOf('"', i + 1);
      if (end === -1) {
        // Unbalanced quote: treat the rest as a phrase and close it.
        const phrase = raw.slice(i + 1);
        tokens.push(`"${escapeTerm(phrase)}"`);
        break;
      }
      const phrase = raw.slice(i + 1, end);
      tokens.push(`"${escapeTerm(phrase)}"`);
      i = end + 1;
      continue;
    }

    // Preserve grouping parens.
    if (ch === "(" || ch === ")") {
      tokens.push(ch);
      i += 1;
      continue;
    }

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Read a bare word (until whitespace, quote, or paren).
    let j = i;
    while (j < raw.length && !/[\s"()]/.test(raw[j])) j += 1;
    const word = raw.slice(i, j);
    i = j;

    const upper = word.toUpperCase();
    if (upper === "AND") {
      tokens.push("AND");
    } else if (upper === "OR") {
      tokens.push("OR");
    } else if (upper === "NOT") {
      tokens.push("NOT");
    } else {
      tokens.push(escapeTerm(word));
    }
  }

  // Balance parentheses defensively.
  let open = 0;
  for (const t of tokens) {
    if (t === "(") open += 1;
    else if (t === ")") open = Math.max(0, open - 1);
  }
  while (open > 0) {
    tokens.push(")");
    open -= 1;
  }

  return tokens.join(" ").trim();
}

/**
 * Build the ES query for a free-text search string. Returns a query_string
 * clause when the user typed boolean syntax, otherwise a simpler query_string
 * with AND default operator works for plain terms too.
 */
export function buildTextQuery(input: string): Record<string, unknown> {
  const normalized = normalizeBooleanQuery(input);
  if (!normalized) {
    return { match_all: {} };
  }

  return {
    query_string: {
      query: normalized,
      fields: DEFAULT_FIELDS,
      default_operator: "AND",
      // Be forgiving: don't 400 on odd input, and allow leading wildcards off
      // for performance.
      lenient: true,
      allow_leading_wildcard: false,
      type: "best_fields",
    },
  };
}

/** Fallback query if query_string is rejected: plain multi_match. */
export function buildFallbackTextQuery(input: string): Record<string, unknown> {
  const q = input.trim();
  if (!q) return { match_all: {} };
  return {
    multi_match: {
      query: q,
      fields: DEFAULT_FIELDS,
      operator: "and",
      fuzziness: "AUTO",
    },
  };
}
