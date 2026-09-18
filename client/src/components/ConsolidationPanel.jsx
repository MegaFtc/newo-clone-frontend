import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const FILTERS = [
  { id: "pending", label: "Ожидают решения" },
  { id: "approved", label: "Одобрено" },
  { id: "rejected", label: "Отклонено" },
  { id: "all", label: "Все" },
];

export default function ConsolidationPanel({ onStatus }) {
  const [filter, setFilter] = useState("pending");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [language, setLanguage] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const value = filter === "all" ? null : filter;
      setSuggestions(await api.listConsolidationSuggestions(value));
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [filter]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await api.analyzeConsolidation(language.trim() || undefined);
      const errorLangs = Object.keys(res.errors || {});
      if (errorLangs.length > 0) {
        onStatus(
          `Создано ${res.suggestions_created} предложений. Ошибки: ${errorLangs
            .map((l) => `${l} — ${res.errors[l]}`)
            .join("; ")}`,
          true
        );
      } else {
        onStatus(`Анализ завершён — создано ${res.suggestions_created} предложений`, false);
      }
      setFilter("pending");
      reload();
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleApprove(s) {
    try {
      const res = await api.approveConsolidation(s.id);
      onStatus(`Объединено ${res.deleted_count} фактов в один (${res.new_entry_id})`, false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleReject(s) {
    try {
      await api.rejectConsolidation(s.id);
      onStatus("Предложение отклонено, факты не тронуты", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <p className="hint">
        LLM периодически (или по кнопке ниже) ищет в базе знаний дубли, пересекающиеся или устаревшие/
        противоречащие друг другу факты. Ничего не объединяется автоматически — только предложение,
        которое нужно явно одобрить или отклонить.
      </p>

      <div className="add-form" style={{ gridTemplateColumns: "1fr auto" }}>
        <input
          placeholder="Язык (ru, kk...) — оставьте пустым для анализа всех языков"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        />
        <button onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? "Анализирую…" : "Запустить анализ"}
        </button>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <div key={f.id} className={"tab" + (filter === f.id ? " active" : "")} onClick={() => setFilter(f.id)}>
            {f.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка…</div>
      ) : suggestions.length === 0 ? (
        <div className="empty">Ничего не найдено</div>
      ) : (
        suggestions.map((s) => (
          <div key={s.id} className="monitor-card" style={{ marginBottom: 12 }}>
            <div className="hint" style={{ margin: "0 0 8px" }}>
              {new Date(s.created_at).toLocaleString()} · язык: {s.language} · статус: {s.status}
            </div>

            <strong>Исходные факты ({s.entry_texts.length}):</strong>
            <ul style={{ margin: "6px 0 12px", paddingLeft: 20 }}>
              {s.entry_texts.map((text, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {text}
                </li>
              ))}
            </ul>

            <strong>Предлагаемый объединённый факт:</strong>
            <p style={{ margin: "6px 0 12px", padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
              {s.suggested_text}
            </p>

            {s.reason && (
              <div className="hint" style={{ marginBottom: 12 }}>
                Причина: {s.reason}
              </div>
            )}

            {s.status === "pending" && (
              <div className="toolbar">
                <button onClick={() => handleApprove(s)}>Одобрить и объединить</button>
                <button className="secondary" onClick={() => handleReject(s)}>
                  Отклонить
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
