class Player {

    constructor(id="", name = "", socketId, room = "", game, gameCreator = false, points = 0, lock = true, token = null) {
        this.id = id;
        this.name = name;
        this.socketId = socketId;
        this.room = room;
        this.game = game;
        this.gameCreator = gameCreator;
        this.points = points;
        this.lock = lock;
        // rejoin token (random, given to the phone only): lets this player take their place back
        // from the same phone after the page was closed, see "resumeSession" in app.js
        this.token = token;
    }

}

module.exports = {Player};