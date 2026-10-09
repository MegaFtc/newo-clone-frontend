import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const ACTION_LABELS = {
  login: "Вход",
  login_locked: "Блокировка после неудачных входов",
  password_change: "Смена своего пароля",
  user_create: "Создан сотрудник",
  user_update: "Изменён сотрудник",
  user_password_reset: "Сброшен пароль сотрудника",
  user_delete: "Удалён сотрудник",
};

const ROLE_LABELS = { admin: "администратор", moderator: "модератор", operator: "оператор" };

export default function AuditPanel({ onStatus }) {
  const [entries, setEntries] = useState([]);
  const [action, setAction] = useState("");

  async function reload() {
    try {
      setEntries(await api.listAudit(action || undefined));
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Журнал действий</h3>
      <p className="hint">Входы, блокировки и изменения учётных записей. Пароли в журнал не попадают.</p>
      <div className="add-form" style={{ gridTemplateColumns: "260px auto 1fr" }}>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Все события</option>
          {Object.entries(ACTION_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={reload}>
          Обновить
        </button>
        <span />
      </div>
      {entries.length === 0 ? (
        <div className="empty">Событий нет</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 170 }}>Время</th>
              <th style={{ width: 150 }}>Кто</th>
              <th style={{ width: 280 }}>Событие</th>
              <th>Подробности</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString("ru-RU")}</td>
                <td>
                  <code>{e.actor}</code>
                  {e.role && <span className="hint"> ({ROLE_LABELS[e.role] || e.role})</span>}
                </td>
                <td>{ACTION_LABELS[e.action] || e.action}</td>
                <td>{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
