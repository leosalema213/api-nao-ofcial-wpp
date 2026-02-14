/**
 * Tipos TypeScript para o domínio WhatsApp
 *
 * Estes tipos correspondem às tabelas do Supabase
 * e são usados em toda a aplicação.
 */

/**
 * Perfil do usuário (tabela profiles)
 */
export interface Profile {
  id: string; // UUID
  role: string;
  created_at: string;
  updated_at: string;
  password?: string | null;
  email: string;
  nome_completo: string;
  whatsapp?: string | null;
  status: 'ativo' | 'inativo';
  user_token: string; // UUID
  company_id?: string | null;
  creci_number?: string | null;
  department?: string | null;
  employee_role_id?: string | null;
}

/**
 * Status de conexão da instância WhatsApp
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'qr_pending'
  | 'failed';

/**
 * Instância do WhatsApp (tabela whatsapp_instances)
 */
export interface WhatsAppInstance {
  id: string; // UUID
  user_id: string; // UUID (FK para profiles)
  api_url?: string | null;
  api_key?: string | null;
  instance_name: string;
  webhook_url: string;
  is_connected: boolean;
  connection_status: ConnectionStatus;
  qr_code?: string | null;
  qr_code_expires_at?: string | null;
  owner_phone_number?: string | null;
  created_at: string;
  updated_at: string;
  last_connected_at?: string | null;
}

/**
 * Sessão do Baileys (tabela whatsapp_sessions)
 *
 * ⚠️ IMPORTANTE: creds e keys são serializados com BufferJSON
 */
export interface WhatsAppSession {
  id: string; // instance_name
  creds: any; // JSONB - Credenciais do Baileys
  keys: any; // JSONB - Chaves de criptografia
  created_at: string;
  updated_at: string;
}

/**
 * Tipo de mensagem
 */
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'other';

/**
 * Log de mensagem (tabela messages_log)
 */
export interface MessageLog {
  id: string; // UUID
  instance_id: string;
  remote_jid: string; // Ex: 5511999999999@s.whatsapp.net
  message_id: string;
  content: any; // JSONB - Objeto completo da mensagem Baileys
  message_type?: MessageType | null;
  from_me: boolean;
  created_at: string;
}
