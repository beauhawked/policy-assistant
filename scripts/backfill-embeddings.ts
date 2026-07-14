import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

async function main(): Promise<void> {
  // Imported after env load so the db/openai modules see the credentials.
  const { getEmbeddingCoverage, isVectorSearchAvailable } = await import(
    "../src/lib/policy-assistant/db"
  );
  const { getEmbeddingModel, isEmbeddingsEnabled } = await import(
    "../src/lib/policy-assistant/embeddings"
  );
  const { indexHandbookChunkEmbeddings, indexPolicyEmbeddings } = await import(
    "../src/lib/policy-assistant/embedding-indexer"
  );

  console.log("Policy to Action — embedding backfill");
  console.log("=====================================");

  if (!isEmbeddingsEnabled()) {
    console.log(
      "Embeddings are disabled (POLICY_ASSISTANT_EMBEDDINGS_DISABLED=1). Nothing to do.",
    );
    process.exit(0);
  }

  const vectorReady = await isVectorSearchAvailable();
  if (!vectorReady) {
    console.error(
      "The pgvector extension could not be enabled on this database. " +
        "On Neon this normally works automatically; check the database logs.",
    );
    process.exit(1);
  }

  const before = await getEmbeddingCoverage();
  console.log(`Embedding model: ${getEmbeddingModel()}`);
  console.log(
    `Before: policies ${before.policiesEmbedded}/${before.policiesTotal} embedded, ` +
      `handbook chunks ${before.handbookChunksEmbedded}/${before.handbookChunksTotal} embedded`,
  );

  const policyCount = await indexPolicyEmbeddings({
    onProgress: (count) => console.log(`  policies embedded so far: ${count}`),
  });
  const chunkCount = await indexHandbookChunkEmbeddings({
    onProgress: (count) => console.log(`  handbook chunks embedded so far: ${count}`),
  });

  const after = await getEmbeddingCoverage();
  console.log(`Newly embedded: ${policyCount} policies, ${chunkCount} handbook chunks`);
  console.log(
    `After: policies ${after.policiesEmbedded}/${after.policiesTotal} embedded, ` +
      `handbook chunks ${after.handbookChunksEmbedded}/${after.handbookChunksTotal} embedded`,
  );

  if (
    after.policiesEmbedded === after.policiesTotal &&
    after.handbookChunksEmbedded === after.handbookChunksTotal
  ) {
    console.log("Backfill complete. Semantic retrieval is ready.");
  } else {
    console.log(
      "Some rows are still missing embeddings. Re-run this script to continue; " +
        "it always resumes where it left off.",
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
