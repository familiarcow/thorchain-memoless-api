import 'dotenv/config';
import { MemolessApiApplication } from './app';

async function main() {
  const app = new MemolessApiApplication();
  
  try {
    await app.initialize();
    await app.start();
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

main();