import { cp, mkdir } from "node:fs/promises";
await mkdir("bridge/dist", { recursive: true });
await cp("dist/bridge/extension.js", "bridge/dist/extension.js");
await cp("dist/bridge/extension.js.map", "bridge/dist/extension.js.map");
