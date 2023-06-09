class Game {
    constructor (pin, hostSocketId, players = [], settings = 'default', question = 0, questions = [], answers = [], maxAnswers = 0, nbOfPlayers, votes = [], maxVotes = 0, inGame = false, state) {
       this.pin = pin;
       this.hostSocketId = hostSocketId;
       this.players = players;
       this.settings = settings;
       this.question = question;
       this.questions = questions;
       this.answers = answers;
       this.maxAnswers = maxAnswers;
       this.nbOfPlayers = nbOfPlayers;
       this.votes = votes;
       this.maxVotes = maxVotes;
       this.inGame = inGame;
       this.state = state;
    }
}

module.exports = {Game};