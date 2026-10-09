import React from "react";

// Заглушка до следующего этапа: окно чата оператора и очередь обращений.
export default function OperatorChatsPlaceholder() {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Чаты с клиентами</h3>
      <p className="hint">
        Здесь будет очередь обращений, переданных от бота, и окно переписки с клиентом (Telegram, сайт банка, WhatsApp). Раздел
        появится в следующем обновлении; права доступа для него уже настроены.
      </p>
    </div>
  );
}
