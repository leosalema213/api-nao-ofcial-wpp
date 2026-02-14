-- ===================================
-- MIGRATION: Tabela whatsapp_instances
-- ===================================
-- Esta tabela gerencia as instâncias do WhatsApp vinculadas aos usuários
-- Cada usuário pode ter 1 instância

CREATE TABLE IF NOT EXISTS whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Configuração da API
    api_url TEXT,  -- URL da API antiga (mantido para compatibilidade)
    api_key TEXT,  -- Key da API antiga (mantido para compatibilidade)
    instance_name TEXT NOT NULL UNIQUE,
    
    -- Webhook
    webhook_url TEXT NOT NULL,
    
    -- Status de conexão
    is_connected BOOLEAN NOT NULL DEFAULT false,
    connection_status TEXT NOT NULL DEFAULT 'disconnected',
    -- Possíveis valores: 'disconnected', 'connecting', 'connected', 'qr_pending', 'failed'
    
    -- QR Code (armazenado temporariamente)
    qr_code TEXT,
    qr_code_expires_at TIMESTAMPTZ,
    
    -- Telefone conectado
    owner_phone_number TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_connected_at TIMESTAMPTZ,
    
    -- Constraint: 1 instância por usuário
    CONSTRAINT one_instance_per_user UNIQUE (user_id)
);

-- Índices para otimização
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_user_id ON whatsapp_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_instance_name ON whatsapp_instances(instance_name);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_connection_status ON whatsapp_instances(connection_status);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON whatsapp_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comentários
COMMENT ON TABLE whatsapp_instances IS 'Gerencia as instâncias do WhatsApp para cada usuário';
COMMENT ON COLUMN whatsapp_instances.connection_status IS 'Status da conexão: disconnected, connecting, connected, qr_pending, failed';
COMMENT ON COLUMN whatsapp_instances.qr_code IS 'QR Code temporário para autenticação (expira em 60 segundos)';
COMMENT ON CONSTRAINT one_instance_per_user ON whatsapp_instances IS 'Cada usuário pode ter apenas 1 instância';
