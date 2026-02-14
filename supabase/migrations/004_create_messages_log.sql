-- ===================================
-- MIGRATION: Tabela messages_log
-- ===================================
-- Armazena mensagens recebidas e enviadas por 7 dias
-- Usado para histórico recente e função getMessage do Baileys

CREATE TABLE IF NOT EXISTS messages_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação da instância
    instance_id TEXT NOT NULL,
    
    -- Dados da mensagem (formato Baileys)
    remote_jid TEXT NOT NULL,  -- ID do chat (número@s.whatsapp.net ou grupo@g.us)
    message_id TEXT NOT NULL,  -- ID único da mensagem
    
    -- Conteúdo
    content JSONB NOT NULL,  -- Mensagem completa serializada (Baileys message object)
    message_type TEXT,  -- Ex: 'text', 'image', 'video', 'document', etc
    from_me BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint: message_id único por instância
    CONSTRAINT unique_message_per_instance UNIQUE (instance_id, message_id)
);

-- Índices críticos para performance
CREATE INDEX IF NOT EXISTS idx_messages_log_instance_id ON messages_log(instance_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_created_at ON messages_log(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_log_remote_jid ON messages_log(remote_jid);
CREATE INDEX IF NOT EXISTS idx_messages_log_message_id ON messages_log(instance_id, message_id);

-- Comentários
COMMENT ON TABLE messages_log IS 'Log de mensagens com retenção de 7 dias';
COMMENT ON COLUMN messages_log.remote_jid IS 'ID do destinatário/remetente (formato WhatsApp JID)';
COMMENT ON COLUMN messages_log.content IS 'Objeto completo da mensagem do Baileys';
COMMENT ON COLUMN messages_log.from_me IS 'true = mensagem enviada, false = mensagem recebida';
