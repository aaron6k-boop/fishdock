// ---- FishDock knots: from /home/claude/research/tackle.json (checked 2026-10-31) ----
// Where the research notes the steps follow standard practice rather than a fetched page, the knot is "partial"
// (its use is sourced) or "unverified" (nothing sourced). No strength figures were found for any knot.

export const KNOTS = [
  {
    id: "improved-clinch", name: "Improved clinch", use: "Tying hooks and swivels to mono",
    steps: ["Pass the line through the eye", "Make about five turns of the tag around the main line", "Pass the tag through the small loop by the eye, then back through the large loop just made", "Wet it, pull it tight and trim"],
    strength: "Sea Angler rates the closely related half blood among the strongest hook knots. No figure exists for the improved version.",
    sources: ["https://www.seaangler.co.uk/fishing-tackle/clothing/why-fishing-hook-size-is-so-important/"], verification: "unverified",
  },
  {
    id: "palomar", name: "Palomar", use: "Drop-shot hooks, method feeder hooks and rig swivels",
    steps: ["Double about 6in of line and push the loop through the eye", "Tie a loose overhand knot with the doubled line", "Pass the hook or swivel through the loop", "Wet it, pull it tight and trim"],
    strength: "No figure found. Angling Times uses it on three different rigs.",
    sources: ["https://www.anglingtimes.co.uk/advice/tips/fishing-rig-guide-or-the-dropshot-rig", "https://anglingtimes.co.uk/advice/rigs/how-to-tie-the-method-feeder-rig", "https://anglingtimes.co.uk/advice/rigs/the-safe-bolt-rig"], verification: "partial",
  },
  {
    id: "uni", name: "Uni knot", use: "Hooks, swivels and leads",
    steps: ["Pass the line through the eye and lay the tag back alongside the main line to form a loop", "Wrap the tag through the loop and around both lines 4 to 6 times", "Pull the tag to snug the turns", "Slide the knot down to the eye, tighten and trim"],
    strength: null,
    sources: [], verification: "unverified",
  },
  {
    id: "double-uni", name: "Double uni", use: "Joining braid to fluoro or mono, or two monos",
    steps: ["Overlap the two line ends", "Tie a uni knot with one tag around the other line", "Repeat with the other tag", "Pull the main lines so the knots slide together, then trim"],
    strength: "No figure found. Angling Times joins braid to fluoro on a drop shot with a double four-turn water knot instead.",
    sources: ["https://www.anglingtimes.co.uk/advice/tips/fishing-rig-guide-or-the-dropshot-rig"], verification: "unverified",
  },
  {
    id: "blood-knot", name: "Half blood and full blood", use: "Half blood: hooks to mono. Full blood: joining two lines of similar diameter.",
    steps: ["Half blood: pass the line through the eye and make 5 to 7 turns around the main line", "Tuck the tag through the loop by the eye, wet it and tighten", "Full blood: overlap the two lines and wrap each tag around the other line about five times", "Tuck both tags through the centre in opposite directions, wet and tighten"],
    strength: "Sea Angler calls the half blood one of the strongest knots for tying on hooks.",
    sources: ["https://www.seaangler.co.uk/fishing-tackle/clothing/why-fishing-hook-size-is-so-important/"], verification: "partial",
  },
  {
    id: "knotless-knot", name: "Knotless knot (hair rig)", use: "Ties the hook and forms the hair in one piece of hooklink",
    steps: ["Tie a small loop in the hooklink end and trim the tag", "Thread the line through the back of the eye and pull through until the hair hangs at the length you want", "Hold the hair and whip the hooklink tightly round the shank and the hair, working towards the point", "Finish with one turn back over the wraps", "Pass the tag back through the eye from the rear and pull tight"],
    strength: "No figure given. Angling Times notes it keeps the point proud and lets the bait sit off the hook.",
    sources: ["https://www.anglingtimes.co.uk/advice/rigs/how-to-tie-the-knotless-knot-hair-rig"], verification: "verified",
  },
  {
    id: "shock-leader-knot", name: "Shock leader knot", use: "Joins a heavy casting leader to a lighter mainline",
    steps: ["Tie a simple overhand knot in the leader end and pull it almost tight", "Pass the mainline through the overhand from the opposite side, beside the leader", "Close the overhand on the mainline", "Wrap the mainline tag round the leader 5 to 7 times and tuck it back between the lines", "Lubricate, tighten, and trim neatly so the knot passes through the rod rings"],
    strength: "No figure found. An Albright or a uni-to-uni join are alternatives.",
    sources: [], verification: "unverified",
  },
  {
    id: "dropper-loop", name: "Dropper loop", use: "A loop standing off the main line for a snood or hook",
    steps: ["Form a loop in the line", "Twist one side of the loop round the other 5 to 7 times", "Push the centre of the loop through the middle twist", "Hold the loop and pull both ends to tighten"],
    strength: null,
    sources: [], verification: "unverified",
  },
  {
    id: "figure-of-eight-loop", name: "Figure-of-eight loop", use: "An end loop for clipping hooklinks to quick-change swivels or heli kits",
    steps: ["Double the line end", "Pass the doubled end round the standing line", "Pass it back through the first loop to form an eight", "Wet, tighten and trim"],
    strength: "No figure found. Angling Times uses it on tench hooklinks.",
    sources: ["https://www.anglingtimes.co.uk/advice/tips/six-great-tips-to-catch-tench"], verification: "partial",
  },
  {
    id: "grinner", name: "Grinner", use: "Swivels and hooklinks on carp rigs (four turns); five turns in mono make a sliding float stop knot",
    steps: ["Pass the line through the eye and lay the tag back along the main line to form a loop", "Wrap the tag through the loop and round both lines: four turns for swivels, five for a stop knot", "Tighten the turns", "For a stop knot, tie it on the mainline and leave it able to slide; for a swivel, slide it down to the eye"],
    strength: null,
    sources: ["https://anglingtimes.co.uk/advice/rigs/the-safe-bolt-rig", "https://anglingtimes.co.uk/advice/rigs/how-to-tie-the-method-feeder-rig", "https://www.seaangler.co.uk/fishing-tackle/the-tackle-you-need-for-shore-ballan-wrasse/"], verification: "partial",
  },
  {
    id: "wire-overhand", name: "Overhand knot in wire", use: "Fixing trebles or swivels to pike wire when crimps aren't available",
    steps: ["Tie a tight overhand knot at the hook eye and bed it down with forceps", "Warm the wire near the knot briefly with a lighter", "Twist the tag round the main wire with a twiddling stick or forceps, then trim"],
    strength: "Angling Times says tying and crimping work equally well. Take care not to overheat the wire.",
    sources: ["https://www.anglingtimes.co.uk/advice/beginners/how-to-tie-your-own-wire-trace"], verification: "verified",
  },
];
