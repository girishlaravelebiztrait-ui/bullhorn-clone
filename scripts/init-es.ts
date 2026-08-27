import "./load-env";
import { ensureCandidatesIndex } from "../lib/es-index";
import { esIsUp } from "../lib/elasticsearch";

// Create the `candidates` index (idempotent). Run after `docker compose up`.
async function main() {
  if (!(await esIsUp())) {
    throw new Error(
      "Elasticsearch is not reachable at " +
        (process.env.ELASTICSEARCH_URL ?? "http://localhost:9200")
    );
  }
  const created = await ensureCandidatesIndex();
  console.log(
    created ? "✓ Created `candidates` index" : "✓ `candidates` index already exists"
  );
}

main().catch((err) => {
  console.error("init-es failed:", err);
  process.exit(1);
});
