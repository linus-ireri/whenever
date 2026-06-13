const SCHEDULER_API_URL = import.meta.env.VITE_QSTASH_SCHEDULE_URL
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || ''
const SAVE_SUBSCRIPTION_URL = BACKEND_URL
  ? `${BACKEND_URL.replace(/\/$/, '')}/api/save-subscription`
  : '/api/save-subscription'
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
const LOCAL_REMINDERS_KEY = 'whenever-local-reminders'
const localReminderTimers = {}

function urlBase64ToUint8Array(base64String) {
  const trimmed = (base64String || '').trim()
  const padding = '='.repeat((4 - (trimmed.length % 4)) % 4)
  const base64 = (trimmed + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function isSecurePushContext() {
  if (typeof window === 'undefined') {
    return false
  }

  const localhostHosts = ['localhost', '127.0.0.1', '[::1]']
  return window.isSecureContext || localhostHosts.includes(window.location.hostname)
}

function isValidVapidKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{86,88}$/.test(key)
}

export async function getNotificationStatus() {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      secureContext: false,
      permission: 'denied',
      subscription: false,
      serviceWorkerActive: false,
      vapidKeyValid: false,
      message: 'Browser environment required',
    }
  }

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const secureContext = isSecurePushContext()
  const vapidKeyValid = isValidVapidKey(VAPID_PUBLIC_KEY)
  const permission = Notification.permission
  let serviceWorkerActive = false
  let subscription = false

  try {
    const registration = await navigator.serviceWorker.ready
    serviceWorkerActive = !!registration?.active
    subscription = !!(await registration.pushManager.getSubscription())
  } catch (error) {
    console.warn('[Notifications] Could not determine service worker or subscription state:', error)
  }

  let message = 'Ready to subscribe'
  if (!supported) message = 'Push not supported in this browser'
  else if (!secureContext) message = 'Requires HTTPS or localhost'
  else if (!vapidKeyValid) message = 'Invalid VAPID public key'
  else if (permission !== 'granted') message = 'Notification permission not granted'
  else if (subscription) message = 'Subscribed'

  return {
    supported,
    secureContext,
    permission,
    subscription,
    serviceWorkerActive,
    vapidKeyValid,
    message,
  }
}

async function logPushDebugState(registration) {
  if (typeof window === 'undefined') return

  const permissionState = await navigator.permissions.query({ name: 'notifications' })
  console.log('[Notifications] debug state:', {
    origin: window.location.origin,
    secureContext: window.isSecureContext,
    hostname: window.location.hostname,
    permission: Notification.permission,
    permissionState: permissionState.state,
    serviceWorkerController: navigator.serviceWorker.controller?.scriptURL || null,
    registrationScope: registration?.scope || null,
    registrationActive: registration?.active?.scriptURL || null,
    registrationInstalling: registration?.installing?.scriptURL || null,
    registrationWaiting: registration?.waiting?.scriptURL || null,
  })
}

function loadLocalReminders() {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LOCAL_REMINDERS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveLocalReminders(reminders) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LOCAL_REMINDERS_KEY, JSON.stringify(reminders))
}

function getReminderId(event) {
  return event.id || `${event.date}-${event.time}-${event.title}`
}

function scheduleReminderTimer(reminder) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const delay = new Date(reminder.reminderAt).getTime() - Date.now()
  if (delay <= 0) {
    removeLocalReminder(reminder.id)
    return
  }

  clearTimeout(localReminderTimers[reminder.id])
  localReminderTimers[reminder.id] = window.setTimeout(async () => {
    try {
      const registration = await navigator.serviceWorker.ready
      const payload = makeNotificationPayload(reminder.event)
      registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        data: payload.data,
        actions: payload.actions,
        tag: payload.tag,
        renotify: payload.renotify,
      })
    } catch (error) {
      console.warn('[Notifications] Failed to show local reminder:', error)
    }

    removeLocalReminder(reminder.id)
  }, delay)
}

function removeLocalReminder(id) {
  if (typeof window === 'undefined') return
  const reminders = loadLocalReminders().filter(r => r.id !== id)
  saveLocalReminders(reminders)
  if (localReminderTimers[id]) {
    clearTimeout(localReminderTimers[id])
    delete localReminderTimers[id]
  }
}

function hydrateLocalReminders() {
  if (typeof window === 'undefined') return
  const reminders = loadLocalReminders()
  reminders.forEach(scheduleReminderTimer)
}

export async function registerNotificationServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  try {
    const swUrl = new URL('/service-worker.js', window.location.origin).href
    const registration = await navigator.serviceWorker.register(swUrl, { scope: '/' })
    console.log('[Notifications] Service worker registered at', registration.scope)

    await navigator.serviceWorker.ready

    if (!navigator.serviceWorker.controller) {
      console.warn(
        '[Notifications] Service worker is installed but not yet controlling this page. ' +
        'Reload the app or navigate within the same scope to let the service worker take control.'
      )
    }

    hydrateLocalReminders()
  } catch (error) {
    console.warn('[Notifications] Service worker registration failed:', error)
  }
}

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  return Notification.requestPermission()
}

