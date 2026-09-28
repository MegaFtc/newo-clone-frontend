import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const LANGS = [
  { id: "ru", label: "Русский" },
  { id: "kk", label: "Қазақша" },
];
const GENDER_LABEL = { female: "женский", male: "мужской" };
const RATE_LABELS = { "x-slow": "Очень медленно", slow: "Медленно", medium: "Обычная", fast: "Быстро", "x-fast": "Очень быстро" };
const PITCH_LABELS = { "x-low": "Очень низкий", low: "Низкий", medium: "Обычная", high: "Высокий", "x-high": "Очень высокий" };

const KK_SAMPLE = "Сәлеметсіз бе! Сіз ВТБ Қазақстан банкіне қоңырау шалдыңыз. Сізге қалай көмектесе аламын?";

export default function VoicePanel({ onStatus }) {
  const [catalog, setCatalog] = useState(null);
  const [pronunciations, setPronunciations] = useState([]);
  const [lang, setLang] = useState("ru");
  const [name, setName] = useState("");
  const [sample, setSample] = useState({ ru: "", kk: KK_SAMPLE });
  const [usePron, setUsePron] = useState(true);
  const [phraseDrafts, setPhraseDrafts] = useState({});
  const [rowDrafts, setRowDrafts] = useState({});
  const [newPattern, setNewPattern] = useState("");
  const [newReplacement, setNewReplacement] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applyResults, setApplyResults] = useState(null);
  const audioRef = useRef(null);

  async function load() {
    try {
      const [cat, pron] = await Promise.all([api.getVoiceCatalog(), api.listPronunciations()]);
      setCatalog(cat);
      setPronunciations(pron);
      setName(cat.current.name);
      setPhraseDrafts(Object.fromEntries(cat.phrases.map((p) => [p.setting_key, p.text])));
      setRowDrafts(Object.fromEntries(pron.map((p) => [p.id, p.replacement])));
      setSample((prev) => ({
        ...prev,
        ru:
          prev.ru ||
          `Здравствуйте! Вы позвонили в банк ВТБ Казахстан. Меня зовут ${cat.current.name || "виртуальный помощник"}. Чем могу помочь?`,
      }));
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  // Обновляет только сохранённые значения, не трогая несохранённые черновики
  // в полях (иначе любое сохранение стирало бы то, что набрано рядом).
  async function refreshCatalog() {
    setCatalog(await api.getVoiceCatalog());
  }

  useEffect(() => {
    load();
    return () => stopAudio();
  }, []);

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }

  async function play(key, params) {
    stopAudio();
    setPlayingId(key);
    try {
      const blob = await api.previewVoice(params);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        setPlayingId((current) => (current === key ? null : current));
      };
      audio.onended = done;
      audio.onerror = done;
      await audio.play();
    } catch (err) {
      onStatus(err.message, true);
      setPlayingId(null);
    }
  }

  async function saveSetting(key, value, message = "Сохранено") {
    try {
      await api.setSetting(key, value);
      onStatus(message, false);
      await refreshCatalog();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function saveNameAndPhrases() {
    if (name !== catalog.current.name) await api.setSetting("bot_name", name);
    for (const phrase of catalog.phrases) {
      const draft = phraseDrafts[phrase.setting_key];
      if (draft !== undefined && draft !== phrase.text) await api.setSetting(phrase.setting_key, draft);
    }
    await refreshCatalog();
  }

  async function handleSaveTexts() {
    try {
      await saveNameAndPhrases();
      onStatus("Имя и тексты фраз сохранены. Чтобы они зазвучали по телефону, нажмите «Озвучить и применить».", false);
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleApply() {
    if (
      !window.confirm(
        "Озвучить телефонные фразы текущим голосом и заменить файлы на сервере телефонии? Идущие звонки не прервутся."
      )
    ) {
      return;
    }
    setApplying(true);
    setApplyResults(null);
    try {
      await saveNameAndPhrases(); // применяем то, что видно на экране, а не старые сохранённые значения
      const res = await api.applyPhonePrompts();
      setApplyResults(res.results);
      onStatus(res.ok ? "Фразы озвучены и применены к телефонии" : "Часть фраз не удалось озвучить — см. список ниже", !res.ok);
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setApplying(false);
    }
  }

  async function handleAddPronunciation() {
    if (!newPattern.trim() || !newReplacement.trim()) {
      onStatus("Укажите слово и как его произносить", true);
      return;
    }
    try {
      await api.createPronunciation(newPattern.trim(), newReplacement.trim());
      setNewPattern("");
      setNewReplacement("");
      onStatus("Добавлено в словарь", false);
      await load();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleUpdatePronunciation(row, replacement, enabled) {
    try {
      await api.updatePronunciation(row.id, replacement, enabled);
      onStatus("Сохранено", false);
      await load();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleDeletePronunciation(row) {
    if (!window.confirm(`Удалить «${row.pattern}» из словаря?`)) return;
    try {
      await api.deletePronunciation(row.id);
      onStatus("Удалено", false);
      await load();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  if (!catalog) return <div className="page-loading">Загрузка…</div>;

  const current = catalog.current;
  const speakerKey = lang === "ru" ? "tts_default_speaker_ru" : "tts_default_speaker_kk";
  const selectedVoice = lang === "ru" ? current.speaker_ru : current.speaker_kk;
  const voices = catalog.voices.filter((v) => v.language === lang);
  const phraseLabel = Object.fromEntries(catalog.phrases.map((p) => [p.file, p.label]));

  return (
    <div>
      {/* ---------------- Имя ---------------- */}
      <h3 style={{ marginTop: 0 }}>Имя бота</h3>
      <p className="hint">
        Клиент услышит имя в приветствии по телефону (если в тексте приветствия есть <code>{"{name}"}</code>), и бот назовёт его, если
        спросят «как вас зовут». Подберите имя под голос: женский голос — женское имя, мужской — мужское.
      </p>
      <div className="add-form" style={{ gridTemplateColumns: "1fr auto" }}>
        <input value={name} maxLength={40} placeholder="Например: Алия" onChange={(e) => setName(e.target.value)} />
        <button
          onClick={() => saveSetting("bot_name", name.trim(), "Имя сохранено. Чтобы оно прозвучало в приветствии по телефону, нажмите «Озвучить и применить» ниже.")}
          disabled={name.trim() === current.name}
        >
          Сохранить имя
        </button>
      </div>

      {/* ---------------- Голос ---------------- */}
      <h3>Голос</h3>
      <p className="hint">
        Нажмите «▶ Прослушать», чтобы услышать голос так, как его услышит клиент по телефону (качество телефонной линии). Выбор
        применяется сразу к новым ответам бота; уже записанные телефонные фразы (приветствие и др.) обновляются кнопкой «Озвучить и
        применить» ниже.
      </p>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {LANGS.map((l) => (
          <div key={l.id} className={"tab" + (lang === l.id ? " active" : "")} onClick={() => setLang(l.id)}>
            {l.label}
            {" · "}
            <span className="hint" style={{ margin: 0 }}>
              {(l.id === "ru" ? current.speaker_ru : current.speaker_kk)}
            </span>
          </div>
        ))}
      </div>

      <textarea
        style={{ width: "100%", minHeight: 60, marginBottom: 8 }}
        value={sample[lang]}
        onChange={(e) => setSample({ ...sample, [lang]: e.target.value })}
        placeholder="Текст для проверки голоса"
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={usePron} onChange={(e) => setUsePron(e.target.checked)} />
        <span className="hint" style={{ margin: 0 }}>Применять словарь произношения (как в реальных ответах)</span>
      </label>

      {voices.map((v) => {
        const key = `voice:${v.id}`;
        const isSelected = v.id === selectedVoice;
        return (
          <div className="voice-row" key={v.id}>
            <div className="voice-main">
              <strong>{v.label}</strong>{" "}
              <span className="badge-gender">{GENDER_LABEL[v.gender]}</span>{" "}
              {isSelected && <span className="badge-gender badge-current">выбран</span>}
              <div className="hint" style={{ margin: 0 }}>{v.id}</div>
            </div>
            <button
              className="secondary"
              disabled={playingId === key || !sample[lang].trim()}
              onClick={() =>
                play(key, {
                  text: sample[lang],
                  language: lang,
                  voice: v.id,
                  rate: current.rate,
                  pitch: current.pitch,
                  use_pronunciations: usePron,
                })
              }
            >
              {playingId === key ? "Синтез…" : "▶ Прослушать"}
            </button>
            <button disabled={isSelected} onClick={() => saveSetting(speakerKey, v.id, `Голос выбран: ${v.label}`)}>
              {isSelected ? "Выбран" : "Выбрать"}
            </button>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "16px 0" }}>
        <label>
          <div className="hint" style={{ margin: "0 0 4px" }}>Скорость речи</div>
          <select value={current.rate} onChange={(e) => saveSetting("tts_speech_rate", e.target.value)}>
            {catalog.rates.map((r) => (
              <option key={r} value={r}>{RATE_LABELS[r] || r}</option>
            ))}
          </select>
        </label>
        <label>
          <div className="hint" style={{ margin: "0 0 4px" }}>Высота голоса</div>
          <select value={current.pitch} onChange={(e) => saveSetting("tts_pitch", e.target.value)}>
            {catalog.pitches.map((p) => (
              <option key={p} value={p}>{PITCH_LABELS[p] || p}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        Скорость и высота действуют на все голоса. Если после их изменения голос звучит так же, значит, эта версия модели не приняла
        настройку — тогда верните «Обычная».
      </p>

      {/* ---------------- Произношение ---------------- */}
      <h3>Произношение слов</h3>
      <p className="hint">
        Если бот читает какое-то слово неправильно (например, «ВТБ» звучало как «фейтб»), впишите, как его произносить: пишите так, как
        слово читается по слогам, например <code>Вэ Тэ Бэ</code>. Слово ищется целиком и без учёта регистра. После изменения словаря
        обновите телефонные фразы кнопкой «Озвучить и применить» ниже.
      </p>

      <div className="add-form" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
        <input placeholder="Слово (например, ВТБ)" value={newPattern} onChange={(e) => setNewPattern(e.target.value)} />
        <input placeholder="Как произносить (Вэ Тэ Бэ)" value={newReplacement} onChange={(e) => setNewReplacement(e.target.value)} />
        <button onClick={handleAddPronunciation}>Добавить</button>
      </div>

      {pronunciations.length === 0 ? (
        <div className="empty">Словарь пуст</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 130 }}>Слово</th>
              <th>Как произносить</th>
              <th style={{ width: 70 }}>Включено</th>
              <th style={{ width: 290 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {pronunciations.map((row) => {
              const draft = rowDrafts[row.id] ?? row.replacement;
              const key = `pron:${row.id}`;
              return (
                <tr key={row.id} style={row.enabled ? undefined : { opacity: 0.55 }}>
                  <td><code>{row.pattern}</code></td>
                  <td>
                    <input
                      style={{ width: "100%" }}
                      value={draft}
                      onChange={(e) => setRowDrafts({ ...rowDrafts, [row.id]: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={() => handleUpdatePronunciation(row, draft, !row.enabled)}
                    />
                  </td>
                  <td className="row-actions">
                    <button
                      className="secondary"
                      disabled={draft.trim() === row.replacement || !draft.trim()}
                      onClick={() => handleUpdatePronunciation(row, draft, row.enabled)}
                    >
                      Сохранить
                    </button>
                    <button
                      className="secondary"
                      disabled={playingId === key}
                      title="Озвучить само слово текущим голосом (по сохранённому произношению)"
                      onClick={() =>
                        play(key, {
                          text: row.pattern,
                          language: lang,
                          voice: selectedVoice,
                          rate: current.rate,
                          pitch: current.pitch,
                          use_pronunciations: true,
                        })
                      }
                    >
                      {playingId === key ? "Синтез…" : "▶"}
                    </button>
                    <button className="danger" onClick={() => handleDeletePronunciation(row)}>Удалить</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ---------------- Телефонные фразы ---------------- */}
      <h3>Фразы по телефону</h3>
      <p className="hint">
        Постоянные фразы записываются в файлы заранее (чтобы не тратить время на синтез в начале разговора). В приветствии <code>{"{name}"}</code>{" "}
        заменяется именем бота; если имя пустое, предложение с <code>{"{name}"}</code> пропускается. Кнопка ниже сохраняет имя и тексты,
        озвучивает их текущим голосом и заменяет файлы. Если озвучивание не удалось, прежние файлы остаются на месте.
      </p>

      {catalog.phrases.map((phrase) => (
        <label key={phrase.setting_key} style={{ display: "block", marginBottom: 10 }}>
          <div className="hint" style={{ margin: "0 0 4px" }}>{phrase.label}</div>
          <input
            style={{ width: "100%" }}
            value={phraseDrafts[phrase.setting_key] ?? ""}
            onChange={(e) => setPhraseDrafts({ ...phraseDrafts, [phrase.setting_key]: e.target.value })}
          />
        </label>
      ))}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="secondary" onClick={handleSaveTexts} disabled={applying}>Сохранить тексты</button>
        <button onClick={handleApply} disabled={applying}>
          {applying ? "Озвучиваю… (может занять до минуты)" : "Озвучить и применить к телефонии"}
        </button>
      </div>

      {applyResults && (
        <ul style={{ marginTop: 12, paddingLeft: 20 }}>
          {Object.entries(applyResults).map(([file, r]) => (
            <li key={file} style={{ marginBottom: 4 }}>
              {r.ok ? "✓" : "✗"} {phraseLabel[file] || file}
              {r.ok ? "" : `: ${r.error}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
