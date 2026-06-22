# STRANDŌEN

Luxury private island property site for Djursholm, Stockholm.

## Preview

The hero uses a local 1080p video (`videos/hero.mp4`). Serve the site over HTTP so the video loads reliably:

```bash
python3 -m http.server 8080
```

Then visit [http://localhost:8080](http://localhost:8080).

Opening `index.html` directly (`file://`) may work, but a local server is recommended for the large hero video.

## Video files

Video files are not stored in Git (they exceed GitHub size limits). Add them locally to `videos/`:

- `hero.mp4`
- `chapter-01.mov`
- `chapter-02.mov`
- `chapter-03.mov`
