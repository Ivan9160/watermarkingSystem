import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from "./app.module.js";
async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');
    const config = new DocumentBuilder()
        .setTitle('Watermarking System API')
        .setDescription(`
      API for the Watermarking System project. This API allows you to manage organizations, batches, and Allegro authentication. It provides endpoints for creating and managing organizations, uploading and downloading files, and handling Allegro authentication tokens.
    `)
        .setVersion('1.0')
        .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Allegro access token',
    }, 'allegroAccessToken')
        .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, documentFactory);
    await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
//# sourceMappingURL=main.js.map