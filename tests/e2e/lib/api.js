const DEFAULT_BASE_URL = "http://localhost:8000";
const DEFAULT_WS_URL = "ws://localhost:8000";

export class BertApiClient {
  constructor(baseUrl = DEFAULT_BASE_URL, wsUrl = DEFAULT_WS_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.wsUrl = wsUrl.replace(/\/$/, "");
  }

  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const status = res.status;
    const ok = res.ok;
    let data = null;
    let text = null;

    try {
      text = await res.text();
      data = JSON.parse(text);
    } catch (e) {
      // Non-JSON response
    }

    return { status, ok, data, text, headers: res.headers };
  }

  async health() {
    return this._request("/health");
  }

  async seedDemo() {
    return this._request("/api/v1/demo/seed", { method: "POST" });
  }

  async getDocuments() {
    return this._request("/api/v1/documents");
  }

  async getDocumentNodes(documentId) {
    return this._request(`/api/v1/documents/${documentId}/nodes`);
  }

  async getDocumentFile(documentId) {
    return this._request(`/api/v1/documents/${documentId}/file`);
  }

  async getWorkItems() {
    return this._request("/api/v1/work-items");
  }

  async getWorkItem(id) {
    return this._request(`/api/v1/work-items/${id}`);
  }

  async getEscalations(params = {}) {
    const query = new URLSearchParams();
    if (params.includeResolved) query.set("include_resolved", "true");
    if (params.documentId) query.set("document_id", params.documentId);
    const qs = query.toString();
    return this._request(`/api/v1/escalations${qs ? `?${qs}` : ""}`);
  }

  async resolveEscalation(workItemId, body) {
    return this._request(`/api/v1/escalations/${workItemId}/resolve`, {
      method: "POST",
      body,
    });
  }

  async batchResolve(body) {
    return this._request("/api/v1/escalations/batch-resolve", {
      method: "POST",
      body,
    });
  }

  async resetCorpus() {
    return this._request("/api/v1/corpus/reset", { method: "POST" });
  }

  async uploadTextDocument(filename, content) {
    const boundary = `----BertE2E${Date.now()}${Math.random().toString(16).slice(2)}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--\r\n`;
    const res = await fetch(`${this.baseUrl}/api/v1/documents/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON */
    }
    return { status: res.status, ok: res.ok, data, text };
  }

  async waitForJob(jobId, maxWaitMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const st = await this.getJob(jobId);
      if (st.data?.status === "COMPLETED" || st.data?.status === "FAILED" || st.data?.status === "CANCELLED") {
        return st;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Job ${jobId} did not finish within ${maxWaitMs}ms`);
  }

  async getAuditLog() {
    return this._request("/api/v1/audit-log");
  }

  async chatCopilot(prompt, context = {}) {
    return this._request("/api/v1/copilot/chat", {
      method: "POST",
      body: { prompt, context },
    });
  }

  async startJob(payload = {}) {
    return this._request("/api/v1/jobs/start", {
      method: "POST",
      body: payload,
    });
  }

  async getJob(jobId) {
    return this._request(`/api/v1/jobs/${jobId}`);
  }

  async search(query) {
    return this._request(`/api/v1/search?q=${encodeURIComponent(query)}`);
  }

  connectWebSocket(path = "/ws") {
    const fullWsUrl = `${this.wsUrl}${path}`;
    const ws = new WebSocket(fullWsUrl);
    const messages = [];

    const promise = new Promise((resolve, reject) => {
      ws.onopen = () => resolve(wsHelper);
      ws.onerror = (err) => reject(err);
    });

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        messages.push(parsed);
      } catch (e) {
        messages.push(event.data);
      }
    };

    const wsHelper = {
      ws,
      messages,
      async waitForMessage(predicate, timeoutMs = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const found = messages.find(predicate);
          if (found) return found;
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error(`Timeout waiting for WebSocket message after ${timeoutMs}ms`);
      },
      send(data) {
        const msg = typeof data === "string" ? data : JSON.stringify(data);
        ws.send(msg);
      },
      close() {
        ws.close();
      },
    };

    return promise;
  }
}
