/**
 * Phase 6 End-to-End Headless Chrome Verification Suite
 * Covers:
 * 1. Zero native `<select>` elements on `/results`; custom styled `<Select />` click & keyboard interaction
 * 2. Chart `metricType` ("count" vs "confidence"), `Insight Configuration` collapse toggle (`aria-expanded`)
 * 3. Filtered empty state (Envoy card + Findings table) & Chart zero-state (no phantom bars, no "100%")
 * 4. Zero Layout Shift (`getBoundingClientRect()` stability on transient download toast & inline table edit)
 * 5. Responsive `Action` column visibility (`rect.right <= viewportWidth`) and zero horizontal overflow
 *    (`scrollWidth <= innerWidth`) across `1280px`, `1024px`, `768px`, and `375px`
 * 6. Preserved contracts (`?filter=escalations`, `?tab=audit`, clickable citation -> `/workspace`, `.XLSX` modal)
 */

import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { BertApiClient } from "./e2e/lib/api.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const WEB_URL = process.env.BERT_WEB_URL || "http://localhost:5173";
const API_URL = process.env.BERT_API_URL || "http://localhost:8000";

async function dispatchElementKey(page, selector, key) {
  await page.evaluate(
    ({ sel, k }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Element not found for key dispatch: ${sel}`);
      el.focus();
      el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    },
    { sel: selector, k: key }
  );
}

async function runPhase6BrowserSuite() {
  console.log("================================================================================");
  console.log("  PHASE 6 RESULTS PAGE E2E HEADLESS CHROME VERIFICATION SUITE                   ");
  console.log("================================================================================");

  const api = new BertApiClient(API_URL);
  const browser = new HeadlessBrowser();
  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    process.stdout.write(`  [Phase6 E2E] ${name} ... `);
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
    // Case 1: Zero native <select>, custom <Select /> keyboard/click & chart metricType
    // -------------------------------------------------------------------------
    await runCase("6.1 Zero native <select> & custom <Select /> keyboard/click + confidence metric", async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/results`);
      await sleep(900);

      const initialAudit = await page.evaluate(() => {
        const nativeSelects = document.querySelectorAll("select").length;
        const comboboxIds = ["#results-data-source", "#results-metric-select", "#results-grouped-by", "#results-segmented-by"];
        const comboboxes = comboboxIds.map((id) => {
          const el = document.querySelector(id);
          return {
            id,
            exists: Boolean(el),
            role: el?.getAttribute("role"),
            expanded: el?.getAttribute("aria-expanded"),
            labelledby: el?.getAttribute("aria-labelledby"),
          };
        });
        return { nativeSelects, comboboxes };
      });

      assertEqual(initialAudit.nativeSelects, 0, "ResultsPage renders 0 native <select> elements");
      for (const cb of initialAudit.comboboxes) {
        assert(cb.exists, `Custom <Select /> present for ${cb.id}`);
        assertEqual(cb.role, "combobox", `${cb.id} has role="combobox"`);
        assertEqual(cb.expanded, "false", `${cb.id} initially has aria-expanded="false"`);
        assert(Boolean(cb.labelledby), `${cb.id} has associated aria-labelledby`);
      }

      // Keyboard navigation on Metric <Select />: ArrowDown opens -> ArrowDown moves to Confidence -> Enter commits
      await dispatchElementKey(page, "#results-metric-select", "ArrowDown");
      await sleep(120);
      const afterOpen = await page.evaluate(() => ({
        expanded: document.querySelector("#results-metric-select")?.getAttribute("aria-expanded"),
        listboxOpen: Boolean(document.querySelector("#results-metric-select-listbox")),
      }));
      assertEqual(afterOpen.expanded, "true", "ArrowDown opens custom <Select /> popup");
      assert(afterOpen.listboxOpen, "role='listbox' popup rendered");

      await dispatchElementKey(page, "#results-metric-select", "ArrowDown");
      await sleep(100);
      await dispatchElementKey(page, "#results-metric-select", "Enter");
      await sleep(250);

      const afterConfidenceSelect = await page.evaluate(() => {
        const title = document.querySelector("[data-testid='results-chart-card'] h3")?.textContent || "";
        const val = document.querySelector("#results-metric-select")?.getAttribute("data-value");
        const cols = Array.from(document.querySelectorAll("[data-testid='chart-bar-column']")).map((c) => ({
          metricVal: c.getAttribute("data-metric-value"),
          text: c.textContent || "",
          heightPct: Number(c.querySelector("[data-testid='chart-bar-fill']")?.getAttribute("data-height-percent") || "0"),
        }));
        return { title, val, cols };
      });

      assertEqual(afterConfidenceSelect.val, "confidence", "Enter committed 'confidence' metric value");
      assertIncludes(afterConfidenceSelect.title, "Average Match Confidence", "Chart heading switched to Average Match Confidence");
      assert(afterConfidenceSelect.cols.length > 0, "Confidence mode renders chart columns");
      assert(
        afterConfidenceSelect.cols.every((c) => c.text.includes("%") && c.heightPct <= 100),
        "Confidence mode displays % values and bounded bar heights <= 100%"
      );

      // Click interaction + Escape close on Segmented By
      await page.evaluate(async () => {
        document.querySelector("#results-segmented-by")?.click();
        await new Promise((r) => setTimeout(r, 150));
      });
      await dispatchElementKey(page, "#results-segmented-by", "Escape");
      await sleep(120);
      const escState = await page.evaluate(() => ({
        expanded: document.querySelector("#results-segmented-by")?.getAttribute("aria-expanded"),
        val: document.querySelector("#results-segmented-by")?.getAttribute("data-value"),
      }));
      assertEqual(escState.expanded, "false", "Escape closes <Select /> popup");
      assertEqual(escState.val, "category", "Escape preserves original value");

      // Click option in Segmented By -> Caution Level (P0–P3)
      await page.evaluate(async () => {
        document.querySelector("#results-segmented-by")?.click();
        await new Promise((r) => setTimeout(r, 150));
        const opt = Array.from(document.querySelectorAll("[role='option']")).find((o) =>
          o.textContent.includes("Caution Level")
        );
        opt?.click();
        await new Promise((r) => setTimeout(r, 200));
      });
      const segText = await page.evaluate(
        () => document.querySelector("[data-testid='results-chart-card']")?.textContent || ""
      );
      assertIncludes(segText, "Caution Tier", "Click option updates Segmented By to Caution Tier");

      // Collapse toggle on Insight Configuration (aria-expanded)
      const collapseCheck = await page.evaluate(async () => {
        const toggle = document.querySelector("[data-testid='insight-config-toggle']");
        const before = toggle?.getAttribute("aria-expanded");
        toggle?.click();
        await new Promise((r) => setTimeout(r, 150));
        const afterCollapse = toggle?.getAttribute("aria-expanded");
        const bodyHidden = !document.querySelector("#insight-configuration-body");
        toggle?.click();
        await new Promise((r) => setTimeout(r, 150));
        const afterReopen = toggle?.getAttribute("aria-expanded");
        return { before, afterCollapse, bodyHidden, afterReopen };
      });
      assertEqual(collapseCheck.before, "true", "Insight Configuration starts expanded");
      assertEqual(collapseCheck.afterCollapse, "false", "Collapse toggle updates aria-expanded to false");
      assert(collapseCheck.bodyHidden, "Collapse toggle hides configuration body");
      assertEqual(collapseCheck.afterReopen, "true", "Second click expands configuration body again");
    });

    // -------------------------------------------------------------------------
    // Case 2: Filtered Empty State + Chart Zero-State (no phantom bars, no 100%)
    // -------------------------------------------------------------------------
    await runCase("6.2 Filtered empty state & chart zero-state (no phantom bars, no 100%)", async () => {
      await page.goto(`${WEB_URL}/results`);
      await sleep(800);

      await page.evaluate(async () => {
        const input = document.querySelector("input[aria-label='Filter findings table']");
        if (!input) throw new Error("Search input missing");
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(input, "zzz-nonexistent-filter-match-0");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 250));
      });

      const emptyState = await page.evaluate(() => ({
        summaryEmptyText: document.querySelector("[data-testid='summary-empty-state']")?.textContent || "",
        defensibilityText: document.querySelector("[data-testid='metrics-defensibility-score']")?.textContent || "",
        chartZeroText: document.querySelector("[data-testid='chart-zero-state']")?.textContent || "",
        hasPhantomBars: Boolean(document.querySelector("[data-testid='results-chart-bars']")),
        tableEmptyText: document.querySelector("[data-testid='findings-table-empty-state']")?.textContent || "",
      }));

      assertIncludes(
        emptyState.summaryEmptyText,
        "0 findings match the current document/filters",
        "Envoy summary renders honest empty state"
      );
      assert(
        !emptyState.defensibilityText.includes("100%"),
        `Empty defensibility score never reports 100% (got '${emptyState.defensibilityText}')`
      );
      assertIncludes(
        emptyState.chartZeroText,
        "0 findings match the current document/filters",
        "Chart renders structured zero-state"
      );
      assertEqual(emptyState.hasPhantomBars, false, "Chart renders ZERO phantom bars when empty");
      assertIncludes(
        emptyState.tableEmptyText,
        "0 findings match the current document/filters",
        "Findings table renders styled empty state"
      );

      // Reset Filters CTA restores findings & chart bars
      await page.evaluate(async () => {
        document.querySelector("[data-testid='table-reset-filters-btn']")?.click();
        await new Promise((r) => setTimeout(r, 300));
      });
      const restoredCount = await page.evaluate(
        () => document.querySelectorAll("[data-testid^='results-row-']").length
      );
      assert(restoredCount > 0, `Reset Filters CTA restored table rows (count=${restoredCount})`);
    });

    // -------------------------------------------------------------------------
    // Case 3: Zero Layout Shift (CLS = 0) on toast notification & inline table edit
    // -------------------------------------------------------------------------
    await runCase("6.3 Zero layout shift on transient toast & inline table editing", async () => {
      await page.goto(`${WEB_URL}/results`);
      await sleep(800);

      // 3a. Measure header action buttons before & during Download Summary Report toast
      const headerRectsBefore = await page.evaluate(() => {
        const ids = [
          "results-reset-filters-btn",
          "results-export-xlsx-btn",
          "results-download-summary-btn",
        ];
        return ids.map((id) => {
          const r = document.querySelector(`[data-testid='${id}']`).getBoundingClientRect();
          return { id, left: r.left, top: r.top, width: r.width, height: r.height };
        });
      });

      await page.evaluate(async () => {
        document.querySelector("[data-testid='results-download-summary-btn']")?.click();
        await new Promise((r) => setTimeout(r, 350));
      });

      const toastAndAfterRects = await page.evaluate(() => {
        const toastText = document.querySelector("[data-testid='results-status-toast']")?.textContent || "";
        const ids = [
          "results-reset-filters-btn",
          "results-export-xlsx-btn",
          "results-download-summary-btn",
        ];
        const rects = ids.map((id) => {
          const r = document.querySelector(`[data-testid='${id}']`).getBoundingClientRect();
          return { id, left: r.left, top: r.top, width: r.width, height: r.height };
        });
        return { toastText, rects };
      });

      assertIncludes(
        toastAndAfterRects.toastText,
        "Downloaded Envoy Summary Report",
        "Transient download status toast rendered in dedicated non-shifting slot"
      );
      for (let i = 0; i < headerRectsBefore.length; i++) {
        const b = headerRectsBefore[i];
        const a = toastAndAfterRects.rects[i];
        assert(
          Math.abs(b.left - a.left) < 0.5 && Math.abs(b.top - a.top) < 0.5,
          `Zero layout shift for ${b.id} during toast (${b.left},${b.top} -> ${a.left},${a.top})`
        );
      }

      // 3b. Measure table <th> column positions before & during inline Override edit
      const tableLayoutShift = await page.evaluate(async () => {
        const headersBefore = Array.from(document.querySelectorAll("table:not(.sr-only) thead th")).map((th) => {
          const r = th.getBoundingClientRect();
          return { text: th.textContent.trim(), left: r.left, width: r.width };
        });
        const overrideBtn = Array.from(document.querySelectorAll("table:not(.sr-only) button")).find(
          (b) => b.textContent.trim() === "Override"
        );
        if (!overrideBtn) return { ok: false, reason: "Override button not found" };
        overrideBtn.click();
        await new Promise((r) => setTimeout(r, 200));

        const nativeSelectsDuringEdit = document.querySelectorAll("select").length;
        const headersAfter = Array.from(document.querySelectorAll("table:not(.sr-only) thead th")).map((th) => {
          const r = th.getBoundingClientRect();
          return { text: th.textContent.trim(), left: r.left, width: r.width };
        });
        // Cancel edit cleanly
        const cancelBtn = Array.from(document.querySelectorAll("table:not(.sr-only) button")).find(
          (b) => b.textContent.trim() === "Cancel"
        );
        cancelBtn?.click();
        return { ok: true, headersBefore, headersAfter, nativeSelectsDuringEdit };
      });

      assert(tableLayoutShift.ok, "Opened inline Override editor in table");
      assertEqual(
        tableLayoutShift.nativeSelectsDuringEdit,
        0,
        "Zero native <select> elements even while inline Override editor is open"
      );
      for (let i = 0; i < tableLayoutShift.headersBefore.length; i++) {
        const b = tableLayoutShift.headersBefore[i];
        const a = tableLayoutShift.headersAfter[i];
        assert(
          Math.abs(b.left - a.left) < 0.5 && Math.abs(b.width - a.width) < 0.5,
          `Table column '${b.text}' width/position unchanged during inline edit (${b.width}px -> ${a.width}px)`
        );
      }
    });

    // -------------------------------------------------------------------------
    // Case 4: Responsive Action column visibility & zero horizontal overflow across 4 viewports
    // -------------------------------------------------------------------------
    await runCase("6.4 Responsive layout, stacked config <1280px, & visible Action column at 1280/1024/768/375px", async () => {
      await page.goto(`${WEB_URL}/results`);
      await sleep(700);

      const viewports = [
        { width: 1280, height: 800 },
        { width: 1024, height: 800 },
        { width: 768, height: 800 },
        { width: 375, height: 812 },
      ];

      for (const vp of viewports) {
        await page.setViewport(vp);
        await sleep(300);

        const metrics = await page.evaluate(() => {
          const vw = window.innerWidth;
          const sw = document.documentElement.scrollWidth;
          const aside = document.querySelector("[data-testid='insight-configuration-sidebar']");
          const findingsCard = document.querySelector("[data-testid='results-findings-card']");
          const asideRect = aside?.getBoundingClientRect();
          const findingsRect = findingsCard?.getBoundingClientRect();

          const visibleActionCells = Array.from(
            document.querySelectorAll("[data-testid^='results-action-cell-']")
          ).filter((el) => {
            const style = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return style.display !== "none" && r.width > 0 && r.height > 0 && el.offsetParent !== null;
          });

          const cellChecks = visibleActionCells.slice(0, 5).map((cell) => {
            const cr = cell.getBoundingClientRect();
            const btns = Array.from(cell.querySelectorAll("button, a")).map((b) => {
              const br = b.getBoundingClientRect();
              return { label: b.textContent.trim(), left: br.left, right: br.right, width: br.width };
            });
            return {
              left: cr.left,
              right: cr.right,
              width: cr.width,
              btns,
            };
          });

          return {
            vw,
            sw,
            asideRect: asideRect ? { left: asideRect.left, top: asideRect.top } : null,
            findingsRect: findingsRect ? { right: findingsRect.right, bottom: findingsRect.bottom } : null,
            visibleActionCount: visibleActionCells.length,
            cellChecks,
          };
        });

        assert(
          metrics.sw <= metrics.vw,
          `Viewport ${vp.width}px has zero horizontal page overflow (scrollWidth=${metrics.sw} <= innerWidth=${metrics.vw})`
        );
        assert(
          metrics.visibleActionCount > 0,
          `Viewport ${vp.width}px renders visible Action cells/cards (${metrics.visibleActionCount})`
        );

        if (vp.width < 1280) {
          assert(
            metrics.asideRect.top >= metrics.findingsRect.bottom - 8,
            `Viewport ${vp.width}px stacks Insight Configuration below Findings (${metrics.asideRect.top} >= ${metrics.findingsRect.bottom})`
          );
        } else {
          assert(
            metrics.asideRect.left >= metrics.findingsRect.right - 8,
            `Viewport ${vp.width}px places Insight Configuration beside Findings (${metrics.asideRect.left} >= ${metrics.findingsRect.right})`
          );
        }

        for (const cell of metrics.cellChecks) {
          assert(
            cell.left >= 0 && cell.right <= metrics.vw + 1,
            `Viewport ${vp.width}px Action cell inside viewport (left=${Math.round(cell.left)}, right=${Math.round(cell.right)} <= ${metrics.vw})`
          );
          for (const btn of cell.btns) {
            assert(
              btn.left >= 0 && btn.right <= metrics.vw + 1 && btn.width > 0,
              `Viewport ${vp.width}px Action button '${btn.label}' not cut off (right=${Math.round(btn.right)} <= ${metrics.vw})`
            );
          }
        }
      }

      await page.resetViewport();
    });

    // -------------------------------------------------------------------------
    // Case 5: Preserved contracts (?filter=escalations, ?tab=audit, citation -> /workspace, XLSX modal)
    // -------------------------------------------------------------------------
    await runCase("6.5 Preserved ResultsPage contracts (?filter=escalations, ?tab=audit, citation, export modal)", async () => {
      await page.goto(`${WEB_URL}/results?filter=escalations`);
      await sleep(500);
      const escBanner = await page.evaluate(() =>
        Boolean(document.querySelector("[data-testid='results-escalations-banner']"))
      );
      assert(escBanner, "?filter=escalations preserves escalation banner");

      await page.goto(`${WEB_URL}/results?tab=audit`);
      await sleep(500);
      const auditPanel = await page.evaluate(() =>
        Boolean(document.querySelector("[data-testid='audit-ledger-panel']"))
      );
      assert(auditPanel, "?tab=audit preserves Audit Ledger view");

      // Return to /results, test XLSX warning modal + clickable citation -> /workspace
      await page.goto(`${WEB_URL}/results`);
      await sleep(600);
      const modalOpened = await page.evaluate(async () => {
        const btn = document.querySelector("[data-testid='results-export-xlsx-btn']");
        if (!btn || btn.disabled) return false;
        btn.click();
        await new Promise((r) => setTimeout(r, 200));
        const open = Boolean(document.querySelector("[data-testid='export-warning-modal']"));
        document.querySelector("[data-testid='export-warning-cancel']")?.click();
        return open;
      });
      assert(modalOpened, "Export Answered .XLSX preserves Pre-Export Warning Modal");

      const citNav = await page.evaluate(async () => {
        const citBtn = document.querySelector("table:not(.sr-only) button[title]");
        if (!citBtn) return null;
        citBtn.click();
        await new Promise((r) => setTimeout(r, 400));
        return window.location.pathname;
      });
      assertEqual(citNav, "/workspace", "Clicking verbatim citation navigates to /workspace Inspector");
    });
  } finally {
    await browser.stop();
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`PHASE 6 E2E SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("--------------------------------------------------------------------------------");
  if (failed > 0) process.exit(1);
}

runPhase6BrowserSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
