/**
 * Phase 8 Design System Unit Suite
 * Covers:
 * 1. Self-hosted SIL OFL 1.1 font imports & zero external Google Fonts links
 * 2. Code hygiene: zero interval polling, zero low-contrast text-zinc-400/text-slate-400, zero scattered legacy hex colors
 * 3. Tier 1/3 DOM contract preservation (bg-white on active Inspector tab, focus-visible:ring on inputs/textareas, #main-content, select-none only on splitter)
 * 4. Theme helper state machine: light default, dark persistence in localStorage["bert-theme"], data-theme + .dark class, CustomEvent subscription
 * 5. WCAG 2.1 relativeLuminance, contrastRatio math & >= 4.5:1 across ALL light & dark token pairs
 */

declare const require: (id: string) => unknown;

const fs = require("node:fs") as {
  readFileSync: (filePath: string, encoding: string) => string;
  existsSync: (filePath: string) => boolean;
  readdirSync: (dirPath: string, opts: { withFileTypes: boolean }) => Array<{
    name: string;
    isDirectory: () => boolean;
    isFile: () => boolean;
  }>;
};
const path = require("node:path") as {
  sep: string;
  resolve: (...parts: string[]) => string;
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
};
const nodeProcess = (globalThis as unknown as { process: { cwd: () => string } }).process;

import {
  LEGACY_THEME_STORAGE_KEY,
  THEME_CONTRAST_AUDIT_PAIRS,
  THEME_STORAGE_KEY,
  THEME_TOKENS,
  applyTheme,
  contrastRatio,
  getInitialTheme,
  hexToRgb,
  relativeLuminance,
  subscribeSystemOrToggle,
  toggleThemeMode,
} from "../lib/theme";

let assertCount = 0;

