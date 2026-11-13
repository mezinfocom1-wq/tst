import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { config } from './config';
import { badRequest } from './errors';
import { PrismaService } from './prisma.service';

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
];

/** Détermine le type réel d'un fichier d'après son contenu (jamais d'après son nom). */
export function sniff(buffer: Buffer) {
  return SIGNATURES.find((s) => buffer.length > 12 && s.test(buffer));
}

export const UPLOAD_ROOT = resolve(process.cwd(), 'uploads');

/**
 * Trois pilotes, choisis par STORAGE_DRIVER :
 *  - `local` : dossier uploads/ du serveur (développement, serveur avec disque persistant) ;
 *  - `s3`    : stockage objet compatible S3 (production) ;
 *  - `db`    : dans la base PostgreSQL (hébergements sans disque persistant, volumes modestes).
 */
@Injectable()
export class StorageService {
  constructor(private prisma: PrismaService) {}

  private s3 = config.storage.driver === 's3'
    ? new S3Client({
        region: config.storage.region,
        endpoint: config.storage.endpoint || undefined,
        forcePathStyle: !!config.storage.endpoint,
        credentials: { accessKeyId: config.storage.accessKey, secretAccessKey: config.storage.secretKey },
      })
    : null;

  /** Valide puis enregistre un fichier. Retourne la clé et, pour un fichier public, son URL. */
  async save(file: { buffer: Buffer } | undefined, opts: { folder: string; isPublic: boolean; allowPdf?: boolean; maxBytes?: number }) {
    if (!file?.buffer?.length) throw badRequest('FILE_REQUIRED', 'Fichier manquant');
    const max = opts.maxBytes ?? 5 * 1024 * 1024;
    if (file.buffer.length > max) throw badRequest('FILE_TOO_LARGE', `Fichier trop volumineux (maximum ${Math.round(max / 1048576)} Mo)`);
    const kind = sniff(file.buffer);
    if (!kind || (kind.mime === 'application/pdf' && !opts.allowPdf)) {
      throw badRequest('FILE_TYPE', opts.allowPdf ? 'Formats acceptés : JPEG, PNG, WebP, PDF' : 'Formats acceptés : JPEG, PNG, WebP');
    }
    const key = `${opts.isPublic ? 'public' : 'private'}/${opts.folder}/${randomUUID()}.${kind.ext}`;
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({
        Bucket: config.storage.bucket, Key: key, Body: file.buffer, ContentType: kind.mime,
      }));
      return { key, url: opts.isPublic ? `${config.storage.publicUrl.replace(/\/$/, '')}/${key}` : null };
    }
    if (config.storage.driver === 'db') {
      await this.prisma.storedFile.create({ data: { key, mime: kind.mime, data: new Uint8Array(file.buffer) } });
      return { key, url: opts.isPublic ? `/uploads/${key}` : null };
    }
    const path = join(UPLOAD_ROOT, key);
    await fs.mkdir(join(path, '..'), { recursive: true });
    await fs.writeFile(path, file.buffer);
    return { key, url: opts.isPublic ? `/uploads/${key}` : null };
  }

  /** Lit un fichier privé (preuve de paiement). L'appelant vérifie les droits d'accès. */
  async read(key: string): Promise<{ buffer: Buffer; mime: string }> {
    if (!/^private\/[\w-]+\/[\w-]+\.\w+$/.test(key)) throw badRequest('BAD_KEY', 'Clé de fichier invalide');
    let buffer: Buffer;
    if (config.storage.driver === 'db') {
      const row = await this.prisma.storedFile.findUnique({ where: { key } });
      if (!row) throw badRequest('BAD_KEY', 'Fichier introuvable');
      return { buffer: Buffer.from(row.data), mime: row.mime };
    }
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }));
      buffer = Buffer.from(await res.Body!.transformToByteArray());
    } else {
      buffer = await fs.readFile(join(UPLOAD_ROOT, key));
    }
    return { buffer, mime: sniff(buffer)?.mime ?? 'application/octet-stream' };
  }

  /** Lit un fichier public enregistré en base (pilote « db »). Retourne `null` s'il n'existe pas. */
  async readPublicFromDb(key: string): Promise<{ buffer: Buffer; mime: string } | null> {
    if (!/^public\/[\w-]+\/[\w-]+\.\w+$/.test(key)) return null;
    const row = await this.prisma.storedFile.findUnique({ where: { key } });
    return row ? { buffer: Buffer.from(row.data), mime: row.mime } : null;
  }
}
