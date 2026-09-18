import React, { useState } from "react";
import KbPanel from "../components/KbPanel.jsx";
import ImportPanel from "../components/ImportPanel.jsx";
import ConnectorsPanel from "../components/ConnectorsPanel.jsx";
import SettingsPanel from "../components/SettingsPanel.jsx";
import MonitoringPanel from "../components/MonitoringPanel.jsx";
import TelephonyPanel from "../components/TelephonyPanel.jsx";
import EscalationsPanel from "../components/EscalationsPanel.jsx";
import ConsolidationPanel from "../components/ConsolidationPanel.jsx";
import { api } from "../api.js";

// Двухуровневое меню: раздел -> подвкладки внутри раздела. Раньше было
// 8 плоских вкладок в одну строку — с ростом числа панелей это перестало
// масштабироваться, сгруппировали по смыслу.
const SECTIONS = [
  {
    id: "kb",
    label: "📚 База знаний",
    subTabs: [
      { id: "view", label: "Просмотр", Component: KbPanel },
      { id: "import", label: "Импорт", Component: ImportPanel },
      { id: "gaps", label: "Пробелы в знаниях", Component: EscalationsPanel },
      { id: "consolidation", label: "Консолидация", Component: ConsolidationPanel },
    ],
  },
  {
    id: "telephony",
    label: "📞 Телефония",
    subTabs: [{ id: "main", label: "Телефония", Component: TelephonyPanel }],
  },
  {
    id: "system",
    label: "⚙️ Система",
    subTabs: [
      { id: "settings", label: "Настройки", Component: SettingsPanel },
      { id: "monitoring", label: "Мониторинг", Component: MonitoringPanel },
      { id: "connectors", label: "Коннекторы (сторонние API)", Component: ConnectorsPanel },
    ],
  },
];

export default function AdminDashboard({ username, onLogout }) {
  const [activeSectionId, setActiveSectionId] = useState(SECTIONS[0].id);
  const [activeSubTabId, setActiveSubTabId] = useState(SECTIONS[0].subTabs[0].id);
  const [status, setStatus] = useState(null); // { message, isError }

  const activeSection = SECTIONS.find((s) => s.id === activeSectionId) || SECTIONS[0];
  const activeSubTab =
    activeSection.subTabs.find((t) => t.id === activeSubTabId) || activeSection.subTabs[0];
  const ActiveComponent = activeSubTab.Component;

  function showStatus(message, isError) {
    setStatus({ message, isError });
    setTimeout(() => setStatus(null), 4000);
  }

  function handleSelectSection(section) {
    setActiveSectionId(section.id);
    setActiveSubTabId(section.subTabs[0].id); // при смене раздела — всегда на первую подвкладку
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

      <div className="tabs tabs-section">
        {SECTIONS.map((s) => (
          <div
            key={s.id}
            className={"tab" + (activeSectionId === s.id ? " active" : "")}
            onClick={() => handleSelectSection(s)}
          >
            {s.label}
          </div>
        ))}
      </div>

      {/* Подвкладки показываем только если их больше одной — для "Телефонии"
          с единственной панелью показывать строку из одного пункта было бы
          лишним визуальным шумом. */}
      {activeSection.subTabs.length > 1 && (
        <div className="tabs tabs-subtab">
          {activeSection.subTabs.map((t) => (
            <div
              key={t.id}
              className={"tab tab-sub" + (activeSubTabId === t.id ? " active" : "")}
              onClick={() => setActiveSubTabId(t.id)}
            >
              {t.label}
            </div>
          ))}
        </div>
      )}

      <ActiveComponent onStatus={showStatus} />
    </div>
  );
}
