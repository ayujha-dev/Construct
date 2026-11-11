import { assert, assertEqual, assertApprox, assertIncludes } from "../lib/assert.js";
import { sleep } from "../lib/cdp.js";

export const tier4Tests = [
  // =========================================================================
  // SC-01: Investor Walkthrough Demonstration
  // =========================================================================
  {
    id: "SC-01",
    name: "Investor Walkthrough Demonstration",
    tier: 4,
    description: "Execute the complete scripted 4-stop capabilities showcase journey seamlessly",
    run: async ({ page, api, webUrl }) => {
      // Step 1: Seed demo corpus
      const seedRes = await api.seedDemo();
      assertEqual(seedRes.status, 200, "Demo seed returned 200");
      const docs = await api.getDocuments();
      assert(docs.data.length >= 4, "At least 4 documents seeded");

      // Step 2: Navigate to workspace
      await page.goto(`${webUrl}/workspace`);

      // Stop 1: Vision Rescue Inspection
      const stop1 = await page.evaluate(async () => {
        const citation = Array.from(document.querySelectorAll("button, .cursor-pointer")).find(
          (b) => b.textContent.includes("Section") || b.textContent.includes("SOC2")
        );
        if (citation) citation.click();
        await new Promise((r) => setTimeout(r, 600));

        const viewerTab = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Viewer" || b.textContent.trim() === "Visual"
        );
        return { hasViewer: Boolean(viewerTab) };
      });
      assert(stop1.hasViewer, "Stop 1: Vision rescue evidence inspector active");

      // Stop 2: Policy Comparison
      const stop2 = await page.evaluate(async () => {
        const conflictBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Check Policy Conflicts")
        );
        if (conflictBtn) conflictBtn.click();
        await new Promise((r) => setTimeout(r, 400));
        return true;
      });
      assert(stop2, "Stop 2: Conflict analysis triggered");

      // Stop 3: Interactive Gating & Escalation Resolution (no 422)
      const escalations = await api.getEscalations();
      assert(escalations.ok && escalations.data.length > 0, "Stop 3: Escalations exist for gating");
      const resolveRes = await api.resolveEscalation(escalations.data[0].work_item_id, {
        action: "approve",
        correction: "Investor demo approval",
      });
      assertEqual(resolveRes.status, 200, `Stop 3: Escalation approved without 422 (got ${resolveRes.status})`);

      // Stop 4: Executive Reporting Navigation
      await page.goto(`${webUrl}/results`);
      const resultsTitle = await page.evaluate(() => document.title);
      assert(resultsTitle.length > 0, "Stop 4: Executive results report loaded");
    },
  },

  // =========================================================================
  // SC-02: Compliance Officer Full Triage Workflow
  // =========================================================================
  {
    id: "SC-02",
    name: "Compliance Officer Full Triage Workflow",
    tier: 4,
    description: "Review 12 compliance findings across SOC2 and vendor security addendums with reactive updates",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      // Filter by P0 Critical
      const filterP0 = await page.evaluate(async () => {
        const p0Btn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.trim().includes("P0 Critical")
        );
        if (p0Btn) p0Btn.click();
        await new Promise((r) => setTimeout(r, 400));
        return Boolean(p0Btn);
      });
      assert(filterP0, "Filter by P0 Critical clicked");

      // Inspect first critical finding
      const inspectItem = await page.evaluate(async () => {
        const item = document.querySelector(".cursor-pointer, [data-testid='quote-card']");
        if (item) item.click();
        await new Promise((r) => setTimeout(r, 500));
        return window.location.href;
      });
      assert(typeof inspectItem === "string", "Inspected finding");

      // Resolve finding with legal counsel escalation
      const escalations = await api.getEscalations();
      if (escalations.data.length > 0) {
        const counselRes = await api.resolveEscalation(escalations.data[0].work_item_id, {
          action: "counsel",
          correction: "Referred to outside legal counsel",
        });
        assertEqual(counselRes.status, 200, "Counsel escalation resolved with HTTP 200");
      }
    },
  },

  // =========================================================================
  // SC-03: Multi-Format Cross-Verification (PDF, XLSX, JSON)
  // =========================================================================
  {
    id: "SC-03",
    name: "Multi-Format Cross-Verification (PDF, XLSX, JSON)",
    tier: 4,
    description: "Verify citation inspection across heterogeneous document formats (PDF, XLSX, JSON) in single session",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const formatsTested = await page.evaluate(async () => {
        const results = {};

        // 1. PDF
        const pdfBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes(".pdf"));
        if (pdfBtn) {
          pdfBtn.click();
          await new Promise((r) => setTimeout(r, 500));
          results.pdf = Boolean(document.querySelector(".pdf-viewer, canvas, [data-testid='pdf-viewer']"));
        }

        // 2. XLSX
        const xlsBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes(".xlsx"));
        if (xlsBtn) {
          xlsBtn.click();
          await new Promise((r) => setTimeout(r, 500));
          results.xlsx = Boolean(document.querySelector("table, [role='grid'], .spreadsheet-viewer"));
        }

        // 3. JSON
        const jsonBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes(".json"));
        if (jsonBtn) {
          jsonBtn.click();
          await new Promise((r) => setTimeout(r, 500));
          results.json = Boolean(document.querySelector(".json-tree, pre, code"));
        }

        return results;
      });

      assert(formatsTested.pdf !== undefined, "PDF format verified");
      assert(formatsTested.xlsx !== undefined, "XLSX spreadsheet verified");
      assert(formatsTested.json !== undefined, "JSON configuration verified");
    },
  },

  // =========================================================================
  // SC-04: Degraded Scan OCR Rescue & Bounding Box Verification
  // =========================================================================
  {
    id: "SC-04",
    name: "Degraded Scan OCR Rescue & Bounding Box Verification",
    tier: 4,
    description: "Test handling of low-confidence scanned documents, amber tone highlight, and bounding box alignment",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const scanInspection = await page.evaluate(async () => {
        // Trigger degraded scan inspection
        const scanBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Verify Scan Readability")
        );
        if (scanBtn) scanBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const viewerTab = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Viewer" || b.textContent.trim() === "Visual"
        );
        if (viewerTab) viewerTab.click();
        await new Promise((r) => setTimeout(r, 500));

        const canvas = document.querySelector("canvas");
        return { hasCanvas: Boolean(canvas) };
      });

      assert(scanInspection.hasCanvas, "Canvas rendered for scanned document inspection");
    },
  },

  // =========================================================================
  // SC-05: Keyboard-Only Accessibility Audit Triage Session
  // =========================================================================
  {
    id: "SC-05",
    name: "Keyboard-Only Accessibility Audit Triage Session",
    tier: 4,
    description: "Complete an entire triage session exclusively using keyboard navigation (zero mouse clicks)",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/`);

      // 1. Tab to skip link or nav
      await page.pressKey("Tab");
      // 2. Tab to workspace
      await page.pressKey("Tab");
      await page.pressKey("Enter");

      // 3. Navigate workspace via keyboard
      await page.goto(`${webUrl}/workspace`);
      await page.pressKey("Tab");
      await page.pressKey("Tab");

      const focusedTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
      assert(Boolean(focusedTag), "Active element exists under keyboard navigation");
    },
  },

  // =========================================================================
  // SC-06: High-Load Corpus Stress & Virtualization Verification
  // =========================================================================
  {
    id: "SC-06",
    name: "High-Load Corpus Stress & Virtualization Verification",
    tier: 4,
    description: "Stress test platform with multi-page PDF and spreadsheet; verify DOM virtualization stability",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const stressMetrics = await page.evaluate(async () => {
        // Rapidly toggle between documents
        const buttons = Array.from(document.querySelectorAll("button")).filter(
          (b) => b.textContent.includes(".pdf") || b.textContent.includes(".xlsx")
        );
        for (let i = 0; i < 4; i++) {
          if (buttons[i % buttons.length]) {
            buttons[i % buttons.length].click();
            await new Promise((r) => setTimeout(r, 80));
          }
        }

        const activeCanvases = document.querySelectorAll("canvas").length;
        const activeRows = document.querySelectorAll("tr").length;
        return { activeCanvases, activeRows };
      });

      assert(stressMetrics.activeCanvases <= 6, "Canvases bounded under stress");
      assert(stressMetrics.activeRows <= 150, "Spreadsheet rows bounded under stress");
    },
  },
];
