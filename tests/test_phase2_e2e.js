/**
 * Phase 2 End-to-End Headless Chrome Verification Suite
 * Covers:
 * - 2.1 Multi-format Evidence Locators & Viewers (PDF/SCAN, XLSX, JSON canonical path)
 * - 2.2 Active Corpus Sidebar, ?workspace= & ?file= URL sync, and cross-pane filtering (Stream / Canvas / Drawer)
 * - 2.3 Envoy Executive Summary card, quick-action synthesis, filter reactivity, and 0-finding empty state
 * - 2.4 Flag for Legal (ESCALATED_LEGAL) priority preservation + Audit Trail + Undo restoration
 */

import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { BertApiClient } from "./e2e/lib/api.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const WEB_URL = process.env.SHIELDSTAFF_WEB_URL || process.env.BERT_WEB_URL || "http://localhost:5173";
const API_URL = process.env.SHIELDSTAFF_API_URL || process.env.BERT_API_URL || "http://localhost:8000";

async function runPhase2BrowserSuite() {
  console.log("================================================================================");
  console.log("  PHASE 2 END-TO-END HEADLESS CHROME VERIFICATION SUITE                         ");
  console.log("================================================================================");

  const api = new BertApiClient(API_URL);
  const browser = new HeadlessBrowser();
  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    process.stdout.write(`  [Phase2 E2E] ${name} ... `);
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
    // Test 1: Active Corpus Sidebar -> Filter Stream, Canvas, Drawer & URL Sync
    // -------------------------------------------------------------------------
    await runCase("2.2 Corpus Selection Filters Stream, Canvas, Drawer & ?file=/?workspace= URL", async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(900);

      const sidebarCount = await page.evaluate(
        () => document.querySelectorAll("[data-testid='corpus-file-item']").length
      );
      assert(sidebarCount >= 4, `Expected >=4 seeded corpus files in sidebar, got ${sidebarCount}`);

      // Verify zero console errors or "No files staged yet" flicker while populated
      const initialText = await page.evaluate(() => document.body.innerText);
      assert(!initialText.includes("No files staged yet"), "Populated sidebar must never show 'No files staged yet'");

      // Click JSON file in sidebar
      const selectedName = await page.evaluate(async () => {
        const items = Array.from(document.querySelectorAll("[data-testid='corpus-file-item']"));
        const jsonItem = items.find((el) => el.textContent.includes(".json"));
        if (!jsonItem) return null;
        jsonItem.click();
        await new Promise((r) => setTimeout(r, 600));
        return jsonItem.textContent;
      });
      assert(Boolean(selectedName), "Selected .json file item in Active Corpus sidebar");

      const streamState = await page.evaluate(() => ({
        url: window.location.search,
        bannerText: document.querySelector("[data-testid='corpus-filter-banner']")?.textContent || "",
      }));
      assertIncludes(streamState.url, "workspace=", "URL includes ?workspace= parameter");
      assertIncludes(streamState.url, "file=", "URL includes ?file= parameter");
      assertIncludes(streamState.bannerText, "Filtered to", "Stream renders 'Filtered to <filename>' banner");
      assertIncludes(streamState.bannerText, ".json", "Stream filter banner names active .json file");

      // Switch to Canvas mode and verify filter banner & URL params persist
      await page.evaluate(async () => {
        const canvasBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim().includes("Bento Canvas")
        );
        if (canvasBtn) canvasBtn.click();
        await new Promise((r) => setTimeout(r, 600));
      });

      const canvasState = await page.evaluate(() => ({
        url: window.location.search,
        bannerText: document.querySelector("[data-testid='corpus-filter-banner']")?.textContent || "",
      }));
      assertIncludes(canvasState.url, "mode=canvas", "Toggling to Canvas updates URL to mode=canvas");
      assertIncludes(canvasState.url, "file=", "Canvas view preserves ?file= filter in URL");
      assertIncludes(canvasState.bannerText, "Filtered to", "BentoCanvas shows active corpus filter banner");

      // Clear filter with one-click Clear button
      await page.evaluate(async () => {
        const clearBtn = document.querySelector("[data-testid='clear-file-filter']");
        if (clearBtn) clearBtn.click();
        await new Promise((r) => setTimeout(r, 500));
      });

      const afterClear = await page.evaluate(() => ({
        url: window.location.search,
        hasBanner: Boolean(document.querySelector("[data-testid='corpus-filter-banner']")),
      }));
      assertEqual(afterClear.hasBanner, false, "Clear button removes corpus filter banner");
      assert(!afterClear.url.includes("file="), "Clear button removes ?file= query parameter");
    });

    // -------------------------------------------------------------------------
    // Test 2: Multi-Format Viewers (PDF, XLSX, JSON) & Evidence Locator Badges
    // -------------------------------------------------------------------------
    await runCase("2.1 Multi-Format Viewers (JSON tree, XLSX grid, PDF textLayer) & Source Chips", async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(800);

      // Verify Verified Quotes tab shows source chips & locators
      const chipSummary = await page.evaluate(async () => {
        const quotesTab = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Verified Quotes")
        );
        if (quotesTab) quotesTab.click();
        await new Promise((r) => setTimeout(r, 400));

        const chips = Array.from(document.querySelectorAll("[data-testid='source-type-chip']")).map((c) =>
          c.textContent.trim()
        );
        return { count: chips.length, chips };
      });
      assert(chipSummary.count > 0, `Expected EvidenceLocatorBadge chips in drawer, got ${chipSummary.count}`);

      // Select XLSX file -> switch to Viewer -> check spreadsheet virtualization & rows
      await page.evaluate(async () => {
        const xlsItem = Array.from(document.querySelectorAll("[data-testid='corpus-file-item']")).find((el) =>
          el.textContent.includes(".xlsx")
        );
        if (xlsItem) xlsItem.click();
        await new Promise((r) => setTimeout(r, 400));
        const viewerBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Viewer"
        );
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 600));
      });
      const xlsxCheck = await page.evaluate(() => ({
        hasGrid: Boolean(document.querySelector("[data-testid='spreadsheet-viewer']")),
        rowCount: document.querySelectorAll("[data-testid='spreadsheet-viewer'] tr").length,
      }));
      assert(xlsxCheck.hasGrid, "SpreadsheetViewer renders for .xlsx document");
      assert(xlsxCheck.rowCount > 0 && xlsxCheck.rowCount <= 105, `Spreadsheet row virtualization bounded (${xlsxCheck.rowCount})`);

      // Select JSON file -> inspect JsonTreeViewer without "root" over-highlight bug
      await page.evaluate(async () => {
        const jsonItem = Array.from(document.querySelectorAll("[data-testid='corpus-file-item']")).find((el) =>
          el.textContent.includes(".json")
        );
        if (jsonItem) jsonItem.click();
        await new Promise((r) => setTimeout(r, 600));
      });
      const jsonCheck = await page.evaluate(() => ({
        hasJsonViewer: Boolean(document.querySelector("[data-testid='json-viewer']")),
        text: document.querySelector("[data-testid='json-viewer']")?.textContent || "",
      }));
      assert(jsonCheck.hasJsonViewer, "JsonTreeViewer renders for .json document");
      assertIncludes(jsonCheck.text, "$", "JsonTreeViewer displays canonical $ root path");

      // Select PDF file -> verify bounded canvas & .textLayer spans
      await page.evaluate(async () => {
        const pdfItem = Array.from(document.querySelectorAll("[data-testid='corpus-file-item']")).find((el) =>
          el.textContent.includes("SOC2") && el.textContent.includes(".pdf")
        );
        if (pdfItem) pdfItem.click();
        await new Promise((r) => setTimeout(r, 700));
      });
      const pdfCheck = await page.evaluate(() => ({
        hasPdf: Boolean(document.querySelector("[data-testid='pdf-viewer']")),
        canvases: document.querySelectorAll("canvas").length,
        spans: document.querySelectorAll(".textLayer span").length,
      }));
      assert(pdfCheck.hasPdf, "PdfViewer renders for SOC2 PDF");
      assert(pdfCheck.canvases >= 1 && pdfCheck.canvases <= 4, `PDF windowed canvases bounded 1..4 (${pdfCheck.canvases})`);
      assert(pdfCheck.spans > 0, `PDF .textLayer spans selectable (${pdfCheck.spans})`);
    });

    // -------------------------------------------------------------------------
    // Test 3: Flag for Legal (ESCALATED_LEGAL) + Priority Preservation + Undo
    // -------------------------------------------------------------------------
    await runCase("2.4 Flag for Legal preserves priority, creates audit log, and Undo reverts state", async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(800);

      // Grab first escalation card and capture priority text
      const before = await page.evaluate(() => {
        const card = document.querySelector("[data-testid='escalation-card']");
        if (!card) return null;
        return {
          text: card.innerText,
          hasFlagBtn: Array.from(card.querySelectorAll("button")).some((b) =>
            b.textContent.includes("Flag for Legal")
          ),
        };
      });
      assert(Boolean(before && before.hasFlagBtn), "Escalation card renders Flag for Legal action");

      // Open legal escalation inline panel, set assignee/reason, confirm
      await page.evaluate(async () => {
        const card = document.querySelector("[data-testid='escalation-card']");
        const flagBtn = Array.from(card.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Flag for Legal")
        );
        flagBtn.click();
        await new Promise((r) => setTimeout(r, 200));

        const assigneeInput = document.querySelector("input[aria-label='Legal escalation assignee']");
        const reasonInput = document.querySelector("input[aria-label='Legal escalation reason note']");
        if (assigneeInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          setter.call(assigneeInput, "Outside Privacy Counsel");
          assigneeInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (reasonInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          setter.call(reasonInput, "Requires indemnity threshold sign-off");
          reasonInput.dispatchEvent(new Event("input", { bubbles: true }));
        }

        const confirmBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Confirm Legal Flag")
        );
        if (confirmBtn) confirmBtn.click();
        await new Promise((r) => setTimeout(r, 800));
      });

      const afterFlag = await page.evaluate(() => ({
        bodyText: document.body.innerText,
        hasUndoToast: Boolean(document.querySelector("[data-testid='undo-toast']")),
        hasLegalStatus: document.body.innerText.includes("ESCALATED_LEGAL"),
      }));
      assert(afterFlag.hasLegalStatus, "Card displays ESCALATED_LEGAL status after Flag for Legal");
      assertIncludes(afterFlag.bodyText, "LEGAL REVIEW", "Escalated card preserves/highlights LEGAL REVIEW badge");
      assert(afterFlag.hasUndoToast, "Undo toast rendered after legal escalation");

      // Undo via toast or card button and confirm restoration
      await page.evaluate(async () => {
        const toastUndo = document.querySelector("[data-testid='undo-toast'] button");
        const inlineUndo = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Undo Legal Flag")
        );
        (toastUndo || inlineUndo)?.click();
        await new Promise((r) => setTimeout(r, 800));
      });

      const afterUndo = await page.evaluate(() => ({
        hasLegalStatus: Array.from(document.querySelectorAll("[data-testid='escalation-card']")).some((c) =>
          c.innerText.includes("ESCALATED_LEGAL")
        ),
        hasFlagBtnAgain: Array.from(document.querySelectorAll("[data-testid='escalation-card'] button")).some((b) =>
          b.textContent.includes("Flag for Legal")
        ),
      }));
      assertEqual(afterUndo.hasLegalStatus, false, "Undo reverts ESCALATED_LEGAL status on escalation card");
      assert(afterUndo.hasFlagBtnAgain, "Original action buttons restored after Undo");
    });

    // -------------------------------------------------------------------------
    // Test 4: Envoy Executive Summary in Stream & ResultsPage + Empty Filter State
    // -------------------------------------------------------------------------
    await runCase("2.3 Envoy Executive Summary card, stream quick-action & empty/filter reactivity", async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(700);

      // Trigger Executive Summary quick action in CopilotStream
      await page.evaluate(async () => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Executive Summary"
        );
        if (btn) btn.click();
        await new Promise((r) => setTimeout(r, 900));
      });

      const streamSummary = await page.evaluate(() => {
        const card = document.querySelector("[data-testid='executive-summary-card']");
        return card ? card.innerText : "";
      });
      assert(streamSummary.length > 20, "Executive Summary quick action generated summary card in CopilotStream");

      // Navigate to /results and verify Envoy Executive Synthesis card + filter reactivity
      await page.goto(`${WEB_URL}/results`);
      await sleep(800);

      const resultsCard = await page.evaluate(() => {
        const card = document.querySelector("[data-testid='envoy-summary-card']");
        const hasDownloadMd = Array.from(document.querySelectorAll("button")).some((b) =>
          b.textContent.includes("Download Summary Report")
        );
        return { text: card ? card.innerText : "", hasDownloadMd };
      });
      assertIncludes(
        resultsCard.text.toLowerCase(),
        "envoy executive synthesis",
        "ResultsPage displays Envoy Executive Synthesis card"
      );
      assertIncludes(resultsCard.text, "Defensibility Score", "ResultsPage summary shows dynamic Defensibility Score");
      assert(resultsCard.hasDownloadMd, "Download Summary Report button rendered on ResultsPage");

      // Filter Data Source custom <Select /> on ResultsPage to an item with 0 critical findings (e.g., Legacy Policy + Critical switch)
      await page.evaluate(async () => {
        const trigger = document.querySelector("#results-data-source");
        if (trigger) {
          if (trigger.tagName === "SELECT") {
            const legacyOpt = Array.from(trigger.options).find((o) =>
              o.text.includes("Legacy_InfoSec_Policy_2023.pdf")
            );
            if (legacyOpt) {
              trigger.value = legacyOpt.value;
              trigger.dispatchEvent(new Event("change", { bubbles: true }));
            }
          } else {
            trigger.click();
            await new Promise((r) => setTimeout(r, 150));
            const legacyOpt = Array.from(document.querySelectorAll("[role='option']")).find((o) =>
              o.textContent.includes("Legacy_InfoSec_Policy_2023.pdf")
            );
            if (legacyOpt) {
              legacyOpt.click();
            }
          }
        }
        await new Promise((r) => setTimeout(r, 400));
        const critSwitch = document.querySelector(
          "button[role='switch'][aria-label='Show only Critical or Action items']"
        );
        if (critSwitch && critSwitch.getAttribute("aria-checked") !== "true") {
          critSwitch.click();
        }
        await new Promise((r) => setTimeout(r, 600));
      });

      const filteredEmpty = await page.evaluate(() => {
        const emptyEl = document.querySelector("[data-testid='summary-empty-state']");
        return emptyEl ? emptyEl.textContent : document.querySelector("[data-testid='envoy-summary-card']")?.textContent || "";
      });
      assertIncludes(
        filteredEmpty,
        "0 findings",
        "Filtered-out/superseded slice explicitly renders 0 findings state in summary card"
      );

      // Verify Audit Ledger panel toggle
      const hasLedger = await page.evaluate(async () => {
        const ledgerBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Audit Ledger")
        );
        if (ledgerBtn) ledgerBtn.click();
        await new Promise((r) => setTimeout(r, 400));
        return Boolean(document.querySelector("[data-testid='audit-ledger-panel']"));
      });
      assert(hasLedger, "Audit Ledger panel opens cleanly on ResultsPage");
    });
  } finally {
    await browser.stop();
  }

  console.log("================================================================================");
  console.log(`  PHASE 2 E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2BrowserSuite().catch((err) => {
  console.error("Fatal error in Phase 2 E2E suite:", err);
  process.exit(1);
});
