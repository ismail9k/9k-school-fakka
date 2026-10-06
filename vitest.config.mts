import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Git worktrees hold their own copies of every test.
    exclude: [...configDefaults.exclude, ".worktrees/**"],
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
