class Player {

    constructor(id='', name = '', socketId, room = '', game, gameCreator = false, points = 0) {
        this.id = id;
        this.name = name;
        this.socketId = socketId;
        this.room = room;
        this.game = game;
        this.gameCreator = gameCreator;
        this.points = points;
    }

}

module.exports = {Player};