// basic requires
const express = require('express');
const app = express();
const server = require('http').Server(app);

// heroku port variable
const port = process.env.PORT || 8080;

// socket IO
//const io = require('./config/socket-io')(server);
const io = require('socket.io').listen(server);

io.on('connection', function(socket) {
	console.log(socket.id + ' has connected');

	playerCount++;
	io.emit('playercount', { count: playerCount });

	socket.emit('reconnectcheck', { blank: 'blank' });

	socket.on('playercount', function(data) {
		socket.emit('playercount', { count: playerCount });
	});

	socket.on('newgame', function(data) {
		JoinRoomAndStart(socket, data);
	});

	socket.on('watchedsequence', function(data) {
		WatchedSequence(socket);
	});

	socket.on('guessednumber', function(data) {
		GuessedNumber(socket, data);
	});

	socket.on('waitingfornextround', function(data) {
		WaitingForNextRound(socket);
	});

	socket.on('leftroom', function(data) {
		LeaveRoom(socket);
	})

	socket.on('disconnect', function() {
		console.log(socket.id + ' has disconnected');

		playerCount--;
		io.emit('playercount', { count: playerCount });

		LeaveRoom(socket);
	});
});

// router file
const router = require('./routes/router');

// set ejs renderer
app.set('view engine', 'ejs');

// set static files
app.use(express.static('public'));

// set router up for webpages
app.use('/', router);

// start server
server.listen(port);
console.log('listening on port 8080');

/*

	GAME CODE

*/

const fps = 60
const FPS = 1000 / fps;

const GAME_STATE = {
	INIT: 'INIT',
	PLAYING: 'PLAYING',
	FINISHED: 'FINISHED',
};

const PLAYER_STATE = {
	INIT: 'INIT',
	READY: 'READY',
	WAITING_FOR_NEXT_ROUND: 'WAITING_FOR_NEXT_ROUND',
	WATCHED_SEQUENCE: 'WATCHED_SEQUENCE',
	GUESSED_SEQUENCE: 'GUESSED_SEQUENCE',
	LOST: 'LOST',
};

var rooms = [];
var players = [];
var roomCount = 0;
var playerCount = 0;

function Room(numberOfPlayers) {
	this.id = ++roomCount;
	this.state = GAME_STATE.INIT;
	this.maxPlayers = numberOfPlayers;
	this.players = [];
	this.sequence = [];
}

function GetRoom(id) {
	var i = rooms.length, r;
	while(i--) {
		if(rooms[i].id == id) {
			r = rooms[i];
			break;
		}
	}
	return r;
}

function Player(socket) {
	this.id = socket.id;
	this.room = 0;
	this.name = '';
	this.currIndex = 0;
	this.state = PLAYER_STATE.INIT;
}

function GetPlayer(socket) {
	var i = players.length, p;
	while(i--) {
		if(players[i].id == socket.id) {
			p = players[i];
			break;
		}
	}
	return p;
}

function RemovePlayer(socket) {
	var i = players.length;
	while(i--) {
		if(players[i].id == socket.id) {
			players.splice(i, 1);
			break;
		}
	}
}

function JoinRoomAndStart(socket, data) {
	var p = new Player(socket);
	players.push(p);

	var n = data.game.numberOfPlayers;
	
	// find a room with spaces left
	var	i = rooms.length, r;
	while(i--) {
		if(rooms[i].players.length < rooms[i].maxPlayers 
			&& rooms[i].maxPlayers == n
			&& rooms[i].state == GAME_STATE.INIT) {
			r = rooms[i];
			break;
		}
	}

	// create a new room if none are available
	if(!r) {
		r = new Room(n);
		rooms.push(r);
	}

	// generate player name
	p.name = r.players.length + 1;

	// update player details and notify them
	r.players.push(p);
	p.currIndex = 0;
	p.room = r.id;
	p.state = PLAYER_STATE.WAITING_FOR_NEXT_ROUND;

	socket.join(r.id);
	socket.emit('joinedroom', { player: { name: p.name }});
	io.in(r.id).emit('opponentjoinedroom', { player: { name: p.name }});

	// start the room if it is now full
	if(r.players.length == r.maxPlayers) {
		r.state = GAME_STATE.PLAYING;
		StartNextRound(r);
	}
}

