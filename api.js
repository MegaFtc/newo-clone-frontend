const BASE = "/api";

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = isFormData
    ? { ...(options.headers || {}) } // не выставляем Content-Type сами — fetch сам проставит верный boundary для multipart
    : { "Content-Type": "application/json", ...(options.headers || {}) };

  const res = await fetch(BASE + path, {
    credentials: "include",
    headers,
    ...options,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = formatErrorDetail(data && data.detail, res.status);
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * FastAPI отдаёт detail по-разному в зависимости от типа ошибки:
 * - обычная HTTPException -> просто строка
 * - ошибка валидации Pydantic (422) -> СПИСОК объектов {loc, msg, type}
 * Без этой нормализации второй случай превращался бы в "[object Object]"
 * при простом new Error(detail) — JS молча вызывает String() на объекте.
 */
function formatErrorDetail(detail, status) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const field = Array.isArray(item.loc) ? item.loc.at(-1) : "";
          return field ? `${field}: ${item.msg}` : item.msg;
        }
        return typeof item === "string" ? item : JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return `Ошибка ${status}`;
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

  getMonitoring: () => request("/admin/monitoring"),
  testLLM: () => request("/admin/monitoring/test-llm", { method: "POST" }),
  getMonitoringSelf: () => request("/monitoring-self"),

  extractFromFile: (file, language) => {
    const form = new FormData();
    form.append("file", file);
    form.append("language", language);
    return request("/admin/import/extract-file", { method: "POST", body: form });
  },
  extractFromUrl: (url, language) =>
    request("/admin/import/extract-url", { method: "POST", body: JSON.stringify({ url, language }) }),
  extractFromText: (text, language) =>
    request("/admin/import/extract-text", { method: "POST", body: JSON.stringify({ text, language }) }),
  commitImport: (language, facts, entryIdPrefix) =>
    request("/admin/import/commit", {
      method: "POST",
      body: JSON.stringify({ language, facts, entry_id_prefix: entryIdPrefix }),
    }),

  listOperators: () => request("/admin/telephony/operators"),
  createOperator: (extension_number, label) =>
    request("/admin/telephony/operators", { method: "POST", body: JSON.stringify({ extension_number, label }) }),
  toggleOperator: (id, enabled) =>
    request(`/admin/telephony/operators/${id}/toggle`, { method: "PUT", body: JSON.stringify({ enabled }) }),
  deleteOperator: (id) => request(`/admin/telephony/operators/${id}`, { method: "DELETE" }),
  applyOperators: () => request("/admin/telephony/operators/apply", { method: "POST" }),
  listActiveCalls: () => request("/admin/telephony/calls"),
  hangupCall: (channelId) => request(`/admin/telephony/calls/${encodeURIComponent(channelId)}/hangup`, { method: "POST" }),
  triggerTestCall: () => request("/admin/telephony/test-call", { method: "POST" }),

  listEscalations: (resolved) =>
    request(`/admin/escalations${resolved === undefined ? "" : `?resolved=${resolved}`}`),
  resolveEscalation: (id, resolved) =>
    request(`/admin/escalations/${id}/resolve`, { method: "PUT", body: JSON.stringify({ resolved }) }),
};
