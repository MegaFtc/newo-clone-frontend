import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function SettingsPanel({ onStatus }) {
  const [settings, setSettings] = useState({});
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  async function reload() {
    try {
      setSettings(await api.getSettings());
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSave() {
    if (!key) {
      onStatus("Укажите ключ", true);
      return;
    }
    try {
      await api.setSetting(key, value);
      setKey("");
      setValue("");
      onStatus("Настройка сохранена", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  const entries = Object.entries(settings);

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 220 }}>Ключ</th>
            <th>Значение</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={2} className="empty">
                Настроек пока нет
              </td>
            </tr>
          ) : (
            entries.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <code>{k}</code>
                </td>
                <td>{v}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="add-form settings-add-form">
        <input placeholder="ключ (напр. llm_provider)" value={key} onChange={(e) => setKey(e.target.value)} />
        <input placeholder="значение" value={value} onChange={(e) => setValue(e.target.value)} />
        <button onClick={handleSave}>Сохранить</button>
      </div>
    </div>
  );
}
