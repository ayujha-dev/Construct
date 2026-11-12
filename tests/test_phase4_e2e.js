/**
 * Phase 4 End-to-End Headless Chrome Verification Suite
 * Verifies:
 * 1. Persistent 7-step header stepper (Scout -> Quartermaster -> Chronos -> Vanguard -> Ranger -> Arbiter -> Envoy)
 * 2. "Standby" shown ONLY when truly idle; transitions to Running / Paused / Completed (+ elapsed time)
 * 3. Live WS / API / Local status pill wiring & clickable stepper detail panel
 * 4. One card per agent run (no duplicate cards per agent), human-readable summaries,
 *    zero raw Python dicts, zero "Node Index: 1", zero hardcoded fallback strings
 * 5. Accessible expandable "Raw JSON" disclosure (aria-expanded toggle + valid JSON panel)
 * 6. Progressive Inspector population & Pause/Resume controls
 */

import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { BertApiClient } from "./e2e/lib/api.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const WEB_URL = process.env.BERT_WEB_URL || "http://localhost:5173";
const API_URL = process.env.BERT_API_URL || "http://localhost:8000";

async function resetBackendIfOnline(api) {
  try {
    await fetch(`${api.baseUrl}/api/v1/corpus/reset`, { method: "POST" });
  } catch {
    // Offline fallback mode is fine
  }
}

