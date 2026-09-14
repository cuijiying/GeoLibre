# GeoLibre server API

Reference implementation of [`docs/server-api.md`](../../docs/server-api.md).
It is a separate multi-user service from the local desktop processing sidecar.

```bash
pip install -e ".[test]"
geolibre-server-api
```

Configuration:

- `GEOLIBRE_DATABASE_URL`: SQLAlchemy URL; defaults to
  `sqlite:///./geolibre-server-api.db`. Use
  `postgresql+psycopg://user:password@host/database` with the `postgres` extra.
- `GEOLIBRE_STORAGE_PATH`: local object directory, default `./data`.
- `GEOLIBRE_STORAGE=s3`, `GEOLIBRE_S3_BUCKET`, and optional
  `GEOLIBRE_S3_ENDPOINT` / `GEOLIBRE_S3_REGION`: S3-compatible storage (install
  the `s3` extra; standard AWS credential environment variables apply).
- `GEOLIBRE_PUBLIC_URL`: externally reachable API origin.
- `GEOLIBRE_VIEWER_URL`: GeoLibre viewer origin.
- `GEOLIBRE_CORS_ORIGINS`: comma-separated web origins, default `*`.
- `GEOLIBRE_MAX_PROJECT_BYTES`, `GEOLIBRE_MAX_THUMBNAIL_BYTES`: upload limits.
- `GEOLIBRE_HOST`, `GEOLIBRE_PORT`: bind address and port for the
  `geolibre-server-api` entry point, default `0.0.0.0` and `8000`. Bind to
  `127.0.0.1` when a reverse proxy fronts the service.
- `GEOLIBRE_TOKEN_TTL_DAYS`: session token lifetime, default `30`; `0` means
  tokens never expire. Expired tokens are rejected and reaped on use; tokens
  minted before this setting existed never expire.
- `GEOLIBRE_FREE_PROJECT_LIMIT`, `GEOLIBRE_PRO_PROJECT_LIMIT`: per-plan project
  quotas, defaults `20` and `500`; `0` means unlimited. Enforced on project
  creation and fork; the account's `plan` column selects the tier, and
  `GET /api/account` reports `plan`, `projectCount`, and `projectLimit`.
- `GEOLIBRE_AUTH_RATE_LIMIT`, `GEOLIBRE_AUTH_RATE_WINDOW_SECONDS`: in-memory
  sliding-window limit for `POST /api/accounts` and `POST /api/auth/token`,
  default `10` attempts per `60` seconds per client IP and route, answered
  with `429` and `Retry-After`. Per-process only — front multi-replica
  deployments with a shared limiter at the proxy.

## Volume ownership

The container runs as the unprivileged `geolibre` user, and the image creates
`/data/objects` so a fresh named volume inherits that ownership. Docker applies
image ownership only to a volume it creates, so one that already holds data from
an image that ran as root stays root-owned and every upload fails with
`PermissionError`. Repair it once with

```bash
docker run --rm -v geolibre_geolibre-projects:/data/objects busybox \
  chown -R 1000:1000 /data/objects
```

## Hardening

`429` rate limiting and token expiry are implemented (see the configuration
list above), but the limiter is per-process; put a shared limiter and TLS at
the reverse proxy before exposing this publicly, and see the "What the
reference server leaves to the operator" section of `docs/server-api.md`.
