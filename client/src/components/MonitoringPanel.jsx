import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function StatusDot({ ok }) {
  return <span className={"status-dot " + (ok ? "status-ok" : "status-bad")} />;
}

function MetricRow({ label, value }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="monitor-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export default function MonitoringPanel({ onStatus }) {
  const [backend, setBackend] = useState(null);
  const [self, setSelf] = useState(null);
  const [error, setError] = useState(null);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmResult, setLlmResult] = useState(null);

  async function reload() {
    try {
      const [b, s] = await Promise.all([api.getMonitoring(), api.getMonitoringSelf()]);
      setBackend(b);
      setSelf(s);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 15000); // автообновление раз в 15 секунд
    return () => clearInterval(interval);
  }, []);

  async function handleTestLLM() {
    setLlmTesting(true);
    setLlmResult(null);
    try {
      const res = await api.testLLM();
      setLlmResult(res);
    } catch (err) {
      setLlmResult({ success: false, error: err.message });
    } finally {
      setLlmTesting(false);
    }
  }

  if (error) {
    return <div className="alert alert-error">Не удалось загрузить мониторинг: {error}</div>;
  }
  if (!backend || !self) {
    return <div className="page-loading">Загрузка метрик…</div>;
  }

  return (
    <div className="monitoring-grid">
      <Card title="Бэкенд (Python/FastAPI)">
        <MetricRow label="Аптайм" value={`${Math.floor(backend.backend.uptime_seconds / 60)} мин`} />
        <MetricRow label="Память процесса" value={`${backend.backend.memory_mb} МБ`} />
        <MetricRow label="CPU процесса" value={`${backend.backend.cpu_percent}%`} />
        <MetricRow label="PID" value={backend.backend.pid} />
      </Card>

      <Card title="Сервер бэкенда (физический)">
        <MetricRow label="CPU" value={`${backend.system.cpu_percent}%`} />
        <MetricRow
          label="Память"
          value={`${backend.system.memory_used_gb} / ${backend.system.memory_total_gb} ГБ (${backend.system.memory_percent}%)`}
        />
        <MetricRow
          label="Диск"
          value={`${backend.system.disk_used_gb} / ${backend.system.disk_total_gb} ГБ (${backend.system.disk_percent}%)`}
        />
        {backend.system.disk_percent > 90 && (
          <div className="alert alert-error" style={{ marginTop: 8 }}>
            ⚠️ Диск заполнен более чем на 90%
          </div>
        )}
      </Card>

      <Card title="База знаний / диалоги">
        <MetricRow label="Размер БД" value={`${backend.database.size_mb} МБ`} />
        {Object.entries(backend.database.kb_entries_by_language).map(([lang, count]) => (
          <MetricRow key={lang} label={`Фактов (${lang})`} value={count} />
        ))}
        <MetricRow label="Активных диалогов (1ч)" value={backend.database.active_sessions_last_hour} />
        <MetricRow label="Коннекторов" value={backend.database.connectors_count} />
      </Card>

      <Card title="LLM">
        <MetricRow label="Провайдер" value={backend.llm.provider} />
        <MetricRow
          label="Ключ настроен"
          value={<StatusDot ok={backend.llm.anthropic_key_configured || backend.llm.provider === "local"} />}
        />
        <button onClick={handleTestLLM} disabled={llmTesting} style={{ marginTop: 8 }}>
          {llmTesting ? "Проверяю…" : "Проверить связь (реальный запрос)"}
        </button>
        {llmResult && (
          <div className={"alert " + (llmResult.success ? "alert-ok" : "alert-error")} style={{ marginTop: 8 }}>
            {llmResult.success
              ? `✅ Ответ получен за ${llmResult.latency_ms} мс: "${llmResult.response_preview}"`
              : `❌ Ошибка: ${llmResult.error}`}
          </div>
        )}
      </Card>

      <Card title="Телефония (Asterisk)">
        {backend.telephony.reachable ? (
          <>
            <MetricRow label="ARI подключён" value={<StatusDot ok={backend.telephony.ari_connected} />} />
            <MetricRow label="Активных звонков" value={backend.telephony.active_calls} />
            <MetricRow label="Регистрация SIP (Avaya)" value={backend.telephony.sip_registration_status} />
            <MetricRow label="Аптайм" value={`${Math.floor(backend.telephony.uptime_seconds / 60)} мин`} />
          </>
        ) : (
          <div className="hint">Сервис телефонии недоступен или не развёрнут на этом сервере.</div>
        )}
      </Card>

      <Card title="Фронтенд-сервер (Node)">
        <MetricRow label="Аптайм" value={`${Math.floor(self.node.uptime_seconds / 60)} мин`} />
        <MetricRow label="Память процесса" value={`${self.node.memory_mb} МБ`} />
        <MetricRow label="Node.js версия" value={self.node.node_version} />
        <MetricRow label="Бэкенд достижим" value={<StatusDot ok={self.backend_reachable} />} />
      </Card>

      <Card title="Сервер фронтенда (физический)">
        <MetricRow label="Load average (1/5/15 мин)" value={self.system.load_average.map((n) => n.toFixed(2)).join(" / ")} />
        <MetricRow label="Свободная память" value={`${self.system.free_memory_gb} / ${self.system.total_memory_gb} ГБ`} />
        {self.system.disk && !self.system.disk.error && (
          <MetricRow
            label="Диск"
            value={`${self.system.disk.used_gb} / ${self.system.disk.total_gb} ГБ (${self.system.disk.percent}%)`}
          />
        )}
      </Card>

      <Card title="Каналы связи">
        <MetricRow label="Telegram настроен" value={<StatusDot ok={self.telegram.configured} />} />
        {self.telegram.configured && (
          <>
            <MetricRow label="Последний успешный опрос" value={self.telegram.last_success_at || "ещё не было"} />
            {self.telegram.last_error_at && (
              <MetricRow label="Последняя ошибка" value={`${self.telegram.last_error_at}: ${self.telegram.last_error}`} />
            )}
          </>
        )}
        <MetricRow label="WhatsApp настроен" value={<StatusDot ok={self.whatsapp.configured} />} />
      </Card>
    </div>
  );
}
