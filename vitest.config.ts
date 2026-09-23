import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "plugins/*/test/**/*.test.ts", "app/test/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
    // Kernel tests must be deterministic: no wall-clock assertions, no order
    // dependence (testing standard). Timers are faked globally as a guardrail.
    fakeTimers: { toFake: [] },
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
    },
  },
});
