import { rm } from "node:fs/promises";

await Promise.all([
  rm("dist", { recursive: true, force: true }),
  rm("runner/dist", { recursive: true, force: true }),
  rm("runner/protocol.js", { force: true }),
  rm("runner/protocol.js.map", { force: true }),
]);
