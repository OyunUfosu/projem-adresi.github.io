// Kullanıcı veritabanı - şifreler ve kullanıcı adları
const users = {
    "1234": "Ahmet",
    "5678": "Ayşe",
    "9999": "Mehmet"
};

// DOM elementlerini seç
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const passwordInput = document.getElementById('passwordInput');
const loginButton = document.getElementById('loginButton');
const errorMessage = document.getElementById('errorMessage');
const currentUserName = document.getElementById('currentUserName');
const userList = document.getElementById('userList');
const micToggle = document.getElementById('micToggle');
const connectionStatus = document.getElementById('connectionStatus');
const leaveButton = document.getElementById('leaveButton');

// WebRTC ve Socket.IO değişkenleri
let socket = null;
let localStream = null;
let peerConnections = {};
let currentUser = null;
let isMicActive = true;

// Giriş butonu tıklama olayı
loginButton.addEventListener('click', handleLogin);
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

// Mikrofon aç/kapa butonu
micToggle.addEventListener('click', toggleMicrophone);

// Odadan çık butonu
leaveButton.addEventListener('click', leaveRoom);

// Giriş işlemini yönet
function handleLogin() {
    const password = passwordInput.value.trim();
    
    if (password && users[password]) {
        // Şifre doğruysa
        currentUser = users[password];
        initializeConnection();
    } else {
        // Şifre yanlışsa
        showError();
    }
}

// Hata mesajını göster
function showError() {
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 3000);
}

// Bağlantıyı başlat
function initializeConnection() {
    try {
        // Socket.IO bağlantısını kur (URL'yi açıkça belirt)
        socket = io(window.location.origin, {
            transports: ['websocket', 'polling']
        });
        
        // Bağlantı hata kontrolü
        socket.on('connect_error', (error) => {
            console.error('Socket bağlantı hatası:', error);
            connectionStatus.textContent = 'Sunucuya bağlanılamadı';
            connectionStatus.className = 'connection-status status-error';
        });
        
        socket.on('connect', () => {
            console.log('Sunucuya bağlandı');
            // Giriş ekranını gizle, sohbet ekranını göster
            loginScreen.style.display = 'none';
            chatScreen.style.display = 'flex';
            currentUserName.textContent = currentUser;
            
            // Socket olaylarını dinle
            setupSocketListeners();
            
            // Mikrofon erişimi iste ve WebRTC bağlantısını başlat
            requestMediaAccess();
        });
        
    } catch (error) {
        console.error('Bağlantı başlatma hatası:', error);
        showError();
    }
}

// Socket.IO olay dinleyicilerini kur
function setupSocketListeners() {
    // Sunucudan kullanıcı listesi geldiğinde
    socket.on('user-list', updateUserList);
    
    // Yeni bir kullanıcı katıldığında
    socket.on('user-joined', handleUserJoined);
    
    // Bir kullanıcı ayrıldığında
    socket.on('user-left', handleUserLeft);
    
    // WebRTC offer aldığında
    socket.on('offer', handleOffer);
    
    // WebRTC answer aldığında
    socket.on('answer', handleAnswer);
    
    // ICE candidate aldığında
    socket.on('ice-candidate', handleIceCandidate);
}

// Kullanıcı listesini güncelle
function updateUserList(users) {
    userList.innerHTML = '';
    
    users.forEach(user => {
        if (user.id !== socket.id) {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.id = `user-${user.id}`;
            
            userItem.innerHTML = `
                <span class="user-name">${user.name}</span>
                <div class="user-status">
                    <span>Bağlanıyor...</span>
                    <div class="status-indicator status-connecting"></div>
                </div>
            `;
            
            userList.appendChild(userItem);
        }
    });
}

// Yeni kullanıcı katıldığında
function handleUserJoined(userData) {
    if (userData.id !== socket.id) {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.id = `user-${userData.id}`;
        
        userItem.innerHTML = `
            <span class="user-name">${userData.name}</span>
            <div class="user-status">
                <span>Bağlanıyor...</span>
                <div class="status-indicator status-connecting"></div>
            </div>
        `;
        
        userList.appendChild(userItem);
        
        // Yeni kullanıcıya WebRTC bağlantısı başlat
        createPeerConnection(userData.id, userData.name, true);
    }
}

// Kullanıcı ayrıldığında
function handleUserLeft(userId) {
    const userElement = document.getElementById(`user-${userId}`);
    if (userElement) {
        userElement.remove();
    }
    
    // Peer bağlantısını kapat
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
}

// Mikrofon erişimi iste
async function requestMediaAccess() {
    try {
        // Tarayıcıdan mikrofon erişimi iste
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }, 
            video: false 
        });
        
        // Bağlantı durumunu güncelle
        connectionStatus.textContent = 'Mikrofon erişimi sağlandı';
        
        // Sunucuya katılma isteği gönder
        socket.emit('join-room', currentUser);
        
        // Mikrofon toggle'ı aktif et
        micToggle.classList.add('active');
        
    } catch (error) {
        console.error('Mikrofon erişimi sağlanamadı:', error);
        connectionStatus.textContent = 'Mikrofon erişimi reddedildi';
        connectionStatus.className = 'connection-status status-error';
        
        // Mikrofon olmadan da sunucuya bağlan
        socket.emit('join-room', currentUser);
    }
}

