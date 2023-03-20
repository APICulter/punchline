class Game {
    constructor (pin, hostSocketId, players = [], settings = 'default', questions = [], answers = [], maxAnswers = 0, nbOfPlayers, votes = []) {
       this.pin = pin;
       this.hostSocketId = hostSocketId;
       this.players = players;
       this.settings = settings;
       this.questions = questions;
       this.answers = answers;
       this.maxAnswers = maxAnswers;
       this.nbOfPlayers = nbOfPlayers;
       this.votes = votes;
    }
}

module.exports = {Game};