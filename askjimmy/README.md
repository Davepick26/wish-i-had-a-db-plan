# AskJimmy — clickable prototype

This is a working first slice of the AskJimmy idea: browse listings, chat with
"Jimmy" to negotiate a price, and see it flow through to a seller approval and
a confirmed deal.

## Running it

From this folder:

```
npm install
npm start
```

Then open http://localhost:3210 in a browser.

## Trying the full loop yourself

Because there are no real accounts yet, "you" are identified by a random ID
stored in your browser (localStorage). To play both the seller and a buyer in
one browser, you have to switch identities between steps:

1. Go to **Sell an item** and publish a listing as yourself (the seller).
2. Open the browser's dev tools console and run:
   `localStorage.setItem('askjimmy_myId', crypto.randomUUID())`
   then reload — this makes you a new, different "buyer".
3. Open the listing and chat with Jimmy to negotiate, then confirm the deal.
4. Switch back to your original seller ID (or just clear localStorage and
   re-create a listing) and go to **My listings** to approve the offer.

This is just for testing solo — once this moves past a prototype, real SMS
verification replaces this local-identity trick.

## What's real vs. stubbed in this version

**Built:**
- Listing creation with category-based question checklists
- Browse/search list
- Chat-based negotiation with a floor price and a scripted concession model
- Firmness that increases with unique-buyer inquiry count
- Private negotiation with all buyers, single best offer surfaced to the seller
- Mutual agree step (buyer confirms, then seller approves)
- Seller approval picks the pickup time/location

**Stubbed / deferred (see the product summary for the full plan):**
- Jimmy's brain is a scripted rules engine, not a real AI model yet
- No real buyer identity verification (SMS OTP) — swapped for a
  browser-local ID for this prototype
- No payment collection / success fee charging
- No 30-day listing expiration or no-activity nudges yet
- No holding pattern for backup buyers
- No auto-close mode

## Next step: making Jimmy a real AI

Right now `jimmyReply()` in `server.js` is a hand-written rules engine. To
upgrade it to a real AI negotiator:

1. Create an account at console.anthropic.com and add a payment method
   (this part has to be done by you directly).
2. Get an API key and add it as an environment variable
   (`ANTHROPIC_API_KEY`).
3. Replace `jimmyReply()` with a call to the Claude API, passing it the
   listing details, floor price, and conversation history, and asking it to
   negotiate and respond in character as Jimmy.

Everything else — the listing flow, the chat UI, the seller approval step —
stays the same. Only the "brain" behind Jimmy's replies changes.
