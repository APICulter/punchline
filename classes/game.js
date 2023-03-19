class Game {
    constructor (pin, hostId, players, content, settings) {
       this.pin = pin;
       this.hostId = hostId;
       this.players = [];
       this.content = content;
       this.settings = settings;
    }
}

module.exports = {Game};