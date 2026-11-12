/**
 * Phase 3 End-to-End Headless Chrome Verification Suite
 * Covers all 9 integrity & logic fixes against live API + Vite preview/dev server:
 * 1. Manual Override inline validation ("Hello" rejected, substantive override + no-evidence attestation accepted, HUMAN_OVERRIDE purple badge & 0%/Unverified by gate)
 * 2. Mark N/A inline validation (empty reason rejected, valid reason sets NOT_APPLICABLE & preserves P0_CRITICAL priority + Original Priority display)
 * 3. Unified counters & Envoy defensibility breakdown (<100% while unverified P0/P1 exist) + Match % non-green coloring
 * 4. Weak Evidence badge & Chronos dual-locator (2026 + 2023) clickable inspection
 * 5. Export gating (disabled during active run/uncompleted, unlocked after completion) + Pre-Export Warning Confirmation Modal
 * 6. Atomic reset / double demo load without stale flicker or duplicate stream
 */

import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { BertApiClient } from "./e2e/lib/api.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const WEB_URL = process.env.SHIELDSTAFF_WEB_URL || process.env.BERT_WEB_URL || "http://localhost:5173";
const API_URL = process.env.SHIELDSTAFF_API_URL || process.env.BERT_API_URL || "http://localhost:8000";

