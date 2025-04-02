// socket/index.js
const socketIo = require('socket.io');
const { handleConnectionEvent } = require('../events/connectionEvents');
const { handleCountEvent } = require('../events/countEvents');

let io;
const onlineUsers = new Map(); // Track online users

const initializeSocket = (server) => {
    io = socketIo(server, {
        cors: {
            origin: process.env.FRONTEND_ORIGIN_URL,
            methods: ["GET", "POST"],
        },
    });

    io.on("connect", (socket) => {
        const userId = socket.handshake.query.userId;
        if (userId) {
            // Add user to online list
            onlineUsers.set(userId, socket.id);
            // Notify all clients about the new online user
            io.emit('user-online', { userId });
            
            // Update all clients with the current online users list
            io.emit('online-users', Array.from(onlineUsers.keys()));
        }

        socket.on("disconnect", () => {
            if (userId) {
                onlineUsers.delete(userId);
                // Notify all clients about the user going offline
                io.emit('user-offline', { userId });
            }
        });

        handleConnectionEvent(socket);
        handleCountEvent(socket);
    });

    return io;
}

module.exports = {
    initializeSocket,
    getIo: () => io
};