import 'dotenv/config';

const env = (k: string, d = '') => process.env[k] ?? d;

export const config = {
  port: Number(env('PORT', '4000')),
  webUrl: env('WEB_URL', 'http://localhost:3000'),
  apiPublicUrl: env('API_PUBLIC_URL', 'http://localhost:4000'),
  jwtSecret: env('JWT_ACCESS_SECRET', 'dev-only-secret-change-me-please-32chars'),
  accessTtlSec: Number(env('JWT_ACCESS_TTL_SEC', '900')),
  refreshDays: Number(env('REFRESH_TTL_DAYS', '30')),
  cookieSecure: env('COOKIE_SECURE', 'false') === 'true',
  googleClientId: env('GOOGLE_CLIENT_ID'),
  smtp: {
    host: env('SMTP_HOST'),
    port: Number(env('SMTP_PORT', '587')),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM', 'Salon <no-reply@example.com>'),
  },
  storage: {
    driver: env('STORAGE_DRIVER', 'local'),
    endpoint: env('S3_ENDPOINT'),
    region: env('S3_REGION', 'auto'),
    bucket: env('S3_BUCKET'),
    accessKey: env('S3_ACCESS_KEY'),
    secretKey: env('S3_SECRET_KEY'),
    publicUrl: env('S3_PUBLIC_URL'),
  },
  expoAccessToken: env('EXPO_ACCESS_TOKEN'),
  timezone: 'Africa/Casablanca',
  isProd: env('NODE_ENV') === 'production',
};

if (config.isProd && config.jwtSecret.startsWith('dev-only')) {
  throw new Error('JWT_ACCESS_SECRET doit être défini en production');
}
