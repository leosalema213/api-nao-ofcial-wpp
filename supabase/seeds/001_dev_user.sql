-- ===================================
-- SEED: Usuário de Teste
-- ===================================
-- Cria um usuário de teste para desenvolvimento local.
-- UUID fixo para facilitar uso em testes via Swagger.
--
-- COMO USAR:
-- 1. Execute no SQL Editor do Supabase Dashboard
-- 2. Use o UUID abaixo no POST /instances/create
--
-- UUID: 00000000-0000-0000-0000-000000000001
-- Email: dev@teste.local
-- ===================================

-- 1. Criar usuário no auth.users (necessário para FK em profiles)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'dev@teste.local',
  crypt('senha123', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"nome_completo":"Dev Teste"}',
  'authenticated',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- 2. Criar perfil na tabela profiles
INSERT INTO profiles (
  id,
  email,
  nome_completo,
  role,
  status,
  whatsapp
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev@teste.local',
  'Dev Teste',
  'admin',
  'ativo',
  '5511999999999'
) ON CONFLICT (id) DO NOTHING;

-- Verificação
SELECT id, email, nome_completo, role, status FROM profiles
WHERE id = '00000000-0000-0000-0000-000000000001';
