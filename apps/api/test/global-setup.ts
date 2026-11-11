import { execSync } from 'child_process';

/** Applique les migrations sur la base de test avant de lancer les suites. */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://salon:salon@localhost:5432/salon_test?schema=public';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
