import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

const groqApiKey = import.meta.env.VITE_GROQ_API_KEY || ''

const parseGroqResponseText = (data) => {
  if (!data) return ''

  if (typeof data.output_text === 'string') return data.output_text
  if (typeof data.output === 'string') return data.output

  const choiceText = data?.choices?.[0]?.message?.content
  if (typeof choiceText === 'string') return choiceText

  if (typeof data?.choices?.[0]?.delta?.content === 'string') {
    return data.choices[0].delta.content
  }

  if (Array.isArray(data.output)) {
    return data.output
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && Array.isArray(item.content)) {
          return item.content
            .map((part) => (typeof part === 'string' ? part : part.text || ''))
            .join('')
        }
        return ''
      })
      .join('')
  }

  return ''
}

const getGroqReply = async (messages) => {
  if (!groqApiKey) {
    throw new Error('Missing VITE_GROQ_API_KEY in environment')
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqApiKey}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorBody}`)
  }

  const data = await response.json()
  return parseGroqResponseText(data)
}

const parseAIJsonResponse = (text) => {
  const cleaned = (text || '').trim()
  if (!cleaned) return { json: null, text: '' }

  // Find all top-level JSON object substrings by scanning for balanced braces
  const objects = []
  let depth = 0
  let start = -1
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && start !== -1) {
        objects.push(cleaned.slice(start, i + 1))
        start = -1
      }
    }
  }

  // Try parsing objects found; collect parsed JSON objects and pick the last successfully parsed
  const parsedList = []
  let lastParsed = null
  for (const objText of objects) {
    try {
      const p = JSON.parse(objText)
      parsedList.push(p)
      lastParsed = p
    } catch (e) {
      // ignore parse errors for individual objects
    }
  }

  // Build display text by removing all found JSON substrings
  let display = cleaned
  for (const objText of objects) {
    display = display.replace(objText, ' ')
  }
  display = display.trim()

  const buildReplyText = (displayText, response) => {
    const trimmed = (displayText || '').trim()
    if (trimmed) return trimmed
    if (!response || typeof response !== 'object') return ''

    const action = response.action
    if (action === 'save') {
      const title = response.event?.title || 'that event'
      const date = response.event?.date ? ` on ${response.event.date}` : ''
      const time = response.event?.time ? ` at ${response.event.time}` : ''
      return `Okay, I will save ${title}${date}${time}.`
    }
    if (action === 'update') {
      const title = response.event?.title || 'the event'
      const date = response.event?.date ? ` on ${response.event.date}` : ''
      const time = response.event?.time ? ` at ${response.event.time}` : ''
      return `Okay, I will update ${title}${date}${time}.`
    }
    if (action === 'delete') {
      return 'Okay, I will delete the matching event.'
    }
    if (action === 'ask') {
      const q = response.question?.trim()
      if (!q) return ''
      return q
    }
    return ''
  }

  // If no JSON objects found, attempt to parse any JSON-like content fallback
  if (!lastParsed) {
    try {
      lastParsed = JSON.parse(cleaned)
      display = ''
      parsedList.push(lastParsed)
    } catch (e) {
      lastParsed = null
    }
  }

  return {
    jsonList: parsedList,
    json: lastParsed,
    text: buildReplyText(display, lastParsed),
  }
}

export default function DashboardAI({ visible, onClose, events, setEvents, userId, themeVars, onEventChange }) {
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

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return alert('Voice not supported in this browser')

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.onresult = (e) => {
      setAiInput(e.results[0][0].transcript)
    }
    recognition.start()
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
      const currentDate = now.toISOString().slice(0, 10)
      const currentYear = now.getFullYear()

      const systemPrompt = `You are a friendly AI scheduling assistant. Today's date is ${currentDate} (${currentYear}). Always use ${currentYear} for any dates unless explicitly told otherwise.

    IMPORTANT RULES:
    1. NEVER save, update, or delete unless the user explicitly says "yes", "save it", "add it", "schedule it", "confirm", or "go ahead". "okay", "ok", "hmm", "sure", "alright" alone are NOT confirmation to save.
    2. After successfully saving an event, the conversation is DONE. Reply with a short confirmation like "Done! I've saved [event]." and use {"action":"ask","question":""} — do NOT ask what to schedule next.
    3. If the user says "okay" or "ok" after an event was just saved, treat it as acknowledgment only. Do NOT save again. Do NOT ask what to schedule next. Just reply "Let me know if there's anything else!" and use {"action":"ask","question":""}.
    4. "whole day", "all day", "entire day" means the user has not given a time — ask for a specific time, do not default to 00:00.
    5. Never explain your reasoning or thought process. Be direct and conversational.
    6. When proposing an event, state it in ONE short sentence: "Got it — [title] on [date] at [time] ([category]). Should I save this?"
    7. If time is missing, ask for it before proposing. Never propose with "unknown time".
    8. Never reveal internal JSON or processing to the user.
    9. Never ask "what would you like to schedule?" repeatedly. If the user seems done, just say "Let me know if you need anything else!"
    10. Keep track of context — if an event was just saved, don't offer to save it again.

    Respond with ONE short natural sentence, then on a new line the JSON object. Nothing else.

    If gathering info or waiting for confirmation:
    {"action":"ask","question":"..."}

    If saving (only after explicit confirmation):
    {"action":"save","event":{"title":"...","category":"work|family|call|travel|personal","date":"YYYY-MM-DD","time":"HH:MM"}}

    If updating (only after explicit confirmation):
    {"action":"update","criteria":{"title":"...","date":"YYYY-MM-DD"},"event":{"title":"...","category":"...","date":"YYYY-MM-DD","time":"HH:MM"}}

    If deleting (only after explicit confirmation):
    {"action":"delete","criteria":{"title":"...","date":"YYYY-MM-DD"}}

    Current events: ${existingEvents || 'none'}`

      const historyMessages = aiConversation
        .slice(-25)
        .filter((msg) => msg.ai)
        .flatMap((msg) => [
          { role: 'user', content: msg.user },
          { role: 'assistant', content: msg.ai },
        ])

      const messages = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userInput },
      ]

      const aiText = await getGroqReply(messages)
      const { json: aiResponse, text: aiDisplay } = parseAIJsonResponse(aiText)

      if (aiResponse?.action === 'save') {
        const savedEvent = await saveEventFromAI(aiResponse.event)
        if (savedEvent) {
          setEvents((prev) => [...prev, savedEvent].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)))
          onEventChange?.()
          updateLastMessage(`Done! I've saved ${savedEvent.title}.`)
        } else {
          updateLastMessage('I understood the event but could not save it. Please try again.')
        }
      } else if (aiResponse?.action === 'delete') {
        const deletedIds = await deleteEventFromAI(aiResponse.criteria)
        if (deletedIds?.length) {
          setEvents((prev) => prev.filter((event) => !deletedIds.includes(event.id)))
          onEventChange?.()
          updateLastMessage(`Done! Deleted ${deletedIds.length} event(s).`)
        } else {
          updateLastMessage('I could not find an event to delete with those details.')
        }
      } else if (aiResponse?.action === 'update') {
        const updatedEvent = await updateEventFromAI(aiResponse.criteria, aiResponse.event)
        if (updatedEvent) {
          setEvents((prev) => prev.map((event) => (event.id === updatedEvent.id ? updatedEvent : event)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)))
          onEventChange?.()
          updateLastMessage(`Done! I've updated ${updatedEvent.title}.`)
        } else {
          updateLastMessage('I could not find or update any matching event. Please give more exact details.')
        }
      } else if (aiResponse?.action === 'ask') {
        updateLastMessage(aiDisplay || aiResponse.question || 'Could you provide more details?')
      } else {
        // Show the conversational portion only (JSON is stripped by parser)
        updateLastMessage(aiDisplay || aiText || 'Sorry, I did not understand that.')
      }
    } catch (error) {
      console.error('AI processing error:', error)
      updateLastMessage('Sorry, I encountered an error. Please try again.')
    }
  }

  const saveEventFromAI = async (eventData) => {
    // Basic validation and normalization
    if (!eventData?.title || !eventData?.date || !eventData?.time) {
      console.error('Invalid event data from AI:', eventData)
      return null
    }

    const normalizedTime = String(eventData.time || '').trim().slice(0, 5) // keep HH:MM
    const category = eventData.category || 'personal'

    try {
      const payload = {
        user_id: userId,
        title: eventData.title,
        category,
        date: eventData.date,
        time: normalizedTime,
        notify_before: 15,
        status: 'upcoming',
      }

      const { data, error } = await supabase.from('events').insert([payload]).select().single()

      if (error) {
        console.error('Error saving event:', error, { payload })
        return null
      }

      console.debug('Event saved to supabase:', data)
      return data
    } catch (err) {
      console.error('Unexpected error saving event:', err, { eventData })
      return null
    }
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

          @keyframes blink {
            0%, 80%, 100% { opacity: 0; }
            40% { opacity: 1; }
          }

          .typing-indicator {
            display: inline-flex;
            gap: 4px;
            margin-left: 8px;
          }

          .typing-indicator .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            opacity: 0;
            animation: blink 1.4s infinite;
          }

          .typing-indicator .dot:nth-child(2) {
            animation-delay: 0.2s;
          }

          .typing-indicator .dot:nth-child(3) {
            animation-delay: 0.4s;
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
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
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
            position: 'absolute',
            top: '140px',
            left: 0,
            right: 0,
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
          flex: 1,
          padding: '20px',
          paddingTop: '140px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: '10px' }}>
          {aiConversation.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ color: themeVars.muted, fontSize: '13px', marginBottom: '12px' }}>
                Try saying:
              </p>
              {[
                'Schedule a team meeting tomorrow at 10am',
                'Remind me to call John on Friday at 3pm',
                'Add a travel event next Monday',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setAiInput(suggestion)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: `1px solid ${themeVars.surfaceBorder}`,
                    background: 'transparent',
                    color: themeVars.muted,
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
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
                      <span className="typing-indicator">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                      </span>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={aiInput}
                onChange={(e) => {
                  setAiInput(e.target.value)
                  setShowChatMenu(false)
                }}
                onFocus={() => setShowChatMenu(false)}
                placeholder="Schedule an event..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '14px 16px',
                  borderRadius: '14px',
                  border: `2px solid ${themeVars.accent}`,
                  background: themeVars.inputBg,
                  color: themeVars.pageText,
                  fontSize: '15px',
                  fontFamily: 'DM Sans, sans-serif',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={startVoiceInput}
                title="Voice input"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  border: `1px solid ${themeVars.inputBorder}`,
                  background: themeVars.inputBg,
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                🎙️
              </button>
              <button
                type="submit"
                disabled={aiLoading || !aiInput.trim()}
                style={{
                  padding: '14px 18px',
                  background: aiLoading ? '#999' : themeVars.actionBg,
                  color: themeVars.actionText,
                  border: 'none',
                  borderRadius: '14px',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: aiLoading || !aiInput.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  flexShrink: 0,
                }}
              >
                {aiLoading ? '...' : 'OK'}
              </button>
            </div>
            <div style={{
              fontSize: '11px',
              color: aiInput.length > 450 ? '#f07070' : themeVars.muted,
              textAlign: 'right',
              paddingRight: '4px',
            }}>
              {aiInput.length}/500
            </div>
          </div>
        </form>
      </div>
    </div>
    </>
  )
}
