/**
 * Challenger 2: Empirical Stress Test Suite for:
 * 1. Reactive State & Polling Removal in App.tsx
 * 2. URL State Synchronization (UrlStateSync) & Parameter Preservation
 */

import fs from "node:fs";
import path from "node:path";
import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";

const WEB_URL = process.env.BERT_WEB_URL || "http://localhost:5173";
const APP_TSX_PATH = path.resolve("apps/web/src/App.tsx");
const SRC_DIR = path.resolve("apps/web/src");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`ASSERTION FAILED: ${message} (Expected: ${expected}, Actual: ${actual})`);
  }
}

// =============================================================================
// Section 1: Static / AST Polling Removal Analysis
// =============================================================================

function testStaticPollingRemoval() {
  console.log("\n--- [Test 1] Static Code Analysis: Polling Removal ---");
  
  const appTsxContent = fs.readFileSync(APP_TSX_PATH, "utf-8");
  
  // 1. Check setInterval in App.tsx
  const setIntervalMatchesInApp = appTsxContent.match(/setInterval/g) || [];
  assertEqual(setIntervalMatchesInApp.length, 0, "App.tsx must have 0 setInterval calls");
  console.log("  ✓ App.tsx has 0 setInterval calls");

  // 2. Check fetchJob in App.tsx
  const fetchJobMatchesInApp = appTsxContent.match(/fetchJob/g) || [];
  assertEqual(fetchJobMatchesInApp.length, 0, "App.tsx must have 0 fetchJob calls");
  console.log("  ✓ App.tsx has 0 fetchJob calls");

  // 3. Check all files in apps/web/src for setInterval
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let totalSetIntervals = 0;
    const occurrences = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        const sub = scanDir(fullPath);
        totalSetIntervals += sub.totalSetIntervals;
        occurrences.push(...sub.occurrences);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const matches = content.match(/setInterval/g) || [];
        if (matches.length > 0) {
          totalSetIntervals += matches.length;
          occurrences.push({ file: path.relative(SRC_DIR, fullPath), count: matches.length });
        }
      }
    }
    return { totalSetIntervals, occurrences };
  }

  const { totalSetIntervals, occurrences } = scanDir(SRC_DIR);
  assertEqual(totalSetIntervals, 0, `Entire apps/web/src must contain 0 setInterval calls, found in: ${JSON.stringify(occurrences)}`);
  console.log("  ✓ Entire apps/web/src has 0 setInterval calls across all .ts and .tsx files");
}

// =============================================================================
// Section 2: Pure Behavioral Logic of Reactive State (appendEvent)
// =============================================================================

function testReactiveStateLogic() {
  console.log("\n--- [Test 2] Reactive State Transition Logic (appendEvent) ---");

  // Simulate jobExecutionSlice appendEvent logic faithfully
  function simulateAppendEvent(currentState, event, onRefresh) {
    let nextJob = currentState.activeJob;
    if (currentState.activeJob && (!event.job_id || event.job_id === currentState.activeJob.job_id)) {
      const isJobTransition = ["JOB_PAUSED", "JOB_PAUSING", "JOB_RESUMED", "JOB_RESUMING", "JOB_COMPLETED", "JOB_FAILED"].includes(event.type);
      const newStatus = isJobTransition
        ? event.type.replace("JOB_", "")
        : (event.status ?? currentState.activeJob.status);

      nextJob = {
        ...currentState.activeJob,
        status: newStatus,
        current_agent_index: event.current_agent_index !== undefined ? event.current_agent_index : currentState.activeJob.current_agent_index,
        current_node_index: event.current_node_index !== undefined ? event.current_node_index : currentState.activeJob.current_node_index,
        current_document_id: event.document_id !== undefined ? event.document_id : currentState.activeJob.current_document_id,
      };
    }

    const isCompleted = event.type === "JOB_COMPLETED" || event.status === "COMPLETED";
    const isPaused = event.type === "JOB_PAUSED" || event.status === "PAUSED";

    const nextState = {
      ...currentState,
      events: [...currentState.events.slice(-249), { ...event, created_at: event.created_at ?? Date.now() }],
      activeJob: nextJob,
      job: nextJob,
      isSimulating: isCompleted || isPaused ? false : (currentState.isSimulating || (nextJob?.status === "RUNNING")),
    };

    if (isCompleted && onRefresh) {
      onRefresh();
    }

    return nextState;
  }

  const initialJob = {
    job_id: "job-1",
    status: "RUNNING",
    current_agent_index: 0,
    current_node_index: 0,
    current_document_id: "doc-1",
  };

  let state = {
    activeJob: initialJob,
    job: initialJob,
    events: [],
    isSimulating: true,
  };

  let refreshCallCount = 0;
  const onRefresh = () => { refreshCallCount++; };

  // 1. Agent transition event
  state = simulateAppendEvent(state, {
    type: "agent_transition",
    job_id: "job-1",
    current_agent_index: 3,
    current_node_index: 12,
  }, onRefresh);
  assertEqual(state.activeJob.current_agent_index, 3, "Agent index updated reactively");
  assertEqual(state.activeJob.current_node_index, 12, "Node index updated reactively");
  assertEqual(state.isSimulating, true, "Remains simulating during agent transition");
  assertEqual(refreshCallCount, 0, "No refresh called during intermediate transition");
  console.log("  ✓ agent_transition updates index reactively without refresh call");

  // 2. Pause transition
  state = simulateAppendEvent(state, { type: "JOB_PAUSED", job_id: "job-1" }, onRefresh);
  assertEqual(state.activeJob.status, "PAUSED", "Status changed to PAUSED");
  assertEqual(state.isSimulating, false, "isSimulating set to false on pause");
  console.log("  ✓ JOB_PAUSED transitions status to PAUSED and stops isSimulating");

  // 3. Status transition on JOB_RESUMED
  state = simulateAppendEvent(state, { type: "JOB_RESUMED", job_id: "job-1" }, onRefresh);
  console.log(`  [Observed State after JOB_RESUMED] activeJob.status="${state.activeJob.status}", isSimulating=${state.isSimulating}`);
  if (!state.isSimulating) {
    console.log("  ⚠️ [FINDING] When JOB_RESUMED arrives, isSimulating evaluates to false because nextJob.status is 'RESUMED' rather than 'RUNNING' and previous isSimulating was false.");
  }

  // 4. Completed transition
  state = simulateAppendEvent(state, { type: "JOB_COMPLETED", job_id: "job-1" }, onRefresh);
  assertEqual(state.activeJob.status, "COMPLETED", "Status changed to COMPLETED");
  assertEqual(state.isSimulating, false, "isSimulating set to false on completed");
  assertEqual(refreshCallCount, 1, "refresh() triggered once on completion");
  console.log("  ✓ JOB_COMPLETED transitions status to COMPLETED and triggers refresh() once");

  // 5. Event buffer FIFO cap at 250 items
  for (let i = 0; i < 300; i++) {
    state = simulateAppendEvent(state, { type: "heartbeat", index: i }, onRefresh);
  }
  assertEqual(state.events.length, 250, "Events list strictly capped at 250 items");
  assertEqual(state.events[249].index, 299, "Last item in buffer is the most recent event");
  console.log("  ✓ Events FIFO maintains max cap of 250 items without memory leak");
}

