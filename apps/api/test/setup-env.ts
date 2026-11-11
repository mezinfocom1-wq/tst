process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://salon:salon@localhost:5432/salon_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.SMTP_HOST = '';
process.env.STORAGE_DRIVER = 'local';
