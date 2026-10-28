// Define classes
const { Player } = require("./classes/player");

// Generates a random 4-digit PIN for a room between 1000 and 9999
function generatePIN() {
	return Math.floor(1000 + Math.random() * 9000);
}

// Returns the players that are not currently connected (can be taken over when rejoining a started game).
// The bot is never returned.
function unlockedPlayers(players) {
    return players.filter((element) => !element.lock && element.id !== -1);
}

// Initializes a bot for a game
function initBot(game) {
    let bot = new Player();
    bot.id = -1;
    bot.name = "Bot";
    bot.points = 0;
    bot.room = "";
    bot.game = "";
    bot.lock = true;

    // Only one bot per game
    if (!game.players.some((player) => player.id === -1)) {
        game.players.push(bot);
    }
}

// Uses randomly 1 of the 3 answers in the database for the current question
function addBotAnswer(game) {
    const keysToExclude = ["question", "id"];
    const currentQuestion = game.questions[game.question];
    if (typeof currentQuestion === "undefined") {
        return;
    }

    // Keep only the bot answers that actually exist for this question
    const availableKeys = Object.keys(currentQuestion).filter(
        (key) => !keysToExclude.includes(key) && currentQuestion[key]
    );
    if (availableKeys.length === 0) {
        return;
    }

    // Pick a random answer among the available ones
    const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];

    game.answers.push({
        playerName: "Bot",
        textAnswer: currentQuestion[randomKey],
        votes: 0,
    });
}


// Shuffles the answers of the players and the bot for UI display
function shuffle(answers) {
    let counter = answers.length;

    while (counter > 0) {
        let index = Math.floor(Math.random() * counter);
        counter--;
        let temp = answers[counter];
        answers[counter] = answers[index];
        answers[index] = temp;
    }

    return answers;
}

// Randomly searches the desired number of questions (1 to 10), and filter on premium or not.
// Uses the shared mongoose connection opened at startup. Returns a promise resolved once
// game.questions is filled (it stays empty if the query fails).
async function initQuestions(YourModel, game) {
    try {
        let result;
        if (game.premium) {
            result = await YourModel.aggregate([{ $sample: { size: Number(game.nbOfQuestions) } }]);
        } else {
            result = await YourModel.aggregate([{ $match: { explicit: "false" } }, { $sample: { size: Number(game.nbOfQuestions) } }]);
        }
        game.questions = result.map((element, index) => ({
            id: index,
            question: element.question,
            reponse_1: element.reponse_1,
            reponse_2: element.reponse_2,
            reponse_3: element.reponse_3,
        }));
    } catch (err) {
        console.error("Failed to retrieve random objects:", err);
    }
}


// Export the functions as properties of an object
module.exports = {
    generatePIN,
    unlockedPlayers,
    initBot,
    addBotAnswer,
    shuffle,
    initQuestions,
};