// Mikrofonu aç/kapa
function toggleMicrophone() {
    if (localStream) {
        isMicActive = !isMicActive;
        localStream.getAudioTracks()[0].enabled = isMicActive;
        
        // UI güncelle
        micToggle.classList.toggle('active', isMicActive);
        
        // Durumu diğer kullanıcılara bildir (isteğe bağlı)
        if (socket) {
            socket.emit('mic-toggle', isMicActive);
        }
    }
}

// WebRTC peer bağlantısı oluştur
function createPeerConnection(userId, userName, isInitiator) {
    try {
        // ICE sunucularını yapılandır
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
        
        // Yeni RTCPeerConnection oluştur
        const peerConnection = new RTCPeerConnection(configuration);
        
        // Yerel ses akışını peer bağlantısına ekle
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
        
        // Uzak ses akışı alındığında
        peerConnection.ontrack = (event) => {
            const remoteStream = event.streams[0];
            playRemoteAudio(remoteStream, userId, userName);
        };
        
        // ICE candidate oluşturulduğunda
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    target: userId
                });
            }
        };
        
        // Bağlantı durumu değiştiğinde
        peerConnection.onconnectionstatechange = () => {
            const userElement = document.getElementById(`user-${userId}`);
            if (userElement) {
                const statusIndicator = userElement.querySelector('.status-indicator');
                const statusText = userElement.querySelector('.user-status span');
                
                switch(peerConnection.connectionState) {
                    case 'connected':
                        statusIndicator.className = 'status-indicator status-connected';
                        statusText.textContent = 'Bağlı';
                        break;
                    case 'connecting':
                        statusIndicator.className = 'status-indicator status-connecting';
                        statusText.textContent = 'Bağlanıyor...';
                        break;
                    case 'disconnected':
                    case 'failed':
                    case 'closed':
                        statusIndicator.className = 'status-indicator';
                        statusText.textContent = 'Bağlantı kesildi';
                        break;
                }
            }
            
            // Genel bağlantı durumunu güncelle
            updateOverallConnectionStatus();
        };
        
        // Peer bağlantısını sakla
        peerConnections[userId] = peerConnection;
        
        // Eğer bağlantıyı başlatan taraf isek, offer oluştur
        if (isInitiator) {
            createOffer(userId);
        }
        
        return peerConnection;
    } catch (error) {
        console.error('Peer bağlantısı oluşturma hatası:', error);
        return null;
    }
}

// WebRTC offer oluştur
async function createOffer(userId) {
    try {
        const peerConnection = peerConnections[userId];
        if (!peerConnection) return;
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        if (socket) {
            socket.emit('offer', {
                offer: offer,
                target: userId
            });
        }
    } catch (error) {
        console.error('Offer oluşturma hatası:', error);
    }
}

// WebRTC offer'ı işle
async function handleOffer(data) {
    const { offer, from } = data;
    
    let peerConnection = peerConnections[from];
    if (!peerConnection) {
        peerConnection = createPeerConnection(from, '', false);
    }
    
    try {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        if (socket) {
            socket.emit('answer', {
                answer: answer,
                target: from
            });
        }
    } catch (error) {
        console.error('Offer işleme hatası:', error);
    }
}

// WebRTC answer'ı işle
async function handleAnswer(data) {
    const { answer, from } = data;
    const peerConnection = peerConnections[from];
    
    if (peerConnection) {
        try {
            await peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Answer işleme hatası:', error);
        }
    }
}

// ICE candidate'ı işle
async function handleIceCandidate(data) {
    const { candidate, from } = data;
    const peerConnection = peerConnections[from];
    
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('ICE candidate ekleme hatası:', error);
        }
    }
}

// Uzak sesi çal
function playRemoteAudio(stream, userId, userName) {
    try {
        // Yeni bir audio elementi oluştur
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        
        // Audio elementini sakla
        if (!window.remoteAudios) {
            window.remoteAudios = {};
        }
        window.remoteAudios[userId] = audio;
    } catch (error) {
        console.error('Uzak ses çalma hatası:', error);
    }
}

// Genel bağlantı durumunu güncelle
function updateOverallConnectionStatus() {
    const connectedUsers = Object.values(peerConnections).filter(
        pc => pc.connectionState === 'connected'
    ).length;
    
    if (connectedUsers > 0) {
        connectionStatus.textContent = `${connectedUsers} kullanıcıya bağlı`;
        connectionStatus.className = 'connection-status status-connected';
    } else {
        connectionStatus.textContent = 'Bağlantı kuruluyor...';
        connectionStatus.className = 'connection-status status-connecting';
    }
}

// Odadan ayrıl
function leaveRoom() {
    // Tüm peer bağlantılarını kapat
    Object.values(peerConnections).forEach(pc => {
        if (pc) pc.close();
    });
    peerConnections = {};
    
    // Yerel ses akışını durdur
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Socket bağlantısını kapat
    if (socket) {
        socket.emit('leave-room');
        socket.disconnect();
    }
    
    // Ekranları sıfırla
    chatScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    passwordInput.value = '';
    
    // Remote audioları temizle
    if (window.remoteAudios) {
        Object.values(window.remoteAudios).forEach(audio => {
            if (audio) {
                audio.pause();
                audio.srcObject = null;
            }
        });
        window.remoteAudios = {};
    }
}