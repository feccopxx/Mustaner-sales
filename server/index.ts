import 'dotenv/config';
import { app, processPendingAgentBatches, processPendingHandoffs, processPendingMediaJobs, processPendingMessengerDeliveries } from './app.js';
const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Mustaner Course Catalog listening on ${port}`));

const worker = setInterval(() => {
  void processPendingMediaJobs().catch(error => console.error('Media worker failed', error));
  void processPendingAgentBatches().catch(error => console.error('Agent worker failed', error));
  void processPendingMessengerDeliveries().catch(error => console.error('Messenger delivery worker failed', error));
  void processPendingHandoffs().catch(error => console.error('Handoff worker failed', error));
}, 10_000);
worker.unref();
void processPendingMediaJobs().catch(error => console.error('Initial media worker failed', error));
void processPendingAgentBatches().catch(error => console.error('Initial agent worker failed', error));
void processPendingMessengerDeliveries().catch(error => console.error('Initial Messenger delivery worker failed', error));
void processPendingHandoffs().catch(error => console.error('Initial handoff worker failed', error));
