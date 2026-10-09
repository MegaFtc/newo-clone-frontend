import React, { useEffect, useState } from "react";
import KbPanel from "../components/KbPanel.jsx";
import ImportPanel from "../components/ImportPanel.jsx";
import ConnectorsPanel from "../components/ConnectorsPanel.jsx";
import SettingsPanel from "../components/SettingsPanel.jsx";
import MonitoringPanel, { describeTelegramSilence } from "../components/MonitoringPanel.jsx";
import TelephonyPanel from "../components/TelephonyPanel.jsx";
import EscalationsPanel from "../components/EscalationsPanel.jsx";
import ConsolidationPanel from "../components/ConsolidationPanel.jsx";
import VoicePanel from "../components/VoicePanel.jsx";
import UsersPanel from "../components/UsersPanel.jsx";
import AuditPanel from "../components/AuditPanel.jsx";
import ProfilePanel from "../components/ProfilePanel.jsx";
import PronunciationsPanel from "../components/PronunciationsPanel.jsx";
import OperatorChatsPlaceholder from "../components/OperatorChatsPlaceholder.jsx";
import { api } from "../api.js";

// Двухуровневое меню: раздел -> подвкладки внутри раздела. Раздел и подвкладка
// показываются только ролям из `roles` (если не задано — всем сотрудникам).
// Это удобство, а не защита: права проверяет бэкенд, и прямой запрос к API без
// нужной роли всё равно получит 403.
const ALL_ROLES = ["admin", "moderator", "operator"];
const KB_ROLES = ["admin", "moderator"];

const SECTIONS = [
  {
    id: "chats",
    label: "💬 Чаты",
    roles: ALL_ROLES,
    subTabs: [{ id: "queue", label: "Чаты с клиентами", Component: OperatorChatsPlaceholder }],
  },
  {
    id: "kb",
    label: "📚 База знаний",
    roles: KB_ROLES,
    subTabs: [
      { id: "view", label: "Просмотр", Component: KbPanel },
      { id: "import", label: "Импорт", Component: ImportPanel },
      { id: "gaps", label: "Пробелы в знаниях", Component: EscalationsPanel },
      { id: "consolidation", label: "Консолидация", Component: ConsolidationPanel },
      { id: "pronunciations", label: "Словарь произношений", Component: PronunciationsPanel },
    ],
  },
  {
    id: "telephony",
    label: "📞 Телефония",
    roles: ["admin"],
    subTabs: [{ id: "main", label: "Телефония", Component: TelephonyPanel }],
  },
  {
    id: "system",
    label: "⚙️ Система",
    roles: ["admin"],
    subTabs: [
      { id: "settings", label: "Настройки", Component: SettingsPanel },
      { id: "voice", label: "Голос и имя бота", Component: VoicePanel },
      { id: "monitoring", label: "Мониторинг", Component: MonitoringPanel },
      { id: "connectors", label: "Коннекторы (сторонние API)", Component: ConnectorsPanel },
    ],
  },
  {
    id: "staff",
    label: "👥 Сотрудники",
    roles: ["admin"],
    subTabs: [
      { id: "users", label: "Учётные записи", Component: UsersPanel },
      { id: "audit", label: "Журнал действий", Component: AuditPanel },
    ],
  },
  {
    id: "profile",
    label: "👤 Профиль",
    roles: ALL_ROLES,
    subTabs: [{ id: "me", label: "Мой профиль", Component: ProfilePanel }],
  },
];

export default function AdminDashboard({ profile, onLogout }) {
  const role = profile.role;
  const visibleSections = SECTIONS.filter((s) => !s.roles || s.roles.includes(role));
  // Оператор попадает сразу в «Чаты», остальные — в первый доступный раздел
  // (для администратора это тоже «Чаты»; базу знаний он выбирает сам).
  const firstSection = role === "operator" ? visibleSections[0] : visibleSections.find((s) => s.id !== "chats") || visibleSections[0];
  const [activeSectionId, setActiveSectionId] = useState(firstSection.id);
  const [activeSubTabId, setActiveSubTabId] = useState(firstSection.subTabs[0].id);
  const [status, setStatus] = useState(null); // { message, isError }
  const [telegramAlert, setTelegramAlert] = useState(null);

  // Фоновая проверка раз в 30 с — плашка видна на ЛЮБОЙ вкладке, а не только
  // если админ случайно открыл "Мониторинг". Работает, пока панель открыта в
  // браузере; для оповещения без открытой панели есть /api/health/telegram
  // (200/503) — его можно подключить к внешней системе мониторинга.
  useEffect(() => {
    if (role !== "admin") return undefined;
    let cancelled = false;
    async function check() {
      try {
        const data = await api.getMonitoringSelf();
        if (!cancelled) {
          setTelegramAlert(data.telegram && data.telegram.stale ? describeTelegramSilence(data.telegram) : null);
        }
      } catch {
        // Мониторинг недоступен или истекла сессия — это не повод рисовать
        // ложную тревогу именно про Telegram.
      }
    }
    check();
    const id = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [role]);

  const activeSection = visibleSections.find((s) => s.id === activeSectionId) || visibleSections[0];
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
          <h1>Newo-clone — Рабочее место сотрудника</h1>
          <div className="subtitle">
            Вошли как <strong>{profile.display_name || profile.username}</strong> ({profile.role_label}). Изменения применяются сразу,
            без перезапуска сервиса.
          </div>
        </div>
        <button className="secondary" onClick={handleLogout}>
          Выйти
        </button>
      </div>

      {status && (
        <div className={"alert " + (status.isError ? "alert-error" : "alert-ok")}>{status.message}</div>
      )}

      {telegramAlert && <div className="alert alert-error">⚠ {telegramAlert}</div>}

      <div className="tabs tabs-section">
        {visibleSections.map((s) => (
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

      <ActiveComponent onStatus={showStatus} profile={profile} onLogout={handleLogout} />
    </div>
  );
}
