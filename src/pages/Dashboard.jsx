import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import DashboardAI from './DashboardAI'
import {
  ensurePushSubscription,
  requestNotificationPermissionAndSubscribe,
  getNotificationStatus,
  scheduleEventReminder,
  cancelLocalReminder,
} from '../notifications'
import { getLocalDateString } from '../dateTime'

const CATEGORIES = {
  work:     { label: 'Work',     icon: '💼', color: '#E8C547', bg: '#1a1608' },
  family:   { label: 'Family',   icon: '🏠', color: '#7FD4A1', bg: '#081a0f' },
  call:     { label: 'Call',     icon: '📞', color: '#7EC8E3', bg: '#081318' },
  travel:   { label: 'Travel',   icon: '✈️', color: '#F4956A', bg: '#1a0c08' },
  personal: { label: 'Personal', icon: '⭐', color: '#C47FD4', bg: '#130818' },
}

const THEME_PALETTES = {
  dark: {
    pageBg: '#0d0d0f',
    pageText: '#f0ede6',
    surface: '#111113',
    surfaceBorder: '#1a1a1e',
    muted: '#999',
    mutedSoft: '#aaa',
    mutedDim: '#2a2a30',
    accent: '#E8C547',
    accentText: '#081a0f',
    actionBg: '#7FD4A1',
    actionText: '#081a0f',
    cardBg: '#111113',
    cardBorder: '#1a1a1e',
    filterActive: '#1a1a1e',
    inputBg: '#0d0d0f',
    inputBorder: '#2a2a30',
    placeholder: '#7f8796',
    scrollTrack: '#111',
    scrollThumb: '#2a2a30',
    eventHover: '#999',
    iconBorder: '#222',
    iconHover: '#1a1a1e',
    deleteHoverBg: '#2a1212',
    deleteHoverBorder: '#3a1a1a',
    addBtnBg: '#b89822',
    addBtnHover: '#b3ac92',
    sidebarBorder: '#999',
    sidebarBg: '#111113',
    cardText: '#f0ede6',
    textSecondary: '#999',
    noEventsText: '#f0ede6',
  },
  light: {
    pageBg: '#f5f2eb',
    pageText: '#1a1a1e',
    surface: '#ffffff',
    surfaceBorder: '#d8d4c2',
    muted: '#555',
    mutedSoft: '#777',
    mutedDim: '#ccc',
    accent: '#b89822',
    accentText: '#1a1a1e',
    actionBg: '#7FD4A1',
    actionText: '#081a0f',
    cardBg: '#f9f6ee',
    cardBorder: '#ddd',
    filterActive: '#e3decf',
    inputBg: '#ffffff',
    inputBorder: '#ccc',
    placeholder: '#8a8a8a',
    scrollTrack: '#f0ece0',
    scrollThumb: '#c3bda7',
    eventHover: '#777',
    iconBorder: '#bbb',
    iconHover: '#f0ece0',
    deleteHoverBg: '#fde7e5',
    deleteHoverBorder: '#e4bcbc',
    addBtnBg: '#b89822',
    addBtnHover: '#9f8620',
    sidebarBorder: '#c8c2aa',
    sidebarBg: '#f7f3e8',
    cardText: '#1a1a1e',
    textSecondary: '#555',
    noEventsText: '#666',
  }
}

const baseInputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '10px',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'DM Sans, sans-serif',
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((d - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function Dashboard() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const fetchGenerationRef = useRef(0)
  const [editingEvent, setEditingEvent] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')
  const [theme, setTheme] = useState('light')
  const [expandCategories, setExpandCategories] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState({
    status: 'unknown',
    message: 'Loading notification status...',
  })
  const themeVars = THEME_PALETTES[theme]
  const themedInputStyle = {
    ...baseInputStyle,
    background: themeVars.inputBg,
    border: `1px solid ${themeVars.inputBorder}`,
    color: themeVars.pageText,
  }

  const placeholderStyle = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Instrument+Serif:ital@0;1&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    input::placeholder {
      color: ${themeVars.placeholder};
      font-style: italic;
      font-weight: 300;
    }

    select option {
      background: ${themeVars.surface};
      color: ${themeVars.pageText};
    }

    input[type="date"]::-webkit-calendar-picker-indicator,
    input[type="time"]::-webkit-calendar-picker-indicator {
      filter: ${theme === 'dark' ? 'invert(0.95) brightness(1.2)' : 'invert(0.25) brightness(0.8)'};
      cursor: pointer;
      opacity: 1;
    }

    input[type="date"]:invalid,
    input[type="time"]:invalid {
      color: ${themeVars.placeholder};
      font-style: italic;
    }

    .time-input-empty::-webkit-datetime-edit {
      color: transparent;
    }

    .time-input-empty::-webkit-date-and-time-value {
      color: transparent;
    }

    .event-card {
      background: ${themeVars.cardBg};
      border: 1px solid ${themeVars.cardBorder};
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 8px;
      transition: border-color 0.2s, transform 0.15s;
    }

    .event-card:hover {
      border-color: ${themeVars.eventHover};
      transform: translateX(2px);
    }

    .icon-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid ${themeVars.iconBorder};
      border-radius: 8px;
      color: ${themeVars.muted};
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      background: ${themeVars.iconHover};
      color: ${themeVars.pageText};
      border-color: ${themeVars.mutedDim};
    }

    
    .icon-btn.del:hover {
      background: ${themeVars.deleteHoverBg};
      color: ${theme === 'dark' ? '#f07070' : '#c63e3d'};
      border-color: ${themeVars.deleteHoverBorder};
    }

    .filter-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: ${themeVars.muted};
      cursor: pointer;
      font-size: 13px;
      font-family: 'DM Sans', sans-serif;
      font-weight: 400;
      text-align: left;
      width: 100%;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    

    .filter-btn:hover {
      background: ${themeVars.filterActive};
      color: ${themeVars.mutedSoft};
      transform: translateY(-2px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .filter-btn.active {
      background: ${themeVars.filterActive};
      color: ${themeVars.pageText};
      font-weight: 500;
    }

    .ai-assistant-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 10px;
      background: ${themeVars.accent};
      color: ${themeVars.accentText};
      border: none;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      width: auto;
      max-width: 220px;
      text-align: center;
      transition: all 0.2s ease;
    }

    .ai-assistant-button:hover {
      filter: brightness(0.98);
    }

    .header-ai-button {
      display: inline-flex;
    }

    .sidebar-ai-button {
      display: none;
      width: 100%;
    }

    @media (max-width: 768px) {
      .header-ai-button {
        display: none;
      }
      .sidebar-ai-button {
        display: inline-flex;
      }
    }

    @media (max-width: 768px) {
      .header-ai-button {
        display: none;
      }
      .sidebar-ai-button {
        display: inline-flex;
      }
    }

    .sidebar-mobile-logout {
      width: auto;
      padding: 8px 12px;
      border: 1px solid ${theme === 'dark' ? '#E8C547' : '#8a6f12'};
      background: ${theme === 'dark' ? '#18150a' : '#efe7ce'};
      color: ${themeVars.pageText};
      font-weight: 600;
    }

    .sidebar-mobile-logout:hover {
      border-color: ${themeVars.accent};
      background: ${theme === 'dark' ? '#221d0c' : '#e7ddbd'};
      color: ${themeVars.pageText};
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .add-btn {
      width: 100%;
      padding: 13px;
      background: ${themeVars.addBtnBg};
      color: ${themeVars.accentText};
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      transition: all 0.2s;
      letter-spacing: 0.01em;
    }

    .add-btn:hover {
      background: ${themeVars.addBtnHover};
      transform: translateY(-1px);
    }

    .add-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .confirm-btn {
      transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
    }

    .confirm-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
      filter: brightness(1.05);
    }

    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: ${themeVars.scrollTrack}; }
    ::-webkit-scrollbar-thumb { background: ${themeVars.scrollThumb}; border-radius: 2px; }
  `

  useEffect(() => {
    if (!user?.id) return

    async function initNotifications() {
      const initial = await getNotificationStatus()
      setNotificationStatus(initial)
    }

    initNotifications()
  }, [user])

  async function refreshNotificationStatus() {
    const status = await getNotificationStatus()

    if (status.permission === 'granted' && !status.subscription && user?.id) {
      setNotificationStatus({ ...status, message: 'Permission granted — subscribing...' })
      await ensurePushSubscription(user.id)
      const updated = await getNotificationStatus()
      setNotificationStatus(updated)
      return
    }

    setNotificationStatus(status)
  }

  async function enableNotifications() {
    if (!user?.id) return
    setNotificationStatus({ ...notificationStatus, message: 'Requesting notification permission...' })
    await requestNotificationPermissionAndSubscribe(user.id)
    const updated = await getNotificationStatus()
    setNotificationStatus(updated)
  }

  const sortEvents = useCallback((list) => (
    [...list].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  ), [])

  const fetchEvents = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return null
    const generation = ++fetchGenerationRef.current
    if (!silent) {
      setLoading(true)
      setFetchError(null)
    }

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true })

    if (generation !== fetchGenerationRef.current) return null

    if (error) {
      console.error('Error fetching events:', error)
      if (!silent) {
        setFetchError('Could not load your events. Try refreshing the page.')
        setLoading(false)
      }
      return null
    }

    const freshEvents = Array.isArray(data) ? data : []
    setEvents(freshEvents)
    if (!silent) setLoading(false)
    return freshEvents
  }, [user?.id])

  const handleEventAdded = useCallback((newEvent) => {
    if (newEvent?.id) {
      setEvents((prev) => sortEvents([...prev.filter((event) => event.id !== newEvent.id), newEvent]))
      return
    }
    fetchEvents()
  }, [fetchEvents, sortEvents])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  async function deleteEvent(id) {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (!error) {
      cancelLocalReminder(id)
      setEvents(events.filter(e => e.id !== id))
    }
  }

  async function updateEvent(e) {
    e.preventDefault()
    setSavingEdit(true)

    // Validate required fields
    if (!editingEvent.title?.trim() || !editingEvent.date || !editingEvent.time) {
      setSavingEdit(false)
      alert('Please fill in all required fields.')
      return
    }

    try {
      const { error } = await supabase
        .from('events')
        .update({
          title: editingEvent.title.trim(),
          category: editingEvent.category,
          date: editingEvent.date,
          time: editingEvent.time,
        })
        .eq('id', editingEvent.id)
        .eq('user_id', user.id) // Ensure user can only update their own events

      if (error) {
        console.error('Error updating event:', error)
        alert(`Failed to update event: ${error.message}`)
        return
      }

      // Re-schedule notification for the updated event
      scheduleEventReminder(editingEvent)

      // Update local state
      setEvents(events.map(ev => ev.id === editingEvent.id ? editingEvent : ev))
      setEditingEvent(null)
    } catch (err) {
      console.error('Unexpected error updating event:', err)
      alert('An unexpected error occurred. Please try again.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function confirmLogout() {
    setShowLogoutModal(true)
  }

  const filtered = activeFilter === 'all'
    ? events
    : events.filter(e => e.category === activeFilter)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const displayName =
    user.user_metadata?.display_name?.trim() ||
    user.user_metadata?.username?.trim() ||
    user.email?.split('@')[0] ||
    'friend'

  return (
    <div className="dashboard-root" style={{ minHeight: '100vh', background: themeVars.pageBg, color: themeVars.pageText }}>
      <style>{placeholderStyle}</style>

      {/* Sidebar */}
      <aside className="dashboard-sidebar" style={{
        background: themeVars.sidebarBg,
        '--sidebar-border': themeVars.sidebarBorder,
        '--page-text': themeVars.pageText,
        '--surface-border': themeVars.surfaceBorder,
        borderRight: '1px solid var(--sidebar-border)',
        padding: '32px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        overflowY: 'auto',
        flexShrink: 0
      }}>
        <div className="sidebar-top-row" style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '18px'
        }}>
          <div>
            <div style={{
              fontFamily: 'Instrument Serif, serif',
              fontSize: '26px',
              padding: '0 8px',
              marginBottom: '4px'
            }}>
              when<span style={{ color: themeVars.accent, fontStyle: 'italic' }}>ever</span>
            </div>
            <div style={{
              fontSize: '11px', color: themeVars.muted, padding: '0 8px',
              letterSpacing: '0.1em', textTransform: 'uppercase'
            }}>
              AI Scheduler
            </div>
          </div>
          <button
            className="filter-btn sidebar-mobile-logout"
            onClick={confirmLogout}
          >
            Log out
          </button>
        </div>
        <button
          className="filter-btn theme-switch-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          style={{
            marginBottom: '18px',
            justifyContent: 'center',
            background: themeVars.accent,
            color: themeVars.accentText,
            fontWeight: '600',
            border: `2px solid ${themeVars.accent}`,
            padding: '12px 16px',
            fontSize: '13px',
            transition: 'all 0.3s'
          }}
        >
          {theme === 'dark' ? '☀️ Switch to Light' : '🌙 Switch to Dark'}
        </button>

        {/* All Events Filter Button */}
        <button
          className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => {
            setActiveFilter('all')
            setExpandCategories(!expandCategories)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: expandCategories ? '8px' : '12px',
            transition: 'all 0.2s'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '7px', height: '7px',
              borderRadius: '50%',
              background: themeVars.muted,
              flexShrink: 0
            }} />
            All Events
          </span>
          <span style={{
            marginLeft: 'auto', fontSize: '11px',
            background: themeVars.filterActive, padding: '2px 7px',
            borderRadius: '20px', color: themeVars.muted
          }}>
            {events.length}
          </span>
          <span style={{
            marginLeft: '12px',
            fontSize: '16px',
            transform: expandCategories ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}>
            ▼
          </span>
        </button>

        <button
          className="ai-assistant-button sidebar-ai-button"
          onClick={() => setShowAIAssistant(!showAIAssistant)}
        >
          🤖 AI Assistant
        </button>

        {/* Category Buttons - Show/Hide Based on expandCategories */}
        {expandCategories && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingLeft: '12px',
            marginBottom: '12px',
            borderLeft: `2px solid ${themeVars.surfaceBorder}`,
            paddingBottom: '12px',
            marginBottom: '0',
            paddingBottom: '12px',
            borderBottom: `1px solid ${themeVars.surfaceBorder}`
          }}>
            {Object.entries(CATEGORIES).map(([key, cat]) => {
              const count = events.filter(e => e.category === key).length
              return (
                <button
                  key={key}
                  className={`filter-btn ${activeFilter === key ? 'active' : ''}`}
                  onClick={() => setActiveFilter(key)}
                  style={{ paddingLeft: '0' }}
                >
                  <span style={{
                    width: '7px', height: '7px',
                    borderRadius: '50%',
                    background: cat.color,
                    flexShrink: 0
                  }} />
                  {cat.label}
                  <span style={{
                    marginLeft: 'auto', fontSize: '11px',
                    background: themeVars.filterActive, padding: '2px 7px',
                    borderRadius: '20px', color: themeVars.muted
                  }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: `1px solid ${themeVars.surfaceBorder}` }}>
          <div className="sidebar-user-email" style={{
            fontSize: '11px', color: themeVars.muted, padding: '0 8px',
            marginBottom: '10px', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {user.email}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="dashboard-main" style={{ flex: 1, padding: '48px', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <h1 style={{
              fontFamily: 'Instrument Serif, serif',
              fontSize: '38px',
              fontWeight: '400',
              lineHeight: 1.2,
              margin: 0
            }}>
              Good {greeting},{' '}
              <em style={{ color: '#E8C547' }}>{displayName}.</em>
            </h1>
            <button
              className="ai-assistant-button header-ai-button"
              onClick={() => setShowAIAssistant(!showAIAssistant)}
              style={{
                alignItems: 'center',
                gap: '8px'
              }}
            >
              🤖 AI Assistant
            </button>
          </div>
          <p style={{ color: themeVars.textSecondary, fontSize: '14px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
            <span style={{
              fontSize: '12px',
              color: themeVars.pageText,
              background: theme === 'dark' ? '#222' : '#f2f0e6',
              border: `1px solid ${themeVars.surfaceBorder}`,
              borderRadius: '999px',
              padding: '8px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <strong>Notifications:</strong> {notificationStatus.message}
            </span>
            {notificationStatus.permission !== 'granted' && notificationStatus.supported && (
              <button
                type="button"
                onClick={enableNotifications}
                style={{
                  fontSize: '12px',
                  padding: '8px 12px',
                  borderRadius: '999px',
                  border: `1px solid ${themeVars.surfaceBorder}`,
                  background: themeVars.accent,
                  color: themeVars.accentText,
                  cursor: 'pointer',
                }}
              >
                Enable notifications
              </button>
            )}
            <button
              type="button"
              onClick={refreshNotificationStatus}
              style={{
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '999px',
                border: `1px solid ${themeVars.surfaceBorder}`,
                background: themeVars.surface,
                color: themeVars.pageText,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {fetchError && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '10px',
            border: `1px solid ${theme === 'dark' ? '#5a3a12' : '#d4b86a'}`,
            background: theme === 'dark' ? '#1a1608' : '#faf3dc',
            color: themeVars.pageText,
            fontSize: '13px',
          }}>
            {fetchError}
          </div>
        )}

        {/* Stats row */}
        <div className="stats-row" style={{ marginBottom: '36px' }}>
          {[
            { num: events.filter(e => e.date === getLocalDateString()).length, label: 'Today' },
            { num: events.length, label: 'Total' },
            { num: events.filter(e => e.category === 'work').length, label: 'Work' },
            { num: events.filter(e => e.category === 'travel').length, label: 'Travel' },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1,
              background: themeVars.surface,
              border: `1px solid ${themeVars.surfaceBorder}`,
              borderRadius: '12px',
              padding: '16px 20px'
            }}>
              <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: '30px', color: themeVars.cardText }}>
                {s.num}
              </div>
              <div style={{
                fontSize: '10px', color: themeVars.muted,
                textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px'
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Events */}
        {loading && (
          <p style={{ color: themeVars.muted, fontSize: '14px', fontStyle: 'italic' }}>Loading your events...</p>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: '44px', marginBottom: '16px' }}>🗓</div>
            <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: '22px', color: themeVars.noEventsText }}>
              No events here yet
            </div>
            <p style={{ color: themeVars.muted, fontSize: '13px', marginTop: '8px' }}>
              Add one below to get started
            </p>
          </div>
        )}

        {!loading && filtered.map(event => {
          const cat = CATEGORIES[event.category] || CATEGORIES.personal
          return (
            <div key={event.id} className="event-card">
              {editingEvent && editingEvent.id === event.id ? (

                <form key={`edit-${event.id}`} onSubmit={updateEvent}>
                  <div style={{ marginBottom: '10px' }}>
                    <input
                      type="text"
                      value={editingEvent.title}
                      onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                      required
                      placeholder="Event title"
                      style={themedInputStyle}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          updateEvent(e)
                        }
                      }}
                    />
                  </div>
                  <div className="responsive-row" style={{ marginBottom: '10px' }}>
                    <select
                      value={editingEvent.category}
                      onChange={(e) => setEditingEvent({ ...editingEvent, category: e.target.value })}
                      style={{ ...themedInputStyle, flex: 1 }}
                      disabled={savingEdit}
                    >
                      {Object.entries(CATEGORIES).map(([key, c]) => (
                        <option key={key} value={key}>{c.icon} {c.label}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={editingEvent.date}
                      onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                      required
                      style={{ ...themedInputStyle, flex: 1 }}
                      disabled={savingEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          updateEvent(e)
                        }
                      }}
                    />
                    <input
                      type="time"
                      value={editingEvent.time}
                      onChange={(e) => setEditingEvent({ ...editingEvent, time: e.target.value })}
                      required
                      style={{ ...themedInputStyle, flex: 1 }}
                      disabled={savingEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          updateEvent(e)
                        }
                      }}
                    />
                  </div>
                  <div className="responsive-row" style={{ gap: '8px' }}>
                    <button type="button" onClick={updateEvent} disabled={savingEdit} style={{
                      padding: '8px 20px',
                      background: themeVars.actionBg, color: themeVars.actionText,
                      border: 'none', borderRadius: '8px',
                      fontSize: '13px', fontWeight: '600',
                      cursor: savingEdit ? 'not-allowed' : 'pointer',
                      opacity: savingEdit ? 0.75 : 1,
                      fontFamily: 'DM Sans, sans-serif'
                    }}>
                      {savingEdit ? 'Saving changes…' : 'Save changes'}
                    </button>
                    <button type="button" onClick={() => setEditingEvent(null)} style={{
                      padding: '8px 16px',
                      background: 'transparent', color: themeVars.muted,
                      border: `1px solid ${themeVars.surfaceBorder}`, borderRadius: '8px',
                      fontSize: '13px', cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif'
                    }}>
                      Cancel
                    </button>
                  </div>
                </form>

              ) : (

                <div className="event-card-header">
                  <div style={{
                    width: '3px', height: '44px',
                    borderRadius: '2px', background: cat.color, flexShrink: 0
                  }} />
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    background: cat.bg, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '19px', flexShrink: 0
                  }}>
                    {cat.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '15px', fontWeight: '500',
                      marginBottom: '4px', color: themeVars.cardText
                    }}>
                      {event.title}
                    </div>
                    <div style={{ fontSize: '12px', color: themeVars.muted }}>
                      {formatDate(event.date)} · {formatTime(event.time)} · {cat.label}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', opacity: 0.6 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                  >
                    <button
                      className="icon-btn"
                      onClick={() => setEditingEvent(event)}
                      title="Edit event"
                    >
                      ✏️
                    </button>
                    <button
                      className="icon-btn del"
                      onClick={() => deleteEvent(event.id)}
                      title="Delete event"
                    >
                      ✕
                    </button>
                  </div>
                </div>

              )}
            </div>
          )
        })}

        {/* Add Event Form */}
        <AddEventForm onEventAdded={handleEventAdded} userId={user.id} themeVars={themeVars} />
      </main>

      <DashboardAI
        visible={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        events={events}
        setEvents={setEvents}
        userId={user.id}
        themeVars={themeVars}
        refreshEvents={() => fetchEvents({ silent: true })}
      />

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="logout-modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="logout-modal" style={{
            background: themeVars.surface,
            border: `1px solid ${themeVars.surfaceBorder}`,
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center'
          }}>
            <h3 style={{
              fontFamily: 'Instrument Serif, serif',
              fontSize: '20px',
              marginBottom: '12px',
              color: themeVars.pageText
            }}>
              Log out from whenever?
            </h3>
            <p style={{
              color: themeVars.muted,
              fontSize: '14px',
              marginBottom: '24px'
            }}>
              You'll need to sign in again to access your events.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{
                  padding: '10px 20px',
                  border: `1px solid ${themeVars.surfaceBorder}`,
                  background: 'transparent',
                  color: themeVars.pageText,
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowLogoutModal(false)
                  await handleLogout()
                }}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #f8b4b4',
                  background: '#f07070',
                  color: '#fff',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddEventForm({ onEventAdded, userId, themeVars }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState('')
  const [dateDraft, setDateDraft] = useState('')
  const [time, setTime] = useState('')
  const [timeDraft, setTimeDraft] = useState('')
  const [isTimeFocused, setIsTimeFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (!date || !time) {
      setMessage('Please select a full date and confirm the time with OK.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('events')
      .insert([{
        user_id: userId,
        title,
        category,
        date,
        time,
        notify_before: 15,
        status: 'upcoming'
      }])
      .select()
      .single()

    if (error) {
      setMessage('Something went wrong, try again')
    } else {
      const scheduledEvent = data || { user_id: userId, title, category, date, time, notify_before: 15, status: 'upcoming' }
      scheduleEventReminder(scheduledEvent)
      setMessage('Event added!')
      setTitle('')
      setCategory('')
      setDate('')
      setDateDraft('')
      setTime('')
      setTimeDraft('')
      onEventAdded(scheduledEvent)
    }

    setLoading(false)
  }

  const fieldStyle = {
    width: '100%',
    padding: '12px 42px 12px 16px',
    background: themeVars.surface,
    border: `1px solid ${themeVars.surfaceBorder}`,
    borderRadius: '10px',
    color: themeVars.pageText,
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
    transition: 'border-color 0.2s'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '10px',
    color: themeVars.muted,
    marginBottom: '7px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em'
  }
  const isLightMode = themeVars.pageBg === '#f5f2eb'
  const getConfirmButtonStyle = (isSet, canConfirm) => ({
    padding: '6px 12px',
    borderRadius: '8px',
    border: `1px solid ${isLightMode ? '#7a6110' : themeVars.accent}`,
    background: isSet
      ? (isLightMode ? '#7a6110' : themeVars.accent)
      : (isLightMode ? '#fff8e1' : 'transparent'),
    color: isSet
      ? (isLightMode ? '#ffffff' : themeVars.accentText)
      : (isLightMode ? '#5b470b' : themeVars.accent),
    fontSize: '12px',
    fontWeight: isLightMode ? '700' : '600',
    cursor: canConfirm ? 'pointer' : 'not-allowed',
    opacity: canConfirm ? 1 : 0.6
  })
  const getResetButtonStyle = (canReset) => ({
    ...getConfirmButtonStyle(false, canReset),
    border: `1px solid ${isLightMode ? '#6e5811' : themeVars.accent}`,
    background: isLightMode ? '#f0e0aa' : themeVars.filterActive,
    color: isLightMode ? '#3d2f08' : themeVars.pageText,
    fontWeight: '700'
  })

  return (
    <div className="add-event-section" style={{
      marginTop: '48px',
      borderTop: `1px solid ${themeVars.surfaceBorder}`,
      paddingTop: '36px'
    }}>
      <h2 style={{
        fontFamily: 'Instrument Serif, serif',
        fontSize: '24px',
        fontWeight: '400',
        marginBottom: '24px',
        color: themeVars.cardText
      }}>
        Add an event
      </h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Event title</label>
          <input
            type="text"
            placeholder="e.g. Team standup, call John, flight to Nairobi..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            style={{
              ...fieldStyle,
              color: category ? themeVars.pageText : themeVars.muted,
              fontStyle: category ? 'normal' : 'italic'
            }}
          >
            <option value="" disabled>Select a category...</option>
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <option key={key} value={key}>{cat.icon} {cat.label}</option>
            ))}
          </select>
        </div>

        <div className="responsive-row form-row" style={{ marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Date</label>
            <div style={{ position: 'relative' }}>
              <input
                type="date"
                value={dateDraft}
                onChange={(e) => {
                  setDateDraft(e.target.value)
                  setDate('')
                }}
                onFocus={(e) => e.target.showPicker?.()}
                onClick={(e) => e.target.showPicker?.()}
                required
                style={fieldStyle}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                className="confirm-btn"
                type="button"
                onClick={() => {
                  setDateDraft('')
                  setDate('')
                }}
                disabled={!dateDraft && !date}
                style={{
                  ...getResetButtonStyle(!!dateDraft || !!date),
                  marginRight: '8px'
                }}
              >
                Reset
              </button>
              <button
                className="confirm-btn"
                type="button"
                onClick={() => setDate(dateDraft)}
                disabled={!dateDraft}
                style={getConfirmButtonStyle(!!date, !!dateDraft)}
              >
                {date ? 'Date set' : 'OK'}
              </button>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Time</label>
            <div style={{ position: 'relative' }}>
              <input
                type="time"
                className={!timeDraft && !isTimeFocused ? 'time-input-empty' : ''}
                value={timeDraft}
                onChange={(e) => {
                  setTimeDraft(e.target.value)
                  setTime('')
                }}
                onFocus={(e) => {
                  setIsTimeFocused(true)
                  e.target.showPicker?.()
                }}
                onBlur={() => setIsTimeFocused(false)}
                onClick={(e) => e.target.showPicker?.()}
                required
                style={fieldStyle}
              />
              {!timeDraft && !isTimeFocused && (
                <span style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: themeVars.placeholder,
                  fontSize: '14px',
                  fontStyle: 'italic',
                  pointerEvents: 'none'
                }}>
                  09:00 AM
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                className="confirm-btn"
                type="button"
                onClick={() => {
                  setTimeDraft('')
                  setTime('')
                }}
                disabled={!timeDraft && !time}
                style={{
                  ...getResetButtonStyle(!!timeDraft || !!time),
                  marginRight: '8px'
                }}
              >
                Reset
              </button>
              <button
                className="confirm-btn"
                type="button"
                onClick={() => setTime(timeDraft)}
                disabled={!timeDraft}
                style={getConfirmButtonStyle(!!time, !!timeDraft)}
              >
                {time ? 'Time set' : 'OK'}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="add-btn"
        >
          {loading ? 'Adding...' : '✦ Add Event'}
        </button>
      </form>

      {message && (
        <p style={{
          marginTop: '14px',
          fontSize: '13px',
          color: message.includes('wrong') ? '#f07070' : themeVars.actionBg,
          fontStyle: 'italic'
        }}>
          {message.includes('wrong') ? '✕ ' : '✓ '}{message}
        </p>
      )}
    </div>
  )
}