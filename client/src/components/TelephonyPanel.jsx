import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function TelephonyPanel({ onStatus }) {
  const [operators, setOperators] = useState([]);
  const [calls, setCalls] = useState(null);
  const [callsError, setCallsError] = useState(null);
  const [newExt, setNewExt] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [applying, setApplying] = useState(false);
  const [testingCall, setTestingCall] = useState(false);

  async function reloadOperators() {
    try {
      setOperators(await api.listOperators());
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function reloadCalls() {
    try {
      const data = await api.listActiveCalls();
      setCalls(data.calls);
      setCallsError(null);
    } catch (err) {
      setCalls(null);
      setCallsError(err.message);
    }
  }

  useEffect(() => {
    reloadOperators();
    reloadCalls();
    const interval = setInterval(reloadCalls, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleAddOperator() {
    if (!newExt.trim()) {
      onStatus("Укажите номер оператора", true);
      return;
    }
    try {
      await api.createOperator(newExt.trim(), newLabel.trim());
      setNewExt("");
      setNewLabel("");
      onStatus("Оператор добавлен. Не забудьте нажать «Применить», чтобы изменение попало в телефонию.", false);
      reloadOperators();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleToggle(op) {
    try {
      await api.toggleOperator(op.id, !op.enabled);
      reloadOperators();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleDelete(op) {
    if (!confirm(`Удалить оператора ${op.extension_number}?`)) return;
    try {
      await api.deleteOperator(op.id);
      onStatus("Оператор удалён. Не забудьте нажать «Применить».", false);
      reloadOperators();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      const res = await api.applyOperators();
      onStatus(`Применено: ${res.dialTargets}`, false);
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setApplying(false);
    }
  }

  async function handleTestCall() {
    setTestingCall(true);
    try {
      await api.triggerTestCall();
      onStatus("Тестовый звонок запущен — смотрите логи telephony-service на сервере.", false);
      setTimeout(reloadCalls, 1000);
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setTestingCall(false);
    }
  }

  async function handleHangup(channelId) {
    try {
      await api.hangupCall(channelId);
      onStatus(`Звонок ${channelId} завершён`, false);
      reloadCalls();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Операторы для перевода при эскалации</h3>
      <p className="hint">
        Изменения (добавление/удаление/включение) сохраняются сразу, но НЕ применяются к реальной телефонии,
        пока вы не нажмёте «Применить» — это осознанный отдельный шаг, чтобы не менять конфигурацию Asterisk
        на каждый клик.
      </p>

      <div className="add-form" style={{ gridTemplateColumns: "140px 1fr auto" }}>
        <input placeholder="Номер (напр. 4071)" value={newExt} onChange={(e) => setNewExt(e.target.value)} />
        <input placeholder="Описание (необязательно)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <button onClick={handleAddOperator}>Добавить</button>
      </div>

      {operators.length === 0 ? (
        <div className="empty">Операторов пока нет</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 100 }}>Номер</th>
              <th>Описание</th>
              <th style={{ width: 80 }}>Включён</th>
              <th style={{ width: 100 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id}>
                <td><code>{op.extension_number}</code></td>
                <td>{op.label}</td>
                <td>
                  <input type="checkbox" checked={op.enabled} onChange={() => handleToggle(op)} />
                </td>
                <td className="row-actions">
                  <button className="danger" onClick={() => handleDelete(op)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button onClick={handleApply} disabled={applying}>
          {applying ? "Применяю…" : "Применить к телефонии"}
        </button>
      </div>

      <h3>Активные звонки</h3>
      {callsError ? (
        <div className="hint">Телефония недоступна: {callsError}</div>
      ) : calls && calls.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Канал</th>
              <th style={{ width: 100 }}>Длительность</th>
              <th style={{ width: 100 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.channel_id}>
                <td><code>{c.channel_id}</code></td>
                <td>{c.duration_seconds} сек</td>
                <td className="row-actions">
                  <button className="danger" onClick={() => handleHangup(c.channel_id)}>Завершить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">Активных звонков нет</div>
      )}

      <h3>Тест</h3>
      <p className="hint">
        Инициирует тестовый звонок через локальный тестовый номер Asterisk (без реального SIP-транка) —
        для проверки, что весь цикл бот → бэкенд → TTS работает, независимо от статуса регистрации на Avaya.
      </p>
      <button onClick={handleTestCall} disabled={testingCall}>
        {testingCall ? "Запускаю…" : "Запустить тестовый звонок"}
      </button>
    </div>
  );
}
