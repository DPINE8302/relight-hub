# RE;light

A Thai education website about e-cigarettes, with an untimed three-situation game and a shared typed-response wall. Anyone can learn and participate from home, classrooms, or the exhibition.

Live website: https://relight-web-two.vercel.app

The main page embeds the shared wall at `/#community`. `/play` is the standalone game, `/after` is the after-film entry, and `/wall` is the shared display. The physical Post-it question is separate.

## Development

```sh
npm ci
npm run dev
npm run lint
npx tsc --noEmit
npm test
npm run build
npm start
```

The application uses Next.js for development, tests, and Vercel deployment. Earlier Cloudflare scaffold files are retained as reference, but the active build is Next.js.

Configure `DATABASE_URL` and `WALL_ADMIN_TOKEN` in ignored `.env.local` and Vercel. See [EXHIBITION.md](EXHIBITION.md) for offline preparation, QR files, moderation, database behavior, and exhibition operation. No secrets belong in source control.
