const filterLobbyList = (roomsObj) => {
  let availableRooms = [];
  for (let roomId in roomsObj) {
    const currentRoom = roomsObj[roomId];
    console.log('currentRoom in filterLobbyList', currentRoom);
    if (currentRoom.player1 && !currentRoom.isFriendGame && !(currentRoom.isPrivate && currentRoom.player2) && !currentRoom.isClosed) {
      availableRooms.push({ name: roomId, boardSize: currentRoom.boardSize, isPending: !currentRoom.player2 });
    }
  }
  return availableRooms;
}

module.exports = filterLobbyList;