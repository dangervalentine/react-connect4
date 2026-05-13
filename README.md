# Connect 4

[![Connect Four](./connect4.png?raw=true "'It's like tic-tac-toe, but, like, more' - Sean")](https://dangervalentine.github.io/react-connect4/)

A remake of the classic Connect 4 game.

**Play it:** <https://dangervalentine.github.io/react-connect4/>

## Stack

![React](./react.png?raw=true 'React')

- [React 19](https://react.dev) (function components + hooks)
- [Vite 6](https://vitejs.dev) (dev server + build)
- [Zustand 5](https://github.com/pmndrs/zustand) for state
- [TypeScript 5](https://www.typescriptlang.org)
- CSS keyframe animations (no animation library)

## How to play

Be the first player to line up four of your colored checkers — horizontally,
vertically, or diagonally. If the board fills with no winner, the game ends
in a draw.

## Development

```sh
npm install
npm run dev        # dev server at http://localhost:3000/react-connect4/
npm run build      # type-check + production bundle in ./dist
npm run preview    # serve the production bundle locally
npm run lint       # eslint over src/
```

Vite's `base` is set to `/react-connect4/` in [`vite.config.ts`](./vite.config.ts)
so assets resolve correctly on GitHub Pages. The same base path applies to the
dev server URL — use `/react-connect4/`, not `/`.

## Project layout

```
src/
  App.tsx                  layout, timer effect
  main.tsx                 React 19 createRoot entry
  store.ts                 Zustand game store (state + actions)
  constants.ts             board dimensions and shared types
  helpers/index.ts         checkGameBoard + isBoardFull
  components/
    Cell.tsx
    Column.tsx
    Container.tsx
    MessageOverlay.tsx
    PlayClock.tsx
```

## Deployment

CI is wired up via GitHub Actions:

- [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — lint + build on
  every pull request and feature branch push.
- [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) — builds and
  publishes to GitHub Pages on every push to `master`.

The deploy workflow uses the modern `actions/deploy-pages` flow (no `gh-pages`
branch). One-time setup on the repo:

1. **Settings → Pages → Build and deployment → Source:** select **GitHub Actions**.
2. Push to `master` (or run the workflow manually from the Actions tab).

If you fork the repo, also update the `base` value in `vite.config.ts` to match
your repo name.

## License

[MIT](./LICENSE.md)