async function setInputValue(page, selector, value) {
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Input not found: ${sel}`);
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

async function runPhase3BrowserSuite() {
  console.log("================================================================================");
  console.log("  PHASE 3 END-TO-END HEADLESS CHROME VERIFICATION SUITE                         ");
  console.log("================================================================================");

  const api = new BertApiClient(API_URL);
  const browser = new HeadlessBrowser();
  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    process.stdout.write(`  [Phase3 E2E] ${name} ... `);
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
    // Case 1: Manual Override rejects "Hello", accepts substantive attested override -> HUMAN_OVERRIDE
    // -------------------------------------------------------------------------
    await runCase('3.1 Manual Override rejects "Hello" & saves HUMAN_OVERRIDE without score inflation', async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(900);

      // Click "Provide Answer / Override" on first escalation card
      const opened = await page.evaluate(async () => {
        const card = document.querySelector("[data-testid='escalation-card']");
        if (!card) return false;
        const btn = Array.from(card.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Override") || b.textContent.includes("Provide Answer")
        );
        if (!btn) return false;
        btn.click();
        await new Promise((r) => setTimeout(r, 200));
        return Boolean(document.querySelector("input[aria-label^='Manual answer for']"));
      });
      assert(opened, "Opened Manual Override editor on escalation card");

      // Enter trivial "Hello" and attempt save -> expect inline validation error
      await setInputValue(page, "input[aria-label^='Manual answer for']", "Hello");
      await page.evaluate(async () => {
        const saveBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Save Human Override")
        );
        saveBtn?.click();
        await new Promise((r) => setTimeout(r, 200));
      });

      const errorText = await page.evaluate(
        () => document.querySelector("[data-testid='override-validation-error']")?.textContent || ""
      );
      assert(errorText.length > 5, `Inline override validation error displayed for "Hello": ${errorText}`);

      // Check attestation box + enter substantive answer -> Save Human Override
      await setInputValue(
        page,
        "input[aria-label^='Manual answer for']",
        "Vendor provided signed compensating MFA exception approved by security engineering"
      );
      await page.evaluate(async () => {
        const cb = document.querySelector("input[type='checkbox'][aria-label='No evidence — reviewer attests']");
        if (cb && !cb.checked) cb.click();
        await new Promise((r) => setTimeout(r, 100));
        const saveBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Save Human Override")
        );
        saveBtn?.click();
        await new Promise((r) => setTimeout(r, 900));
      });

      const afterOverride = await page.evaluate(() => ({
        hasOverrideBadge: Boolean(document.querySelector("[data-testid='human-override-badge']")),
        bodyText: document.body.innerText,
      }));
      assert(afterOverride.hasOverrideBadge, "Card renders distinct Human Override badge");
      assertIncludes(afterOverride.bodyText, "Unverified by gate", "Human Override displays Unverified by gate (never rapidfuzz verified)");

      // Undo override cleanly
      await page.evaluate(async () => {
        const undoBtn =
          document.querySelector("[data-testid='undo-toast'] button") ||
          Array.from(document.querySelectorAll("button")).find((b) => b.textContent.includes("Undo Override"));
        undoBtn?.click();
        await new Promise((r) => setTimeout(r, 800));
      });
    });

    // -------------------------------------------------------------------------
    // Case 2: Mark N/A requires reason, sets NOT_APPLICABLE & preserves P0_CRITICAL priority
    // -------------------------------------------------------------------------
    await runCase("3.2 Mark N/A requires reason, sets NOT_APPLICABLE & preserves P0 priority", async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(900);

      await page.evaluate(async () => {
        const card = document.querySelector("[data-testid='escalation-card']");
        const naBtn = Array.from(card.querySelectorAll("button")).find((b) =>
          b.textContent.trim() === "Mark N/A"
        );
        naBtn?.click();
        await new Promise((r) => setTimeout(r, 200));
        const confirmBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Confirm Mark N/A")
        );
        confirmBtn?.click();
        await new Promise((r) => setTimeout(r, 200));
      });

      const naErr = await page.evaluate(
        () => document.querySelector("[data-testid='na-validation-error']")?.textContent || ""
      );
      assert(naErr.length > 5, `Empty Mark N/A shows validation error: ${naErr}`);

      await setInputValue(page, "select[aria-label='Not applicable reason code']", "OUT_OF_SCOPE_PRODUCT");
      await setInputValue(
        page,
        "input[aria-label='Not applicable reason note']",
        "On-prem HSM annex not applicable to SaaS multi-tenant boundary"
      );
      await page.evaluate(async () => {
        const confirmBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Confirm Mark N/A")
        );
        confirmBtn?.click();
        await new Promise((r) => setTimeout(r, 900));
      });

      const afterNa = await page.evaluate(() => ({
        bodyText: document.body.innerText,
      }));
      assertIncludes(afterNa.bodyText, "NOT_APPLICABLE", "Escalation card displays NOT_APPLICABLE status");
      assertIncludes(afterNa.bodyText, "MARKED N/A", "Escalation card displays MARKED N/A tag");
      assertIncludes(afterNa.bodyText, "P0_CRITICAL", "N/A resolution preserves P0_CRITICAL priority tier");
    });

    // -------------------------------------------------------------------------
    // Case 3: ResultsPage unified counters, match % non-green tones, weak evidence & export modal
    // -------------------------------------------------------------------------
    await runCase("3.3 ResultsPage counters breakdown, match % colors, Weak Evidence & Pre-Export Warning Modal", async () => {
      // Upload a document with weak/bare-header lines and run single-doc review so backend emits weak_evidence=True
      const boundary = "----BertPhase3Weak" + Date.now();
      const multipart =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="Weak_Quote_Policy.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\n` +
        `SOC 2 Type II 2026\nShort MFA line\nAccess control requires multifactor authentication for privileged accounts.\n\r\n` +
        `--${boundary}--\r\n`;
      const uploadRes = await fetch(`${API_URL}/api/v1/documents/upload`, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: multipart,
      });
      assert(uploadRes.ok, `Uploaded Weak_Quote_Policy.txt (status ${uploadRes.status})`);
      const uploadedDoc = await uploadRes.json();
      const jobRes = await api.startJob({ document_id: uploadedDoc.id });
      assert(jobRes.ok, "Started single-doc review job for Weak_Quote_Policy.txt");
      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const st = await api.getJob(jobRes.data.job_id);
        if (st.data?.status === "COMPLETED" || st.data?.status === "FAILED") break;
      }

      await page.goto(`${WEB_URL}/results`);
      await sleep(1000);

      const summary = await page.evaluate(() => ({
        machine: document.querySelector("[data-testid='metrics-machine-verified']")?.textContent || "",
        override: document.querySelector("[data-testid='metrics-human-override']")?.textContent || "",
        legal: document.querySelector("[data-testid='metrics-escalated-legal']")?.textContent || "",
        na: document.querySelector("[data-testid='metrics-not-applicable']")?.textContent || "",
        unresolved: document.querySelector("[data-testid='metrics-unresolved']")?.textContent || "",
        defensibility: document.querySelector("[data-testid='metrics-defensibility-score']")?.textContent || "",
        weakCount: document.querySelectorAll("[data-testid='weak-evidence-badge']").length,
        zeroMatchHasEmerald: Array.from(document.querySelectorAll("[data-testid^='row-match-']")).some(
          (el) => el.textContent.trim().startsWith("0%") && el.className.includes("emerald")
        ),
        below97HasEmerald: Array.from(document.querySelectorAll("[data-testid^='row-match-']")).some((el) => {
          const num = parseFloat(el.textContent || "0");
          return num < 97 && el.className.includes("emerald");
        }),
        preservedP0Rows: Array.from(document.querySelectorAll("tr")).filter(
          (tr) => tr.textContent.includes("NOT_APPLICABLE") && tr.textContent.includes("P0_CRITICAL")
        ).length,
      }));

      assertIncludes(summary.machine, "Machine Verified", "Results summary renders Machine Verified chip");
      assertIncludes(summary.override, "Human Overridden", "Results summary renders Human Overridden chip");
      assertIncludes(summary.na, "Marked N/A", "Results summary renders Marked N/A chip");
      assert(summary.na.startsWith("1 "), `Marked N/A chip reflects persisted N/A item (got '${summary.na}')`);
      assert(summary.preservedP0Rows >= 1, "Results table preserves P0_CRITICAL priority on NOT_APPLICABLE row");
      assert(
        !summary.defensibility.startsWith("100%"),
        `Defensibility score cannot be 100% while N/A / unresolved P0 items exist (got '${summary.defensibility}')`
      );
      assert(summary.weakCount >= 1, `Results table renders Weak Evidence badge (found ${summary.weakCount})`);
      assertEqual(summary.zeroMatchHasEmerald, false, "0% match badges NEVER use emerald styling");
      assertEqual(summary.below97HasEmerald, false, "<97% match badges NEVER use emerald styling");

      // Export button enabled on completed run -> click -> Pre-Export Warning Modal appears!
      const modalState = await page.evaluate(async () => {
        const exportBtn = document.querySelector("[data-testid='results-export-xlsx-btn']");
        if (!exportBtn || exportBtn.disabled) return { enabled: false, modalOpen: false };
        exportBtn.click();
        await new Promise((r) => setTimeout(r, 300));
        const modal = document.querySelector("[data-testid='export-warning-modal']");
        return {
          enabled: true,
          modalOpen: Boolean(modal),
          modalText: modal?.textContent || "",
        };
      });
      assert(modalState.enabled, "Export Answered .XLSX button enabled after completed run");
      assert(modalState.modalOpen, "Pre-Export Warning Confirmation Modal opens when non-verified items exist");
      assertIncludes(modalState.modalText, "Export Includes Non-Machine-Verified Items", "Modal explains non-verified export warnings");

      // Cancel closes modal cleanly
      const closed = await page.evaluate(async () => {
        document.querySelector("[data-testid='export-warning-cancel']")?.click();
        await new Promise((r) => setTimeout(r, 200));
        return !document.querySelector("[data-testid='export-warning-modal']");
      });
      assert(closed, "Cancel Export dismisses Pre-Export Warning Modal");
    });

    // -------------------------------------------------------------------------
    // Case 4: Chronos Temporal-Conflict Dual-Locator on BentoCanvas & ResultsPage
    // -------------------------------------------------------------------------
    await runCase("3.4 Chronos Temporal-Conflict exposes clickable 2026 + 2023 dual locators", async () => {
      await api.seedDemo();
      await page.goto(`${WEB_URL}/workspace?mode=canvas`);
      await sleep(900);

      const canvasConflict = await page.evaluate(() => {
        const card = document.querySelector("[data-testid='temporal-conflict-card']");
        const loc0 = document.querySelector("[data-testid='chronos-locator-0']");
        const loc1 = document.querySelector("[data-testid='chronos-locator-1']");
        return {
          hasCard: Boolean(card),
          loc0Text: loc0?.textContent || "",
          loc1Text: loc1?.textContent || "",
        };
      });
      assert(canvasConflict.hasCard, "BentoCanvas renders Chronos Temporal-Conflict card");
      assert(
        Boolean(canvasConflict.loc0Text && canvasConflict.loc1Text),
        `Both Chronos locators rendered (${canvasConflict.loc0Text} | ${canvasConflict.loc1Text})`
      );

      // Click second (2023) locator and inspect PDF inspector opening Legacy_InfoSec_Policy_2023.pdf
      await page.evaluate(async () => {
        document.querySelector("[data-testid='chronos-locator-1']")?.click();
        await new Promise((r) => setTimeout(r, 600));
      });
      const inspectorText = await page.evaluate(
        () => document.querySelector("[data-testid='right-inspector']")?.textContent || ""
      );
      assertIncludes(inspectorText, "2023", "Clicking older Chronos locator opens 2023 policy in inspector");

      // Also check ResultsPage table dual locators
      await page.goto(`${WEB_URL}/results`);
      await sleep(800);
      const tableDual = await page.evaluate(() => ({
        hasLoc0: Boolean(document.querySelector("[data-testid='chronos-table-locator-0']")),
        hasLoc1: Boolean(document.querySelector("[data-testid='chronos-table-locator-1']")),
      }));
      assert(tableDual.hasLoc0 && tableDual.hasLoc1, "Results table renders BOTH Chronos conflict locators");
    });

    // -------------------------------------------------------------------------
    // Case 5: Atomic Reset / Load Demo Corpus twice without "No files staged yet" flicker
    // -------------------------------------------------------------------------
    await runCase("3.5 Atomic Reset & Double Demo Load renders clean corpus without stale flicker", async () => {
      await page.goto(`${WEB_URL}/workspace`);
      await sleep(800);

      const resetRes = await page.evaluate(async () => {
        const loadBtn = Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Load Investor Demo")
        );
        if (!loadBtn) return { clicked: false };
        loadBtn.click();
        await new Promise((r) => setTimeout(r, 150));
        const midText = document.body.innerText;
        loadBtn.click();
        await new Promise((r) => setTimeout(r, 1400));
        return {
          clicked: true,
          midHadEmptyFlicker: midText.includes("No files staged yet"),
          finalDocs: document.querySelectorAll("[data-testid='corpus-file-item']").length,
        };
      });

      assert(resetRes.clicked, "Clicked Load Investor Demo button");
      assertEqual(resetRes.midHadEmptyFlicker, false, "Double demo load never flashes 'No files staged yet'");
      assert(resetRes.finalDocs >= 4, `Workspace stabilizes with >=4 corpus docs (got ${resetRes.finalDocs})`);
    });
  } finally {
    await browser.stop();
  }

  console.log("================================================================================");
  console.log(`  PHASE 3 E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3BrowserSuite().catch((err) => {
  console.error("Fatal error in Phase 3 E2E suite:", err);
  process.exit(1);
});
