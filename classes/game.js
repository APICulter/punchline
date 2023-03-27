class Game {
    constructor (pin, host, players = [], settings = 'default', question = 0, questions = [], answers = [], maxAnswers = 0, nbOfPlayers, votes = [], maxVotes = 0) {
       this.pin = pin;
       this.host = host;
       this.players = players;
       this.settings = settings;
       this.question = question;
       this.questions = questions;
       this.answers = answers;
       this.maxAnswers = maxAnswers;
       this.nbOfPlayers = nbOfPlayers;
       this.votes = votes;
       this.maxVotes = maxVotes;
    }
}

module.exports = {Game};