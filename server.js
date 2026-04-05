import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cors from 'cors';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000
});

const JWT_SECRET = process.env.JWT_SECRET || 'mandlscord-secret-key-2024';

// MongoDB подключение
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mandlscord';

async function connectDB() {
  if (process.env.NODE_ENV === 'production' || process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('[DB] Connected to MongoDB');
      return true;
    } catch (err) {
      console.error('[DB] MongoDB connection failed, using memory fallback');
      return false;
    }
  }
  console.log('[DB] No MONGODB_URI, using memory fallback');
  return false;
}

let useMongoDB = false;

// Cloudinary настройка
let cloudinaryConfigured = false;
if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.startsWith('cloudinary://')) {
  try {
    cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
    cloudinaryConfigured = true;
    console.log('[Cloudinary] Configured');
  } catch (err) {
    console.error('[Cloudinary] Config error:', err.message);
  }
} else {
  console.log('[Cloudinary] Not configured, files will use base64 fallback');
}

// === MongoDB Models ===
const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  username: { type: String, unique: true, lowercase: true },
  email: String,
  displayName: String,
  password: String,
  avatar: String,
  bio: { type: String, default: '' },
  status: { type: String, default: 'online' },
  createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  id: String,
  chatId: String,
  senderId: String,
  senderUsername: String,
  senderName: String,
  content: String,
  type: { type: String, enum: ['text', 'image', 'voice', 'video', 'audio', 'file'], default: 'text' },
  fileName: String,
  fileSize: Number,
  fileMimeType: String,
  duration: Number,
  timestamp: { type: Date, default: Date.now },
  readBy: [String],
  listenedBy: [String],
  deleted: { type: Boolean, default: false },
  deletedFor: [String]
});

const ChatSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  participants: [String],
  isGroup: Boolean,
  name: String,
  avatar: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Chat = mongoose.model('Chat', ChatSchema);

// === Memory fallback ===
const memUsers = new Map();
const memMessages = new Map();
const memChats = new Map();
const memDrafts = new Map();

function markDirty() {}
function saveData() {}

// === JWT ===
function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(authHeader.substring(7));
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  req.user = payload;
  next();
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

function safeUser(u) {
  if (!u) return null;
  const obj = u.toObject ? u.toObject() : { ...u };
  delete obj.password;
  return obj;
}

// === File upload (multer + cloudinary) ===
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const file = req.file;
  const type = req.body.type || 'file';

  if (cloudinaryConfigured) {
    try {
      const folder = `mandlscord/${type}`;
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: type === 'video' ? 'video' : type === 'audio' || type === 'voice' ? 'video' : 'auto' },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(file.buffer);
      });

      res.json({
        url: result.secure_url,
        fileName: file.originalname,
        fileSize: file.size,
        fileMimeType: file.mimetype,
        type
      });
    } catch (err) {
      console.error('[Cloudinary] Upload error:', err.message);
      // Fallback to base64
      const base64 = file.buffer.toString('base64');
      const dataUrl = `data:${file.mimetype};base64,${base64}`;
      res.json({ url: dataUrl, fileName: file.originalname, fileSize: file.size, fileMimeType: file.mimetype, type });
    }
  } else {
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;
    res.json({ url: dataUrl, fileName: file.originalname, fileSize: file.size, fileMimeType: file.mimetype, type });
  }
});

// === API Routes ===

app.get('/api/check-username/:username', async (req, res) => {
  const lower = req.params.username.toLowerCase();
  if (useMongoDB) {
    const exists = await User.findOne({ username: lower });
    return res.json({ exists: !!exists });
  }
  res.json({ exists: memUsers.has(lower) });
});

