import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the 'dist' directory
const __dirname = path.resolve();
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 20000,
  pingInterval: 5000,
  transports: ['polling', 'websocket'],
  maxHttpBufferSize: 1e8 // 100MB
});

const PORT = process.env.BACKEND_PORT || 5001;
const DATA_FILE = './server/data.json';

// Initialize data storage
let dbData = {
  users: {}, // userId -> { nickname, gender, preference, lastSeen, blockedUsers: [] }
  messages: [], // Array of { from, to, text, timestamp, status }
  sessions: {} // sessionId -> { userIds: [] }
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    if (content) {
      dbData = JSON.parse(content);
    }
  } catch (e) {
    console.error("Error loading db file", e);
  }
}

const saveData = () => {
  try {
    if (!fs.existsSync('./server')) {
      fs.mkdirSync('./server');
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(dbData, null, 2));
  } catch (e) {
    console.error("Error saving data:", e);
  }
};

const waitingPool = new Map(); // socket.id -> { userId, nickname, gender, preference }
const socketToUser = new Map(); // socket.id -> userId
const userToSocket = new Map(); // userId -> socket.id

const broadcastStats = () => {
  const onlineCount = socketToUser.size;
  const matchingCount = waitingPool.size;
  console.log(`Stats Update: Online=${onlineCount}, Matching=${matchingCount}`);
  io.emit('stats_update', { onlineCount, matchingCount });
};

