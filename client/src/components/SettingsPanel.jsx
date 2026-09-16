import React, { useEffect, useState } from "react";
import { api } from "../api.js";

function FieldInput({ setting, draftValue, onChange }) {
  if (setting.type === "boolean") {
    return (
      <select value={draftValue} onChange={(e) => onChange(e.target.value)}>
        <option value="true">Включено</option>
        <option value="false">Выключено</option>
      </select>
    );
  }
  if (setting.type === "select") {
    return (
      <select value={draftValue} onChange={(e) => onChange(e.target.value)}>
        {setting.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  if (setting.type === "secret") {
    return (
      <input
        type="password"
        placeholder={setting.is_overridden ? setting.value : "не задано"}
        value={draftValue}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (setting.type === "number") {
    return <input type="number" step="0.01" value={draftValue} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input value={draftValue} onChange={(e) => onChange(e.target.value)} />;
}

export default function SettingsPanel({ onStatus }) {
  const [settings, setSettings] = useState([]);
  const [drafts, setDrafts] = useState({});

  async function reload() {
    try {
      const list = await api.getSettings();
      setSettings(list);
      const nextDrafts = {};
      for (const s of list) {
        nextDrafts[s.key] = s.type === "secret" ? "" : s.value;
      }
      setDrafts(nextDrafts);
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSave(setting) {
    const value = drafts[setting.key];
    if (setting.type === "secret" && !value) {
      onStatus("Введите новое значение секрета (пустое поле не сохранится)", true);
      return;
    }
    try {
      const res = await api.setSetting(setting.key, value);
      onStatus(
        res.requires_restart
          ? "Сохранено. Изменение вступит в силу после перезапуска сервиса."
          : "Сохранено и уже применяется, без перезапуска.",
        false
      );
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <p className="hint">
        Настройки читаются в таком порядке: значение из этой панели → переменная окружения → значение по
        умолчанию. Поля с пометкой «требует перезапуска» применяются только после{" "}
        <code>systemctl restart newo-clone</code> на сервере.
      </p>

      {settings.length === 0 ? (
        <div className="empty">Настройки не загрузились</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 220 }}>Параметр</th>
              <th>Значение</th>
              <th style={{ width: 140 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.key}>
                <td>
                  <div>
                    <strong>{s.label}</strong>
                    {s.requires_restart && <span className="badge-restart"> ⟳ рестарт</span>}
                  </div>
                  <div className="hint" style={{ margin: 0 }}>
                    {s.description}
                  </div>
                  <code>{s.key}</code>
                </td>
                <td>
                  <FieldInput
                    setting={s}
                    draftValue={drafts[s.key] ?? ""}
                    onChange={(v) => setDrafts({ ...drafts, [s.key]: v })}
                  />
                  {s.type === "secret" && s.is_overridden && (
                    <div className="hint" style={{ margin: "4px 0 0" }}>
                      Текущее: {s.value}
                    </div>
                  )}
                </td>
                <td className="row-actions">
                  <button onClick={() => handleSave(s)}>Сохранить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
