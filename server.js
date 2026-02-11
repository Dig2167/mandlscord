import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const JWT_SECRET = process.env.JWT_SECRET || 'mandlscord-secret-key-2024';

function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
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
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.user = payload;
  next();
}

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return {
        users: new Map(Object.entries(data.users || {})),
        messages: new Map(Object.entries(data.messages || {})),
        chats: new Map(Object.entries(data.chats || {}))
      };
    }
  } catch (err) {
    console.error('Load error:', err.message);
  }
  return { users: new Map(), messages: new Map(), chats: new Map() };
}

// Данные
const loadedData = loadData();
const users = loadedData.users;
const messages = loadedData.messages;
const chats = loadedData.chats;
const drafts = new Map(); // username -> { chatId: text }
const onlineUsers = new Map();
const userSockets = new Map();

console.log(`Loaded: ${users.size} users, ${chats.size} chats`);

// Сохранение - только при важных изменениях
let needsSave = false;

function saveData() {
  if (!needsSave) return;
  try {
    const data = {
      users: Object.fromEntries(users),
      messages: Object.fromEntries(messages),
      chats: Object.fromEntries(chats)
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
    needsSave = false;
    console.log('Saved');
  } catch (err) {
    console.error('Save error:', err.message);
  }
}

function markDirty() {
  needsSave = true;
}

// Сохраняем каждые 2 минуты если есть изменения
setInterval(saveData, 120000);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

// === API ===

app.get('/api/check-username/:username', (req, res) => {
  res.json({ exists: users.has(req.params.username.toLowerCase()) });
});

app.post('/api/register', (req, res) => {
  const { username, email, displayName, password } = req.body;
  const lower = username.toLowerCase();
  
  if (users.has(lower)) {
    return res.status(400).json({ error: 'Username exists' });
  }
  
  const user = {
    id: Date.now().toString(),
    username: lower,
    email,
    displayName,
    password: hashPassword(password),
    avatar: null,
    bio: '',
    status: 'online',
    createdAt: new Date().toISOString()
  };
  
  users.set(lower, user);
  markDirty();
  saveData();
  
  const token = createToken({ userId: user.id, username: lower });
  const { password: _, ...safe } = user;
  res.json({ user: safe, token });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const lower = username.toLowerCase();
  const user = users.get(lower);
  
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = createToken({ userId: user.id, username: lower });
  const { password: _, ...safe } = user;
  res.json({ user: safe, token });
});

app.get('/api/verify', authMiddleware, (req, res) => {
  const user = users.get(req.user.username);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password: _, ...safe } = user;
  res.json({ user: safe });
});