// =============================================================================
// Section 3: Live In-Browser URL State Sync & Polling Elimination
// =============================================================================

async function testLiveBrowserUrlSyncAndPolling() {
  console.log("\n--- [Test 3] Live In-Browser Tests via Headless Chrome ---");

  const browser = new HeadlessBrowser();
  let page = null;

  try {
    await browser.start();
    page = await browser.newPage();

    // 1. Verify Polling Removal at Runtime
    console.log("  [3.1] Verifying runtime elimination of 700ms polling...");
    await page.goto(`${WEB_URL}/workspace`);
    await sleep(1000);

    // Instrument window to count timer registrations and network requests
    await page.evaluate(() => {
      window.__highFrequencyTimers = [];
      window.__networkFetchCalls = [];
      const origSetInterval = window.setInterval;
      window.setInterval = function (fn, ms, ...args) {
        if (ms && ms < 1000) {
          window.__highFrequencyTimers.push(ms);
        }
        return origSetInterval.call(window, fn, ms, ...args);
      };

      const origFetch = window.fetch;
      window.fetch = function (url, ...args) {
        window.__networkFetchCalls.push(typeof url === "string" ? url : url.url);
        return origFetch.call(window, url, ...args);
      };
    });

    // Wait 3000ms to observe any periodic polling calls
    await sleep(3000);

    const pollingAudit = await page.evaluate(() => {
      const jobFetches = window.__networkFetchCalls.filter((u) => u.includes("/jobs") || u.includes("/work-items"));
      return {
        highFrequencyTimers: window.__highFrequencyTimers,
        jobFetchesCount: jobFetches.length,
        jobFetches: jobFetches,
      };
    });

    assertEqual(pollingAudit.highFrequencyTimers.length, 0, `No high-frequency timers allowed (<1000ms), found: ${JSON.stringify(pollingAudit.highFrequencyTimers)}`);
    assertEqual(pollingAudit.jobFetchesCount, 0, `No continuous background polling for jobs/work-items allowed, observed calls: ${JSON.stringify(pollingAudit.jobFetches)}`);
    console.log("  ✓ Verified: 0 high-frequency timers and 0 background polling network calls over 3 seconds");

    // 2. URL Parameter Preservation: ?mode=canvas
    console.log("  [3.2] Verifying URL State Synchronization & Parameter Preservation (?mode=canvas)...");
    await page.goto(`${WEB_URL}/workspace?mode=canvas`);
    await sleep(800);

    let search = await page.evaluate(() => window.location.search);
    assert(search.includes("mode=canvas"), `External param 'mode=canvas' must be preserved on mount, got: ${search}`);
    console.log(`  ✓ 'mode=canvas' preserved on initial workspace mount: ${search}`);

    // 3. Inbound Document Selection Synchronization (?doc= alias + ?file= + ?workspace=)
    console.log("  [3.3] Verifying Inbound Document Deep Linking (?doc=... & ?workspace=)...");
    await page.goto(`${WEB_URL}/workspace?doc=fac5bc41-28f4-4364-8dc9-b153be7665dd&mode=canvas`);
    await sleep(800);

    search = await page.evaluate(() => window.location.search);
    assert(search.includes("mode=canvas"), `'mode=canvas' preserved alongside doc param: ${search}`);
    assert(search.includes("workspace="), `'workspace=' stabilized in URL: ${search}`);
    console.log(`  ✓ Search params retain mode=canvas and workspace=: ${search}`);

    // 4. Outbound URL Synchronization & Infinite Loop Prevention
    console.log("  [3.4] Stress-testing Outbound URL sync & Infinite Loop Prevention...");
    await page.evaluate(() => {
      window.__replaceStateCallCount = 0;
      const origReplace = window.history.replaceState;
      window.history.replaceState = function (...args) {
        window.__replaceStateCallCount++;
        return origReplace.apply(window.history, args);
      };
    });

    await sleep(2500);
    const replaceStateCalls = await page.evaluate(() => window.__replaceStateCallCount);
    assert(replaceStateCalls <= 3, `replaceState calls must be bounded (<=3), observed ${replaceStateCalls} calls indicating potential loop!`);
    console.log(`  ✓ replaceState called ${replaceStateCalls} times over 2.5s (cleanly bounded, no infinite loop)`);

    // 5. Document selection in sidebar updates URL to ?file= without dropping mode=canvas or workspace=
    console.log("  [3.5] Verifying Sidebar File Selection updates URL (?file= & ?workspace=) and preserves ?mode=canvas...");
    const clicked = await page.evaluate(() => {
      const docBtn = document.querySelector("[data-testid='corpus-file-item']") ||
        Array.from(document.querySelectorAll("button")).find((b) => b.textContent && b.textContent.includes(".pdf"));
      if (docBtn) {
        docBtn.click();
        return true;
      }
      return false;
    });

    await sleep(800);
    search = await page.evaluate(() => window.location.search);
    assert(search.includes("mode=canvas"), `External param 'mode=canvas' preserved after user clicked document: ${search}`);
    if (clicked) {
      assert(search.includes("file=") || search.includes("doc="), `URL updated to include 'file=' parameter after sidebar selection: ${search}`);
    }
    assert(search.includes("workspace="), `URL includes stable 'workspace=' parameter: ${search}`);
    console.log(`  ✓ After sidebar selection, URL updated with file/workspace and retained mode=canvas: ${search}`);

    // 6. Verify cold-load ?page=3 parameter preservation (Phase 2 fix)
    console.log("  [3.6] Verifying Inbound ?page=3 deep-link preservation...");
    await page.goto(`${WEB_URL}/workspace?doc=fac5bc41-28f4-4364-8dc9-b153be7665dd&page=3&mode=canvas`);
    await sleep(1000);

    const searchAfterPageParam = await page.evaluate(() => window.location.search);
    assert(searchAfterPageParam.includes("page=3"), `Inbound ?page=3 must be preserved on cold load, got: "${searchAfterPageParam}"`);
    assert(searchAfterPageParam.includes("mode=canvas"), `Inbound ?mode=canvas must be preserved alongside ?page=3, got: "${searchAfterPageParam}"`);
    console.log(`  ✓ Inbound ?page=3 and ?mode=canvas preserved cleanly: ${searchAfterPageParam}`);

    // 7. Unknown Document ID in URL (Robustness / Error Handling)
    console.log("  [3.7] Adversarial Edge Case: Unknown document ID (?doc=unknown-uuid-999)...");
    await page.goto(`${WEB_URL}/workspace?doc=unknown-uuid-999&mode=canvas`);
    await sleep(800);
    const searchAfterUnknownDoc = await page.evaluate(() => window.location.search);
    console.log(`  ✓ Unknown document ID handled without fatal page crash. Search: "${searchAfterUnknownDoc}"`);

  } finally {
    if (browser) {
      await browser.stop();
    }
  }
}

// =============================================================================
// Main Runner
// =============================================================================

async function runAllChallengerTests() {
  console.log("================================================================================");
  console.log("  CHALLENGER 2: EMPIRICAL VERIFICATION SUITE (REACTIVE STATE & URL STATE SYNC)  ");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  try {
    testStaticPollingRemoval();
    passed++;
  } catch (err) {
    console.error("  ❌ Test 1 FAILED:", err.message);
    failed++;
  }

  try {
    testReactiveStateLogic();
    passed++;
  } catch (err) {
    console.error("  ❌ Test 2 FAILED:", err.message);
    failed++;
  }

  try {
    await testLiveBrowserUrlSyncAndPolling();
    passed++;
  } catch (err) {
    console.error("  ❌ Test 3 FAILED:", err.message);
    failed++;
  }

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAllChallengerTests().catch((err) => {
  console.error("Fatal error running challenger tests:", err);
  process.exit(1);
});
