// Added to the service worker: the recordings in audio/ (see scripts/fetch_audio.mjs) are kept once played, so
// they play offline and aren't downloaded twice. Audio players ask for byte ranges, and iPhones won't play a
// recording without them, so the whole file is fetched and cached, and each range is cut from it.

const AUDIO_CACHE = "nekko-audio";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !/\/audio\/[ws]\/[^/]+\.mp3$/.test(url.pathname)) return;
  event.respondWith(audioResponse(event.request));
});

async function audioResponse(request) {
  const cache = await caches.open(AUDIO_CACHE);
  let full = await cache.match(request.url);
  if (!full) {
    full = await fetch(request.url);
    if (!full.ok) return full;
    await cache.put(request.url, full.clone());
  }
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
  if (!range) return full;
  const body = await full.arrayBuffer();
  const size = body.byteLength;
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start < 0) start = 0;
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
