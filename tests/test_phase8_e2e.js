/**
 * Phase 8 Design System, Typography & Theme End-to-End Headless Chrome Suite
 *
 * Self-contained against isolated API (:18018 + temp SQLite DB), Vite (:15178),
 * and Chrome CDP (CHROME_PORT=19228) unless BERT_EXTERNAL_SERVERS=1 is set.
 *
 * Verifies:
 * 1. Offline self-hosted SIL OFL 1.1 fonts (0 external Google Fonts requests,
 *    0 failed font loads, loaded faces for Instrument Serif / Plus Jakarta Sans /
 *    JetBrains Mono, computed typography hierarchy + tabular-nums).
 * 2. Light theme default on fresh load (data-theme="light", no .dark class) +
 *    full DOM WCAG AA (>= 4.5:1) contrast audit across /, /workspace, /triage, /results.
 * 3. Theme toggle UI controls (pill, rail, sidebar), localStorage["bert-theme"]
 *    persistence across full reload, and visible color shift across all routes.
 * 4. Full DOM WCAG AA (>= 4.5:1) contrast audit in Dark theme across all 4 routes.
 * 5. Archival PDF paper legibility (.pdf-page stays crisp white in dark mode),
 *    Tier 1/3 active Viewer tab "bg-white" hook + dark-mode visual override,
 *    landmark/focus-ring invariants, and 0 setInterval in apps/web/src/.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HeadlessBrowser, sleep } from "./e2e/lib/cdp.js";
import { BertApiClient } from "./e2e/lib/api.js";
import { assert, assertEqual, assertIncludes } from "./e2e/lib/assert.js";

const ROOT_DIR = path.resolve(".");
const API_DIR = path.join(ROOT_DIR, "apps", "api");
const WEB_DIR = path.join(ROOT_DIR, "apps", "web");

const EXTERNAL_SERVERS = process.env.BERT_EXTERNAL_SERVERS === "1";
const API_PORT = parseInt(process.env.BERT_PHASE8_API_PORT || "18018", 10);
const WEB_PORT = parseInt(process.env.BERT_PHASE8_WEB_PORT || "15178", 10);
const CHROME_PORT = parseInt(process.env.CHROME_PORT || "19228", 10);

const API_URL = process.env.BERT_API_URL || `http://127.0.0.1:${API_PORT}`;
const WEB_URL = process.env.BERT_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;
const TEMP_DB_PATH = `/tmp/bert_phase8_${API_PORT}.db`;

async function waitForHttp(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`);
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
    }, 3000);
  });
}

function cleanupTempDb() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const p = `${TEMP_DB_PATH}${suffix}`;
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
    }
  }
}

async function startIsolatedServers() {
  cleanupTempDb();

  const pythonBin = path.join(API_DIR, ".venv", "bin", "python");
  const viteBin = path.join(WEB_DIR, "node_modules", ".bin", "vite");
  assert(fs.existsSync(pythonBin), `API virtualenv python exists at ${pythonBin}`);
  assert(fs.existsSync(viteBin), `Vite binary exists at ${viteBin}`);

  const apiLogs = [];
  const webLogs = [];

  const apiProc = spawn(
    pythonBin,
    ["-m", "uvicorn", "bert.main:app", "--host", "127.0.0.1", "--port", String(API_PORT)],
    {
      cwd: API_DIR,
      env: {
        ...process.env,
        DATABASE_URL: `sqlite+aiosqlite:///${TEMP_DB_PATH}`,
        API_ORIGIN: WEB_URL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  apiProc.stdout.on("data", (d) => apiLogs.push(d.toString()));
  apiProc.stderr.on("data", (d) => apiLogs.push(d.toString()));

  const webProc = spawn(
    viteBin,
    ["--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"],
    {
      cwd: WEB_DIR,
      env: {
        ...process.env,
        VITE_API_URL: API_URL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  webProc.stdout.on("data", (d) => webLogs.push(d.toString()));
  webProc.stderr.on("data", (d) => webLogs.push(d.toString()));

  try {
    await waitForHttp(`${API_URL}/health`, 25000);
    await waitForHttp(`${WEB_URL}/`, 25000);
  } catch (err) {
    console.error("API Logs:\n" + apiLogs.slice(-20).join(""));
    console.error("Web Logs:\n" + webLogs.slice(-20).join(""));
    await killProcessTree(webProc);
    await killProcessTree(apiProc);
    cleanupTempDb();
    throw err;
  }

  return {
    stop: async () => {
      await killProcessTree(webProc);
      await killProcessTree(apiProc);
      cleanupTempDb();
    },
  };
}

/**
 * Evaluates full-page WCAG AA contrast inside the browser page, properly
 * alpha-compositing translucent foreground/background layers over ancestor surfaces.
 */