function LeaveRoom(socket) {
	var p = GetPlayer(socket);

	console.log(p);

	// find room
	var i = rooms.length, j;
	while(i-- && p != undefined) {
		if(rooms[i].id == p.room) {

			// find player in room
			j = rooms[i].players.length;
			//console.log(rooms[i].players);
			while(j--) {
				if(rooms[i].players[j].id == p.id) {
					rooms[i].players.splice(i, 1);
					//console.log(rooms[i].players);
					break;
				}
			}

			// remove if all players are gone
			if(rooms[i].players.length <= 0) {
				rooms.splice(i, 1);	

			// otherwise broadcast player loss to room
			} else if(rooms[i].state == GAME_STATE.PLAYING) {
				PlayerLost(socket, rooms[i]);
			} else if(rooms[i].state == GAME_STATE.INIT) {
				io.in(rooms[i].id).emit('opponentleftroom', { player: { name: p.name }});
			}

			break;
		}
	}

	RemovePlayer(socket);
}

function StartNextRound(room) {
	// check all players are ready to start
	var i = room.maxPlayers, ready = true;
	while(i--) {
		if(room.players[i].state != PLAYER_STATE.WAITING_FOR_NEXT_ROUND
			&& room.players[i].state != PLAYER_STATE.LOST) {
			ready = false;
			break;
		}
	}
	if(!ready) {
		return;
	}

    // generate next number and add to sequence
	var next = Math.floor(Math.random() * 5);
	room.sequence.push(next);

	// broadcast new sequence to all players
	io.in(room.id).emit('nextround', { game: room });
}

function WatchedSequence(socket) {
	// update player state
	var p = GetPlayer(socket);
	p.state = PLAYER_STATE.WATCHED_SEQUENCE;

	// check all players are ready
	var r = GetRoom(p.room);
	var i = r.players.length, ready = true;
	while(i--) {
		if(r.players[i].state != PLAYER_STATE.WATCHED_SEQUENCE
			&& r.players[i].state != PLAYER_STATE.LOST) {
			ready = false;
			break;
		}
	}

	// and start if true
	if(ready) {
		io.in(r.id).emit('playerguessing', { game: { currNum: r.sequence[p.currIndex] }});
	}
}

function GuessedNumber(socket, data) {
	var p = GetPlayer(socket);
	var r = GetRoom(p.room);

	// Check if guess failed
	if(r.sequence[p.currIndex] != data.guess.number) {
		PlayerLost(socket, r);
		return;
	} 

	// Otherwise continue
	CheckNextNumber(socket, r);
}

function CheckNextNumber(socket, room) {
	var p = GetPlayer(socket);
	p.currIndex++;

	// Check if player guessed the full sequence
	if(p.currIndex == room.sequence.length) {
		p.state = PLAYER_STATE.GUESSED_SEQUENCE;
		p.currIndex = 0;
		io.in(room.id).emit('guessedsequence', { player: { name: p.name }});
		return;
	} 

	// otherwise continue
	socket.emit('playerguessing', { game: { currNum: room.sequence[p.currIndex] }});
}

function WaitingForNextRound(socket) {
	// update player state
	var p = GetPlayer(socket);
	p.state = PLAYER_STATE.WAITING_FOR_NEXT_ROUND;

	// get room and start next round
	var r = GetRoom(p.room);
	StartNextRound(r);
}

function PlayerLost(socket, room) {
	// not interested in losses if game is already over
	if(room.state == GAME_STATE.FINISHED) {
		return;
	}

	// update player state
	var p = GetPlayer(socket);
	p.state = PLAYER_STATE.LOST;

	// broadcast a loss by player
	io.in(room.id).emit('playerlost', { player: { name: p.name} });

	// check for winner if more than one player in room
	if(room.maxPlayers > 1) {
		CheckForWinner(room);
	} else {
		room.state = GAME_STATE.FINISHED;
	}
}

function CheckForWinner(room) {
	// check there is just one player left who hasn't lost
	var i = room.players.length, p = null, won = true;
	while(i--) {
		if(room.players[i].state != PLAYER_STATE.LOST) {
			if(p) {
				won = false;
				break;
			}
			p = room.players[i];
		}
	}

	// ignore if no players
	if(!p) {
		return;
	}

	// emit winning message to room
	if(won) {
		room.state = GAME_STATE.FINISHED;
		io.in(room.id).emit('playerwon', { player: { name: p.name }});
		return;
	} 

	// otherwise start next round
	StartNextRound(room);
}
