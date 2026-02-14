/**
 * Configuração centralizada do Supabase
 *
 * Este módulo exporta o cliente configurado do Supabase
 * para ser usado em toda a aplicação.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// Validação de variáveis de ambiente obrigatórias
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env',
  );
}

/**
 * Cliente Supabase com Service Role Key
 *
 * ⚠️ ATENÇÃO: Service Role bypassa Row Level Security (RLS)
 * Use apenas no backend, NUNCA exponha no frontend
 */
export const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
