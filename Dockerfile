# seal-demo — the public-facing demo. Pure static site, no runtime deps.
# The verdicts are pre-captured from the verified seal-host (see docs/BUILD.md),
# so this container serves HTML/JS only: no Rust, no Lean, no model, no backend.
FROM nginx:1.27-alpine
COPY public/ /usr/share/nginx/html/
EXPOSE 80
# default nginx serves /usr/share/nginx/html/index.html
