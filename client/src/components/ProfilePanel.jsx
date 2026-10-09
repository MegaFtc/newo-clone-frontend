import React, { useState } from "react";
import { api } from "../api.js";

export default function ProfilePanel({ onStatus, profile, onLogout }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (next !== repeat) {
      onStatus("Новый пароль и повтор не совпадают", true);
      return;
    }
    setBusy(true);
    try {
      await api.changeMyPassword(current, next);
      onStatus("Пароль изменён. Войдите заново с новым паролем.", false);
      // Сессия хранит старый пароль, поэтому после смены она бесполезна —
      // выходим сразу, а не ждём, пока она начнёт отвечать ошибками.
      await onLogout();
    } catch (err) {
      onStatus(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Мой профиль</h3>
      <p>
        <strong>{profile.display_name || profile.username}</strong> · <code>{profile.username}</code> · {profile.role_label}
      </p>

      <h3>Сменить пароль</h3>
      {profile.is_env_admin ? (
        <p className="hint">
          Вы вошли как аварийный администратор из файла .env: его пароль меняется на сервере (ADMIN_PASSWORD в .env бэкенда), а не
          здесь. Для повседневной работы создайте именную учётную запись в разделе «Сотрудники».
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 360, display: "grid", gap: 10 }}>
          <input type="password" placeholder="Текущий пароль" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          <input
            type="password"
            placeholder="Новый пароль (мин. 10, буквы и цифры)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <input type="password" placeholder="Повторите новый пароль" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
          <button type="submit" disabled={busy}>
            {busy ? "Сохраняем…" : "Сменить пароль"}
          </button>
        </form>
      )}
    </div>
  );
}