app.post('/api/register', async (req, res) => {
  const { username, email, displayName, password } = req.body;
  const lower = username.toLowerCase();

  if (useMongoDB) {
    const exists = await User.findOne({ username: lower });
    if (exists) return res.status(400).json({ error: 'Username exists' });
    const user = await User.create({
      id: Date.now().toString(), username: lower, email, displayName,
      password: hashPassword(password), avatar: null, bio: '', status: 'online'
    });
    const token = createToken({ userId: user.id, username: lower });
    return res.json({ user: safeUser(user), token });
  }

  if (memUsers.has(lower)) return res.status(400).json({ error: 'Username exists' });
  const user = {
    id: Date.now().toString(), username: lower, email, displayName,
    password: hashPassword(password), avatar: null, bio: '', status: 'online', createdAt: new Date().toISOString()
  };
  memUsers.set(lower, user);
  const token = createToken({ userId: user.id, username: lower });
  res.json({ user: safeUser(user), token });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const lower = username.toLowerCase();

  if (useMongoDB) {
    const user = await User.findOne({ username: lower });
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = createToken({ userId: user.id, username: lower });
    return res.json({ user: safeUser(user), token });
  }

  const user = memUsers.get(lower);
  if (!user || user.password !== hashPassword(password)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = createToken({ userId: user.id, username: lower });
  res.json({ user: safeUser(user), token });
});

app.get('/api/verify', authMiddleware, async (req, res) => {
  if (useMongoDB) {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'Not found' });
    return res.json({ user: safeUser(user) });
  }
  const user = memUsers.get(req.user.username);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user: safeUser(user) });
});

app.get('/api/ice-servers', async (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      {
        urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
        username: 'openrelayproject', credential: 'openrelayproject'
      }
    ]
  });
});

app.get('/api/users/search/:query', authMiddleware, async (req, res) => {
  const query = req.params.query.toLowerCase();
  let results = [];

  if (useMongoDB) {
    results = await User.find({ $or: [{ username: { $regex: query } }, { displayName: { $regex: query, $options: 'i' } }] });
  } else {
    memUsers.forEach((user) => {
      if (user.username.includes(query) || user.displayName.toLowerCase().includes(query)) {
        results.push(safeUser(user));
      }
    });
  }
  res.json({ users: results.map(safeUser) });
});

app.get('/api/users/:username', authMiddleware, async (req, res) => {
  let user;
  if (useMongoDB) {
    user = await User.findOne({ username: req.params.username.toLowerCase() });
  } else {
    user = memUsers.get(req.params.username.toLowerCase());
  }
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user: safeUser(user) });
});

app.put('/api/users/:username', authMiddleware, async (req, res) => {
  const lower = req.params.username.toLowerCase();
  if (req.user.username !== lower) return res.status(403).json({ error: 'Forbidden' });

  const updates = { ...req.body };
  delete updates.password;

  if (useMongoDB) {
    const user = await User.findOneAndUpdate({ username: lower }, { $set: updates }, { new: true });
    if (!user) return res.status(404).json({ error: 'Not found' });
    io.emit('user:updated', safeUser(user));
    if (updates.status) io.emit('user:status', { username: lower, status: updates.status });
    return res.json({ user: safeUser(user) });
  }

  const user = memUsers.get(lower);
  if (!user) return res.status(404).json({ error: 'Not found' });
  Object.assign(user, updates);
  memUsers.set(lower, user);
  io.emit('user:updated', safeUser(user));
  if (updates.status) io.emit('user:status', { username: lower, status: updates.status });
  res.json({ user: safeUser(user) });
});

// === Socket.io ===

const onlineUsers = new Map();
const userSockets = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth required'));
  const payload = verifyToken(token);
  if (!payload) return next(new Error('Invalid token'));
  socket.user = payload;
  next();
});

