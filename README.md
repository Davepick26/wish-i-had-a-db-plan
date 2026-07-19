# Wish I Had a DB Plan

A single-file, self-contained retirement income planner for Canadians on a defined
contribution (DC) plan who want to compare their projected retirement income against
a theoretical defined benefit (DB) pension.

Open `retirement-planner.html` directly in a browser — no build step, no dependencies.
It's also packaged as a Windows desktop app via Electron (see below).

## Features

- Set a monthly after-tax income goal, tracked against your projected actual income
- Model DC, RRSP, TFSA, non-registered stock, and cash accounts
- CPP and OAS with flexible start ages (60–70 and 65–70) and actuarial adjustment
- Married/spouse support with duplicated accounts and optional income splitting
- Compare against a theoretical Canadian public-sector-style DB pension formula
- A second page simulates a bracket-filling withdrawal order (RRSP/RRIF → cash →
  stock → TFSA) from retirement to age 71, then CRA RRIF minimums from 71 on, using
  approximate 2026 federal + provincial tax brackets for all 13 provinces/territories

This is an educational model, not financial or tax advice — see the in-app
disclaimers for the specific simplifications each page makes.

## Desktop app (Windows)

Requires [Node.js](https://nodejs.org).

```
npm install       # first time only
npm start         # run the app
npm run dist      # build a Windows installer into dist/
```
