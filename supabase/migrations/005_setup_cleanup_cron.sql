-- ===================================
-- MIGRATION: Limpeza Automática de Mensagens
-- ===================================
-- Configura limpeza automática de mensagens antigas usando pg_cron
-- Retém apenas mensagens dos últimos 7 dias

-- Habilitar extensão pg_cron (execute APENAS se ainda não estiver habilitada)
-- No Supabase Dashboard: Database > Extensions > Search "pg_cron" > Enable
-- OU execute:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job de limpeza: roda todo dia à meia-noite (UTC)
SELECT cron.schedule(
    'cleanup-old-messages',                           -- Nome do job
    '0 0 * * *',                                      -- Cron expression: todo dia à 00:00
    $$
    DELETE FROM messages_log 
    WHERE created_at < NOW() - INTERVAL '7 days'
    $$
);

-- Para verificar se o job foi criado:
-- SELECT * FROM cron.job;

-- Para desabilitar temporariamente:
-- SELECT cron.unschedule('cleanup-old-messages');

-- Para reabilitar basta executar o SELECT cron.schedule novamente

COMMENT ON EXTENSION pg_cron IS 'Agendador de tarefas para limpeza automática de dados';
