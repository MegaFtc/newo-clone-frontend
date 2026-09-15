import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

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

export default function ChatWidget() {
  const [messages, setMessages] = useState([
    { role: "bot", text: "Здравствуйте! Чем могу помочь?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
      const data = await api.chat(text);
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

  return (
    <div className="chat-page">
      <div className="chat-card">
        <div className="chat-header">Онлайн-консультант банка</div>
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
