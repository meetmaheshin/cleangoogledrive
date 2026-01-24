require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// In-memory session storage (use a proper session store in production)
let userTokens = null;

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${BASE_URL}/api/auth/callback`
);

// Scopes for Google Drive - full access to manage files
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file'
];

// Auth status endpoint
app.get('/api/auth/status', (req, res) => {
    res.json({ authenticated: !!userTokens });
});

// Start OAuth flow
app.get('/api/auth/google', (req, res) => {
    userTokens = null;
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    });
    res.redirect(authUrl);
});

// OAuth callback
app.get('/api/auth/callback', async (req, res) => {
    try {
        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        userTokens = tokens;
        oauth2Client.setCredentials(tokens);
        console.log('Auth successful, scopes:', tokens.scope);
        res.redirect('/');
    } catch (error) {
        console.error('Auth callback error:', error);
        res.redirect('/?error=auth_failed');
    }
});

// Logout
app.get('/api/auth/logout', (req, res) => {
    userTokens = null;
    res.json({ success: true });
});

// Scan photos for screenshots and non-human content using Google Drive API
app.get('/api/photos/scan', async (req, res) => {
    if (!userTokens) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        oauth2Client.setCredentials(userTokens);
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const nonHumanPhotos = [];
        let pageToken = null;

        // Search for image files in Drive
        do {
            const response = await drive.files.list({
                q: "mimeType contains 'image/' and trashed = false",
                fields: 'nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, imageMediaMetadata, createdTime)',
                pageSize: 100,
                pageToken: pageToken,
                orderBy: 'createdTime desc'
            });

            const files = response.data.files || [];
            console.log(`Found ${files.length} images...`);

            for (const file of files) {
                const analysis = analyzePhoto(file);
                if (analysis.isNonHuman) {
                    nonHumanPhotos.push({
                        id: file.id,
                        filename: file.name,
                        baseUrl: `/api/thumbnail/${file.id}`,
                        mimeType: file.mimeType,
                        detectedType: analysis.type,
                        creationTime: file.createdTime
                    });
                }
            }

            pageToken = response.data.nextPageToken;

            // Limit scanning for demo
            if (nonHumanPhotos.length >= 100 || !pageToken) break;

        } while (pageToken);

        console.log(`Found ${nonHumanPhotos.length} non-human photos`);
        res.json({ photos: nonHumanPhotos });

    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Analyze a photo to determine if it's a screenshot or non-human content
function analyzePhoto(file) {
    const filename = (file.name || '').toLowerCase();
    const metadata = file.imageMediaMetadata || {};
    const width = parseInt(metadata.width) || 0;
    const height = parseInt(metadata.height) || 0;

    const mimeType = (file.mimeType || '').toLowerCase();

    // Detection rules for screenshots and non-human photos
    const rules = [
        // Screenshot patterns
        {
            check: () => filename.includes('screenshot'),
            type: 'Screenshot'
        },
        {
            check: () => filename.includes('screen shot'),
            type: 'Screenshot'
        },
        {
            check: () => filename.match(/^img_\d+\.png$/i),
            type: 'Screenshot (iOS)'
        },
        {
            check: () => filename.match(/^screenshot_\d/i),
            type: 'Screenshot (Android)'
        },
        {
            check: () => filename.match(/^screen_\d/i),
            type: 'Screenshot'
        },
        {
            check: () => filename.match(/^scr_\d/i),
            type: 'Screenshot'
        },
        // PNG files are often screenshots
        {
            check: () => mimeType === 'image/png' && !filename.includes('logo'),
            type: 'PNG (likely screenshot)'
        },
        {
            // Common screenshot dimensions
            check: () => {
                const screenshotDimensions = [
                    [1920, 1080], [2560, 1440], [1366, 768], [1440, 900],
                    [1280, 720], [2880, 1800], [3840, 2160], // Desktop
                    [1170, 2532], [1284, 2778], [1125, 2436], // iPhone
                    [1080, 2340], [1080, 2400], [1440, 3200], // Android
                    [750, 1334], [1242, 2208], // Older iPhone
                ];
                return screenshotDimensions.some(([w, h]) =>
                    (width === w && height === h) || (width === h && height === w)
                );
            },
            type: 'Possible Screenshot'
        },
        // Document scans
        {
            check: () => filename.includes('scan') || filename.includes('document'),
            type: 'Document Scan'
        },
        // Memes / Downloads with hash names
        {
            check: () => filename.match(/^[a-f0-9]{8,}\.(jpe?g|png|webp)$/i),
            type: 'Downloaded Image'
        },
        {
            check: () => filename.includes('meme') || filename.includes('imgflip'),
            type: 'Meme'
        },
        // WhatsApp forwarded images
        {
            check: () => filename.match(/^img-\d{8}-wa\d+/i),
            type: 'WhatsApp Image'
        },
        // Telegram images
        {
            check: () => filename.match(/^photo_\d+/i),
            type: 'Telegram Image'
        },
        // Received images with generic names
        {
            check: () => filename.match(/^image\d*\.(jpe?g|png)$/i),
            type: 'Generic Image'
        },
        // Text-heavy images (receipts, etc)
        {
            check: () => filename.includes('receipt') || filename.includes('invoice'),
            type: 'Receipt/Invoice'
        },
        // Twitter/X downloads
        {
            check: () => filename.match(/^[A-Za-z0-9_-]{15,}\.(jpe?g|png)$/i),
            type: 'Social Media Download'
        }
    ];

    for (const rule of rules) {
        if (rule.check()) {
            return { isNonHuman: true, type: rule.type };
        }
    }

    return { isNonHuman: false, type: null };
}

// Proxy endpoint for thumbnails (Drive thumbnails need auth)
app.get('/api/thumbnail/:fileId', async (req, res) => {
    if (!userTokens) {
        return res.status(401).send('Not authenticated');
    }

    try {
        oauth2Client.setCredentials(userTokens);
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Get file metadata to check if it has a thumbnail
        const fileMeta = await drive.files.get({
            fileId: req.params.fileId,
            fields: 'thumbnailLink, mimeType'
        });

        // If thumbnailLink exists, fetch it with auth
        if (fileMeta.data.thumbnailLink) {
            const thumbnailUrl = fileMeta.data.thumbnailLink;
            const thumbResponse = await fetch(thumbnailUrl, {
                headers: { Authorization: `Bearer ${userTokens.access_token}` }
            });
            const buffer = await thumbResponse.arrayBuffer();
            res.set('Content-Type', 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=3600');
            res.send(Buffer.from(buffer));
        } else {
            // Fetch actual file content (smaller version)
            const response = await drive.files.get({
                fileId: req.params.fileId,
                alt: 'media'
            }, { responseType: 'arraybuffer' });

            res.set('Content-Type', fileMeta.data.mimeType || 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=3600');
            res.send(Buffer.from(response.data));
        }
    } catch (error) {
        console.error('Thumbnail error:', error.message);
        // Return a simple placeholder SVG
        res.set('Content-Type', 'image/svg+xml');
        res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
            <rect fill="#f0f0f0" width="200" height="150"/>
            <text x="100" y="75" text-anchor="middle" fill="#999" font-family="Arial" font-size="14">Image</text>
        </svg>`);
    }
});

