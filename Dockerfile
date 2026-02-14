# ==================================
# STAGE 1: Build
# ==================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo devDependencies para build)
RUN npm ci

# Copiar código fonte
COPY . .

# Build da aplicação TypeScript
RUN npm run build

# ==================================
# STAGE 2: Production
# ==================================
FROM node:20-alpine AS production

# Metadados da imagem
LABEL maintainer="seu-email@exemplo.com"
LABEL description="WhatsApp API Scalable - Suporta 80+ instâncias"

WORKDIR /app

# Instalar apenas dependências de produção
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist

# Copiar arquivos necessários
COPY --from=builder /app/supabase ./supabase

# Criar usuário não-root (segurança)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Mudar ownership dos arquivos
RUN chown -R nodejs:nodejs /app

# Trocar para usuário não-root
USER nodejs

# Expor porta da aplicação
EXPOSE 3000

# Healthcheck (Docker irá verificar se o container está saudável)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando para iniciar a aplicação
CMD ["node", "dist/main.js"]
