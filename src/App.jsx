import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import Peer from 'peerjs'
import './App.css'

function generateRoomId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

function looksLikeUsbCamera(device) {
  const searchable = [device.label, device.deviceId, device.groupId]
    .filter(Boolean)
    .join(' ')

  // Raspberry Pi/Linux labels often include usb bus paths like "(usb-0000:01:00.0-1.2)"
  return /(usb|uvc|webcam|camera\s*\(.*usb|usb-[\w.:-]+|logitech|brio|elgato|anker|avermedia|microsoft)/i.test(
    searchable
  )
}

function BroadcasterPage() {
  const previewRef = useRef(null)
  const peerRef = useRef(null)
  const streamRef = useRef(null)
  const wakeLockRef = useRef(null)
  const statusRef = useRef('idle')
  const [status, setStatus] = useState('idle')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')
  const [cameras, setCameras] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const shareUrl = useMemo(() => {
    if (!roomId) {
      return ''
    }
    return `${window.location.origin}/watch/${roomId}`
  }, [roomId])

  const refreshCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const cameraDevices = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
        isUsb: looksLikeUsbCamera(device),
      }))

    setCameras(cameraDevices)

    setSelectedCameraId((currentValue) => {
      if (
        currentValue &&
        cameraDevices.some((camera) => camera.deviceId === currentValue)
      ) {
        return currentValue
      }
      return cameraDevices[0]?.deviceId || ''
    })
  }, [])

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) {
      return
    }

    await wakeLockRef.current.release().catch(() => {})
    wakeLockRef.current = null
    setWakeLockEnabled(false)
  }, [])

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || wakeLockRef.current) {
      return
    }

    try {
      const wakeLock = await navigator.wakeLock.request('screen')
      wakeLockRef.current = wakeLock
      setWakeLockEnabled(true)

      wakeLock.addEventListener('release', () => {
        wakeLockRef.current = null
        setWakeLockEnabled(false)
      })
    } catch {
      setWakeLockEnabled(false)
    }
  }, [])

  const startBroadcast = async () => {
    if (status === 'starting' || status === 'live') {
      return
    }

    setError('')
    setStatus('starting')

    try {
      const videoConstraint = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : true

      const localStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: true,
      })
      streamRef.current = localStream

      await refreshCameras()

      const activeVideoTrack = localStream.getVideoTracks()[0]
      const activeDeviceId = activeVideoTrack?.getSettings()?.deviceId
      if (activeDeviceId) {
        setSelectedCameraId(activeDeviceId)
      }

      if (previewRef.current) {
        previewRef.current.srcObject = localStream
      }

      const nextRoomId = generateRoomId()
      const peer = new Peer(nextRoomId)
      peerRef.current = peer

      peer.on('open', () => {
        setRoomId(nextRoomId)
        setStatus('live')
        requestWakeLock()
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

    releaseWakeLock()

    setRoomId('')
    setStatus('idle')
    setError('')
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshCameras()
    }, 0)

    const onDeviceChange = () => {
      refreshCameras()
    }

    navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && statusRef.current === 'live') {
        requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    const teardown = () => {
      clearTimeout(initialRefresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange)

      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      releaseWakeLock()
    }

    return () => {
      teardown()
    }
  }, [refreshCameras, releaseWakeLock, requestWakeLock])

  return (
    <main className="page">
      <section className="card">
        <h1>Start A Live Camera + Mic Stream</h1>
        <p className="subtext">
          Go live from this page and share one URL. Anyone opening that URL can
          watch video and hear your microphone audio.
        </p>

        <div className="cameraControls">
          <label htmlFor="cameraSelect">Camera Source</label>
          <div className="cameraRow">
            <select
              id="cameraSelect"
              value={selectedCameraId}
              onChange={(event) => setSelectedCameraId(event.target.value)}
              disabled={status === 'starting' || status === 'live' || cameras.length === 0}
            >
              {cameras.length === 0 && <option value="">No camera detected</option>}
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                  {camera.isUsb ? ' (USB)' : ''}
                </option>
              ))}
            </select>
            <button type="button" className="secondary detectBtn" onClick={refreshCameras}>
              Detect Cameras
            </button>
          </div>
          <p className="cameraHint">
            USB cams are auto-labeled from device identifiers, including
            Raspberry Pi/Linux usb bus labels.
          </p>
        </div>

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

        {status === 'live' && (
          <p className="status">
            Device awake mode: {wakeLockEnabled ? 'On' : 'Not available in this browser'}
          </p>
        )}
      </section>
    </main>
  )
}

