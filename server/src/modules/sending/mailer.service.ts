import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { decryptSecret } from '../../common/utils/crypto.util';

export interface OutgoingMail {
  to: string;
  from: string; // "Name <email>" or bare email
  replyTo?: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  messageId: string | null;
  accepted: boolean;
}

/**
 * One place that knows how to actually put mail on the wire.
 *
 * Transport selection:
 *   - MAIL_TRANSPORT=log  -> no network, logs the message. Default in dev.
 *   - MAIL_TRANSPORT=smtp -> real SMTP from MAIL_HOST/PORT/USER/PASS/SECURE.
 * A sending server's decrypted SMTP credentials can also be passed per-send
 * (buildTransportFromCredentials), overriding the env transport.
 */
@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private envTransport: Transporter | null = null;
  private mode: 'log' | 'smtp' = 'log';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.mode = (this.config.get<string>('mail.transport') ?? 'log') as
      | 'log'
      | 'smtp';

    if (this.mode === 'smtp') {
      this.envTransport = nodemailer.createTransport({
        host: this.config.get<string>('mail.host'),
        port: this.config.get<number>('mail.port'),
        secure: this.config.get<boolean>('mail.secure') ?? false,
        auth: {
          user: this.config.get<string>('mail.user'),
          pass: this.config.get<string>('mail.pass'),
        },
      });
      this.logger.log(
        `Mailer in SMTP mode -> ${this.config.get('mail.host')}:${this.config.get('mail.port')}`,
      );
    } else {
      this.logger.warn('Mailer in LOG mode — emails are logged, not sent.');
    }
  }

  /**
   * Build a one-off transport from a sending server's decrypted SMTP creds.
   * credentialsJson shape: {"host","port","user","pass","secure"}.
   */
  buildTransportFromCredentials(encrypted: string): Transporter {
    const creds = JSON.parse(decryptSecret(encrypted)) as {
      host: string;
      port: number;
      user?: string;
      pass?: string;
      secure?: boolean;
    };
    return nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure ?? false,
      auth: creds.user ? { user: creds.user, pass: creds.pass } : undefined,
    });
  }

  async send(mail: OutgoingMail, transport?: Transporter): Promise<SendResult> {
    // LOG mode (and no explicit transport) => pretend-send, always succeeds.
    if (this.mode === 'log' && !transport) {
      this.logger.log(
        `[LOG-MAIL] to=${mail.to} from=${mail.from} subject="${mail.subject}"`,
      );
      return { messageId: `log-${Date.now()}`, accepted: true };
    }

    const tx = transport ?? this.envTransport;
    if (!tx) {
      throw new Error('No SMTP transport configured (set MAIL_TRANSPORT=smtp)');
    }

    const info = await tx.sendMail({
      to: mail.to,
      from: mail.from,
      replyTo: mail.replyTo,
      subject: mail.subject,
      html: mail.html,
      headers: mail.headers,
    });

    const accepted =
      Array.isArray(info.accepted) && info.accepted.length > 0;
    return { messageId: info.messageId ?? null, accepted };
  }
}