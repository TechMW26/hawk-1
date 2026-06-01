# React Live Stream (Camera + Mic)

Simple React-based one-to-many live stream using WebRTC via PeerJS.

- Broadcaster starts camera + microphone stream.
- App generates a shareable URL like `/watch/<roomId>`.
- Viewers opening that URL can watch video and hear audio.

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` to broadcast.

## How It Works

- Broadcaster page: `/`
- Viewer page: `/watch/:roomId`
- Signaling is handled by PeerJS cloud signaling server.
- Media stream is browser-to-browser WebRTC.

## Build

```bash
npm run build
npm run preview
```

## Create GitHub Repo

```bash
git init
git add .
git commit -m "Initial React live streaming app"
gh repo create <your-repo-name> --public --source=. --remote=origin --push
```

If GitHub CLI is not authenticated, run:

```bash
gh auth login
```

## Deploy To Vercel

```bash
npm i -g vercel
vercel
vercel --prod
```

During first deploy:

- Select current directory.
- Framework: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.

After deployment, use your Vercel URL as the stream host.
