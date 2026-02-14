# 📚 Guia de Aplicação das Migrations

Este guia explica como aplicar as migrations no Supabase.

## 🎯 Ordem de Execução

As migrations devem ser executadas na ordem numérica:

1. **001_create_profiles.sql** - Tabela de usuários
2. **002_create_whatsapp_instances.sql** - Tabela de instâncias do WhatsApp
3. **003_create_whatsapp_sessions.sql** - Armazenamento de sessões Baileys
4. **004_create_messages_log.sql** - Log de mensagens
5. **005_setup_cleanup_cron.sql** - Agendamento de limpeza

## 📝 Método 1: Via Supabase Dashboard (Recomendado)

1. Acesse: https://app.supabase.com
2. Selecione seu projeto: `iagziighfidbjoxualkm`
3. Navegue até: **SQL Editor** (menu lateral)
4. Para cada arquivo `.sql` na pasta `supabase/migrations/`:
   - Clique em **New Query**
   - Copie e cole o conteúdo do arquivo
   - Clique em **Run** (ou `Ctrl + Enter`)
   - Aguarde confirmação de sucesso

## 📝 Método 2: Via Supabase CLI (Avançado)

```bash
# Instalar Supabase CLI globally
npm install -g supabase

# Fazer login
supabase login

# Linkar ao projeto
supabase link --project-ref iagziighfidbjoxualkm

# Aplicar todas as migrations
supabase db push
```

## ⚠️ Importante: pg_cron Extension

Para a migration **005_setup_cleanup_cron.sql** funcionar, você precisa habilitar a extensão `pg_cron`:

1. No Supabase Dashboard, vá em: **Database** > **Extensions**
2. Procure por `pg_cron`
3. Clique em **Enable**
4. Depois execute a migration 005

## ✅ Verificação

Após aplicar todas as migrations, verifique se as tabelas foram criadas:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'profiles',
    'whatsapp_instances',
    'whatsapp_sessions',
    'messages_log'
);
```

Deve retornar 4 linhas.

## 🔄 Aplicar em Outro Projeto

Para aplicar no projeto principal:

1. Copie todos os arquivos da pasta `supabase/migrations/`
2. Execute no novo projeto seguindo os mesmos passos acima
3. Atualize as variáveis de ambiente no `.env` com as credenciais do novo projeto
