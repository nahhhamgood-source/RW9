import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import healthHandler from './api/health.ts';
import analyzeFoodHandler from './api/analyze-food.ts';
import foodChatHandler from './api/food-chat.ts';
import coachHandler from './api/coach.ts';
import pushHandler from './api/push.ts';
import sendRemindersHandler from './api/send-reminders.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '3mb' }));

  app.all('/api/health', async (req: Request, res: Response) => {
    healthHandler(req, res);
  });

  app.all('/api/analyze-food', async (req: Request, res: Response) => {
    await analyzeFoodHandler(req, res);
  });

  app.all('/api/food-chat', async (req: Request, res: Response) => {
    await foodChatHandler(req, res);
  });

  app.all('/api/coach', async (req: Request, res: Response) => {
    await coachHandler(req, res);
  });

  app.all('/api/push', async (req: Request, res: Response) => {
    await pushHandler(req, res);
  });

  app.all('/api/send-reminders', async (req: Request, res: Response) => {
    sendRemindersHandler(req, res);
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'API route not found.' });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ASCEND server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ASCEND server:', err);
  process.exit(1);
});
