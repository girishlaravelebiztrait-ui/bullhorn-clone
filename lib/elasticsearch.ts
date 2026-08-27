import { Client } from "@elastic/elasticsearch";

// Single shared ES client, reused across hot reloads in dev.
const globalForEs = globalThis as unknown as {
  esClient: Client | undefined;
};

function createClient(): Client {
  const node = process.env.ELASTICSEARCH_URL ?? "http://localhost:9200";
  const username = process.env.ELASTICSEARCH_USERNAME;
  const password = process.env.ELASTICSEARCH_PASSWORD;

  return new Client({
    node,
    auth: username && password ? { username, password } : undefined,
    // Keep requests snappy; the app must not hang when ES is slow/down.
    requestTimeout: 10_000,
    maxRetries: 2,
  });
}

export const esClient = globalForEs.esClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForEs.esClient = esClient;
}

export const CANDIDATES_INDEX = "candidates";

/** Returns true if ES is reachable. Never throws. */
export async function esIsUp(): Promise<boolean> {
  try {
    await esClient.ping();
    return true;
  } catch {
    return false;
  }
}
