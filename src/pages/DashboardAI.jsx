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
  } catch {
    return null
  }
}

export default function DashboardAI({ visible, onClose, events, setEvents, userId, themeVars }) {
  const [aiInput, setAiInput] = useState('')
  const [aiConversation, setAiConversation] = useState([])
  const [chatSessions, setChatSessions] = useState([])
  const [activeChatId, setActiveChatId] = useState(null)
  const [showChatMenu, setShowChatMenu] = useState(false)
  const [editingChatId, setEditingChatId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const chatContainerRef = useRef(null)
  const menuContainerRef = useRef(null)

  const storageKey = `whenever-ai-chats-${userId || 'guest'}`

  const saveChatSessions = (sessions) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions))
    } catch (err) {
      console.error('Unable to save chat sessions', err)
    }
  }

  const formatTimeOnly = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getDayLabel = (timestamp, previousTimestamp) => {
    if (!timestamp) return null

    const currentDate = new Date(timestamp)
    currentDate.setHours(0, 0, 0, 0)

    let previousDate = null
    if (previousTimestamp) {
      previousDate = new Date(previousTimestamp)
      previousDate.setHours(0, 0, 0, 0)
    }

    if (previousDate && currentDate.getTime() === previousDate.getTime()) {
      return null
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dayDiff = Math.round((currentDate.getTime() - today.getTime()) / 86400000)

    if (dayDiff === 0) return 'Today'
    if (dayDiff === -1) return 'Yesterday'
    if (dayDiff === 1) return 'Tomorrow'
    return new Date(timestamp).toLocaleDateString(undefined, { weekday: 'long' })
  }

  const getChatTitleFromText = (text) => {
    const cleaned = text.trim()
    if (!cleaned) return 'New chat'
    const firstSentence = cleaned.split(/(?<=[.?!])\s+/)[0] || cleaned
    const trimmed = firstSentence.length > 45 ? `${firstSentence.slice(0, 45).trim()}...` : firstSentence
    return trimmed || 'New chat'
  }

  const setActiveChatTitle = (title) => {
    if (!activeChatId) return
    setChatSessions((prev) => {
      const next = prev.map((chat) =>
        chat.id === activeChatId ? { ...chat, title, updatedAt: new Date().toISOString() } : chat
      )
      saveChatSessions(next)
      return next
    })
  }

  const startEditingChatTitle = (chat) => {
    setEditingChatId(chat.id)
    setEditingTitle(chat.title)
  }

  const cancelEditChatTitle = () => {
    setEditingChatId(null)
    setEditingTitle('')
  }

  const saveEditingChatTitle = () => {
    const title = editingTitle.trim() || 'New chat'
    if (!editingChatId) return
    setChatSessions((prev) => {
      const next = prev.map((chat) =>
        chat.id === editingChatId ? { ...chat, title, updatedAt: new Date().toISOString() } : chat
      )
      saveChatSessions(next)
      return next
    })
    cancelEditChatTitle()
  }

  const deleteChatSession = (chatId) => {
    const nextChats = chatSessions.filter((chat) => chat.id !== chatId)
    if (!nextChats.length) {
      const newChat = createChatSession('New chat')
      setChatSessions([newChat])
      setActiveChatId(newChat.id)
      setAiConversation([])
      saveChatSessions([newChat])
      setShowChatMenu(false)
      return
    }

    const nextActiveId = activeChatId === chatId ? nextChats[0].id : activeChatId
    const activeChat = nextChats.find((chat) => chat.id === nextActiveId)

    setChatSessions(nextChats)
    setActiveChatId(nextActiveId)
    setAiConversation(activeChat?.messages || [])
    saveChatSessions(nextChats)
    setShowChatMenu(false)
    if (editingChatId === chatId) cancelEditChatTitle()
  }

  const createChatSession = (title) => ({
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: title || 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  })

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [aiConversation, aiLoading])

  useEffect(() => {
    if (visible && chatContainerRef.current) {
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
        }
      }, 0)
    }
  }, [visible])

  useEffect(() => {
    if (!showChatMenu) return

    const handleClickOutside = (event) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target)) {
        setShowChatMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showChatMenu])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const sessions = JSON.parse(raw)
        if (Array.isArray(sessions) && sessions.length) {
          setChatSessions(sessions)
          setActiveChatId(sessions[0].id)
          setAiConversation(sessions[0].messages || [])
          return
        }
      }
    } catch (err) {
      console.error('Failed to load chat sessions', err)
    }

    const firstChat = createChatSession('New chat')
    setChatSessions([firstChat])
    setActiveChatId(firstChat.id)
    setAiConversation([])
    saveChatSessions([firstChat])
  }, [storageKey])

  useEffect(() => {
    if (!activeChatId) return
    const activeChat = chatSessions.find((chat) => chat.id === activeChatId)
    if (activeChat) {
      setAiConversation(activeChat.messages || [])
    }
  }, [activeChatId, chatSessions])

  const createNewChat = () => {
    const newChat = createChatSession('New chat')
    setChatSessions((prev) => {
      const next = [newChat, ...prev]
      saveChatSessions(next)
      return next
    })
    setActiveChatId(newChat.id)
    setAiConversation([])
    setShowChatMenu(false)
  }

  const updateActiveChatMessages = (nextMessagesOrUpdater) => {
    setAiConversation((prev) => {
      const nextMessages = typeof nextMessagesOrUpdater === 'function' ? nextMessagesOrUpdater(prev) : nextMessagesOrUpdater
      setChatSessions((prevSessions) => {
        const next = prevSessions.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, messages: nextMessages, updatedAt: new Date().toISOString() }
            : chat
        )
        saveChatSessions(next)
        return next
      })
      return nextMessages
    })
  }

  if (!visible) return null

  const conversationHistory = aiConversation
    .slice(-25)
    .map((msg) => `User: ${msg.user}\nAI: ${msg.ai || '...'}`)
    .join('\n')

  const submitAIText = async () => {
    const text = aiInput.trim()
    if (!text) return

    const activeChat = chatSessions.find((chat) => chat.id === activeChatId)
    if (
      activeChat &&
      (activeChat.title === 'New chat' || activeChat.title.startsWith('Chat '))
    ) {
      setActiveChatTitle(getChatTitleFromText(text))
    }

    updateActiveChatMessages((prev) => [
      ...prev,
      {
        user: text,
        userTimestamp: new Date().toISOString(),
        ai: '',
        aiTimestamp: null,
      },
    ])

    setAiLoading(true)
    setAiInput('')
    await processWithAI(text)
    setAiLoading(false)
  }

  const processWithAI = async (userInput) => {
    const updateLastMessage = (aiReply) => {
      updateActiveChatMessages((prev) => {
        if (!prev.length) {
          return [
            {
              user: userInput,
              userTimestamp: new Date().toISOString(),
              ai: aiReply,
              aiTimestamp: new Date().toISOString(),
            },
          ]
        }

        const updated = [...prev]
        const last = updated[updated.length - 1]

        if (last.user === userInput && last.ai === '') {
          updated[updated.length - 1] = {
            ...last,
            ai: aiReply,
            aiTimestamp: new Date().toISOString(),
          }
        } else {
          updated.push({
            user: userInput,
            userTimestamp: new Date().toISOString(),
            ai: aiReply,
            aiTimestamp: new Date().toISOString(),
          })
        }

        return updated
      })
    }

    try {
      const existingEvents = events
        .map((e) => `${e.title} on ${e.date} at ${e.time} (${e.category})`)
        .join(', ')
      const now = new Date()
      const currentTime = now.toLocaleString()
      const currentDate = now.toISOString().slice(0, 10)

      const prompt = `You are an AI event assistant that helps users schedule, update, and delete calendar events.\n\nCurrent local date and time: ${currentTime} (date: ${currentDate})\nUse this to resolve relative date phrases like tomorrow, next week, and later today.\n\nExisting events: ${existingEvents || 'None'}\n\nConversation history (last 25 messages):\n${conversationHistory || 'None'}\n\nThe user said: "${userInput}"\n\nRespond only with a JSON object. Use one of the following actions:\n- save\n- update\n- delete\n- ask\n\nIf saving, include:\n{"action":"save","event":{"title":"...","category":"work|family|call|travel|personal","date":"YYYY-MM-DD","time":"HH:MM"}}\n\nIf updating, include:\n{"action":"update","criteria":{"title":"...","date":"YYYY-MM-DD","time":"HH:MM"},"event":{"title":"...","category":"...","date":"YYYY-MM-DD","time":"HH:MM"}}\n\nIf deleting, include:\n{"action":"delete","criteria":{"title":"...","date":"YYYY-MM-DD","time":"HH:MM"}}\n\nIf details are missing, ask one follow-up question like:\n{"action":"ask","question":"What date should I use for this event?"}\n\nDo not add any extra text outside the JSON object.`

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
              right: 0 !important;
              bottom: 0 !important;
              top: 0 !important;
              border-left: none !important;
              border-right: none !important;
              border-radius: 0 !important;
            }
            .ai-assistant-panel form {
              padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)) !important;
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
          maxWidth: '100vw',
          bottom: 0,
          background: themeVars.surface,
          borderLeft: `1px solid ${themeVars.surfaceBorder}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100,
        }}
      >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: themeVars.surface,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setShowChatMenu((prev) => !prev)}
            style={{
              background: 'transparent',
              border: 'none',
              color: themeVars.pageText,
              fontSize: '20px',
              cursor: 'pointer',
              padding: '6px',
            }}
            aria-label="Toggle chat menu"
          >
            ☰
          </button>
          <h3
            style={{
              fontFamily: 'Instrument Serif, serif',
              fontSize: '20px',
              margin: 0,
              color: themeVars.pageText,
            }}
          >
            Your Personal AI Scheduler
          </h3>
        </div>
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
      </div>

      {showChatMenu && (
        <div
          ref={menuContainerRef}
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${themeVars.surfaceBorder}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: themeVars.surface,
            position: 'sticky',
            top: '80px',
            zIndex: 15,
          }}
        >
          <button
            onClick={createNewChat}
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              border: 'none',
              background: themeVars.actionBg,
              color: themeVars.actionText,
              cursor: 'pointer',
              fontWeight: 700,
              alignSelf: 'flex-start',
            }}
          >
            New chat
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {chatSessions.map((chat) => (
              <div
                key={chat.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '8px',
                  alignItems: 'center',
                }}
              >
                {editingChatId === chat.id ? (
                  <input
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditingChatTitle()
                      if (e.key === 'Escape') cancelEditChatTitle()
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '14px',
                      border: `1px solid ${themeVars.surfaceBorder}`,
                      background: themeVars.inputBg,
                      color: themeVars.pageText,
                    }}
                  />
                ) : (
                  <button
                    onClick={() => {
                      setActiveChatId(chat.id)
                      setShowChatMenu(false)
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      borderRadius: '14px',
                      border: '1px solid',
                      borderColor: chat.id === activeChatId ? themeVars.accent : themeVars.surfaceBorder,
                      background: chat.id === activeChatId ? themeVars.accent : themeVars.surface,
                      color: chat.id === activeChatId ? themeVars.accentText : themeVars.pageText,
                      cursor: 'pointer',
                      fontSize: '14px',
                      whiteSpace: 'normal',
                    }}
                  >
                    {chat.title}
                  </button>
                )}

                {editingChatId === chat.id ? (
                  <button
                    onClick={saveEditingChatTitle}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '14px',
                      border: '1px solid ' + themeVars.surfaceBorder,
                      background: themeVars.actionBg,
                      color: themeVars.actionText,
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={() => startEditingChatTitle(chat)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '14px',
                      border: '1px solid ' + themeVars.surfaceBorder,
                      background: 'transparent',
                      color: themeVars.pageText,
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                )}

                <button
                  onClick={() => deleteChatSession(chat.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '14px',
                    border: '1px solid ' + themeVars.surfaceBorder,
                    background: themeVars.surface,
                    color: themeVars.pageText,
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${themeVars.surfaceBorder}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ fontSize: '14px', color: themeVars.muted }}>Active chat</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: themeVars.pageText }}>
          {chatSessions.find((chat) => chat.id === activeChatId)?.title || 'New chat'}
        </div>
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
              const previousTimestamp =
                i > 0
                  ? aiConversation[i - 1].aiTimestamp || aiConversation[i - 1].userTimestamp
                  : null
              const dayLabel = getDayLabel(msg.userTimestamp || msg.aiTimestamp, previousTimestamp)
              const isPendingAiMessage = msg.ai === '' && i === aiConversation.length - 1 && aiLoading

              return (
                <div key={i} style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dayLabel ? (
                    <div
                      style={{
                        alignSelf: 'center',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        background: themeVars.surfaceBorder,
                        color: themeVars.muted,
                        fontSize: '12px',
                      }}
                    >
                      {dayLabel}
                    </div>
                  ) : null}

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
                    <div style={{ marginTop: '8px', fontSize: '12px', color: themeVars.muted }}>
                      {formatTimeOnly(msg.userTimestamp)}
                    </div>
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
                      {msg.aiTimestamp ? (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: themeVars.accentText, opacity: 0.85 }}>
                          {formatTimeOnly(msg.aiTimestamp)}
                        </div>
                      ) : null}
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
              onChange={(e) => {
                setAiInput(e.target.value)
                setShowChatMenu(false)
              }}
              onFocus={() => setShowChatMenu(false)}
              placeholder="Type your event details and click OK"
              style={{
                flex: 1,
                minWidth: 0,
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
