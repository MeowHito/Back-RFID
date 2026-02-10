import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase body size limit to support base64 image uploads
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Security: Helmet for HTTP headers (install with: npm install helmet)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const helmet = require('helmet');
    app.use(helmet({
      contentSecurityPolicy: false, // Disable for API
      crossOriginEmbedderPolicy: false,
    }));
    console.log('✅ Helmet security headers enabled');
  } catch {
    console.warn('⚠️ Helmet not installed. Run: npm install helmet');
  }

  // Security: CORS with restricted origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://rfid-timing.vercel.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Security: Input validation with strict settings
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // Strip unknown properties
    transform: true,           // Auto-transform types
    forbidNonWhitelisted: true, // Reject unknown properties
    disableErrorMessages: process.env.NODE_ENV === 'production',
  }));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
}
bootstrap();

