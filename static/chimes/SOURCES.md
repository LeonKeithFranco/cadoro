# Chime sources

The four chimes are short bell dings from one pack, released to the public domain under CC0 1.0.

- **Original:** [Bell dings/chimes](https://opengameart.org/content/bell-dingschimes) on OpenGameArt, a pack of four WAV files, described as "somewhat thin and short chime sound".
- **Author:** PWL, who wrote "Releasing as public domain" on the page.
- **Licence:** CC0 1.0 Universal, as the source page lists it: <http://creativecommons.org/publicdomain/zero/1.0/>.
- **Checked:** 2026-11-19, on the source page itself.
- **Changed:** each file was trimmed of leading and trailing silence (below -50 dB), mixed down to mono, set to the same loudness, and converted to MP3 (64 kbit/s, mono, 44.1 kHz) with ffmpeg 7.1. Loudness is -24 LUFS integrated for every file (within 0.1 LU), measured with ffmpeg's `ebur128`, with a limiter keeping the true peaks at or below -1.9 dBFS.
- **Format:** MP3 plays in every current browser, including older Safari, which can't play Opus in `.webm` or `.ogg`.

| File | Original file | Original download |
| --- | --- | --- |
| `bell-ding-1.mp3` | `bell_ding1.wav` | <https://opengameart.org/sites/default/files/bell_ding1.wav> |
| `bell-ding-2.mp3` | `bell_ding2.wav` | <https://opengameart.org/sites/default/files/bell_ding2.wav> |
| `bell-ding-3.mp3` | `bell_ding3.wav` | <https://opengameart.org/sites/default/files/bell_ding3.wav> |
| `bell-ding-4.mp3` | `bell_ding4.wav` | <https://opengameart.org/sites/default/files/bell_ding4.wav> |
