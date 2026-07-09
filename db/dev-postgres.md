# Local dev Postgres

The dev environment uses the system PostgreSQL 16 cluster:

```sh
pg_ctlcluster 16 main start
su postgres -c "psql -c \"CREATE ROLE amperia LOGIN PASSWORD 'amperia_dev';\""
su postgres -c "createdb -O amperia amperia"
```

Then copy `.env.example` → `.env` at the repo root and run migrations:

```sh
npm run migrate:dev -w db
```

The Colyseus server (`npm run dev -w server`) reads `DATABASE_URL` from `.env`.