async function auditDomContrast(page, routeLabel, themeName) {
  return page.evaluate(
    ({ route, theme }) => {
      function parseColor(str) {
        if (!str || str === "transparent") return [0, 0, 0, 0];
        const m = str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i);
        if (!m) return null;
        return [
          Number(m[1]),
          Number(m[2]),
          Number(m[3]),
          m[4] !== undefined ? Number(m[4]) : 1,
        ];
      }

      function compositeOver(fg, bg) {
        const a = fg[3];
        if (a >= 0.999) return [fg[0], fg[1], fg[2], 1];
        const outA = a + bg[3] * (1 - a);
        if (outA <= 0.0001) return [0, 0, 0, 0];
        return [
          (fg[0] * a + bg[0] * bg[3] * (1 - a)) / outA,
          (fg[1] * a + bg[1] * bg[3] * (1 - a)) / outA,
          (fg[2] * a + bg[2] * bg[3] * (1 - a)) / outA,
          outA,
        ];
      }

      function lum(rgb) {
        const channels = [rgb[0], rgb[1], rgb[2]].map((c) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      }

      function ratio(c1, c2) {
        const l1 = lum(c1);
        const l2 = lum(c2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      function getEffectiveBg(el) {
        const layers = [];
        let curr = el;
        while (curr) {
          const style = window.getComputedStyle(curr);
          const bg = parseColor(style.backgroundColor);
          if (bg && bg[3] > 0.001) {
            layers.push(bg);
            if (bg[3] >= 0.999) break;
          }
          curr = curr.parentElement;
        }
        let base =
          document.documentElement.getAttribute("data-theme") === "dark"
            ? [14, 17, 23, 1]
            : [250, 248, 245, 1];
        for (let i = layers.length - 1; i >= 0; i--) {
          base = compositeOver(layers[i], base);
        }
        return base;
      }

      function isVisible(el) {
        if (!el || el.closest("[aria-hidden='true']")) return false;
        if (el.closest(".textLayer")) return false; // pdfjs invisible selectable overlay
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        // Skip sr-only offscreen skip links when unfocused
        if (rect.width <= 2 && rect.height <= 2) return false;
        let curr = el;
        while (curr && curr !== document.documentElement) {
          const st = window.getComputedStyle(curr);
          if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) < 0.05) {
            return false;
          }
          curr = curr.parentElement;
        }
        return true;
      }

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seenElements = new Set();
      const failures = [];
      let checked = 0;

      let node;
      while ((node = walker.nextNode())) {
        const text = (node.nodeValue || "").trim();
        if (!text) continue;
        const el = node.parentElement;
        if (!el || seenElements.has(el)) continue;
        seenElements.add(el);
        if (!isVisible(el)) continue;

        const st = window.getComputedStyle(el);
        const fg = parseColor(st.color);
        if (!fg || fg[3] < 0.05) continue;

        const bg = getEffectiveBg(el);
        const compositedFg = compositeOver(fg, bg);
        const cr = ratio(compositedFg, bg);

        const fontSize = parseFloat(st.fontSize) || 14;
        const fontWeight = parseInt(st.fontWeight, 10) || 400;
        const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const minRequired = isLarge ? 3.0 : 4.5;

        checked++;
        if (cr < minRequired) {
          failures.push({
            route,
            theme,
            tag: el.tagName.toLowerCase(),
            text: text.slice(0, 48),
            ratio: Number(cr.toFixed(2)),
            minRequired,
            fg: st.color,
            bg: `rgb(${Math.round(bg[0])}, ${Math.round(bg[1])}, ${Math.round(bg[2])})`,
            className: typeof el.className === "string" ? el.className.slice(0, 80) : "",
          });
        }
      }

      return { checked, failures };
    },
    { route: routeLabel, theme: themeName }
  );
}

