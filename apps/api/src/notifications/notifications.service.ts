import { Injectable, Logger } from '@nestjs/common';
import type { NotifChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { config } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { TEMPLATES, Template, TemplateKey, render } from './templates';

/** Fournisseur de notifications push. Remplaçable (FCM direct, autre service) sans toucher aux appelants. */
export interface PushProvider {
  send(tokens: string[], message: { title: string; body: string; data?: Record<string, unknown> }): Promise<void>;
}

/** Envoi via le service Expo, qui relaie vers FCM (Android) et APNs (iOS). */
class ExpoPushProvider implements PushProvider {
  async send(tokens: string[], message: { title: string; body: string; data?: Record<string, unknown> }) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.expoAccessToken ? { authorization: `Bearer ${config.expoAccessToken}` } : {}),
      },
      body: JSON.stringify(tokens.map((to) => ({ to, sound: 'default', ...message }))),
    });
    if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  }
}

@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  private mailer = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : null;
  push: PushProvider = new ExpoPushProvider();

  constructor(private prisma: PrismaService) {}

  /**
   * Envoie une notification selon le modèle `key`. Chaque envoi est historisé avec son statut.
   * Ne lève jamais d'exception : un échec d'envoi ne doit pas annuler l'opération métier.
   */
  async notify(userId: string, key: TemplateKey, vars: Record<string, unknown> = {}, data?: Record<string, unknown>) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { devices: true } });
      if (!user) return;
      const tpl: Template = TEMPLATES[key];
      const locale = user.locale === 'ar' ? 'ar' : 'fr';
      const override = await this.prisma.notificationTemplate.findUnique({ where: { key_locale: { key, locale } } });
      const text = override ?? tpl[locale];
      const title = render(text.title, vars);
      const body = render(text.body, vars);
      const prefs = (user.notifPrefs ?? {}) as { push?: boolean; email?: boolean };

      for (const channel of tpl.channels) {
        const allowed = tpl.mandatory || (channel === 'PUSH' ? prefs.push !== false : prefs.email !== false);
        const row = await this.prisma.notification.create({
          data: { userId, channel, type: key, title, body, data: (data ?? {}) as object, status: allowed ? 'PENDING' : 'SKIPPED' },
        });
        if (!allowed) continue;
        await this.deliver(row.id, channel, user, title, body, data);
      }
    } catch (e) {
      this.log.error(`notify(${key}) : ${(e as Error).message}`);
    }
  }

  private async deliver(
    id: string, channel: NotifChannel,
    user: { email: string; devices: { token: string }[] },
    title: string, body: string, data?: Record<string, unknown>,
  ) {
    try {
      if (channel === 'EMAIL') {
        if (this.mailer) {
          await this.mailer.sendMail({ from: config.smtp.from, to: user.email, subject: title, text: body });
        } else {
          this.log.log(`[email non envoyé : SMTP non configuré] à ${user.email} — ${title}\n${body}`);
        }
      } else {
        const tokens = user.devices.map((d) => d.token).filter((t) => t.startsWith('ExponentPushToken'));
        if (!tokens.length) {
          await this.prisma.notification.update({ where: { id }, data: { status: 'SKIPPED', error: 'Aucun appareil enregistré' } });
          return;
        }
        await this.push.send(tokens, { title, body, data });
      }
      await this.prisma.notification.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
    } catch (e) {
      await this.prisma.notification.update({ where: { id }, data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) } });
    }
  }

  /**
   * Envoie un email à une adresse qui n'a pas forcément de compte (invitation d'équipe).
   * Si un compte existe déjà, l'envoi passe par `notify` pour figurer dans son historique.
   */
  async emailTo(address: string, key: TemplateKey, vars: Record<string, unknown>, locale: 'fr' | 'ar' = 'fr') {
    const user = await this.prisma.user.findUnique({ where: { email: address } });
    if (user) return this.notify(user.id, key, vars);
    try {
      const override = await this.prisma.notificationTemplate.findUnique({ where: { key_locale: { key, locale } } });
      const text = override ?? (TEMPLATES[key] as Template)[locale];
      const title = render(text.title, vars), body = render(text.body, vars);
      if (this.mailer) await this.mailer.sendMail({ from: config.smtp.from, to: address, subject: title, text: body });
      else this.log.log(`[email non envoyé : SMTP non configuré] à ${address} — ${title}\n${body}`);
    } catch (e) {
      this.log.error(`emailTo(${key}) : ${(e as Error).message}`);
    }
  }

  /** Prévient tous les Super Admins (nouvelle demande, paiement à vérifier…). */
  async notifyAdmins(what: string, detail: string) {
    const admins = await this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true } });
    await Promise.all(admins.map((a) => this.notify(a.id, 'admin_action_required', { what, detail })));
  }
}
