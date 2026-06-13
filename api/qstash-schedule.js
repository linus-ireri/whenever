function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req, res) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const QSTASH_PUBLISH_URL = process.env.QSTASH_PUBLISH_URL
  const QSTASH_API_KEY = process.env.QSTASH_API_KEY

  if (!QSTASH_PUBLISH_URL || !QSTASH_API_KEY) {
    return res.status(500).json({ error: 'Missing server configuration (QSTASH_PUBLISH_URL or QSTASH_API_KEY).' })
  }

  try {
    const { event, reminderAt, type } = req.body || {}

    if (!event) return res.status(400).json({ error: 'Missing event in request body.' })

    const notBefore = reminderAt ? Math.floor(new Date(reminderAt).getTime() / 1000) : undefined

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${QSTASH_API_KEY}`,
    }
    if (notBefore) headers['Upstash-Not-Before'] = String(notBefore)

    const resp = await fetch(QSTASH_PUBLISH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, type }),
    })

    const text = await resp.text()

    if (!resp.ok) {
      return res.status(502).json({ error: 'Upstash responded with an error', status: resp.status, body: text })
    }

    return res.status(200).json({ ok: true, upstashResponse: text })
  } catch (err) {
    console.error('qstash-schedule error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
