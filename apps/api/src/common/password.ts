import { hash, verify } from '@node-rs/argon2';

/**
 * Hachage des mots de passe en Argon2id (paramètres par défaut de la bibliothèque, conformes aux recommandations OWASP).
 * La bibliothèque fournit des binaires précompilés : elle fonctionne aussi sur les hébergements « serverless ».
 * Le format produit est le format standard `$argon2id$…` : les mots de passe déjà enregistrés restent valides.
 */
export const hashPassword = (password: string) => hash(password);

export const verifyPassword = (hashed: string, password: string) => verify(hashed, password).catch(() => false);
