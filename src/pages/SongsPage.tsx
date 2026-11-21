import { useMemo, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { update, useStore } from "../srs";
import { knowledge } from "../stories";
import { allSongs, cleanLyrics, findTitle, newSongId, saveSong, songCoverage, type Song } from "../songs";

/** Your songs, the ones you know best first, and the way to add one. */
export function SongsPage() {
  const data = useData();
  const store = useStore();
  const k = useMemo(() => knowledge(store, data), [store, data]);
  const songs = allSongs(store)
    .map((s) => ({ s, c: songCoverage(k, s) }))
    .sort((a, b) => (b.c ?? -1) - (a.c ?? -1) || b.s.added - a.s.added);

  return (
    <article class="page songs">
      <h1>Songs</h1>
      <a class="primary wide" href={href.songAdd()}>
        ＋ Add a song
      </a>
      {songs.length === 0 ? (
        <p class="hint">Add any song: search for it, or paste its lyrics. Nekko splits it into words, marks the ones you don't know yet, and an AI explains the lines and the story behind the song.</p>
      ) : (
        <div class="song-list">
          {songs.map(({ s, c }) => (
            <a key={s.id} class="song-row" href={href.song(s.id)}>
              <span class="song-row-title" lang="ja">
                {s.title}
              </span>
              <span class="song-row-meta">
                {s.artist && <span lang="ja">{s.artist} · </span>}
                {c === undefined ? "not opened yet" : `you know ${Math.floor(c * 100)}%`}
              </span>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

type Found = { id: number; trackName: string; artistName: string; albumName?: string; plainLyrics?: string | null; syncedLyrics?: string | null; instrumental?: boolean };

/** Plain lyrics from LRCLIB's timed ones, when it only has those. */
const untime = (synced: string) => synced.replace(/^\[[\d:.]+\]\s?/gm, "");

/** Search LRCLIB, or paste lyrics from anywhere. */
export function SongAddPage() {
  const [tab, setTab] = useState<"search" | "paste">("search");
  return (
    <article class="page songs">
      <a class="back-link" href={href.songs()}>
        ‹ Songs
      </a>
      <h1>Add a song</h1>
      <div class="seg-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "search"} class={tab === "search" ? "on" : ""} onClick={() => setTab("search")}>
          Search
        </button>
        <button role="tab" aria-selected={tab === "paste"} class={tab === "paste" ? "on" : ""} onClick={() => setTab("paste")}>
          Paste lyrics
        </button>
      </div>
      {tab === "search" ? <SearchSongs onPaste={() => setTab("paste")} /> : <PasteSong />}
    </article>
  );
}

function add(song: Omit<Song, "id" | "added">) {
  const s: Song = { ...song, id: newSongId(), added: Date.now() };
  update((st) => saveSong(st, s));
  location.hash = href.song(s.id);
}

function SearchSongs({ onPaste }: { onPaste: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const search = async (e: Event) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) throw new Error(String(res.status));
      const list = ((await res.json()) as Found[]).filter((f) => !f.instrumental && (f.plainLyrics || f.syncedLyrics));
      setFound(list.slice(0, 30));
    } catch {
      setError("Couldn't reach the lyrics search. Check your connection, or paste the lyrics instead.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form class="song-search" onSubmit={search}>
        <input class="search-box" type="search" placeholder="Song title or artist" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <button class="primary" disabled={busy}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p class="form-error">{error}</p>}
      {found && found.length === 0 && (
        <p class="hint">
          Nothing found. Try the Japanese title, or{" "}
          <button class="link-button" onClick={onPaste}>
            paste the lyrics
          </button>
          .
        </p>
      )}
      {found && found.length > 0 && (
        <div class="song-list">
          {found.map((f) => (
            <button
              key={f.id}
              class="song-row"
              onClick={() => add({ title: f.trackName, artist: f.artistName, lyrics: f.plainLyrics || untime(f.syncedLyrics ?? ""), source: "lrclib" })}
            >
              <span class="song-row-title" lang="ja">
                {f.trackName}
              </span>
              <span class="song-row-meta" lang="ja">
                {f.artistName}
                {f.albumName ? ` · ${f.albumName}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      <p class="hint">Lyrics come from LRCLIB, a free lyrics library. If your song isn't there, paste its lyrics from any site.</p>
    </>
  );
}

function PasteSong() {
  const [lyrics, setLyrics] = useState("");
  const [title, setTitle] = useState("");
  const [typed, setTyped] = useState(false);
  const [artist, setArtist] = useState("");
  const { sections, removed } = useMemo(() => cleanLyrics(lyrics), [lyrics]);
  const n = sections.flat().length;
  return (
    <form
      class="song-paste"
      onSubmit={(e) => {
        e.preventDefault();
        if (n) add({ title: title.trim() || "Untitled song", artist: artist.trim() || undefined, lyrics, source: "paste" });
      }}
    >
      <textarea
        lang="ja"
        rows={10}
        placeholder="Paste the lyrics, straight from Genius or any lyrics site"
        value={lyrics}
        onInput={(e) => {
          const v = e.currentTarget.value;
          setLyrics(v);
          if (!typed) setTitle(findTitle(v));
        }}
      />
      <input
        class="text-input"
        placeholder="Song title (found from the paste)"
        value={title}
        onInput={(e) => {
          setTitle(e.currentTarget.value);
          setTyped(e.currentTarget.value.trim() !== "");
        }}
      />
      <input class="text-input" placeholder="Artist (optional)" value={artist} onInput={(e) => setArtist(e.currentTarget.value)} />
      {lyrics.trim() && (
        <p class="hint">
          {n} lyric {n === 1 ? "line" : "lines"}
          {removed.length > 0 && `. Left out ${removed.length} that aren't lyrics (labels like [Chorus], site text)`}.
        </p>
      )}
      <button class="primary wide" disabled={!n}>
        Add the song
      </button>
      <p class="hint">The lyrics stay in your own progress: on your devices and your account, nowhere else.</p>
    </form>
  );
}
