import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const SESSION_STORAGE_KEY = "newo_chat_session_id";
// sessionStorage (не localStorage) — сознательный выбор: диалог помнится,
// пока открыта вкладка браузера, но не переживает закрытие браузера. Это
// компромисс между удобством (не переспрашивать одно и то же в рамках
// визита на сайт) и приватностью (не хранить историю обращений клиента
// в браузере неограниченно долго).

function Message({ role, text, meta }) {
  return (
    <div className={"msg msg-" + role}>
      <div className="msg-bubble">{text}</div>
      {meta && meta.escalated && (
        <div className="msg-meta">Передано оператору — уточните у сотрудника банка</div>
      )}
    </div>
  );
}

function loadSessionId() {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) || null;
  } catch {
    return null; // приватный режим браузера может блокировать sessionStorage
  }
}

function saveSessionId(id) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // не критично — просто следующее сообщение начнёт новую сессию
  }
}

export default function ChatWidget() {
  const [messages, setMessages] = useState([
    { role: "bot", text: "Здравствуйте! Чем могу помочь?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(loadSessionId);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const data = await api.chat(text, sessionId);
      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id);
        saveSessionId(data.session_id);
      }
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: data.answer, meta: { escalated: data.escalated } },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Извините, сервис временно недоступен. Попробуйте позже.", meta: {} },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleNewConversation() {
    if (sessionId) {
      try {
        await api.clearChatSession(sessionId);
      } catch {
        // если очистка на сервере не удалась — всё равно начинаем новую
        // сессию локально, просто старая запись останется в БД до TTL-чистки
      }
    }
    setSessionId(null);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setMessages([{ role: "bot", text: "Здравствуйте! Чем могу помочь?" }]);
  }

  return (
    <div className="chat-page">
      <div className="chat-card">
        <div className="chat-header">
          Онлайн-консультант банка
          <button className="secondary chat-new-btn" onClick={handleNewConversation} title="Начать новый диалог">
            Новый диалог
          </button>
        </div>
        <div className="chat-messages" ref={scrollRef}>
          {messages.map((m, i) => (
            <Message key={i} {...m} />
          ))}
          {sending && <div className="msg msg-bot msg-typing">Печатает…</div>}
        </div>
        <form className="chat-input-row" onSubmit={handleSend}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напишите сообщение…"
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()}>
            Отправить
          </button>
        </form>
      </div>
    </div>
  );
}
