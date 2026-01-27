# FreeUpDrive - Google Drive Cleaner

A simple web app to identify and clean up screenshots and non-human photos from your Google Drive.

**Live at: https://freeupdrive.com**

## Features

- Connect to Google Drive via OAuth
- Scan for screenshots, memes, downloaded images, etc.
- Move unwanted photos to a "To Delete" folder for easy cleanup
- Modern, clean UI with ad support

## Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Photos Library API**:
   - Go to APIs & Services > Library
   - Search for "Photos Library API"
   - Click Enable

### 2. Create OAuth Credentials

1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application"
4. Add authorized redirect URI: `http://localhost:3000/api/auth/callback`
5. Copy the Client ID and Client Secret

### 3. Configure the App

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   PORT=3000
   ```

### 4. Install and Run

```bash
npm install
npm start
```

Open http://localhost:3000 in your browser.

## How It Works

The app detects non-human photos using filename patterns and image dimensions:

- **Screenshots**: Files named "screenshot", common screen dimensions
- **Downloaded Images**: Random hash filenames, generic names
- **WhatsApp Images**: IMG-YYYYMMDD-WA pattern
- **Document Scans**: Files containing "scan" or "document"
- **Memes**: Files from meme generators

## Important Limitation

The app moves identified photos to a folder called "🗑️ To Delete - Screenshots" in your Google Drive. You can then review and delete the entire folder at once.

## Tech Stack

- Node.js + Express
- Google Drive API v3
- Vanilla HTML/CSS/JS (no build step!)
