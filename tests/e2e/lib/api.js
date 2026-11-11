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

  async getEscalations() {
    return this._request("/api/v1/escalations");
  }

  async resolveEscalation(workItemId, body) {
    return this._request(`/api/v1/escalations/${workItemId}/resolve`, {
      method: "POST",
      body,
    });
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