io.on('connection', (socket) => {
  console.log('New socket connected:', socket.id, 'Transport:', socket.conn.transport.name);
  
  socket.conn.on('upgrade', (transport) => {
    console.log('Socket upgraded to:', transport.name, 'for', socket.id);
  });

  socket.on('auth', ({ userId, nickname, gender, preference, privateMode }) => {
    if (!userId) {
      console.log('Auth failed: No userId provided');
      return;
    }
    console.log(`User auth: ${userId} (${nickname}) (privateMode: ${!!privateMode})`);
    socketToUser.set(socket.id, userId);
    userToSocket.set(userId, socket.id);
    
    dbData.users[userId] = { 
      ...(dbData.users[userId] || {}),
      nickname, 
      gender, 
      preference, 
      privateMode: !!privateMode,
      lastSeen: Date.now(),
      isOnline: true 
    };
    saveData();
    broadcastStats();

    // Notify user of their partners' status
    Object.values(dbData.sessions).forEach(session => {
      if (session.userIds.includes(userId)) {
        const otherUserId = session.userIds.find(id => id !== userId);
        const otherUser = dbData.users[otherUserId];
        const isOtherOnline = userToSocket.has(otherUserId);
        
        // If other user is in private mode, they appear offline
        const reportedStatus = (isOtherOnline && !otherUser?.privateMode) ? 'online' : 'offline';
        
        socket.emit('partner_status', { 
          userId: otherUserId, 
          status: reportedStatus,
          isBlockedByMe: dbData.users[userId]?.blockedUsers?.includes(otherUserId),
          isBlockedByPartner: otherUser?.blockedUsers?.includes(userId)
        });
      }
    });

    // Send pending messages
    const pending = dbData.messages.filter(m => m.to === userId && m.status !== 'seen');
    if (pending.length > 0) {
      socket.emit('pending_messages', pending);
      // Mark as delivered and notify senders
      pending.forEach(m => {
        if (m.status === 'sent') {
          m.status = 'delivered';
          const senderSocketId = userToSocket.get(m.from);
          if (senderSocketId) {
            io.to(senderSocketId).emit('msg_status', { id: m.id, status: 'delivered' });
          }
        }
      });
      saveData();
    }

    // Broadcast online status to anyone they have a session with
    Object.values(dbData.sessions).forEach(session => {
      if (session.userIds.includes(userId)) {
        const otherUserId = session.userIds.find(id => id !== userId);
        const otherSocketId = userToSocket.get(otherUserId);
        const otherUser = dbData.users[otherUserId];
        const user = dbData.users[userId];

        if (otherSocketId) {
          // If this user is in private mode, they appear offline to others
          const reportedStatus = user?.privateMode ? 'offline' : 'online';
          
          io.to(otherSocketId).emit('partner_status', { 
            userId, 
            status: reportedStatus,
            isBlockedByMe: otherUser?.blockedUsers?.includes(userId),
            isBlockedByPartner: user?.blockedUsers?.includes(otherUserId)
          });
        }
      }
    });
  });

  socket.on('update_profile', ({ nickname, gender, privateMode }) => {
    const userId = socketToUser.get(socket.id);
    if (!userId) return;

    // Check nickname uniqueness (if changed)
    const oldNickname = dbData.users[userId]?.nickname;
    if (nickname && nickname.toLowerCase() !== oldNickname?.toLowerCase()) {
      const isTaken = Object.entries(dbData.users).some(([id, u]) => 
        u.password && u.nickname && u.nickname.toLowerCase() === nickname.toLowerCase() && id !== userId
      );
      if (isTaken) {
        socket.emit('error', { message: 'Nickname is already taken. Please choose another one.' });
        return;
      }
    }

    const oldPrivateMode = dbData.users[userId]?.privateMode;
    
    dbData.users[userId] = {
      ...dbData.users[userId],
      nickname: nickname !== undefined ? nickname : dbData.users[userId].nickname,
      gender: gender !== undefined ? gender : dbData.users[userId].gender,
      privateMode: privateMode !== undefined ? !!privateMode : dbData.users[userId].privateMode
    };
    saveData();

    const user = dbData.users[userId];

    // Notify all partners of the profile change and status change (if privateMode changed)
    Object.values(dbData.sessions).forEach(session => {
      if (session.userIds.includes(userId)) {
        const otherUserId = session.userIds.find(id => id !== userId);
        const otherSocketId = userToSocket.get(otherUserId);
        if (otherSocketId) {
          io.to(otherSocketId).emit('partner_profile_updated', {
            userId,
            nickname: user.nickname,
            gender: user.gender
          });

          if (privateMode !== undefined && privateMode !== oldPrivateMode) {
            const reportedStatus = privateMode ? 'offline' : 'online';
            io.to(otherSocketId).emit('partner_status', { 
              userId, 
              status: reportedStatus,
              isBlockedByMe: dbData.users[otherUserId]?.blockedUsers?.includes(userId),
              isBlockedByPartner: user?.blockedUsers?.includes(otherUserId)
            });
          }
        }
      }
    });
    
    // Also notify the user themselves to confirm
    socket.emit('profile_updated', { 
      nickname: user.nickname, 
      gender: user.gender,
      privateMode: user.privateMode 
    });
  });

  socket.on('leave_chat', ({ sessionId }) => {
    const userId = socketToUser.get(socket.id);
    if (!userId || !sessionId) return;

    const session = dbData.sessions[sessionId];
    if (session) {
      const otherUserId = session.userIds.find(id => id !== userId);
      const isSavedByMe = session.saves && session.saves[userId];
      const isSavedByOther = session.saves && session.saves[otherUserId];

      if (!isSavedByMe || !isSavedByOther) {
        session.isActive = false;
        saveData();
      }
    }
  });

  socket.on('start_matching', (userData) => {
    const userId = socketToUser.get(socket.id);
    if (!userId) return;

    const { nickname, gender, preference } = userData;
    console.log(`Matching request from ${userId} (${nickname})`);

    // Check if user is already in an active session (busy check)
    // A user is busy if they are in a session that is active and NOT saved by both
    const activeSessions = Object.values(dbData.sessions).filter(session => 
      session.userIds.includes(userId) && 
      session.isActive !== false
    );

    const isBusy = activeSessions.some(session => 
      !session.saves || !session.saves[userId] || !session.saves[session.userIds.find(id => id !== userId)]
    );
    
    if (isBusy) {
      socket.emit('error', { message: 'You are already in an active chat. Please end it before matching again.' });
      return;
    }

    // FIFO Matching
    let matchedSocketId = null;
    const user = dbData.users[userId];
    
    for (const [sId, other] of waitingPool.entries()) {
      if (other.userId === userId) continue;

      // Check for blocks
      const otherUser = dbData.users[other.userId];
      const isBlockedByMe = user?.blockedUsers?.includes(other.userId);
      const isBlockedByThem = otherUser?.blockedUsers?.includes(userId);
      
      if (isBlockedByMe || isBlockedByThem) continue;

      // Check if they are already FULLY connected (both saved)
      const bothSaved = Object.values(dbData.sessions).some(session => 
        session.userIds.includes(userId) && 
        session.userIds.includes(other.userId) &&
        session.saves && 
        session.saves[userId] && 
        session.saves[other.userId]
      );
      if (bothSaved) continue;

      // Strict Mutual Preference
      const userAWantsB = preference === 'any' || preference === other.gender;
      const userBWantsA = other.preference === 'any' || other.preference === gender;

      if (userAWantsB && userBWantsA) {
        matchedSocketId = sId;
        break;
      }
    }

    if (matchedSocketId) {
      const other = waitingPool.get(matchedSocketId);
      waitingPool.delete(matchedSocketId);

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      dbData.sessions[sessionId] = { userIds: [userId, other.userId], isActive: true };
      saveData();

      const partnerForMe = { userId: other.userId, nickname: other.nickname, gender: other.gender };
      const partnerForOther = { userId: userId, nickname, gender };

      socket.emit('match_found', { sessionId, partner: partnerForMe });
      io.to(matchedSocketId).emit('match_found', { sessionId, partner: partnerForOther });
      
      const otherUser = dbData.users[other.userId];
      const currentUser = dbData.users[userId];

      // Notify both that they are online to each other, respecting privateMode
      socket.emit('partner_status', { 
        userId: other.userId, 
        status: otherUser?.privateMode ? 'offline' : 'online',
        isBlockedByMe: false,
        isBlockedByPartner: false
      });
      io.to(matchedSocketId).emit('partner_status', { 
        userId: userId, 
        status: currentUser?.privateMode ? 'offline' : 'online',
        isBlockedByMe: false,
        isBlockedByPartner: false
      });

      console.log(`Match created: ${userId} <-> ${other.userId}`);
      broadcastStats();
    } else {
      waitingPool.set(socket.id, { userId, ...userData });
      socket.emit('waiting');
      broadcastStats();
    }
  });

  socket.on('cancel_matching', () => {
    waitingPool.delete(socket.id);
    broadcastStats();
  });

  socket.on('send_msg', ({ sessionId, text, toUserId, type = 'text', audio, image, video, file, fileName }) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId) return;

    // Check for blocks
    const user = dbData.users[fromUserId];
    const recipient = dbData.users[toUserId];

    const isBlockedByMe = user?.blockedUsers?.includes(toUserId);
    const isBlockedByThem = recipient?.blockedUsers?.includes(fromUserId);

    if (isBlockedByMe || isBlockedByThem) {
      console.log(`Message blocked between ${fromUserId} and ${toUserId}`);
      socket.emit('error', { message: 'You cannot send messages to this user.' });
      return;
    }

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      sessionId,
      from: fromUserId,
      to: toUserId,
      text,
      audio,
      image,
      video,
      file,
      fileName,
      type,
      timestamp: Date.now(),
      status: 'sent'
    };

    dbData.messages.push(message);
    saveData();

    const recipientSocketId = userToSocket.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('new_msg', message);
      message.status = 'delivered';
      saveData();
      socket.emit('msg_status', { id: message.id, status: 'delivered' });
    } else {
      console.log(`User ${toUserId} offline, message stored.`);
    }
    
    // Echo back to sender for confirmation
    socket.emit('msg_sent', message);
  });

  socket.on('delete_msg', ({ messageId, sessionId, toUserId, type }) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId) return;

    if (type === 'everyone') {
      const msg = dbData.messages.find(m => m.id === messageId);
      if (msg) {
        msg.isDeleted = true;
        msg.text = 'Message deleted';
        saveData();

        // Notify recipient
        const recipientSocketId = userToSocket.get(toUserId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('msg_deleted', { messageId, sessionId, type: 'everyone' });
        }
        // Notify sender (for confirmation)
        socket.emit('msg_deleted', { messageId, sessionId, type: 'everyone' });
      }
    } else {
      // For 'me', we just notify the sender's own client to hide it
      // In a real app we'd store which messages are hidden for which user
      socket.emit('msg_deleted', { messageId, sessionId, type: 'me' });
    }
  });

  socket.on('mark_seen', ({ messageIds }) => {
    messageIds.forEach(id => {
      const msg = dbData.messages.find(m => m.id === id);
      if (msg) {
        msg.status = 'seen';
        const senderSocketId = userToSocket.get(msg.from);
        if (senderSocketId) {
          io.to(senderSocketId).emit('msg_status', { id: msg.id, status: 'seen' });
        }
      }
    });
    saveData();
  });

  socket.on('typing', ({ toUserId, isTyping }) => {
    const recipientSocketId = userToSocket.get(toUserId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('partner_typing', isTyping);
    }
  });

  socket.on('save_chat', ({ sessionId }) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId) return;
    
    const session = dbData.sessions[sessionId];
    if (session) {
      if (!session.saves) session.saves = {};
      session.saves[fromUserId] = true;
      saveData();
      
      const otherUserId = session.userIds.find(id => id !== fromUserId);
      const otherSocketId = userToSocket.get(otherUserId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('partner_saved_chat', { sessionId });
      }
    }
  });

  socket.on('block_user', ({ targetUserId }) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId || !targetUserId) return;

    if (!dbData.users[fromUserId].blockedUsers) {
      dbData.users[fromUserId].blockedUsers = [];
    }

    if (!dbData.users[fromUserId].blockedUsers.includes(targetUserId)) {
      dbData.users[fromUserId].blockedUsers.push(targetUserId);
      saveData();
    }

    // Notify the other user that they've been blocked (to update UI)
    const targetSocketId = userToSocket.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('you_are_blocked', { byUserId: fromUserId });
    }
    
    console.log(`User ${fromUserId} blocked ${targetUserId}`);
  });

  socket.on('unblock_user', ({ targetUserId }) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId || !targetUserId) return;

    if (dbData.users[fromUserId].blockedUsers) {
      dbData.users[fromUserId].blockedUsers = dbData.users[fromUserId].blockedUsers.filter(id => id !== targetUserId);
      saveData();
    }

    // Notify the other user that they've been unblocked
    const targetSocketId = userToSocket.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('you_are_unblocked', { byUserId: fromUserId });
    }
    
    console.log(`User ${fromUserId} unblocked ${targetUserId}`);
  });

  // Call Signaling
  socket.on('call_request', ({ sessionId, toUserId, fromNickname, type }) => {
    const fromUserId = socketToUser.get(socket.id);
    const targetSocketId = userToSocket.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_request', { sessionId, fromUserId, fromNickname, type });
    }
  });

  socket.on('call_response', ({ toUserId, status, answer }) => {
    const fromUserId = socketToUser.get(socket.id);
    const targetSocketId = userToSocket.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_response', { fromUserId, status, answer });
    }
  });

  socket.on('call_signal', ({ toUserId, signal }) => {
    const targetSocketId = userToSocket.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_signal', { signal });
    }
  });

  socket.on('call_ended', ({ toUserId }) => {
    const targetSocketId = userToSocket.get(toUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended');
    }
  });

  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    console.log('Disconnected:', socket.id, userId);
    
    if (userId) {
      if (dbData.users[userId]) {
        dbData.users[userId].isOnline = false;
        dbData.users[userId].lastSeen = Date.now();
        saveData();
      }

      // Notify partners
      Object.values(dbData.sessions).forEach(session => {
        if (session.userIds.includes(userId)) {
          const otherUserId = session.userIds.find(id => id !== userId);
          const otherSocketId = userToSocket.get(otherUserId);
          if (otherSocketId) {
            io.to(otherSocketId).emit('partner_status', { userId, status: 'offline' });
            io.to(otherSocketId).emit('partner_disconnected');
          }
        }
      });
              
      if (userToSocket.get(userId) === socket.id) {
        userToSocket.delete(userId);
      }
    }
    socketToUser.delete(socket.id);
    waitingPool.delete(socket.id);
    broadcastStats();
  });
});

