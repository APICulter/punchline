class Player {

    constructor(id='', name = '', room = '', gameCreator = false, points = 0) {
        this.id = id;
        this.name = name;
        this.room = room;
        this.gameCreator = gameCreator;
        this.points = points;
    }

}

module.exports = {Player};