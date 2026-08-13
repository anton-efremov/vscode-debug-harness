import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "bridge/dist/**", "node_modules/**", "test/e2e/fixture-extension/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } }
);
