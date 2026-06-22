# STRANDŌEN

Luxury private island property site for Djursholm, Stockholm.

## Preview

The hero uses a local 1080p video (`videos/hero.mp4`). Serve the site over HTTP so the video loads reliably:

```bash
python3 -m http.server 8080
```

Then visit [http://localhost:8080](http://localhost:8080).

Opening `index.html` directly (`file://`) may work, but a local server is recommended.

Videos are included in `videos/` for GitHub Pages deployment.
