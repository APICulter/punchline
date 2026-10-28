# Custom music (optional)

By default the host screens (lobby, game, scores) play music generated live in
the browser (`public/js/audio.js`): nothing to download, no copyright issue.

To use your own tracks instead, drop audio files into the folder of a phase:

| Folder       | When it plays                                         |
| ------------ | ----------------------------------------------------- |
| `lobby/`     | Lobby, while players join                             |
| `countdown/` | The few seconds before each question                  |
| `answering/` | While players write their answers                     |
| `reveal/`    | Answers and votes shown on the big screen             |
| `scores/`    | Final scores                                          |

- Formats: `.mp3`, `.ogg`, `.m4a`, `.wav` (other files are ignored).
- Several files in one folder make a shuffled playlist that loops, with a
  crossfade between tracks. A single file loops on its own.
- A phase whose folder has no audio file keeps the generated music, so you can
  replace only some phases.
- Files are picked up when a host screen loads (no restart needed); the list is
  served by `GET /api/music`.
- Keep the files reasonably small (a few MB) and use music you have the rights
  to play. Short tracks suit `countdown/` (it only lasts a few seconds).

The volume, mute and sound effects buttons in the top bar apply to custom
tracks too. Players' phones never play sound.