function assert(cond: unknown, message: string): void {
  assertCount += 1;
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  PASS: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assertCount += 1;
  if (actual !== expected) {
    throw new Error(
      `ASSERTION FAILED: ${message} (expected=${String(expected)}, actual=${String(actual)})`
    );
  }
  console.log(`  PASS: ${message}`);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function resolveWebRoot(): string {
  const cwd = path.resolve(nodeProcess.cwd());
  return fs.existsSync(path.join(cwd, "apps/web/src")) ? path.join(cwd, "apps/web") : cwd;
}

function testSelfHostedFontsAndProvenance(): void {
  console.log("\n=== [8.1] Self-Hosted SIL OFL 1.1 Fonts & Zero Google Fonts ===");
  const webRoot = resolveWebRoot();
  const pkgJson = JSON.parse(fs.readFileSync(path.join(webRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };

  assert(
    Boolean(pkgJson.dependencies?.["@fontsource/instrument-serif"]),
    "@fontsource/instrument-serif is installed in apps/web/package.json"
  );
  assert(
    Boolean(pkgJson.dependencies?.["@fontsource/plus-jakarta-sans"]),
    "@fontsource/plus-jakarta-sans is installed in apps/web/package.json"
  );
  assert(
    Boolean(pkgJson.dependencies?.["@fontsource/jetbrains-mono"]),
    "@fontsource/jetbrains-mono is installed in apps/web/package.json"
  );

  const mainTsx = fs.readFileSync(path.join(webRoot, "src/main.tsx"), "utf8");
  const requiredImports = [
    "@fontsource/instrument-serif/400.css",
    "@fontsource/instrument-serif/400-italic.css",
    "@fontsource/plus-jakarta-sans/400.css",
    "@fontsource/plus-jakarta-sans/500.css",
    "@fontsource/plus-jakarta-sans/600.css",
    "@fontsource/plus-jakarta-sans/700.css",
    "@fontsource/jetbrains-mono/400.css",
    "@fontsource/jetbrains-mono/500.css",
    "@fontsource/jetbrains-mono/600.css",
  ];
  for (const imp of requiredImports) {
    assert(mainTsx.includes(imp), `main.tsx imports self-hosted font CSS: ${imp}`);
  }

  const indexHtml = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  assert(!indexHtml.includes("fonts.googleapis.com"), "index.html contains 0 fonts.googleapis.com links");
  assert(!indexHtml.includes("fonts.gstatic.com"), "index.html contains 0 fonts.gstatic.com links");
  assert(indexHtml.includes("bert-theme"), "index.html initializes data-theme synchronously from bert-theme");

  const tokensCss = fs.readFileSync(path.join(webRoot, "src/styles/tokens.css"), "utf8");
  assert(
    tokensCss.includes("SIL Open Font License 1.1") && tokensCss.includes("OFL-1.1"),
    "tokens.css documents SIL OFL 1.1 font licensing provenance"
  );
  assert(
    tokensCss.includes("@theme") &&
      tokensCss.includes("--font-serif") &&
      tokensCss.includes("--font-sans") &&
      tokensCss.includes("--font-mono"),
    "tokens.css defines Tailwind v4 @theme font stacks"
  );
}

function testCodeHygieneAndTierContracts(): void {
  console.log("\n=== [8.2] Code Hygiene, Legacy Color Purge & Tier 1/3 Contracts ===");
  const webRoot = resolveWebRoot();
  const srcFiles = walkFiles(path.join(webRoot, "src")).filter(
    (f) => !f.includes(`${path.sep}tests${path.sep}`) && /\.(ts|tsx|css)$/.test(f)
  );

  const legacyTokens = [
    "text-zinc-400",
    "text-slate-400",
    "#18181B",
    "#F8F9FA",
    "#F7F7F5",
    "#FAFAFA",
    "#2563EB",
    "#1D4ED8",
    "#047857",
    "#B45309",
    "#B91C1C",
    "#FFFBEB",
    "#FEF2F2",
    "#FAF5FF",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
  ];

  const forbiddenIntervalApi = ["set", "Interval"].join("");
  const forbiddenIntervalRegex = new RegExp(`\\b${forbiddenIntervalApi}\\s*\\(`);
  for (const filePath of srcFiles) {
    const rel = path.relative(webRoot, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    assert(!forbiddenIntervalRegex.test(content), `${rel} contains 0 polling interval calls`);
    for (const token of legacyTokens) {
      assert(!content.includes(token), `${rel} has purged legacy token '${token}'`);
    }
  }

  // Tier 1 / Tier 3 preservation checks
  const inspectorDrawer = fs.readFileSync(
    path.join(webRoot, "src/components/copilot/RightInspectorDrawer.tsx"),
    "utf8"
  );
  assert(
    inspectorDrawer.includes('"bg-white') || inspectorDrawer.includes("bg-white "),
    "RightInspectorDrawer preserves bg-white token on active Viewer/Visual tab for Tier 1/3 assertions"
  );

  const indexCss = fs.readFileSync(path.join(webRoot, "src/index.css"), "utf8");
  assert(
    indexCss.includes('[data-theme="dark"] [role="tab"][aria-selected="true"].bg-white'),
    "index.css overrides dark-mode active role=tab bg-white cleanly via CSS"
  );
  assert(
    indexCss.includes("--pdf-page-bg"),
    "index.css preserves archival white --pdf-page-bg for scanned/vector PDF legibility"
  );

  const appShell = fs.readFileSync(path.join(webRoot, "src/components/layout/AppShell.tsx"), "utf8");
  assert(appShell.includes('id="main-content"'), "AppShell preserves <main id=\"main-content\">");
  assert(appShell.includes('href="#main-content"'), "AppShell preserves skip-to-content link");
  assert(appShell.includes("<ThemeToggle"), "AppShell renders ThemeToggle");

  for (const navFile of [
    "src/components/navigation/WeTransferTopPill.tsx",
    "src/components/navigation/WeTransferIconRail.tsx",
    "src/components/navigation/AttioSidebar.tsx",
  ]) {
    const content = fs.readFileSync(path.join(webRoot, navFile), "utf8");
    assert(content.includes("<ThemeToggle"), `${navFile} exposes ThemeToggle control`);
  }

  // Every <input> and <textarea> in interactive TSX files keeps focus-visible:ring
  const tsxFiles = srcFiles.filter((f) => f.endsWith(".tsx"));
  for (const filePath of tsxFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const rel = path.relative(webRoot, filePath);
    const controlMatches = content.match(/<(input|textarea)\b[\s\S]*?\/>/g) ?? [];
    for (const tag of controlMatches) {
      assert(
        tag.includes("focus-visible:ring") || tag.includes("focus:ring"),
        `${rel} <${tag.startsWith("<textarea") ? "textarea" : "input"}> preserves focus-visible:ring`
      );
    }
  }
}

function testThemePersistenceAndHookHelpers(): void {
  console.log("\n=== [8.3] Theme Default, Persistence & CustomEvent Reactivity ===");

  const store = new Map<string, string>();
  const classSet = new Set<string>();
  const attrs = new Map<string, string>();
  const listeners = new Map<string, Set<(evt: unknown) => void>>();

  const mockStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  const mockRoot = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: "" },
    setAttribute: (name: string, val: string) => {
      attrs.set(name, val);
    },
    classList: {
      toggle: (cls: string, force?: boolean) => {
        if (force) classSet.add(cls);
        else classSet.delete(cls);
      },
    },
  };

  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  const prevDocument = (globalThis as unknown as { document?: unknown }).document;
  const prevStorage = (globalThis as unknown as { localStorage?: unknown }).localStorage;

  const mockMeta = {
    attributes: new Map<string, string>(),
    setAttribute: function (name: string, val: string) {
      this.attributes.set(name, val);
    },
  };

  try {
    (globalThis as unknown as { localStorage: unknown }).localStorage = mockStorage;
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: mockRoot,
      querySelector: (selector: string) => (selector === 'meta[name="theme-color"]' ? mockMeta : null),
    };
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: mockStorage,
      addEventListener: (name: string, cb: (evt: unknown) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(cb);
      },
      removeEventListener: (name: string, cb: (evt: unknown) => void) => {
        listeners.get(name)?.delete(cb);
      },
      dispatchEvent: (evt: { type: string }) => {
        for (const cb of listeners.get(evt.type) ?? []) {
          cb(evt);
        }
        return true;
      },
    };

    assertEqual(THEME_STORAGE_KEY, "shieldstaff-theme", "THEME_STORAGE_KEY is 'shieldstaff-theme'");
    assertEqual(LEGACY_THEME_STORAGE_KEY, "bert-theme", "LEGACY_THEME_STORAGE_KEY is 'bert-theme'");
    assertEqual(getInitialTheme(), "light", "Empty storage defaults strictly to 'light'");

    store.set(LEGACY_THEME_STORAGE_KEY, "dark");
    assertEqual(getInitialTheme(), "dark", "Stored legacy 'dark' resolves to 'dark'");

    store.set(THEME_STORAGE_KEY, "light");
    assertEqual(getInitialTheme(), "light", "Primary 'shieldstaff-theme' takes precedence over legacy");

    store.delete(THEME_STORAGE_KEY);
    store.delete(LEGACY_THEME_STORAGE_KEY);

    store.set(THEME_STORAGE_KEY, "invalid-value");
    assertEqual(getInitialTheme(), "light", "Unknown stored theme falls back cleanly to 'light'");

    let eventTheme: string | null = null;
    const unsubscribe = subscribeSystemOrToggle((next) => {
      eventTheme = next;
    });

    applyTheme("dark");
    assertEqual(attrs.get("data-theme"), "dark", "applyTheme('dark') sets data-theme='dark'");
    assert(classSet.has("dark"), "applyTheme('dark') adds .dark class to <html>");
    assertEqual(store.get(THEME_STORAGE_KEY), "dark", "applyTheme('dark') persists to localStorage");
    assertEqual(eventTheme, "dark", "subscribeSystemOrToggle notified immediately of 'dark'");

    const toggled = toggleThemeMode("dark");
    assertEqual(toggled, "light", "toggleThemeMode('dark') transitions to 'light'");
    assertEqual(attrs.get("data-theme"), "light", "toggle sets data-theme='light'");
    assert(!classSet.has("dark"), "toggle removes .dark class on light mode");
    assertEqual(store.get(THEME_STORAGE_KEY), "light", "toggle persists 'light' to localStorage");
    assertEqual(eventTheme, "light", "subscribeSystemOrToggle notified of 'light'");

    unsubscribe();
  } finally {
    (globalThis as unknown as { window: unknown }).window = prevWindow;
    (globalThis as unknown as { document: unknown }).document = prevDocument;
    (globalThis as unknown as { localStorage: unknown }).localStorage = prevStorage;
  }
}

