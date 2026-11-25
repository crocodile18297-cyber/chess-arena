# CHESS ARENA

Real-time online chess for two players using private room codes.

## Run locally

- Node.js 20+
- `npm install`
- `npm start`
- Open `http://localhost:3000`

## Deploy

Create a Render Web Service connected to this repository. Runtime: Node, Build command: `npm install`, Start command: `npm start`. The service listens on Render's `PORT` and exposes `/health`.

Chess rules and move validation run on the server using chess.js. The browser loads chess.js as an ES module from jsDelivr.
