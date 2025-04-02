// events/connectionEvents.js

const handleConnectionEvent = (socket) => {
    console.log(`User connected: ${socket.id}`);
  
    const userId = socket.handshake.query.userId;
    if (userId) {
      const roomName = `user_${userId}`;
      socket.join(roomName);
      console.log(`User ${userId} joined room: ${roomName}`);
    }
  
    socket.on("disconnect", () => {
    //   console.log(`User disconnected: ${socket.id}`);
    });
  };
  
  module.exports = { handleConnectionEvent };
  