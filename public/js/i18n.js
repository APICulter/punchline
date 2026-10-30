/* ==========================================================================
   Punchline i18n: English / French
   Loaded on every page before common.js and the page scripts.

   - t(key, params)      translated string, {name} placeholders, {name|duration}
                         formats a number of seconds; a value can be an object
                         { one, other } chosen with params.count (plural).
   - getLang(), setLang(lang), onLangChange(fn)
   - applyTranslations(root) fills the elements marked with
       data-i18n="key"             textContent
       data-i18n-placeholder="key" placeholder
       data-i18n-aria-label="key"  aria-label
       data-i18n-title="key"       title
       data-i18n-empty="key"       data-empty (empty list message)
       data-i18n-html="key"        innerHTML, ONLY for static trusted strings
                                   of this file, never for player content
     with optional data-i18n-params='{"count":2}' (JSON) for the placeholders.
   - i18nText(el, key, params) / i18nAttr(el, attr, key, params) mark an element
     created in JS so that it is translated again when the language changes.
   - i18nMessage(payload) translates a message key sent by the server
     ("error.roomFull"), or returns any other string unchanged.

   French typography:   (narrow no-break space) before ! ? ; and
     (no-break space) before : and inside « ».
   ========================================================================== */
(function () {
	"use strict";

	var STORAGE_KEY = "punchline.lang";
	var DEFAULT_LANG = "en";

	var DICT = {
		en: {
			"app.title": "Punchline",

			// language switch
			"lang.switch": "Switch to French",
			"lang.target": "FR",

			// common
			"common.close": "Close",
			"common.home": "Back to home",
			"common.homeHost": "End the game and go home",
			"common.rules": "How to play",
			"common.gamePin": "Game PIN",
			"common.and": " & ",

			// durations
			"duration.seconds": { one: "{count} second", other: "{count} seconds" },
			"duration.minutes": { one: "{count} minute", other: "{count} minutes" },
			"duration.mixed": "{minutes} min {seconds} s",

			// rules sheet
			"rules.title": "How to play",
			"rules.intro": "One big screen for the questions, one phone per player.",
			"rules.step1": "Create a game on the big screen. Choose 1 to 10 rounds, or enter a premium code for extra questions.",
			"rules.step2.before": "Everyone opens ",
			"rules.step2.after": " on their phone, types the PIN and picks a name.",
			"rules.step3": "A question appears. Write your answer before the clock runs out: the host sets how long you get.",
			"rules.step3.known": "A question appears. You have {seconds|duration} to write your answer.",
			"rules.step4": "The answers show up on every phone, without names. Vote for your favourite, just not your own.",
			"rules.step4.known": "The answers show up on every phone, without names. You have {seconds|duration} to vote for your favourite, just not your own.",
			"rules.step5": "Every vote you get is worth 1 point. Most points after the last round wins.",
			"rules.gotIt": "Got it",

			// lobby / home
			"home.tagline": "Write the funniest answer. Vote for the best one.",
			"home.create": "Create a game",
			"home.join": "Join a game",
			"home.hint": "Create on the big screen, join from your phone.",
			"join.title": "Enter the game PIN",
			"join.hint": "You'll find it on the big screen.",
			"join.button": "Join",
			"lobby.openOnPhone": "On your phone, open",
			"lobby.enterPin": "and enter this PIN",
			"lobby.rounds": "Rounds",
			"lobby.answerTime": "Time to answer",
			"lobby.revealTime": "Time per reveal",
			"lobby.voteTime": "Time to vote",
			"lobby.questions": "Questions",
			"lobby.classic": "Classic",
			"lobby.premium": "Premium",
			"lobby.premiumCode": "Premium code",
			"lobby.players": "Players",
			"lobby.joined": { one: "joined", other: "joined" },
			"lobby.empty": "Waiting for players to join…",
			"lobby.start": "Start the game",
			"lobby.remove": "Remove {name}",
			"lobby.scanToJoin": "Scan to join",
			"lobby.qrLabel": "QR code to join the game: {url}",

			// choose a name (phone)
			"name.title": "What should we call you?",
			"name.hint": "Up to 21 characters. Your friends will see it on the scoreboard.",
			"name.placeholder": "Your name",
			"name.go": "Let's go",
			"rejoin.title": "Who are you?",
			"rejoin.hint": "The game has already started. Pick your name to jump back in.",
			"rejoin.button": "Rejoin",
			"rejoin.empty.title": "Every player in this game is already connected.",
			"rejoin.empty.text": "If you were playing in this game, wait a few seconds and try again.",
			"resume.title": "Welcome back!",
			"resume.hint": "Your game {pin} is still on.",
			"resume.button": "Rejoin the game as {name}",
			"resume.notMe": "That's not me",

			// game (host screen)
			"game.getReady": "Get ready…",
			"game.roundReady": "Round {round} · Get ready",
			"game.roundAnswering": "Round {round} · Answer on your phone",
			"game.timesUp": "Time's up! Here are the answers",
			"game.answerOf": "Answer {index} of {total}",
			"game.voting": "Vote for your favourite on your phone",
			"game.votesIntro": "And the votes go to…",
			"game.noVotes": "No votes this round",
			"game.votesOf": "Votes · {index} of {total}",
			"game.secondsLeft": "Seconds left",
			"game.clock.label": "Time before the next step",
			"game.clock.toVotes": "Votes open in",
			"game.clock.toNext": "Next question in",
			"game.clock.toScores": "Scores in",
			"game.clock.votes": "Votes in",
			"game.clock.votesCount": "{votes} of {expected} votes in",
			"game.clock.votesTimed": "{votes} of {expected} votes in, {seconds|duration} left to vote",

			// prompt (phone)
			"prompt.title": "Your punchline",
			"prompt.hint": "Read the question on the big screen and beat the clock.",
			"prompt.hint.known": "Read the question on the big screen. You have {seconds|duration}.",
			"prompt.label": "Your answer",
			"prompt.placeholder": "Type something funny…",
			"prompt.send": "Send my answer",

			// vote (phone)
			"vote.title": "Pick your favourite",
			"vote.hint": "No names, no pressure. You can't vote for your own.",
			"vote.answers": "Answers",
			"vote.loading": "Loading the answers…",
			"vote.button": "Vote",
			"vote.yours": "Yours",
			"vote.timeLeft": "Seconds left to vote",

			// waiting (phone)
			"wait.title": "Hang tight!",
			"wait.text": "Waiting for the others. Keep an eye on the big screen.",
			"wait.answer.title": "Answer sent!",
			"wait.answer.text": "Waiting for the others to finish writing…",
			"wait.vote.title": "Vote counted!",
			"wait.vote.text": "Waiting for everyone to vote. Results on the big screen.",
			"wait.late.title": "Time's up!",
			"wait.late.text": "Too late for this one. Get ready to vote…",
			"wait.voteLate.title": "Votes closed!",
			"wait.voteLate.text": "No vote from you this round. Results on the big screen.",
			"wait.in.title": "You're in!",
			"wait.in.text": "The game starts soon. Keep an eye on the big screen.",

			// scores (host screen)
			"scores.kicker": "That's a wrap!",
			"scores.winner": "The winner is",
			"scores.tie": "It's a tie!",
			"scores.counting": "Counting the votes…",
			"scores.again": "Play again",
			"scores.caption": "Final scores",
			"scores.rank": "Rank",
			"scores.player": "Player",
			"scores.points": "Points",
			"scores.pointsLabel": { one: "{count} point", other: "{count} points" },

			// sound controls (audio.js)
			"sound.volume": "Music volume",
			"sound.unlock": "Tap to enable sound",
			"sound.enable": "Enable sound",
			"sound.mute": "Mute",
			"sound.unmute": "Unmute",
			"sound.sfx": "Sound effects",
			"sound.sfxOn": "Sound effects on",
			"sound.sfxOff": "Sound effects off",

			// errors (client checks and server message keys)
			"error.pinEmpty": "Enter the 4-digit PIN",
			"error.pinDigitsOnly": "The PIN only has numbers",
			"error.pinLength": "The PIN has 4 digits",
			"error.gameNotFound": "No game found with this PIN",
			"error.roomFull": "This game is full",
			"error.nameEmpty": "Enter a name to join",
			"error.nameTooLong": "Name too long",
			"error.nameInvalidChars": "Invalid character(s): {chars}",
			"error.nameUnauthorized": "This name isn't allowed",
			"error.nameTaken": "This name is already taken",
			"error.pickName": "Pick your name first",
			"error.playerConnected": "This player is already connected",
			"error.sessionExpired": "This game can't be rejoined anymore",
			"error.premiumCodeEmpty": "Enter the premium code",
			"error.premiumCodeTooLong": "Code too long",
			"error.premiumCodeLength": "The premium code must be 1 to 15 characters",
			"error.premiumCodeInvalid": "Invalid premium code",
			"error.premiumTooManyAttempts": "Too many wrong premium codes. Wait 15 minutes or play Classic.",
			"error.notEnoughPlayers": "You need at least {count} players",
			"error.roundsInvalid": "Invalid number of rounds",
			"error.answerTimeInvalid": "Invalid answer time",
			"error.revealTimeInvalid": "Invalid reveal time",
			"error.voteTime": "Invalid vote time",
			"error.questionsUnavailable": "Couldn't load the questions. Try again.",
			"error.answerEmpty": "Write something first",
			"error.answerTooLong": "That answer is too long",
			"error.pickAnswer": "Tap an answer first",
			"error.gameCrashed": "Oops, this game hit a problem and had to stop. Sorry! Start a new one.",
			"error.gameEnded": "This game was ended by an admin.",
			"notice.gameResumed": "We're back! The game picks up where it left off.",
			"notice.voteTooLate": "Too late to vote!",
			"notice.sessionElsewhere": "Your game was picked up on another screen.",
			"notice.questionsLang": "The next questions will be in English.",
			"error.notEnoughQuestions": "No questions in this language yet. Switch the language, or ask the admin to add some.",
			"notice.fewerQuestions": "Not enough questions in this language: this game has fewer rounds than planned.",

			// ----- admin panel (/admin) -----
			"admin.title": "Punchline · Admin",
			"admin.kicker": "Back office",
			"admin.skip": "Skip to content",
			"admin.sections": "Sections",
			"admin.signedInAs": "Signed in as",
			"admin.logout": "Log out",
			"admin.loading": "Loading…",
			"admin.refresh": "Refresh",
			"admin.cancel": "Cancel",
			"admin.save": "Save",
			"admin.colon": ": ",
			"admin.time.now": "just now",
			"admin.login.title": "Admin sign-in",
			"admin.login.hint": "Manage the questions and the live games.",
			"admin.login.user": "User name",
			"admin.login.password": "Password",
			"admin.login.submit": "Sign in",
			"admin.login.missing": "Enter your user name and password",
			"admin.setup.title": "The admin panel is turned off",
			"admin.setup.text": "No administrator is configured on this server. To turn the panel on:",
			"admin.setup.step1": "Create a password hash on the server:",
			"admin.setup.step2": "Set ADMIN_USER and ADMIN_PASSWORD_HASH (environment variables), or adminUser and adminPasswordHash in config.properties.",
			"admin.setup.step3": "Restart the server and come back to this page.",
			"admin.tab.questions": "Questions",
			"admin.tab.games": "Live games",
			"admin.tab.gamesShort": "Games",
			"admin.tab.activity": "Activity",
			"admin.q.search": "Search",
			"admin.q.searchPlaceholder": "Question or bot answer",
			"admin.q.filter": "Show",
			"admin.filter.all": "All",
			"admin.q.add": "Add a question",
			"admin.q.import": "Import CSV",
			"admin.q.export": "Export CSV",
			"admin.q.duplicates": "Find duplicates",
			"admin.q.addShort": "Add",
			"admin.q.importShort": "Import",
			"admin.q.exportShort": "Export",
			"admin.q.duplicatesShort": "Duplicates",
			"admin.q.count": { one: "{count} question", other: "{count} questions" },
			"admin.q.found": { one: "{count} question found", other: "{count} questions found" },
			"admin.q.bot": "Bot",
			"admin.q.noAnswer": "No answer",
			"admin.q.edit": "Edit",
			"admin.q.delete": "Delete",
			"admin.q.empty": "No questions yet",
			"admin.q.emptyHint": "Add one, or import a CSV file.",
			"admin.q.noResult": "Nothing found",
			"admin.q.noResultHint": "Try other words, or another filter.",
			"admin.q.addTitle": "New question",
			"admin.q.editTitle": "Edit the question",
			"admin.q.added": "Question added",
			"admin.q.saved": "Question saved",
			"admin.q.deleted": "Question deleted",
			"admin.q.deleteTitle": "Delete this question?",
			"admin.q.deleteText": "It will no longer come up in games. This can't be undone.",
			"admin.q.deleteConfirm": "Delete",
			"admin.pager": "Pages",
			"admin.pager.prev": "Previous",
			"admin.pager.next": "Next",
			"admin.pager.info": "Page {page} of {pages}",
			"admin.field.question": "Question",
			"admin.field.answers": "Bot answers",
			"admin.field.answersHint": "The bot picks one of them. At least one, 100 characters max each.",
			"admin.field.reponse_1": "Answer 1",
			"admin.field.reponse_2": "Answer 2",
			"admin.field.reponse_3": "Answer 3",
			"admin.field.explicit": "Type",
			"admin.field.type": "Question type",
			"admin.field.premium": "Premium (explicit)",
			"admin.field.typeHint": "Premium questions only come up in games started with the premium code.",
			"admin.import.title": "Import questions",
			"admin.import.file": "CSV file",
			"admin.import.check": "Check the file",
			"admin.import.run": { one: "Import {count} question", other: "Import {count} questions" },
			"admin.import.noFile": "Choose a file first",
			"admin.import.emptyFile": "This file is empty",
			"admin.import.badType": "Send a CSV text file",
			"admin.import.previewTitle": "Check before importing",
			"admin.import.doneTitle": { one: "{count} question added", other: "{count} questions added" },
			"admin.import.stat.new": { one: "new", other: "new" },
			"admin.import.stat.added": { one: "added", other: "added" },
			"admin.import.stat.duplicates": { one: "duplicate skipped", other: "duplicates skipped" },
			"admin.import.stat.errors": { one: "line with errors", other: "lines with errors" },
			"admin.import.errorsTitle": { one: "{count} line with errors (skipped)", other: "{count} lines with errors (skipped)" },
			"admin.import.duplicatesTitle": { one: "{count} duplicate (skipped)", other: "{count} duplicates (skipped)" },
			"admin.import.line": "Line {line}",
			"admin.import.inDb": "already in the database",
			"admin.import.sameAs": "same as line {line}",
			"admin.import.more": "…and {count} more",
			"admin.import.nothing": "Nothing new to import.",
			"admin.import.tooManyLines": "Too many lines: 10,000 max per file",
			"admin.import.tooManyColumns": "more than 7 columns (a \";\" inside a text?)",
			"admin.import.badExplicit": "explicit must be true or false",
			"admin.dup.title": "Duplicate questions",
			"admin.dup.hint": "Same question text, ignoring case, spaces and apostrophes.",
			"admin.dup.none": "No duplicates. All clean!",
			"admin.dup.count": { one: "{count} question has duplicates", other: "{count} questions have duplicates" },
			"admin.games.count": { one: "{count} game in memory", other: "{count} games in memory" },
			"admin.games.updated": "· updated at {time}",
			"admin.games.empty": "No game in progress.",
			"admin.games.note": "Refreshed every 5 seconds. Times are approximate (as seen by the server).",
			"admin.games.label": "Game {pin}",
			"admin.games.phase.lobby": "Lobby",
			"admin.games.phase.answering": "Answering",
			"admin.games.phase.voting": "Voting",
			"admin.games.phase.playing": "In game",
			"admin.games.phase.scores": "Final scores",
			"admin.games.round": "Round {round} of {rounds}",
			"admin.games.seen": "Seen {since} · last activity {activity}",
			"admin.games.players": { one: "{count} player", other: "{count} players" },
			"admin.games.bot": "bot",
			"admin.games.offline": "offline",
			"admin.games.end": "End this game",
			"admin.games.endTitle": "End game {pin}?",
			"admin.games.endText": "The big screen and the players go back to the home page. Scores are lost.",
			"admin.games.endConfirm": "End the game",
			"admin.games.ended": "Game {pin} ended",
			"admin.log.title": "Latest admin actions",
			"admin.log.empty": "Nothing yet.",
			"admin.log.detail.username": "user name tried: {name}",
			"admin.log.detail.pin": "PIN {pin}",
			"admin.log.detail.import": "{inserted} added, {duplicates} duplicates, {errors} errors",
			"admin.action.login.ok": "Signed in",
			"admin.action.login.failed": "Failed sign-in",
			"admin.action.logout": "Logged out",
			"admin.action.question.create": "Question added",
			"admin.action.question.update": "Question edited",
			"admin.action.question.delete": "Question deleted",
			"admin.action.question.import": "CSV import",
			"admin.action.game.end": "Game ended",
			"admin.error.network": "Can't reach the server. Check your connection.",
			"admin.error.server": "Something went wrong on the server. Try again.",
			"admin.error.invalid": "Invalid value",
			"admin.error.validation": "Check the highlighted fields",
			"admin.error.required": "Required",
			"admin.error.tooLong": "Too long ({max} characters max)",
			"admin.error.badChars": "Contains invalid characters",
			"admin.error.semicolon": "\";\" is not allowed (CSV separator)",
			"admin.error.answerRequired": "Give the bot at least one answer",
			"admin.error.duplicate": "This question already exists",
			"admin.error.notFound": "Not found (already deleted?)",
			"admin.error.gameNotFound": "This game no longer exists",
			"admin.error.tooLarge": "File too large (1 MB max)",
			"admin.error.csrf": "Request refused (security check). Reload the page.",
			"admin.error.unauthorized": "Your session has expired. Sign in again.",
			"admin.error.disabled": "The admin panel is turned off",
			"admin.error.badCredentials": "Wrong user name or password",
			"admin.error.tooManyAttempts": "Too many attempts. Try again later.",
			"admin.error.tooManyAttempts.wait": "Too many attempts. Try again in {seconds|duration}.",
			"admin.error.busy": "The server is busy. Try again in a moment.",
			"admin.tab.review": "To review",
			"admin.tab.reviewShort": "Review",
			"admin.q.lang": "Language",
			"admin.q.category": "Category",
			"admin.q.status": "Status",
			"admin.status.approvedPlural": "Approved",
			"admin.status.rejectedPlural": "Rejected",
			"admin.status.all": "All statuses",
			"admin.status.pending": "To review",
			"admin.status.rejected": "Rejected",
			"admin.cat.all": "All categories",
			"admin.cat.none": "No category",
			"admin.cat.mix": "Mixed categories",
			"admin.cat.quotidien": "Everyday life",
			"admin.cat.travail": "Work",
			"admin.cat.couple": "Love life",
			"admin.cat.famille": "Family",
			"admin.cat.nourriture": "Food",
			"admin.cat.voyage": "Travel",
			"admin.cat.ecole": "School",
			"admin.cat.tech": "Tech",
			"admin.cat.pop": "Pop culture",
			"admin.cat.absurde": "Absurd",
			"admin.cat.animaux": "Animals",
			"admin.cat.sport": "Sport",
			"admin.cat.fete": "Parties",
			"admin.lang.fr": "French",
			"admin.lang.en": "English",
			"admin.field.lang": "Language",
			"admin.field.category": "Category",
			"admin.source.bank": "Bank",
			"admin.source.ai": "AI",
			"admin.source.admin": "Added by hand",
			"admin.source.import": "Imported",
			"admin.q.played": { one: "played once", other: "played {count} times" },
			"admin.q.lastPlayed": "last {when}",
			"admin.q.neverPlayed": "never played",
			"admin.import.lang": "Language of the lines without lang",
			"admin.import.badLang": "lang must be fr or en",
			"admin.error.badCategory": "Unknown category",
			// CSV import: format help, checks, report
			"admin.status.allShort": "All",
			"admin.pager.first": "First page",
			"admin.pager.last": "Last page",
			"admin.pager.prevPage": "Previous page",
			"admin.pager.nextPage": "Next page",
			"admin.pager.perPage": "Per page",
			"admin.pager.range": "Questions {from}–{to} of {count}",
			"admin.import.intro": "A CSV file saved as “CSV UTF-8”, with “;” as separator and one question per line.",
			"admin.import.help.title": "Expected format",
			"admin.import.col.questionDesc": "The question or the sentence to complete. Required, 300 characters max.",
			"admin.import.col.answerDesc": "A bot answer, 100 characters max. At least one of the three is required.",
			"admin.import.col.answerOptDesc": "Another bot answer (can be empty).",
			"admin.import.col.explicitDesc": "true for a premium (explicit) question, false for a classic one. Empty = false.",
			"admin.import.col.categoryDesc": "Optional, one of these values (empty = no category):",
			"admin.import.col.langDesc": "Optional: fr or en. Empty = the language chosen below.",
			"admin.import.rule.separator": "No “;” inside the texts: it separates the columns.",
			"admin.import.rule.header": "A header line (question;reponse_1;…) is allowed: it is skipped.",
			"admin.import.rule.quotes": "Quotes added by Excel or LibreOffice are removed.",
			"admin.import.rule.limits": "1 MB and 10,000 lines max. Questions already in the database are skipped.",
			"admin.import.example": "Example",
			"admin.import.template": "Download a template",
			"admin.import.copied": "Example copied",
			"admin.import.fileHint": "The file is checked first: nothing is imported until you confirm.",
			"admin.import.runValid": { one: "Import the valid line", other: "Import the {count} valid lines" },
			"admin.import.notChecked": "Check the file again before importing it",
			"admin.import.blocked": "File refused: nothing was imported",
			"admin.import.blockedTitle": "File refused: nothing can be imported",
			"admin.import.blockedHint": "Fix the file, save it again, then choose it again.",
			"admin.import.fatal.utf16": "This file is in UTF-16 (“Unicode text”). Save it as “CSV UTF-8” instead.",
			"admin.import.fatal.spreadsheet": "This is a spreadsheet (.xlsx, .xls or .ods), not a CSV file. Save it as “CSV UTF-8” with “;” as separator.",
			"admin.import.fatal.binary": "This is not a text file.",
			"admin.import.fatal.encoding": "The file is not in UTF-8 (first unreadable character on line {line}): it was probably saved as “CSV (Windows)” or Latin-1. Save it again as “CSV UTF-8”.",
			"admin.import.fatal.mojibake": "Broken accents (“Ã©” instead of “é”) from line {line}: the file was opened with the wrong encoding and saved again. Start from the original file and save it as “CSV UTF-8”.",
			"admin.import.fatal.separator.comma": "The separator must be “;” but this file uses commas. Export it again with “;” as field separator.",
			"admin.import.fatal.separator.tab": "The separator must be “;” but this file uses tabs. Export it again with “;” as field separator.",
			"admin.import.fatal.separator.none": "No “;” found: the separator must be “;” and every line needs 5 to 7 columns.",
			"admin.import.fatal.columns": "Every line has more than 7 columns: check the separator and that no text contains a “;”.",
			"admin.import.fatal.mostlyInvalid": "{count} lines out of {total} are invalid (more than half): the file is probably not in the right format.",
			"admin.import.fatal.empty": "No question in this file.",
			"admin.import.colNo": "Col. {n}",
			"admin.import.issue.required": "the question is empty",
			"admin.import.issue.tooLong": "{length} characters, {max} max",
			"admin.import.issue.badChars": "invalid character ({char})",
			"admin.import.issue.semicolon": "contains a “;” (“{value}”)",
			"admin.import.issue.noAnswer": "no bot answer (columns 2 to 4 are empty)",
			"admin.import.issue.explicit": "“{value}” is neither true nor false",
			"admin.import.issue.category": "unknown category “{value}” (allowed: {allowed})",
			"admin.import.issue.lang": "“{value}” is neither fr nor en",
			"admin.import.issue.tooManyColumns": "{count} columns instead of 5 to 7 (a “;” inside a text?)",
			"admin.import.issue.tooFewColumns": { one: "1 column instead of 5 to 7", other: "{count} columns instead of 5 to 7" },
			"admin.import.issue.invalid": "invalid value",
			"admin.import.tooFewColumns": "fewer than 5 columns",
			"admin.import.warn.header": "Header line skipped:",
			"admin.import.warn.quotes": "Spreadsheet quotes removed",
			"admin.import.warn.trailing": { one: "Empty extra column removed", other: "{count} empty extra columns removed" },
			"admin.import.warn.otherLang": "{count} of the {total} lines without lang look written in {detectedName}, but they will be imported in {langName}. Check the language chosen above.",
			"admin.import.wholeFile": "File",
			"admin.import.warningsTitle": { one: "{count} warning", other: "{count} warnings" },
			"admin.import.stat.valid": { one: "valid, to import", other: "valid, to import" },
			"admin.import.stat.warnings": { one: "warning", other: "warnings" },
			"admin.import.skipNote": { one: "The line with errors will be skipped. Fix it in your file to import it later.", other: "The {count} lines with errors will be skipped. Fix them in your file to import them later." },
			"admin.review.title": "Questions waiting for approval",
			"admin.review.count": { one: "{count} question to review", other: "{count} questions to review" },
			"admin.review.empty": "Nothing to review",
			"admin.review.emptyHint": "Generate questions with AI: they wait here until you approve them.",
			"admin.review.emptyHintOff": "Questions generated by AI wait here for approval. AI generation is off on this server.",
			"admin.review.approve": "Approve",
			"admin.review.reject": "Reject",
			"admin.review.approveAll": "Approve all",
			"admin.review.rejectAll": "Reject all",
			"admin.review.approved": "Question approved",
			"admin.review.rejected": "Question rejected",
			"admin.review.approveAllTitle": { one: "Approve {count} question?", other: "Approve {count} questions?" },
			"admin.review.approveAllText": "They can come up in games right away. Only the questions of the language shown are concerned.",
			"admin.review.rejectAllTitle": { one: "Reject {count} question?", other: "Reject {count} questions?" },
			"admin.review.rejectAllText": "They won’t come up in games. They stay in the database (status Rejected), so they are not generated again.",
			"admin.review.approvedCount": { one: "{count} question approved", other: "{count} questions approved" },
			"admin.review.rejectedCount": { one: "{count} question rejected", other: "{count} questions rejected" },
			"admin.ai.generate": "Generate with AI",
			"admin.ai.title": "Generate with AI",
			"admin.ai.offTitle": "AI generation is turned off on this server",
			"admin.ai.offText": "To turn it on, give the server an Anthropic API key, then restart it:",
			"admin.ai.offHint": "Optional: ANTHROPIC_MODEL (default claude-sonnet-5-5). See the README, “Questions”.",
			"admin.ai.hint": "Claude writes new questions in the style of yours. They wait in “To review” until you approve them.",
			"admin.ai.count": "How many (1 to 50)",
			"admin.ai.theme": "Free theme (optional)",
			"admin.ai.themePlaceholder": "e.g. camping, Monday mornings",
			"admin.ai.seeReview": "See them in To review",
			"admin.ai.run": "Generate",
			"admin.ai.running": "Generating… (up to 1 min)",
			"admin.ai.statusOn": "AI on · {model} · {remaining} of {perHour} generations left this hour",
			"admin.ai.statusOnAuto": "AI on · {model} · {remaining} of {perHour} generations left this hour · automatic top-up on",
			"admin.ai.statusOff": "AI generation is off (no ANTHROPIC_API_KEY on the server).",
			"admin.ai.info": "Model {model} · {remaining} of {perHour} generations left this hour. Each generation is billed by Anthropic.",
			"admin.ai.noneLeft": "Hourly limit reached ({perHour} generations). Try again later.",
			"admin.ai.doneTitle": { one: "{count} question generated", other: "{count} questions generated" },
			"admin.ai.stat.added": { one: "to review", other: "to review" },
			"admin.ai.stat.invalid": { one: "invalid, dropped", other: "invalid, dropped" },
			"admin.ai.usage": "{model} · {input} input tokens, {output} output tokens",
			"admin.ai.error.disabled": "AI generation is turned off on this server",
			"admin.ai.error.timeout": "The AI took too long to answer. Try again with fewer questions.",
			"admin.ai.error.network": "Can’t reach the Anthropic API.",
			"admin.ai.error.auth": "The Anthropic API refused the key (check ANTHROPIC_API_KEY).",
			"admin.ai.error.upstreamRate": "The Anthropic API is limiting this key. Try again later.",
			"admin.ai.error.request": "The Anthropic API refused the request (check ANTHROPIC_MODEL).",
			"admin.ai.error.upstream": "The Anthropic API had a problem. Try again.",
			"admin.ai.error.badResponse": "The AI’s answer could not be read. Try again.",
			"admin.ai.error.refused": "The AI declined this request. Try another theme.",
			"admin.ai.error.busy": "A generation is already running. Wait for it to finish.",
			"admin.ai.error.rateLimit": "Hourly limit of generations reached. Try again later.",
			"admin.ai.error.count": "Between 1 and 50",
			"admin.ai.error.withReason": "{message} ({reason})",
			"admin.action.question.approve": "Question approved",
			"admin.action.question.reject": "Question rejected",
			"admin.action.question.pending": "Question sent back to review",
			"admin.action.question.approveAll": "Pending questions approved",
			"admin.action.question.rejectAll": "Pending questions rejected",
			"admin.action.ai.generate": "AI generation",
			"admin.action.ai.topup": "Automatic AI top-up",
			"admin.action.ai.error": "AI generation failed",
			"admin.log.detail.ai": "{lang}: {inserted} added, {duplicates} duplicates, {invalid} invalid",
			"admin.log.detail.count": { one: "{count} question", other: "{count} questions" },
			"admin.settings.tab": "Settings",
			"admin.settings.premiumTitle": "Premium code",
			"admin.settings.premiumHint": "The host selects “Premium” in the lobby and types this code to add the explicit questions to the game. Case, spaces and dashes don’t matter.",
			"admin.settings.codeLabel": "Current code",
			"admin.settings.on": "On",
			"admin.settings.off": "Off",
			"admin.settings.offTitle": "Premium is turned off",
			"admin.settings.offText": "No code works in the lobby. Generate a code or choose one to turn it on.",
			"admin.settings.copy": "Copy",
			"admin.settings.copied": "Code copied",
			"admin.settings.copyFailed": "Copy is not available here: the code is selected, copy it with Ctrl+C",
			"admin.settings.updated": "Changed {when} by {who}",
			"admin.settings.updatedNoUser": "Changed {when}",
			"admin.settings.fromConfig": "Read from config.properties (not saved in the database yet)",
			"admin.settings.generate": "Generate a new code",
			"admin.settings.generateFirst": "Generate a code",
			"admin.settings.generateTitle": "Generate a new code?",
			"admin.settings.generateText": "The current code stops working at once: give the new one to the hosts. Games already started keep their questions.",
			"admin.settings.generateConfirm": "Generate",
			"admin.settings.generated": "New code generated",
			"admin.settings.disable": "Disable premium",
			"admin.settings.disableTitle": "Disable premium?",
			"admin.settings.disableText": "No code will work in the lobby until you generate or choose a new one. Games already started are not affected.",
			"admin.settings.disableConfirm": "Disable",
			"admin.settings.disabled": "Premium disabled",
			"admin.settings.custom": "Choose your own code",
			"admin.settings.customHint": "4 to 15 characters: letters without accents, digits and dashes. Easy to type on a phone or a TV.",
			"admin.settings.customPlaceholder": "e.g. summer-party",
			"admin.settings.customSave": "Use this code",
			"admin.settings.saved": "Code saved",
			"admin.settings.error.length": "4 to 15 characters, at least 4 letters or digits.",
			"admin.settings.error.chars": "Only letters without accents, digits and dashes.",
			"admin.settings.error.invalid": "This code is not valid.",
			"admin.settings.error.unavailable": "Settings are not available on this server.",
			"admin.settings.action.generate": "Premium code generated",
			"admin.settings.action.change": "Premium code changed",
			"admin.settings.action.disable": "Premium disabled",
		},

		fr: {
			"app.title": "Punchline",

			"lang.switch": "Passer en anglais",
			"lang.target": "EN",

			"common.close": "Fermer",
			"common.home": "Retour à l’accueil",
			"common.homeHost": "Terminer la partie et revenir à l’accueil",
			"common.rules": "Comment jouer",
			"common.gamePin": "Code PIN de la partie",
			"common.and": " et ",

			"duration.seconds": { one: "{count} seconde", other: "{count} secondes" },
			"duration.minutes": { one: "{count} minute", other: "{count} minutes" },
			"duration.mixed": "{minutes} min {seconds}",

			"rules.title": "Comment jouer",
			"rules.intro": "Un grand écran pour les questions, un téléphone par joueur.",
			"rules.step1": "Crée une partie sur le grand écran. Choisis de 1 à 10 manches, ou entre un code premium pour débloquer plus de questions.",
			"rules.step2.before": "Tout le monde ouvre ",
			"rules.step2.after": " sur son téléphone, tape le code PIN et choisit un nom.",
			"rules.step3": "Une question apparaît. Écris ta réponse avant la fin du chrono : c’est l’hôte qui choisit sa durée.",
			"rules.step3.known": "Une question apparaît. Tu as {seconds|duration} pour écrire ta réponse.",
			"rules.step4": "Les réponses s’affichent sur tous les téléphones, sans les noms. Vote pour ta préférée, mais pas pour la tienne.",
			"rules.step4.known": "Les réponses s’affichent sur tous les téléphones, sans les noms. Tu as {seconds|duration} pour voter pour ta préférée (pas la tienne).",
			"rules.step5": "Chaque vote reçu rapporte 1 point. Le plus de points après la dernière manche l’emporte.",
			"rules.gotIt": "Compris !",

			"home.tagline": "Écris la réponse la plus drôle. Vote pour la meilleure.",
			"home.create": "Créer une partie",
			"home.join": "Rejoindre une partie",
			"home.hint": "Crée la partie sur le grand écran, rejoins-la depuis ton téléphone.",
			"join.title": "Entre le code PIN de la partie",
			"join.hint": "Tu le trouveras sur le grand écran.",
			"join.button": "Rejoindre",
			"lobby.openOnPhone": "Sur ton téléphone, ouvre",
			"lobby.enterPin": "et entre ce code PIN",
			"lobby.rounds": "Manches",
			"lobby.answerTime": "Temps pour répondre",
			"lobby.revealTime": "Temps par réponse",
			"lobby.voteTime": "Temps pour voter",
			"lobby.questions": "Questions",
			"lobby.classic": "Classique",
			"lobby.premium": "Premium",
			"lobby.premiumCode": "Code premium",
			"lobby.players": "Joueurs",
			"lobby.joined": { one: "joueur", other: "joueurs" },
			"lobby.empty": "On attend les joueurs…",
			"lobby.start": "Lancer la partie",
			"lobby.remove": "Retirer {name}",
			"lobby.scanToJoin": "Scanne pour rejoindre",
			"lobby.qrLabel": "QR code pour rejoindre la partie : {url}",

			"name.title": "Comment on t’appelle ?",
			"name.hint": "21 caractères max. Tes potes le verront sur le tableau des scores.",
			"name.placeholder": "Ton nom",
			"name.go": "C’est parti !",
			"rejoin.title": "Qui es-tu ?",
			"rejoin.hint": "La partie a déjà commencé. Choisis ton nom pour revenir dans le jeu.",
			"rejoin.button": "Revenir dans la partie",
			"rejoin.empty.title": "Tous les joueurs de cette partie sont déjà connectés.",
			"rejoin.empty.text": "Si tu jouais dans cette partie, attends quelques secondes puis réessaie.",
			"resume.title": "Te revoilà !",
			"resume.hint": "Ta partie {pin} est toujours en cours.",
			"resume.button": "Reprendre la partie en tant que {name}",
			"resume.notMe": "Ce n’est pas moi",

			"game.getReady": "Préparez-vous…",
			"game.roundReady": "Manche {round} · Préparez-vous",
			"game.roundAnswering": "Manche {round} · À vos téléphones !",
			"game.timesUp": "Temps écoulé ! Voici les réponses",
			"game.answerOf": "Réponse {index} sur {total}",
			"game.voting": "Votez pour votre préférée sur votre téléphone",
			"game.votesIntro": "Et les votes vont à…",
			"game.noVotes": "Aucun vote pour cette manche",
			"game.votesOf": "Votes · {index} sur {total}",
			"game.secondsLeft": "Secondes restantes",
			"game.clock.label": "Temps avant la suite",
			"game.clock.toVotes": "Vote dans",
			"game.clock.toNext": "Question suivante dans",
			"game.clock.toScores": "Scores dans",
			"game.clock.votes": "Votes reçus",
			"game.clock.votesCount": "{votes} votes reçus sur {expected}",
			"game.clock.votesTimed": "{votes} votes reçus sur {expected}, encore {seconds|duration} pour voter",

			"prompt.title": "Ta punchline",
			"prompt.hint": "Lis la question sur le grand écran et bats le chrono.",
			"prompt.hint.known": "Lis la question sur le grand écran. Tu as {seconds|duration}.",
			"prompt.label": "Ta réponse",
			"prompt.placeholder": "Écris un truc drôle…",
			"prompt.send": "Envoyer ma réponse",

			"vote.title": "Choisis ta préférée",
			"vote.hint": "Pas de noms, pas de pression. Tu ne peux pas voter pour la tienne.",
			"vote.answers": "Réponses",
			"vote.loading": "Chargement des réponses…",
			"vote.button": "Voter",
			"vote.yours": "La tienne",
			"vote.timeLeft": "Secondes restantes pour voter",

			"wait.title": "Patience !",
			"wait.text": "On attend les autres. Garde un œil sur le grand écran.",
			"wait.answer.title": "Réponse envoyée !",
			"wait.answer.text": "On attend que les autres finissent d’écrire…",
			"wait.vote.title": "A voté !",
			"wait.vote.text": "On attend que tout le monde ait voté. Résultats sur le grand écran.",
			"wait.late.title": "Temps écoulé !",
			"wait.late.text": "Trop tard pour celle-ci. Prépare-toi à voter…",
			"wait.voteLate.title": "Votes terminés !",
			"wait.voteLate.text": "Pas de vote de ta part pour cette manche. Résultats sur le grand écran.",
			"wait.in.title": "C’est bon, tu es dedans !",
			"wait.in.text": "La partie va bientôt commencer. Garde un œil sur le grand écran.",

			"scores.kicker": "C’est fini !",
			"scores.winner": "La victoire revient à",
			"scores.tie": "Égalité !",
			"scores.counting": "On compte les votes…",
			"scores.again": "Rejouer",
			"scores.caption": "Scores finaux",
			"scores.rank": "Rang",
			"scores.player": "Joueur",
			"scores.points": "Points",
			"scores.pointsLabel": { one: "{count} point", other: "{count} points" },

			"sound.volume": "Volume de la musique",
			"sound.unlock": "Touche pour activer le son",
			"sound.enable": "Activer le son",
			"sound.mute": "Couper le son",
			"sound.unmute": "Remettre le son",
			"sound.sfx": "Effets sonores",
			"sound.sfxOn": "Effets sonores activés",
			"sound.sfxOff": "Effets sonores désactivés",

			"error.pinEmpty": "Entre le code PIN à 4 chiffres",
			"error.pinDigitsOnly": "Le code PIN ne contient que des chiffres",
			"error.pinLength": "Le code PIN fait 4 chiffres",
			"error.gameNotFound": "Aucune partie avec ce code PIN",
			"error.roomFull": "La partie est complète",
			"error.nameEmpty": "Entre un nom pour rejoindre la partie",
			"error.nameTooLong": "Nom trop long",
			"error.nameInvalidChars": "Caractère(s) interdit(s) : {chars}",
			"error.nameUnauthorized": "Ce nom n’est pas autorisé",
			"error.nameTaken": "Ce nom est déjà pris",
			"error.pickName": "Choisis d’abord ton nom",
			"error.playerConnected": "Ce joueur est déjà connecté",
			"error.sessionExpired": "Cette partie ne peut plus être reprise",
			"error.premiumCodeEmpty": "Entre le code premium",
			"error.premiumCodeTooLong": "Code trop long",
			"error.premiumCodeLength": "Le code premium doit faire entre 1 et 15 caractères",
			"error.premiumCodeInvalid": "Code premium invalide",
			"error.premiumTooManyAttempts": "Trop de codes premium erronés. Attends 15 minutes ou joue en Classique.",
			"error.notEnoughPlayers": "Il faut au moins {count} joueurs",
			"error.roundsInvalid": "Nombre de manches invalide",
			"error.answerTimeInvalid": "Temps de réponse invalide",
			"error.revealTimeInvalid": "Temps par réponse invalide",
			"error.voteTime": "Temps pour voter invalide",
			"error.questionsUnavailable": "Impossible de charger les questions. Réessaie.",
			"error.answerEmpty": "Écris d’abord quelque chose",
			"error.answerTooLong": "Ta réponse est trop longue",
			"error.pickAnswer": "Choisis d’abord une réponse",
			"error.gameCrashed": "Oups, cette partie a rencontré un problème et a dû s’arrêter. Désolés ! Lance une nouvelle partie.",
			"error.gameEnded": "Cette partie a été arrêtée par un admin.",
			"notice.gameResumed": "On est de retour ! La partie reprend là où elle s’était arrêtée.",
			"notice.voteTooLate": "Trop tard pour voter !",
			"notice.sessionElsewhere": "Ta partie a été reprise sur un autre écran.",
			"notice.questionsLang": "Les prochaines questions seront en français.",
			"error.notEnoughQuestions": "Pas encore de questions dans cette langue. Change de langue, ou demande à l’admin d’en ajouter.",
			"notice.fewerQuestions": "Pas assez de questions dans cette langue : la partie aura moins de manches que prévu.",

			// ----- panneau d’administration (/admin) -----
			"admin.title": "Punchline · Admin",
			"admin.kicker": "Coulisses",
			"admin.skip": "Aller au contenu",
			"admin.sections": "Rubriques",
			"admin.signedInAs": "Connecté en tant que",
			"admin.logout": "Se déconnecter",
			"admin.loading": "Chargement…",
			"admin.refresh": "Actualiser",
			"admin.cancel": "Annuler",
			"admin.save": "Enregistrer",
			"admin.colon": " : ",
			"admin.time.now": "à l’instant",
			"admin.login.title": "Connexion administrateur",
			"admin.login.hint": "Gère les questions et les parties en cours.",
			"admin.login.user": "Identifiant",
			"admin.login.password": "Mot de passe",
			"admin.login.submit": "Se connecter",
			"admin.login.missing": "Entre ton identifiant et ton mot de passe",
			"admin.setup.title": "Le panneau d’administration est désactivé",
			"admin.setup.text": "Aucun administrateur n’est configuré sur ce serveur. Pour l’activer :",
			"admin.setup.step1": "Crée l’empreinte du mot de passe sur le serveur :",
			"admin.setup.step2": "Renseigne ADMIN_USER et ADMIN_PASSWORD_HASH (variables d’environnement), ou adminUser et adminPasswordHash dans config.properties.",
			"admin.setup.step3": "Redémarre le serveur et reviens sur cette page.",
			"admin.tab.questions": "Questions",
			"admin.tab.games": "Parties en cours",
			"admin.tab.gamesShort": "Parties",
			"admin.tab.activity": "Historique",
			"admin.q.search": "Rechercher",
			"admin.q.searchPlaceholder": "Question ou réponse",
			"admin.q.filter": "Afficher",
			"admin.filter.all": "Toutes",
			"admin.q.add": "Ajouter une question",
			"admin.q.import": "Importer un CSV",
			"admin.q.export": "Exporter en CSV",
			"admin.q.duplicates": "Chercher les doublons",
			"admin.q.addShort": "Ajouter",
			"admin.q.importShort": "Importer",
			"admin.q.exportShort": "Exporter",
			"admin.q.duplicatesShort": "Doublons",
			"admin.q.count": { one: "{count} question", other: "{count} questions" },
			"admin.q.found": { one: "{count} question trouvée", other: "{count} questions trouvées" },
			"admin.q.bot": "Bot",
			"admin.q.noAnswer": "Aucune réponse",
			"admin.q.edit": "Modifier",
			"admin.q.delete": "Supprimer",
			"admin.q.empty": "Aucune question pour l’instant",
			"admin.q.emptyHint": "Ajoutes-en une, ou importe un fichier CSV.",
			"admin.q.noResult": "Aucun résultat",
			"admin.q.noResultHint": "Essaie d’autres mots, ou un autre filtre.",
			"admin.q.addTitle": "Nouvelle question",
			"admin.q.editTitle": "Modifier la question",
			"admin.q.added": "Question ajoutée",
			"admin.q.saved": "Question enregistrée",
			"admin.q.deleted": "Question supprimée",
			"admin.q.deleteTitle": "Supprimer cette question ?",
			"admin.q.deleteText": "Elle ne sortira plus dans les parties. C’est définitif.",
			"admin.q.deleteConfirm": "Supprimer",
			"admin.pager": "Pages",
			"admin.pager.prev": "Précédente",
			"admin.pager.next": "Suivante",
			"admin.pager.info": "Page {page} sur {pages}",
			"admin.field.question": "Question",
			"admin.field.answers": "Réponses du bot",
			"admin.field.answersHint": "Le bot en choisit une. Au moins une, 100 caractères max chacune.",
			"admin.field.reponse_1": "Réponse 1",
			"admin.field.reponse_2": "Réponse 2",
			"admin.field.reponse_3": "Réponse 3",
			"admin.field.explicit": "Type",
			"admin.field.type": "Type de question",
			"admin.field.premium": "Premium (explicite)",
			"admin.field.typeHint": "Les questions premium ne sortent que dans les parties lancées avec le code premium.",
			"admin.import.title": "Importer des questions",
			"admin.import.file": "Fichier CSV",
			"admin.import.check": "Vérifier le fichier",
			"admin.import.run": { one: "Importer {count} question", other: "Importer {count} questions" },
			"admin.import.noFile": "Choisis d’abord un fichier",
			"admin.import.emptyFile": "Ce fichier est vide",
			"admin.import.badType": "Envoie un fichier texte CSV",
			"admin.import.previewTitle": "Vérification avant import",
			"admin.import.doneTitle": { one: "{count} question ajoutée", other: "{count} questions ajoutées" },
			"admin.import.stat.new": { one: "nouvelle", other: "nouvelles" },
			"admin.import.stat.added": { one: "ajoutée", other: "ajoutées" },
			"admin.import.stat.duplicates": { one: "doublon ignoré", other: "doublons ignorés" },
			"admin.import.stat.errors": { one: "ligne en erreur", other: "lignes en erreur" },
			"admin.import.errorsTitle": { one: "{count} ligne en erreur (ignorée)", other: "{count} lignes en erreur (ignorées)" },
			"admin.import.duplicatesTitle": { one: "{count} doublon (ignoré)", other: "{count} doublons (ignorés)" },
			"admin.import.line": "Ligne {line}",
			"admin.import.inDb": "déjà dans la base",
			"admin.import.sameAs": "identique à la ligne {line}",
			"admin.import.more": "…et {count} de plus",
			"admin.import.nothing": "Rien de nouveau à importer.",
			"admin.import.tooManyLines": "Trop de lignes : 10 000 max par fichier",
			"admin.import.tooManyColumns": "plus de 7 colonnes (un « ; » dans un texte ?)",
			"admin.import.badExplicit": "explicit doit valoir true ou false",
			"admin.dup.title": "Questions en double",
			"admin.dup.hint": "Même texte de question, sans tenir compte des majuscules, des espaces et des apostrophes.",
			"admin.dup.none": "Aucun doublon. Tout est propre !",
			"admin.dup.count": { one: "{count} question a des doublons", other: "{count} questions ont des doublons" },
			"admin.games.count": { one: "{count} partie en mémoire", other: "{count} parties en mémoire" },
			"admin.games.updated": "· mis à jour à {time}",
			"admin.games.empty": "Aucune partie en cours.",
			"admin.games.note": "Actualisé toutes les 5 secondes. Les heures sont approximatives (vues par le serveur).",
			"admin.games.label": "Partie {pin}",
			"admin.games.phase.lobby": "Salon d’attente",
			"admin.games.phase.answering": "Réponses en cours",
			"admin.games.phase.voting": "Votes en cours",
			"admin.games.phase.playing": "En jeu",
			"admin.games.phase.scores": "Scores finaux",
			"admin.games.round": "Manche {round} sur {rounds}",
			"admin.games.seen": "Vue {since} · dernière activité {activity}",
			"admin.games.players": { one: "{count} joueur", other: "{count} joueurs" },
			"admin.games.bot": "bot",
			"admin.games.offline": "déconnecté",
			"admin.games.end": "Terminer cette partie",
			"admin.games.endTitle": "Terminer la partie {pin} ?",
			"admin.games.endText": "Le grand écran et les joueurs reviennent à l’accueil. Les scores sont perdus.",
			"admin.games.endConfirm": "Terminer la partie",
			"admin.games.ended": "Partie {pin} terminée",
			"admin.log.title": "Dernières actions d’administration",
			"admin.log.empty": "Rien pour l’instant.",
			"admin.log.detail.username": "identifiant essayé : {name}",
			"admin.log.detail.pin": "PIN {pin}",
			"admin.log.detail.import": "{inserted} ajoutées, {duplicates} doublons, {errors} erreurs",
			"admin.action.login.ok": "Connexion",
			"admin.action.login.failed": "Connexion refusée",
			"admin.action.logout": "Déconnexion",
			"admin.action.question.create": "Question ajoutée",
			"admin.action.question.update": "Question modifiée",
			"admin.action.question.delete": "Question supprimée",
			"admin.action.question.import": "Import CSV",
			"admin.action.game.end": "Partie terminée",
			"admin.error.network": "Impossible de joindre le serveur. Vérifie ta connexion.",
			"admin.error.server": "Le serveur a rencontré un problème. Réessaie.",
			"admin.error.invalid": "Valeur invalide",
			"admin.error.validation": "Vérifie les champs signalés",
			"admin.error.required": "Obligatoire",
			"admin.error.tooLong": "Trop long ({max} caractères max)",
			"admin.error.badChars": "Contient des caractères interdits",
			"admin.error.semicolon": "« ; » n’est pas autorisé (séparateur du CSV)",
			"admin.error.answerRequired": "Donne au moins une réponse au bot",
			"admin.error.duplicate": "Cette question existe déjà",
			"admin.error.notFound": "Introuvable (déjà supprimée ?)",
			"admin.error.gameNotFound": "Cette partie n’existe plus",
			"admin.error.tooLarge": "Fichier trop gros (1 Mo max)",
			"admin.error.csrf": "Requête refusée (contrôle de sécurité). Recharge la page.",
			"admin.error.unauthorized": "Ta session a expiré. Reconnecte-toi.",
			"admin.error.disabled": "Le panneau d’administration est désactivé",
			"admin.error.badCredentials": "Identifiant ou mot de passe incorrect",
			"admin.error.tooManyAttempts": "Trop de tentatives. Réessaie plus tard.",
			"admin.error.tooManyAttempts.wait": "Trop de tentatives. Réessaie dans {seconds|duration}.",
			"admin.error.busy": "Le serveur est occupé. Réessaie dans un instant.",
			"admin.tab.review": "À valider",
			"admin.tab.reviewShort": "À valider",
			"admin.q.lang": "Langue",
			"admin.q.category": "Catégorie",
			"admin.q.status": "Statut",
			"admin.status.approvedPlural": "Validées",
			"admin.status.rejectedPlural": "Rejetées",
			"admin.status.all": "Tous les statuts",
			"admin.status.pending": "À valider",
			"admin.status.rejected": "Rejetée",
			"admin.cat.all": "Toutes les catégories",
			"admin.cat.none": "Sans catégorie",
			"admin.cat.mix": "Catégories variées",
			"admin.cat.quotidien": "Quotidien",
			"admin.cat.travail": "Travail",
			"admin.cat.couple": "Couple",
			"admin.cat.famille": "Famille",
			"admin.cat.nourriture": "Nourriture",
			"admin.cat.voyage": "Voyage",
			"admin.cat.ecole": "École",
			"admin.cat.tech": "Tech",
			"admin.cat.pop": "Pop culture",
			"admin.cat.absurde": "Absurde",
			"admin.cat.animaux": "Animaux",
			"admin.cat.sport": "Sport",
			"admin.cat.fete": "Fête",
			"admin.lang.fr": "Français",
			"admin.lang.en": "Anglais",
			"admin.field.lang": "Langue",
			"admin.field.category": "Catégorie",
			"admin.source.bank": "Banque",
			"admin.source.ai": "IA",
			"admin.source.admin": "Ajoutée à la main",
			"admin.source.import": "Importée",
			"admin.q.played": { one: "jouée {count} fois", other: "jouée {count} fois" },
			"admin.q.lastPlayed": "dernière fois {when}",
			"admin.q.neverPlayed": "jamais jouée",
			"admin.import.lang": "Langue des lignes sans lang",
			"admin.import.badLang": "lang doit valoir fr ou en",
			"admin.error.badCategory": "Catégorie inconnue",
			// import CSV : aide au format, contrôles, rapport
			"admin.status.allShort": "Tous",
			"admin.pager.first": "Première page",
			"admin.pager.last": "Dernière page",
			"admin.pager.prevPage": "Page précédente",
			"admin.pager.nextPage": "Page suivante",
			"admin.pager.perPage": "Par page",
			"admin.pager.range": "Questions {from} à {to} sur {count}",
			"admin.import.intro": "Un fichier CSV enregistré en « CSV UTF-8 », avec « ; » comme séparateur et une question par ligne.",
			"admin.import.help.title": "Format attendu",
			"admin.import.col.questionDesc": "La question ou la phrase à compléter. Obligatoire, 300 caractères max.",
			"admin.import.col.answerDesc": "Une réponse du bot, 100 caractères max. Au moins une des trois est obligatoire.",
			"admin.import.col.answerOptDesc": "Une autre réponse du bot (peut rester vide).",
			"admin.import.col.explicitDesc": "true pour une question premium (explicite), false pour une classique. Vide = false.",
			"admin.import.col.categoryDesc": "Facultatif, une de ces valeurs (vide = sans catégorie) :",
			"admin.import.col.langDesc": "Facultatif : fr ou en. Vide = la langue choisie plus bas.",
			"admin.import.rule.separator": "Pas de « ; » dans les textes : il sépare les colonnes.",
			"admin.import.rule.header": "Une ligne d’en-tête (question;reponse_1;…) est permise : elle est ignorée.",
			"admin.import.rule.quotes": "Les guillemets ajoutés par Excel ou LibreOffice sont retirés.",
			"admin.import.rule.limits": "1 Mo et 10 000 lignes max. Les questions déjà présentes sont ignorées.",
			"admin.import.example": "Exemple",
			"admin.import.template": "Télécharger un modèle",
			"admin.import.copied": "Exemple copié",
			"admin.import.fileHint": "Le fichier est d’abord vérifié : rien n’est importé avant ta confirmation.",
			"admin.import.runValid": { one: "Importer la ligne valide", other: "Importer les {count} lignes valides" },
			"admin.import.notChecked": "Vérifie de nouveau le fichier avant de l’importer",
			"admin.import.blocked": "Fichier refusé : rien n’a été importé",
			"admin.import.blockedTitle": "Fichier refusé : rien ne peut être importé",
			"admin.import.blockedHint": "Corrige le fichier, enregistre-le, puis choisis-le de nouveau.",
			"admin.import.fatal.utf16": "Ce fichier est en UTF-16 (« Texte Unicode »). Enregistre-le plutôt en « CSV UTF-8 ».",
			"admin.import.fatal.spreadsheet": "C’est un classeur (.xlsx, .xls ou .ods), pas un fichier CSV. Enregistre-le en « CSV UTF-8 » avec « ; » comme séparateur.",
			"admin.import.fatal.binary": "Ce n’est pas un fichier texte.",
			"admin.import.fatal.encoding": "Le fichier n’est pas en UTF-8 (premier caractère illisible ligne {line}) : il a sans doute été enregistré en « CSV (Windows) » ou en Latin-1. Enregistre-le de nouveau en « CSV UTF-8 ».",
			"admin.import.fatal.mojibake": "Accents abîmés (« Ã© » au lieu de « é ») dès la ligne {line} : le fichier a été ouvert avec le mauvais encodage puis réenregistré. Repars du fichier d’origine et enregistre-le en « CSV UTF-8 ».",
			"admin.import.fatal.separator.comma": "Le séparateur doit être « ; », or ce fichier utilise des virgules. Exporte-le de nouveau avec « ; » comme séparateur de champ.",
			"admin.import.fatal.separator.tab": "Le séparateur doit être « ; », or ce fichier utilise des tabulations. Exporte-le de nouveau avec « ; » comme séparateur de champ.",
			"admin.import.fatal.separator.none": "Aucun « ; » trouvé : le séparateur doit être « ; » et chaque ligne doit avoir 5 à 7 colonnes.",
			"admin.import.fatal.columns": "Toutes les lignes ont plus de 7 colonnes : vérifie le séparateur et qu’aucun texte ne contient de « ; ».",
			"admin.import.fatal.mostlyInvalid": "{count} lignes sur {total} sont invalides (plus de la moitié) : le fichier n’est sans doute pas au bon format.",
			"admin.import.fatal.empty": "Aucune question dans ce fichier.",
			"admin.import.colNo": "Col. {n}",
			"admin.import.issue.required": "la question est vide",
			"admin.import.issue.tooLong": "{length} caractères, {max} max",
			"admin.import.issue.badChars": "caractère interdit ({char})",
			"admin.import.issue.semicolon": "contient un « ; » (« {value} »)",
			"admin.import.issue.noAnswer": "aucune réponse du bot (colonnes 2 à 4 vides)",
			"admin.import.issue.explicit": "« {value} » n’est ni true ni false",
			"admin.import.issue.category": "catégorie inconnue « {value} » (valeurs possibles : {allowed})",
			"admin.import.issue.lang": "« {value} » n’est ni fr ni en",
			"admin.import.issue.tooManyColumns": "{count} colonnes au lieu de 5 à 7 (un « ; » dans un texte ?)",
			"admin.import.issue.tooFewColumns": { one: "1 colonne au lieu de 5 à 7", other: "{count} colonnes au lieu de 5 à 7" },
			"admin.import.issue.invalid": "valeur invalide",
			"admin.import.tooFewColumns": "moins de 5 colonnes",
			"admin.import.warn.header": "Ligne d’en-tête ignorée :",
			"admin.import.warn.quotes": "Guillemets de tableur retirés",
			"admin.import.warn.trailing": { one: "Colonne vide en trop retirée", other: "{count} colonnes vides en trop retirées" },
			"admin.import.warn.otherLang": "{count} des {total} lignes sans langue semblent écrites en {detectedName}, mais elles seront importées en {langName}. Vérifie la langue choisie plus haut.",
			"admin.import.wholeFile": "Fichier",
			"admin.import.warningsTitle": { one: "{count} avertissement", other: "{count} avertissements" },
			"admin.import.stat.valid": { one: "valide à importer", other: "valides à importer" },
			"admin.import.stat.warnings": { one: "avertissement", other: "avertissements" },
			"admin.import.skipNote": { one: "La ligne en erreur sera ignorée. Corrige-la dans ton fichier pour l’importer plus tard.", other: "Les {count} lignes en erreur seront ignorées. Corrige-les dans ton fichier pour les importer plus tard." },
			"admin.review.title": "Questions en attente de validation",
			"admin.review.count": { one: "{count} question à valider", other: "{count} questions à valider" },
			"admin.review.empty": "Rien à valider",
			"admin.review.emptyHint": "Génère des questions avec l’IA : elles attendent ici que tu les valides.",
			"admin.review.emptyHintOff": "Les questions générées par l’IA attendent ici d’être validées. La génération par IA est désactivée sur ce serveur.",
			"admin.review.approve": "Valider",
			"admin.review.reject": "Rejeter",
			"admin.review.approveAll": "Tout valider",
			"admin.review.rejectAll": "Tout rejeter",
			"admin.review.approved": "Question validée",
			"admin.review.rejected": "Question rejetée",
			"admin.review.approveAllTitle": { one: "Valider {count} question ?", other: "Valider {count} questions ?" },
			"admin.review.approveAllText": "Elles pourront sortir dans les parties tout de suite. Seules les questions de la langue affichée sont concernées.",
			"admin.review.rejectAllTitle": { one: "Rejeter {count} question ?", other: "Rejeter {count} questions ?" },
			"admin.review.rejectAllText": "Elles ne sortiront pas dans les parties. Elles restent dans la base (statut Rejetée) pour ne pas être générées à nouveau.",
			"admin.review.approvedCount": { one: "{count} question validée", other: "{count} questions validées" },
			"admin.review.rejectedCount": { one: "{count} question rejetée", other: "{count} questions rejetées" },
			"admin.ai.generate": "Générer avec l’IA",
			"admin.ai.title": "Générer avec l’IA",
			"admin.ai.offTitle": "La génération par IA est désactivée sur ce serveur",
			"admin.ai.offText": "Pour l’activer, donne une clé d’API Anthropic au serveur, puis redémarre-le :",
			"admin.ai.offHint": "Facultatif : ANTHROPIC_MODEL (claude-sonnet-5-5 par défaut). Voir le README, « Questions ».",
			"admin.ai.hint": "Claude écrit de nouvelles questions dans le style des tiennes. Elles attendent dans « À valider » que tu les valides.",
			"admin.ai.count": "Combien (1 à 50)",
			"admin.ai.theme": "Thème libre (facultatif)",
			"admin.ai.themePlaceholder": "ex. : camping, lundi matin",
			"admin.ai.seeReview": "Les voir dans À valider",
			"admin.ai.run": "Générer",
			"admin.ai.running": "Génération… (jusqu’à 1 min)",
			"admin.ai.statusOn": "IA activée · {model} · {remaining} génération(s) sur {perHour} restante(s) cette heure-ci",
			"admin.ai.statusOnAuto": "IA activée · {model} · {remaining} génération(s) sur {perHour} restante(s) cette heure-ci · complément automatique activé",
			"admin.ai.statusOff": "La génération par IA est désactivée (pas d’ANTHROPIC_API_KEY sur le serveur).",
			"admin.ai.info": "Modèle {model} · {remaining} génération(s) sur {perHour} restante(s) cette heure-ci. Chaque génération est facturée par Anthropic.",
			"admin.ai.noneLeft": "Limite horaire atteinte ({perHour} générations). Réessaie plus tard.",
			"admin.ai.doneTitle": { one: "{count} question générée", other: "{count} questions générées" },
			"admin.ai.stat.added": { one: "à valider", other: "à valider" },
			"admin.ai.stat.invalid": { one: "invalide, écartée", other: "invalides, écartées" },
			"admin.ai.usage": "{model} · {input} tokens en entrée, {output} en sortie",
			"admin.ai.error.disabled": "La génération par IA est désactivée sur ce serveur",
			"admin.ai.error.timeout": "L’IA a mis trop de temps à répondre. Réessaie avec moins de questions.",
			"admin.ai.error.network": "Impossible de joindre l’API Anthropic.",
			"admin.ai.error.auth": "L’API Anthropic a refusé la clé (vérifie ANTHROPIC_API_KEY).",
			"admin.ai.error.upstreamRate": "L’API Anthropic limite cette clé. Réessaie plus tard.",
			"admin.ai.error.request": "L’API Anthropic a refusé la requête (vérifie ANTHROPIC_MODEL).",
			"admin.ai.error.upstream": "L’API Anthropic a rencontré un problème. Réessaie.",
			"admin.ai.error.badResponse": "La réponse de l’IA est illisible. Réessaie.",
			"admin.ai.error.refused": "L’IA a refusé cette demande. Essaie un autre thème.",
			"admin.ai.error.busy": "Une génération est déjà en cours. Attends qu’elle se termine.",
			"admin.ai.error.rateLimit": "Limite horaire de générations atteinte. Réessaie plus tard.",
			"admin.ai.error.count": "Entre 1 et 50",
			"admin.ai.error.withReason": "{message} ({reason})",
			"admin.action.question.approve": "Question validée",
			"admin.action.question.reject": "Question rejetée",
			"admin.action.question.pending": "Question remise à valider",
			"admin.action.question.approveAll": "Questions en attente validées",
			"admin.action.question.rejectAll": "Questions en attente rejetées",
			"admin.action.ai.generate": "Génération par IA",
			"admin.action.ai.topup": "Complément automatique par IA",
			"admin.action.ai.error": "Échec de la génération par IA",
			"admin.log.detail.ai": "{lang} : {inserted} ajoutées, {duplicates} doublons, {invalid} invalides",
			"admin.log.detail.count": { one: "{count} question", other: "{count} questions" },
			"admin.settings.tab": "Réglages",
			"admin.settings.premiumTitle": "Code premium",
			"admin.settings.premiumHint": "L’hôte choisit « Premium » dans le salon et tape ce code pour ajouter les questions explicites à la partie. Majuscules, espaces et tirets ne comptent pas.",
			"admin.settings.codeLabel": "Code actuel",
			"admin.settings.on": "Activé",
			"admin.settings.off": "Désactivé",
			"admin.settings.offTitle": "Le premium est désactivé",
			"admin.settings.offText": "Aucun code ne marche dans le salon. Générez un code ou choisissez-en un pour l’activer.",
			"admin.settings.copy": "Copier",
			"admin.settings.copied": "Code copié",
			"admin.settings.copyFailed": "Copie impossible ici : le code est sélectionné, copiez-le avec Ctrl+C",
			"admin.settings.updated": "Modifié le {when} par {who}",
			"admin.settings.updatedNoUser": "Modifié le {when}",
			"admin.settings.fromConfig": "Lu dans config.properties (pas encore enregistré dans la base)",
			"admin.settings.generate": "Générer un nouveau code",
			"admin.settings.generateFirst": "Générer un code",
			"admin.settings.generateTitle": "Générer un nouveau code ?",
			"admin.settings.generateText": "Le code actuel cesse aussitôt de marcher : donnez le nouveau aux hôtes. Les parties déjà lancées gardent leurs questions.",
			"admin.settings.generateConfirm": "Générer",
			"admin.settings.generated": "Nouveau code généré",
			"admin.settings.disable": "Désactiver le premium",
			"admin.settings.disableTitle": "Désactiver le premium ?",
			"admin.settings.disableText": "Plus aucun code ne marchera dans le salon tant que tu n’en génères ou n’en choisis pas un nouveau. Les parties déjà lancées ne changent pas.",
			"admin.settings.disableConfirm": "Désactiver",
			"admin.settings.disabled": "Premium désactivé",
			"admin.settings.custom": "Choisir ton code",
			"admin.settings.customHint": "4 à 15 caractères : lettres sans accent, chiffres et tirets. Facile à taper sur un téléphone ou une télé.",
			"admin.settings.customPlaceholder": "ex. soiree-ete",
			"admin.settings.customSave": "Utiliser ce code",
			"admin.settings.saved": "Code enregistré",
			"admin.settings.error.length": "4 à 15 caractères, dont au moins 4 lettres ou chiffres.",
			"admin.settings.error.chars": "Uniquement des lettres sans accent, des chiffres et des tirets.",
			"admin.settings.error.invalid": "Ce code n’est pas valide.",
			"admin.settings.error.unavailable": "Les réglages ne sont pas disponibles sur ce serveur.",
			"admin.settings.action.generate": "Code premium généré",
			"admin.settings.action.change": "Code premium modifié",
			"admin.settings.action.disable": "Premium désactivé",
		},
	};

	var listeners = [];
	var hasOwn = Object.prototype.hasOwnProperty;

	function isSupported(lang) {
		return typeof lang === "string" && hasOwn.call(DICT, lang);
	}

	// The game is made for French players: French unless English was chosen with the button
	// (DEFAULT_LANG stays "en" only as the fallback dictionary for missing keys)
	function detectLang() {
		try {
			var saved = localStorage.getItem(STORAGE_KEY);
			if (isSupported(saved)) return saved;
		} catch (e) {}
		return "fr";
	}

	var lang = detectLang();

	function pluralCategory(count) {
		try {
			return new Intl.PluralRules(lang).select(Number(count));
		} catch (e) {
			return Number(count) === 1 ? "one" : "other";
		}
	}

	function formatDuration(totalSeconds) {
		var total = Math.max(0, Math.round(Number(totalSeconds) || 0));
		var minutes = Math.floor(total / 60);
		var seconds = total % 60;
		if (minutes === 0) return t("duration.seconds", { count: seconds });
		if (seconds === 0) return t("duration.minutes", { count: minutes });
		return t("duration.mixed", { minutes: minutes, seconds: String(seconds).padStart(2, "0") });
	}

	var FORMATTERS = {
		duration: formatDuration,
	};

	function has(key) {
		return typeof key === "string" && hasOwn.call(DICT[DEFAULT_LANG], key);
	}

	// Translated string; falls back to English, then to the key itself
	function t(key, params) {
		params = params || {};
		var entry = hasOwn.call(DICT[lang], key) ? DICT[lang][key] : DICT[DEFAULT_LANG][key];
		if (entry === undefined) return String(key);
		if (typeof entry === "object") {
			entry = entry[pluralCategory(params.count)] || entry.other || "";
		}
		return String(entry).replace(/\{(\w+)(?:\|(\w+))?\}/g, function (match, name, format) {
			if (!hasOwn.call(params, name)) return match;
			var value = params[name];
			return format && FORMATTERS[format] ? FORMATTERS[format](value) : String(value);
		});
	}

	// Message from the server: a known key is translated, anything else is shown as is
	function i18nMessage(payload, params) {
		if (has(payload)) return t(payload, params);
		return payload == null ? "" : String(payload);
	}

	function readParams(element) {
		var raw = element.getAttribute("data-i18n-params");
		if (!raw) return undefined;
		try {
			return JSON.parse(raw);
		} catch (e) {
			return undefined;
		}
	}

	var ATTRIBUTES = [
		["data-i18n-placeholder", "placeholder"],
		["data-i18n-aria-label", "aria-label"],
		["data-i18n-title", "title"],
		["data-i18n-empty", "data-empty"],
	];

	function translateElement(element) {
		var params = readParams(element);
		var key = element.getAttribute("data-i18n");
		if (key) element.textContent = t(key, params);
		key = element.getAttribute("data-i18n-html");
		// trusted static strings of this file only (never player content)
		if (key) element.innerHTML = t(key, params);
		ATTRIBUTES.forEach(function (pair) {
			var attrKey = element.getAttribute(pair[0]);
			if (attrKey) element.setAttribute(pair[1], t(attrKey, params));
		});
	}

	var SELECTOR =
		"[data-i18n],[data-i18n-html],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-title],[data-i18n-empty]";

	function applyTranslations(root) {
		root = root || document;
		if (root === document) {
			document.documentElement.lang = lang;
		}
		if (root.nodeType === 1 && root.matches(SELECTOR)) translateElement(root);
		Array.prototype.forEach.call(root.querySelectorAll(SELECTOR), translateElement);
		if (root === document) {
			document.title = t("app.title");
			updateToggles();
		}
	}

	function setParams(element, params) {
		if (params && Object.keys(params).length > 0) {
			element.setAttribute("data-i18n-params", JSON.stringify(params));
		} else {
			element.removeAttribute("data-i18n-params");
		}
	}

	// Marks a JS-created element so it is translated now and on every language change
	function i18nText(element, key, params) {
		if (!element) return;
		element.setAttribute("data-i18n", key);
		setParams(element, params);
		element.textContent = t(key, params);
	}

	// Same for an attribute (placeholder, aria-label, title, data-empty)
	function i18nAttr(element, attribute, key, params) {
		if (!element) return;
		var marker = attribute === "data-empty" ? "data-i18n-empty" : "data-i18n-" + attribute;
		element.setAttribute(marker, key);
		if (params !== undefined) setParams(element, params);
		element.setAttribute(attribute, t(key, params));
	}

	// Plain text set by JS that must not be translated anymore (e.g. a raw server string)
	function i18nClear(element) {
		if (!element) return;
		element.removeAttribute("data-i18n");
		element.removeAttribute("data-i18n-params");
	}

	function updateToggles() {
		var toggles = document.querySelectorAll("[data-lang-toggle]");
		Array.prototype.forEach.call(toggles, function (button) {
			var label = t("lang.switch");
			button.setAttribute("aria-label", label);
			button.setAttribute("title", label);
			var code = button.querySelector("[data-lang-code]") || button;
			code.textContent = t("lang.target");
			code.setAttribute("lang", lang === "fr" ? "en" : "fr");
		});
	}

	function getLang() {
		return lang;
	}

	function setLang(next) {
		if (!isSupported(next)) return;
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch (e) {}
		if (next === lang) return;
		lang = next;
		applyTranslations(document);
		listeners.slice().forEach(function (fn) {
			try {
				fn(lang);
			} catch (e) {
				console.error(e);
			}
		});
	}

	function onLangChange(fn) {
		if (typeof fn === "function") listeners.push(fn);
	}

	function mountToggles() {
		var toggles = document.querySelectorAll("[data-lang-toggle]");
		Array.prototype.forEach.call(toggles, function (button) {
			if (button.dataset.langBound) return;
			button.dataset.langBound = "1";
			button.addEventListener("click", function () {
				setLang(lang === "fr" ? "en" : "fr");
			});
		});
		updateToggles();
	}

	// Public API (globals used by the page scripts)
	window.t = t;
	window.getLang = getLang;
	window.setLang = setLang;
	window.onLangChange = onLangChange;
	window.applyTranslations = applyTranslations;
	window.i18nText = i18nText;
	window.i18nAttr = i18nAttr;
	window.i18nClear = i18nClear;
	window.i18nMessage = i18nMessage;
	window.PunchlineI18n = {
		t: t,
		has: has,
		getLang: getLang,
		setLang: setLang,
		onLangChange: onLangChange,
		applyTranslations: applyTranslations,
		formatDuration: formatDuration,
		dictionaries: DICT,
	};

	document.documentElement.lang = lang;
	function init() {
		applyTranslations(document);
		mountToggles();
	}
	// The script sits at the end of <body>: the static markup is already parsed, so it is
	// translated right away (no flash of English); a second pass once the page is complete.
	init();
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	}
})();
