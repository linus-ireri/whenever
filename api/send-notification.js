import webPush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@whenever.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { event, type } = req.body || {}
  if (!event || !event.user_id) {
    return res.status(400).json({ error: 'Missing event or event.user_id in request body.' })
  }

  try {
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', event.user_id)
      .eq('active', true)

    if (error) {
      console.error('[send-notification] Supabase error:', error)
      return res.status(500).json({ error: error.message })
    }

    if (!subscriptions?.length) {
      console.log('[send-notification] No active subscriptions found for user', event.user_id)
      return res.status(200).json({ ok: true, sent: 0 })
    }

    const minutes = event.reminder_offset ?? event.notify_before ?? 15
    const bodyTime = new Date(`${event.date}T${event.time}`).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    const payload = {
      title: `Upcoming: ${event.title || 'Event'}`,
      body: `${bodyTime} — ${minutes > 0 ? `${minutes} minutes away.` : 'now.'}`,
      data: {
        url: `/?eventId=${event.id || ''}`,
        eventId: event.id,
      },
      actions: [
        { action: 'confirm', title: 'Confirm' },
        { action: 'cancel', title: 'Cancel' },
      ],
      tag: event.id || `${event.date}-${event.time}-${event.title}`,
      renotify: true,
    }

    const results = []

    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification(subscription.subscription, JSON.stringify(payload))
        results.push({ id: subscription.id, success: true })
      } catch (sendError) {
        console.error('[send-notification] push error:', sendError)

        if (sendError.statusCode === 410 || sendError.statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .update({ active: false })
            .eq('id', subscription.id)
        }

        results.push({ id: subscription.id, success: false, error: sendError.message })
      }
    }

    return res.status(200).json({ ok: true, results })
  } catch (err) {
    console.error('[send-notification] Unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
