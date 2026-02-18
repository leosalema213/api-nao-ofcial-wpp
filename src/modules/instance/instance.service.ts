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
import pino from 'pino';

@Injectable()
export class InstanceService implements OnModuleDestroy {
  private readonly logger = new Logger(InstanceService.name);

  /** Sockets ativos em memória */
  private sockets = new Map<string, WASocket>();

  /** QR codes pendentes (instanceId → base64 PNG) */
  private qrCodes = new Map<string, string>();

  /** Flags de reconexão (evitar loops) */
  private reconnecting = new Set<string>();

  constructor(private readonly authService: AuthService) {}

  /**
   * Cria uma nova instância WhatsApp e inicia a conexão
   */
  async createInstance(dto: CreateInstanceDto): Promise<WhatsAppInstance> {
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

    // Buscar versão mais recente do Baileys
    const { version } = await fetchLatestBaileysVersion();

    // Criar socket Baileys
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true, // Útil para debug local
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

      // Limpar QR code
      this.qrCodes.delete(instanceId);
      this.reconnecting.delete(instanceId);

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
        // Auto-reconexão
        this.reconnecting.add(instanceId);
        this.logger.log(`🔄 Reconectando: ${instanceName}...`);

        await this.updateConnectionStatus(instanceId, 'connecting');

        // Delay antes de reconectar (evitar flood)
        setTimeout(() => {
          void this.connectInstance(instanceId, instanceName);
        }, 3000);
      } else {
        // Logout explícito (401) — não reconectar
        this.logger.log(`🚫 Logout: ${instanceName} — sessão removida`);
        this.reconnecting.delete(instanceId);

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

  /**
   * Shutdown gracioso: desconectar todos os sockets
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Desconectando todas as instâncias...');

    for (const [instanceId, sock] of this.sockets.entries()) {
      try {
        sock.end(undefined);
        await this.updateConnectionStatus(instanceId, 'disconnected');
      } catch (err) {
        this.logger.error(`Erro ao desconectar ${instanceId}: ${String(err)}`);
      }
    }

    this.sockets.clear();
    this.qrCodes.clear();
    this.reconnecting.clear();

    // Flush escritas pendentes do AuthService
    await this.authService.flushPendingWrites();

    this.logger.log('Todas as instâncias desconectadas');
  }
}
