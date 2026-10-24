import { serve } from '@hono/node-server';
import { app } from './api.ts';
import { config } from './config.ts';
import { relayerAccount } from './chain.ts';
import { startWorker } from './worker.ts';

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`owo on :${config.port} · ${config.chainName} · desk ${config.desk ?? '(not deployed)'} · relayer ${relayerAccount?.address ?? '(none)'} · ${config.live ? 'LIVE payouts' : 'demo payouts'}`);
});
startWorker();
