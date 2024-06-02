// Define classes
const { Game } = require("./classes/game");
const { Player } = require("./classes/player");

// Generates a random 4-digit PIN for a room between 1000 and 9999
function generatePIN() {
	return Math.floor(1000 + Math.random() * 9000);
}

// Deals with 
function unlockedPlayers(players) {
    let unlockedPlayers = [];
    players.forEach((element) => {
        if (!element.lock) {
            unlockedPlayers.push(element);
        }
    });
    return unlockedPlayers;
}

// Initializes a bot for a game
function initBot(game) {
    let bot = new Player();
    bot.id = -1;
    bot.name = "Bot";
    bot.points = 0;
    bot.room = "";
    bot.game = "";

    game.players.push(bot);

}

// Uses randomly 1 of the 3 answers in the database for the target question
function addBotAnswer(game) {
    const keysToExclude = ["question", "id"];

    // Filter the keys to exclude those in keysToExclude
    // const availableKeys = Object.keys(game.questions[game.question]).filter(key => !keysToExclude.includes(key));
    const numeroQuestion = game.questions.find((question) => question.id === Number(game.question)).id;
    const availableKeys = Object.keys(game.questions[numeroQuestion]).filter(key => !keysToExclude.includes(key));

    // Generate a random index between 0 and the number of available keys
    const randomIndex = Math.floor(Math.random() * availableKeys.length);

    // Use the random index to get a random key from availableKeys
    const randomKey = availableKeys[randomIndex];

    // Get the value corresponding to the random key
    const randomValue = game.questions[game.question][randomKey];
    
    const botAnswer = {
         playerName: "Bot",
         textAnswer: randomValue ,
         votes: 0
    };
    game.answers.push(botAnswer);
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

// Randomly searches the desired number of questions (1 to 10), and filter on premium or not
function initQuestions(mongoose, YourModel, game) {

    // Connect to MongoDB
    mongoose.connect(databaseUrl, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    let result = [];
    
    let db = mongoose.connection;
    db.on("error", console.error.bind(console, "MongoDB connection error:"));
    db.once("open", async function() {
    
        try {
        // Retrieve random objects from the collection
        if (game.premium) {
            console.log("premium");
            result = await YourModel.aggregate([{ $sample: { size: Number(game.nbOfQuestions) } }]);
        } else {
            // console.log("not premium");
            result = await YourModel.aggregate([{ $match: {"explicit": "false"}}, {$sample: { size: Number(game.nbOfQuestions) } }]);
        }
        result.forEach( (element, index) => game.questions.push({ 
            id: index, 
            // explicit: element.explicit,
            question: element.question, 
            reponse_1: element.reponse_1, 
            reponse_2: element.reponse_2, 
            reponse_3: element.reponse_3 
        }));
        // console.log(game.questions);

        // console.log('Random objects:', result);
        } catch (err) {
        console.error("Failed to retrieve random objects:", err);
        } finally {
        // Close the MongoDB connection
        mongoose.connection.close();
        }
    });
}



// Export the functions as properties of an object
module.exports = {
    generatePIN,
    unlockedPlayers,
    initBot,
    addBotAnswer,
    shuffle,
    initQuestions

};