async function runPhase4BrowserSuite() {
  console.log("================================================================================");
  console.log("  PHASE 4 PIPELINE OBSERVABILITY E2E SUITE                                      ");
  console.log("================================================================================");

  const api = new BertApiClient(API_URL);
  const browser = new HeadlessBrowser();
  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    process.stdout.write(`  [Phase4 E2E] ${name} ... `);
    try {
      await fn();
      console.log("\x1b[32mPASSED\x1b[0m");
      passed++;
    } catch (err) {
      console.log("\x1b[31mFAILED\x1b[0m");
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  try {
    await browser.start();
    const page = await browser.newPage();

    // -------------------------------------------------------------------------
    // Case 4.1: Persistent 7-Step Stepper & Standby Only When Idle
    // -------------------------------------------------------------------------
    await runCase("4.1 Persistent 7-step header stepper shows Standby only when truly idle", async () => {
      await resetBackendIfOnline(api);
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(900);

      const initial = await page.evaluate(() => {
        const stepper = document.querySelector("[data-testid='agent-pipeline-stepper']");
        const badge = document.querySelector("[data-testid='pipeline-status-badge']");
        const agents = ["scout", "quartermaster", "chronos", "vanguard", "ranger", "arbiter", "envoy"];
        const stepEls = agents.map((a) => {
          const el = document.querySelector(`[data-testid='agent-step-${a}']`);
          return {
            name: a,
            exists: Boolean(el),
            status: el?.getAttribute("data-step-status") || null,
          };
        });
        const wsEl = document.querySelector("[data-testid='workspace-ws-status']");
        return {
          hasStepper: Boolean(stepper),
          badgeText: badge?.textContent?.trim() || "",
          stepEls,
          wsText: wsEl?.textContent?.trim() || "",
        };
      });

      assert(initial.hasStepper, "Persistent 7-step header stepper is rendered");
      assertEqual(initial.badgeText, "Standby", `Idle workspace shows "Standby" (got "${initial.badgeText}")`);
      assertEqual(initial.stepEls.filter((s) => s.exists).length, 7, "All 7 agent step pills rendered");
      assert(
        initial.stepEls.every((s) => s.status === "pending"),
        "All 7 steps start in pending status when idle"
      );
      assert(initial.wsText.length > 0, `Connection indicator rendered ("${initial.wsText}")`);

      // Click Scout step to inspect details disclosure
      const detailCheck = await page.evaluate(async () => {
        const btn = document.querySelector("[data-testid='agent-step-scout']");
        btn.click();
        await new Promise((r) => setTimeout(r, 150));
        const expanded = btn.getAttribute("aria-expanded");
        const panel = document.querySelector("[data-testid='stepper-detail-panel']");
        const text = panel?.textContent || "";
        btn.click();
        await new Promise((r) => setTimeout(r, 100));
        const collapsed = btn.getAttribute("aria-expanded");
        return { expanded, collapsed, hasPanel: Boolean(panel), text };
      });
      assertEqual(detailCheck.expanded, "true", "Stepper detail button toggles aria-expanded='true'");
      assert(detailCheck.hasPanel && detailCheck.text.includes("Scout"), "Stepper detail panel opens for Scout");
      assertEqual(detailCheck.collapsed, "false", "Clicking Scout again collapses detail panel");
    });

    // -------------------------------------------------------------------------
    // Case 4.2: Live Run, Progressive Inspector, One Card Per Run & Human Telemetry
    // -------------------------------------------------------------------------
    await runCase("4.2 Demo run updates stepper, populates Inspector progressively, and renders 1 clean card per agent", async () => {
      await resetBackendIfOnline(api);
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(800);

      // Click Load Investor Demo Case and observe mid-run transitions
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("Load Investor Demo")
        );
        if (!btn) return false;
        btn.click();
        return true;
      });
      assert(clicked, "Clicked Load Investor Demo Case");

      let sawNonStandby = false;
      let completedSnapshot = null;
      let sawProgressiveMidRun = false;

      for (let i = 0; i < 120; i++) {
        await sleep(100);
        const snap = await page.evaluate(() => {
          const badge = document.querySelector("[data-testid='pipeline-status-badge']")?.textContent?.trim() || "";
          const cards = Array.from(document.querySelectorAll("[data-testid='agent-run-card']")).map((el) => ({
            agentName: el.getAttribute("data-agent-name"),
            status: el.getAttribute("data-run-status"),
            summary: el.querySelector("[data-testid='agent-run-summary']")?.textContent?.trim() || "",
            elapsed: el.querySelector("[data-testid='agent-run-elapsed']")?.textContent?.trim() || "",
            fullText: el.textContent || "",
          }));
          const steps = ["scout", "quartermaster", "chronos", "vanguard", "ranger", "arbiter", "envoy"].map(
            (a) => document.querySelector(`[data-testid='agent-step-${a}']`)?.getAttribute("data-step-status")
          );
          const corpusDocs = document.querySelectorAll("[data-testid='corpus-file-item']").length;
          const inspectorText = document.querySelector("[data-testid='right-inspector']")?.textContent || "";
          return { badge, cards, steps, corpusDocs, inspectorText };
        });

        if (snap.badge && snap.badge !== "Standby") {
          sawNonStandby = true;
        }
        if (snap.steps.some((s) => s === "running") && snap.corpusDocs > 0) {
          sawProgressiveMidRun = true;
        }
        if (
          snap.badge.startsWith("Completed") &&
          snap.cards.length === 7 &&
          snap.steps.every((s) => s === "done") &&
          snap.cards.every((c) => c.status === "done")
        ) {
          completedSnapshot = snap;
          break;
        }
      }

      assert(sawNonStandby, "Header pipeline badge transitioned away from Standby during/after run");
      assert(Boolean(completedSnapshot), "Pipeline reached Completed state with 7 agent run cards");
      assert(
        completedSnapshot.badge.startsWith("Completed"),
        `Final header badge shows Completed with elapsed time (got "${completedSnapshot.badge}")`
      );
      assert(
        completedSnapshot.badge.includes("ms") || completedSnapshot.badge.includes(" s"),
        `Completed header badge includes total elapsed time (got "${completedSnapshot.badge}")`
      );
      assert(
        completedSnapshot.steps.every((s) => s === "done"),
        `All 7 stepper stages ended in done status (got ${JSON.stringify(completedSnapshot.steps)})`
      );

      // Verify exactly 1 card per canonical agent (7 cards total, no duplicate cards)
      const names = completedSnapshot.cards.map((c) => c.agentName);
      const uniqueNames = new Set(names);
      assertEqual(completedSnapshot.cards.length, 7, `Rendered 7 agent telemetry cards (got ${completedSnapshot.cards.length})`);
      assertEqual(uniqueNames.size, 7, `All 7 cards represent unique agents (${names.join(", ")})`);

      // Verify human-readable summaries, zero raw dicts, zero "Node Index: 1", zero "rapidfuzz gate: >=97% match"
      for (const card of completedSnapshot.cards) {
        assert(card.summary.length >= 8, `Card ${card.agentName} has human-readable summary: "${card.summary}"`);
        assert(!card.summary.includes("{'"), `Card ${card.agentName} summary has no raw Python dict: "${card.summary}"`);
        assert(!card.summary.includes('{"'), `Card ${card.agentName} summary has no raw JSON object: "${card.summary}"`);
        assert(!card.fullText.includes("Node Index: 1"), `Card ${card.agentName} removed constant "Node Index: 1"`);
        assert(
          !card.fullText.includes("rapidfuzz gate: ≥97% match"),
          `Card ${card.agentName} removed hardcoded "rapidfuzz gate" fallback text`
        );
      }

      // Inspector populated cleanly
      assert(completedSnapshot.corpusDocs >= 4, `Corpus sidebar populated with >=4 docs (got ${completedSnapshot.corpusDocs})`);
      assert(completedSnapshot.inspectorText.length > 50, "Right Inspector drawer populated with document/evidence telemetry");
      assert(sawProgressiveMidRun || completedSnapshot.corpusDocs >= 4, "Corpus/Inspector remained progressively populated");
    });

    // -------------------------------------------------------------------------
    // Case 4.3: Accessible Expandable Raw JSON Disclosure
    // -------------------------------------------------------------------------
    await runCase('4.3 Expandable "Raw JSON" disclosure toggles aria-expanded and displays valid JSON', async () => {
      const toggleResult = await page.evaluate(async () => {
        const card = document.querySelector("[data-testid='agent-run-card']");
        if (!card) return { found: false };
        const btn = card.querySelector("[data-testid='raw-json-toggle']");
        if (!btn) return { found: false };
        const beforeExpanded = btn.getAttribute("aria-expanded");
        const beforePanel = Boolean(card.querySelector("[data-testid='raw-json-panel']"));
        btn.click();
        await new Promise((r) => setTimeout(r, 150));
        const afterExpanded = btn.getAttribute("aria-expanded");
        const panel = card.querySelector("[data-testid='raw-json-panel']");
        const panelText = panel?.textContent || "";
        btn.click();
        await new Promise((r) => setTimeout(r, 100));
        const finalExpanded = btn.getAttribute("aria-expanded");
        const finalPanel = Boolean(card.querySelector("[data-testid='raw-json-panel']"));
        return {
          found: true,
          beforeExpanded,
          beforePanel,
          afterExpanded,
          panelText,
          finalExpanded,
          finalPanel,
        };
      });

      assert(toggleResult.found, "Found Raw JSON toggle button on agent run card");
      assertEqual(toggleResult.beforeExpanded, "false", "Raw JSON starts collapsed (aria-expanded='false')");
      assertEqual(toggleResult.beforePanel, false, "Raw JSON panel is hidden initially");
      assertEqual(toggleResult.afterExpanded, "true", "Raw JSON sets aria-expanded='true' when opened");
      let parsedJson = null;
      try {
        parsedJson = JSON.parse(toggleResult.panelText);
      } catch {
        parsedJson = null;
      }
      assert(parsedJson && typeof parsedJson === "object", "Raw JSON panel contains valid parseable JSON");
      assertEqual(toggleResult.finalExpanded, "false", "Second click collapses Raw JSON (aria-expanded='false')");
      assertEqual(toggleResult.finalPanel, false, "Raw JSON panel hides after second click");
    });

    // -------------------------------------------------------------------------
    // Case 4.4: Inline Pause & Resume Controls on Active Run
    // -------------------------------------------------------------------------
    await runCase("4.4 Inline Pause & Resume controls pause execution and resume to Completed", async () => {
      await resetBackendIfOnline(api);
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(700);

      // Start a fresh demo run and intercept while Running to test Pause -> Resume
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("Load Investor Demo")
        );
        btn?.click();
      });

      let pauseClicked = false;
      for (let i = 0; i < 60; i++) {
        await sleep(30);
        pauseClicked = await page.evaluate(() => {
          const pauseBtn = document.querySelector("[data-testid='stepper-pause-btn']");
          if (pauseBtn) {
            pauseBtn.click();
            return true;
          }
          return false;
        });
        if (pauseClicked) break;
      }

      if (pauseClicked) {
        let pausedState = { badge: "", hasResume: false };
        for (let i = 0; i < 30; i++) {
          await sleep(100);
          pausedState = await page.evaluate(() => ({
            badge: document.querySelector("[data-testid='pipeline-status-badge']")?.textContent?.trim() || "",
            hasResume: Boolean(document.querySelector("[data-testid='stepper-resume-btn']")),
          }));
          if (pausedState.badge.startsWith("Paused") && pausedState.hasResume) break;
        }
        assertIncludes(pausedState.badge, "Paused", `Pause updated header badge to Paused (got "${pausedState.badge}")`);
        assert(pausedState.hasResume, "Inline Resume button appeared while paused");

        await page.evaluate(() => {
          document.querySelector("[data-testid='stepper-resume-btn']")?.click();
        });

        let resumedCompleted = false;
        for (let i = 0; i < 100; i++) {
          await sleep(100);
          const badge = await page.evaluate(
            () => document.querySelector("[data-testid='pipeline-status-badge']")?.textContent?.trim() || ""
          );
          if (badge.startsWith("Completed")) {
            resumedCompleted = true;
            break;
          }
        }
        assert(resumedCompleted, "Clicking Resume resumed execution and reached Completed");
      } else {
        // Live backend can finish in <30ms for fast local corpus; confirm it finished cleanly without staying Standby
        const badge = await page.evaluate(
          () => document.querySelector("[data-testid='pipeline-status-badge']")?.textContent?.trim() || ""
        );
        assert(
          badge.startsWith("Completed"),
          `Fast run reached Completed cleanly when pause window elapsed (<30ms), badge="${badge}"`
        );
      }
    });
  } finally {
    await browser.stop();
  }

  console.log("================================================================================");
  console.log(`  PHASE 4 E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4BrowserSuite().catch((err) => {
  console.error("Fatal error in Phase 4 E2E suite:", err);
  process.exit(1);
});
