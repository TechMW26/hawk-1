// Tiny shim: load @roamhq/wrtc as the WebRTC implementation for PeerJS in Node.
import wrtcPkg from '@roamhq/wrtc'
export const wrtc = wrtcPkg
