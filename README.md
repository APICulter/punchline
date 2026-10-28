# Punchline

## Purpose

This game is called "Punchline". It is a copy of the game "Use Your Words".

## How to play

Open the site on a shared screen and create a room. Each participant opens the game URL on a phone, enters the generated code to join the room and picks a name tag. Once the settings are made and the participants are ready, the game starts and goes through a number of rounds that go like this:

- A question, image or video appears on the screen with a theme of some sort.
- Everyone has 60 seconds to give an answer on their phone.
- Once everyone has answered, the answers are displayed anonymously on the phones.
- Everyone votes for an answer (except their own).
- Each player gets one point per vote received.
- Then comes the next round, until the end of the game.
- The one with the highest number of points wins.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 22.22.2 or later (or 24.15+), with npm. `isomorphic-dompurify` 4.x requires it.
- [MongoDB](https://www.mongodb.com/try/download/community), running locally on `mongodb://127.0.0.1:27017` by default.
- Optional: Python 3 and `pymongo` (`pip install pymongo`) to seed the question database.

### Steps

1. Clone the repository and install the dependencies:

   ```bash
   git clone https://github.com/APICulter/punchline.git
   cd punchline
   npm install
   ```

2. Create your configuration file from the template, then edit it:

   ```bash
   cp config.properties.example config.properties
   ```

   The main keys are:

   | Key | Purpose |
   | --- | --- |
   | `databaseUrl` | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/punchline` |
   | `applicationPort` | HTTP port the server listens on (default `3000`) |
   | `punchlineURL` | Public URL of the game shown to players |
   | `maxNumberOfPlayers` | Maximum number of players per room |
   | `premiumCode` | Code that unlocks premium (explicit) questions, 15 characters max |
   | `questionCountDown`, `beforeQuestionCountDown`, `voteCountDown` | Round timers, in seconds |

   `config.properties` is ignored by git: do not commit real codes or passwords.

3. Load questions into MongoDB (see [Seeding the database](#seeding-the-database)).

4. Build the CSS (Tailwind through PostCSS):

   ```bash
   npm run build:css
   ```

   While working on the front end, use `npm run dev` instead: it rebuilds `public/css/style.css` on every change.

5. Start the server:

   ```bash
   npm start
   ```

6. Open <http://localhost:3000> (or the port set in `applicationPort`). Players join from their phones using the address of the machine on the local network, e.g. `http://192.168.1.10:3000`.

In VS Code, the "Launch Punchline" configuration in `.vscode/launch.json` starts `app.js` under the debugger.

## Seeding the database

The game reads its questions from the `questions` collection. `db/db.py` imports them from a semicolon-separated CSV file with no header row:

```text
question;reponse_1;reponse_2;reponse_3;explicit
```

- `reponse_1` to `reponse_3` are the answers used by the bot player.
- `explicit` is `true` or `false`. Games without the premium code only use questions where `explicit` is `false`. If the column is missing, `false` is assumed.

Run it from the project root:

```bash
pip install pymongo
python db/db.py path/to/questions.csv   # defaults to db/example.csv
```

The script uses the `MONGO_URL` environment variable if set, otherwise `databaseUrl` from `config.properties`. It adds to the existing documents, so running it twice inserts duplicates.
