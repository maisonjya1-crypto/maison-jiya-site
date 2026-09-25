import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("le mode entraînement reste local et séparé des vraies données", async () => {
  const [dashboard, training, page] = await Promise.all([
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/training-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /Mode entraînement/);
  assert.match(dashboard, /<TrainingPage/);
  assert.match(training, /maison-jiya-training-sandbox-v1/);
  assert.match(training, /localStorage/);
  assert.match(training, /Rien n’est envoyé à D1/);
  assert.doesNotMatch(training, /fetch\s*\(/);
  assert.doesNotMatch(training, /\/api\//);
  assert.match(page, /training-mode\.css/);
});