app.get('/health', (req, res) => res.send('OK'));

app.get('/api/check-nickname', (req, res) => {
  const { nickname, userId } = req.query;
  if (!nickname) return res.json({ available: false });
  // Only check against registered users (those with a password)
  const isTaken = Object.entries(dbData.users).some(([id, u]) => 
    u.password && u.nickname && u.nickname.toLowerCase() === nickname.toLowerCase() && id !== userId
  );
  console.log(`Nickname check: "${nickname}" for user ${userId}. Taken: ${isTaken}`);
  res.json({ available: !isTaken });
});

// Auth Endpoints
app.post('/api/register', (req, res) => {
  const { phone, password, nickname, gender } = req.body;
  console.log(`Registration attempt: ${phone} (${nickname})`);
  
  if (dbData.users[phone] && dbData.users[phone].password) {
    console.log(`Registration failed: Phone ${phone} already registered`);
    return res.status(400).json({ message: 'Phone number already registered' });
  }
  
  // Only check against registered users
  const isNicknameTaken = Object.values(dbData.users).some(u => 
    u.password && u.nickname && u.nickname.toLowerCase() === nickname?.toLowerCase()
  );
  
  if (isNicknameTaken) {
    console.log(`Registration failed: Nickname "${nickname}" already taken by a registered user`);
    return res.status(400).json({ message: 'Nickname is already taken' });
  }

  dbData.users[phone] = { 
    userId: phone, 
    phone, 
    password, 
    nickname, 
    gender, 
    preference: 'any',
    createdAt: Date.now() 
  };
  saveData();
  console.log(`Registration successful: ${phone}`);
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  console.log(`Login attempt: ${phone}`);
  const user = dbData.users[phone];
  if (user && user.password === password) {
    console.log(`Login successful: ${phone}`);
    res.json({ success: true, user });
  } else {
    console.log(`Login failed: ${phone}`);
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { phone, newPassword } = req.body;
  if (dbData.users[phone]) {
    dbData.users[phone].password = newPassword;
    saveData();
    res.json({ success: true });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// Fallback for SPA routing - should be the LAST route
if (fs.existsSync(distPath)) {
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Production-ready backend server running on port ${PORT}`);
});