import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [key, ...rest] = line.split('=');
      return [key, rest.join('=')];
    })
);
const key = env.VITE_GEMINI_API_KEY;
if (!key) throw new Error('No VITE_GEMINI_API_KEY found in .env');
const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.5-flash' });
try {
  const result = await model.generateContent('Rate limit/status check.');
  const response = await result.response;
  console.log('STATUS:', response.status);
  const body = await response.text();
  console.log('BODY:', body.slice(0, 1800));
} catch (error) {
  console.error('ERROR_TYPE:', error.name || 'Unknown');
  console.error('ERROR_MESSAGE:', error.message || error);
  console.error('ERROR_STACK:', error.stack || 'No stack');
  process.exit(1);
}
