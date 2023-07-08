class Player {

    constructor(id='', name = '', socketId, room = '', game, gameCreator = false, points = 0, lock = true) {
        this.id = id;
        this.name = name;
        this.socketId = socketId;
        this.room = room;
        this.game = game;
        this.gameCreator = gameCreator;
        this.points = points;
        this.lock = lock;
    }

}

module.exports = {Player};