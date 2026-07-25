# nerv-tracker

A near-earth object tracker with a NERV command-center look. It pulls live data
from NASA and CelesTrak and draws Earth as a hologram globe with the active
satellite catalog around it, plus this week's close-approach asteroids on their
orbits. You can click any object to fly to it, and zoom from a single satellite
out to the whole solar system.

Built with Three.js and TypeScript, no backend. Runs entirely in the browser.

## What it shows

Satellites come from the CelesTrak active catalog (Starlink, OneWeb, GPS and the
rest) and are propagated with SGP4 in a web worker so the main thread stays smooth.

Asteroids come from NASA's close-approach feed for the next 7 days. Each one gets
its orbit drawn around the Sun and a live miss-distance readout. Potentially
hazardous objects trip an alert banner.

The Sun, Moon and eight planets are computed from Keplerian elements, each with a
shaded surface (bands, polar caps, Saturn's rings).

## Running it

```
npm install
npm run dev
```

The built-in NASA `DEMO_KEY` is limited to about 30 requests an hour. Get your own
free key at https://api.nasa.gov and open the app once with `?key=YOUR_KEY`. It is
saved in localStorage after that.

## Building and deploying

```
npm run build
npm run deploy
```

`build` writes to `dist/`. `deploy` builds and pushes `dist/` to the `gh-pages`
branch.

## Controls

Drag to orbit, scroll to zoom, click an object to track it, Esc to return to Earth.
The buttons in the HUD handle quick focus and time warp.
