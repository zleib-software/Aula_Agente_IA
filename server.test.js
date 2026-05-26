const request = require('supertest');
const { app, tools } = require('./server');

describe('Testes Unitários (TU)', () => {
  describe('Ferramenta calculate', () => {
    test('TU-001: Deve calcular expressões matemáticas válidas corretamente', () => {
      const result = tools.calculate('10 * 5');
      expect(result).toBe('50');
    });

    test('TU-002: Deve bloquear expressões maliciosas (RCE/Eval)', () => {
      const result = tools.calculate('Math.random()');
      expect(result).toContain('Erro ao calcular: Expressão contém caracteres não permitidos');
    });

    test('TDD-001: Validador de expressão rejeita letras', () => {
      const result = tools.calculate('a');
      expect(result).toContain('Erro ao calcular: Expressão contém caracteres não permitidos');
    });
  });
});

describe('Testes Funcionais (TF)', () => {
  let sessionId = 'test-session-functional';

  test('TF-01: Envio de Mensagem - Deve processar o chat e responder corretamente', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ message: 'Olá', sessionId })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(res.body).toHaveProperty('sessionId', sessionId);
  }, 10000);

  test('TF-02: Calculadora Matemática - Deve processar expressões através do fluxo de chat', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ message: 'Quanto é 2 + 2 * 5?', sessionId })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.reply).toContain('12');
  }, 15000);

  test('TF-03: Limpeza do Chat - Deve deletar o histórico de mensagens', async () => {
    const res = await request(app).delete(`/chat/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Historico apagado.');
  });

  test('TF-04: Histórico Vazio - Deve retornar array vazio para sessão inexistente', async () => {
    const res = await request(app).get('/chat/history/sessao-inexistente-123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('TF-05: Erro Backend - Deve retornar 400 se o corpo da mensagem estiver ausente', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ sessionId })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'A mensagem é obrigatória.');
  });
});

describe('Testes Não Funcionais (TNF)', () => {
  test('TNF-001: Desempenho - A resposta do backend deve retornar em menos de 3 segundos', async () => {
    const start = Date.now();
    const res = await request(app)
      .post('/chat')
      .send({ message: 'Oi', sessionId: 'test-perf' })
      .set('Content-Type', 'application/json');
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(3000);
  }, 10000);

  test('TNF-003: Segurança - Deve impedir execução remota de código (RCE) na calculadora', () => {
    const result = tools.calculate('process.exit()');
    expect(result).toContain('Erro ao calcular: Expressão contém caracteres não permitidos');
  });
});

describe('Testes de Integração (TI)', () => {
  let sessionId = 'test-session-integration';

  test('TI-001: Front-end + Back-end (Endpoint POST /chat conexão e payload)', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ message: 'Teste integração', sessionId })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(res.body).toHaveProperty('sessionId');
  }, 10000);

  test('TI-002: Back-end + SQLite (Verificar persistência física de mensagens)', async () => {
    const res = await request(app).get(`/chat/history/${sessionId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('Testes de Aceitação (TA)', () => {
  test('TA-001: Retenção de contexto do chat em conversação fluida', async () => {
    const sessionId = 'test-session-acceptance';
    
    const res1 = await request(app)
      .post('/chat')
      .send({ message: 'Meu nome é Gabriel', sessionId })
      .set('Content-Type', 'application/json');
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/chat')
      .send({ message: 'Qual é meu nome?', sessionId })
      .set('Content-Type', 'application/json');
    expect(res2.status).toBe(200);
    expect(res2.body.reply.toLowerCase()).toContain('gabriel');
  }, 20000);
});

describe('Testes E2E (End-to-End)', () => {
  test('E2E-001: Fluxo completo de conversação, persistência e limpeza', async () => {
    const sessionId = 'test-session-e2e';

    const resChat = await request(app)
      .post('/chat')
      .send({ message: 'Quanto é 5 * 5?', sessionId })
      .set('Content-Type', 'application/json');
    expect(resChat.status).toBe(200);
    expect(resChat.body.reply).toContain('25');

    const resHistory = await request(app).get(`/chat/history/${sessionId}`);
    expect(resHistory.status).toBe(200);
    expect(resHistory.body.some(m => m.content.includes('25') || m.content.includes('5 * 5'))).toBe(true);

    const resDelete = await request(app).delete(`/chat/${sessionId}`);
    expect(resDelete.status).toBe(200);

    const resHistoryAfter = await request(app).get(`/chat/history/${sessionId}`);
    expect(resHistoryAfter.status).toBe(200);
    expect(resHistoryAfter.body).toEqual([]);
  }, 25000);
});
