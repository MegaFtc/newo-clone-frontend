import React, { useState } from "react";
import { api } from "../api.js";

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login(username, password);
      onLoggedIn(data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Вход в админ-панель</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <label>
          Логин
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
