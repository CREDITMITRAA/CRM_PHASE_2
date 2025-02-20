const socketIo = require('socket.io');
const { handleConnectionEvent } = require('../events/connectionEvents');
const { handleCountEvent } = require('../events/countEvents');

let io;

const initializeSocket = (server) => {
    io = socketIo(server, {
        cors: {
            origin: process.env.FRONTEND_ORIGIN_URL,
            methods: ["GET", "POST"],
        },
    })

    io.on("connect", (socket)=>{
        handleConnectionEvent(socket)
        handleCountEvent(socket)
    })

    return io
}

module.exports = {
    initializeSocket,
    getIo : () => io
}