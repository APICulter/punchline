class Game {
    constructor (pin, hostSocketId, players = [], settings = "default", question = -1, questions = [], answers = [], maxAnswers = 0, nbOfPlayers, votes = [], maxVotes = 0, inGame = false, status = "", nbOfQuestions = 1, premium = false, answerTime = null, revealTime = null, voteTime = null) {
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
       this.status = status; // "", "answering" or "voting"
       this.nbOfQuestions = nbOfQuestions;
       this.premium = premium;
       this.answerTime = answerTime; // seconds to write an answer (null = questionCountDown from config)
       this.revealTime = revealTime; // seconds per answer during the reveals (null = revealTime from config)
       this.voteTime = voteTime; // seconds to vote (null = voteCountDown from config)
    }
}

module.exports = {Game};