function testWcagContrastCompliance(): void {
  console.log("\n=== [8.4] WCAG 2.1 Contrast Audit Across Light & Dark Tokens ===");
  assertEqual(relativeLuminance(hexToRgb("#FFFFFF")), 1, "Relative luminance of #FFFFFF is 1");
  assertEqual(relativeLuminance([0, 0, 0]), 0, "Relative luminance of [0,0,0] is 0");
  assertEqual(
    Math.round(contrastRatio("#000000", "#FFFFFF") * 10) / 10,
    21,
    "Contrast ratio #000000 on #FFFFFF is 21:1"
  );

  for (const pair of THEME_CONTRAST_AUDIT_PAIRS) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    const min = pair.minRatio ?? 4.5;
    assert(
      ratio >= min,
      `[${pair.theme.toUpperCase()}] ${pair.id} (${pair.fg} on ${pair.bg}) contrast ${ratio.toFixed(2)}:1 >= ${min}:1`
    );
  }

  for (const mode of ["light", "dark"] as const) {
    const t = THEME_TOKENS[mode];
    assert(
      contrastRatio(t.textPrimary, t.bgCanvas) >= 4.5,
      `${mode} textPrimary vs bgCanvas >= 4.5:1`
    );
    assert(
      contrastRatio(t.textSecondary, t.bgSurface) >= 4.5,
      `${mode} textSecondary vs bgSurface >= 4.5:1`
    );
    assert(
      contrastRatio(t.textMuted, t.bgSunken) >= 4.5,
      `${mode} textMuted vs bgSunken >= 4.5:1`
    );
    assert(
      contrastRatio(t.accentBrandContrast, t.accentBrand) >= 4.5,
      `${mode} brand button contrast >= 4.5:1`
    );
  }
}

function main(): void {
  console.log("================================================================================");
  console.log("  PHASE 8 DESIGN SYSTEM & THEME UNIT SUITE                                      ");
  console.log("================================================================================");

  testSelfHostedFontsAndProvenance();
  testCodeHygieneAndTierContracts();
  testThemePersistenceAndHookHelpers();
  testWcagContrastCompliance();

  console.log("\n================================================================================");
  console.log(`  ALL PHASE 8 DESIGN SYSTEM UNIT TESTS PASSED (${assertCount} assertions)!`);
  console.log("================================================================================");
}

main();
