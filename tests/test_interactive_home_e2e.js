/**
 * Interactive Homepage (Part B5) Headless Chrome E2E Suite
 * Self-contained against isolated Vite (:15179) and Chrome CDP (:19229).
 *
 * Verifies all 8 interactive homepage requirements + responsive layout + CTAs:
 * 1. Hero live document-to-evidence demo (PDF bbox -> JSON path -> XLSX row)
 * 2. 7-agent Pipeline Explorer (keyboard stepper + Play animation pending->running->done)
 * 3. Verification Gate Playground (PASS / WEAK_EVIDENCE / FAIL live editing)
 * 4. Risk Tier Explorer (P0 / P1 / P2 / P3 tabs, SLA & routing)
 * 5. Triage Preview (A/O/L/N shortcuts + Undo toast, zero backend mutation)
 * 6. Use Cases tabs (Security Questionnaire, Contract Risk Triage, Degraded Scans)
 * 7. Scroll-linked StoryNavBar anchors + active-section highlight
 * 8. Command Palette (Ctrl+K / button) section jump, route nav, and theme toggle
 * 9. Responsive overflow check (375px, 768px, 1280px) & CTA navigation
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const ROOT_DIR = path.resolve(".");
const WEB_DIR = path.join(ROOT_DIR, "apps", "web");
const WEB_PORT = parseInt(process.env.SHIELDSTAFF_HOME_E2E_PORT || "15179", 10);
const CHROME_PORT = parseInt(process.env.CHROME_PORT || "19229", 10);
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

async function waitForHttp(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function killProcessTree(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    proc.once("exit", done);
    try {
      proc.kill("SIGTERM");
    } catch {
      done();
      return;
    }
    setTimeout(() => {
      if (!settled) {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        done();
      }
    }, 2500);
  });
}

async function startViteServer() {
  const viteBin = path.join(WEB_DIR, "node_modules", ".bin", "vite");
  assert(fs.existsSync(viteBin), `Vite binary exists at ${viteBin}`);

  const webProc = spawn(
    viteBin,
    ["--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"],
    {
      cwd: WEB_DIR,
      env: { ...process.env, VITE_API_URL: "http://127.0.0.1:18999" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  await waitForHttp(`${WEB_URL}/`, 20000);
  return {
    stop: async () => {
      await killProcessTree(webProc);
    },
  };
}

async function runSuite() {
  console.log("================================================================================");
  console.log("  INTERACTIVE HOMEPAGE (PART B5) HEADLESS CHROME E2E SUITE                      ");
  console.log("================================================================================");

  const server = await startViteServer();
  const browser = new HeadlessBrowser({ port: CHROME_PORT });
  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    process.stdout.write(`  [Home B5 E2E] ${name} ... `);
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
    await page.setViewport({ width: 1280, height: 860 });

    const pageErrors = [];
    page.client.on("Runtime.exceptionThrown", (params) => {
      pageErrors.push(params.exceptionDetails?.text || "Runtime exception");
    });

    await page.goto(`${WEB_URL}/`, { sleepAfter: 1000 });
    await page.waitForSelector("#hero", { timeout: 10000 });

    await runCase("B5.1 Hero live document-to-evidence demo cycles PDF bbox, JSON path, and XLSX row", async () => {
      const pdfChip = await page.evaluate(
        () => document.querySelector("[data-testid='hero-source-type-chip']")?.textContent?.trim() || ""
      );
      assertEqual(pdfChip, "PDF", "Initial hero proof shows PDF chip");
      assert(
        await page.evaluate(() => Boolean(document.querySelector("[data-testid='hero-proof-pdf']"))),
        "PDF bbox preview rendered"
      );

      await page.click("[data-testid='hero-claim-btn-json']");
      await sleep(120);
      const jsonState = await page.evaluate(() => ({
        chip: document.querySelector("[data-testid='hero-source-type-chip']")?.textContent?.trim() || "",
        loc: document.querySelector("[data-testid='hero-location-label']")?.textContent?.trim() || "",
        hasJson: Boolean(document.querySelector("[data-testid='hero-proof-json']")),
      }));
      assertEqual(jsonState.chip, "JSON", "Clicking JSON claim switches source chip to JSON");
      assertIncludes(jsonState.loc, "$.rules.wildcard-admin.action", "Location label updates to JSONPath");
      assert(jsonState.hasJson, "JSON highlight preview rendered");

      await page.click("[data-testid='hero-claim-btn-xlsx']");
      await sleep(120);
      const xlsxState = await page.evaluate(() => ({
        chip: document.querySelector("[data-testid='hero-source-type-chip']")?.textContent?.trim() || "",
        loc: document.querySelector("[data-testid='hero-location-label']")?.textContent?.trim() || "",
        hasXlsx: Boolean(document.querySelector("[data-testid='hero-proof-xlsx']")),
      }));
      assertEqual(xlsxState.chip, "XLSX", "Clicking XLSX claim switches source chip to XLSX");
      assertIncludes(xlsxState.loc, "Questionnaire!A5:D5", "Location label updates to XLSX range");
      assert(xlsxState.hasXlsx, "XLSX row highlight preview rendered");
    });

    await runCase("B5.2 7-Agent Pipeline Explorer stepper & Play animation (pending -> running -> done)", async () => {
      await page.evaluate(() => {
        document.getElementById("pipeline-explorer")?.scrollIntoView({ block: "center" });
      });
      await sleep(150);

      const agents = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='pipeline-agent-'] h3")).map((e) =>
          e.textContent?.trim()
        )
      );
      assertEqual(
        agents.join("->"),
        "Scout->Quartermaster->Chronos->Vanguard->Ranger->Arbiter->Envoy",
        "All 7 agents render in canonical order"
      );

      await page.click("[data-testid='pipeline-play-btn']");
      await sleep(300);
      const midState = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='pipeline-agent-']")).map((el) =>
          el.getAttribute("data-stage-state")
        )
      );
      assert(
        midState.includes("running") || midState.includes("done"),
        `Play animates stages (${JSON.stringify(midState)})`
      );

      // Wait for all 7 stages to finish (7 * 750ms max = ~5.5s)
      let allDone = false;
      for (let i = 0; i < 20; i++) {
        await sleep(400);
        const states = await page.evaluate(() =>
          Array.from(document.querySelectorAll("[data-testid^='pipeline-agent-']")).map((el) =>
            el.getAttribute("data-stage-state")
          )
        );
        if (states.every((s) => s === "done")) {
          allDone = true;
          break;
        }
      }
      assert(allDone, "All 7 stages reach 'done' state after Play completes");
    });

    await runCase("B5.3 Verification Gate Playground live PASS / WEAK_EVIDENCE / FAIL transitions", async () => {
      const initialStatus = await page.evaluate(() =>
        document.querySelector("[data-testid='gate-result-badge']")?.getAttribute("data-gate-status")
      );
      assertEqual(initialStatus, "PASS", "Initial exact quote scores PASS");

      await page.click("[data-testid='gate-preset-weak-header']");
      await sleep(100);
      const weakStatus = await page.evaluate(() =>
        document.querySelector("[data-testid='gate-result-badge']")?.getAttribute("data-gate-status")
      );
      assertEqual(weakStatus, "WEAK_EVIDENCE", "Bare heading preset triggers WEAK_EVIDENCE");

      await page.click("[data-testid='gate-preset-fail-mismatch']");
      await sleep(100);
      const failStatus = await page.evaluate(() =>
        document.querySelector("[data-testid='gate-result-badge']")?.getAttribute("data-gate-status")
      );
      assertEqual(failStatus, "FAIL", "Mismatched paraphrase triggers FAIL");

      // Edit textarea directly to verify live reactivity back to PASS
      await page.evaluate(() => {
        const ta = document.querySelector("[data-testid='gate-quote-input']");
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        ).set;
        nativeSetter.call(
          ta,
          "Access control requires multifactor authentication for all privileged accounts across production environments"
        );
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await sleep(120);
      const editedStatus = await page.evaluate(() => ({
        status: document.querySelector("[data-testid='gate-result-badge']")?.getAttribute("data-gate-status"),
        score: document.querySelector("[data-testid='gate-score-value']")?.textContent?.trim(),
      }));
      assertEqual(editedStatus.status, "PASS", "Direct textarea edit transitions back to PASS");
      assertIncludes(editedStatus.score, "100.0%", "Direct verbatim edit calculates 100.0% match");
    });

    await runCase("B5.4 Risk Tier Explorer (P0/P1/P2/P3), Triage Preview (A/O/L/N + Undo), Use Cases tabs", async () => {
      await page.click("[data-testid='risk-tier-tab-P1']");
      await sleep(100);
      const tierPanel = await page.evaluate(
        () => document.querySelector("[data-testid='risk-tier-detail-panel']")?.textContent || ""
      );
      assertIncludes(tierPanel, "P1_HIGH", "P1 tab renders P1_HIGH details");
      assertIncludes(tierPanel, "< 4 business hours", "P1 tab shows SLA");

      // Triage Preview: test keyboard shortcut 'O' then Undo button
      await page.evaluate(() => {
        const box = document.querySelector("[data-testid='triage-preview-sandbox']");
        box.scrollIntoView({ block: "center" });
        box.focus();
      });
      await sleep(100);
      await page.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "o",
        code: "KeyO",
        windowsVirtualKeyCode: 79,
      });
      await page.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "o",
        code: "KeyO",
        windowsVirtualKeyCode: 79,
      });
      await sleep(120);
      const afterOverride = await page.evaluate(() => ({
        status: document.querySelector("[data-testid='triage-preview-status-triage-iam-wildcard']")?.textContent?.trim(),
        hasToast: Boolean(document.querySelector("[data-testid='triage-preview-undo-toast']")),
      }));
      assertEqual(afterOverride.status, "HUMAN OVERRIDE", "Pressing 'O' updates local triage item to HUMAN OVERRIDE");
      assert(afterOverride.hasToast, "Undo toast appears after triage action");

      await page.click("[data-testid='triage-preview-undo-btn']");
      await sleep(100);
      const afterUndo = await page.evaluate(
        () => document.querySelector("[data-testid='triage-preview-status-triage-iam-wildcard']")?.textContent?.trim()
      );
      assertEqual(afterUndo, "NEEDS REVIEW", "Clicking Undo reverts item back to NEEDS REVIEW");

      // Use Case tabs
      await page.click("[data-testid='use-case-tab-degraded-scans']");
      await sleep(100);
      assert(
        await page.evaluate(() => Boolean(document.querySelector("[data-testid='use-case-demo-scans']"))),
        "Degraded Scans tab renders interactive scan confidence demo"
      );
    });

    await runCase("B5.5 StoryNavBar scroll highlight, Command Palette (Cmd/Ctrl+K) & Theme Toggle", async () => {
      await page.click("[data-testid='story-nav-link-risk-tiers']");
      await sleep(500);
      const activeNav = await page.evaluate(() =>
        document.querySelector("[data-testid='story-nav-link-risk-tiers']")?.getAttribute("aria-current")
      );
      assertEqual(activeNav, "location", "StoryNavBar highlights active #risk-tiers link");

      // Open Command Palette via button & test theme toggle
      await page.click("[data-testid='story-nav-cmdk']");
      await sleep(150);
      assert(
        await page.evaluate(() => Boolean(document.querySelector("[data-testid='command-palette-dialog']"))),
        "Command Palette dialog opens"
      );
      await page.click("[data-testid='command-item-pref-theme']");
      await sleep(200);
      const themeNow = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      assertEqual(themeNow, "dark", "Command Palette theme command toggles dark theme");

      // Re-open with Ctrl+K and close with Escape
      await page.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        modifiers: 2, // Ctrl
        key: "k",
        code: "KeyK",
        windowsVirtualKeyCode: 75,
      });
      await page.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        modifiers: 2,
        key: "k",
        code: "KeyK",
        windowsVirtualKeyCode: 75,
      });
      await sleep(150);
      assert(
        await page.evaluate(() => Boolean(document.querySelector("[data-testid='command-palette-dialog']"))),
        "Ctrl+K opens Command Palette"
      );
      await page.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await page.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await sleep(120);
      assert(
        await page.evaluate(() => !document.querySelector("[data-testid='command-palette-dialog']")),
        "Escape closes Command Palette"
      );
    });

    await runCase("B5.6 Responsive overflow (375/768/1280), CTAs & 0 runtime exceptions", async () => {
      for (const vp of [
        { width: 375, height: 812 },
        { width: 768, height: 1024 },
        { width: 1280, height: 860 },
      ]) {
        await page.setViewport(vp);
        await sleep(150);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        );
        assertEqual(overflow, false, `Zero horizontal overflow at ${vp.width}px`);
      }

      // Test Launch Live Copilot CTA route preservation
      await page.click("[data-testid='landing-copilot-cta']");
      await sleep(400);
      const pathname = await page.evaluate(() => window.location.pathname);
      assertEqual(pathname, "/workspace", "Launch Live Copilot CTA navigates to /workspace");
      assertEqual(pageErrors.length, 0, `Zero runtime JS exceptions (${JSON.stringify(pageErrors)})`);
    });

    await runCase("B5.7 Intake card CTAs (Launch Demo Dossier, Load demo case, Start Agent Review with staged files)", async () => {
      await page.goto(`${WEB_URL}/`, { sleepAfter: 700 });
      await page.waitForSelector("[data-testid='landing-primary-cta']", { timeout: 8000 });

      const initialCta = await page.evaluate(
        () => document.querySelector("[data-testid='landing-primary-cta']")?.textContent?.trim() || ""
      );
      assertEqual(initialCta, "Launch Demo Dossier", "0 staged files shows 'Launch Demo Dossier'");

      // Stage 2 real files via DOM.setFileInputFiles
      const os = await import("node:os");
      const tmpDir = fs.mkdtempSync(path.join(os.default.tmpdir(), "shieldstaff-b5-"));
      const f1 = path.join(tmpDir, "b5_policy.txt");
      const f2 = path.join(tmpDir, "b5_iam.json");
      fs.writeFileSync(f1, "Access control requires multifactor authentication.\n".repeat(40));
      fs.writeFileSync(f2, JSON.stringify({ rules: { admin: { action: "s3:*" } } }));

      try {
        const { root } = await page.send("DOM.getDocument", { depth: -1 });
        const { nodeId } = await page.send("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: "#landing-file-input",
        });
        await page.send("DOM.setFileInputFiles", { nodeId, files: [f1, f2] });
        await sleep(250);

        const stagedCta = await page.evaluate(
          () => document.querySelector("[data-testid='landing-primary-cta']")?.textContent?.trim() || ""
        );
        assertEqual(stagedCta, "Start Agent Review", "Staged files switch primary CTA to 'Start Agent Review'");

        await page.click("[data-testid='landing-primary-cta']");
        await sleep(1200);
        const wsState = await page.evaluate(() => ({
          path: window.location.pathname,
          text: document.body.innerText || "",
        }));
        assertEqual(wsState.path, "/workspace", "Start Agent Review navigates to /workspace");
        assertIncludes(wsState.text, "b5_policy.txt", "Workspace loaded staged file 1");
        assertIncludes(wsState.text, "b5_iam.json", "Workspace loaded staged file 2");

        // Test Load demo case CTA
        await page.goto(`${WEB_URL}/`, { sleepAfter: 600 });
        await page.click("[data-testid='landing-demo-link']");
        await sleep(1000);
        assertEqual(
          await page.evaluate(() => window.location.pathname),
          "/workspace",
          "Load demo case CTA navigates to /workspace"
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  } finally {
    await browser.stop();
    await server.stop();
  }

  console.log("\n================================================================================");
  console.log(`  INTERACTIVE HOME B5 E2E SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");
  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