function ViewerPage() {
  const { roomId = '' } = useParams()
  const videoRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const streamTimerRef = useRef(null)
  const attemptRef = useRef(0)
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState('')

  useEffect(() => {
    let activePeer = null
    let activeConn = null
    let activeCall = null
    let gotStream = false
    let cancelled = false

    const clearTimers = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current)
        streamTimerRef.current = null
      }
    }

    const stopMediaPlayback = () => {
      if (!videoRef.current?.srcObject) {
        return
      }
      const stream = videoRef.current.srcObject
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }

    const cleanupPeerOnly = () => {
      if (activeCall) {
        activeCall.close()
        activeCall = null
      }
      if (activeConn) {
        activeConn.close()
        activeConn = null
      }
      if (activePeer) {
        activePeer.destroy()
        activePeer = null
      }
    }

    const scheduleReconnect = (message) => {
      if (cancelled) {
        return
      }

      clearTimers()
      cleanupPeerOnly()

      if (!navigator.onLine) {
        setStatus('offline')
        setError('Network is offline. Waiting for connection...')
        return
      }

      attemptRef.current += 1
      const delayMs = Math.min(30000, 1000 * 2 ** Math.min(attemptRef.current - 1, 5))
      setStatus('reconnecting')
      setError(message)

      reconnectTimerRef.current = window.setTimeout(() => {
        connect()
      }, delayMs)
    }

    const connect = () => {
      if (cancelled) {
        return
      }

      clearTimers()
      cleanupPeerOnly()
      gotStream = false

      if (!navigator.onLine) {
        setStatus('offline')
        setError('Network is offline. Waiting for connection...')
        return
      }

      setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting')
      setError('')

      const peer = new Peer()
      activePeer = peer

      peer.on('open', () => {
        if (cancelled) {
          return
        }

        const conn = peer.connect(roomId)
        activeConn = conn

        conn.on('open', () => {
          if (!cancelled) {
            setStatus('waiting')
          }
        })

        conn.on('close', () => {
          if (!gotStream) {
            scheduleReconnect('Broadcaster not reachable yet. Retrying...')
          }
        })

        conn.on('error', () => {
          scheduleReconnect('Could not connect to this stream URL. Retrying...')
        })
      })

      peer.on('call', (call) => {
        activeCall = call
        call.answer()

        call.on('stream', (remoteStream) => {
          gotStream = true
          attemptRef.current = 0
          clearTimers()
          setError('')
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

        call.on('close', () => {
          scheduleReconnect('Stream disconnected. Reconnecting...')
        })

        call.on('error', () => {
          scheduleReconnect('Stream interrupted. Reconnecting...')
        })
      })

      peer.on('disconnected', () => {
        scheduleReconnect('Connection lost. Reconnecting...')
      })

      peer.on('close', () => {
        if (!cancelled) {
          scheduleReconnect('Peer closed. Reconnecting...')
        }
      })

      peer.on('error', (peerError) => {
        if (peerError.type === 'peer-unavailable') {
          scheduleReconnect('No active broadcaster found yet. Retrying...')
          return
        }
        scheduleReconnect(peerError.message || 'Failed to connect. Retrying...')
      })

      streamTimerRef.current = window.setTimeout(() => {
        if (!gotStream) {
          scheduleReconnect('No live stream yet. Retrying...')
        }
      }, 15000)
    }

    const onOnline = () => {
      setError('Network restored. Reconnecting...')
      setStatus('reconnecting')
      attemptRef.current = 0
      connect()
    }

    const onOffline = () => {
      clearTimers()
      cleanupPeerOnly()
      setStatus('offline')
      setError('Network is offline. Waiting for connection...')
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    connect()

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearTimers()
      cleanupPeerOnly()
      stopMediaPlayback()
    }
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
          {status === 'reconnecting' && 'Reconnecting...'}
          {status === 'offline' && 'Offline. Waiting for internet...'}
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
