import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

  const { userId } = req.body || {}
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId in request body.' })
  }

  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .update({ active: false })
      .eq('user_id', userId)
      .select()

    if (error) {
      console.error('[unsubscribe] Supabase error:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ ok: true, updated: data?.length ?? 0 })
  } catch (err) {
    console.error('[unsubscribe] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
