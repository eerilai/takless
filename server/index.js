const express = require("express");
const session = require("express-session");
const passport = require("passport");
const path = require("path");
const bodyParser = require("body-parser");
const socket = require("socket.io");

require("dotenv").config();

const db = require("../database");
const { logGame } = require("../database/queries")
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(bodyParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRoutes);

// Implement authorization check for relevant requests, ie profile, logout, etc
const authCheck = (req, res, next) => {
  if (!req.user) {
    res.redirect("/");
  } else {
    next();
  }
};

app.use("/", express.static(path.join(__dirname, "../client/dist")));

app.post('/record', (req, res) => {
  logGame(req.body);
});

app.get("/bundle.js", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/bundle.js"));
});
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

//Socket Setup
let rooms = 0;
const io = socket(server);

io.on('connection', (socket) => {
  socket.leave(socket.id);

  socket.on('fetchGame', async ({ username, roomId }) => {
    const room = io.sockets.adapter.rooms[roomId];
    const { gameState, activePlayer, boardSize, isPrivate, spectators } = room;
    const { player1, player2 } = room;
    if (username === player1) {
      if (!player2) {
        socket.emit('pendingGame', { boardSize, roomId } );
      } else {
        io.to(roomId).emit('syncGame', { boardSize, gameState, roomId, player1, player2, activePlayer });
      }
    } else if (!player2) {
      await socket.join(roomId);
      room.player2 = username;
      io.to(roomId).emit('syncGame', { boardSize, gameState: 'new', roomId, player1, player2: room.player2, activePlayer });
    } else if (username !== player2 && isPrivate) {
      socket.emit('gameAccessDenied');
    } else {
      if (username !== player2) {
        await socket.join(roomId);
        room.spectators[username] = username;
      }
      socket.emit('syncGame', { boardSize, gameState, roomId, player1, player2, activePlayer });
    }

    // Update lobby
    const games = [];
    const { rooms } = io.sockets.adapter;
    for (let roomId in rooms) {
      const currentRoom = rooms[roomId];
      if (!currentRoom.isFriendly && !(currentRoom.isPrivate && currentRoom.player2)) {
        games.push({ name: roomId, boardSize: currentRoom.boardSize, isPending: !currentRoom.player2 });
      }
    }
    socket.broadcast.emit('updateLobby', games);
  });

  // Update game for each piece move
  socket.on('updateGame', ({ gameState, activePlayer, roomId }) => {
    const room = io.sockets.adapter.rooms[roomId];
    room.gameState = gameState;
    room.activePlayer = activePlayer;
    const { boardSize, player1, player2 } = room;

    socket.to(roomId).emit('syncGame', { boardSize, gameState, player1, player2, activePlayer, roomId });
  });

  // Serve pending game list to lobby on lobby initialize
  socket.on('fetchLobby', () => {
    const games = [];
    const { rooms } = io.sockets.adapter;
    for (let roomId in rooms) {
      const currentRoom = rooms[roomId];
      if (!currentRoom.isFriendly && !(currentRoom.isPrivate && currentRoom.player2)) {
        games.push({ name: roomId, boardSize: currentRoom.boardSize, isPending: !currentRoom.player2 });
      }
    }
    socket.emit('updateLobby', games);
  });

  // Create a new game
  socket.on('createGame', async ({ username, boardSize, isFriendGame, isPrivate }) => {
    const roomId = Math.random().toString(36).slice(2, 9);
    await socket.join(roomId);
    const room = io.sockets.adapter.rooms[roomId];
    room.player1 = username;
    room.activePlayer = username;
    room.boardSize = boardSize
    room.isFriendGame = isFriendGame;
    room.isPrivate = isPrivate;
    room.spectators = {};
    socket.emit('gameInitiated', {
      roomId
    });
  });

  //Chat/Typing
  socket.on("chat", function(data) {
    io.sockets.emit("chat", data);
  });
  socket.on("typing", function(data) {
    socket.broadcast.emit("typing", data);
  });
});