async function runPhase8BrowserSuite() {
  console.log("================================================================================");
  console.log("  PHASE 8 DESIGN SYSTEM, TYPOGRAPHY & THEME E2E SUITE                           ");
  console.log("================================================================================");

  let servers = null;
  if (!EXTERNAL_SERVERS) {
    console.log(`  Starting isolated API (${API_URL}) & Vite (${WEB_URL})...`);
    servers = await startIsolatedServers();
  }

  const api = new BertApiClient(API_URL);
  const browser = new HeadlessBrowser({ port: CHROME_PORT });
  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    process.stdout.write(`  [Phase8 E2E] ${name} ... `);
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
    // Ensure deterministic seeded corpus before opening UI
    const health = await api.health();
    assert(health.ok, `API health check passed on ${API_URL}`);
    const seedRes = await api.seedDemo();
    assert(seedRes.ok, "Demo corpus seeded cleanly for Phase 8 audit");

    await browser.start();
    const page = await browser.newPage();

    // Monitor CDP network traffic for zero external font requests / failed font assets
    await page.send("Network.enable");
    const networkRequests = [];
    const failedAssets = [];
    page.client.on("Network.requestWillBeSent", (params) => {
      networkRequests.push({
        requestId: params.requestId,
        url: params.request?.url || "",
        type: params.type || "",
      });
    });
    page.client.on("Network.responseReceived", (params) => {
      if (params.response?.status >= 400 && (params.type === "Font" || /\.(woff2?|ttf|otf)(\?|$)/i.test(params.response.url))) {
        failedAssets.push({ url: params.response.url, status: params.response.status });
      }
    });
    page.client.on("Network.loadingFailed", (params) => {
      const req = networkRequests.find((r) => r.requestId === params.requestId);
      if (req && (req.type === "Font" || /\.(woff2?|ttf|otf)(\?|$)/i.test(req.url))) {
        failedAssets.push({ url: req.url, errorText: params.errorText });
      }
    });

    // -------------------------------------------------------------------------
    // Case 8.1: Offline Self-Hosted Fonts, Zero Google Fonts & Typography Audit
    // -------------------------------------------------------------------------
    await runCase("8.1 Offline self-hosted SIL OFL fonts, zero Google Fonts, typography hierarchy & tabular-nums", async () => {
      await page.goto(`${WEB_URL}/`, { sleepAfter: 1200 });
      await page.waitForSelector("#hero h1", { timeout: 10000 });

      const fontAudit = await page.evaluate(async () => {
        await document.fonts.ready;
        const loadedFamilies = Array.from(document.fonts)
          .filter((f) => f.status === "loaded")
          .map((f) => f.family.replace(/['"]/g, ""));
        const uniqueLoaded = Array.from(new Set(loadedFamilies));

        const googleFontLinks = Array.from(document.querySelectorAll("link")).filter((l) =>
          (l.href || "").includes("fonts.googleapis.com") || (l.href || "").includes("fonts.gstatic.com")
        ).length;

        const h1Font = window.getComputedStyle(document.querySelector("#hero h1")).fontFamily;
        const bodyFont = window.getComputedStyle(document.body).fontFamily;
        const monoEl = document.querySelector(".font-mono");
        const monoFont = monoEl ? window.getComputedStyle(monoEl).fontFamily : "";

        return {
          status: document.fonts.status,
          uniqueLoaded,
          googleFontLinks,
          h1Font,
          bodyFont,
          monoFont,
        };
      });

      assertEqual(fontAudit.googleFontLinks, 0, "Zero Google Fonts <link> elements in DOM");
      assertEqual(fontAudit.status, "loaded", "document.fonts.status === 'loaded'");
      assert(
        fontAudit.uniqueLoaded.some((f) => f.toLowerCase().includes("instrument serif")),
        `Instrument Serif loaded (${JSON.stringify(fontAudit.uniqueLoaded)})`
      );
      assert(
        fontAudit.uniqueLoaded.some((f) => f.toLowerCase().includes("plus jakarta sans")),
        `Plus Jakarta Sans loaded (${JSON.stringify(fontAudit.uniqueLoaded)})`
      );
      assert(
        fontAudit.uniqueLoaded.some((f) => f.toLowerCase().includes("jetbrains mono")),
        `JetBrains Mono loaded (${JSON.stringify(fontAudit.uniqueLoaded)})`
      );
      assertIncludes(fontAudit.h1Font.toLowerCase(), "instrument serif", "Hero H1 uses Instrument Serif");
      assertIncludes(fontAudit.bodyFont.toLowerCase(), "plus jakarta sans", "Body uses Plus Jakarta Sans");
      assertIncludes(fontAudit.monoFont.toLowerCase(), "jetbrains mono", ".font-mono uses JetBrains Mono");

      const externalFontReqs = networkRequests.filter(
        (r) => r.url.includes("fonts.googleapis.com") || r.url.includes("fonts.gstatic.com")
      );
      assertEqual(externalFontReqs.length, 0, "Zero network requests to fonts.googleapis.com / fonts.gstatic.com");
      assertEqual(failedAssets.length, 0, `Zero failed font loads (${JSON.stringify(failedAssets)})`);

      // Check tabular-nums on numeric counters/scores in /workspace
      await page.goto(`${WEB_URL}/workspace`, { sleepAfter: 1000 });
      await page.waitForSelector("main#main-content", { timeout: 10000 });
      const tabularAudit = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll(".tabular-nums"));
        const withTabular = els.filter((el) =>
          (window.getComputedStyle(el).fontVariantNumeric || "").includes("tabular-nums")
        );
        return { total: els.length, withTabular: withTabular.length };
      });
      assert(tabularAudit.total >= 2, `Found ${tabularAudit.total} .tabular-nums counters/badges in /workspace`);
      assertEqual(tabularAudit.withTabular, tabularAudit.total, "All .tabular-nums elements compute font-variant-numeric: tabular-nums");
    });

    // -------------------------------------------------------------------------
    // Case 8.2: Light Theme Default + Multi-Route WCAG AA Contrast Audit
    // -------------------------------------------------------------------------
    let lightColors = {};
    await runCase("8.2 Light theme default & WCAG AA (>=4.5:1) contrast audit across /, /workspace, /triage, /results", async () => {
      await page.goto(`${WEB_URL}/`, { sleepAfter: 600 });
      await page.evaluate(() => {
        localStorage.removeItem("bert-theme");
      });
      await page.send("Page.reload");
      await sleep(900);

      const initTheme = await page.evaluate(() => ({
        dataTheme: document.documentElement.getAttribute("data-theme"),
        hasDarkClass: document.documentElement.classList.contains("dark"),
        stored: localStorage.getItem("bert-theme"),
      }));
      assertEqual(initTheme.dataTheme, "light", "Fresh load defaults to data-theme='light'");
      assertEqual(initTheme.hasDarkClass, false, "Fresh load has no .dark class");

      const routes = ["/", "/workspace", "/triage", "/results"];
      for (const route of routes) {
        await page.goto(`${WEB_URL}${route}`, { sleepAfter: 1000 });
        await page.waitForSelector("main#main-content, #hero", { timeout: 10000 });
        const snap = await page.evaluate(() => ({
          bodyBg: window.getComputedStyle(document.body).backgroundColor,
          bodyColor: window.getComputedStyle(document.body).color,
        }));
        lightColors[route] = snap;

        const audit = await auditDomContrast(page, route, "light");
        assert(audit.checked > 15, `Audited ${audit.checked} text elements on ${route} (light)`);
        assertEqual(
          audit.failures.length,
          0,
          `WCAG AA contrast >=4.5:1 on ${route} (light); failures: ${JSON.stringify(audit.failures.slice(0, 5))}`
        );
      }
    });

    // -------------------------------------------------------------------------
    // Case 8.3: Theme Toggle Controls, Persistence Across Reload & Dark Contrast
    // -------------------------------------------------------------------------
    await runCase("8.3 Theme toggles, localStorage persistence across reload & Dark WCAG AA contrast across all routes", async () => {
      await page.goto(`${WEB_URL}/`, { sleepAfter: 800 });
      await page.waitForSelector("[data-testid='top-pill-theme-toggle']", { timeout: 8000 });
      await page.click("[data-testid='top-pill-theme-toggle']");
      await sleep(300);

      const afterToggle = await page.evaluate(() => ({
        dataTheme: document.documentElement.getAttribute("data-theme"),
        hasDarkClass: document.documentElement.classList.contains("dark"),
        stored: localStorage.getItem("bert-theme"),
      }));
      assertEqual(afterToggle.dataTheme, "dark", "Toggle switches html[data-theme] to 'dark'");
      assertEqual(afterToggle.hasDarkClass, true, "Toggle adds .dark class on <html>");
      assertEqual(afterToggle.stored, "dark", "Persists 'dark' in localStorage['bert-theme']");

      // Reload & verify persistence
      await page.send("Page.reload");
      await sleep(900);
      const afterReload = await page.evaluate(() => ({
        dataTheme: document.documentElement.getAttribute("data-theme"),
        hasDarkClass: document.documentElement.classList.contains("dark"),
        stored: localStorage.getItem("bert-theme"),
      }));
      assertEqual(afterReload.dataTheme, "dark", "Dark theme persists after Page.reload");
      assertEqual(afterReload.hasDarkClass, true, ".dark class persists after Page.reload");

      // Audit all 4 routes in Dark theme + verify visible background/foreground shift
      const routes = ["/", "/workspace", "/triage", "/results"];
      for (const route of routes) {
        await page.goto(`${WEB_URL}${route}`, { sleepAfter: 1000 });
        await page.waitForSelector("main#main-content, #hero", { timeout: 10000 });

        const snap = await page.evaluate(() => ({
          dataTheme: document.documentElement.getAttribute("data-theme"),
          bodyBg: window.getComputedStyle(document.body).backgroundColor,
          bodyColor: window.getComputedStyle(document.body).color,
        }));
        assertEqual(snap.dataTheme, "dark", `${route} stays in dark theme`);
        assert(
          snap.bodyBg !== lightColors[route].bodyBg,
          `${route} body background visibly shifts (${lightColors[route].bodyBg} -> ${snap.bodyBg})`
        );
        assert(
          snap.bodyColor !== lightColors[route].bodyColor,
          `${route} body ink visibly shifts (${lightColors[route].bodyColor} -> ${snap.bodyColor})`
        );

        const audit = await auditDomContrast(page, route, "dark");
        assert(audit.checked > 15, `Audited ${audit.checked} text elements on ${route} (dark)`);
        assertEqual(
          audit.failures.length,
          0,
          `WCAG AA contrast >=4.5:1 on ${route} (dark); failures: ${JSON.stringify(audit.failures.slice(0, 5))}`
        );
      }

      // Verify pill + rail toggles stay synchronized on / and sidebar toggle syncs on /workspace
      await page.goto(`${WEB_URL}/`, { sleepAfter: 800 });
      await page.waitForSelector("[data-testid='rail-theme-toggle']", { timeout: 8000 });
      await page.click("[data-testid='rail-theme-toggle']");
      await sleep(250);
      const syncedToLight = await page.evaluate(() => ({
        dataTheme: document.documentElement.getAttribute("data-theme"),
        railPressed: document.querySelector("[data-testid='rail-theme-toggle']")?.getAttribute("aria-pressed"),
        pillPressed: document.querySelector("[data-testid='top-pill-theme-toggle']")?.getAttribute("aria-pressed"),
      }));
      assertEqual(syncedToLight.dataTheme, "light", "Rail toggle switches back to light");
      assertEqual(syncedToLight.railPressed, "false", "Rail toggle aria-pressed updates to false");
      assertEqual(syncedToLight.pillPressed, "false", "Top pill toggle stays synchronized");

      // Switch back to dark via AttioSidebar toggle on /workspace for Case 8.4
      await page.goto(`${WEB_URL}/workspace`, { sleepAfter: 900 });
      await page.waitForSelector("[data-testid='sidebar-theme-toggle']", { timeout: 8000 });
      await page.click("[data-testid='sidebar-theme-toggle']");
      await sleep(250);
      const backToDark = await page.evaluate(() => ({
        dataTheme: document.documentElement.getAttribute("data-theme"),
        sidebarPressed: document.querySelector("[data-testid='sidebar-theme-toggle']")?.getAttribute("aria-pressed"),
      }));
      assertEqual(backToDark.dataTheme, "dark", "Sidebar toggle switches cleanly to dark");
      assertEqual(backToDark.sidebarPressed, "true", "Sidebar toggle aria-pressed updates to true");
    });

    // -------------------------------------------------------------------------
    // Case 8.4: Archival PDF Legibility & Tier 1/3 DOM Hooks in Dark Mode
    // -------------------------------------------------------------------------
    await runCase("8.4 Archival PDF paper stays white in Dark mode & Tier 1/3 DOM hooks preserved", async () => {
      await page.goto(`${WEB_URL}/workspace`, { sleepAfter: 900 });
      await page.waitForSelector("[data-testid='corpus-file-item']", { timeout: 10000 });

      // Select SOC2 PDF document in sidebar to open PDF Viewer
      const clickedPdf = await page.evaluate(() => {
        const pdfItem = Array.from(document.querySelectorAll("[data-testid='corpus-file-item']")).find((el) =>
          (el.textContent || "").includes(".pdf")
        );
        if (!pdfItem) return false;
        pdfItem.click();
        return true;
      });
      assert(clickedPdf, "Clicked a .pdf corpus document in sidebar");
      await sleep(1000);

      // Ensure Viewer tab is active if tabs exist
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll("[role='tab']"));
        const viewerTab = tabs.find((t) => (t.textContent || "").trim() === "Viewer");
        if (viewerTab && viewerTab.getAttribute("aria-selected") !== "true") {
          viewerTab.click();
        }
      });
      await sleep(500);

      const workspaceDomAudit = await page.evaluate(() => {
        const pdfViewer = document.querySelector("[data-testid='pdf-viewer']");
        const pdfPage = document.querySelector(".pdf-page");
        const pdfPageBg = pdfPage ? window.getComputedStyle(pdfPage).backgroundColor : null;
        const pdfStage = document.querySelector(".pdf-stage");
        const pdfStageBg = pdfStage ? window.getComputedStyle(pdfStage).backgroundColor : null;

        const activeTab = document.querySelector("[role='tab'][aria-selected='true']");
        const activeTabClass = activeTab ? (typeof activeTab.className === "string" ? activeTab.className : "") : "";
        const activeTabBg = activeTab ? window.getComputedStyle(activeTab).backgroundColor : "";

        const hasMain = Boolean(document.querySelector("main#main-content"));
        const hasSkip = Boolean(document.querySelector("a[href='#main-content']"));
        const badInputs = Array.from(document.querySelectorAll("input, textarea")).filter((el) => {
          const cls = typeof el.className === "string" ? el.className : "";
          return !cls.includes("focus-visible:ring") && !cls.includes("focus:ring");
        }).length;

        return {
          hasPdfViewer: Boolean(pdfViewer),
          pdfPageBg,
          pdfStageBg,
          activeTabClass,
          activeTabBg,
          hasMain,
          hasSkip,
          badInputs,
        };
      });

      assert(workspaceDomAudit.hasPdfViewer, "PDF viewer mounted in Inspector");
      assert(Boolean(workspaceDomAudit.pdfPageBg), "PDF .pdf-page surface is rendered and measurable");
      assertEqual(
        workspaceDomAudit.pdfPageBg,
        "rgb(255, 255, 255)",
        "PDF page preserves archival white paper rgb(255, 255, 255) in dark theme"
      );
      assertIncludes(
        workspaceDomAudit.activeTabClass,
        "bg-white",
        "Tier 1/3 hook: active tab keeps 'bg-white' token in className"
      );
      assert(
        workspaceDomAudit.activeTabBg !== "rgb(255, 255, 255)",
        `Active tab bg visibly overrides in dark theme (${workspaceDomAudit.activeTabBg})`
      );
      assert(workspaceDomAudit.hasMain, "main#main-content landmark preserved");
      assert(workspaceDomAudit.hasSkip, "Skip link a[href='#main-content'] preserved");
      assertEqual(workspaceDomAudit.badInputs, 0, "All input/textarea controls retain focus ring class");

      // Check zero setInterval in apps/web/src/
      const srcDir = path.join(WEB_DIR, "src");
      let setIntervalCount = 0;
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !full.includes(`${path.sep}tests${path.sep}`)) {
            const text = fs.readFileSync(full, "utf8");
            setIntervalCount += (text.match(/\bsetInterval\s*\(/g) || []).length;
          }
        }
      };
      walk(srcDir);
      assertEqual(setIntervalCount, 0, "0 setInterval calls across apps/web/src");
    });
  } finally {
    await browser.stop();
    if (servers) {
      await servers.stop();
    }
  }

  console.log("\n================================================================================");
  console.log(`  PHASE 8 E2E SUMMARY: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase8BrowserSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
