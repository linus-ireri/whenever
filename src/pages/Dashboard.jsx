import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEvent, setEditingEvent] = useState(null)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true })

    if (!error) setEvents(data)
    setLoading(false)
  }

  async function deleteEvent(id) {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)

    if (!error) setEvents(events.filter(e => e.id !== id))
  }

  async function updateEvent(e) {
    e.preventDefault()
    const { error } = await supabase
      .from('events')
      .update({
        title: editingEvent.title,
        category: editingEvent.category,
        date: editingEvent.date,
        time: editingEvent.time,
      })
      .eq('id', editingEvent.id)

    if (!error) {
      setEvents(events.map(ev => ev.id === editingEvent.id ? editingEvent : ev))
      setEditingEvent(null)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div style={{ maxWidth: '700px', margin: '40px auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1>My Events</h1>
        <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Log Out
        </button>
      </div>

      {loading && <p>Loading events...</p>}

      {!loading && events.length === 0 && (
        <p style={{ color: '#888' }}>No events yet. Add your first one below.</p>
      )}

      {!loading && events.map(event => (
        <div key={event.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>

          {editingEvent && editingEvent.id === event.id ? (
            <form onSubmit={updateEvent}>
              <div style={{ marginBottom: '10px' }}>
                <input
                  type="text"
                  value={editingEvent.title}
                  onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', fontSize: '15px' }}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#888' }}>CATEGORY</label>
                <select
                  value={editingEvent.category}
                  onChange={(e) => setEditingEvent({ ...editingEvent, category: e.target.value })}
                  style={{ width: '100%', padding: '8px', fontSize: '15px' }}
                >
                  <option value="work">💼 Work</option>
                  <option value="family">🏠 Family</option>
                  <option value="call">📞 Call</option>
                  <option value="travel">✈️ Travel</option>
                  <option value="personal">⭐ Personal</option>
                </select>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#888' }}>DATE</label>
                <input
                  type="date"
                  value={editingEvent.date}
                  onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', fontSize: '15px' }}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#888' }}>TIME</label>
                <input
                  type="time"
                  value={editingEvent.time}
                  onChange={(e) => setEditingEvent({ ...editingEvent, time: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', fontSize: '15px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', background: 'green', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  style={{ padding: '8px 16px', background: '#888', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>

          ) : (

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0' }}>{event.title}</h3>
                <p style={{ margin: '0', color: '#888', fontSize: '14px' }}>
                  {event.category} · {event.date} · {event.time}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setEditingEvent(event)}
                  style={{ background: '#333', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteEvent(event.id)}
                  style={{ background: 'red', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>

          )}
        </div>
      ))}

      <AddEventForm onEventAdded={fetchEvents} userId={user.id} />
    </div>
  )
}

function AddEventForm({ onEventAdded, userId }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [time, setTime] = useState('09:00')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase
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

    if (error) {
      setMessage('Something went wrong, try again')
    } else {
      setMessage('Event added!')
      setTitle('')
      setCategory('')
      setDate(new Date().toISOString().split('T')[0])
      setTime('09:00')
      onEventAdded()
    }

    setLoading(false)
  }

  return (
    <div style={{ marginTop: '40px', borderTop: '1px solid #ddd', paddingTop: '24px' }}>
      <h2>Add Event</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', fontSize: '16px' }}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#888' }}>CATEGORY</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', fontSize: '16px' }}
          >
            <option value="" disabled>Select a category</option>
            <option value="work">💼 Work</option>
            <option value="family">🏠 Family</option>
            <option value="call">📞 Call</option>
            <option value="travel">✈️ Travel</option>
            <option value="personal">⭐ Personal</option>
          </select>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#888' }}>DATE</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', fontSize: '16px' }}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', color: '#888' }}>TIME</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            style={{ width: '100%', padding: '10px', fontSize: '16px' }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '10px', fontSize: '16px', cursor: 'pointer' }}
        >
          {loading ? 'Adding...' : 'Add Event'}
        </button>
      </form>
      {message && <p style={{ marginTop: '12px', color: 'green' }}>{message}</p>}
    </div>
  )
}