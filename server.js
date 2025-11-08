// Gerekli modülleri içe aktar
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Express uygulaması oluştur
const app = express();
const server = http.createServer(app);

// CORS ayarları ile Socket.IO'yu yapılandır
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Bağlı kullanıcıları saklamak için nesne
const connectedUsers = {};

// Statik dosyaları sun (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Ana sayfa için route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.IO bağlantı olayını dinle
io.on('connection', (socket) => {
  console.log(`Yeni kullanıcı bağlandı: ${socket.id}`);
  
  // Kullanıcı odaya katıldığında
  socket.on('join-room', (userName) => {
    console.log(`${userName} (${socket.id}) odaya katıldı`);
    
    // Kullanıcıyı bağlı kullanıcılar listesine ekle
    connectedUsers[socket.id] = {
      id: socket.id,
      name: userName
    };
    
    // Mevcut kullanıcı listesini yeni kullanıcıya gönder
    socket.emit('user-list', Object.values(connectedUsers));
    
    // Diğer kullanıcılara yeni kullanıcının katıldığını bildir
    socket.broadcast.emit('user-joined', {
      id: socket.id,
      name: userName
    });
    
    // Yeni kullanıcıya mevcut kullanıcılar hakkında bilgi gönder
    Object.keys(connectedUsers).forEach(userId => {
      if (userId !== socket.id) {
        socket.emit('user-joined', connectedUsers[userId]);
      }
    });
  });
  
  // WebRTC offer gönderildiğinde
  socket.on('offer', (data) => {
    console.log(`Offer gönderildi: ${socket.id} -> ${data.target}`);
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });
  
  // WebRTC answer gönderildiğinde
  socket.on('answer', (data) => {
    console.log(`Answer gönderildi: ${socket.id} -> ${data.target}`);
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });
  
  // ICE candidate gönderildiğinde
  socket.on('ice-candidate', (data) => {
    console.log(`ICE candidate gönderildi: ${socket.id} -> ${data.target}`);
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });
  
  // Mikrofon durumu değiştiğinde (isteğe bağlı)
  socket.on('mic-toggle', (isActive) => {
    console.log(`${socket.id} mikrofon durumu: ${isActive ? 'Açık' : 'Kapalı'}`);
    // Bu bilgiyi diğer kullanıcılara iletebilirsiniz
  });
  
  // Kullanıcı odadan ayrıldığında
  socket.on('leave-room', () => {
    handleUserDisconnect(socket.id);
  });
  
  // Kullanıcı bağlantısı kesildiğinde
  socket.on('disconnect', () => {
    handleUserDisconnect(socket.id);
  });
  
  // Kullanıcı bağlantısı kesilme işlemini yönet
  function handleUserDisconnect(userId) {
    console.log(`Kullanıcı ayrıldı: ${userId}`);
    
    // Kullanıcıyı bağlı kullanıcılar listesinden kaldır
    if (connectedUsers[userId]) {
      const userName = connectedUsers[userId].name;
      delete connectedUsers[userId];
      
      // Diğer kullanıcılara bu kullanıcının ayrıldığını bildir
      socket.broadcast.emit('user-left', userId);
      console.log(`${userName} (${userId}) odadan ayrıldı`);
    }
  }
});

// Sunucuyu belirtilen portta başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});