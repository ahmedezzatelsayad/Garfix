import { cacheSet, cacheGet, cacheInvalidate, cacheStats } from "../src/lib/cache";
import { subscribe, publish, CHANNELS } from "../src/lib/pubSub";
import { enqueue, registerWorker, QUEUE_NAMES } from "../src/lib/queues";

async function main() {
  console.log("=== Cache Test ===");
  await cacheSet("test:key", { value: 42 }, 60);
  const hit = await cacheGet<{ value: number }>("test:key");
  console.log("Cache hit:", hit?.value === 42 ? "✓" : "✗");
  await cacheInvalidate("test:key");
  const miss = await cacheGet("test:key");
  console.log("Cache invalidated:", miss === null ? "✓" : "✗");

  console.log("\n=== Pub/Sub Test ===");
  let received = false;
  subscribe(CHANNELS.SETTINGS_UPDATED, () => { received = true; });
  await publish(CHANNELS.SETTINGS_UPDATED, { key: "test" });
  await new Promise((r) => setTimeout(r, 50));
  console.log("Pub/sub delivers:", received ? "✓" : "✗");

  console.log("\n=== Queue Test ===");
  let jobRan = false;
  registerWorker(QUEUE_NAMES.AI, async (data) => { jobRan = !!data.prompt; });
  await enqueue(QUEUE_NAMES.AI, { type: "test", data: { prompt: "hello" } });
  await new Promise((r) => setTimeout(r, 50));
  console.log("Queue executes jobs:", jobRan ? "✓" : "✗");

  console.log("\n=== Cache Stats ===");
  console.log(cacheStats());

  process.exit(0);
}
main();
