import { useState, useEffect, useRef } from "react";
import "./App.css";

const API_URL = "http://localhost:3001";

interface Message {
  role: "user" | "agent";
  text: string;
}

function App() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedSessionId = localStorage.getItem("chat_session_id");
    if (savedSessionId) {
      setSessionId(savedSessionId);
      fetch(`${API_URL}/chat/history/${savedSessionId}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const formattedChat = data.map((msg: any) => ({
              role: msg.role === "user" ? "user" : "agent",
              text: msg.content
            }));
            setChat(formattedChat);
          }
        })
        .catch((err) => console.error("Erro ao carregar histórico:", err));
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const sendMessage = async () => {
    if (!message) return;

    const userMsg = message;
    setMessage("");
    setChat((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, sessionId })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      setSessionId(data.sessionId);
      localStorage.setItem("chat_session_id", data.sessionId);

      setChat((prev) => [
        ...prev,
        { role: "agent", text: data.reply }
      ]);
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      setChat((prev) => [
        ...prev,
        { role: "agent", text: "Erro: Não foi possível se conectar ao servidor. Verifique se o backend está ativo!" }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    if (!sessionId) return;
    if (!window.confirm("Deseja realmente limpar o histórico de conversas?")) return;

    try {
      const res = await fetch(`${API_URL}/chat/${sessionId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setChat([]);
        setSessionId(null);
        localStorage.removeItem("chat_session_id");
      }
    } catch (err) {
      console.error("Erro ao limpar histórico:", err);
    }
  };

  return (
    <div className="container">
      <div className="header-area">
        <h1>Teste de Agente de IA</h1>
        {sessionId && (
          <button className="clear-btn" onClick={clearChat}>
            Limpar Histórico
          </button>
        )}
      </div>

      <div className="chat-box">
        {chat.length === 0 && (
          <div className="empty-state">Olá! Como posso te ajudar?</div>
        )}
        {chat.map((msg, i) => (
          <div
            key={i}
            className={`msg ${msg.role === "user" ? "user" : "agent"}`}
          >
            {msg.text}
          </div>
        ))}

        {loading && <div className="loading">Pensando...</div>}
        <div ref={chatEndRef} />
      </div>

      <div className="input-area">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Digite sua mensagem..."
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
        />
        <button onClick={sendMessage} disabled={loading}>
          Enviar
        </button>
      </div>
    </div>
  );
}

export default App;