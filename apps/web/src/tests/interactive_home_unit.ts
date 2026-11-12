/**
 * Interactive Homepage & Verification Playground Unit Suite
 * Covers:
 * 1. Faithful JS Verification Gate simulation (PASS >=97%, WEAK_EVIDENCE <24 chars / <4 words / bare title, FAIL <97%)
 * 2. Hero claims (PDF/JSON/XLSX), 7-agent Pipeline Explorer order, Risk Tiers (P0-P3), Triage Preview, Use Case tabs
 * 3. Honest copy & ShieldStaff branding across apps/web/src/features/home/ and README.md
 */

declare const require: (id: string) => unknown;

const fs = require("node:fs") as {
  readFileSync: (filePath: string, encoding: string) => string;
  existsSync: (filePath: string) => boolean;
  readdirSync: (dirPath: string, opts: { withFileTypes: boolean }) => Array<{
    name: string;
    isDirectory: () => boolean;
    isFile: () => boolean;
  }>;
};
const path = require("node:path") as {
  resolve: (...parts: string[]) => string;
  join: (...parts: string[]) => string;
};
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;

import { ENABLE_INTERACTIVE_HOME } from "../config/features";
import {
  HERO_CLAIM_DEMOS,
  INITIAL_TRIAGE_PREVIEW_ITEMS,
  PIPELINE_STAGE_SPECS,
  RISK_TIER_SPECS,
  STORY_NAV_ITEMS,
  USE_CASE_TABS,
  VERIFICATION_FIXED_SOURCE,
  VERIFICATION_PRESETS,
} from "../features/home/homeData";
import { evaluateVerificationGate, partialRatio } from "../features/home/verificationSim";

let assertCount = 0;

