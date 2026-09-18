import React, { useState } from "react";
import { api } from "../api.js";

const SOURCE_TABS = [
  { id: "file", label: "Файл (PDF/DOCX/XLSX/TXT)" },
  { id: "url", label: "Ссылка" },
  { id: "text", label: "Вставить текст" },
];

export default function ImportPanel({ onStatus }) {
  const [sourceTab, setSourceTab] = useState("file");
  const [language, setLanguage] = useState("ru");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [crawlSite, setCrawlSite] = useState(false);
  const [maxPages, setMaxPages] = useState(10);
  const [rawText, setRawText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [warning, setWarning] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [pagesCrawled, setPagesCrawled] = useState(null);

  // candidates: [{ text, checked }] — то, что реально предложил LLM,
  // с чекбоксами и возможностью редактирования перед сохранением.
  const [candidates, setCandidates] = useState([]);
  const [saving, setSaving] = useState(false);

  async function handleExtract() {
    setExtracting(true);
    setWarning(null);
    setCandidates([]);
    setSourcePreview(null);
    setPagesCrawled(null);
    try {
      let result;
      if (sourceTab === "file") {
        if (!file) {
          onStatus("Выберите файл", true);
          setExtracting(false);
          return;
        }
        result = await api.extractFromFile(file, language);
      } else if (sourceTab === "url") {
        if (!url.trim()) {
          onStatus("Укажите ссылку", true);
          setExtracting(false);
          return;
        }
        result = crawlSite
          ? await api.extractFromSite(url.trim(), language, maxPages)
          : await api.extractFromUrl(url.trim(), language);
        if (result.pages_crawled) setPagesCrawled(result.pages_crawled);
      } else {
        if (!rawText.trim()) {
          onStatus("Вставьте текст", true);
          setExtracting(false);
          return;
        }
        result = await api.extractFromText(rawText.trim(), language);
      }
      setCandidates(result.facts.map((text) => ({ text, checked: true })));
      setSourcePreview(result.source_text_preview);
      if (result.warning) setWarning(result.warning);
      if (result.facts.length > 0) {
        onStatus(`Извлечено ${result.facts.length} потенциальных фактов — проверьте перед сохранением`, false);
      }
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setExtracting(false);
    }
  }

  function toggleCandidate(index) {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, checked: !c.checked } : c)));
  }

  function updateCandidateText(index, text) {
    setCandidates((prev) => prev.map((c, i) => (i === index ? { ...c, text } : c)));
  }

  function removeCandidate(index) {
    setCandidates((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const selected = candidates.filter((c) => c.checked && c.text.trim()).map((c) => c.text.trim());
    if (selected.length === 0) {
      onStatus("Не выбрано ни одного факта для сохранения", true);
      return;
    }
    setSaving(true);
    try {
      const res = await api.commitImport(language, selected, "imported");
      onStatus(`Сохранено ${res.created} фактов в базу знаний (язык: ${language})`, false);
      setCandidates([]);
      setSourcePreview(null);
      setPagesCrawled(null);
      setFile(null);
      setUrl("");
      setRawText("");
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = candidates.filter((c) => c.checked).length;

  return (
    <div>
      <p className="hint">
        Извлечённые факты — это ТОЛЬКО черновик от LLM. Ничего не попадает в базу знаний, пока вы явно не
        нажмёте «Сохранить выбранное» ниже. Проверяйте каждый факт — особенно цифры (ставки, суммы, сроки).
      </p>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {SOURCE_TABS.map((t) => (
          <div
            key={t.id}
            className={"tab" + (sourceTab === t.id ? " active" : "")}
            onClick={() => setSourceTab(t.id)}
          >
            {t.label}
          </div>
        ))}
      </div>

      <div className="add-form" style={{ gridTemplateColumns: "100px 1fr auto" }}>
        <input placeholder="ru / kk" value={language} onChange={(e) => setLanguage(e.target.value)} />

        {sourceTab === "file" && (
          <input type="file" accept=".pdf,.docx,.xlsx,.txt" onChange={(e) => setFile(e.target.files[0] || null)} />
        )}
        {sourceTab === "url" && (
          <input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        )}
        {sourceTab === "text" && (
          <textarea
            placeholder="Вставьте текст документа..."
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            style={{ minHeight: 100 }}
          />
        )}

        <button onClick={handleExtract} disabled={extracting}>
          {extracting ? "Извлекаю…" : "Извлечь факты"}
        </button>
      </div>

      {sourceTab === "url" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: -8, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={crawlSite} onChange={(e) => setCrawlSite(e.target.checked)} />
            <span className="hint" style={{ margin: 0 }}>
              Обойти и вкладки/подстраницы сайта (ссылки с этой страницы на тот же домен)
            </span>
          </label>
          {crawlSite && (
            <input
              type="number"
              min={1}
              max={25}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              style={{ width: 70 }}
              title="Максимум страниц для обхода"
            />
          )}
        </div>
      )}

      {warning && <div className="alert alert-error">{warning}</div>}

      {pagesCrawled && (
        <div className="hint" style={{ marginBottom: 12 }}>
          Обойдено страниц ({pagesCrawled.length}): {pagesCrawled.join(", ")}
        </div>
      )}

      {sourcePreview && (
        <details style={{ marginBottom: 16 }}>
          <summary className="hint" style={{ cursor: "pointer" }}>
            Показать начало исходного текста (для проверки, что извлеклось верно)
          </summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--muted)" }}>{sourcePreview}</pre>
        </details>
      )}

      {candidates.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Факт (можно отредактировать)</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input type="checkbox" checked={c.checked} onChange={() => toggleCandidate(i)} />
                  </td>
                  <td>
                    <textarea value={c.text} onChange={(e) => updateCandidateText(i, e.target.value)} />
                  </td>
                  <td className="row-actions">
                    <button className="danger" onClick={() => removeCandidate(i)}>
                      Убрать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving || selectedCount === 0}>
              {saving ? "Сохраняю…" : `Сохранить выбранное (${selectedCount})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
