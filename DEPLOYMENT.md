# 🐳 Guia de Deployment com Docker

## 📋 Pré-requisitos

- Docker Desktop instalado
- docker-compose instalado
- Acesso ao servidor de produção

---

## 🚀 Deployment Local (Desenvolvimento)

### 1. Iniciar com Docker Compose

```bash
# Subir Redis + API
docker-compose up -d

# Ver logs
docker-compose logs -f

# Ver logs apenas da API
docker-compose logs -f api

# Parar containers
docker-compose down

# Parar e remover volumes
docker-compose down -v
```

### 2. Testar Localmente

```bash
# Aguardar API iniciar (~10 segundos)
# Testar health check
curl http://localhost:3000/health

# Testar criação de instância
curl -X POST http://localhost:3000/instances/create \
  -H "Content-Type: application/json" \
  -d '{"user_id":"uuid","instance_name":"test","webhook_url":"https://test.com"}'
```

---

## 🏭 Deployment em Produção

### Opção 1: VPS/Servidor Dedicado

#### Passo 1: Preparar Servidor

```bash
# Conectar ao servidor
ssh user@seu-servidor.com

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verificar instalação
docker --version
docker-compose --version
```

#### Passo 2: Clonar Repositório

```bash
# Clonar projeto
git clone https://github.com/seu-usuario/whatsapp-api-scalable.git
cd whatsapp-api-scalable

# Criar .env de produção
cp .env.prod.example .env.prod
nano .env.prod  # Editar com credenciais reais
```

#### Passo 3: Build e Deploy

```bash
# Build da imagem
docker build -t whatsapp-api:latest .

# Subir em produção
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Verificar status
docker-compose -f docker-compose.prod.yml ps

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

### Opção 2: Deploy Automatizado com CI/CD

**GitHub Actions:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Build Docker Image
        run: docker build -t whatsapp-api:latest .

      - name: Push to Registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker tag whatsapp-api:latest seu-usuario/whatsapp-api:latest
          docker push seu-usuario/whatsapp-api:latest

      - name: Deploy to Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /app/whatsapp-api-scalable
            docker-compose -f docker-compose.prod.yml pull
            docker-compose -f docker-compose.prod.yml up -d
```

---

## 🔒 Configuração de Segurança

### 1. Firewall (UFW)

```bash
# Permitir apenas portas necessárias
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### 2. SSL/TLS com Let's Encrypt

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Gerar certificado
sudo certbot --nginx -d api.seudominio.com

# Renovação automática (já configurado)
sudo certbot renew --dry-run
```

---

## 📊 Monitoramento

### 1. Ver Status dos Containers

```bash
docker-compose -f docker-compose.prod.yml ps
```

### 2. Monitorar Uso de Recursos

```bash
# CPU e Memória em tempo real
docker stats

# Logs de um container específico
docker logs -f whatsapp-api-prod
```

### 3. Healthcheck Automático

Docker verifica automaticamente a saúde da aplicação:

```bash
# Ver status de health
docker inspect whatsapp-api-prod | grep Health -A 10
```

---

## 🔄 Atualização da Aplicação

### Sem Downtime (Rolling Update)

```bash
# 1. Build nova versão
docker build -t whatsapp-api:v2 .

# 2. Atualizar docker-compose.prod.yml
# Mudar image: whatsapp-api:latest para whatsapp-api:v2

# 3. Aplicar atualização
docker-compose -f docker-compose.prod.yml up -d

# Docker irá:
# - Criar novo container com v2
# - Aguardar healthcheck passar
# - Parar container antigo
```

---

## 🛠️ Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker-compose -f docker-compose.prod.yml logs --tail=100 api

# Ver erros específicos
docker logs whatsapp-api-prod 2>&1 | grep ERROR
```

### Alto uso de memória

```bash
# Ver consumo atual
docker stats whatsapp-api-prod

# Ajustar limites em docker-compose.prod.yml:
deploy:
  resources:
    limits:
      memory: 10G  # Reduzir se necessário
```

### Redis não conecta

```bash
# Testar conexão Redis
docker exec -it whatsapp-redis redis-cli ping

# Com senha
docker exec -it whatsapp-redis-prod redis-cli -a SUA_SENHA ping
```

---

## 📈 Escalabilidade Horizontal

### Múltiplos Servidores (Load Balancing)

**Servidor 1:**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Servidor 2:**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

**Load Balancer (NGINX):**

```nginx
upstream whatsapp_api {
    server servidor1.com:3000;
    server servidor2.com:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://whatsapp_api;
    }
}
```

---

## 🗄️ Backup

### Backup Redis

```bash
# Criar backup manualmente
docker exec whatsapp-redis-prod redis-cli --no-auth-warning -a SENHA SAVE

# Copiar arquivo de backup
docker cp whatsapp-redis-prod:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb
```

### Backup Automatizado

```bash
# Adicionar ao crontab
0 2 * * * docker exec whatsapp-redis-prod redis-cli SAVE && docker cp whatsapp-redis-prod:/data/dump.rdb /backups/redis-$(date +\%Y\%m\%d).rdb
```

---

## 📚 Comandos Úteis

```bash
# Rebuildar sem cache
docker-compose build --no-cache

# Remover imagens antigas
docker image prune -a

# Ver uso de disco
docker system df

# Limpar tudo (CUIDADO!)
docker system prune -a --volumes

# Reiniciar apenas um serviço
docker-compose -f docker-compose.prod.yml restart api

# Escalar horizontalmente (múltiplas réplicas)
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

---

## 🎯 Checklist de Produção

- [ ] Servidor com recursos adequados (8GB+ RAM)
- [ ] Docker e docker-compose instalados
- [ ] Variáveis de ambiente configuradas (.env.prod)
- [ ] Migrations aplicadas no Supabase
- [ ] Firewall configurado (UFW)
- [ ] SSL/TLS configurado (Let's Encrypt)
- [ ] Healthchecks funcionando
- [ ] Backup automático configurado
- [ ] Monitoramento ativo
- [ ] Logs sendo salvos

---

**Última atualização:** 2026-02-14
