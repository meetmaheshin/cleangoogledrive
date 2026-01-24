# Clean Google Photos

A simple web app to identify and clean up screenshots and non-human photos from your Google Photos library.

## Features

- Connect to Google Photos via OAuth
- Scan library for screenshots, memes, downloaded images, etc.
- Select and mark photos for deletion
- Simple, clean UI

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

**Google Photos API does not allow deleting photos that weren't uploaded by the app.**

This means the app can identify photos for deletion, but you'll need to delete them manually in Google Photos. The app shows you which photos to delete.

Workarounds:
- Use the app to identify photos, then delete manually
- Export the list of photo IDs for reference

## Tech Stack

- Node.js + Express
- Google Photos Library API
- Vanilla HTML/CSS/JS (no build step!)
