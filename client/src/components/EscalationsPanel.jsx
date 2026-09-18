import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const FILTERS = [
  { id: "unresolved", label: "Не обработано", value: false },
  { id: "resolved", label: "Обработано", value: true },
  { id: "all", label: "Все", value: undefined },
];

export default function EscalationsPanel({ onStatus }) {
  const [filter, setFilter] = useState("unresolved");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const value = FILTERS.find((f) => f.id === filter).value;
      setEntries(await api.listEscalations(value));
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [filter]);

  async function handleResolve(entry, resolved) {
    try {
      await api.resolveEscalation(entry.id, resolved);
      onStatus(resolved ? "Отмечено как обработано" : "Возвращено в необработанные", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <p className="hint">
        Вопросы клиентов, на которые бот не смог ответить уверенно (эскалированные или не прошедшие проверку
        фактов) — используйте это, чтобы понять, каких фактов не хватает в базе знаний, и добавить их через
        вкладку «Импорт знаний».
      </p>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <div key={f.id} className={"tab" + (filter === f.id ? " active" : "")} onClick={() => setFilter(f.id)}>
            {f.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : entries.length === 0 ? (
        <div className="empty">Ничего не найдено</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 140 }}>Когда</th>
              <th style={{ width: 70 }}>Канал</th>
              <th>Вопрос клиента</th>
              <th>Ответ бота</th>
              <th style={{ width: 70 }}>Увер.</th>
              <th style={{ width: 100 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="hint">{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.channel}</td>
                <td>{e.user_message}</td>
                <td>
                  {e.answer}
                  {e.observer_issues.length > 0 && (
                    <div className="hint" style={{ margin: "4px 0 0" }}>
                      ⚠ {e.observer_issues.join("; ")}
                    </div>
                  )}
                </td>
                <td>{Math.round(e.confidence * 100)}%</td>
                <td className="row-actions">
                  {e.resolved ? (
                    <button className="secondary" onClick={() => handleResolve(e, false)}>
                      Вернуть
                    </button>
                  ) : (
                    <button onClick={() => handleResolve(e, true)}>Обработано</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
