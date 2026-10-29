/**
 * Admin panel: mounted by app.js with
 *   require("./admin")(app, { mongoose, getGames, abortGame })
 * - mongoose:  the shared mongoose instance (connection already opened by app.js)
 * - getGames:  () => array of the games currently in memory
 * - abortGame: (pin, reasonKey) => ends one game and sends its players home
 */
module.exports = function mountAdmin(app, options) {
	// implemented in the admin module
};
