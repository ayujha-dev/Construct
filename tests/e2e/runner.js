import fs from "node:fs";
import path from "node:path";
import { HeadlessBrowser } from "./lib/cdp.js";
import { BertApiClient } from "./lib/api.js";
import { tier1Tests } from "./suites/tier1_feature_coverage.js";
import { tier2Tests } from "./suites/tier2_boundary_corner.js";
import { tier3Tests } from "./suites/tier3_cross_feature.js";
import { tier4Tests } from "./suites/tier4_workload_scenarios.js";

const STATE_REPORT_PATH = "/Users/ayu/Desktop/Codes/construct/.agents/teamwork/test_writer_e2e_1/e2e_test_report.json";
const LOCAL_REPORT_PATH = path.resolve("tests/e2e/report.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: null,
    all: false,
    id: null,
    bail: false,
    apiUrl: process.env.SHIELDSTAFF_API_URL || process.env.BERT_API_URL || "http://localhost:8000",
    webUrl: process.env.SHIELDSTAFF_WEB_URL || process.env.BERT_WEB_URL || "http://localhost:5173",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all") {
      options.all = true;
    } else if (arg.startsWith("--tier=")) {
      options.tier = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--tier" && args[i + 1]) {
      options.tier = parseInt(args[++i], 10);
    } else if (arg.startsWith("--id=")) {
      options.id = arg.split("=")[1];
    } else if (arg === "--id" && args[i + 1]) {
      options.id = args[++i];
    } else if (arg === "--bail") {
      options.bail = true;
    }
  }

  if (!options.tier && !options.id) {
    options.all = true;
  }

  return options;
}

async function main() {
  const options = parseArgs();
  console.log("================================================================================");
  console.log("       ShieldStaff Document Intelligence Platform — E2E Test Runner            ");
  console.log("================================================================================");
  console.log(`Backend API:  ${options.apiUrl}`);
  console.log(`Web Frontend: ${options.webUrl}`);
  console.log(`Filter:       ${options.id ? `ID: ${options.id}` : options.tier ? `Tier ${options.tier}` : "All Tiers (1-4)"}`);
  console.log("--------------------------------------------------------------------------------\n");

  const allTests = [...tier1Tests, ...tier2Tests, ...tier3Tests, ...tier4Tests];
  let selectedTests = allTests;

  if (options.id) {
    selectedTests = allTests.filter((t) => t.id === options.id);
  } else if (options.tier) {
    selectedTests = allTests.filter((t) => t.tier === options.tier);
  }

  console.log(`Loaded ${selectedTests.length} test cases for execution.\n`);

  const api = new BertApiClient(options.apiUrl);
  const browser = new HeadlessBrowser();

  const results = {
    timestamp: new Date().toISOString(),
    total: selectedTests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    tests: [],
  };

  const startTime = Date.now();

  try {
    console.log("Starting headless Chrome browser...");
    await browser.start();
    console.log("Creating target page session...\n");
    const page = await browser.newPage();

    for (let i = 0; i < selectedTests.length; i++) {
      const test = selectedTests[i];
      const testStart = Date.now();
      const prefix = `[${i + 1}/${selectedTests.length}] [${test.id}]`;
      process.stdout.write(`${prefix} ${test.name} ... `);

      try {
        await test.run({
          page,
          browser,
          api,
          baseUrl: options.apiUrl,
          webUrl: options.webUrl,
        });

        const testDuration = Date.now() - testStart;
        console.log(`\x1b[32mPASSED\x1b[0m (${testDuration}ms)`);
        results.passed++;
        results.tests.push({
          id: test.id,
          name: test.name,
          tier: test.tier,
          feature: test.feature || null,
          status: "PASSED",
          durationMs: testDuration,
        });
      } catch (err) {
        const testDuration = Date.now() - testStart;
        console.log(`\x1b[31mFAILED\x1b[0m (${testDuration}ms)`);
        console.log(`    \x1b[33mError: ${err.message}\x1b[0m`);

        results.failed++;
        results.tests.push({
          id: test.id,
          name: test.name,
          tier: test.tier,
          feature: test.feature || null,
          status: "FAILED",
          durationMs: testDuration,
          error: err.message,
          stack: err.stack,
        });

        if (options.bail) {
          console.log("\n[BAIL] Terminating on first failure.");
          break;
        }
      }
    }
  } catch (fatalErr) {
    console.error("\nFatal Runner Error:", fatalErr);
  } finally {
    console.log("\nShutting down Chrome browser...");
    await browser.stop();
  }

  results.durationMs = Date.now() - startTime;

  console.log("\n================================================================================");
  console.log("                                Test Summary                                    ");
  console.log("================================================================================");
  console.log(`Total:    ${results.total}`);
  console.log(`\x1b[32mPassed:   ${results.passed}\x1b[0m`);
  console.log(`\x1b[31mFailed:   ${results.failed}\x1b[0m`);
  console.log(`Duration: ${(results.durationMs / 1000).toFixed(2)}s`);
  console.log("================================================================================\n");

  // Save report to both destinations
  const reportJson = JSON.stringify(results, null, 2);
  try {
    fs.mkdirSync(path.dirname(STATE_REPORT_PATH), { recursive: true });
    fs.writeFileSync(STATE_REPORT_PATH, reportJson);
    console.log(`Saved report to: ${STATE_REPORT_PATH}`);
  } catch (e) {
    console.warn("Could not save to state report path:", e.message);
  }

  try {
    fs.mkdirSync(path.dirname(LOCAL_REPORT_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_REPORT_PATH, reportJson);
    console.log(`Saved report to: ${LOCAL_REPORT_PATH}`);
  } catch (e) {
    console.warn("Could not save to local report path:", e.message);
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
