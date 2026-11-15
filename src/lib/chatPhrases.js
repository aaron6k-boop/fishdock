// ---- chatPhrases: what you can say to strangers fishing the same public place (server/party.js "say") ----
// In a public place's room (everyone playing one of FishDock's marks, server/party.js) there's no typed chat: you're
// with strangers, perhaps children, and nobody moderates it. Instead a short set of fixed things anglers say to each
// other on a pier, sent by their id and shown as words on each phone. Nothing typed ever reaches anyone else. In a
// Fish Together party with friends, typed chat works as before, and these phrases too.
// Plain UK English, no names, no places, nothing that could carry anything else.

export const PHRASES = [
  { id: "hello", text: "Hello!" },
  { id: "bites", text: "Any bites?" },
  { id: "nothing", text: "Nothing yet" },
  { id: "few", text: "A few small ones" },
  { id: "nice", text: "Nice fish!" },
  { id: "bait", text: "What bait are you on?" },
  { id: "lug", text: "Lugworm" },
  { id: "rag", text: "Ragworm" },
  { id: "squid", text: "Squid" },
  { id: "mackerel", text: "Mackerel strip" },
  { id: "lures", text: "Lures" },
  { id: "tide", text: "Waiting for the tide to turn" },
  { id: "quiet", text: "Quiet today" },
  { id: "net", text: "Need a hand with the drop net?" },
  { id: "luck", text: "Good luck!" },
  { id: "thanks", text: "Thanks!" },
  { id: "yes", text: "Yes" },
  { id: "no", text: "No" },
  { id: "brb", text: "Back in a minute" },
  { id: "bye", text: "Tight lines, I'm off" },
];
const BY_ID = new Map(PHRASES.map((p) => [p.id, p.text]));
/** The words for a phrase id, or null for anything that isn't one. */
export const phraseText = (id) => (typeof id === "string" && BY_ID.has(id) ? BY_ID.get(id) : null);
/** What a chat line says, for showing: typed text, a phrase's words, or null (a notice, or nothing). */
export const lineText = (c) => (c?.sys ? null : c?.say ? phraseText(c.say) : typeof c?.text === "string" ? c.text : null);
