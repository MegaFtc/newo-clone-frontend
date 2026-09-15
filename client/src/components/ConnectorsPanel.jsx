import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const EMPTY = { name: "", base_url: "", api_key: "", description: "", enabled: true };

export default function ConnectorsPanel({ onStatus }) {
  const [connectors, setConnectors] = useState([]);
  const [draft, setDraft] = useState(EMPTY);

  async function reload() {
    try {
      setConnectors(await api.listConnectors());
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate() {
    if (!draft.name || !draft.base_url) {
      onStatus("Укажите название и URL", true);
      return;
    }
    try {
      await api.createConnector({ ...draft, api_key: draft.api_key || null });
      setDraft(EMPTY);
      onStatus("Коннектор добавлен", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Удалить коннектор?")) return;
    try {
      await api.deleteConnector(id);
      onStatus("Коннектор удалён", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <p className="hint">
        Это реестр конфигурации сторонних API. Сохранение здесь не подключает коннектор к реальным
        вызовам агента автоматически — это отдельный шаг в коде бэкенда.
      </p>

      <div className="add-form connector-add-form">
        <input
          placeholder="Название (CRM, ...)"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          placeholder="Base URL, https://..."
          value={draft.base_url}
          onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
        />
        <input
          placeholder="API-ключ (опционально)"
          type="password"
          value={draft.api_key}
          onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
        />
        <button onClick={handleCreate}>Добавить</button>
        <textarea
          placeholder="Описание — для чего этот коннектор"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          style={{ gridColumn: "1 / 4" }}
        />
      </div>

      {connectors.length === 0 ? (
        <div className="empty">Коннекторов пока нет</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>ID</th>
              <th>Название</th>
              <th>URL</th>
              <th>Ключ</th>
              <th>Описание</th>
              <th style={{ width: 60 }}>Вкл.</th>
              <th style={{ width: 100 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {connectors.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="id-badge">#{c.id}</span>
                </td>
                <td>{c.name}</td>
                <td>
                  <code>{c.base_url}</code>
                </td>
                <td>
                  <code>{c.api_key || "—"}</code>
                </td>
                <td>{c.description}</td>
                <td>{c.enabled ? "✅" : "⛔"}</td>
                <td className="row-actions">
                  <button className="danger" onClick={() => handleDelete(c.id)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
