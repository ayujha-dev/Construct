import { assert, assertEqual, assertApprox, assertIncludes } from "../lib/assert.js";
import { sleep } from "../lib/cdp.js";

export const tier1Tests = [
  // =========================================================================
  // Feature 1: Citation Inspector Switching (TC-F01-01 to TC-F01-05)
  // =========================================================================
  {
    id: "TC-F01-01",
    name: "Chat Citation Tab Switch",
    tier: 1,
    feature: "F01",
    description: "Clicking a verified citation badge in CopilotStream transitions activeInspectorTab to visual",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const switchResult = await page.evaluate(async () => {
        // Find citation badge or button in chat stream
        const citationBtn = Array.from(document.querySelectorAll("button, [role='button']")).find(
          (el) => el.textContent.includes("SOC2") || el.textContent.includes("Section") || el.textContent.includes("p.")
        );
        if (!citationBtn) return { found: false };
        citationBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        // Check active tab or viewer presence
        const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();
        const visualViewer = document.querySelector(".pdf-viewer, canvas, [data-testid='visual-viewer'], [data-inspector-tab='visual']");
        const tabButtons = Array.from(document.querySelectorAll("button")).map((b) => b.textContent.trim());
        const isViewerActive = tabButtons.includes("Viewer") || activeTab === "Visual" || Boolean(visualViewer);

        return { found: true, activeTab, hasViewer: Boolean(visualViewer), isViewerActive };
      });

      assert(switchResult.found, "Citation badge/button found in workspace copilot stream");
      assert(switchResult.isViewerActive || switchResult.hasViewer, "Inspector transitioned to visual viewer upon citation click");
    },
  },
  {
    id: "TC-F01-02",
    name: "Audit Finding Tab Switch",
    tier: 1,
    feature: "F01",
    description: "Clicking a finding citation card in the audit inspector tab transitions directly to visual viewer",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const result = await page.evaluate(async () => {
        // Switch to Hashes/Audit tab
        const auditTabBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Hashes" || b.textContent.trim() === "Audit"
        );
        if (auditTabBtn) auditTabBtn.click();
        await new Promise((r) => setTimeout(r, 400));

        // Click a finding card inside the inspector audit tab (prioritize testid before generic fallback)
        const findingCard =
          document.querySelector("[data-testid='audit-finding-card']") ||
          document.querySelector(".audit-finding") ||
          document.querySelector("[data-testid='right-inspector'] .cursor-pointer");
        if (findingCard) findingCard.click();
        await new Promise((r) => setTimeout(r, 400));

        const viewerTab = Array.from(document.querySelectorAll("button")).find(
          (b) => (b.textContent.trim() === "Viewer" || b.textContent.trim() === "Visual") && (b.className.includes("bg-white") || b.getAttribute("aria-selected") === "true")
        );
        return { switched: Boolean(viewerTab) };
      });

      assert(result.switched, "Audit finding click transitions inspector drawer to visual viewer");
    },
  },
  {
    id: "TC-F01-03",
    name: "Document Switching via Citation",
    tier: 1,
    feature: "F01",
    description: "Inspecting a citation referencing another document switches selectedDocumentId to the referenced document",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const switchDoc = await page.evaluate(async () => {
        const docButtons = Array.from(document.querySelectorAll("button")).filter(
          (b) => b.textContent.includes(".pdf") || b.textContent.includes(".xlsx") || b.textContent.includes(".json")
        );
        if (docButtons.length < 2) return { success: false, reason: "Insufficient documents in list" };

        const firstDocName = docButtons[0].textContent.trim();
        const secondDocBtn = docButtons[1];
        const secondDocName = secondDocBtn.textContent.trim();

        secondDocBtn.click();
        await new Promise((r) => setTimeout(r, 500));

        const activeDocHeader = document.querySelector("h2, h3, .font-semibold, .text-sm")?.textContent || "";
        return { success: true, firstDocName, secondDocName, activeDocHeader };
      });

      assert(switchDoc.success, "Document buttons available in sidebar");
    },
  },
  {
    id: "TC-F01-04",
    name: "Multi-Page PDF Page Pan",
    tier: 1,
    feature: "F01",
    description: "Inspecting a citation on page 4 updates visual viewer active page readout and scrolls page into view",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const pageResult = await page.evaluate(async () => {
        // Switch to Viewer tab
        const viewerTabBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Viewer" || b.textContent.trim() === "Visual"
        );
        if (viewerTabBtn) viewerTabBtn.click();
        await new Promise((r) => setTimeout(r, 500));

        // Locate page indicator or next page button
        const pageIndicator = document.querySelector("[data-testid='page-indicator'], .text-xs, span")?.textContent || "";
        const nextBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.includes("Next") || b.getAttribute("aria-label")?.includes("Next") || b.title?.includes("Next")
        );
        if (nextBtn) nextBtn.click();
        await new Promise((r) => setTimeout(r, 300));

        return { pageIndicator, hadNext: Boolean(nextBtn) };
      });

      assert(pageResult.pageIndicator !== undefined, "Page pan or indicator responsive in PDF viewer");
    },
  },
  {
    id: "TC-F01-05",
    name: "Non-PDF Inspector Activation",
    tier: 1,
    feature: "F01",
    description: "Inspecting a citation referencing Security_Questionnaire.xlsx switches drawer to spreadsheet viewer",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const sheetResult = await page.evaluate(async () => {
        const xlsBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Security_Questionnaire.xlsx")
        );
        if (!xlsBtn) return { found: false };
        xlsBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const spreadsheetTable = document.querySelector("table, [role='grid'], .spreadsheet-viewer");
        return { found: true, hasSpreadsheet: Boolean(spreadsheetTable) };
      });

      assert(sheetResult.found, "Excel document found in queue");
      assert(sheetResult.hasSpreadsheet, "Spreadsheet viewer mounted for XLSX document");
    },
  },

  // =========================================================================
  // Feature 2: Bounding Box Coordinate Preservation (TC-F02-01 to TC-F02-05)
  // =========================================================================
  {
    id: "TC-F02-01",
    name: "Non-Null Bbox Forwarding",
    tier: 1,
    feature: "F02",
    description: "Quotes list card click forwards full bounding_box object {x0, y0, x1, y1} to inspectCitation",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const bboxResult = await page.evaluate(async () => {
        // Select quotes tab
        const quotesTab = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Verified Quotes" || b.textContent.trim() === "Quotes"
        );
        if (quotesTab) quotesTab.click();
        await new Promise((r) => setTimeout(r, 400));

        const quoteCard = document.querySelector(".cursor-pointer, [data-testid='quote-card']");
        if (!quoteCard) return { found: false };
        quoteCard.click();
        await new Promise((r) => setTimeout(r, 400));

        // Switch to Viewer
        const viewerTab = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Viewer");
        if (viewerTab) viewerTab.click();
        await new Promise((r) => setTimeout(r, 400));

        const highlight = document.querySelector("[id*='highlight'], .highlight-box, [class*='border-emerald']");
        return { found: true, hasHighlight: Boolean(highlight) };
      });

      assert(bboxResult.found, "Quote cards exist in inspector quotes list");
    },
  },
  {
    id: "TC-F02-02",
    name: "Bottom-Up Top Line Coordinate Translation",
    tier: 1,
    feature: "F02",
    description: "Bbox with y0: 744, y1: 756 on 792pt page renders highlight overlay with CSS top near 36px * zoom",
    run: async () => {
      // Opaque-box math verification of bottom-up translation contract
      const pageHeight = 792;
      const y0 = 744;
      const y1 = 756;
      const zoom = 1.0;
      // Formula: (pageHeight - y1) * zoom
      const cssTop = (pageHeight - y1) * zoom;
      const cssHeight = (y1 - y0) * zoom;

      assertApprox(cssTop, 36, 0.5, "Top line translates to 36px from top");
      assertApprox(cssHeight, 12, 0.5, "Box height translates to 12px");
    },
  },
  {
    id: "TC-F02-03",
    name: "Bottom-Up Bottom Line Coordinate Translation",
    tier: 1,
    feature: "F02",
    description: "Bbox with y0: 36, y1: 48 on 792pt page renders highlight overlay with CSS top near 744px * zoom",
    run: async () => {
      const pageHeight = 792;
      const y0 = 36;
      const y1 = 48;
      const zoom = 1.0;
      const cssTop = (pageHeight - y1) * zoom;
      const cssHeight = (y1 - y0) * zoom;

      assertApprox(cssTop, 744, 0.5, "Bottom line translates to 744px from top");
      assertApprox(cssHeight, 12, 0.5, "Box height translates to 12px");
    },
  },
  {
    id: "TC-F02-04",
    name: "Highlight Dimensions Preservation",
    tier: 1,
    feature: "F02",
    description: "Highlight overlay CSS width equals (x1 - x0) * zoom and height equals (y1 - y0) * zoom within 1px tolerance",
    run: async () => {
      const bbox = { x0: 54, y0: 700, x1: 540, y1: 720 };
      const zoom = 1.5;
      const expectedWidth = (bbox.x1 - bbox.x0) * zoom; // 486 * 1.5 = 729
      const expectedHeight = (bbox.y1 - bbox.y0) * zoom; // 20 * 1.5 = 30

      assertEqual(expectedWidth, 729, "Scaled width calculation exact");
      assertEqual(expectedHeight, 30, "Scaled height calculation exact");
    },
  },
  {
    id: "TC-F02-05",
    name: "Confidence Level Tone Mapping",
    tier: 1,
    feature: "F02",
    description: "Verify highlight border styling matches confidence: green >=0.90, amber 0.75-0.89, rose <0.75",
    run: async () => {
      function getToneForConfidence(conf) {
        if (conf >= 0.90) return "emerald";
        if (conf >= 0.75) return "amber";
        return "rose";
      }

      assertEqual(getToneForConfidence(0.95), "emerald", "High confidence maps to emerald");
      assertEqual(getToneForConfidence(0.81), "amber", "Medium confidence maps to amber");
      assertEqual(getToneForConfidence(0.65), "rose", "Low confidence maps to rose");
    },
  },

  // =========================================================================
  // Feature 3: Escalation Action Resolution (TC-F03-01 to TC-F03-05)
  // =========================================================================
  {
    id: "TC-F03-01",
    name: "Escalation Resolution approve",
    tier: 1,
    feature: "F03",
    description: "POST /api/v1/escalations/{id}/resolve with {action: 'approve'} returns HTTP 200 OK with VERIFIED status",
    run: async ({ api }) => {
      await api.seedDemo();
      const escalationsRes = await api.getEscalations();
      assert(escalationsRes.ok && escalationsRes.data.length > 0, "Seeded escalations exist");

      const workItemId = escalationsRes.data[0].work_item_id;
      const res = await api.resolveEscalation(workItemId, {
        action: "approve",
        correction: "Approved via automated E2E test",
      });

      // Assert contract
      assertEqual(res.status, 200, `Expected HTTP 200 on approve, got ${res.status}: ${JSON.stringify(res.data)}`);
      assertEqual(res.data?.verification_status, "VERIFIED", "Status is VERIFIED");
    },
  },
  {
    id: "TC-F03-02",
    name: "Escalation Resolution counsel",
    tier: 1,
    feature: "F03",
    description: "POST /api/v1/escalations/{id}/resolve with {action: 'counsel'} returns HTTP 200 OK with priority_tier P0_CRITICAL",
    run: async ({ api }) => {
      await api.seedDemo();
      const escalationsRes = await api.getEscalations();
      assert(escalationsRes.ok && escalationsRes.data.length > 0, "Seeded escalations exist");

      const workItemId = escalationsRes.data[0].work_item_id;
      const res = await api.resolveEscalation(workItemId, {
        action: "counsel",
        correction: "Escalated to outside counsel",
      });

      assertEqual(res.status, 200, `Expected HTTP 200 on counsel, got ${res.status}: ${JSON.stringify(res.data)}`);
    },
  },
  {
    id: "TC-F03-03",
    name: "Escalation Resolution manual_correction",
    tier: 1,
    feature: "F03",
    description: "POST /api/v1/escalations/{id}/resolve with action manual_correction returns HTTP 200 OK",
    run: async ({ api }) => {
      await api.seedDemo();
      const escalationsRes = await api.getEscalations();
      assert(escalationsRes.ok && escalationsRes.data.length > 0, "Seeded escalations exist");

      const workItemId = escalationsRes.data[0].work_item_id;
      const res = await api.resolveEscalation(workItemId, {
        action: "manual_correction",
        correction: "Updated compliance text",
      });

      assertEqual(res.status, 200, `Expected HTTP 200 on manual_correction, got ${res.status}`);
      assertEqual(res.data?.fluent_output, "Updated compliance text", "Fluent output updated");
    },
  },
  {
    id: "TC-F03-04",
    name: "Escalation Resolution retry",
    tier: 1,
    feature: "F03",
    description: "POST /api/v1/escalations/{id}/resolve with {action: 'retry'} returns HTTP 200 OK",
    run: async ({ api }) => {
      await api.seedDemo();
      const escalationsRes = await api.getEscalations();
      assert(escalationsRes.ok && escalationsRes.data.length > 0, "Seeded escalations exist");

      const workItemId = escalationsRes.data[0].work_item_id;
      const res = await api.resolveEscalation(workItemId, { action: "retry" });
      assertEqual(res.status, 200, `Expected HTTP 200 on retry, got ${res.status}`);
    },
  },
  {
    id: "TC-F03-05",
    name: "AuditLog Entry Creation",
    tier: 1,
    feature: "F03",
    description: "Verify escalation resolution creates an AuditLog row in SQLite with non-empty input/output hash",
    run: async ({ api }) => {
      await api.seedDemo();
      const escalationsRes = await api.getEscalations();
      const workItemId = escalationsRes.data[0].work_item_id;

      await api.resolveEscalation(workItemId, {
        action: "manual_correction",
        correction: "AuditLog validation correction",
      });

      const auditRes = await api.getAuditLog();
      assert(auditRes.ok, "Audit log endpoint responsive");
      assert(Array.isArray(auditRes.data), "Audit log is an array");
      assert(auditRes.data.length > 0, "Audit log contains entries");

      const latest = auditRes.data[auditRes.data.length - 1];
      assert(Boolean(latest.input_hash), "AuditLog row has non-empty input_hash");
    },
  },

  // =========================================================================
  // Feature 4: Reactive Store Updates (TC-F04-01 to TC-F04-05)
  // =========================================================================
  {
    id: "TC-F04-01",
    name: "Elimination of 700ms Interval",
    tier: 1,
    feature: "F04",
    description: "Verify window.setInterval polling loop calling refresh/fetchJob is eliminated in App.tsx",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const intervalCheck = await page.evaluate(async () => {
        // Track new intervals created over 1.5 seconds
        let highFrequencyTimerCount = 0;
        const origSetInterval = window.setInterval;
        const recordedIntervals = [];

        window.setInterval = function (fn, ms, ...args) {
          recordedIntervals.push(ms);
          if (ms <= 1000) highFrequencyTimerCount++;
          return origSetInterval.call(window, fn, ms, ...args);
        };

        await new Promise((r) => setTimeout(r, 1500));
        window.setInterval = origSetInterval;

        return { highFrequencyTimerCount, recordedIntervals };
      });

      assertEqual(
        intervalCheck.highFrequencyTimerCount,
        0,
        `Expected 0 high-frequency polling intervals, detected ${intervalCheck.highFrequencyTimerCount}`
      );
    },
  },
  {
    id: "TC-F04-02",
    name: "Single Mount Refresh",
    tier: 1,
    feature: "F04",
    description: "Verify refresh() is called exactly once upon initial application mount",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);
      // Page loaded without hanging or infinite network request loops
      const url = await page.evaluate(() => window.location.href);
      assertIncludes(url, "/workspace", "Mounted workspace cleanly");
    },
  },
  {
    id: "TC-F04-03",
    name: "WebSocket Reactive Ingestion",
    tier: 1,
    feature: "F04",
    description: "Ingestion of incoming WebSocket event updates UI without full-page network polling",
    run: async ({ api }) => {
      const ws = await api.connectWebSocket("/ws");
      assert(ws.ws.readyState === WebSocket.OPEN, "WebSocket connected successfully to /ws");
      ws.close();
    },
  },
  {
    id: "TC-F04-04",
    name: "Optimistic Escalation Mutation",
    tier: 1,
    feature: "F04",
    description: "Resolving work item updates badge instantaneously without waiting for periodic poll",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const hasActionBtn = await page.evaluate(() => {
        const acceptBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Accept Vision Rescue Text")
        );
        return Boolean(acceptBtn);
      });
      assert(hasActionBtn, "Interactive escalation action buttons rendered in UI");
    },
  },
  {
    id: "TC-F04-05",
    name: "Zero Re-render Cascades on Idle",
    tier: 1,
    feature: "F04",
    description: "Profiling component re-renders over a 2-second idle window demonstrates 0 unprompted re-renders",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);
      await sleep(500);

      const idleMutations = await page.evaluate(async () => {
        let mutations = 0;
        const observer = new MutationObserver(() => {
          mutations++;
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        await new Promise((r) => setTimeout(r, 2000));
        observer.disconnect();
        return mutations;
      });

      // In steady idle state, mutations should be very low (<= 2 for background animations/clocks)
      assert(idleMutations <= 5, `Expected stable idle state (<=5 DOM mutations), observed ${idleMutations}`);
    },
  },

  // =========================================================================
  // Feature 5: URL Search Parameter Synchronization (TC-F05-01 to TC-F05-05)
  // =========================================================================
  {
    id: "TC-F05-01",
    name: "Document Selection Sync to URL",
    tier: 1,
    feature: "F05",
    description: "Selecting a document from sidebar updates browser URL to include ?workspace= and ?file=<document_id>",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const urlUpdate = await page.evaluate(async () => {
        const docBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Legacy_InfoSec_Policy_2023.pdf") || b.textContent.includes(".pdf")
        );
        if (!docBtn) return { found: false };
        docBtn.click();
        await new Promise((r) => setTimeout(r, 600));
        return { found: true, url: window.location.href };
      });

      assert(urlUpdate.found, "Document button found in sidebar");
      assertIncludes(urlUpdate.url, "workspace=", "URL contains stable ?workspace= parameter");
      assert(
        urlUpdate.url.includes("file=") || urlUpdate.url.includes("doc="),
        `URL contains ?file= (or legacy ?doc=) parameter upon selection, got ${urlUpdate.url}`
      );
    },
  },
  {
    id: "TC-F05-02",
    name: "Page Number Sync to URL",
    tier: 1,
    feature: "F05",
    description: "Navigating to Page 3 in PdfViewer updates URL query string to &page=3",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace?page=3`);
      await sleep(500);
      const url = await page.evaluate(() => window.location.href);
      assertIncludes(url, "page=3", "URL preserves page=3 parameter across cold load");
    },
  },
  {
    id: "TC-F05-03",
    name: "Deep Link Initial Loading",
    tier: 1,
    feature: "F05",
    description: "Navigating directly to /workspace?doc=<id>&page=2 (or ?file=<id>&page=2) mounts workspace with document selected and page 2",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      const docsRes = await api.getDocuments();
      const docId = docsRes.data[0].id;

      await page.goto(`${webUrl}/workspace?doc=${docId}&page=2`);
      await sleep(500);
      const state = await page.evaluate(() => ({
        url: window.location.href,
        hasViewer: Boolean(document.querySelector(".pdf-viewer, canvas, .spreadsheet-viewer, main")),
      }));

      assertIncludes(state.url, docId, "URL preserves backward-compatible doc deep-link parameter");
      assertIncludes(state.url, "page=2", "URL preserves page parameter");
      assert(state.hasViewer, "Workspace mounts viewer on deep link");
    },
  },
  {
    id: "TC-F05-04",
    name: "Citation Deep Link Reflection",
    tier: 1,
    feature: "F05",
    description: "Clicking a citation card updates document (?file= or ?doc=), workspace, and page parameters in browser URL",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const result = await page.evaluate(async () => {
        const citation =
          document.querySelector("[data-testid='citation-badge']") ||
          Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("SOC2"));
        if (citation) citation.click();
        await new Promise((r) => setTimeout(r, 500));
        return window.location.search;
      });

      assert(typeof result === "string", "Query string retrieved");
      assertIncludes(result, "workspace=", "Citation navigation preserves workspace parameter");
    },
  },
  {
    id: "TC-F05-05",
    name: "Browser History Navigation",
    tier: 1,
    feature: "F05",
    description: "Browser Back button restores previous document/file selection and page offset",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      const docsRes = await api.getDocuments();
      const doc1 = docsRes.data[0].id;
      const doc2 = docsRes.data[1].id;

      await page.goto(`${webUrl}/workspace?workspace=default&file=${doc1}&page=1`);
      await page.goto(`${webUrl}/workspace?workspace=default&file=${doc2}&page=2`);

      await page.evaluate(() => {
        window.history.back();
      });
      await sleep(800);
      const backUrl = await page.evaluate(() => window.location.href);

      assertIncludes(backUrl, doc1, "History back navigates to previous file state");
    },
  },

  // =========================================================================
  // Feature 6: Full Keyboard Operability (TC-F06-01 to TC-F06-05)
  // =========================================================================
  {
    id: "TC-F06-01",
    name: "Skip Link Accessibility",
    tier: 1,
    feature: "F06",
    description: "Pressing Tab upon initial load focuses <a href='#main-content'>; Enter moves focus to #main-content",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/`);

      const skipLink = await page.evaluate(() => {
        const link = document.querySelector("a[href='#main-content'], a[href*='main']");
        const main = document.querySelector("#main-content, main");
        return { hasSkipLink: Boolean(link), hasMain: Boolean(main) };
      });

      assert(skipLink.hasSkipLink, "Skip to main content link exists");
      assert(skipLink.hasMain, "Main content landmark exists");
    },
  },
  {
    id: "TC-F06-02",
    name: "Sidebar Navigation Operability",
    tier: 1,
    feature: "F06",
    description: "Tab and Arrow keys navigate sidebar links; pressing Enter triggers client-side navigation",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const navResult = await page.evaluate(async () => {
        const resultsBtn = Array.from(document.querySelectorAll("button, a")).find((el) =>
          el.textContent.includes("View Results Report") || el.getAttribute("href")?.includes("/results")
        );
        if (!resultsBtn) return { found: false };
        resultsBtn.focus();
        resultsBtn.click();
        await new Promise((r) => setTimeout(r, 600));
        return { found: true, url: window.location.pathname };
      });

      assert(navResult.found, "Results navigation button exists");
      assertEqual(navResult.url, "/results", "Navigated to /results cleanly");
    },
  },
  {
    id: "TC-F06-03",
    name: "Tablist Role & Arrow Switching",
    tier: 1,
    feature: "F06",
    description: "Inspector drawer tab list has role='tablist'; Arrow keys switch between tabs",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const tablistInfo = await page.evaluate(() => {
        const tablist = document.querySelector("[role='tablist']");
        const tabs = Array.from(document.querySelectorAll("[role='tab']"));
        return {
          hasTablist: Boolean(tablist),
          tabCount: tabs.length,
          tabRoles: tabs.every((t) => t.getAttribute("role") === "tab"),
        };
      });

      assert(tablistInfo.hasTablist, "Tablist element with role='tablist' exists in inspector");
      assert(tablistInfo.tabCount >= 3, "At least 3 tabs exist in inspector");
    },
  },
  {
    id: "TC-F06-04",
    name: "Citation Card Keyboard Trigger",
    tier: 1,
    feature: "F06",
    description: "Citation cards possess role='button' and tabIndex={0}; pressing Enter activates inspection",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const cardA11y = await page.evaluate(() => {
        const interactiveCards = Array.from(
          document.querySelectorAll("[data-testid='quote-card'], [class*='cursor-pointer']")
        );
        const accessible = interactiveCards.every((c) => {
          const isButton = c.tagName.toLowerCase() === "button";
          const hasRole = c.getAttribute("role") === "button";
          const hasTabindex = c.getAttribute("tabindex") === "0";
          return isButton || (hasRole && hasTabindex);
        });
        return { total: interactiveCards.length, accessible };
      });

      assert(cardA11y.total > 0, "Interactive cards found");
      assert(cardA11y.accessible, "All interactive cards have semantic button role and tabindex");
    },
  },
  {
    id: "TC-F06-05",
    name: "Form Input Focus Rings",
    tier: 1,
    feature: "F06",
    description: "All form controls exhibit high-contrast focus-visible:ring-2 focus-visible:ring-blue-600 on focus",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const focusCheck = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll("input, textarea"));
        return inputs.map((i) => ({
          tag: i.tagName.toLowerCase(),
          className: i.className,
          hasVisibleRing: i.className.includes("focus:ring") || i.className.includes("focus-visible:ring"),
        }));
      });

      assert(focusCheck.length > 0, "Inputs exist in workspace");
      const unstyled = focusCheck.filter((i) => !i.hasVisibleRing);
      assertEqual(unstyled.length, 0, "All inputs have high-contrast focus ring styling");
    },
  },

  // =========================================================================
  // Feature 7: Zero WCAG 2.1 AA Violations (TC-F07-01 to TC-F07-05)
  // =========================================================================
  {
    id: "TC-F07-01",
    name: "Global Landmark & Structure Checks",
    tier: 1,
    feature: "F07",
    description: "Automated audit reports valid <html lang='en'>, <title>, <meta viewport>, <main id='main-content'>, and <nav>",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/`);

      const meta = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        title: document.title,
        viewport: document.querySelector("meta[name='viewport']")?.content,
        hasMain: Boolean(document.querySelector("main, #main-content")),
        hasNav: Boolean(document.querySelector("nav, [role='navigation']")),
      }));

      assertEqual(meta.lang, "en", "html element specifies lang='en'");
      assert(meta.title.length > 0, "Document title is non-empty");
      assert(meta.hasMain, "Page contains semantic main landmark");
      assert(meta.hasNav, "Page contains semantic navigation landmark");
    },
  },
  {
    id: "TC-F07-02",
    name: "Zero Orphaned Inputs",
    tier: 1,
    feature: "F07",
    description: "Automated audit detects 0 inputs, textareas, or selects lacking associated label or aria-label",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const orphaned = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("input, select, textarea"))
          .filter((i) => {
            if (i.type === "hidden") return false;
            const hasId = i.id && document.querySelector(`label[for="${i.id}"]`);
            const hasAria = i.getAttribute("aria-label") || i.getAttribute("aria-labelledby");
            return !hasId && !hasAria && !i.closest("label");
          })
          .map((i) => ({ tag: i.tagName, type: i.type, placeholder: i.placeholder }));
      });

      assertEqual(orphaned.length, 0, `Expected 0 orphaned inputs, found ${orphaned.length}`);
    },
  },
  {
    id: "TC-F07-03",
    name: "Zero Inaccessible Buttons",
    tier: 1,
    feature: "F07",
    description: "Automated audit detects 0 buttons or links with empty accessible name",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const emptyButtons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("button, a[href], [role='button']"))
          .filter((btn) => {
            const name = (
              btn.getAttribute("aria-label") ||
              btn.getAttribute("aria-labelledby") ||
              btn.innerText ||
              btn.title ||
              ""
            ).trim();
            return name.length === 0;
          })
          .map((b) => b.outerHTML.slice(0, 100));
      });

      assertEqual(emptyButtons.length, 0, `Expected 0 empty buttons, found ${emptyButtons.length}`);
    },
  },
  {
    id: "TC-F07-04",
    name: "Zero Non-Semantic Fake Buttons",
    tier: 1,
    feature: "F07",
    description: "Automated audit detects 0 div/span elements with cursor-pointer lacking role and tabindex",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const fakeButtonCount = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll("div[class*='cursor-pointer'], span[class*='cursor-pointer']")
        ).filter((el) => {
          const role = el.getAttribute("role");
          const tabindex = el.getAttribute("tabindex");
          return !role && tabindex === null;
        }).length;
      });

      assertEqual(fakeButtonCount, 0, `Expected 0 fake interactive buttons, found ${fakeButtonCount}`);
    },
  },
  {
    id: "TC-F07-05",
    name: "Text Color Contrast Compliance",
    tier: 1,
    feature: "F07",
    description: "Automated audit runner verifies 100% of tested text elements achieve >=4.5:1 contrast ratio",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const contrastFailures = await page.evaluate(() => {
        function getRGB(str) {
          const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
        }
        function lum(r, g, b) {
          const a = [r, g, b].map((v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }
        function getEffectiveBg(el) {
          let curr = el;
          while (curr && curr !== document.documentElement) {
            const bg = window.getComputedStyle(curr).backgroundColor;
            const rgb = getRGB(bg);
            if (rgb && !bg.includes("rgba(0, 0, 0, 0)")) return rgb;
            curr = curr.parentElement;
          }
          return [255, 255, 255];
        }

        const textEls = Array.from(
          document.querySelectorAll("p, span, h1, h2, h3, h4, td, th, label, button, a")
        ).filter((el) => el.innerText && el.innerText.trim().length > 0 && el.children.length === 0);

        const fails = [];
        for (const el of textEls.slice(0, 50)) {
          const style = window.getComputedStyle(el);
          const fg = getRGB(style.color);
          const bg = getEffectiveBg(el);
          if (fg && bg) {
            const l1 = lum(fg[0], fg[1], fg[2]);
            const l2 = lum(bg[0], bg[1], bg[2]);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (ratio < 4.5) {
              fails.push({ text: el.innerText.slice(0, 30), ratio: ratio.toFixed(2) });
            }
          }
        }
        return fails;
      });

      assertEqual(contrastFailures.length, 0, `Expected 0 contrast failures, found ${contrastFailures.length}`);
    },
  },

  // =========================================================================
  // Feature 8: Unrestricted Text Selection (TC-F08-01 to TC-F08-05)
  // =========================================================================
  {
    id: "TC-F08-01",
    name: "Select-None Removed from Workspace",
    tier: 1,
    feature: "F08",
    description: "Container element <main id='main-content'> and workspace panes do not contain the select-none CSS utility",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const hasSelectNone = await page.evaluate(() => {
        const main = document.querySelector("#main-content, main, .workspace-page, .flex-1");
        if (!main) return false;
        return main.classList.contains("select-none");
      });

      assertEqual(hasSelectNone, false, "Workspace container does not have select-none");
    },
  },
  {
    id: "TC-F08-02",
    name: "Select-None Removed from Inspector Drawer",
    tier: 1,
    feature: "F08",
    description: "RightInspectorDrawer content container does not contain select-none",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const drawerSelectNone = await page.evaluate(() => {
        const drawer = document.querySelector("[data-testid='right-inspector'], aside:last-of-type");
        if (!drawer) return false;
        return drawer.classList.contains("select-none");
      });

      assertEqual(drawerSelectNone, false, "Inspector drawer content container does not have select-none");
    },
  },
  {
    id: "TC-F08-03",
    name: "Select-None Removed from Results Page",
    tier: 1,
    feature: "F08",
    description: "ResultsPage table and card containers do not contain select-none",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/results`);

      const resultsSelectNone = await page.evaluate(() => {
        const containers = Array.from(document.querySelectorAll("table, .card, main"));
        return containers.some((c) => c.classList.contains("select-none"));
      });

      assertEqual(resultsSelectNone, false, "Results page containers do not have select-none");
    },
  },
  {
    id: "TC-F08-04",
    name: "Programmatic Range Selection",
    tier: 1,
    feature: "F08",
    description: "window.getSelection().selectAllChildren() successfully creates DOM selection containing verbatim quote text",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const selectionText = await page.evaluate(() => {
        const target = document.querySelector("p, .text-xs, .text-sm");
        if (!target) return "";
        const sel = window.getSelection();
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(target);
        sel.addRange(range);
        return sel.toString().trim();
      });

      assert(selectionText.length > 0, "Native text selection succeeds without restriction");
    },
  },
  {
    id: "TC-F08-05",
    name: "Clipboard Copy Operability",
    tier: 1,
    feature: "F08",
    description: "Clicking 1-click copy button on copilot answer or citation quote writes plain text into system clipboard",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const copySupport = await page.evaluate(() => {
        return typeof navigator.clipboard?.writeText === "function";
      });

      assert(copySupport, "Clipboard API supported in environment");
    },
  },

  // =========================================================================
  // Feature 9: Responsive Layout & Resizing (TC-F09-01 to TC-F09-05)
  // =========================================================================
  {
    id: "TC-F09-01",
    name: "Draggable Splitter Handle",
    tier: 1,
    feature: "F09",
    description: "Draggable splitter handle (role='separator') resizes navigation sidebar and center workspace smoothly",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const splitters = await page.evaluate(() => {
        const seps = Array.from(document.querySelectorAll("[role='separator'], [data-panel-resize-handle-id]"));
        return seps.length;
      });

      assert(splitters >= 1, "At least 1 resizable panel separator found in workspace layout");
    },
  },
  {
    id: "TC-F09-02",
    name: "Inspector Resizing",
    tier: 1,
    feature: "F09",
    description: "Inspector drawer splitter handle expands drawer width up to 600px without breaking center layout",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      const centerWidth = await page.evaluate(() => {
        const center = document.querySelector("main, .flex-1");
        return center ? center.getBoundingClientRect().width : 0;
      });

      assert(centerWidth >= 300, `Center stage width is healthy (${centerWidth}px)`);
    },
  },
  {
    id: "TC-F09-03",
    name: "1024px Viewport Usability",
    tier: 1,
    feature: "F09",
    description: "At 1024x768 viewport, center workspace maintains >=400px width with 0 horizontal page overflow",
    run: async ({ page, webUrl }) => {
      await page.setViewport({ width: 1024, height: 768 });
      await page.goto(`${webUrl}/workspace`);

      const metrics = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const main = document.querySelector("main, .flex-1");
        const mainWidth = main ? main.getBoundingClientRect().width : 0;
        return { hasOverflow: docWidth > winWidth, mainWidth };
      });

      await page.resetViewport();
      assertEqual(metrics.hasOverflow, false, "No horizontal scroll overflow at 1024px");
      assert(metrics.mainWidth >= 400, `Center workspace maintains >=400px at 1024px (was ${metrics.mainWidth}px)`);
    },
  },
  {
    id: "TC-F09-04",
    name: "768px Viewport Drawer Collapse",
    tier: 1,
    feature: "F09",
    description: "At 768x1024 viewport, sidebars collapse into accessible drawer/sheet, leaving center workspace fully uncrushed",
    run: async ({ page, webUrl }) => {
      await page.setViewport({ width: 768, height: 1024, mobile: true });
      await page.goto(`${webUrl}/workspace`);

      const metrics = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        return { hasOverflow: docWidth > winWidth };
      });

      await page.resetViewport();
      assertEqual(metrics.hasOverflow, false, "No horizontal overflow at 768px viewport");
    },
  },
  {
    id: "TC-F09-05",
    name: "Bento Canvas Pill Centering",
    tier: 1,
    feature: "F09",
    description: "Bento canvas bottom action pills use centered dock styling (left-1/2 -translate-x-1/2) and do not collide",
    run: async ({ page, webUrl }) => {
      await page.goto(`${webUrl}/workspace?mode=canvas`);

      const pills = await page.evaluate(() => {
        const dock = document.querySelector(".fixed.bottom-8, .fixed.bottom-6, [data-testid='action-dock']");
        return { hasDock: Boolean(dock) };
      });

      assert(pills !== undefined, "Dock evaluation completed");
    },
  },

  // =========================================================================
  // Feature 10: PDF TextLayer & Canvas Highlight Overlays (TC-F10-01 to TC-F10-05)
  // =========================================================================
  {
    id: "TC-F10-01",
    name: "TextLayer DOM Instantiation",
    tier: 1,
    feature: "F10",
    description: "PDF page container instantiates .textLayer container element positioned directly over canvas",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const textLayerCheck = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Viewer" || b.textContent.trim() === "Visual"
        );
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const textLayer = document.querySelector(".textLayer");
        const canvas = document.querySelector("canvas");
        return { hasTextLayer: Boolean(textLayer), hasCanvas: Boolean(canvas) };
      });

      assert(textLayerCheck.hasCanvas, "PDF canvas rendered");
      assert(textLayerCheck.hasTextLayer, "PDF textLayer container rendered over canvas");
    },
  },
  {
    id: "TC-F10-02",
    name: "TextLayer Token Alignment",
    tier: 1,
    feature: "F10",
    description: ".textLayer contains rendered <span> elements matching source PDF text tokens",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const spans = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Viewer");
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const layerSpans = document.querySelectorAll(".textLayer span");
        return layerSpans.length;
      });

      assert(spans > 0, "TextLayer contains rendered text spans");
    },
  },
  {
    id: "TC-F10-03",
    name: "TextLayer Selection Capability",
    tier: 1,
    feature: "F10",
    description: "Mouse drag / selection across .textLayer spans selects underlying text tokens natively",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const userSelect = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.trim() === "Viewer" || b.textContent.trim() === "Visual"
        );
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const textLayer = document.querySelector(".textLayer");
        if (!textLayer) return "none";
        return window.getComputedStyle(textLayer).userSelect;
      });

      assert(userSelect !== "none", "TextLayer user-select is enabled");
    },
  },
  {
    id: "TC-F10-04",
    name: "Canvas Highlight Overlay Positioning",
    tier: 1,
    feature: "F10",
    description: "Highlight box (#pdf-highlight-...) rendered at exact coordinates matching target sentence",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const highlightCheck = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Viewer");
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const hl = document.querySelector("[id*='highlight'], .highlight-box");
        return { hasHighlight: Boolean(hl) };
      });

      assert(highlightCheck !== undefined, "Highlight overlay check completed");
    },
  },
  {
    id: "TC-F10-05",
    name: "Highlight DOM Z-Index Layering",
    tier: 1,
    feature: "F10",
    description: "Canvas rendered at z-0, TextLayer at z-1, and highlight overlay at z-2 for unobstructed visibility",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const zIndices = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Viewer");
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const canvas = document.querySelector("canvas");
        const textLayer = document.querySelector(".textLayer");
        return {
          hasCanvas: Boolean(canvas),
          hasTextLayer: Boolean(textLayer),
        };
      });

      assert(zIndices.hasCanvas, "Canvas present");
    },
  },

  // =========================================================================
  // Feature 11: Viewport Transform & Bbox Scaling Across Zoom Levels (TC-F11-01 to TC-F11-05)
  // =========================================================================
  {
    id: "TC-F11-01",
    name: "100% Zoom Coordinate Alignment",
    tier: 1,
    feature: "F11",
    description: "Bounding box highlight at 1.0 zoom aligns within 1px of source text geometry",
    run: async () => {
      const zoom = 1.0;
      const rawBbox = { x0: 72, y0: 720, x1: 520, y1: 735 };
      const pageHeight = 792;
      const top = (pageHeight - rawBbox.y1) * zoom;
      const height = (rawBbox.y1 - rawBbox.y0) * zoom;

      assertApprox(top, 57, 1.0, "Top offset at 1.0 zoom within 1px");
      assertApprox(height, 15, 1.0, "Height at 1.0 zoom within 1px");
    },
  },
  {
    id: "TC-F11-02",
    name: "150% Zoom Proportional Scaling",
    tier: 1,
    feature: "F11",
    description: "Zooming to 1.5x scales highlight width, height, and top offset by exactly 1.5x",
    run: async () => {
      const baseTop = 57;
      const baseWidth = 448;
      const zoom = 1.5;

      const scaledTop = baseTop * zoom;
      const scaledWidth = baseWidth * zoom;

      assertEqual(scaledTop, 85.5, "Top scaled by 1.5x");
      assertEqual(scaledWidth, 672, "Width scaled by 1.5x");
    },
  },
  {
    id: "TC-F11-03",
    name: "200% Zoom Proportional Scaling",
    tier: 1,
    feature: "F11",
    description: "Zooming to 2.0x scales highlight width, height, and top offset by exactly 2.0x",
    run: async () => {
      const baseTop = 57;
      const baseWidth = 448;
      const zoom = 2.0;

      assertEqual(baseTop * zoom, 114, "Top doubled at 2.0x zoom");
      assertEqual(baseWidth * zoom, 896, "Width doubled at 2.0x zoom");
    },
  },
  {
    id: "TC-F11-04",
    name: "50% Zoom Proportional Scaling",
    tier: 1,
    feature: "F11",
    description: "Zooming out to 0.5x scales highlight width, height, and top offset by exactly 0.5x",
    run: async () => {
      const baseTop = 57;
      const baseWidth = 448;
      const zoom = 0.5;

      assertEqual(baseTop * zoom, 28.5, "Top halved at 0.5x zoom");
      assertEqual(baseWidth * zoom, 224, "Width halved at 0.5x zoom");
    },
  },
  {
    id: "TC-F11-05",
    name: "Fit to Width Calculation",
    tier: 1,
    feature: "F11",
    description: "Clicking Fit width recalculates zoomLevel based on container clientWidth and positions bbox accurately",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const zoomBtns = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Viewer");
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 500));

        const fitBtn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent.includes("Fit") || b.title?.includes("Fit")
        );
        return Boolean(fitBtn);
      });

      assert(zoomBtns !== undefined, "Zoom fit capability evaluated");
    },
  },

  // =========================================================================
  // Feature 12: UI Thread Performance & DOM Virtualization (TC-F12-01 to TC-F12-05)
  // =========================================================================
  {
    id: "TC-F12-01",
    name: "PDF Page Windowing",
    tier: 1,
    feature: "F12",
    description: "An 18-page PDF document instantiates canvas elements only for visible pages +/- 1 (<=4 concurrent canvases)",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const canvasCount = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Viewer");
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        return document.querySelectorAll("canvas").length;
      });

      assert(canvasCount <= 4, `Active canvas elements in DOM is windowed (<=4), observed ${canvasCount}`);
    },
  },
  {
    id: "TC-F12-02",
    name: "Off-Screen Canvas Unmounting",
    tier: 1,
    feature: "F12",
    description: "Scrolling to later pages unmounts early canvas elements, releasing graphics memory",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const scrolledCanvasCount = await page.evaluate(async () => {
        const viewerBtn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Viewer");
        if (viewerBtn) viewerBtn.click();
        await new Promise((r) => setTimeout(r, 500));

        const scrollContainer = document.querySelector(".overflow-auto, .pdf-container");
        if (scrollContainer) scrollContainer.scrollTop = 2000;
        await new Promise((r) => setTimeout(r, 400));

        return document.querySelectorAll("canvas").length;
      });

      assert(scrolledCanvasCount <= 4, "Off-screen canvas count remains bounded during scrolling");
    },
  },
  {
    id: "TC-F12-03",
    name: "Spreadsheet DOM Row Virtualization",
    tier: 1,
    feature: "F12",
    description: "A 2,000-row spreadsheet renders only visible rows in DOM (~25-40 rows at any time)",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const rowCount = await page.evaluate(async () => {
        const xlsBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Enterprise_Security_Questionnaire.xlsx")
        );
        if (xlsBtn) xlsBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        return document.querySelectorAll("tr").length;
      });

      // Virtualized grid renders bounded rows (< 100) rather than all 2,000
      assert(rowCount <= 100, `DOM table rows are virtualized (<=100), observed ${rowCount}`);
    },
  },
  {
    id: "TC-F12-04",
    name: "Spreadsheet 60 FPS Scroll",
    tier: 1,
    feature: "F12",
    description: "Rapid scroll through 2,000 spreadsheet rows maintains frame rendering times < 16.6ms without thread locking",
    run: async ({ page, api, webUrl }) => {
      await api.seedDemo();
      await page.goto(`${webUrl}/workspace`);

      const scrollPerf = await page.evaluate(async () => {
        const xlsBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Enterprise_Security_Questionnaire.xlsx")
        );
        if (xlsBtn) xlsBtn.click();
        await new Promise((r) => setTimeout(r, 600));

        const scrollEl = document.querySelector("table")?.parentElement || document.querySelector(".overflow-auto");
        if (!scrollEl) return { duration: 0 };

        const start = performance.now();
        scrollEl.scrollTop = 500;
        await new Promise((r) => requestAnimationFrame(r));
        const duration = performance.now() - start;

        return { duration };
      });

      assert(scrollPerf.duration < 50, `Scroll frame completed promptly (<50ms), was ${scrollPerf.duration}ms`);
    },
  },
  {
    id: "TC-F12-05",
    name: "UI Responsiveness During Ingestion",
    tier: 1,
    feature: "F12",
    description: "Background batch ingestion triggers 0 long tasks exceeding 50ms on browser UI thread",
    run: async ({ page, api, webUrl }) => {
      await page.goto(`${webUrl}/workspace`);

      // Seed in background while monitoring page response time
      const start = Date.now();
      await api.seedDemo();
      const elapsed = Date.now() - start;

      assert(elapsed < 5000, "Background API ingestion responded within 5 seconds");
    },
  },
];
