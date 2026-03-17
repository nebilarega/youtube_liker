const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3001;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// Ensure downloads directory exists
fs.ensureDirSync(DOWNLOADS_DIR);

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Helper to sanitize filenames
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

// Download endpoint for single songs (remains as fallback)
app.get('/download', (req, res) => {
  const { v: videoId, title } = req.query;
  if (!videoId) return res.status(400).send('Missing video ID');

  const filename = sanitizeFilename(title || `song_${videoId}`) + '.mp3';
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const ytdlp = spawn('yt-dlp', ['-f', 'bestaudio', '-g', url]);
  let audioUrl = '';
  ytdlp.stdout.on('data', (data) => { audioUrl += data.toString().trim(); });
  ytdlp.on('close', (code) => {
    if (code !== 0 || !audioUrl) return res.status(500).send('Failed to fetch stream');
    ffmpeg(audioUrl).toFormat('mp3').audioBitrate(320).pipe(res, { end: true });
  });
});

// ZIP Endpoint
app.get('/download-zip', async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).send('Missing session ID');

  const sessionDir = path.join(DOWNLOADS_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) return res.status(404).send('Session not found or expired');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="youtube_songs_${sessionId.substring(0, 8)}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(sessionDir, false);
  
  archive.on('end', () => {
    console.log(`ZIP finished for ${sessionId}. Cleaning up...`);
    // Cleanup after 10 seconds to ensure the stream finishes
    setTimeout(() => fs.remove(sessionDir).catch(err => console.error('Cleanup error:', err)), 10000);
  });

  await archive.finalize();
});

// Socket.io for Batch Processing
io.on('connection', (socket) => {
  let sessionId = null;

  socket.on('start-batch', (data) => {
    sessionId = uuidv4();
    fs.ensureDirSync(path.join(DOWNLOADS_DIR, sessionId));
    socket.emit('batch-ready', { sessionId });
  });

  socket.on('process-song', async (data) => {
    const { id, title, sessionId: sid } = data;
    const sanitizedTitle = sanitizeFilename(title || 'Unknown Title');
    const outputPath = path.join(DOWNLOADS_DIR, sid, `${sanitizedTitle}.mp3`);
    const url = `https://www.youtube.com/watch?v=${id}`;

    try {
      socket.emit('status', { id, status: 'fetching', message: 'Fetching stream...' });

      const ytdlp = spawn('yt-dlp', ['-f', 'bestaudio', '-g', url]);
      let audioUrl = '';
      ytdlp.stdout.on('data', (data) => { audioUrl += data.toString().trim(); });

      ytdlp.on('close', (code) => {
        if (code !== 0 || !audioUrl) return socket.emit('status', { id, status: 'error', message: 'yt-dlp error' });

        socket.emit('status', { id, status: 'converting', message: 'Converting to MP3...' });

        ffmpeg(audioUrl)
          .toFormat('mp3')
          .audioBitrate(320)
          .on('error', (err) => socket.emit('status', { id, status: 'error', message: err.message }))
          .on('end', () => socket.emit('status', { id, status: 'ready', message: 'Saved to ZIP!' }))
          .save(outputPath);
      });

    } catch (err) {
      socket.emit('status', { id, status: 'error', message: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