io.on('connection', (socket) => {
  const username = socket.user.username;

  onlineUsers.set(socket.id, username);
  userSockets.set(username, socket.id);

  io.emit('users:online', Array.from(onlineUsers.values()));
  io.emit('user:status', { username, status: 'online' });

  socket.on('user:status:update', async ({ status }) => {
    if (useMongoDB) {
      await User.updateOne({ username }, { status });
    } else {
      const u = memUsers.get(username);
      if (u) { u.status = status; memUsers.set(username, u); }
    }
    io.emit('user:status', { username, status });
  });

  socket.on('chat:get', async ({ participants, isGroup, name }, callback) => {
    const sorted = [...participants].sort();
    let chatId, chat;

    if (isGroup) {
      if (useMongoDB) {
        chat = await Chat.findOne({ isGroup: true, name, participants: { $all: sorted, $size: sorted.length } });
      } else {
        for (const [id, c] of memChats.entries()) {
          if (c.isGroup && c.name === name && c.participants.length === sorted.length && c.participants.every(p => sorted.includes(p))) {
            chat = c; chatId = id; break;
          }
        }
      }
      if (!chat) chatId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } else {
      chatId = `dm_${sorted.join('_')}`;
      if (useMongoDB) {
        chat = await Chat.findOne({ id: chatId });
      } else {
        chat = memChats.get(chatId);
      }
    }

    if (!chat) {
      const chatData = { id: chatId, participants: sorted, isGroup, name: name || null, createdAt: new Date().toISOString() };
      if (useMongoDB) {
        chat = await Chat.create(chatData);
      } else {
        memChats.set(chatId, chatData);
        memMessages.set(chatId, []);
      }
    }

    socket.join(chatId);

    let msgs = [];
    if (useMongoDB) {
      msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
    } else {
      msgs = memMessages.get(chatId) || [];
    }

    if (callback) callback({ chat: chat || chatData, messages: msgs });
  });

  socket.on('chats:get', async (callback) => {
    let allChats = [];
    if (useMongoDB) {
      allChats = await Chat.find({ participants: username });
    } else {
      memChats.forEach((chat, chatId) => {
        if (chat.participants.includes(username)) allChats.push({ ...chat, id: chatId });
      });
    }

    const result = [];
    for (const chat of allChats) {
      const chatId = chat.id;
      let msgs = [];
      if (useMongoDB) {
        msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
      } else {
        msgs = memMessages.get(chatId) || [];
      }
      const lastMessage = msgs[msgs.length - 1] || null;
      const unreadCount = msgs.filter(m => m.senderUsername !== username && (!m.readBy || !m.readBy.includes(username))).length;
      const others = chat.participants.filter(p => p !== username);

      let otherParticipants = [];
      for (const p of others) {
        let u;
        if (useMongoDB) u = await User.findOne({ username: p });
        else u = memUsers.get(p);
        otherParticipants.push(u ? safeUser(u) : { username: p, displayName: p });
      }

      result.push({ ...chat, lastMessage, otherParticipants, unreadCount });
    }
    result.sort((a, b) => new Date(b.lastMessage?.timestamp || b.createdAt) - new Date(a.lastMessage?.timestamp || a.createdAt));
    if (callback) callback(result);
  });

  socket.on('message:send', async ({ chatId, message }) => {
    const msg = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      ...message, timestamp: new Date().toISOString(), status: 'sent', readBy: [], listenedBy: []
    };

    if (useMongoDB) {
      await Message.create({ ...msg, chatId, timestamp: new Date() });
    } else {
      if (!memMessages.has(chatId)) memMessages.set(chatId, []);
      memMessages.get(chatId).push(msg);
    }

    io.to(chatId).emit('message:new', { chatId, message: msg });

    if (useMongoDB) {
      const chat = await Chat.findOne({ id: chatId });
      if (chat) {
        const allMsgs = await Message.find({ chatId }).sort({ timestamp: 1 });
        chat.participants.forEach(p => {
          const unreadCount = allMsgs.filter(m => m.senderUsername !== p && (!m.readBy || !m.readBy.includes(p))).length;
          io.emit(`chat:updated:${p}`, { chatId, lastMessage: msg, unreadCount });
        });
      }
    } else {
      const chat = memChats.get(chatId);
      if (chat) {
        const allMsgs = memMessages.get(chatId) || [];
        chat.participants.forEach(p => {
          const unreadCount = allMsgs.filter(m => m.senderUsername !== p && (!m.readBy || !m.readBy.includes(p))).length;
          io.emit(`chat:updated:${p}`, { chatId, lastMessage: msg, unreadCount });
        });
      }
    }
  });

  socket.on('chat:join', (chatId) => socket.join(chatId));
  socket.on('chat:leave', (chatId) => socket.leave(chatId));

  socket.on('messages:read', async ({ chatId, username: reader }) => {
    if (useMongoDB) {
      await Message.updateMany(
        { chatId, senderUsername: { $ne: reader }, readBy: { $ne: reader } },
        { $push: { readBy: reader } }
      );
      const msgs = await Message.find({ chatId }).sort({ timestamp: 1 });
      io.to(chatId).emit('messages:updated', { chatId, messages: msgs });
      const chat = await Chat.findOne({ id: chatId });
      if (chat) {
        const unreadCount = msgs.filter(m => m.senderUsername !== reader && (!m.readBy || !m.readBy.includes(reader))).length;
        io.emit(`chat:updated:${reader}`, { chatId, unreadCount });
      }
    } else {
      const msgs = memMessages.get(chatId);
      if (msgs) {
        let changed = false;
        msgs.forEach(m => {
          if (m.senderUsername !== reader) {
            if (!m.readBy) m.readBy = [];
            if (!m.readBy.includes(reader)) { m.readBy.push(reader); changed = true; }
          }
        });
        if (changed) {
          io.to(chatId).emit('messages:updated', { chatId, messages: msgs });
          const chat = memChats.get(chatId);
          if (chat) {
            const unreadCount = msgs.filter(m => m.senderUsername !== reader && (!m.readBy || !m.readBy.includes(reader))).length;
            io.emit(`chat:updated:${reader}`, { chatId, unreadCount });
          }
        }
      }
    }
  });

  socket.on('voice:listened', async ({ chatId, messageId, username: listener }) => {
    if (useMongoDB) {
      await Message.updateOne({ id: messageId }, { $addToSet: { listenedBy: listener } });
      const msg = await Message.findOne({ id: messageId });
      if (msg) io.to(chatId).emit('voice:updated', { messageId, listenedBy: msg.listenedBy });
    } else {
      const msgs = memMessages.get(chatId);
      if (msgs) {
        const m = msgs.find(x => x.id === messageId);
        if (m) {
          if (!m.listenedBy) m.listenedBy = [];
          if (!m.listenedBy.includes(listener)) {
            m.listenedBy.push(listener);
            io.to(chatId).emit('voice:updated', { messageId, listenedBy: m.listenedBy });
          }
        }
      }
    }
  });

  socket.on('typing:start', ({ chatId }) => socket.to(chatId).emit('typing:update', { chatId, username, isTyping: true }));
  socket.on('typing:stop', ({ chatId }) => socket.to(chatId).emit('typing:update', { chatId, username, isTyping: false }));

  socket.on('draft:save', ({ chatId, text }) => {
    if (!memDrafts.has(username)) memDrafts.set(username, {});
    const ud = memDrafts.get(username);
    if (text?.trim()) ud[chatId] = text; else delete ud[chatId];
    io.emit(`draft:sync:${username}`, { chatId, text: text || '' });
  });

  socket.on('drafts:get', (callback) => {
    if (callback) callback(memDrafts.get(username) || {});
  });

  socket.on('message:delete', async ({ chatId, messageId, username: deleter, forEveryone }) => {
    let msg;
    if (useMongoDB) {
      msg = await Message.findOne({ id: messageId, chatId });
    } else {
      const msgs = memMessages.get(chatId);
      if (msgs) msg = msgs.find(m => m.id === messageId);
    }
    if (!msg) return;

    const canDelete = msg.senderUsername === deleter || (Date.now() - new Date(msg.timestamp).getTime() < 48 * 60 * 60 * 1000);
    if (!canDelete) return;

    if (forEveryone) {
      if (useMongoDB) {
        await Message.updateOne({ id: messageId }, { deleted: true, content: 'Сообщение удалено' });
      } else {
        msg.deleted = true; msg.content = 'Сообщение удалено';
      }
      io.to(chatId).emit('message:deleted', { messageId, forEveryone: true });
    } else {
      if (useMongoDB) {
        await Message.updateOne({ id: messageId }, { $addToSet: { deletedFor: deleter } });
      } else {
        if (!msg.deletedFor) msg.deletedFor = [];
        msg.deletedFor.push(deleter);
      }
      socket.emit('message:deleted', { messageId, forEveryone: false, deletedFor: [deleter] });
    }
  });

  // WebRTC
  socket.on('call:initiate', ({ to, type, offer }) => {
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) {
      if (useMongoDB) {
        User.findOne({ username }).then(caller => {
          if (caller) io.to(targetSocket).emit('call:incoming', { from: safeUser(caller), type, offer });
        });
      } else {
        const caller = memUsers.get(username);
        if (caller) io.to(targetSocket).emit('call:incoming', { from: safeUser(caller), type, offer });
      }
    } else {
      socket.emit('call:error', { message: 'User offline' });
    }
  });

  socket.on('call:accept', ({ to, answer }) => {
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) io.to(targetSocket).emit('call:accepted', { answer });
  });

  socket.on('call:reject', ({ to }) => {
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) io.to(targetSocket).emit('call:rejected');
  });

  socket.on('call:end', ({ to }) => {
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) io.to(targetSocket).emit('call:ended');
  });

  socket.on('call:ice-candidate', ({ to, candidate }) => {
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket && candidate) io.to(targetSocket).emit('call:ice-candidate', { candidate });
  });

  // Group calls
  const groupCalls = new Map();

  socket.on('group-call:initiate', ({ chatId, chatName, roomId, participants, type, from }) => {
    groupCalls.set(roomId, { chatId, chatName, participants: new Set([from.username]), type, initiator: from.username });
    participants.forEach(p => {
      const ts = userSockets.get(p.toLowerCase());
      if (ts) io.to(ts).emit('group-call:incoming', { chatId, chatName, roomId, type, from, participants });
    });
  });

  socket.on('group-call:join', ({ chatId, roomId, from }) => {
    const call = groupCalls.get(roomId);
    if (call) {
      call.participants.forEach(p => {
        const ts = userSockets.get(p.toLowerCase());
        if (ts) io.to(ts).emit('group-call:user-joined', { chatId, roomId, username: from.username });
      });
      call.participants.add(from.username);
    }
  });

  socket.on('group-call:offer', ({ to, chatId, offer }) => {
    const ts = userSockets.get(to.toLowerCase());
    if (ts) io.to(ts).emit('group-call:offer', { from: username, chatId, offer });
  });

  socket.on('group-call:answer', ({ to, chatId, answer }) => {
    const ts = userSockets.get(to.toLowerCase());
    if (ts) io.to(ts).emit('group-call:answer', { from: username, chatId, answer });
  });

  socket.on('group-call:ice-candidate', ({ to, chatId, candidate }) => {
    const ts = userSockets.get(to.toLowerCase());
    if (ts && candidate) io.to(ts).emit('group-call:ice-candidate', { from: username, chatId, candidate });
  });

  socket.on('group-call:leave', ({ chatId, roomId, username: leaver }) => {
    const call = groupCalls.get(roomId);
    if (call) {
      call.participants.delete(leaver);
      call.participants.forEach(p => {
        const ts = userSockets.get(p.toLowerCase());
        if (ts) io.to(ts).emit('group-call:user-left', { chatId, roomId, username: leaver });
      });
      if (call.participants.size === 0) groupCalls.delete(roomId);
    }
  });

  socket.on('disconnect', async () => {
    if (useMongoDB) {
      await User.updateOne({ username }, { status: 'offline' });
    } else {
      const u = memUsers.get(username);
      if (u) { u.status = 'offline'; memUsers.set(username, u); }
    }
    onlineUsers.delete(socket.id);
    userSockets.delete(username);
    io.emit('users:online', Array.from(onlineUsers.values()));
    io.emit('user:status', { username, status: 'offline' });
  });
});

// Start
app.use(express.static(path.join(__dirname, 'dist')));
app.get('{*path}', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 3001;

connectDB().then(mongoOk => {
  useMongoDB = mongoOk;
  httpServer.listen(PORT, () => console.log(`Server on port ${PORT} | DB: ${useMongoDB ? 'MongoDB' : 'Memory'}`));
});
