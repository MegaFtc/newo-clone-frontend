import React, { useEffect, useState } from "react";
import { api } from "../api.js";

// Словарь произношений без настроек голоса: модератору нужна именно правка
// слов («ВТБ» → «Вэ Тэ Бэ»), а выбор голоса и озвучка фраз — у администратора.
export default function PronunciationsPanel({ onStatus }) {
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");

  async function reload() {
    try {
      const list = await api.listPronunciations();
      setRows(list);
      setDrafts(Object.fromEntries(list.map((r) => [r.id, r.replacement])));
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn, message) {
    try {
      await fn();
      onStatus(message, false);
      await reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Произношение слов</h3>
      <p className="hint">
        Если бот читает слово неправильно (например, «ВТБ» звучало как «фейтб»), впишите, как его произносить, так, как оно читается по
        слогам: <code>Вэ Тэ Бэ</code>. Слово ищется целиком, без учёта регистра. Чтобы изменения зазвучали в телефонных фразах,
        администратор должен нажать «Озвучить и применить» в разделе «Голос и имя бота».
      </p>
      <div className="add-form" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
        <input placeholder="Слово (например, ВТБ)" value={pattern} onChange={(e) => setPattern(e.target.value)} />
        <input placeholder="Как произносить (Вэ Тэ Бэ)" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        <button
          onClick={() => {
            if (!pattern.trim() || !replacement.trim()) return onStatus("Укажите слово и как его произносить", true);
            run(async () => {
              await api.createPronunciation(pattern.trim(), replacement.trim());
              setPattern("");
              setReplacement("");
            }, "Добавлено в словарь");
          }}
        >
          Добавить
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="empty">Словарь пуст</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>Слово</th>
              <th>Как произносить</th>
              <th style={{ width: 80 }}>Включено</th>
              <th style={{ width: 200 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.id] ?? row.replacement;
              return (
                <tr key={row.id} style={row.enabled ? undefined : { opacity: 0.55 }}>
                  <td>
                    <code>{row.pattern}</code>
                  </td>
                  <td>
                    <input
                      style={{ width: "100%" }}
                      value={draft}
                      onChange={(e) => setDrafts({ ...drafts, [row.id]: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={() => run(() => api.updatePronunciation(row.id, draft, !row.enabled), "Сохранено")}
                    />
                  </td>
                  <td className="row-actions">
                    <button
                      className="secondary"
                      disabled={draft.trim() === row.replacement || !draft.trim()}
                      onClick={() => run(() => api.updatePronunciation(row.id, draft, row.enabled), "Сохранено")}
                    >
                      Сохранить
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (window.confirm(`Удалить «${row.pattern}» из словаря?`)) run(() => api.deletePronunciation(row.id), "Удалено");
                      }}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
