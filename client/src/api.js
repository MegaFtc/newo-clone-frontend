const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = (data && data.detail) || `Ошибка ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // Публичное
  chat: (message, sessionId) =>
    request("/chat", { method: "POST", body: JSON.stringify({ message, session_id: sessionId }) }),
  clearChatSession: (sessionId) => request(`/chat/session/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
  health: () => request("/health"),

  // Админка
  login: (username, password) =>
    request("/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/admin/logout", { method: "POST" }),
  me: () => request("/admin/me"),

  listKb: (language) => request("/admin/kb" + (language ? `?language=${encodeURIComponent(language)}` : "")),
  createKb: (entry) => request("/admin/kb", { method: "POST", body: JSON.stringify(entry) }),
  updateKb: (id, text) => request(`/admin/kb/${id}`, { method: "PUT", body: JSON.stringify({ text }) }),
  deleteKb: (id) => request(`/admin/kb/${id}`, { method: "DELETE" }),
  languages: () => request("/admin/languages"),

  listConnectors: () => request("/admin/connectors"),
  createConnector: (c) => request("/admin/connectors", { method: "POST", body: JSON.stringify(c) }),
  updateConnector: (id, c) => request(`/admin/connectors/${id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteConnector: (id) => request(`/admin/connectors/${id}`, { method: "DELETE" }),

  getSettings: () => request("/admin/settings"),
  setSetting: (key, value) =>
    request(`/admin/settings/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) }),
};
