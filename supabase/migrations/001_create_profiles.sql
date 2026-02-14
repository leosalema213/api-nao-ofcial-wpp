-- ===================================
-- MIGRATION: Tabela profiles
-- ===================================
-- Esta tabela armazena informações estendidas dos usuários
-- O ID é linkado com auth.users do Supabase Auth

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    password TEXT,  -- Opcional (caso use autenticação customizada)
    email TEXT NOT NULL UNIQUE,
    nome_completo TEXT NOT NULL,
    whatsapp TEXT,
    status TEXT NOT NULL DEFAULT 'ativo',
    user_token UUID UNIQUE DEFAULT gen_random_uuid(),
    company_id UUID,
    creci_number TEXT,
    department TEXT,
    employee_role_id UUID
);

-- Índices para otimização de queries
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_user_token ON profiles(user_token);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comentários explicativos
COMMENT ON TABLE profiles IS 'Armazena dados estendidos dos usuários';
COMMENT ON COLUMN profiles.id IS 'UUID do usuário (referencia auth.users)';
COMMENT ON COLUMN profiles.user_token IS 'Token único do usuário para integrações';