function formatEventDateTime(dateStr, timeStr) {
  const eventDate = new Date(`${dateStr}T${timeStr}`)
  return eventDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function makeNotificationPayload(event) {
  return {
    title: `Upcoming: ${event.title || 'Event'}`,
    body: `${formatEventDateTime(event.date, event.time)} — ${event.notify_before ?? 15} minutes away.`,
    icon: '/icons.svg',
    data: {
      url: `/?eventId=${event.id || ''}`,
      eventId: event.id,
      action: event.action || 'none',
      actionData: event.action_data || null,
    },
    actions: [
      { action: 'confirm', title: 'Confirm' },
      { action: 'cancel', title: 'Cancel' },
    ],
    tag: event.id || `${event.date}-${event.time}-${event.title}`,
    renotify: true,
  }
}

function scheduleLocalReminder(event, reminderAt) {
  if (typeof window === 'undefined') return
  const id = getReminderId(event)
  const reminders = loadLocalReminders().filter(r => r.id !== id)
  const reminder = { id, event, reminderAt }
  reminders.push(reminder)
  saveLocalReminders(reminders)
  scheduleReminderTimer(reminder)
}

export function cancelLocalReminder(eventId) {
  removeLocalReminder(eventId)
}

async function sendSubscriptionToServer(userId, subscription) {
  if (typeof window === 'undefined') return

  try {
    const response = await fetch(SAVE_SUBSCRIPTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, subscription }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.warn('[Notifications] Failed to save subscription. Server returned:', response.status, body)
    }
  } catch (error) {
    console.warn('[Notifications] Failed to save subscription:', error)
  }
}

export async function requestNotificationPermissionAndSubscribe(userId) {
  if (typeof window === 'undefined') {
    return
  }

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    console.warn('[Notifications] Notification permission not granted.')
    return
  }

  return ensurePushSubscription(userId)
}

export async function ensurePushSubscription(userId) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Notifications] Push subscription unavailable: service worker or PushManager not supported in this browser.')
    return
  }

  if (!isSecurePushContext()) {
    console.warn(
      '[Notifications] Push subscription requires a secure context. Use HTTPS or localhost/127.0.0.1 in development.'
    )
    return
  }

  if (!isValidVapidKey(VAPID_PUBLIC_KEY)) {
    console.warn(
      '[Notifications] Invalid VAPID public key. Confirm VITE_VAPID_PUBLIC_KEY is defined and your key is the correct base64url-encoded public key.'
    )
    return
  }

  if (Notification.permission !== 'granted') {
    console.warn('[Notifications] Permission is not granted; skipping push subscription until user explicitly enables notifications.')
    return
  }

  try {
    const registration = await navigator.serviceWorker.ready

    await registration.update()
    await logPushDebugState(registration)

    if (!registration || !registration.active) {
      console.warn('[Notifications] Service worker is not active yet. Ensure /service-worker.js is registered and in scope.')
      return
    }

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      try {
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        console.log('[Notifications] Subscribing push with applicationServerKey length', applicationServerKey.length)

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })

        console.log('[Notifications] Push subscription created successfully.')
      } catch (error) {
        console.error('[Notifications] Push subscription failed:', error)
        if (error?.name === 'AbortError') {
          console.warn(
            '[Notifications] Push registration was aborted. Common causes: ' +
            'invalid VAPID public key, insecure origin, browser push service unavailable, or a browser popup/permission block.'
          )
        }

        if (error?.message) {
          console.warn('[Notifications] pushManager.subscribe message:', error.message)
        }

        return
      }
    }

    await sendSubscriptionToServer(userId, subscription)
  } catch (error) {
    console.error('[Notifications] Failed during push subscription flow:', error)
  }
}

export async function scheduleEventReminder(event) {
  if (typeof window === 'undefined') {
    return
  }

  const permission = await requestNotificationPermission()
  const eventDate = new Date(`${event.date}T${event.time}`)
  const reminderDate = new Date(eventDate.getTime() - ((Number(event.notify_before) || 15) * 60_000))

  if (reminderDate <= new Date()) {
    console.warn('[Notifications] Reminder time is already in the past for event:', event.title)
    return
  }

  if (permission === 'granted') {
    scheduleLocalReminder(event, reminderDate.toISOString())
  } else {
    console.warn('[Notifications] Notification permission not granted. Local reminder will not be scheduled.')
  }

  if (SCHEDULER_API_URL) {
    try {
      await fetch(SCHEDULER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event, reminderAt: reminderDate.toISOString(), type: 'event-reminder' }),
      })
      console.log('[Notifications] Scheduled event reminder via server-side scheduler')
      return
    } catch (error) {
      console.warn('[Notifications] Failed to schedule via QStash endpoint:', error)
    }
  }

  // If server-side scheduling isn’t available, the local browser reminder still
  // fires while the user keeps the page open.
}
