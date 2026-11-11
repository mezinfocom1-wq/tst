import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /** Journalise une action sensible. Ne fait jamais échouer l'opération appelante. */
  async log(entry: {
    actorId?: string | null; action: string; entityType?: string; entityId?: string;
    salonId?: string | null; meta?: Prisma.InputJsonValue; ip?: string;
  }) {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch (e) {
      console.error('[audit] échec', e);
    }
  }
}
