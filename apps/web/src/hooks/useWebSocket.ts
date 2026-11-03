import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";
import { useBertStore } from "../store/useBertStore";

export type WebSocketStatus = "connecting" | "connected" | "reconnecting" | "offline";

export function useWebSocket(): WebSocketStatus {
  const appendEvent = useBertStore((state) => state.appendEvent);
  const [status, setStatus] = useState<WebSocketStatus>("connecting");
  useEffect(() => {
    let disposed = false; let attempt = 0; let retryTimer: number | undefined; let socket: WebSocket | undefined;
    const connect = () => {
      if (disposed) return;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws`);
      socket.onopen = () => { attempt = 0; setStatus("connected"); };
      socket.onmessage = (message) => { try { const event = JSON.parse(message.data) as import("../types/bert").PipelineEvent; if (event.type) appendEvent(event); } catch { /* ignore malformed telemetry */ } };
      socket.onclose = () => { if (!disposed) { setStatus("reconnecting"); retryTimer = window.setTimeout(connect, Math.min(5000, 300 * 2 ** attempt)); attempt += 1; } };
      socket.onerror = () => setStatus("offline");
    };
    connect();
    return () => { disposed = true; if (retryTimer) window.clearTimeout(retryTimer); socket?.close(); };
  }, [appendEvent]);
  return status;
}
