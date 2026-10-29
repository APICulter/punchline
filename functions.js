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

// A question played less than this many days ago is "recent": others come first
const FRESH_DAYS = 30;
const SELECTION_FIELDS = { question: 1, reponse_1: 1, reponse_2: 1, reponse_3: 1, lastPlayedAt: 1 };

// Picks `size` random documents matching `match` (index on the filter, $sample on the result)
function sampleQuestions(Model, match, size) {
    if (size <= 0) return Promise.resolve([]);
    return Model.aggregate([{ $match: match }, { $sample: { size: size } }, { $project: SELECTION_FIELDS }]);
}

/**
 * Picks game.nbOfQuestions questions (1 to 10) for a game, without repeats:
 *  - approved questions in the game's language (game.lang), classic games only get
 *    explicit "false" ones, premium games get all of them;
 *  - first a random sample among the questions never played or not played for FRESH_DAYS;
 *  - if that is not enough, the least recently played ones (random among equal dates);
 *  - then playCount / lastPlayedAt of the chosen ones are updated.
 * Every query goes through the indexes {status, lang, [explicit], lastPlayedAt}.
 * Resolves with { requested, selected, error } once game.questions is filled
 * (empty on a database error, error set).
 */
async function initQuestions(YourModel, game) {
    const requested = Number(game.nbOfQuestions);
    const lang = game.lang === "en" ? "en" : "fr";
    const outcome = { requested: requested, selected: 0, error: null };
    try {
        const base = { status: "approved", lang: lang };
        if (!game.premium) base.explicit = "false";
        const cutoff = new Date(Date.now() - FRESH_DAYS * 24 * 3600 * 1000);

        // 1. never played, or not for FRESH_DAYS
        const fresh = await sampleQuestions(
            YourModel,
            Object.assign({}, base, { $or: [{ lastPlayedAt: null }, { lastPlayedAt: { $lt: cutoff } }] }),
            requested
        );
        let chosen = fresh;

        // 2. not enough: the least recently played ones
        let missing = requested - chosen.length;
        if (missing > 0) {
            const recentFilter = Object.assign({}, base, { lastPlayedAt: { $gte: cutoff } });
            const oldest = await YourModel.find(recentFilter, SELECTION_FIELDS).sort({ lastPlayedAt: 1 }).limit(missing).lean();
            if (oldest.length === missing && missing > 0) {
                // the questions of one game share the same date: random among the last date taken
                const boundary = oldest[oldest.length - 1].lastPlayedAt;
                const older = oldest.filter((doc) => doc.lastPlayedAt < boundary);
                const ties = await sampleQuestions(
                    YourModel,
                    Object.assign({}, base, { lastPlayedAt: boundary }),
                    missing - older.length
                );
                chosen = chosen.concat(older, ties);
            } else {
                chosen = chosen.concat(oldest);
            }
        }

        // no question twice (the unique {lang, norm} index already prevents text duplicates)
        const seen = new Set();
        chosen = chosen.filter((doc) => {
            const id = String(doc._id);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        shuffle(chosen);

        game.questions = chosen.map((element, index) => ({
            id: index,
            question: element.question,
            reponse_1: element.reponse_1,
            reponse_2: element.reponse_2,
            reponse_3: element.reponse_3,
        }));
        outcome.selected = game.questions.length;

        if (chosen.length > 0) {
            // a failure here must not stop the game
            try {
                await YourModel.updateMany(
                    { _id: { $in: chosen.map((doc) => doc._id) } },
                    { $inc: { playCount: 1 }, $set: { lastPlayedAt: new Date() } }
                );
            } catch (err) {
                console.error("Failed to update the play counts:", err);
            }
        }
    } catch (err) {
        console.error("Failed to retrieve random objects:", err);
        game.questions = [];
        outcome.error = err;
    }
    return outcome;
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
