import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import Peer from 'peerjs'
import './App.css'

function generateRoomId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function BroadcasterPage() {
  const previewRef = useRef(null)
  const peerRef = useRef(null)
  const streamRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')

  const shareUrl = useMemo(() => {
    if (!roomId) {
      return ''
    }
    return `${window.location.origin}/watch/${roomId}`
  }, [roomId])

  const startBroadcast = async () => {
    if (status === 'starting' || status === 'live') {
      return
    }

    setError('')
    setStatus('starting')

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      streamRef.current = localStream

      if (previewRef.current) {
        previewRef.current.srcObject = localStream
      }

      const nextRoomId = generateRoomId()
      const peer = new Peer(nextRoomId)
      peerRef.current = peer

      peer.on('open', () => {
        setRoomId(nextRoomId)
        setStatus('live')
      })

      peer.on('connection', (conn) => {
        conn.on('open', () => {
          peer.call(conn.peer, localStream)
        })
      })

      peer.on('error', (peerError) => {
        setError(peerError.message || 'Failed to start broadcast')
        setStatus('idle')
      })
    } catch {
      setError('Camera/microphone permission is required to go live.')
      setStatus('idle')
    }
  }

  const stopBroadcast = () => {
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (previewRef.current) {
      previewRef.current.srcObject = null
    }

    setRoomId('')
    setStatus('idle')
    setError('')
  }

  useEffect(() => {
    const teardown = () => {
      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }

    return () => {
      teardown()
    }
  }, [])

  return (
    <main className="page">
      <section className="card">
        <h1>Start A Live Camera + Mic Stream</h1>
        <p className="subtext">
          Go live from this page and share one URL. Anyone opening that URL can
          watch video and hear your microphone audio.
        </p>

        <video ref={previewRef} autoPlay playsInline muted className="video" />

        <div className="actions">
          <button
            type="button"
            onClick={startBroadcast}
            disabled={status === 'starting' || status === 'live'}
          >
            {status === 'starting' ? 'Starting...' : 'Go Live'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={stopBroadcast}
            disabled={status !== 'live' && status !== 'starting'}
          >
            Stop
          </button>
        </div>

        {shareUrl && (
          <div className="shareBox">
            <p className="status">Live now. Share this URL:</p>
            <a href={shareUrl} target="_blank" rel="noreferrer">
              {shareUrl}
            </a>
          </div>
        )}

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}

function ViewerPage() {
  const { roomId = '' } = useParams()
  const videoRef = useRef(null)
  const peerRef = useRef(null)
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState('')

  useEffect(() => {
    let streamTimeout
    let gotStream = false
    const peer = new Peer()
    peerRef.current = peer

    const cleanup = () => {
      clearTimeout(streamTimeout)
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject
        stream.getTracks().forEach((track) => track.stop())
        videoRef.current.srcObject = null
      }
      peer.destroy()
    }

    peer.on('open', () => {
      const conn = peer.connect(roomId)

      conn.on('open', () => {
        setStatus('waiting')
      })

      conn.on('error', () => {
        setError('Could not connect to this stream URL.')
        setStatus('error')
      })
    })

    peer.on('call', (call) => {
      call.answer()

      call.on('stream', (remoteStream) => {
        gotStream = true
        clearTimeout(streamTimeout)
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream
          videoRef.current
            .play()
            .then(() => {
              setStatus('live')
            })
            .catch(() => {
              setStatus('live')
            })
        }
      })

      call.on('error', () => {
        setError('Live stream disconnected unexpectedly.')
        setStatus('error')
      })
    })

    peer.on('error', (peerError) => {
      if (peerError.type === 'peer-unavailable') {
        setError('No active broadcaster found for this URL.')
      } else {
        setError(peerError.message || 'Failed to connect to the stream.')
      }
      setStatus('error')
    })

    streamTimeout = window.setTimeout(() => {
      if (!gotStream) {
        setError('Stream is not live yet. Ask the broadcaster to start first.')
        setStatus('error')
      }
    }, 15000)

    return cleanup
  }, [roomId])

  return (
    <main className="page">
      <section className="card viewerCard">
        <h1>Watching Stream: {roomId}</h1>
        <p className="subtext">
          If audio does not auto-play in your browser, click inside the video to
          start playback.
        </p>

        <video ref={videoRef} autoPlay playsInline controls className="video" />

        <p className="status">
          {status === 'connecting' && 'Connecting...'}
          {status === 'waiting' && 'Connected. Waiting for broadcaster video...'}
          {status === 'live' && 'Live stream active'}
          {status === 'error' && 'Connection error'}
        </p>

        {error && <p className="error">{error}</p>}

        <Link to="/" className="homeLink">
          Start your own stream
        </Link>
      </section>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BroadcasterPage />} />
        <Route path="/watch/:roomId" element={<ViewerPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
