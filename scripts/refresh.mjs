#!/usr/bin/env node
/**
 * Remote refresh trigger for a HAWK broadcaster.
 *
 * Usage:
 *   node scripts/refresh.mjs <roomId> [pin]
 *
 * Example:
 *   node scripts/refresh.mjs 441cceb2 2001
 *
 * Sends a PIN-protected { type: 'admin-refresh' } data message to the
 * broadcaster peer via the public PeerJS broker. The broadcaster will
 * persist its resume state and reload, picking up the latest deployed
 * bundle. Viewers will momentarily reconnect.
 */

import { wrtc } from './wrtc-shim.mjs'
import WebSocket from 'ws'

// Polyfill browser globals BEFORE importing peerjs
globalThis.RTCPeerConnection = wrtc.RTCPeerConnection
globalThis.RTCSessionDescription = wrtc.RTCSessionDescription
globalThis.RTCIceCandidate = wrtc.RTCIceCandidate
globalThis.MediaStream = wrtc.MediaStream
globalThis.WebSocket = WebSocket

const { default: peerjsPkg } = await import('peerjs')
const Peer = peerjsPkg.Peer || peerjsPkg.default || peerjsPkg

const roomId = process.argv[2]
const pin = process.argv[3] || '2001'

if (!roomId) {
  console.error('Usage: node scripts/refresh.mjs <roomId> [pin]')
  process.exit(1)
}

const timeout = setTimeout(() => {
  console.error('Timed out waiting for broadcaster response.')
  process.exit(2)
}, 15000)

const peer = new Peer({ debug: 0, wrtc })

peer.on('open', (id) => {
  console.log(`[refresh] my peer id: ${id}`)
  console.log(`[refresh] connecting to broadcaster: ${roomId}`)
  const conn = peer.connect(roomId, { reliable: true, metadata: { kind: 'admin-cli' } })
  conn.on('open', () => {
    console.log('[refresh] channel open, sending admin-refresh')
    try {
      conn.send({ type: 'admin-refresh', pin })
    } catch (err) {
      console.error('[refresh] send failed', err)
      cleanup(3)
      return
    }
    setTimeout(() => {
      console.log('[refresh] done — broadcaster should be reloading')
      cleanup(0)
    }, 1500)
  })
  conn.on('error', (err) => {
    console.error('[refresh] conn error', err?.type || err)
    cleanup(4)
  })
})

peer.on('error', (err) => {
  console.error('[refresh] peer error', err?.type || err?.message || err)
  cleanup(5)
})

function cleanup(code) {
  clearTimeout(timeout)
  try { peer.destroy() } catch { /* noop */ }
  setTimeout(() => process.exit(code), 200)
}
