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

  const { userId, subscription } = req.body || {}
  if (!userId || !subscription) {
    return res.status(400).json({ error: 'Missing userId or subscription in request body.' })
  }

  try {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          subscription,
          active: true,
        },
        { onConflict: ['user_id'], returning: 'representation' }
      )

    if (error) {
      console.error('[save-subscription] Supabase error:', error)
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ ok: true, subscription: data?.[0] ?? null })
  } catch (err) {
    console.error('[save-subscription] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
