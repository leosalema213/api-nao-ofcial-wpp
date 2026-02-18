/**
 * InstanceService - Gerenciador de Instâncias WhatsApp
 *
 * Mantém conexões Baileys em memória (Map<string, WASocket>),
 * gerencia o ciclo de vida: criar → conectar → QR → autenticar → reconectar.
 *
 * FUNDAMENTO:
 * - Cada instância é um WASocket independente
 * - Estado de autenticação persistido via AuthService (Supabase)
 * - QR codes gerados via lib `qrcode` e armazenados em memória
 * - Auto-reconexão quando desconectado (exceto logout explícito 401)
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import { supabase } from '../../config/supabase.config';
import { AuthService } from '../auth/auth.service';
import { CreateInstanceDto } from './dto/create-instance.dto';
import { WhatsAppInstance, ConnectionStatus } from '../../types/whatsapp.types';
import { config } from '../../config/app.config';
import pino from 'pino';

@Injectable()
export class InstanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InstanceService.name);

  /** Sockets ativos em memória */
  private sockets = new Map<string, WASocket>();

  /** QR codes pendentes (instanceId → base64 PNG) */
  private qrCodes = new Map<string, string>();

  /** Flags de reconexão (evitar loops) */
  private reconnecting = new Set<string>();

  /** Concorrência de boot (instâncias por lote) */
  private readonly BOOT_BATCH_SIZE = 5;

  // ===== FIX 1: Semáforo de reconexão =====
  /** Limita reconexões simultâneas para evitar pico de CPU/memória */
  private activeReconnections = 0;
  private readonly MAX_CONCURRENT_RECONNECTIONS = 5;

  // ===== FIX 2: Limite de retentativas =====
  /** Contador de retentativas por instância */
  private reconnectAttempts = new Map<string, number>();
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  // ===== FIX 3: Cache da versão do Baileys =====
  /** Evita HTTP request externo a cada conexão */
  private cachedVersion: {
    version: [number, number, number];
    expires: number;
  } | null = null;
  private readonly VERSION_CACHE_TTL = 60 * 60 * 1000; // 1 hora

  constructor(private readonly authService: AuthService) {}

  /**
   * Boot Recovery — reconecta instâncias ativas ao iniciar o servidor
   *
   * ESTRATÉGIA ESCALÁVEL:
   * - Busca instâncias com status 'connected' ou 'connecting' no banco
   * - Reconecta em lotes de BOOT_BATCH_SIZE (5) para não estourar CPU/memória
   * - Delay de staggeredBootDelayMs (500ms) entre cada lote
   * - Respeita maxInstances para não exceder o limite
   */
  async onModuleInit(): Promise<void> {
    const activeResult = await supabase
      .from('whatsapp_instances')
      .select('id, instance_name, connection_status')
      .in('connection_status', ['connected', 'connecting', 'qr_pending'])
      .order('last_connected_at', { ascending: true })
      .limit(config.maxInstances);

    const instances = (activeResult.data ??
      []) as unknown as WhatsAppInstance[];

    if (instances.length === 0) {
      this.logger.log('Boot Recovery: nenhuma instância ativa para reconectar');
      return;
    }

    this.logger.log(
      `Boot Recovery: reconectando ${instances.length} instância(s) ` +
        `em lotes de ${this.BOOT_BATCH_SIZE} com ${config.staggeredBootDelayMs}ms de delay`,
    );

    // Processar em lotes
    for (let i = 0; i < instances.length; i += this.BOOT_BATCH_SIZE) {
      const batch = instances.slice(i, i + this.BOOT_BATCH_SIZE);
      const batchNum = Math.floor(i / this.BOOT_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(instances.length / this.BOOT_BATCH_SIZE);

      this.logger.log(
        `Boot Recovery: lote ${batchNum}/${totalBatches} ` +
          `(${batch.map((inst) => inst.instance_name).join(', ')})`,
      );

      // Conectar lote em paralelo
      await Promise.allSettled(
        batch.map((inst) =>
          this.connectInstance(inst.id, inst.instance_name).catch((err) => {
            this.logger.error(
              `Boot Recovery: falha ao reconectar ${inst.instance_name}: ${String(err)}`,
            );
          }),
        ),
      );

      // Delay entre lotes (exceto no último)
      if (i + this.BOOT_BATCH_SIZE < instances.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.staggeredBootDelayMs),
        );
      }
    }

    this.logger.log(
      `Boot Recovery: ${instances.length} instância(s) reconectadas ✅`,
    );
  }

  /**
   * Cria uma nova instância WhatsApp e inicia a conexão
   */
  async createInstance(dto: CreateInstanceDto): Promise<WhatsAppInstance> {
    // FIX 4: Verificar limite de instâncias
    if (this.sockets.size >= config.maxInstances) {
      throw new ConflictException(
        `Limite de ${config.maxInstances} instâncias atingido`,
      );
    }

    // 1. Verificar se instance_name já existe
    const existingResult = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', dto.instance_name)
      .single();

    if (existingResult.data) {
      throw new ConflictException(`Instância '${dto.instance_name}' já existe`);
    }

    // 2. Criar registro no Supabase
    const insertResult = await supabase
      .from('whatsapp_instances')
      .insert({
        user_id: dto.user_id,
        instance_name: dto.instance_name,
        webhook_url: dto.webhook_url,
        connection_status: 'disconnected' as ConnectionStatus,
        is_connected: false,
      })
      .select()
      .single();

    if (insertResult.error || !insertResult.data) {
      this.logger.error(
        `Erro ao criar instância: ${insertResult.error?.message}`,
      );
      throw new Error(
        `Erro ao criar instância: ${insertResult.error?.message}`,
      );
    }

    const instance = insertResult.data as unknown as WhatsAppInstance;

    this.logger.log(`Instância criada: ${dto.instance_name} (${instance.id})`);

    // 3. Iniciar conexão Baileys
    await this.connectInstance(instance.id, dto.instance_name);

    return instance;
  }

  /**
   * Inicia conexão Baileys para uma instância
   */
  async connectInstance(
    instanceId: string,
    instanceName: string,
  ): Promise<void> {
    // Se já tem socket ativo, desconectar primeiro
    const existingSocket = this.sockets.get(instanceId);
    if (existingSocket) {
      existingSocket.end(undefined);
      this.sockets.delete(instanceId);
    }

    // Atualizar status para "connecting"
    await this.updateConnectionStatus(instanceId, 'connecting');

    // Obter auth state do Supabase via AuthService
    const { state, saveCreds } =
      await this.authService.getAuthState(instanceName);

    // FIX 3: Usar versão em cache
    const version = await this.getCachedBaileysVersion();

    // Criar socket Baileys
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }) as never, // Silenciar logs do Baileys
      browser: ['WhatsApp API', 'Chrome', '4.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    this.sockets.set(instanceId, sock);

    // Escutar eventos de conexão
    sock.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(instanceId, instanceName, update);
    });

    // Escutar atualizações de credenciais
    sock.ev.on('creds.update', () => {
      void saveCreds();
    });

    this.logger.log(`Conexão iniciada para: ${instanceName} (${instanceId})`);
  }

  /**
   * Trata eventos de atualização de conexão do Baileys
   */
  private async handleConnectionUpdate(
    instanceId: string,
    instanceName: string,
    update: Partial<ConnectionState>,
  ): Promise<void> {
    const { connection, lastDisconnect, qr } = update;

    // QR Code recebido
    if (qr) {
      this.logger.log(`QR Code gerado para: ${instanceName}`);

      try {
        // Converter para base64 PNG
        const qrBase64 = await QRCode.toDataURL(qr, {
          type: 'image/png',
          width: 300,
          margin: 2,
        });

        // Armazenar em memória
        this.qrCodes.set(instanceId, qrBase64);

        // Atualizar no banco (status + qr_code)
        await supabase
          .from('whatsapp_instances')
          .update({
            connection_status: 'qr_pending' as ConnectionStatus,
            qr_code: qrBase64,
            qr_code_expires_at: new Date(Date.now() + 60 * 1000).toISOString(), // 60s
          })
          .eq('id', instanceId);
      } catch (err) {
        this.logger.error(`Erro ao gerar QR code: ${String(err)}`);
      }
    }

    // Conexão aberta (autenticado com sucesso)
    if (connection === 'open') {
      this.logger.log(`✅ Conectado: ${instanceName}`);

      // Limpar QR code e contadores
      this.qrCodes.delete(instanceId);
      this.reconnecting.delete(instanceId);
      this.reconnectAttempts.delete(instanceId); // FIX 2: Reset retentativas

      // Obter número do telefone
      const sock = this.sockets.get(instanceId);
      const phoneNumber = sock?.user?.id?.split(':')[0] ?? null;

      await supabase
        .from('whatsapp_instances')
        .update({
          connection_status: 'connected' as ConnectionStatus,
          is_connected: true,
          qr_code: null,
          qr_code_expires_at: null,
          owner_phone_number: phoneNumber,
          last_connected_at: new Date().toISOString(),
        })
        .eq('id', instanceId);
    }

    // Conexão fechada
    if (connection === 'close') {
      const boom = lastDisconnect?.error as Boom | undefined;
      const statusCode = boom?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      this.logger.warn(
        `Desconectado: ${instanceName} (code: ${statusCode ?? 'unknown'})`,
      );

      // Limpar socket
      this.sockets.delete(instanceId);
      this.qrCodes.delete(instanceId);

      if (shouldReconnect && !this.reconnecting.has(instanceId)) {
        // FIX 2: Verificar limite de retentativas
        const attempts = (this.reconnectAttempts.get(instanceId) ?? 0) + 1;
        this.reconnectAttempts.set(instanceId, attempts);

        if (attempts > this.MAX_RECONNECT_ATTEMPTS) {
          this.logger.error(
            `❌ ${instanceName}: ${this.MAX_RECONNECT_ATTEMPTS} tentativas esgotadas — marcando como 'failed'`,
          );
          this.reconnectAttempts.delete(instanceId);
          await this.updateConnectionStatus(
            instanceId,
            'failed' as ConnectionStatus,
          );
          return;
        }

        this.reconnecting.add(instanceId);
        this.logger.log(
          `🔄 Reconectando: ${instanceName} (tentativa ${attempts}/${this.MAX_RECONNECT_ATTEMPTS})...`,
        );

        await this.updateConnectionStatus(instanceId, 'connecting');

        // FIX 1: Usar semáforo com jitter em vez de setTimeout direto
        void this.enqueueReconnection(instanceId, instanceName);
      } else {
        // Logout explícito (401) — não reconectar
        this.logger.log(`🚫 Logout: ${instanceName} — sessão removida`);
        this.reconnecting.delete(instanceId);
        this.reconnectAttempts.delete(instanceId);

        await supabase
          .from('whatsapp_instances')
          .update({
            connection_status: 'disconnected' as ConnectionStatus,
            is_connected: false,
            qr_code: null,
            qr_code_expires_at: null,
            owner_phone_number: null,
          })
          .eq('id', instanceId);

        // Remover sessão do Supabase (forçar novo QR na próxima conexão)
        await this.authService.removeSession(instanceName);
      }
    }
  }

  /**
   * Retorna o QR Code base64 de uma instância
   */
  async getQrCode(
    instanceId: string,
  ): Promise<{ qr_code: string | null; connection_status: ConnectionStatus }> {
    // Tentar memória primeiro (mais rápido)
    const memoryQr = this.qrCodes.get(instanceId);
    if (memoryQr) {
      return { qr_code: memoryQr, connection_status: 'qr_pending' };
    }

    // Fallback: buscar do banco
    const qrResult = await supabase
      .from('whatsapp_instances')
      .select('qr_code, connection_status')
      .eq('id', instanceId)
      .single();

    if (!qrResult.data) {
      throw new NotFoundException('Instância não encontrada');
    }

    const qrData = qrResult.data as unknown as {
      qr_code: string | null;
      connection_status: ConnectionStatus;
    };

    return {
      qr_code: qrData.qr_code,
      connection_status: qrData.connection_status,
    };
  }

  /**
   * Busca uma instância por ID
   */
  async getInstance(instanceId: string): Promise<WhatsAppInstance> {
    const result = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .single();

    if (result.error || !result.data) {
      throw new NotFoundException('Instância não encontrada');
    }

    return result.data as unknown as WhatsAppInstance;
  }

  /**
   * Lista todas as instâncias
   */
  async listInstances(): Promise<WhatsAppInstance[]> {
    const { data: rawData, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Erro ao listar instâncias: ${error.message}`);
      throw error;
    }

    return (rawData ?? []) as unknown as WhatsAppInstance[];
  }

  /**
   * Reinicia uma instância (desconecta e reconecta)
   */
  async restartInstance(instanceId: string): Promise<void> {
    const instance = await this.getInstance(instanceId);

    // Desconectar socket atual
    const sock = this.sockets.get(instanceId);
    if (sock) {
      sock.end(undefined);
      this.sockets.delete(instanceId);
    }

    this.qrCodes.delete(instanceId);
    this.reconnecting.delete(instanceId);

    // Reconectar
    await this.connectInstance(instanceId, instance.instance_name);
  }

  /**
   * Deleta uma instância (desconecta + remove do banco)
   */
  async deleteInstance(instanceId: string): Promise<void> {
    const instance = await this.getInstance(instanceId);

    // Desconectar socket
    const sock = this.sockets.get(instanceId);
    if (sock) {
      sock.end(undefined);
      this.sockets.delete(instanceId);
    }

    this.qrCodes.delete(instanceId);
    this.reconnecting.delete(instanceId);

    // Remover sessão do Supabase
    await this.authService.removeSession(instance.instance_name);

    // Remover instância do banco
    const { error } = await supabase
      .from('whatsapp_instances')
      .delete()
      .eq('id', instanceId);

    if (error) {
      this.logger.error(`Erro ao deletar instância: ${error.message}`);
      throw error;
    }

    this.logger.log(
      `Instância deletada: ${instance.instance_name} (${instanceId})`,
    );
  }

  /**
   * Atualiza o status de conexão no banco
   */
  private async updateConnectionStatus(
    instanceId: string,
    status: ConnectionStatus,
  ): Promise<void> {
    await supabase
      .from('whatsapp_instances')
      .update({
        connection_status: status,
        is_connected: status === 'connected',
      })
      .eq('id', instanceId);
  }

  // ===== FIX 3: Cache da versão do Baileys =====
  /**
   * Retorna a versão do Baileys cacheada (1h TTL)
   * Evita HTTP externo a cada conexão
   */
  private async getCachedBaileysVersion(): Promise<[number, number, number]> {
    if (this.cachedVersion && Date.now() < this.cachedVersion.expires) {
      return this.cachedVersion.version;
    }

    const { version } = await fetchLatestBaileysVersion();
    this.cachedVersion = {
      version,
      expires: Date.now() + this.VERSION_CACHE_TTL,
    };
    this.logger.debug(`Baileys version cached: ${version.join('.')}`);
    return version;
  }

  // ===== FIX 1: Semáforo de reconexão =====
  /**
   * Enfileira reconexão com semáforo de concorrência.
   * Máx MAX_CONCURRENT_RECONNECTIONS simultâneas + jitter aleatório.
   */
  private async enqueueReconnection(
    instanceId: string,
    instanceName: string,
  ): Promise<void> {
    // Esperar slot disponível
    while (this.activeReconnections >= this.MAX_CONCURRENT_RECONNECTIONS) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Jitter aleatório: 1s a 5s (evita todas reconectando no mesmo instante)
    const jitter = 1000 + Math.random() * 4000;
    await new Promise((resolve) => setTimeout(resolve, jitter));

    this.activeReconnections++;
    try {
      await this.connectInstance(instanceId, instanceName);
    } catch (err) {
      this.logger.error(`Falha ao reconectar ${instanceName}: ${String(err)}`);
    } finally {
      this.activeReconnections--;
    }
  }

  /**
   * FIX 5: Shutdown gracioso paralelo em lotes
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log(`Desconectando ${this.sockets.size} instância(s)...`);

    // Desconectar sockets em paralelo (lotes de BOOT_BATCH_SIZE)
    const entries = Array.from(this.sockets.entries());
    for (let i = 0; i < entries.length; i += this.BOOT_BATCH_SIZE) {
      const batch = entries.slice(i, i + this.BOOT_BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async ([instanceId, sock]) => {
          try {
            sock.end(undefined);
            await this.updateConnectionStatus(instanceId, 'disconnected');
          } catch (err) {
            this.logger.error(
              `Erro ao desconectar ${instanceId}: ${String(err)}`,
            );
          }
        }),
      );
    }

    this.sockets.clear();
    this.qrCodes.clear();
    this.reconnecting.clear();
    this.reconnectAttempts.clear();

    // Flush escritas pendentes do AuthService
    await this.authService.flushPendingWrites();

    this.logger.log('Todas as instâncias desconectadas');
  }
}
