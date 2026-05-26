require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Banco de dados conectado.');
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

const tools = {
  getTime: (args) => {
    const now = new Date();
    let tz = undefined;

    if (args && typeof args === 'string' && args.trim() !== "") {
      tz = args.trim();
    }

    try {
      const dateStr = now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: tz });
      const weekday = now.toLocaleString('pt-BR', { weekday: 'long', timeZone: tz });
      return `${dateStr} (${weekday}) no fuso ${tz || 'Local'}`;
    } catch (e) {
      return `[ERRO]: Fuso '${tz}' invalido.`;
    }
  },

  calculate: (expression) => {
    try {
      if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
        throw new Error("Expressão contém caracteres não permitidos.");
      }
      const result = new Function('return ' + expression)();
      return result.toString();
    } catch (e) {
      return "Erro ao calcular: " + e.message;
    }
  }
};

const SYSTEM_PROMPT = `
Você é um Agente de IA ultradireto, conciso e objetivo.

IMPORTANTE: Você NÃO SABE a hora atual nem a data. Seu relógio interno está congelado. Você DEVE OBRIGATORIAMENTE chamar a ferramenta getTime APENAS QUANDO O USUÁRIO PERGUNTAR EXPLICITAMENTE a hora, a data, o dia da semana ou um fuso horário. Cumprimentos casuais (como "bom dia" ou "boa noite") NÃO são perguntas de hora e não exigem a ferramenta. NUNCA adivinhe ou chute os minutos.

TOOLS DISPONÍVEIS:
1. getTime → retorna data e hora atual. Para fusos do Brasil, use America/Sao_Paulo, America/Recife, etc. Para exterior, use fusos IANA (ex: Asia/Tokyo). NUNCA use nomes de cidades diretamente no argumento, APENAS fusos IANA válidos. Ex: TOOL: getTime | America/Recife
2. calculate(expression) → faz cálculos matemáticos seguros.

Regra de Uso das Tools:
Quando precisar usar uma ferramenta, sua resposta deve ser EXATAMENTE e APENAS o comando abaixo:
TOOL: nome_da_tool | argumento

Exemplos de uso correto:
Pergunta: que horas são?
Resposta: TOOL: getTime

Pergunta: quanto é 2*5?
Resposta: TOOL: calculate | 2*5

Caso não precise de ferramentas, responda de forma super direta, sem enrolação.
`;

const insertMessage = (sessionId, role, content) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)`,
      [sessionId, role, content],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

const getHistory = (sessionId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC`,
      [sessionId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

app.get("/chat/history/:sessionId", async (req, res) => {
  try {
    const rows = await getHistory(req.params.sessionId);

    const clientSafeRows = rows.filter(row => {
      if (row.role === "system") return false;
      if (row.role === "assistant" && row.content.includes("TOOL:")) return false;
      if (row.role === "user" && row.content.startsWith("Resultado da ferramenta")) return false;
      return true;
    });

    res.json(clientSafeRows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar historico." });
  }
});

app.delete("/chat/:sessionId", (req, res) => {
  db.run(`DELETE FROM messages WHERE session_id = ?`, [req.params.sessionId], function (err) {
    if (err) {
      res.status(500).json({ error: "Erro ao deletar historico." });
    } else {
      res.json({ message: "Historico apagado.", deletedCount: this.changes });
    }
  });
});

app.post("/chat", async (req, res) => {
  const { message, sessionId } = req.body;
  const id = sessionId || crypto.randomUUID();

  if (!message) {
    return res.status(400).json({ error: "A mensagem é obrigatória." });
  }

  try {
    let messages = await getHistory(id);

    if (messages.length === 0) {
      await insertMessage(id, "system", SYSTEM_PROMPT);
      messages.push({ role: "system", content: SYSTEM_PROMPT });
    }

    await insertMessage(id, "user", message);
    messages.push({ role: "user", content: message });

    let isFinalResponse = false;
    let finalReply = "";
    let iterations = 0;

    while (!isFinalResponse && iterations < 3) {
      iterations++;

      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: messages
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      let aiReply = response.data.choices[0].message.content;
      const toolMatch = aiReply.match(/TOOL:\s*([a-zA-Z0-9_]+)(?:\s*\|\s*(.*))?/);

      if (toolMatch) {
        const toolName = toolMatch[1];
        const arg = toolMatch[2] ? toolMatch[2].trim() : "";

        await insertMessage(id, "assistant", aiReply);
        messages.push({ role: "assistant", content: aiReply });

        let result = "";
        if (tools[toolName]) {
          result = tools[toolName](arg);
        } else {
          result = `Erro: Tool '${toolName}' nao existe.`;
        }

        let feedbackMsg = "";
        if (toolName === "getTime") {
          feedbackMsg = `Resultado da ferramenta getTime: ${result}. Agora apenas repasse esse valor ao usuário de forma direta e concisa. ATENÇÃO: Nunca escreva termos técnicos como 'no fuso Europe/Berlin' ou 'no fuso Local' na sua resposta final, extraia e mostre apenas a data e a hora. Não invente textos longos. Não inclua a palavra TOOL na sua próxima resposta.`;
        } else {
          feedbackMsg = `Resultado da ferramenta ${toolName}: ${result}. Agora apenas repasse esse valor ao usuário de forma direta e concisa. Não invente textos longos. Não inclua a palavra TOOL na sua próxima resposta.`;
        }

        await insertMessage(id, "user", feedbackMsg);
        messages.push({ role: "user", content: feedbackMsg });
      } else {
        isFinalResponse = true;
        finalReply = aiReply;
        await insertMessage(id, "assistant", finalReply);
      }
    }

    if (!isFinalResponse) {
      finalReply = "Erro ao processar resposta.";
      await insertMessage(id, "assistant", finalReply);
    }

    res.json({ reply: finalReply, sessionId: id });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Erro interno." });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

module.exports = { app, tools };