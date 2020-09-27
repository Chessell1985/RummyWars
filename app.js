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

	socket.on('disconnect', function() {
		console.log(socket.id + ' has disconnected');
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
