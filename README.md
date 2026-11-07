# VEX IQ CCA

A static leaderboard website for GitHub Pages.

| URL | What it is |
| --- | --- |
| `https://<user>.github.io/<repo>/` | Public intro page (does not link to the admin panel or list any leaderboards) |
| `https://<user>.github.io/<repo>/admin` | Admin panel – create / edit / delete leaderboards |
| `https://<user>.github.io/<repo>/<your-link>` | A leaderboard, at the custom link the admin chose |

## Setup

1. Push this repository to GitHub and enable **Settings → Pages → Deploy from a branch** (the branch with these files, `/ (root)` folder).
2. Create a **fine-grained personal access token**: *Settings → Developer settings → Personal access tokens → Fine-grained tokens*,
   select only this repository, and set **Repository permissions → Contents** to **Read and write**.
3. Open `/admin`, paste the token and sign in. Owner, repository and branch are filled in automatically on `*.github.io`.

## How it works

- Each leaderboard is a JSON file in `data/boards/<link>.json`. The admin panel writes these files through the GitHub API,
  and GitHub Pages republishes them (usually within about a minute).
- Unknown paths are served by `404.html`, which reads the last part of the URL and loads the matching leaderboard.
- Leaderboard pages show a ranked table and a **match schedule** with each match's start time. A match can have one or two players.
- Scoring criteria are fully custom (e.g. *Dinosaurs* – number, higher is better; *Time* – time, lower is better).
  Criterion 1 ranks players, later criteria break ties.

Note: in a public repository the JSON files are visible on GitHub itself; the public website just never lists them.
