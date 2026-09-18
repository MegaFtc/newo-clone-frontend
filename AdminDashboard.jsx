import React, { useState } from "react";
import KbPanel from "../components/KbPanel.jsx";
import ImportPanel from "../components/ImportPanel.jsx";
import ConnectorsPanel from "../components/ConnectorsPanel.jsx";
import SettingsPanel from "../components/SettingsPanel.jsx";
import MonitoringPanel from "../components/MonitoringPanel.jsx";
import { api } from "../api.js";

const TABS = [
  { id: "kb", label: "База знаний" },
  { id: "import", label: "Импорт знаний" },
  { id: "connectors", label: "Коннекторы (сторонние API)" },
  { id: "settings", label: "Настройки" },
  { id: "monitoring", label: "Мониторинг" },
];

export default function AdminDashboard({ username, onLogout }) {
  const [activeTab, setActiveTab] = useState("kb");
  const [status, setStatus] = useState(null); // { message, isError }

  function showStatus(message, isError) {
    setStatus({ message, isError });
    setTimeout(() => setStatus(null), 4000);
  }

  async function handleLogout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>Newo-clone — Админ-панель</h1>
          <div className="subtitle">
            Вошли как <strong>{username}</strong>. Изменения применяются сразу, без перезапуска сервиса.
          </div>
        </div>
        <button className="secondary" onClick={handleLogout}>
          Выйти
        </button>
      </div>

      {status && (
        <div className={"alert " + (status.isError ? "alert-error" : "alert-ok")}>{status.message}</div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={"tab" + (activeTab === t.id ? " active" : "")}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {activeTab === "kb" && <KbPanel onStatus={showStatus} />}
      {activeTab === "import" && <ImportPanel onStatus={showStatus} />}
      {activeTab === "connectors" && <ConnectorsPanel onStatus={showStatus} />}
      {activeTab === "settings" && <SettingsPanel onStatus={showStatus} />}
      {activeTab === "monitoring" && <MonitoringPanel onStatus={showStatus} />}
    </div>
  );
}
