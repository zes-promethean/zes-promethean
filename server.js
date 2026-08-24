const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Create an HTTP server and attach Socket.io for Real-Time WebSockets
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// In-memory database mapping active cars
const activeCars = new Map(); // socket.id -> carCode
const codeToSocket = new Map(); // carCode -> socket.id

io.on('connection', (socket) => {
    console.log(`📡 New car connected to network: ${socket.id}`);

    // 1. Register a car with its unique 6-digit code on startup
    socket.on('register_car', (carCode) => {
        activeCars.set(socket.id, carCode);
        codeToSocket.set(carCode, socket.id);
        console.log(`✅ Car Registered - Code: ${carCode}`);
    });

    // 2. Handle Sync Request (Car A wants to connect to Car B)
    socket.on('request_sync', (data) => {
        const { fromCode, targetCode } = data;
        const targetSocketId = codeToSocket.get(targetCode);

        if (targetSocketId) {
            // Forward the popup request to the target car
            io.to(targetSocketId).emit('incoming_sync_request', { fromCode });
            console.log(`🔄 Sync request sent from Car [${fromCode}] to Car [${targetCode}]`);
        } else {
            // Target car code does not exist
            socket.emit('sync_error', { message: 'Car code not found or vehicle is offline.' });
        }
    });

    // 3. Handle Sync Response (Car B accepted or rejected the connection)
    socket.on('respond_sync', (data) => {
        const { fromCode, targetCode, status } = data; 
        const requesterSocketId = codeToSocket.get(fromCode);

        if (requesterSocketId) {
            // Send the decision back to the car that initiated the request
            io.to(requesterSocketId).emit('sync_response', { targetCode, status });
            
            if (status === 'accepted') {
                // If accepted, join them into a private "Convoy Room" for secure voice transmission
                const roomName = `convoy_${fromCode}_${targetCode}`;
                socket.join(roomName);
                
                const reqSocket = io.sockets.sockets.get(requesterSocketId);
                if(reqSocket) reqSocket.join(roomName);
                
                console.log(`🎉 Convoy channel established: [${fromCode}] and [${targetCode}]`);
            }
        }
    });

    // Handle disconnections (Car turns off or loses signal)
    socket.on('disconnect', () => {
        const code = activeCars.get(socket.id);
        if (code) {
            codeToSocket.delete(code);
            activeCars.delete(socket.id);
            console.log(`❌ Car disconnected: ${code}`);
        }
    });
});

// Start the server on Port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Convoy Backend Server running on http://localhost:${PORT}`);
});