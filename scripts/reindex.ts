import "./load-env";
import { prisma } from "../lib/prisma";
import { esIsUp } from "../lib/elasticsearch";
import { recreateCandidatesIndex } from "../lib/es-index";
import { bulkIndexCandidates } from "../lib/candidate-service";

// Fully rebuild the `candidates` ES index from MySQL.
// Use for recovery or after a mapping/schema change.
async function main() {
  if (!(await esIsUp())) {
    throw new Error(
      "Elasticsearch is not reachable at " +
        (process.env.ELASTICSEARCH_URL ?? "http://localhost:9200")
    );
  }

  console.log("Dropping and recreating the `candidates` index...");
  await recreateCandidatesIndex();

  const batchSize = 500;
  let cursor: string | undefined;
  let total = 0;

  // Cursor-paginate through all candidates to avoid loading everything at once.
  for (;;) {
    const batch = await prisma.candidate.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;

    await bulkIndexCandidates(batch);
    total += batch.length;
    cursor = batch[batch.length - 1].id;
    console.log(`  indexed ${total}...`);

    if (batch.length < batchSize) break;
  }

  console.log(`✓ Reindex complete. ${total} candidate(s) indexed.`);
}

main()
  .catch((err) => {
    console.error("Reindex failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
