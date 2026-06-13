self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', event => {
  const payload = event.data?.json?.() || {}
  const title = payload.title || 'Upcoming event reminder'
  const options = {
    body: payload.body || 'Your event is coming up soon.',
    icon: payload.icon || '/icons.svg',
    badge: payload.badge || '/icons.svg',
    data: payload.data || { url: '/' },
    actions: payload.actions || [
      { action: 'confirm', title: 'Confirm' },
      { action: 'cancel', title: 'Cancel' },
    ],
    tag: payload.tag || 'event-reminder',
    renotify: payload.renotify ?? true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
  const action = event.action

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === targetUrl || client.url === '/' || client.url.startsWith(targetUrl)) {
          client.focus()
          return
        }
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})

self.addEventListener('notificationclose', event => {
  // Optionally handle dismissals or analytics here.
})
