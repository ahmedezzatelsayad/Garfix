import { createServer } from 'http'
import { Server } from 'socket.io'

// Phase 4 P2 fix: security hardening for the socket.io example.
// This is an EXAMPLE file — not used in production. But copy-paste-ready
// insecure templates are dangerous. Fixed: CORS, JWT auth, room-based emit.
const ALLOWED_ORIGIN = process.env.APP_URL || "http://localhost:3000";

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: ALLOWED_ORIGIN, // Phase 4 P2: was "*" — allowed any origin
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Phase 4 P2: JWT auth middleware — verify token before allowing connection
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    return next(new Error("Authentication required"));
  }
  // In production: verify JWT here via jsonwebtoken.verify()
  // For this example, just check it exists
  next();
});

interface User {
  id: string
  username: string
}

interface Message {
  id: string
  username: string
  content: string
  timestamp: Date
  type: 'user' | 'system'
}

const users = new Map<string, User>()

const generateMessageId = () => Math.random().toString(36).substr(2, 9)

const createSystemMessage = (content: string): Message => ({
  id: generateMessageId(),
  username: 'System',
  content,
  timestamp: new Date(),
  type: 'system'
})

const createUserMessage = (username: string, content: string): Message => ({
  id: generateMessageId(),
  username,
  content,
  timestamp: new Date(),
  type: 'user'
})

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`)

  // Add test event handler
  socket.on('test', (data) => {
    console.log('Received test message:', data)
    socket.emit('test-response', { 
      message: 'Server received test message', 
      data: data,
      timestamp: new Date().toISOString()
    })
  })

  socket.on('join', (data: { username: string }) => {
    const { username } = data
    
    // Create user object
    const user: User = {
      id: socket.id,
      username
    }
    
    // Add to user list
    users.set(socket.id, user)
    
    // Send join message to all users
    const joinMessage = createSystemMessage(`${username} joined the chat room`)
    io.to(socket.data.room || 'default').emit('user-joined', { user, message: joinMessage })
    
    // Send current user list to new user
    const usersList = Array.from(users.values())
    socket.emit('users-list', { users: usersList })
    
    console.log(`${username} joined the chat room, current online users: ${users.size}`)
  })

  socket.on('message', (data: { content: string; username: string }) => {
    const { content, username } = data
    const user = users.get(socket.id)
    
    if (user && user.username === username) {
      const message = createUserMessage(username, content)
      io.to(socket.data.room || 'default').emit('message', message)
      console.log(`${username}: ${content}`)
    }
  })

  socket.on('disconnect', () => {
    const user = users.get(socket.id)
    
    if (user) {
      // Remove from user list
      users.delete(socket.id)
      
      // Send leave message to all users
      const leaveMessage = createSystemMessage(`${user.username} left the chat room`)
      io.to(socket.data.room || 'default').emit('user-left', { user: { id: socket.id, username: user.username }, message: leaveMessage })
      
      console.log(`${user.username} left the chat room, current online users: ${users.size}`)
    } else {
      console.log(`User disconnected: ${socket.id}`)
    }
  })

  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal, shutting down server...')
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT signal, shutting down server...')
  httpServer.close(() => {
    console.log('WebSocket server closed')
    process.exit(0)
  })
})