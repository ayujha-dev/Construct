/**
 * Phase 5 End-to-End Headless Chrome Verification Suite
 * Covers:
 * 1. Sidebar -> /triage two-pane workspace, priority ordering (P0 -> P3), Accept hidden on missing-proof items
 * 2. Evidence-first left pane, Vision Rescue label exclusivity, IntersectionObserver `evidenceVisible` gate, locator inspection
 * 3. Keyboard shortcuts (J/K/A/O/L/N + Enter, ignored in inputs) & Undo toast (role="status")
 * 4. Multi-select Bulk Flag for Legal + 1-click Bulk Undo + Resolved tab visibility
 * 5. Consolidated triage surfaces (/workspace CopilotStream, ?mode=canvas BentoCanvas, /results?filter=escalations)
 */

import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { BertApiClient } from "./e2e/lib/api.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const WEB_URL = process.env.BERT_WEB_URL || "http://localhost:15173";
const API_URL = process.env.BERT_API_URL || "http://localhost:18000";

async function setControlValue(page, selector, value) {
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Control not found: ${sel}`);
      const proto =
        el.tagName === "SELECT"
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    },
    { sel: selector, val: value }
  );
}

async function dispatchWindowKey(page, key) {
  await page.evaluate((k) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  }, key);
}

async function seedPhase5Dataset(api) {
  await api.seedDemo();
  // Upload a scanned/low-OCR doc for Vision Rescue + a weak-evidence digital doc
  const rescueUp = await api.uploadTextDocument(
    "Addendum_Stamp_Scan.txt",
    "[LOW_CONFIDENCE] STAMP NOTE: Signed compliance addendum dated 2026-03-01.\n"
  );
  assert(rescueUp.ok && rescueUp.data?.id, `Uploaded Vision Rescue doc (${rescueUp.status})`);
  const rescueJob = await api.startJob({ document_id: rescueUp.data.id });
  await api.waitForJob(rescueJob.data.job_id);

  const weakUp = await api.uploadTextDocument(
    "Short_Evidence_Note.txt",
    "Short MFA note\nAccess control requires multifactor authentication for all administrative consoles.\n"
  );
  assert(weakUp.ok && weakUp.data?.id, `Uploaded weak-evidence doc (${weakUp.status})`);
  const weakJob = await api.startJob({ document_id: weakUp.data.id });
  await api.waitForJob(weakJob.data.job_id);

  return {
    rescueDocId: rescueUp.data.id,
    weakDocId: weakUp.data.id,
  };
}

async function runPhase5BrowserSuite() {
  console.log("================================================================================");
  console.log("  PHASE 5 END-TO-END HEADLESS CHROME VERIFICATION SUITE                         ");
  console.log("================================================================================");

  const api = new BertApiClient(API_URL);
  const browser = new HeadlessBrowser();
  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    process.stdout.write(`  [Phase5 E2E] ${name} ... `);
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
    // Case 1: Sidebar -> /triage, two-pane layout, priority ordering, Accept hidden on missing-proof
    // -------------------------------------------------------------------------
    await runCase("5.1 Sidebar navigation to /triage, priority order, and missing-proof Accept hidden", async () => {
      await seedPhase5Dataset(api);
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(900);

      const sidebarNav = await page.evaluate(async () => {
        const link = document.querySelector("[data-testid='sidebar-triage-link']");
        if (!link) return null;
        const badge = document.querySelector("[data-testid='sidebar-triage-badge']")?.textContent?.trim() || "";
        link.click();
        await new Promise((r) => setTimeout(r, 400));
        return {
          path: window.location.pathname,
          badge,
          hasPage: Boolean(document.querySelector("[data-testid='triage-page']")),
          hasEvidencePane: Boolean(document.querySelector("[data-testid='triage-evidence-pane']")),
          hasQueuePane: Boolean(document.querySelector("[data-testid='triage-queue-pane']")),
          hasLegend: Boolean(document.querySelector("[data-testid='triage-shortcut-legend']")),
          tiers: Array.from(document.querySelectorAll("[data-testid='triage-queue-item']")).map((el) =>
            el.getAttribute("data-priority-tier")
          ),
        };
      });

      assert(Boolean(sidebarNav), "Sidebar Human Escalations link present");
      assertEqual(sidebarNav.path, "/triage", "Sidebar link navigates to /triage");
      assert(Number(sidebarNav.badge) > 0, `Sidebar badge reports open count (${sidebarNav.badge})`);
      assert(sidebarNav.hasPage && sidebarNav.hasEvidencePane && sidebarNav.hasQueuePane, "Two-pane triage view mounted");
      assert(sidebarNav.hasLegend, "Keyboard shortcut legend rendered");
      assert(sidebarNav.tiers.length >= 3, `Queue has items (found ${sidebarNav.tiers.length})`);

      const rank = { P0_CRITICAL: 0, P1_HIGH: 1, P2_MEDIUM: 2, P3_LOW: 3 };
      for (let i = 1; i < sidebarNav.tiers.length; i++) {
        assert(
          (rank[sidebarNav.tiers[i]] ?? 9) >= (rank[sidebarNav.tiers[i - 1]] ?? 9),
          `Priority order preserved at index ${i} (${sidebarNav.tiers[i - 1]} -> ${sidebarNav.tiers[i]})`
        );
      }

      // Select an INSUFFICIENT_EVIDENCE item lacking machine/rescue text and confirm Accept is hidden
      const missingState = await page.evaluate(async () => {
        const items = Array.from(document.querySelectorAll("[data-testid='triage-queue-item']"));
        const missingRow = items.find((el) => el.textContent.includes("No machine text"));
        if (!missingRow) return null;
        missingRow.querySelector("button")?.click();
        await new Promise((r) => setTimeout(r, 250));
        return {
          hasNoMachineBox: Boolean(document.querySelector("[data-testid='triage-no-machine-text']")),
          hasAcceptBtn: Boolean(document.querySelector("[data-testid='triage-accept-btn']")),
        };
      });
      assert(Boolean(missingState), "Found missing-proof item in queue");
      assert(missingState.hasNoMachineBox, "Evidence pane explains no machine/rescue text exists");
      assertEqual(missingState.hasAcceptBtn, false, "Accept button is HIDDEN for missing-proof item");
    });

    // -------------------------------------------------------------------------
    // Case 2: Evidence-visible gate & Vision Rescue accept + locator inspect
    // -------------------------------------------------------------------------
    await runCase("5.2 Vision Rescue label, IntersectionObserver evidenceVisible gate & inspectCitation", async () => {
      await page.goto(`${WEB_URL}/triage`);
      await sleep(700);

      // Select Vision Rescue row
      const rescueReady = await page.evaluate(async () => {
        const items = Array.from(document.querySelectorAll("[data-testid='triage-queue-item']"));
        const rescueRow = items.find((el) => el.textContent.includes("Vision Rescue"));
        if (!rescueRow) return null;
        rescueRow.querySelector("button")?.click();
        await new Promise((r) => setTimeout(r, 350));
        const card = document.querySelector("[data-testid='triage-evidence-card']");
        const acceptBtn = document.querySelector("[data-testid='triage-accept-btn']");
        return {
          hasRescueBox: Boolean(document.querySelector("[data-testid='triage-vision-rescue-text']")),
          acceptLabel: acceptBtn?.textContent?.trim() || "",
          evidenceVisible: card?.getAttribute("data-evidence-visible"),
          disabledInitially: acceptBtn?.disabled,
        };
      });

      assert(Boolean(rescueReady), "Vision Rescue item present in queue");
      assert(rescueReady.hasRescueBox, "Left pane renders Vision Rescue transcription card");
      assertEqual(rescueReady.acceptLabel, "Accept Vision Rescue Text", "Accept label is exclusively 'Accept Vision Rescue Text'");
      assertEqual(rescueReady.evidenceVisible, "true", "IntersectionObserver marks evidence visible in viewport");
      assertEqual(rescueReady.disabledInitially, false, "Accept is enabled once evidence card is visible");

      // Scroll evidence card out of left-pane viewport -> Accept MUST disable
      const scrolledOutState = await page.evaluate(async () => {
        const pane = document.querySelector("[data-testid='triage-evidence-pane']");
        const card = document.querySelector("[data-testid='triage-evidence-card']");
        if (!pane || !card) return null;
        // Ensure overflow exists if viewport is very tall
        const spacer = document.createElement("div");
        spacer.id = "e2e-scroll-spacer";
        spacer.style.height = "1200px";
        pane.appendChild(spacer);
        pane.scrollTop = card.offsetHeight + 500;
        await new Promise((r) => setTimeout(r, 300));
        const res = {
          evidenceVisible: card.getAttribute("data-evidence-visible"),
          acceptDisabled: document.querySelector("[data-testid='triage-accept-btn']")?.disabled,
        };
        pane.scrollTop = 0;
        spacer.remove();
        await new Promise((r) => setTimeout(r, 300));
        return res;
      });
      assert(Boolean(scrolledOutState), "Tested scrolling evidence card offscreen");
      assertEqual(scrolledOutState.evidenceVisible, "false", "evidenceVisible flips false when evidence card leaves left pane");
      assertEqual(scrolledOutState.acceptDisabled, true, "Accept disables when evidence card is scrolled out of view");

      // Click locator inspect button -> navigates cleanly to /workspace
      const inspectNav = await page.evaluate(async () => {
        const btn = document.querySelector("[data-testid='triage-inspect-locator-btn']");
        if (!btn) return null;
        btn.click();
        await new Promise((r) => setTimeout(r, 400));
        return window.location.pathname + window.location.search;
      });
      assert(Boolean(inspectNav), "Clickable source locator button present");
      assertIncludes(inspectNav, "/workspace?", "Locator click navigates to /workspace viewer");
    });

    // -------------------------------------------------------------------------
    // Case 3: Keyboard shortcuts (J/K/A/O/L/N + Enter, input guard) & Undo toast
    // -------------------------------------------------------------------------
    await runCase("5.3 Keyboard J/K/A/O/L/N+Enter shortcuts, input guard & single-item Undo", async () => {
      await page.goto(`${WEB_URL}/triage`);
      await sleep(700);

      const firstActiveId = await page.evaluate(
        () => document.querySelector("[data-testid='triage-queue-item'][data-active='true']")?.getAttribute("data-item-id") || ""
      );
      assert(firstActiveId.length > 0, "First queue item is active");

      // J moves next, K moves back
      await dispatchWindowKey(page, "j");
      await sleep(200);
      const secondActiveId = await page.evaluate(
        () => document.querySelector("[data-testid='triage-queue-item'][data-active='true']")?.getAttribute("data-item-id") || ""
      );
      assert(secondActiveId !== firstActiveId, "J advances active selection to next queue item");

      await dispatchWindowKey(page, "k");
      await sleep(200);
      const backToFirstId = await page.evaluate(
        () => document.querySelector("[data-testid='triage-queue-item'][data-active='true']")?.getAttribute("data-item-id") || ""
      );
      assertEqual(backToFirstId, firstActiveId, "K moves active selection back to previous item");

      // Guard: shortcuts ignored when typing in search input
      const ignoredInInput = await page.evaluate(async () => {
        const input = document.querySelector("input[aria-label='Search triage queue']");
        if (!input) return false;
        input.focus();
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 150));
        const formOpened = Boolean(document.querySelector("[data-testid='triage-legal-form']"));
        const activeNow = document.querySelector("[data-testid='triage-queue-item'][data-active='true']")?.getAttribute("data-item-id");
        input.blur();
        return !formOpened && activeNow === document.querySelector("[data-testid='triage-queue-item']")?.getAttribute("data-item-id");
      });
      assert(ignoredInInput, "Shortcuts ignored while typing in input");

      // Press L -> Legal form opens -> press Enter -> confirms ESCALATED_LEGAL + Undo toast
      await dispatchWindowKey(page, "l");
      await sleep(200);
      const legalFormOpen = await page.evaluate(() => Boolean(document.querySelector("[data-testid='triage-legal-form']")));
      assert(legalFormOpen, "L shortcut opens Flag for Legal form");

      await dispatchWindowKey(page, "Enter");
      await sleep(800);
      const legalResult = await page.evaluate(() => ({
        toastRole: document.querySelector("[data-testid='undo-toast']")?.getAttribute("role"),
        toastText: document.querySelector("[data-testid='undo-toast']")?.textContent || "",
        legalBadge: document.querySelector("[data-testid='triage-tab-escalated_legal']")?.textContent || "",
      }));
      assertEqual(legalResult.toastRole, "status", "Undo toast carries role='status'");
      assertIncludes(legalResult.toastText, "Legal", "Undo toast announces legal escalation");

      // 1-click Undo reverts item
      await page.evaluate(async () => {
        document.querySelector("[data-testid='triage-undo-btn']")?.click();
        await new Promise((r) => setTimeout(r, 800));
      });
      const toastAfterUndo = await page.evaluate(() => document.querySelector("[data-testid='undo-toast']"));
      assertEqual(toastAfterUndo, null, "1-click Undo reverts item and dismisses toast");

      // Select Vision Rescue item and press A to accept
      await page.evaluate(async () => {
        const items = Array.from(document.querySelectorAll("[data-testid='triage-queue-item']"));
        const rescueRow = items.find((el) => el.textContent.includes("Vision Rescue"));
        rescueRow?.querySelector("button")?.click();
        await new Promise((r) => setTimeout(r, 350));
      });
      await dispatchWindowKey(page, "a");
      await sleep(800);
      const acceptToast = await page.evaluate(
        () => document.querySelector("[data-testid='undo-toast']")?.textContent || ""
      );
      assertIncludes(acceptToast, "Accepted Vision Rescue Text", "A shortcut accepts Vision Rescue item and emits Undo toast");

      // Press N -> fill N/A -> confirm -> press O -> fill Override -> confirm
      await dispatchWindowKey(page, "n");
      await sleep(200);
      assert(
        await page.evaluate(() => Boolean(document.querySelector("[data-testid='triage-na-form']"))),
        "N shortcut opens N/A form"
      );
      await setControlValue(page, "select[aria-label='N/A reason code']", "OUT_OF_SCOPE_PRODUCT");
      await setControlValue(page, "input[aria-label='N/A rationale note']", "Excluded from SaaS boundary");
      await dispatchWindowKey(page, "Enter");
      await sleep(800);

      await dispatchWindowKey(page, "o");
      await sleep(200);
      assert(
        await page.evaluate(() => Boolean(document.querySelector("[data-testid='triage-override-form']"))),
        "O shortcut opens Override form"
      );
      await setControlValue(
        page,
        "input[aria-label='Substantive override answer']",
        "Compensating MFA enforcement verified by security architecture review"
      );
      await page.evaluate(async () => {
        const cb = document.querySelector("[data-testid='triage-override-form'] input[type='checkbox']");
        if (cb && !cb.checked) cb.click();
      });
      await dispatchWindowKey(page, "Enter");
      await sleep(800);
    });

    // -------------------------------------------------------------------------
    // Case 4: Resolved tab visibility & Multi-Select Bulk Action + Bulk Undo
    // -------------------------------------------------------------------------
    await runCase("5.4 Resolved tab visibility and Bulk Flag for Legal + Bulk Undo", async () => {
      await page.evaluate(async () => {
        document.querySelector("[data-testid='triage-tab-resolved']")?.click();
        await new Promise((r) => setTimeout(r, 350));
      });

      const resolvedStatuses = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid='triage-queue-item']")).map((el) => el.textContent)
      );
      assert(resolvedStatuses.some((t) => t.includes("VERIFIED")), "Resolved tab keeps VERIFIED items visible");
      assert(resolvedStatuses.some((t) => t.includes("NOT_APPLICABLE")), "Resolved tab keeps NOT_APPLICABLE items visible");
      assert(resolvedStatuses.some((t) => t.includes("HUMAN_OVERRIDE")), "Resolved tab keeps HUMAN_OVERRIDE items visible");

      // Switch back to Needs Review and bulk flag 2 items for legal, then 1-click Bulk Undo
      await page.evaluate(async () => {
        document.querySelector("[data-testid='triage-tab-pending']")?.click();
        await new Promise((r) => setTimeout(r, 300));
        const checkboxes = Array.from(document.querySelectorAll("[data-testid='triage-item-checkbox']"));
        checkboxes.slice(0, 2).forEach((cb) => cb.click());
        await new Promise((r) => setTimeout(r, 150));
        document.querySelector("[data-testid='triage-bulk-legal']")?.click();
        await new Promise((r) => setTimeout(r, 150));
        document.querySelector("[data-testid='triage-bulk-legal-confirm']")?.click();
        await new Promise((r) => setTimeout(r, 900));
      });

      const bulkState = await page.evaluate(() => ({
        undoBtnText: document.querySelector("[data-testid='triage-undo-btn']")?.textContent || "",
        legalCount: document.querySelector("[data-testid='triage-tab-escalated_legal']")?.textContent || "",
      }));
      assertIncludes(bulkState.undoBtnText, "Undo (2)", "Bulk action emits 1-click Bulk Undo (2) toast");

      await page.evaluate(async () => {
        document.querySelector("[data-testid='triage-undo-btn']")?.click();
        await new Promise((r) => setTimeout(r, 900));
      });
      const pendingAfterUndo = await page.evaluate(
        () => document.querySelectorAll("[data-testid='triage-queue-item']").length
      );
      assert(pendingAfterUndo >= 2, `Bulk Undo restored pending items (count=${pendingAfterUndo})`);
    });

    // -------------------------------------------------------------------------
    // Case 5: Surface consolidation (/workspace, ?mode=canvas, /results?filter=escalations)
    // -------------------------------------------------------------------------
    await runCase("5.5 Surface consolidation links & unified Accept rules across surfaces", async () => {
      await seedPhase5Dataset(api);

      // 1. CopilotStream (/workspace)
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(800);
      const copilotCheck = await page.evaluate(() => {
        const link = document.querySelector("[data-testid='copilot-open-triage-link']");
        const cards = Array.from(document.querySelectorAll("[data-testid='escalation-card']"));
        const emptyCard = cards.find((c) => c.textContent.includes("INSUFFICIENT EVIDENCE"));
        const emptyCardHasAccept = emptyCard
          ? Array.from(emptyCard.querySelectorAll("button")).some((b) => b.textContent.includes("Accept"))
          : false;
        const rescueCardHasAccept = cards.some((c) =>
          Array.from(c.querySelectorAll("button")).some((b) =>
            b.textContent.includes("Accept Vision Rescue Text")
          )
        );
        return {
          hasTriageLink: Boolean(link),
          emptyCardHasAccept,
          rescueCardHasAccept,
        };
      });
      assert(copilotCheck.hasTriageLink, "CopilotStream links to /triage");
      assertEqual(copilotCheck.emptyCardHasAccept, false, "CopilotStream hides Accept on missing-proof escalation");
      assert(copilotCheck.rescueCardHasAccept, "CopilotStream shows 'Accept Vision Rescue Text' on rescue item");

      // 2. BentoCanvas (?mode=canvas)
      await page.goto(`${WEB_URL}/workspace?mode=canvas`);
      await sleep(700);
      const bentoCheck = await page.evaluate(() => ({
        hasTriageLink: Boolean(document.querySelector("[data-testid='bento-open-triage-link']")),
        hasApproveFinding: Array.from(document.querySelectorAll("button")).some((b) =>
          b.textContent.includes("Approve Finding")
        ),
      }));
      assert(bentoCheck.hasTriageLink, "BentoCanvas links to /triage");
      assertEqual(bentoCheck.hasApproveFinding, false, "Legacy 'Approve Finding' button eliminated from BentoCanvas");

      // 3. ResultsPage (?filter=escalations)
      await page.goto(`${WEB_URL}/results?filter=escalations`);
      await sleep(700);
      const resultsCheck = await page.evaluate(() => ({
        hasBanner: Boolean(document.querySelector("[data-testid='results-escalations-banner']")),
        hasTriageLink: Boolean(document.querySelector("[data-testid='results-open-triage-link']")),
        hasUnifiedLegalBtn: Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent.trim() === "Flag for Legal"
        ),
      }));
      assert(resultsCheck.hasBanner, "ResultsPage activates escalations filter banner for ?filter=escalations");
      assert(resultsCheck.hasTriageLink, "ResultsPage links to /triage");
      assert(resultsCheck.hasUnifiedLegalBtn, "ResultsPage uses unified 'Flag for Legal' button label");
    });
  } finally {
    await browser.stop();
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`PHASE 5 E2E SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("--------------------------------------------------------------------------------");
  if (failed > 0) process.exit(1);
}

runPhase5BrowserSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
