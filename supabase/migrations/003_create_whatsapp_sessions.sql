-- ===================================
-- MIGRATION: Tabela whatsapp_sessions
-- ===================================
-- Esta tabela armazena o estado de autenticação do Baileys
-- Substitui o sistema de arquivos para tornar a aplicação stateless

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id TEXT PRIMARY KEY,  -- instance_name da whatsapp_instances
    
    -- Credenciais do Baileys (estrutura binária serializada em JSON)
    creds JSONB,
    
    -- Chaves de criptografia (mudam constantemente)
    keys JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para otimização de queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_updated_at ON whatsapp_sessions(updated_at);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_whatsapp_sessions_updated_at BEFORE UPDATE ON whatsapp_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comentários
COMMENT ON TABLE whatsapp_sessions IS 'Armazena estado de autenticação do Baileys no banco (substitui arquivos)';
COMMENT ON COLUMN whatsapp_sessions.id IS 'ID da instância (mesmo valor de whatsapp_instances.instance_name)';
COMMENT ON COLUMN whatsapp_sessions.creds IS 'Credenciais fixas do Baileys (serializado com BufferJSON)';
COMMENT ON COLUMN whatsapp_sessions.keys IS 'Chaves de criptografia que mudam constantemente (serializado com BufferJSON)';

-- IMPORTANTE: Como o Baileys faz muitas atualizações nas keys, 
-- monitore a performance desta tabela em produção.
-- Para 80+ instâncias, considere:
-- 1. Usar particionamento por range de ID se necessário
-- 2. Implementar debounce nos updates para reduzir I/O
