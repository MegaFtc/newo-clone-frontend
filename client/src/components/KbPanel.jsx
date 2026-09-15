import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function KbPanel({ onStatus }) {
  const [languages, setLanguages] = useState([]);
  const [languageFilter, setLanguageFilter] = useState("");
  const [entries, setEntries] = useState([]);
  const [drafts, setDrafts] = useState({}); // id -> отредактированный текст (не сохранённый)
  const [newEntry, setNewEntry] = useState({ language: "", entry_id: "", text: "" });

  async function reload() {
    try {
      const [langs, list] = await Promise.all([api.languages(), api.listKb(languageFilter || undefined)]);
      setLanguages(langs);
      setEntries(list);
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageFilter]);

  async function handleSave(id) {
    const text = drafts[id];
    if (text === undefined) return;
    try {
      await api.updateKb(id, text);
      onStatus("Факт обновлён", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Удалить этот факт?")) return;
    try {
      await api.deleteKb(id);
      onStatus("Факт удалён", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleCreate() {
    if (!newEntry.language || !newEntry.entry_id || !newEntry.text) {
      onStatus("Заполните все поля", true);
      return;
    }
    try {
      await api.createKb(newEntry);
      setNewEntry({ language: "", entry_id: "", text: "" });
      onStatus("Факт добавлен", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <label>Язык:</label>
        <select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
          <option value="">Все</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button className="secondary" onClick={reload}>
          Обновить
        </button>
      </div>

      <div className="add-form kb-add-form">
        <input
          placeholder="ru / kk"
          value={newEntry.language}
          onChange={(e) => setNewEntry({ ...newEntry, language: e.target.value })}
        />
        <input
          placeholder="id факта (латиницей)"
          value={newEntry.entry_id}
          onChange={(e) => setNewEntry({ ...newEntry, entry_id: e.target.value })}
        />
        <textarea
          placeholder="Текст факта..."
          value={newEntry.text}
          onChange={(e) => setNewEntry({ ...newEntry, text: e.target.value })}
        />
        <button onClick={handleCreate}>Добавить</button>
      </div>

      {entries.length === 0 ? (
        <div className="empty">Фактов пока нет</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>ID</th>
              <th style={{ width: 70 }}>Язык</th>
              <th style={{ width: 160 }}>Ключ</th>
              <th>Текст</th>
              <th style={{ width: 140 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  <span className="id-badge">#{e.id}</span>
                </td>
                <td>{e.language}</td>
                <td>
                  <code>{e.entry_id}</code>
                </td>
                <td>
                  <textarea
                    defaultValue={e.text}
                    onChange={(ev) => setDrafts({ ...drafts, [e.id]: ev.target.value })}
                  />
                </td>
                <td className="row-actions">
                  <button onClick={() => handleSave(e.id)}>Сохранить</button>
                  <button className="danger" onClick={() => handleDelete(e.id)}>
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
