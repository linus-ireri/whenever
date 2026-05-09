import { useState, useEffect, useRef } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '../supabaseClient'

const model = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '').getGenerativeModel({
  model: 'gemini-2.5-flash',
})

const parseAIJsonResponse = (text) => {
  const cleaned = text.trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  const jsonText = firstBrace !== -1 && lastBrace !== -1 ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned

  try {
    return JSON.parse(jsonText)
  } catch (err) {
    return null
  }
}

export default function DashboardAI({ visible, onClose, events, setEvents, userId, themeVars }) {
  const [aiInput, setAiInput] = useState('')
  const [aiConversation, setAiConversation] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const chatContainerRef = useRef(null)

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [aiConversation, aiLoading])

  if (!visible) return null

  const conversationHistory = aiConversation
    .filter((msg) => msg.ai)
    .slice(-20)
    .map((msg) => `${msg.user}\nAI: ${msg.ai}`)
    .join('\n')

  const submitAIText = async () => {
    const text = aiInput.trim()
    if (!text) return

    setAiConversation((prev) => [...prev, { user: text, ai: '' }])
    setAiLoading(true)
    setAiInput('')
    await processWithAI(text)
    setAiLoading(false)
  }

  const processWithAI = async (userInput) => {
    const updateLastMessage = (aiReply) => {
      setAiConversation((prev) => {
        if (!prev.length) return [{ user: userInput, ai: aiReply }]

        const updated = [...prev]
        const last = updated[updated.length - 1]

        if (last.user === userInput && last.ai === '') {
          updated[updated.length - 1] = { ...last, ai: aiReply }
        } else {
          updated.push({ user: userInput, ai: aiReply })
        }

        return updated
      })
    }

    try {
      const existingEvents = events
        .map((e) => `${e.title} on ${e.date} at ${e.time} (${e.category})`)
        .join(', ')

      const prompt = `You are an AI event assistant that helps users schedule, update, and delete calendar events.\n\nExisting events: ${existingEvents || 'None'}\n\nConversation history (last 20 messages):\n${conversationHistory || 'None'}\n\nThe user said: "${userInput}"\n\nRespond only with a JSON object. Use one of the following actions:\n- save\n- update\n- delete\n- ask\n\nIf saving, include:\n{"action":"save","event":{"title":"...","category":"work|family|call|travel|personal","date":"YYYY-MM-DD","time":"HH:MM"}}\n\nIf updating, include:\n{"action":"update","criteria":{"title":"...","date":"YYYY-MM-DD","time":"HH:MM"},"event":{"title":"...","category":"...","date":"YYYY-MM-DD","time":"HH:MM"}}\n\nIf deleting, include:\n{"action":"delete","criteria":{"title":"...","date":"YYYY-MM-DD","time":"HH:MM"}}\n\nIf details are missing, ask one follow-up question like:\n{"action":"ask","question":"What date should I use for this event?"}\n\nDo not add any extra text outside the JSON object.`

      const result = await model.generateContent(prompt)
      const response = await result.response
      const aiText = await response.text()
      const aiResponse = parseAIJsonResponse(aiText)

      if (aiResponse?.action === 'save') {
        const savedEvent = await saveEventFromAI(aiResponse.event)
        if (savedEvent) {
          setEvents((prev) => [...prev, savedEvent].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)))
          updateLastMessage(`Event saved successfully: ${savedEvent.title} on ${savedEvent.date} at ${savedEvent.time}.`)
        } else {
          updateLastMessage('I understood the event but could not save it. Please try again.')
        }
      } else if (aiResponse?.action === 'delete') {
        const deletedIds = await deleteEventFromAI(aiResponse.criteria)
        if (deletedIds?.length) {
          setEvents((prev) => prev.filter((event) => !deletedIds.includes(event.id)))
          updateLastMessage(`Deleted ${deletedIds.length} matching event(s).`)
        } else {
          updateLastMessage('I could not find an event to delete with those details.')
        }
      } else if (aiResponse?.action === 'update') {
        const updatedEvent = await updateEventFromAI(aiResponse.criteria, aiResponse.event)
        if (updatedEvent) {
          setEvents((prev) => prev.map((event) => (event.id === updatedEvent.id ? updatedEvent : event)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)))
          updateLastMessage(`Updated event to ${updatedEvent.title} on ${updatedEvent.date} at ${updatedEvent.time}.`)
        } else {
          updateLastMessage('I could not find or update any matching event. Please give more exact details.')
        }
      } else if (aiResponse?.action === 'ask') {
        updateLastMessage(aiResponse.question)
      } else {
        updateLastMessage(aiText)
      }
    } catch (error) {
      console.error('AI processing error:', error)
      updateLastMessage('Sorry, I encountered an error. Please try again.')
    }
  }

  const saveEventFromAI = async (eventData) => {
    if (!eventData?.title || !eventData?.category || !eventData?.date || !eventData?.time) {
      console.error('Invalid event data from AI:', eventData)
      return null
    }

    const { data, error } = await supabase
      .from('events')
      .insert([
        {
          user_id: userId,
          title: eventData.title,
          category: eventData.category,
          date: eventData.date,
          time: eventData.time,
          notify_before: 15,
          status: 'upcoming',
        },
      ])
      .select()
      .single()

    if (error) {
      console.error('Error saving event:', error)
      return null
    }

    return data
  }

  const findMatchingEvents = (criteria) => {
    if (!criteria) return []
    return events.filter((event) => {
      if (criteria.title && event.title.toLowerCase() !== criteria.title.toLowerCase()) return false
      if (criteria.date && event.date !== criteria.date) return false
      if (criteria.time && event.time !== criteria.time) return false
      if (criteria.category && event.category !== criteria.category) return false
      return true
    })
  }

  const deleteEventFromAI = async (criteria) => {
    const matches = findMatchingEvents(criteria)
    if (!matches.length) return null

    const ids = matches.map((event) => event.id)
    const { error } = await supabase.from('events').delete().in('id', ids).eq('user_id', userId)

    if (error) {
      console.error('Error deleting event(s):', error)
      return null
    }

    return ids
  }

  const updateEventFromAI = async (criteria, updateData) => {
    const matches = findMatchingEvents(criteria)
    if (!matches.length) return null

    const eventToUpdate = matches[0]
    const updatedValues = {
      title: updateData?.title || eventToUpdate.title,
      category: updateData?.category || eventToUpdate.category,
      date: updateData?.date || eventToUpdate.date,
      time: updateData?.time || eventToUpdate.time,
    }

    const { data, error } = await supabase
      .from('events')
      .update(updatedValues)
      .eq('id', eventToUpdate.id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating event:', error)
      return null
    }

    return data
  }

  return (
    <>
      <style>
        {`
          @media (max-width: 768px) {
            .ai-assistant-panel {
              width: 100vw !important;
              left: 0 !important;
              right: auto !important;
            }
          }
        `}
      </style>
      <div
        className="ai-assistant-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '400px',
          height: '100vh',
          background: themeVars.surface,
          borderLeft: `1px solid ${themeVars.surfaceBorder}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100,
        }}
      >
      <div
        style={{
          padding: '20px',
          borderBottom: `1px solid ${themeVars.surfaceBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3
          style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: '20px',
            margin: 0,
            color: themeVars.pageText,
          }}
        >
          AI Event Assistant
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: themeVars.muted,
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: '10px' }}>
          {aiConversation.length === 0 ? (
            <p style={{ color: themeVars.muted, fontStyle: 'italic' }}>
              Type your event details and let the AI help you create it.
            </p>
          ) : (
            aiConversation.map((msg, i) => {
              const isPendingAiMessage = msg.ai === '' && i === aiConversation.length - 1 && aiLoading

              return (
                <div key={i} style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      alignSelf: 'flex-end',
                      background: themeVars.filterActive,
                      padding: '12px 14px',
                      borderRadius: '16px',
                      borderTopLeftRadius: '16px',
                      borderBottomLeftRadius: '16px',
                      maxWidth: '80%',
                      fontSize: '14px',
                      color: themeVars.pageText,
                      boxShadow: '0 6px 18px rgba(0,0,0,0.04)',
                    }}
                  >
                    <strong>You:</strong> {msg.user}
                  </div>

                  {isPendingAiMessage ? (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        background: themeVars.surfaceBorder,
                        color: themeVars.muted,
                        padding: '12px 14px',
                        borderRadius: '16px',
                        borderTopRightRadius: '16px',
                        borderBottomRightRadius: '16px',
                        maxWidth: '70%',
                        fontSize: '14px',
                        border: `1px solid ${themeVars.inputBorder}`,
                      }}
                    >
                      <strong>AI is typing</strong>
                      <span style={{ marginLeft: '8px', opacity: 0.75 }}>• • •</span>
                    </div>
                  ) : (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        background: themeVars.accent,
                        color: themeVars.accentText,
                        padding: '12px 14px',
                        borderRadius: '16px',
                        borderTopRightRadius: '16px',
                        borderBottomRightRadius: '16px',
                        maxWidth: '80%',
                        fontSize: '14px',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                      }}
                    >
                      <strong>AI:</strong> {msg.ai}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitAIText()
          }}
          style={{
            flexShrink: 0,
            marginTop: 'auto',
            paddingTop: '10px',
            paddingBottom: '10px',
            borderTop: `1px solid ${themeVars.surfaceBorder}`,
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Type your event details and click OK"
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: '14px',
                border: `1px solid ${themeVars.inputBorder}`,
                background: themeVars.inputBg,
                color: themeVars.pageText,
                fontSize: '14px',
                fontFamily: 'DM Sans, sans-serif',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={aiLoading || !aiInput.trim()}
              style={{
                minWidth: '110px',
                padding: '14px 18px',
                background: aiLoading ? '#999' : themeVars.actionBg,
                color: themeVars.actionText,
                border: 'none',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: aiLoading || !aiInput.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {aiLoading ? 'Processing…' : 'OK'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  )
}
