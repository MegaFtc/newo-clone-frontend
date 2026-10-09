import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export const ROLE_OPTIONS = [
  { id: "admin", label: "Администратор", hint: "Полный доступ, включая настройки, телефонию и сотрудников" },
  { id: "moderator", label: "Модератор", hint: "База знаний, диалоги, журнал эскалаций, словарь произношений; очередь чатов" },
  { id: "operator", label: "Оператор", hint: "Только окно чата с клиентами" },
];

// Пароль генерируется в браузере из криптостойкого источника. Алфавит без
// похожих символов (0/O, 1/l/I), чтобы его можно было продиктовать по телефону.
export function generatePassword(length = 12) {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const pick = (alphabet) => alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("ru-RU");
}

export default function UsersPanel({ onStatus, profile }) {
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({}); // id -> { display_name, role, active }
  const [form, setForm] = useState({ username: "", display_name: "", role: "operator", password: "" });
  const [issued, setIssued] = useState(null); // { username, password } — показываем один раз

  async function reload() {
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draftOf(u) {
    return drafts[u.id] || { display_name: u.display_name, role: u.role, active: u.active };
  }

  function setDraft(u, patch) {
    setDrafts({ ...drafts, [u.id]: { ...draftOf(u), ...patch } });
  }

  function isDirty(u) {
    const d = draftOf(u);
    return d.display_name !== u.display_name || d.role !== u.role || d.active !== u.active;
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.createUser(form);
      setIssued({ username: form.username.trim().toLowerCase(), password: form.password });
      setForm({ username: "", display_name: "", role: "operator", password: "" });
      onStatus("Сотрудник создан", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleSave(u) {
    try {
      await api.updateUser(u.id, draftOf(u));
      const next = { ...drafts };
      delete next[u.id];
      setDrafts(next);
      onStatus("Сохранено", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleResetPassword(u) {
    if (!window.confirm(`Задать новый пароль для «${u.username}»? Старый перестанет работать, сотрудник будет разлогинен.`)) return;
    const password = generatePassword();
    try {
      await api.resetUserPassword(u.id, password);
      setIssued({ username: u.username, password });
      onStatus("Новый пароль задан", false);
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  async function handleDelete(u) {
    if (!window.confirm(`Удалить сотрудника «${u.username}»? Если нужно просто закрыть доступ — лучше снимите галочку «Активен».`)) return;
    try {
      await api.deleteUser(u.id);
      onStatus("Удалено", false);
      reload();
    } catch (err) {
      onStatus(err.message, true);
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Сотрудники</h3>
      <p className="hint">
        <strong>Администратор</strong> — всё, включая настройки, телефонию и сотрудников. <strong>Модератор</strong> — база знаний,
        просмотр диалогов и журнала эскалаций, словарь произношений, очередь чатов. <strong>Оператор</strong> — только окно чата с
        клиентами. Права проверяются на сервере. Блокировка («Активен» выключен) и смена роли действуют сразу.
      </p>

      {issued && (
        <div className="alert alert-ok">
          Пароль для <strong>{issued.username}</strong>: <code style={{ fontSize: 16 }}>{issued.password}</code>
          <br />
          Покажите его сотруднику сейчас и не пересылайте в чатах — после закрытия этого сообщения он нигде не отображается.{" "}
          <button className="secondary" onClick={() => navigator.clipboard && navigator.clipboard.writeText(issued.password)}>
            Скопировать
          </button>{" "}
          <button className="secondary" onClick={() => setIssued(null)}>
            Скрыть
          </button>
        </div>
      )}

      <form className="add-form" style={{ gridTemplateColumns: "1fr 1fr 1fr 1.4fr auto" }} onSubmit={handleCreate}>
        <input
          placeholder="Логин (латиница)"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          required
        />
        <input
          placeholder="Имя (как увидит клиент)"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.id} value={r.id} title={r.hint}>
              {r.label}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            style={{ flex: 1 }}
            placeholder="Пароль (мин. 10, буквы и цифры)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <button type="button" className="secondary" onClick={() => setForm({ ...form, password: generatePassword() })}>
            Сгенерировать
          </button>
        </div>
        <button type="submit">Добавить</button>
      </form>

      {users.length === 0 ? (
        <div className="empty">Сотрудников пока нет. Вы вошли как аварийный администратор из .env — создайте именные учётные записи.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Логин</th>
              <th>Имя</th>
              <th style={{ width: 170 }}>Роль</th>
              <th style={{ width: 80 }}>Активен</th>
              <th style={{ width: 160 }}>Последний вход</th>
              <th style={{ width: 330 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const d = draftOf(u);
              const isSelf = u.username === profile.username;
              return (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <code>{u.username}</code>
                    {isSelf && <span className="hint"> (вы)</span>}
                  </td>
                  <td>
                    <input
                      style={{ width: "100%" }}
                      value={d.display_name}
                      onChange={(e) => setDraft(u, { display_name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select value={d.role} disabled={isSelf} onChange={(e) => setDraft(u, { role: e.target.value })}>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={d.active}
                      disabled={isSelf}
                      onChange={(e) => setDraft(u, { active: e.target.checked })}
                    />
                  </td>
                  <td>{formatTime(u.last_login_at)}</td>
                  <td className="row-actions">
                    <button className="secondary" disabled={!isDirty(u)} onClick={() => handleSave(u)}>
                      Сохранить
                    </button>
                    <button className="secondary" onClick={() => handleResetPassword(u)}>
                      Новый пароль
                    </button>
                    <button className="danger" disabled={isSelf} onClick={() => handleDelete(u)}>
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
