/**
 * Questionnaire contract tests (spec section 152, resolve stage).
 *
 * The questions are DATA and the answers are pure functions into intent +
 * layer decisions. These tests pin the positional `--answers` contract, the
 * honest-fallback defaults, and the provenance rule (answers are evidence).
 */
import { describe, expect, it } from "vitest";
import {
  QUESTIONNAIRE,
  questionIds,
  questionsFor,
  answersToOutcome,
} from "../src/questionnaire.js";

describe("the questionnaire contract (spec 152)", () => {
  it("declares exactly five questions with stable ids in a fixed order", () => {
    expect(QUESTIONNAIRE).toHaveLength(5);
    expect(questionIds()).toEqual(["product", "purpose", "technologies", "distribution", "protection"]);
    // The prompts are the user-facing contract; questionsFor() reports them.
    expect(questionsFor()).toEqual(QUESTIONNAIRE.map((q) => q.prompt));
  });

  it("maps answers onto a canonical productType", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["web app", "browser-application"],
      ["a browser-based tool", "browser-application"],
      ["CLI tool", "cli"],
      ["command-line utility", "cli"],
      ["REST API backend service", "api"],
      ["a reusable library", "library"],
      ["desktop app with electron", "desktop-application"],
      ["mobile app for iOS", "mobile-application"],
    ];
    for (const [answer, expected] of cases) {
      expect(answersToOutcome([answer]).intent.productType).toBe(expected);
    }
  });

  it("keeps free-text product answers kebab-cased instead of guessing", () => {
    expect(answersToOutcome(["frog identification tool"]).intent.productType).toBe("frog-identification-tool");
  });

  it("falls back to application when the product answer is blank", () => {
    expect(answersToOutcome([""]).intent.productType).toBe("application");
    expect(answersToOutcome([""]).answered).toBe(0);
    expect(answersToOutcome([""]).intent.derivedFrom).toEqual([]);
  });

  it("derives domains from the purpose and technologies answers", () => {
    const outcome = answersToOutcome(["web app", "an AI research assistant with search", "TypeScript, React"]);
    expect(outcome.intent.domains).toContain("ai");
    expect(outcome.intent.domains).toContain("search");
    expect(outcome.intent.frameworks).toEqual(expect.arrayContaining(["typescript", "react"]));
  });

  it("records provenance as questionnaire evidence with the answer count", () => {
    const partial = answersToOutcome(["cli", "parses logs"]);
    expect(partial.answered).toBe(2);
    expect(partial.intent.derivedFrom).toEqual(["questionnaire (2/5 answered)"]);
    const full = answersToOutcome(["cli", "parses logs", "rust", "open source", "strict"]);
    expect(full.answered).toBe(5);
    expect(full.intent.derivedFrom).toEqual(["questionnaire (5/5 answered)"]);
  });

  it("defaults protection to guarded and honors an explicit mode", () => {
    expect(answersToOutcome(["web app", "", "", "", ""]).protectionMode).toBe("guarded");
    for (const mode of ["off", "audit", "warn", "guarded", "strict"]) {
      expect(answersToOutcome(["web app", "", "", "", mode]).protectionMode).toBe(mode);
    }
    // An unknown mode is NOT silently accepted — it falls back to guarded.
    expect(answersToOutcome(["web app", "", "", "", "yolo"]).protectionMode).toBe("guarded");
  });

  it("defaults distribution to free and only says paid on clear evidence", () => {
    expect(answersToOutcome(["web app", "", "", "open source", ""]).distributionMode).toBe("free");
    expect(answersToOutcome(["web app", "", "", "commercial, per-seat licensing", ""]).distributionMode).toBe("paid");
    expect(answersToOutcome(["web app", "", "", "internal tool", ""]).distributionMode).toBe("free");
  });

  it("is pure — the same answers produce the same outcome", () => {
    const answers = ["api", "a payments backend", "typescript, postgres", "commercial", "strict"];
    expect(answersToOutcome(answers)).toEqual(answersToOutcome(answers));
  });
});