// Move photos to a "To Delete" folder
app.post('/api/photos/delete', async (req, res) => {
    if (!userTokens) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No photo IDs provided' });
    }

    try {
        oauth2Client.setCredentials(userTokens);
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Step 1: Create or find the "To Delete - Screenshots" folder
        const folderName = '🗑️ To Delete - Screenshots';
        let folderId = null;

        // Search for existing folder
        const folderSearch = await drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (folderSearch.data.files && folderSearch.data.files.length > 0) {
            folderId = folderSearch.data.files[0].id;
            console.log('Found existing folder:', folderId);
        } else {
            // Create new folder
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            };
            const folder = await drive.files.create({
                requestBody: folderMetadata,
                fields: 'id'
            });
            folderId = folder.data.id;
            console.log('Created new folder:', folderId);
        }

        // Step 2: Move files to the folder
        let movedCount = 0;
        const errors = [];

        for (const fileId of ids) {
            try {
                // Get current parents
                const file = await drive.files.get({
                    fileId: fileId,
                    fields: 'parents'
                });

                const previousParents = file.data.parents ? file.data.parents.join(',') : '';

                // Move file to the new folder
                await drive.files.update({
                    fileId: fileId,
                    addParents: folderId,
                    removeParents: previousParents,
                    fields: 'id, parents'
                });

                movedCount++;
                console.log(`Moved file ${fileId} to folder`);
            } catch (err) {
                console.error(`Failed to move file ${fileId}:`, err.message);
                errors.push({ id: fileId, error: err.message });
            }
        }

        res.json({
            success: true,
            moved: movedCount,
            folderName: folderName,
            folderId: folderId,
            errors: errors.length > 0 ? errors : undefined,
            message: `Moved ${movedCount} photos to folder "${folderName}". Open Google Drive, find this folder, and delete it when ready.`
        });

    } catch (error) {
        console.error('Move error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('\nSetup required:');
    console.log('1. Enable Google Drive API in Cloud Console');
    console.log('2. Create OAuth 2.0 credentials');
    console.log(`3. Add http://localhost:${PORT}/api/auth/callback as redirect URI`);
});
