import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('') // 'error' or 'success'
  const navigate = useNavigate()

  async function handleForgotPassword(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setMessage(error.message)
      setMessageType('error')
    } else {
      setMessage('Check your email for a password reset link!')
      setMessageType('success')
      setTimeout(() => {
        navigate('/login')
      }, 3000)
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: '#0d0d0f'
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: '36px',
            color: '#f0ede6',
            marginBottom: '4px'
          }}>
            when<span style={{ color: '#E8C547', fontStyle: 'italic' }}>ever</span>
          </h1>
          <p style={{ color: '#999', fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Your personal AI scheduler
          </p>
        </div>

        <div style={{
          background: '#111113',
          border: '1px solid #1e1e22',
          borderRadius: '16px',
          padding: '32px'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '12px', color: '#f0ede6' }}>
            Reset Password
          </h2>
          <p style={{ color: '#999', fontSize: '13px', marginBottom: '24px' }}>
            Enter your email and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleForgotPassword}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#0d0d0f',
                  border: '1px solid #2a2a30',
                  borderRadius: '10px',
                  color: '#f0ede6',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            </div>

            {message && (
              <p style={{
                color: messageType === 'error' ? '#f07070' : '#7ee787',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                background: '#E8C547',
                color: '#0d0d0f',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', color: '#999', fontSize: '14px' }}>
          Remember your password?{' '}
          <a href="/login" style={{ color: '#E8C547', textDecoration: 'none', fontWeight: '500' }}>
            Log in
          </a>
        </p>

      </div>
    </div>
  )
}
