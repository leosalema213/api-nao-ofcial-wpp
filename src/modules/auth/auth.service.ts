/**
 * AuthService - Gerenciamento de Sessões Baileys no Supabase
 *
 * Converte o mecanismo de arquivos do Baileys em queries Supabase,
 * permitindo arquitetura stateless (sessões sobrevivem a restarts).
 *
 * FUNDAMENTO: O Baileys usa `useMultiFileAuthState()` que lê/escreve arquivos.
 * Este service substitui isso por `getAuthState()` que usa Supabase como storage.
 *
 * Serialização: BufferJSON.replacer/reviver (converte Buffers ↔ JSON)
 * Debounce: Escritas de keys agrupadas em janelas de 500ms para reduzir I/O
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  AuthenticationCreds,
  SignalDataTypeMap,
  initAuthCreds,
  proto,
  BufferJSON,
} from '@whiskeysockets/baileys';
import { supabase } from '../../config/supabase.config';

/** Tipo retornado por getAuthState() */
export interface SupabaseAuthState {
  state: {
    creds: AuthenticationCreds;
    keys: {
      get: <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ) => Promise<{ [id: string]: SignalDataTypeMap[T] }>;
      set: (data: {
        [T in keyof SignalDataTypeMap]?: {
          [id: string]: SignalDataTypeMap[T] | null;
        };
      }) => Promise<void>;
    };
  };
  saveCreds: () => Promise<void>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Debounce timers por instância */
  private keyWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Buffer de keys pendentes por instância */
  private pendingKeyWrites = new Map<string, Record<string, unknown>>();

  /**
   * Obtém ou cria estado de autenticação para uma instância
   *
   * @param instanceName - Nome único da instância (usado como ID na tabela)
   * @returns { state, saveCreds } compatível com makeWASocket()
   *
   * Uso:
   * ```ts
   * const { state, saveCreds } = await authService.getAuthState('minha-instancia');
   * const sock = makeWASocket({ auth: state });
   * sock.ev.on('creds.update', saveCreds);
   * ```
   */
  async getAuthState(instanceName: string): Promise<SupabaseAuthState> {
    // 1. Carregar sessão existente ou criar nova
    let creds: AuthenticationCreds;
    let existingKeys: Record<string, unknown> = {};

    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('creds, keys')
      .eq('id', instanceName)
      .single();

    if (session?.creds) {
      creds = JSON.parse(
        JSON.stringify(session.creds),
        BufferJSON.reviver,
      ) as AuthenticationCreds;
      this.logger.log(`Sessão carregada para: ${instanceName}`);
    } else {
      creds = initAuthCreds();
      this.logger.log(`Nova sessão criada para: ${instanceName}`);
    }

    if (session?.keys) {
      existingKeys = session.keys as Record<string, unknown>;
    }

    // 2. Implementar key store
    const keys = {
      get: <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};

        for (const id of ids) {
          const compositeKey = `${type}-${id}`;
          const rawValue = existingKeys[compositeKey];

          if (rawValue) {
            try {
              const parsed: unknown = JSON.parse(
                JSON.stringify(rawValue),
                BufferJSON.reviver,
              );

              // AppStateSyncKeyData precisa de fromObject
              if (
                type === 'app-state-sync-key' &&
                parsed !== null &&
                typeof parsed === 'object'
              ) {
                result[id] = proto.Message.AppStateSyncKeyData.fromObject(
                  parsed as Record<string, unknown>,
                ) as unknown as SignalDataTypeMap[T];
              } else {
                result[id] = parsed as SignalDataTypeMap[T];
              }
            } catch {
              this.logger.warn(
                `Erro ao deserializar key ${compositeKey} para ${instanceName}`,
              );
            }
          }
        }

        return Promise.resolve(result);
      },

      set: (data: {
        [T in keyof SignalDataTypeMap]?: {
          [id: string]: SignalDataTypeMap[T] | null;
        };
      }): Promise<void> => {
        // Acumular escritas no buffer em memória
        for (const [type, entries] of Object.entries(data)) {
          if (!entries) continue;

          for (const [id, value] of Object.entries(
            entries as Record<string, unknown>,
          )) {
            const compositeKey = `${type}-${id}`;

            if (value === null) {
              delete existingKeys[compositeKey];
            } else {
              // Serializar com BufferJSON para persistência
              existingKeys[compositeKey] = JSON.parse(
                JSON.stringify(value, BufferJSON.replacer),
              ) as unknown;
            }
          }
        }

        // Debounce: agrupar escritas em janelas de 500ms
        this.debouncedKeyWrite(instanceName, existingKeys);
        return Promise.resolve();
      },
    };

    // 3. Função para salvar credenciais
    const saveCreds = async (): Promise<void> => {
      const serializedCreds: unknown = JSON.parse(
        JSON.stringify(creds, BufferJSON.replacer),
      );

      const { error } = await supabase.from('whatsapp_sessions').upsert(
        {
          id: instanceName,
          creds: serializedCreds as Record<string, unknown>,
          keys: existingKeys,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );

      if (error) {
        this.logger.error(
          `Erro ao salvar creds para ${instanceName}: ${error.message}`,
        );
        throw error;
      }

      this.logger.debug(`Creds salvos para: ${instanceName}`);
    };

    return { state: { creds, keys }, saveCreds };
  }

  /**
   * Debounce de escritas de keys no Supabase
   *
   * Evita salvar a cada key individual (Baileys faz muitas escritas seguidas).
   * Agrupa em janelas de 500ms.
   */
  private debouncedKeyWrite(
    instanceName: string,
    keys: Record<string, unknown>,
  ): void {
    // Cancelar timer anterior
    const existingTimer = this.keyWriteTimers.get(instanceName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Guardar referência das keys
    this.pendingKeyWrites.set(instanceName, keys);

    // Criar novo timer
    const timer = setTimeout(() => {
      const pendingKeys = this.pendingKeyWrites.get(instanceName);
      if (!pendingKeys) return;

      void (async () => {
        try {
          const { error } = await supabase
            .from('whatsapp_sessions')
            .update({
              keys: pendingKeys,
              updated_at: new Date().toISOString(),
            })
            .eq('id', instanceName);

          if (error) {
            this.logger.error(
              `Erro ao salvar keys para ${instanceName}: ${error.message}`,
            );
          } else {
            this.logger.debug(`Keys salvos para: ${instanceName}`);
          }
        } catch (err: unknown) {
          this.logger.error(`Exceção ao salvar keys para ${instanceName}`, err);
        } finally {
          this.pendingKeyWrites.delete(instanceName);
          this.keyWriteTimers.delete(instanceName);
        }
      })();
    }, 500);

    this.keyWriteTimers.set(instanceName, timer);
  }

  /**
   * Verifica se uma sessão existe no Supabase
   */
  async sessionExists(instanceName: string): Promise<boolean> {
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('id', instanceName)
      .single();

    return !!data;
  }

  /**
   * Remove uma sessão do Supabase
   */
  async removeSession(instanceName: string): Promise<void> {
    // Cancelar timers pendentes
    const timer = this.keyWriteTimers.get(instanceName);
    if (timer) {
      clearTimeout(timer);
      this.keyWriteTimers.delete(instanceName);
    }
    this.pendingKeyWrites.delete(instanceName);

    const { error } = await supabase
      .from('whatsapp_sessions')
      .delete()
      .eq('id', instanceName);

    if (error) {
      this.logger.error(
        `Erro ao remover sessão ${instanceName}: ${error.message}`,
      );
      throw error;
    }

    this.logger.log(`Sessão removida: ${instanceName}`);
  }

  /**
   * Lista todas as sessões existentes
   */
  async listSessions(): Promise<
    { id: string; created_at: string; updated_at: string }[]
  > {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('id, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Erro ao listar sessões: ${error.message}`);
      throw error;
    }

    return data ?? [];
  }

  /**
   * Flush de todas as escritas pendentes (usado no shutdown gracioso)
   */
  async flushPendingWrites(): Promise<void> {
    const flushOps: Promise<void>[] = [];

    for (const [instanceName, keys] of this.pendingKeyWrites.entries()) {
      const timer = this.keyWriteTimers.get(instanceName);
      if (timer) clearTimeout(timer);

      const op = (async () => {
        const { error } = await supabase
          .from('whatsapp_sessions')
          .update({
            keys,
            updated_at: new Date().toISOString(),
          })
          .eq('id', instanceName);

        if (error) {
          this.logger.error(
            `Erro ao flush keys para ${instanceName}: ${error.message}`,
          );
        }
      })();

      flushOps.push(op);
    }

    await Promise.all(flushOps);
    this.pendingKeyWrites.clear();
    this.keyWriteTimers.clear();
    this.logger.log('Flush de escritas pendentes concluído');
  }
}
