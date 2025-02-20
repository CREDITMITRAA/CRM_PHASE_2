function handleCountEvent(socket){
    socket.on('count', (count) => {
        console.log('count received = ',count);
    })
}

module.exports = {
    handleCountEvent
}