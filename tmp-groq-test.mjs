import fs from 'fs';

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

const key = env.VITE_GROQ_API_KEY;
if (!key) throw new Error('No VITE_GROQ_API_KEY found in .env');

const runGroqTest = async () => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'user', content: 'Rate limit/status check.' },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorBody}`)
  }

  const body = await response.text()
  console.log('STATUS:', response.status)
  console.log('BODY:', body.slice(0, 1800))
}

try {
  await runGroqTest()
} catch (error) {
  console.error('ERROR_TYPE:', error.name || 'Unknown')
  console.error('ERROR_MESSAGE:', error.message || error)
  console.error('ERROR_STACK:', error.stack || 'No stack')
  process.exit(1)
}