function assert(cond: unknown, message: string): void {
  assertCount += 1;
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertCount += 1;
  if (actual !== expected) {
    throw new Error(
      `ASSERTION FAILED: ${message} (expected=${String(expected)}, actual=${String(actual)})`
    );
  }
  console.log(`  PASS: ${message}`);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function testVerificationGateSimulation(): void {
  console.log("\n=== [B5.1] Faithful JS Verification Gate Simulation ===");
  const passPreset = VERIFICATION_PRESETS.find((p) => p.id === "exact-pass")!;
  const passRes = evaluateVerificationGate(passPreset.quote, VERIFICATION_FIXED_SOURCE);
  assertEqual(passRes.status, "PASS", "Verbatim sentence evaluates to PASS");
  assert(passRes.score >= 97.0, `Verbatim sentence score (${passRes.score}) >= 97.0`);

  const shortPreset = VERIFICATION_PRESETS.find((p) => p.id === "weak-short")!;
  const shortRes = evaluateVerificationGate(shortPreset.quote, VERIFICATION_FIXED_SOURCE);
  assertEqual(shortRes.status, "WEAK_EVIDENCE", "Short quote evaluates to WEAK_EVIDENCE");
  assert(shortRes.score >= 97.0, "Short substring still scores >= 97% before strength gate catches it");

  const headerPreset = VERIFICATION_PRESETS.find((p) => p.id === "weak-header")!;
  const headerRes = evaluateVerificationGate(headerPreset.quote, VERIFICATION_FIXED_SOURCE);
  assertEqual(headerRes.status, "WEAK_EVIDENCE", "Bare heading evaluates to WEAK_EVIDENCE");
  assertEqual(headerRes.isBareTitle, true, "Bare heading flagged as isBareTitle=true");

  const failPreset = VERIFICATION_PRESETS.find((p) => p.id === "fail-mismatch")!;
  const failRes = evaluateVerificationGate(failPreset.quote, VERIFICATION_FIXED_SOURCE);
  assertEqual(failRes.status, "FAIL", "Mismatched paraphrase evaluates to FAIL");
  assert(failRes.score < 97.0, `Mismatched score (${failRes.score}) < 97.0`);

  const emptyRes = evaluateVerificationGate("   ", VERIFICATION_FIXED_SOURCE);
  assertEqual(emptyRes.status, "FAIL", "Empty quote fails closed");
  assertEqual(partialRatio("Access control", "Access control requires MFA"), 100, "Exact substring partialRatio = 100");
}

function testInteractiveHomeContracts(): void {
  console.log("\n=== [B5.2] Interactive Home Data & Feature Flag Contracts ===");
  assertEqual(ENABLE_INTERACTIVE_HOME, true, "ENABLE_INTERACTIVE_HOME defaults to true");
  assertEqual(
    HERO_CLAIM_DEMOS.map((d) => d.format).join(","),
    "PDF,JSON,XLSX",
    "Hero evidence demo cycles PDF -> JSON -> XLSX"
  );
  assertEqual(
    PIPELINE_STAGE_SPECS.map((s) => s.name).join("->"),
    "Scout->Quartermaster->Chronos->Vanguard->Ranger->Arbiter->Envoy",
    "Pipeline explorer preserves canonical 7-agent sequence"
  );
  assertEqual(
    RISK_TIER_SPECS.map((t) => t.tier).join(","),
    "P0,P1,P2,P3",
    "Risk tier explorer covers P0, P1, P2, P3"
  );
  assertEqual(INITIAL_TRIAGE_PREVIEW_ITEMS.length, 3, "Triage preview includes 3 realistic mock items");
  assertEqual(
    USE_CASE_TABS.map((t) => t.id).join(","),
    "security-questionnaire,contract-risk-triage,degraded-scans",
    "Use case tabs match Security Questionnaire, Contract Risk Triage, Degraded Scans"
  );
  assertEqual(
    STORY_NAV_ITEMS.map((i) => i.id).join(","),
    "evidence-demo,pipeline-explorer,verification-gate,risk-tiers,triage-preview,use-cases",
    "Story nav covers all 6 anchor sections"
  );
}

function testHonestCopyAndReadme(): void {
  console.log("\n=== [B5.3] Honest Copy, ShieldStaff Branding & README Verification ===");
  const cwd = path.resolve(nodeProcess.cwd());
  const webRoot = fs.existsSync(path.join(cwd, "apps/web/src")) ? path.join(cwd, "apps/web") : cwd;
  const repoRoot = fs.existsSync(path.join(cwd, "apps/web/src")) ? cwd : path.resolve(cwd, "../..");

  const forbidden = ["zero hallucination", "zero hallucinations", "zero-hallucination", "zero data loss", "zero-data-loss"];

  const homeFiles = walkFiles(path.join(webRoot, "src/features/home")).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const filePath of homeFiles) {
    const content = fs.readFileSync(filePath, "utf8").toLowerCase();
    for (const phrase of forbidden) {
      assert(!content.includes(phrase), `${path.basename(filePath)} omits '${phrase}'`);
    }
  }

  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const readmeLower = readme.toLowerCase();
  for (const phrase of forbidden) {
    assert(!readmeLower.includes(phrase), `README.md omits '${phrase}'`);
  }
  assert(readme.includes("ShieldStaff"), "README.md features ShieldStaff identity");
  assert(readme.includes("every answer is tied to a source quote or flagged for review") || readmeLower.includes("every answer is tied to a source quote or flagged for review"), "README.md includes honest evidence guarantee");
  assert(readme.includes("npm run dev") && readme.includes("5173"), "README.md documents web dev server on port 5173");
  assert(readme.includes("uvicorn bert.main:app --port 8000"), "README.md documents uvicorn API launch on port 8000");
  assert(readme.includes("ShapeGrid") && readme.includes("Aurora"), "README.md documents ShapeGrid + Aurora backdrop");
  assert(readme.includes("Offline Local"), "README.md documents offline local simulation mode");
}

function main(): void {
  console.log("================================================================================");
  console.log("  INTERACTIVE HOMEPAGE (PART B5) UNIT SUITE                                     ");
  console.log("================================================================================");

  testVerificationGateSimulation();
  testInteractiveHomeContracts();
  testHonestCopyAndReadme();

  console.log("\n================================================================================");
  console.log(`  ALL INTERACTIVE HOME UNIT TESTS PASSED (${assertCount} assertions)!`);
  console.log("================================================================================");
}

main();
