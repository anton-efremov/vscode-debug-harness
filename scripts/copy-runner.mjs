import { cp, mkdir } from "node:fs/promises";

await mkdir("runner/dist", { recursive: true });
await cp("dist/runner/extension.js", "runner/dist/extension.js");
await cp("dist/runner/extension.js.map", "runner/dist/extension.js.map");
await cp("dist/protocol.js", "runner/protocol.js");
await cp("dist/protocol.js.map", "runner/protocol.js.map");
