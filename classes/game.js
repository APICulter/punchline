class Game {
    constructor (pin, hostSocketId, players, content, settings, questions, answers) {
       this.pin = pin;
       this.hostSocketId = hostSocketId;
       this.players = [];
       this.content = content;
       this.settings = settings;
       this.questions = questions;
       this.answers = answers;
    }
}

module.exports = {Game};