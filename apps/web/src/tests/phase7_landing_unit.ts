/**
 * Phase 7 Landing Page Rebuild Unit Suite
 * Covers:
 * 1. Multi-file staged upload passes ALL staged files & retains all docs/items
 * 2. Remove & clear staged file helpers
 * 3. Zero unverified "zero hallucinations" / "zero data loss" / "zero truncation" copy
 * 4. Section anchor IDs & 7-agent pipeline order
 * 5. formatFileSize KB/MB formatting (< 100 KB -> "12 KB", never "0.0 MB")
 * 6. prefers-reduced-motion guard & scroll behavior helper
 * 7. Zero interval polling & zero dependency-less useEffect in Particles.tsx
 */

declare const require: (id: string) => unknown;

const fs = require("node:fs") as {
  readFileSync: (filePath: string, encoding: string) => string;
  existsSync: (filePath: string) => boolean;
};
const path = require("node:path") as {
  resolve: (...parts: string[]) => string;
  join: (...parts: string[]) => string;
  basename: (filePath: string) => string;
};
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;

if (typeof window === "undefined") {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

import {
  CLAIM_EVIDENCE_DEMOS,
  LANDING_NAV_ITEMS,
  LANDING_SECTION_IDS,
  LOCAL_MODE_GUARANTEES,
  PIPELINE_AGENTS,
  USE_CASES,
  VERIFICATION_GATE_PILLARS,
  extractRealFiles,
  formatFileSize,
  getScrollBehavior,
  mergeStagedFiles,
  prefersReducedMotion,
  removeStagedFileAt,
} from "../lib/landingContent";
import { useBertStore } from "../store/useBertStore";

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

function makeMockFile(name: string, content: string): File {
  return new File([content], name, {
    type: name.endsWith(".json") ? "application/json" : "text/plain",
    lastModified: 1730000000000,
  });
}

async function testFormatFileSize(): Promise<void> {
  console.log("\n=== [7.1] formatFileSize KB/MB Formatting ===");
  assertEqual(formatFileSize(0), "0 KB", "0 bytes -> '0 KB'");
  assertEqual(formatFileSize(512), "1 KB", "512 bytes -> '1 KB'");
  assertEqual(formatFileSize(12 * 1024), "12 KB", "12288 bytes -> '12 KB'");
  assertEqual(formatFileSize(99 * 1024), "99 KB", "101376 bytes -> '99 KB'");
  assertEqual(formatFileSize(1024 * 1024), "1.0 MB", "1 MiB -> '1.0 MB'");
  assertEqual(formatFileSize(2.4 * 1024 * 1024), "2.4 MB", "2.4 MiB -> '2.4 MB'");
  assert(!formatFileSize(12 * 1024).includes("0.0 MB"), "<100 KB never formats as '0.0 MB'");
}

async function testMultiFileStagingAndUpload(): Promise<void> {
  console.log("\n=== [7.2] Multi-File Staged Upload & Removal ===");
  const f1 = makeMockFile("policy_2026.txt", "Access control requires MFA for privileged accounts.");
  const f2 = makeMockFile(
    "iam_prod.json",
    JSON.stringify({ rules: { "wildcard-admin": { effect: "Allow", action: "s3:*" } } })
  );
  const f3 = makeMockFile("addendum.md", "# SLA Addendum\nAnnual review required.");

  let staged = mergeStagedFiles([], [f1, f2, f3]);
  assertEqual(staged.length, 3, "All 3 staged files retained");
  assertEqual(extractRealFiles(staged).length, 3, "extractRealFiles returns all 3 File objects");

  // Deduplicating identical file while preserving distinct files
  staged = mergeStagedFiles(staged, [f2]);
  assertEqual(staged.length, 3, "Duplicate file is not double-staged");

  // Removing individual staged file
  staged = removeStagedFileAt(staged, 1);
  assertEqual(staged.length, 2, "Removing index 1 leaves 2 staged files");
  assertEqual(staged[0].name, "policy_2026.txt", "First file preserved");
  assertEqual(staged[1].name, "addendum.md", "Third file preserved");

  // Full store uploadFiles passes ALL staged files in offline mode without dropping earlier docs
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("offline test"))) as typeof fetch;
  try {
    useBertStore.setState({
      documents: [],
      nodesByDocument: {},
      workItems: [],
      documentFiles: {},
      backendAvailable: false,
    });
    await useBertStore.getState().uploadFiles([f1, f2, f3]);
    const state = useBertStore.getState();
    assertEqual(state.documents.length, 3, "uploadFiles stored all 3 uploaded documents");
    const uploadedNames = new Set(state.documents.map((d) => d.filename));
    assert(uploadedNames.has("policy_2026.txt"), "Uploaded doc 1 present in store");
    assert(uploadedNames.has("iam_prod.json"), "Uploaded doc 2 present in store");
    assert(uploadedNames.has("addendum.md"), "Uploaded doc 3 present in store");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testZeroFalseClaimsAndAnchors(): Promise<void> {
  console.log("\n=== [7.3] Zero False Claims & Required 7-Section Content ===");
  const repoRoot = path.resolve(nodeProcess.cwd());
  const webRoot = fs.existsSync(path.join(repoRoot, "apps/web/src"))
    ? path.join(repoRoot, "apps/web")
    : path.resolve(repoRoot);

  const filesToInspect = [
    path.join(webRoot, "index.html"),
    path.join(webRoot, "src/pages/LandingPage.tsx"),
    path.join(webRoot, "src/components/navigation/WeTransferTopPill.tsx"),
    path.join(webRoot, "src/components/navigation/WeTransferIconRail.tsx"),
    path.join(webRoot, "src/components/layout/AppShell.tsx"),
    path.join(webRoot, "src/lib/landingContent.ts"),
  ];

  const forbidden = [
    "zero hallucinations",
    "zero hallucination",
    "zero-hallucination",
    "zero data loss",
    "zero-data-loss",
    "zero truncation",
    "langgraph",
    "postgresql",
  ];

  for (const filePath of filesToInspect) {
    const content = fs.readFileSync(filePath, "utf8").toLowerCase();
    for (const phrase of forbidden) {
      assert(
        !content.includes(phrase),
        `${path.basename(filePath)} contains no false/unverified claim '${phrase}'`
      );
    }
  }

  const landingSrc = fs.readFileSync(path.join(webRoot, "src/pages/LandingPage.tsx"), "utf8");
  for (const sectionId of LANDING_SECTION_IDS) {
    assert(
      landingSrc.includes(`id="${sectionId}"`),
      `LandingPage.tsx renders section anchor id="${sectionId}"`
    );
  }
  assert(landingSrc.includes("<footer"), "LandingPage.tsx renders semantic <footer>");

  for (const navItem of LANDING_NAV_ITEMS) {
    assert(
      (LANDING_SECTION_IDS as readonly string[]).includes(navItem.id),
      `Nav item #${navItem.id} maps to existing section ID`
    );
  }

  // Verify 7-agent canonical sequence
  assertEqual(
    PIPELINE_AGENTS.map((a) => a.name).join("->"),
    "Scout->Quartermaster->Chronos->Vanguard->Ranger->Arbiter->Envoy",
    "Pipeline agents follow exact 7-agent order"
  );
  assertEqual(CLAIM_EVIDENCE_DEMOS.length, 4, "4 interactive Claim->Evidence demos defined");
  assert(
    CLAIM_EVIDENCE_DEMOS.some((d) => d.statusBadge === "Flagged -> Human Triage"),
    "Missing-proof escalation demo displays 'Flagged -> Human Triage'"
  );
  assertEqual(VERIFICATION_GATE_PILLARS.length, 3, "3 verification gate pillars defined");
  assertEqual(USE_CASES.length, 4, "4 ShieldStaff use cases defined");
  assertEqual(LOCAL_MODE_GUARANTEES.length, 3, "3 local-mode guarantees defined");
}

async function testReducedMotionAndCodeHygiene(): Promise<void> {
  console.log("\n=== [7.4] prefers-reduced-motion Guard & Code Hygiene ===");
  const origMatchMedia = window.matchMedia;
  try {
    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    assertEqual(prefersReducedMotion(), true, "prefersReducedMotion() returns true when matched");
    assertEqual(getScrollBehavior(), "auto", "getScrollBehavior() returns 'auto' under reduced motion");

    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    assertEqual(prefersReducedMotion(), false, "prefersReducedMotion() returns false when unmatched");
    assertEqual(getScrollBehavior(), "smooth", "getScrollBehavior() returns 'smooth' normally");
  } finally {
    (window as unknown as { matchMedia: unknown }).matchMedia = origMatchMedia;
  }

  const repoRoot = path.resolve(nodeProcess.cwd());
  const webRoot = fs.existsSync(path.join(repoRoot, "apps/web/src"))
    ? path.join(repoRoot, "apps/web")
    : path.resolve(repoRoot);

  const particlesSrc = fs.readFileSync(path.join(webRoot, "src/components/ui/Particles.tsx"), "utf8");
  const useEffectMatches = particlesSrc.match(/\buseEffect\s*\(/g) ?? [];
  assertEqual(useEffectMatches.length, 2, "Particles.tsx has exactly 2 useEffect hooks");
  assert(
    !/useEffect\s*\(\s*\(\)\s*=>\s*\{\s*wakeRef\.current\?\.\(\);\s*\}\s*\)\s*;/.test(particlesSrc),
    "Particles.tsx has zero dependency-less wakeRef useEffect"
  );
  assert(
    particlesSrc.includes("}, [\n    particleCount,"),
    "Particles.tsx second useEffect declares explicit prop dependency array"
  );
  assert(
    particlesSrc.includes("addEventListener('change', onMotionChange)"),
    "Particles.tsx listens for prefers-reduced-motion changes"
  );
}

async function main(): Promise<void> {
  console.log("================================================================================");
  console.log("  PHASE 7 LANDING PAGE REBUILD UNIT SUITE                                       ");
  console.log("================================================================================");

  await testFormatFileSize();
  await testMultiFileStagingAndUpload();
  await testZeroFalseClaimsAndAnchors();
  await testReducedMotionAndCodeHygiene();

  console.log("\n================================================================================");
  console.log(`  ALL PHASE 7 LANDING UNIT TESTS PASSED (${assertCount} assertions)!`);
  console.log("================================================================================");
}

main().catch((err) => {
  console.error(err);
  throw err;
});
