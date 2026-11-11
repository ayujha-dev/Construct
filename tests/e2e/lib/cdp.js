import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_PORT = 9222;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.callbacks = new Map();
    this.listeners = new Map();
  }

  async init(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CDP WebSocket connection timed out after ${timeoutMs}ms: ${this.wsUrl}`));
      }, timeoutMs);

      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        clearTimeout(timer);
        return reject(err);
      }

      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve(this);
      };

      this.ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve, reject } = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              resolve(msg.result);
            }
          } else if (msg.method) {
            const handlers = this.listeners.get(msg.method) || [];
            for (const h of handlers) {
              try {
                h(msg.params);
              } catch (e) {
                console.error(`Error in CDP event listener for ${msg.method}:`, e);
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse CDP message:", e);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error(`Cannot send CDP command '${method}': WebSocket not OPEN`));
      }
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, []);
    }
    this.listeners.get(method).push(handler);
  }

  off(method, handler) {
    const handlers = this.listeners.get(method);
    if (!handlers) return;
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore close errors
      }
      this.ws = null;
    }
    this.callbacks.clear();
    this.listeners.clear();
  }
}

export class PageSession {
  constructor(client, targetId, browserClient) {
    this.client = client;
    this.targetId = targetId;
    this.browserClient = browserClient;
  }

  async send(method, params = {}) {
    return this.client.send(method, params);
  }

  async goto(url, { timeout = 10000, sleepAfter = 1200 } = {}) {
    await this.client.send("Page.navigate", { url });
    await sleep(sleepAfter);
  }

  async evaluate(fnOrScript, ...args) {
    let expression;
    if (typeof fnOrScript === "function") {
      expression = `(${fnOrScript.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;
    } else {
      expression = fnOrScript;
    }

    const res = await this.client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Evaluation failed: ${desc}`);
    }

    return res.result?.value;
  }

  async querySelector(selector) {
    return this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className,
        textContent: el.textContent,
        innerText: el.innerText,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left },
        style: {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          color: style.color,
          backgroundColor: style.backgroundColor,
          userSelect: style.userSelect || style.webkitUserSelect,
          outline: style.outline,
        },
        attributes: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
      };
    }, selector);
  }

  async querySelectorAll(selector) {
    return this.evaluate((sel) => {
      const els = Array.from(document.querySelectorAll(sel));
      return els.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          className: el.className,
          textContent: el.textContent?.trim(),
          innerText: el.innerText?.trim(),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left },
          attributes: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
        };
      });
    }, selector);
  }

  async waitForSelector(selector, { timeout = 5000, interval = 100 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const exists = await this.evaluate((sel) => Boolean(document.querySelector(sel)), selector);
      if (exists) return true;
      await sleep(interval);
    }
    throw new Error(`Timeout waiting for selector '${selector}' after ${timeout}ms`);
  }

  async click(selector) {
    const clicked = await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.scrollIntoView({ block: "center", inline: "center" });
      el.click();
      return true;
    }, selector);
    if (!clicked) {
      throw new Error(`Element not found for click: '${selector}'`);
    }
    await sleep(200);
  }

  async pressKey(key, code) {
    // Input.dispatchKeyEvent for keyDown and keyUp
    await this.client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: code || key,
      windowsVirtualKeyCode: key === "Enter" ? 13 : key === " " ? 32 : key === "Tab" ? 9 : key === "Escape" ? 27 : 0,
    });
    await sleep(50);
    await this.client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: code || key,
    });
    await sleep(150);
  }

  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false }) {
    await this.client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
    await sleep(200);
  }

  async resetViewport() {
    await this.client.send("Emulation.clearDeviceMetricsOverride");
    await sleep(100);
  }

  async captureScreenshot() {
    const res = await this.client.send("Page.captureScreenshot", { format: "png" });
    return res.data;
  }

  async close() {
    this.client.close();
    if (this.browserClient && this.targetId) {
      try {
        await this.browserClient.send("Target.closeTarget", { targetId: this.targetId });
      } catch (e) {
        // target might already be closed
      }
    }
  }
}

export class HeadlessBrowser {
  constructor(options = {}) {
    this.chromePath = options.chromePath || process.env.CHROME_BIN || DEFAULT_CHROME_PATH;
    this.port = options.port || (process.env.CHROME_PORT ? parseInt(process.env.CHROME_PORT, 10) : DEFAULT_PORT);
    this.userDataDir = null;
    this.chromeProcess = null;
    this.browserClient = null;
    this.pages = [];
  }

  async start() {
    this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bert-e2e-chrome-"));

    this.chromeProcess = spawn(
      this.chromePath,
      [
        "--headless=new",
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.userDataDir}`,
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-features=Translate,OptimizationHints,MediaRouter",
        "--window-size=1280,800",
        "about:blank",
      ],
      { stdio: "ignore" }
    );

    // Poll for debugger URL
    let wsUrl = null;
    const maxRetries = 25;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${this.port}/json/version`);
        if (res.ok) {
          const data = await res.json();
          wsUrl = data.webSocketDebuggerUrl;
          break;
        }
      } catch (e) {
        // retry
      }
      await sleep(200);
    }

    if (!wsUrl) {
      await this.stop();
      throw new Error(`Failed to connect to Chrome on port ${this.port} after ${maxRetries * 200}ms`);
    }

    this.browserClient = new CDPClient(wsUrl);
    await this.browserClient.init();
  }

  async newPage() {
    if (!this.browserClient) {
      throw new Error("Browser client not initialized. Call start() first.");
    }

    const { targetId } = await this.browserClient.send("Target.createTarget", { url: "about:blank" });
    const targetWsUrl = `ws://127.0.0.1:${this.port}/devtools/page/${targetId}`;
    const pageClient = new CDPClient(targetWsUrl);
    await pageClient.init();

    await pageClient.send("Page.enable");
    await pageClient.send("DOM.enable");
    await pageClient.send("Runtime.enable");
    await pageClient.send("Accessibility.enable");

    const session = new PageSession(pageClient, targetId, this.browserClient);
    this.pages.push(session);
    return session;
  }

  async stop() {
    // 1. Close all active page sessions
    for (const page of this.pages) {
      try {
        await page.close();
      } catch (e) {
        // ignore
      }
    }
    this.pages = [];

    // 2. Close browser CDP client
    if (this.browserClient) {
      try {
        this.browserClient.close();
      } catch (e) {
        // ignore
      }
      this.browserClient = null;
    }

    // 3. Gracefully kill Chrome process and wait for exit
    if (this.chromeProcess && !this.chromeProcess.killed) {
      const proc = this.chromeProcess;
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };

        proc.once("exit", finish);
        proc.kill("SIGTERM");

        setTimeout(() => {
          if (!done) {
            try {
              proc.kill("SIGKILL");
            } catch (e) {}
            finish();
          }
        }, 3000);
      });
      this.chromeProcess = null;
    }

    // 4. Remove isolated user data dir once process has cleanly exited
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch (e) {
        // Fallback sleep then retry once if macOS filesystem lock is slightly delayed
        await sleep(300);
        try {
          fs.rmSync(this.userDataDir, { recursive: true, force: true });
        } catch (err) {
          console.warn(`Warning: Could not remove temporary dir ${this.userDataDir}:`, err.message);
        }
      }
      this.userDataDir = null;
    }
  }
}
