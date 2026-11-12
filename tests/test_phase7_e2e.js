/**
 * Phase 7 End-to-End Headless Chrome Verification Suite
 * Covers:
 * 1. Multi-file staged upload (stages multiple real files, verifies KB formatting, removes individual file, uploads ALL staged files -> /workspace)
 * 2. Zero false claims & 7-section structure (#hero, #evidence-demo, #how-it-works, #security-gate, #use-cases, #local-mode, footer)
 * 3. Interactive Claim -> Source Evidence demo (all 4 cases including Missing-Proof -> "Flagged -> Human Triage")
 * 4. Keyboard-operable Use Case accordions (<button aria-expanded>, 0 clickable <div>)
 * 5. Anchor navigation & smooth scroll to #security-gate / #how-it-works / #use-cases / #local-mode
 * 6. prefers-reduced-motion: reduce emulation (Particles + demo autoplay + manual controls still work)
 * 7. Zero overlap (getBoundingClientRect intersection check), WCAG AA contrast (>= 4.5:1) on hero text,
 *    and responsive scrollWidth <= innerWidth at 375px, 768px, 1280px
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const WEB_URL = process.env.BERT_WEB_URL || "http://localhost:5173";

async function setFilesOnInput(page, selector, filePaths) {
  const { root } = await page.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await page.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  assert(nodeId && nodeId > 0, `Located file input ${selector}`);
  await page.send("DOM.setFileInputFiles", {
    nodeId,
    files: filePaths,
  });
}

async function runPhase7BrowserSuite() {
  console.log("================================================================================");
  console.log("  PHASE 7 LANDING PAGE REBUILD E2E HEADLESS CHROME SUITE                        ");
  console.log("================================================================================");

  const browser = new HeadlessBrowser();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bert-phase7-upload-"));
  let passed = 0;
  let failed = 0;

  // Create real temporary test files (< 100 KB) for multi-file upload
  const file1 = path.join(tmpDir, "phase7_soc2_policy.txt");
  const file2 = path.join(tmpDir, "phase7_iam_config.json");
  const file3 = path.join(tmpDir, "phase7_sla_addendum.md");
  fs.writeFileSync(file1, "Access control requires multifactor authentication.\n".repeat(240)); // 12,480 bytes -> "12 KB"
  fs.writeFileSync(
    file2,
    JSON.stringify(
      {
        rules: {
          "wildcard-admin": { effect: "Allow", action: "s3:*", resource: "*" },
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(file3, "# Vendor SLA Addendum\nAnnual penetration test evidence required.\n");

  async function runCase(name, fn) {
    process.stdout.write(`  [Phase7 E2E] ${name} ... `);
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
    // Case 1: Zero false claims, 7-section structure, Interactive Demo & Accordions
    // -------------------------------------------------------------------------
    await runCase("7.1 Zero false claims, 7 sections, interactive demo & keyboard accordions", async () => {
      await page.goto(`${WEB_URL}/`, { sleepAfter: 1000 });
      await page.waitForSelector("#hero", { timeout: 10000 });

      const audit = await page.evaluate(() => {
        const bodyText = (document.body.innerText || "").toLowerCase();
        const title = (document.title || "").toLowerCase();
        const sectionIds = [
          "hero",
          "evidence-demo",
          "how-it-works",
          "security-gate",
          "use-cases",
          "local-mode",
        ];
        const missingSections = sectionIds.filter((id) => !document.getElementById(id));
        const hasFooter = Boolean(document.querySelector("footer"));
        const pipelineAgents = Array.from(
          document.querySelectorAll("[data-testid^='pipeline-agent-'] h3")
        ).map((el) => el.textContent?.trim());

        const useCaseDivClickables = Array.from(
          document.querySelectorAll("#use-cases div[class*='cursor-pointer'], #use-cases span[class*='cursor-pointer']")
        ).length;
        const useCaseButtons = Array.from(
          document.querySelectorAll("#use-cases button[aria-expanded]")
        ).length;

        const hasSkipLink = Boolean(document.querySelector("a[href='#main-content']"));
        const hasMain = Boolean(document.querySelector("main#main-content"));

        return {
          bodyText,
          title,
          missingSections,
          hasFooter,
          pipelineAgents,
          useCaseDivClickables,
          useCaseButtons,
          hasSkipLink,
          hasMain,
        };
      });

      const forbidden = [
        "zero hallucinations",
        "zero hallucination",
        "zero-hallucination",
        "zero data loss",
        "zero-data-loss",
        "zero truncation",
      ];
      for (const phrase of forbidden) {
        assert(!audit.bodyText.includes(phrase), `Landing text omits false claim '${phrase}'`);
        assert(!audit.title.includes(phrase), `Document title omits false claim '${phrase}'`);
      }

      assertEqual(audit.missingSections.length, 0, "All 6 section anchor IDs exist");
      assert(audit.hasFooter, "Semantic <footer> exists");
      assert(audit.hasSkipLink, "Skip-link a[href='#main-content'] preserved");
      assert(audit.hasMain, "Landmark main#main-content preserved");
      assertEqual(
        audit.pipelineAgents.join("->"),
        "Scout->Quartermaster->Chronos->Vanguard->Ranger->Arbiter->Envoy",
        "7-agent pipeline renders exact canonical sequence"
      );
      assertEqual(audit.useCaseDivClickables, 0, "0 clickable <div> inside #use-cases");
      assertEqual(audit.useCaseButtons, 4, "4 keyboard-accessible <button aria-expanded> in #use-cases");

      // Step through all 4 Claim -> Source Evidence demo tabs
      const demoCases = [
        { id: "soc2-mfa", expectLocator: "p. 14", expectStatus: "VERIFIED" },
        { id: "aws-iam-wildcard", expectLocator: "$.rules.wildcard-admin.action", expectStatus: "VERIFIED" },
        { id: "chronos-supersession", expectLocator: "Questionnaire!A5:D5", expectStatus: "VERIFIED" },
        { id: "missing-proof-escalation", expectLocator: "No matching source node", expectStatus: "Flagged -> Human Triage" },
      ];
      for (const dc of demoCases) {
        await page.click(`[data-testid='evidence-demo-tab-${dc.id}']`);
        await sleep(120);
        const stageState = await page.evaluate(() => {
          const stage = document.querySelector("[data-testid='evidence-demo-stage']");
          return {
            text: stage?.textContent || "",
            status: document.querySelector("[data-testid='evidence-demo-status']")?.textContent || "",
            hasMark: Boolean(stage?.querySelector("mark")),
          };
        });
        assertIncludes(stageState.text, dc.expectLocator, `Demo '${dc.id}' shows locator '${dc.expectLocator}'`);
        assertIncludes(stageState.status, dc.expectStatus, `Demo '${dc.id}' shows status '${dc.expectStatus}'`);
        assert(stageState.hasMark, `Demo '${dc.id}' highlights snippet via <mark>`);
      }

      // Keyboard operate Use Case accordion (#2: Policy Version Audits)
      await page.evaluate(() => {
        const btn = document.querySelector("[data-testid='use-case-toggle-policy-version-audits']");
        btn.scrollIntoView({ block: "center" });
        btn.focus();
      });
      await sleep(100);
      const beforeKey = await page.evaluate(() =>
        document
          .querySelector("[data-testid='use-case-toggle-policy-version-audits']")
          ?.getAttribute("aria-expanded")
      );
      assertEqual(beforeKey, "false", "Policy Version Audits accordion starts collapsed");

      await page.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
      await page.send("Input.dispatchKeyEvent", {
        type: "char",
        text: "\r",
      });
      await page.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
      await sleep(120);
      const afterKey = await page.evaluate(() => ({
        expanded: document
          .querySelector("[data-testid='use-case-toggle-policy-version-audits']")
          ?.getAttribute("aria-expanded"),
        panelVisible: Boolean(
          document.querySelector("[data-testid='use-case-panel-policy-version-audits']")
        ),
      }));
      assertEqual(afterKey.expanded, "true", "Pressing Enter opens Use Case accordion");
      assert(afterKey.panelVisible, "Use Case panel renders when expanded");
    });

    // -------------------------------------------------------------------------
    // Case 2: Anchor scroll & prefers-reduced-motion emulation
    // -------------------------------------------------------------------------
    await runCase("7.2 Smooth anchor scroll & prefers-reduced-motion: reduce emulation", async () => {
      const scrollPage = await browser.newPage();
      try {
        await scrollPage.setViewport({ width: 1280, height: 800 });
        await scrollPage.goto(`${WEB_URL}/`, { sleepAfter: 800 });
        await scrollPage.waitForSelector("#security-gate", { timeout: 10000 });

        for (const anchor of ["security-gate", "how-it-works", "use-cases", "local-mode"]) {
          const clicked = await scrollPage.evaluate((targetLabel) => {
            const map = {
              "security-gate": "Security Gate",
              "how-it-works": "Pipeline",
              "use-cases": "Use Cases",
              "local-mode": "Local Mode",
            };
            const nav = document.querySelector("nav[aria-label='Landing section navigation']");
            const btn = Array.from(nav?.querySelectorAll("button") || []).find(
              (b) => b.textContent?.trim() === map[targetLabel]
            );
            if (!btn) return false;
            btn.click();
            return true;
          }, anchor);
          assert(clicked, `Clicked top-pill nav button for #${anchor}`);
          let rectTop = 9999;
          let debugState = null;
          for (let attempt = 0; attempt < 20; attempt++) {
            await sleep(120);
            debugState = await scrollPage.evaluate((id) => {
              return {
                top: document.getElementById(id)?.getBoundingClientRect().top ?? 9999,
                scrollY: window.scrollY,
                scrollHeight: document.documentElement.scrollHeight,
                innerHeight: window.innerHeight,
                reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
              };
            }, anchor);
            rectTop = debugState.top;
            if (Math.abs(rectTop) < 350) break;
          }
          assert(
            Math.abs(rectTop) < 350,
            `Section #${anchor} scrolled into view (${JSON.stringify(debugState)})`
          );
        }

        // Emulate prefers-reduced-motion: reduce
        await scrollPage.send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await scrollPage.goto(`${WEB_URL}/`, { sleepAfter: 500 });
        await scrollPage.waitForSelector("#hero", { timeout: 10000 });

        const reducedCheck = await scrollPage.evaluate(() => {
          const matches = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const particlesEl = document.querySelector(".particles-container");
          const autoBtn = document.querySelector("[data-testid='evidence-demo-autoplay-toggle']");
          return {
            matches,
            particlesReduced: particlesEl?.getAttribute("data-reduced-motion"),
            autoBtnDisabled: Boolean(autoBtn?.hasAttribute("disabled")),
            autoBtnText: autoBtn?.textContent?.trim() || "",
          };
        });

        assertEqual(reducedCheck.matches, true, "Emulated prefers-reduced-motion: reduce active");
        assertEqual(reducedCheck.particlesReduced, "true", "Particles detected reduced motion");
        assertEqual(reducedCheck.autoBtnDisabled, true, "Demo auto-play disabled under reduced motion");
        assertIncludes(reducedCheck.autoBtnText, "Reduced Motion", "Toggle reflects Reduced Motion state");

        // Manual control still works under reduced motion
        await scrollPage.click("[data-testid='evidence-demo-tab-aws-iam-wildcard']");
        await sleep(100);
        const manualDemoText = await scrollPage.evaluate(
          () => document.querySelector("[data-testid='evidence-demo-stage']")?.textContent || ""
        );
        assertIncludes(
          manualDemoText,
          "$.rules.wildcard-admin.action",
          "Manual demo switching works under prefers-reduced-motion"
        );

        // Clear media emulation
        await scrollPage.send("Emulation.setEmulatedMedia", { features: [] });
      } finally {
        await scrollPage.close();
      }
    });

    // -------------------------------------------------------------------------
    // Case 3: Responsive 375px / 768px / 1280px, Zero Overlap & Hero Contrast
    // -------------------------------------------------------------------------
    await runCase("7.3 Responsive viewports (375/768/1280), zero overlap & >=4.5:1 hero contrast", async () => {
      const viewports = [
        { width: 1280, height: 800, mobile: false },
        { width: 768, height: 1024, mobile: false },
        { width: 375, height: 812, mobile: true },
      ];

      for (const vp of viewports) {
        await page.setViewport(vp);
        await page.goto(`${WEB_URL}/`, { sleepAfter: 500 });
      await page.waitForSelector("#hero", { timeout: 10000 });

        const layoutAudit = await page.evaluate(() => {
          const overflow = document.documentElement.scrollWidth > window.innerWidth;
          const card = document.querySelector("[data-testid='landing-intake-card']");
          const cardRect = card?.getBoundingClientRect();

          const overlaps = [];
          if (card && cardRect) {
            // Check right hero column blocks, header/top-pill, and rail
            const candidates = Array.from(
              document.querySelectorAll(
                "header, aside, nav, [data-testid='top-pill-connection-status'], #hero h1, #hero p, #hero .lg\\:col-span-7 > div"
              )
            ).filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && !el.contains(card) && !card.contains(el);
            });

            for (const el of candidates) {
              const r = el.getBoundingClientRect();
              const xOverlap = Math.max(0, Math.min(cardRect.right, r.right) - Math.max(cardRect.left, r.left));
              const yOverlap = Math.max(0, Math.min(cardRect.bottom, r.bottom) - Math.max(cardRect.top, r.top));
              if (xOverlap > 1 && yOverlap > 1) {
                overlaps.push({
                  tag: el.tagName.toLowerCase(),
                  text: (el.textContent || "").slice(0, 30),
                  xOverlap: Math.round(xOverlap),
                  yOverlap: Math.round(yOverlap),
                });
              }
            }
          }

          return {
            overflow,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            overlaps,
          };
        });

        assertEqual(
          layoutAudit.overflow,
          false,
          `Zero horizontal overflow at ${vp.width}px (scrollWidth=${layoutAudit.scrollWidth}, innerWidth=${layoutAudit.innerWidth})`
        );
        assertEqual(
          layoutAudit.overlaps.length,
          0,
          `Zero overlap with intake card at ${vp.width}px (found ${JSON.stringify(layoutAudit.overlaps)})`
        );
      }

      // Contrast audit on #hero at 1280px
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${WEB_URL}/`, { sleepAfter: 600 });

      const contrastAudit = await page.evaluate(() => {
        function getRGBA(str) {
          const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          return [
            parseInt(m[1], 10),
            parseInt(m[2], 10),
            parseInt(m[3], 10),
            m[4] !== undefined ? parseFloat(m[4]) : 1,
          ];
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
            const rgba = getRGBA(bg);
            if (rgba && rgba[3] > 0.05) return [rgba[0], rgba[1], rgba[2]];
            curr = curr.parentElement;
          }
          return [11, 16, 38];
        }

        const els = Array.from(
          document.querySelectorAll("#hero h1, #hero p, #hero span, #hero button, #hero div")
        ).filter((el) => {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent?.trim() || "")
            .join("")
            .trim();
          return ownText.length > 0;
        });

        const failures = [];
        for (const el of els) {
          const style = window.getComputedStyle(el);
          const fg = getRGBA(style.color);
          const bg = getEffectiveBg(el);
          if (fg && bg) {
            const l1 = lum(fg[0], fg[1], fg[2]);
            const l2 = lum(bg[0], bg[1], bg[2]);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (ratio < 4.5) {
              failures.push({
                text: el.textContent?.trim().slice(0, 32),
                ratio: Number(ratio.toFixed(2)),
                fg: style.color,
                bg: bg.join(","),
              });
            }
          }
        }
        return { checked: els.length, failures };
      });

      assert(contrastAudit.checked > 10, `Checked contrast on ${contrastAudit.checked} hero elements`);
      assertEqual(
        contrastAudit.failures.length,
        0,
        `Hero WCAG AA contrast >=4.5:1 (failures: ${JSON.stringify(contrastAudit.failures)})`
      );

      await page.resetViewport();
    });

    // -------------------------------------------------------------------------
    // Case 4: Multi-file staged upload passes ALL staged files to /workspace
    // -------------------------------------------------------------------------
    await runCase("7.4 Multi-file staged upload, KB size format, individual remove & full batch submit", async () => {
      await page.goto(`${WEB_URL}/`, { sleepAfter: 800 });

      const initialCta = await page.evaluate(
        () => document.querySelector("[data-testid='landing-primary-cta']")?.textContent?.trim() || ""
      );
      assertEqual(initialCta, "Launch Demo Dossier", "With 0 staged files, CTA reads 'Launch Demo Dossier'");

      // Stage 3 real files
      await setFilesOnInput(page, "#landing-file-input", [file1, file2, file3]);
      await sleep(300);

      const stagedInfo = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("[data-testid='staged-file-item']")).map((el) => ({
          text: el.textContent || "",
        }));
        const countLabel = document.querySelector("[data-testid='staged-files-count']")?.textContent || "";
        const ctaText = document.querySelector("[data-testid='landing-primary-cta']")?.textContent?.trim() || "";
        return { items, countLabel, ctaText };
      });

      assertEqual(stagedInfo.items.length, 3, "All 3 files staged in intake card");
      assertIncludes(stagedInfo.countLabel, "3 files staged", "Counter displays '3 files staged'");
      assertIncludes(stagedInfo.items[0].text, "12 KB", "12.5 KB file formats cleanly as '12 KB' (never '0.0 MB')");
      assert(!stagedInfo.items[0].text.includes("0.0 MB"), "Does not display '0.0 MB'");
      assertEqual(stagedInfo.ctaText, "Start Agent Review", "With staged files, CTA switches to 'Start Agent Review'");

      // Remove 1 file individually, then verify count updates to 2
      await page.click("button[aria-label='Remove phase7_sla_addendum.md']");
      await sleep(150);
      const afterRemove = await page.evaluate(() => ({
        count: document.querySelectorAll("[data-testid='staged-file-item']").length,
        label: document.querySelector("[data-testid='staged-files-count']")?.textContent || "",
      }));
      assertEqual(afterRemove.count, 2, "Removing 1 staged file leaves 2 files");
      assertIncludes(afterRemove.label, "2 files staged", "Counter updates to '2 files staged'");

      // Re-stage all 3 files and submit
      await setFilesOnInput(page, "#landing-file-input", [file3]);
      await sleep(200);
      const beforeSubmitCount = await page.evaluate(
        () => document.querySelectorAll("[data-testid='staged-file-item']").length
      );
      assertEqual(beforeSubmitCount, 3, "Re-staged 3rd file cleanly -> 3 total staged");

      await page.click("[data-testid='landing-primary-cta']");
      await sleep(1800);

      const workspaceState = await page.evaluate(() => ({
        pathname: window.location.pathname,
        bodyText: document.body.innerText || "",
      }));
      assertEqual(workspaceState.pathname, "/workspace", "Primary CTA navigated to /workspace");
      assertIncludes(workspaceState.bodyText, "phase7_soc2_policy.txt", "Workspace contains uploaded file 1");
      assertIncludes(workspaceState.bodyText, "phase7_iam_config.json", "Workspace contains uploaded file 2");
      assertIncludes(workspaceState.bodyText, "phase7_sla_addendum.md", "Workspace contains uploaded file 3");
    });
  } finally {
    await browser.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 7 E2E SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7BrowserSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
