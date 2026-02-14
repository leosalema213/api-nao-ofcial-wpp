# 🚀 WhatsApp API Escalável - NestJS + Baileys + Supabase

API WhatsApp não-oficial escalável construída com NestJS, @whiskeysockets/baileys, Supabase e BullMQ. Suporta 80+ instâncias simultâneas com arquitetura stateless.

---

## 📋 Índice

- [Características](#-características)
- [Arquitetura](#-arquitetura)
- [Stack Tecnológica](#-stack-tecnológica)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Migrations](#-migrations)
- [Uso](#-uso)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Endpoints API](#-endpoints-api)
- [Deployment](#-deployment)

---

## ✨ Características

- ✅ **Escalável**: Suporta 80+ instâncias WhatsApp simultâneas
- ✅ **Stateless**: Estado armazenado no Supabase (PostgreSQL)
- ✅ **Filas**: BullMQ + Redis para processamento assíncrono
- ✅ **Auto-reconexão**: Reconecta automaticamente em caso de falha
- ✅ **Webhook**: Integração com n8n via webhooks
- ✅ **QR Code**: Geração automática de QR Code para autenticação
- ✅ **Rate Limiting**: Delay humano para evitar banimentos
- ✅ **Limpeza Automática**: Mensagens antigas removidas automaticamente (7 dias)
- ✅ **Horizontal Scaling**: Preparado para múltiplos servidores (via Redis Pub/Sub)

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (NestJS)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Controller │  │   Controller │  │   Controller │      │
│  │  (Instance)  │  │  (Messages)  │  │   (Webhook)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────┬───────────────┬───────────────┬────────────────┘
             │               │               │
    ┌────────▼───────┐ ┌────▼─────┐  ┌──────▼──────┐
    │     Auth       │ │  Queue   │  │  Webhook    │
    │    Service     │ │  Module  │  │  Service    │
    │  (Baileys)     │ │ (BullMQ) │  │  (n8n)      │
    └────────┬───────┘ └────┬─────┘  └──────┬──────┘
             │               │               │
    ┌────────▼───────────────▼───────────────▼────────┐
    │              Supabase (PostgreSQL)               │
    │  profiles | whatsapp_instances | sessions | log  │
    └──────────────────────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │   Redis (Cache) │
                  │   BullMQ Queues │
                  └─────────────────┘
```

### Fluxo de Mensagens

**Recebimento (Inbound):**

```
WhatsApp → Baileys → Redis (Fila Inbound) → Worker → n8n Webhook
```

**Envio (Outbound):**

```
n8n → API POST /send → Redis (Fila Outbound) → Worker → Baileys → WhatsApp
```

---

## 🛠️ Stack Tecnológica

| Tecnologia                  | Versão  | Propósito                    |
| --------------------------- | ------- | ---------------------------- |
| **NestJS**                  | ^10.0.0 | Framework backend            |
| **TypeScript**              | ^5.1.3  | Linguagem                    |
| **@whiskeysockets/baileys** | ^6.7.9  | Biblioteca WhatsApp          |
| **@supabase/supabase-js**   | ^2.x    | Cliente Supabase             |
| **BullMQ**                  | ^5.x    | Sistema de filas             |
| **ioredis**                 | ^5.x    | Cliente Redis                |
| **@nestjs/bull**            | ^10.x   | Integração BullMQ com NestJS |

---

## 📦 Instalação

### Pré-requisitos

- Node.js >= 18.x
- Redis >= 6.x
- Conta Supabase (já configurada)

### Passo a Passo

```bash
# Clone o repositório
git clone <seu-repositorio>
cd whatsapp-api-scalable

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# Aplique as migrations no Supabase
# Veja: supabase/migrations/README.md

# Inicie o Redis (Docker)
docker run -d -p 6379:6379 redis:alpine

# Inicie a aplicação em modo dev
npm run start:dev
```

---

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
# Supabase
SUPABASE_URL=https://iagziighfidbjoxualkm.supabase.co
SUPABASE_ANON_KEY=seu-anon-key
SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=  # Opcional

# Application
PORT=3000
NODE_ENV=development

# WhatsApp
MAX_INSTANCES=80
STAGGERED_BOOT_DELAY_MS=500
MESSAGES_RETENTION_DAYS=7
```

---

## 🗄️ Migrations

As migrations SQL estão em `supabase/migrations/`.

### Aplicar Migrations

**Via Supabase Dashboard:**

1. Acesse: https://app.supabase.com
2. SQL Editor
3. Copie e execute cada arquivo `.sql` na ordem

**Via Supabase CLI:**

```bash
npm install -g supabase
supabase login
supabase link --project-ref iagziighfidbjoxualkm
supabase db push
```

Veja guia completo em: [`supabase/migrations/README.md`](./supabase/migrations/README.md)

---

## 🎮 Uso

### 1. Criar Instância

```bash
POST http://localhost:3000/instances/create
Content-Type: application/json

{
  "user_id": "uuid-do-usuario",
  "instance_name": "meu-whatsapp-001",
  "webhook_url": "https://n8n.exemplo.com/webhook/whatsapp"
}
```

**Resposta:**

```json
{
  "id": "uuid-da-instancia",
  "instance_name": "meu-whatsapp-001",
  "qr_code": "data:image/png;base64,iVBORw0KG...",
  "connection_status": "qr_pending"
}
```

### 2. Obter QR Code

```bash
GET http://localhost:3000/instances/{id}/qr
```

### 3. Enviar Mensagem

```bash
POST http://localhost:3000/instances/{id}/send
Content-Type: application/json

{
  "number": "5511999999999",
  "message": "Olá! Esta é uma mensagem de teste."
}
```

---

## 📁 Estrutura do Projeto

```
whatsapp-api-scalable/
├── src/
│   ├── config/              # Configurações (Supabase, Redis, App)
│   ├── modules/             # Módulos NestJS
│   │   ├── auth/            # Gerenciamento de sessões Baileys
│   │   ├── instance/        # Gerenciador de instâncias WhatsApp
│   │   ├── queue/           # Filas BullMQ (inbound/outbound)
│   │   └── webhook/         # Integração com n8n
│   ├── types/               # Tipos TypeScript
│   ├── app.module.ts        # Módulo raiz
│   └── main.ts              # Entry point
├── supabase/
│   └── migrations/          # Migrations SQL
├── .env                     # Variáveis de ambiente (não commitar!)
├── .env.example             # Template de variáveis
└── README.md                # Este arquivo
```

---

## 🌐 Endpoints API

### Instâncias

| Método   | Endpoint                 | Descrição                  |
| -------- | ------------------------ | -------------------------- |
| `POST`   | `/instances/create`      | Criar nova instância       |
| `GET`    | `/instances`             | Listar todas as instâncias |
| `GET`    | `/instances/:id`         | Detalhes de uma instância  |
| `GET`    | `/instances/:id/qr`      | Obter QR Code              |
| `POST`   | `/instances/:id/restart` | Reiniciar instância        |
| `DELETE` | `/instances/:id`         | Deletar instância          |

### Mensagens

| Método | Endpoint              | Descrição       |
| ------ | --------------------- | --------------- |
| `POST` | `/instances/:id/send` | Enviar mensagem |

### Health

| Método | Endpoint  | Descrição                 |
| ------ | --------- | ------------------------- |
| `GET`  | `/health` | Health check da aplicação |

---

## 🚀 Deployment

### Requisitos de Infra

Para **80 instâncias simultâneas**:

- **RAM**: Mínimo 8GB (idealmente 12GB)
  - Cada instância consome ~60MB
  - 80 instâncias × 60MB = ~4.8GB
  - - NestJS + Redis = ~8GB total
- **CPU**: 4 cores (mínimo)
- **Disco**: 20GB SSD

### Docker (Recomendado)

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main"]
```

### Variáveis de Produção

```env
NODE_ENV=production
REDIS_HOST=seu-redis-cloud.com
REDIS_PASSWORD=senha-do-redis
```

### Monitoramento

Recomendado:

- **Memory**: `pm2 monit` ou Grafana
- **Logs**: Winston + CloudWatch
- **APM**: New Relic ou Datadog

---

## 📚 Documentação Técnica

Para entender as decisões arquiteturais e padrões utilizados:

- **Regras de Documentação**: [`.agent/rules/whatsapp-api-explanation.md`](./.agent/rules/whatsapp-api-explanation.md)
- **Plano de Implementação**: Veja artifacts no projeto

---

## 🧪 Testes

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Teste manual de 1 instância
npm run start:dev
# Use Postman/Insomnia para testar endpoints
```

---

## 🔒 Segurança

⚠️ **IMPORTANTE:**

- **Nunca commite o `.env`** com credenciais reais
- Use **Service Role Key apenas no backend**
- Implemente **autenticação JWT** em produção
- Configure **rate limiting** nos endpoints públicos
- Valide **todos** os inputs com DTOs

---

## 📄 Licença

MIT

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit: `git commit -m 'feat: adiciona minha feature'`
4. Push: `git push origin feature/minha-feature`
5. Abra um Pull Request

---

## 📞 Suporte

Para dúvidas ou problemas, abra uma issue no GitHub.

---

**Última atualização:** 2026-02-14  
**Versão:** 1.0.0
