import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMessage(error.message)
    } else {
      navigate('/')
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
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '24px', color: '#f0ede6' }}>
            Welcome back
          </h2>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
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

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 44px 12px 16px',
                    background: '#0d0d0f',
                    border: '1px solid #2a2a30',
                    borderRadius: '10px',
                    color: '#f0ede6',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: showPassword ? '#E8C547' : '#1b1b20',
                    border: showPassword ? '1px solid #E8C547' : '1px solid #3a3a44',
                    color: showPassword ? '#0d0d0f' : '#f0ede6',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '15px',
                    lineHeight: 1
                  }}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {message && (
              <p style={{ color: '#f07070', fontSize: '13px', marginBottom: '16px' }}>
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
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', color: '#999', fontSize: '14px' }}>
          Don't have an account?{' '}
          <a href="/signup" style={{ color: '#E8C547', textDecoration: 'none', fontWeight: '500' }}>
            Sign up
          </a>
        </p>

      </div>
    </div>
  )
}