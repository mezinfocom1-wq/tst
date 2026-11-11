import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { config } from './common/config';

async function main() {
  const app = configureApp(await NestFactory.create(AppModule));
  const doc = new DocumentBuilder()
    .setTitle('API Salons').setDescription('Marketplace, réservation, file d\'attente et gestion de salons').setVersion('0.1').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: 'api/docs-json' });
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`API prête sur http://localhost:${config.port}/api — documentation : /api/docs`);
}
main();