// ICE серверы для WebRTC
app.get('/api/ice-servers', async (req, res) => {
  const METERED_API_KEY = process.env.METERED_API_KEY;
  
  if (METERED_API_KEY) {
    try {
      // Metered.ca API - получаем временные credentials
      const response = await fetch(`https://mandlscord.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
      if (response.ok) {
        const iceServers = await response.json();
        console.log('[ICE] Got', iceServers.length, 'servers from Metered.ca');
        return res.json({ iceServers });
      } else {
        console.log('[ICE] Metered.ca returned status:', response.status);
      }
    } catch (err) {
      console.error('[ICE] Metered.ca error:', err.message);
    }
  } else {
    console.log('[ICE] No METERED_API_KEY set, using fallback');
  }
  
  // Fallback серверы - множество бесплатных TURN
  res.json({
    iceServers: [
      // Google STUN
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // OpenRelay TURN - бесплатный публичный
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      // Secure TURN
      {
        urls: 'turns:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });
});

app.get('/api/users/search/:query', authMiddleware, (req, res) => {
  const query = req.params.query.toLowerCase();
  const results = [];
  users.forEach((user) => {
    if (user.username.includes(query) || user.displayName.toLowerCase().includes(query)) {
      const { password: _, ...safe } = user;
      results.push(safe);
    }
  });
  res.json({ users: results });
});

app.get('/api/users/:username', authMiddleware, (req, res) => {
  const user = users.get(req.params.username.toLowerCase());
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password: _, ...safe } = user;
  res.json({ user: safe });
});

app.put('/api/users/:username', authMiddleware, (req, res) => {
  const lower = req.params.username.toLowerCase();
  if (req.user.username !== lower) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const user = users.get(lower);
  if (!user) return res.status(404).json({ error: 'Not found' });
  
  const updates = req.body;
  delete updates.password;
  Object.assign(user, updates);
  users.set(lower, user);
  markDirty();
  saveData();
  
  const { password: _, ...safe } = user;
  io.emit('user:updated', safe);
  if (updates.status) {
    io.emit('user:status', { username: lower, status: updates.status });
  }
  res.json({ user: safe });
});

// === Socket.io ===

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
  
  const user = users.get(username);
  if (user && user.status !== 'invisible' && user.status !== 'offline') {
    io.emit('user:status', { username, status: user.status });
  } else if (user && user.status === 'offline') {
    user.status = 'online';
    users.set(username, user);
    io.emit('user:status', { username, status: 'online' });
  }
  
  io.emit('users:online', Array.from(onlineUsers.values()));
  
  // Статус
  socket.on('user:status:update', ({ status }) => {
    const u = users.get(username);
    if (u) {
      u.status = status;
      users.set(username, u);
      io.emit('user:status', { username, status });
      markDirty();
    }
  });
  
  // Получить чат
  socket.on('chat:get', ({ participants, isGroup, name }, callback) => {
    const sorted = [...participants].sort();
    let chatId = null;
    let chat = null;
    
    if (isGroup) {
      for (const [id, c] of chats.entries()) {
        if (c.isGroup && c.name === name && 
            c.participants.length === sorted.length &&
            c.participants.every(p => sorted.includes(p))) {
          chat = c;
          chatId = id;
          break;
        }
      }
      if (!chat) {
        chatId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
    } else {
      chatId = `dm_${sorted.join('_')}`;
      chat = chats.get(chatId);
    }
    
    if (!chat) {
      chat = { id: chatId, participants: sorted, isGroup, name: name || null, createdAt: new Date().toISOString() };
      chats.set(chatId, chat);
      messages.set(chatId, []);
      markDirty();
      saveData();
    }
    
    socket.join(chatId);
    if (callback) callback({ chat, messages: messages.get(chatId) || [] });
  });
  
  // Список чатов
  socket.on('chats:get', (callback) => {
    const result = [];
    chats.forEach((chat, chatId) => {
      if (chat.participants.includes(username)) {
        const msgs = messages.get(chatId) || [];
        const lastMessage = msgs[msgs.length - 1] || null;
        
        // Считаем непрочитанные
        const unreadCount = msgs.filter(m => 
          m.senderUsername !== username && 
          (!m.readBy || !m.readBy.includes(username))
        ).length;
        
        const others = chat.participants.filter(p => p !== username).map(p => {
          const u = users.get(p);
          if (u) {
            const { password: _, ...safe } = u;
            return safe;
          }
          return { username: p, displayName: p };
        });
        result.push({ ...chat, lastMessage, otherParticipants: others, unreadCount });
      }
    });
    result.sort((a, b) => {
      const at = a.lastMessage?.timestamp || a.createdAt;
      const bt = b.lastMessage?.timestamp || b.createdAt;
      return new Date(bt) - new Date(at);
    });
    if (callback) callback(result);
  });
  
  // Отправка сообщения
  socket.on('message:send', ({ chatId, message }) => {
    const msg = {
      id: Date.now().toString(),
      ...message,
      timestamp: new Date().toISOString(),
      status: 'sent',
      readBy: [],
      listenedBy: []
    };
    
    if (!messages.has(chatId)) messages.set(chatId, []);
    messages.get(chatId).push(msg);
    markDirty();
    
    io.to(chatId).emit('message:new', { chatId, message: msg });
    
    const chat = chats.get(chatId);
    if (chat) {
      const allMsgs = messages.get(chatId) || [];
      chat.participants.forEach(p => {
        // Считаем непрочитанные для каждого участника
        const unreadCount = allMsgs.filter(m => 
          m.senderUsername !== p && 
          (!m.readBy || !m.readBy.includes(p))
        ).length;
        io.emit(`chat:updated:${p}`, { chatId, lastMessage: msg, unreadCount });
      });
    }
  });
  
  socket.on('chat:join', (chatId) => socket.join(chatId));
  socket.on('chat:leave', (chatId) => socket.leave(chatId));
  
  // Прочитано
  socket.on('messages:read', ({ chatId, username: reader }) => {
    const msgs = messages.get(chatId);
    if (msgs) {
      let changed = false;
      msgs.forEach(m => {
        if (m.senderUsername !== reader) {
          if (!m.readBy) m.readBy = [];
          if (!m.readBy.includes(reader)) {
            m.readBy.push(reader);
            changed = true;
          }
        }
      });
      if (changed) {
        io.to(chatId).emit('messages:updated', { chatId, messages: msgs });
        
        // Отправляем обновление счётчика непрочитанных
        const chat = chats.get(chatId);
        if (chat) {
          const unreadCount = msgs.filter(m => 
            m.senderUsername !== reader && 
            (!m.readBy || !m.readBy.includes(reader))
          ).length;
          io.emit(`chat:updated:${reader}`, { chatId, unreadCount });
        }
        
        markDirty();
      }
    }
  });
  
  // Голосовое прослушано
  socket.on('voice:listened', ({ chatId, messageId, username: listener }) => {
    const msgs = messages.get(chatId);
    if (msgs) {
      const m = msgs.find(x => x.id === messageId);
      if (m) {
        if (!m.listenedBy) m.listenedBy = [];
        if (!m.listenedBy.includes(listener)) {
          m.listenedBy.push(listener);
          io.to(chatId).emit('voice:updated', { messageId, listenedBy: m.listenedBy });
          markDirty();
        }
      }
    }
  });
  
  socket.on('typing:start', ({ chatId }) => socket.to(chatId).emit('typing:update', { chatId, username, isTyping: true }));
  socket.on('typing:stop', ({ chatId }) => socket.to(chatId).emit('typing:update', { chatId, username, isTyping: false }));
  
  // Черновики
  socket.on('draft:save', ({ chatId, text }) => {
    if (!drafts.has(username)) drafts.set(username, {});
    const userDrafts = drafts.get(username);
    if (text && text.trim()) {
      userDrafts[chatId] = text;
    } else {
      delete userDrafts[chatId];
    }
    // Синхронизируем с другими устройствами этого пользователя
    io.emit(`draft:sync:${username}`, { chatId, text: text || '' });
  });
  
  socket.on('drafts:get', (callback) => {
    const userDrafts = drafts.get(username) || {};
    if (callback) callback(userDrafts);
  });
  
  // Удаление сообщения
  socket.on('message:delete', ({ chatId, messageId, username: deleter, forEveryone }) => {
    const msgs = messages.get(chatId);
    if (!msgs) return;
    
    const msgIndex = msgs.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    
    const msg = msgs[msgIndex];
    
    // Можно удалить только своё сообщение или в течение 48 часов
    const canDelete = msg.senderUsername === deleter || 
      (Date.now() - new Date(msg.timestamp).getTime() < 48 * 60 * 60 * 1000);
    
    if (!canDelete) return;
    
    if (forEveryone) {
      msg.deleted = true;
      msg.content = 'Сообщение удалено';
      msgs[msgIndex] = msg;
      io.to(chatId).emit('message:deleted', { messageId, forEveryone: true });
    } else {
      if (!msg.deletedFor) msg.deletedFor = [];
      msg.deletedFor.push(deleter);
      msgs[msgIndex] = msg;
      socket.emit('message:deleted', { messageId, forEveryone: false, deletedFor: msg.deletedFor });
    }
    
    markDirty();
  });
  
  // === WebRTC ===
  
  socket.on('call:initiate', ({ to, type, offer }) => {
    console.log(`[CALL] ${username} -> ${to} (${type})`);
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) {
      const caller = users.get(username);
      if (caller) {
        const { password: _, ...safe } = caller;
        console.log(`[CALL] Sending incoming to socket: ${targetSocket}`);
        io.to(targetSocket).emit('call:incoming', { from: safe, type, offer });
      }
    } else {
      console.log(`[CALL] User ${to} offline`);
      socket.emit('call:error', { message: 'User offline' });
    }
  });
  
  socket.on('call:accept', ({ to, answer }) => {
    console.log(`[CALL] ${username} accepted call from ${to}`);
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) {
      console.log(`[CALL] Sending accepted to socket: ${targetSocket}`);
      io.to(targetSocket).emit('call:accepted', { answer });
    } else {
      console.log(`[CALL] Cannot find socket for ${to}`);
    }
  });
  
  socket.on('call:reject', ({ to }) => {
    console.log(`[CALL] ${username} rejected call from ${to}`);
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) io.to(targetSocket).emit('call:rejected');
  });
  
  socket.on('call:end', ({ to }) => {
    console.log(`[CALL] ${username} ended call with ${to}`);
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) io.to(targetSocket).emit('call:ended');
  });
  
  socket.on('call:ice-candidate', ({ to, candidate }) => {
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket && candidate) {
      io.to(targetSocket).emit('call:ice-candidate', { candidate });
    }
  });
  
  // === GROUP CALLS ===
  
  // Хранилище активных групповых звонков
  const groupCalls = new Map(); // chatId -> { participants: Set<username>, type: string }
  
  socket.on('group-call:initiate', ({ chatId, chatName, roomId, participants, type, from }) => {
    console.log(`[GROUP CALL] ${from.username} initiating call in ${chatName}, room: ${roomId}`);
    
    // Создаём групповой звонок
    groupCalls.set(roomId, {
      chatId,
      chatName,
      participants: new Set([from.username]),
      type,
      initiator: from.username
    });
    
    // Отправляем приглашение всем участникам
    participants.forEach(p => {
      const targetSocket = userSockets.get(p.toLowerCase());
      if (targetSocket) {
        io.to(targetSocket).emit('group-call:incoming', {
          chatId,
          chatName,
          roomId,
          type,
          from,
          participants
        });
      }
    });
  });
  
  socket.on('group-call:join', ({ chatId, roomId, from }) => {
    console.log(`[GROUP CALL] ${from.username} joining call ${roomId}`);
    
    const call = groupCalls.get(roomId);
    if (call) {
      // Уведомляем всех текущих участников о новом
      call.participants.forEach(p => {
        const targetSocket = userSockets.get(p.toLowerCase());
        if (targetSocket) {
          io.to(targetSocket).emit('group-call:user-joined', { chatId, roomId, username: from.username });
        }
      });
      
      // Добавляем в список участников
      call.participants.add(from.username);
    }
  });
  
  socket.on('group-call:offer', ({ to, chatId, offer }) => {
    console.log(`[GROUP CALL] Offer from ${username} to ${to}`);
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('group-call:offer', { from: username, chatId, offer });
    }
  });
  
  socket.on('group-call:answer', ({ to, chatId, answer }) => {
    console.log(`[GROUP CALL] Answer from ${username} to ${to}`);
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket) {
      io.to(targetSocket).emit('group-call:answer', { from: username, chatId, answer });
    }
  });
  
  socket.on('group-call:ice-candidate', ({ to, chatId, candidate }) => {
    const targetSocket = userSockets.get(to.toLowerCase());
    if (targetSocket && candidate) {
      io.to(targetSocket).emit('group-call:ice-candidate', { from: username, chatId, candidate });
    }
  });
  
  socket.on('group-call:reject', ({ chatId, roomId }) => {
    console.log(`[GROUP CALL] ${username} rejected call ${roomId}`);
  });
  
  socket.on('group-call:leave', ({ chatId, roomId, username: leaver }) => {
    console.log(`[GROUP CALL] ${leaver} leaving call ${roomId}`);
    
    const call = groupCalls.get(roomId);
    if (call) {
      call.participants.delete(leaver);
      
      // Уведомляем остальных
      call.participants.forEach(p => {
        const targetSocket = userSockets.get(p.toLowerCase());
        if (targetSocket) {
          io.to(targetSocket).emit('group-call:user-left', { chatId, roomId, username: leaver });
        }
      });
      
      // Если никого не осталось - удаляем звонок
      if (call.participants.size === 0) {
        groupCalls.delete(roomId);
      }
    }
  });
  
  socket.on('disconnect', () => {
    const u = users.get(username);
    if (u) {
      u.status = 'offline';
      users.set(username, u);
      markDirty();
    }
    onlineUsers.delete(socket.id);
    userSockets.delete(username);
    io.emit('users:online', Array.from(onlineUsers.values()));
    io.emit('user:status', { username, status: 'offline' });
  });
});

process.on('SIGTERM', () => { saveData(); process.exit(0); });
process.on('SIGINT', () => { saveData(); process.exit(0); });

app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server on port ${PORT}`));
