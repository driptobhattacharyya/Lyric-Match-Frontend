# Song catalogue

One JSON file per pack, named `<pack-id>.json`. Each file is a JSON array with one object per line:

```json
{"title": "Song Title", "artist": "Artist", "year": 2014, "language": "en", "genre": "pop"}
```

Hindi film songs also carry `"film": "Film Name"`.

Rules for every entry:

- A real, widely known song with sung lyrics (no instrumentals). If in doubt, leave it out. Nothing invented.
- `title` is the official title in Latin script. Hindi titles are romanised in their common spelling
  (for example "Tum Hi Ho"). No "(feat. …)", "(From …)", remaster or version suffixes.
- `artist` is the primary performing artist. For Hindi film songs it is the main playback singer or
  singers, at most two, joined with " & ".
- `year` is the release year (an approximate year is fine for traditional ghazals and qawwalis).
- `language` is `en` or `hi`. `genre` is the pack's genre slug.
- At most 5 songs per artist in English packs, 10 per singer in Hindi film packs, 8 in `hi-indie`.
- No duplicate `(title, artist)` pairs, and songs spread across the pack's whole period.
- Prefer songs whose lyrics are famous enough that a fan would recognise two to four lines.
- No lyrics in these files.
