# Overhaul defect register

Branch `overhaul`. Source: the 8 November 2026 recording (91 s, iPhone, live site), the baseline stills (9 views in
clear, overcast, dusk and rain) and Aaron's photographs. Times are seconds into the recording.

Severity: **P0** breaks play or trust; **P1** obvious to any player; **P2** noticeable on a closer look.
Status: **Fixed** (seen fixed in stills, not yet on a phone), **Open**, **Blocked** (needs something outside this session).
Nothing here counts as visually fixed until Aaron has seen it on his phone.

| # | Where | Sev | What is wrong | Cause | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | Rain, distant town | P1 | Town shows as flat white cut-outs against a dark sky | Haze colour given in display colours to a linear-light fog (put through the screen curve twice) | `displayToScene` turns it back first | Fixed (A1) |
| 2 | Looking down over the railing | P1 | Sea near-black | Water's base colour decoded to linear light in a shader that works in display colours | Colour passed as written, retuned | Fixed (A1, A2) |
| 3 | From the pier end | P1 | Foreground sea near-black under a bright sky | Same as 2 | Same as 2 | Fixed (A2) |
| 4 | Dune across the harbour mouth | P1 | Olive, smooth, reads as a grassy hill; photo shows an ochre sand face with scrub on top | Drawn with the pier's concrete material; rough-ground photo scaled as if on screen (1/8 of its colour) | Rough-ground material on the dune, normalised brightness, sand face and scrub top | Fixed (A3) |
| 5 | 78-87 s, third person | P1 | Your angler wears a white cardigan and gloves; first-person sleeves are navy and hands bare | Coat "as they come" kept the model's own clothes; first person used the outfit's jacket | Your angler's model takes the outfit's jacket and bare hands | Fixed (A3) |
| 6 | 60-66 s, releasing the fish | P1 | Looking straight down, both forearms float in from the top edge of the screen, upside down, with no rope to the net | Likely: release pose puts the arms above the camera's view line when the head pitches down | Open | Open |
| 7 | 48 s, after landing | P1 | A sleeve fills a third of the screen diagonally | Likely: arm passes close to the camera as the net is swung onto the deck | Open | Open |
| 8 | 31 s, 44 s, reeling | P2 | Two parallel lines along the rod | Likely: line drawn both through the rings and straight from the reel | Open | Open |
| 9 | 22-39 s, reeling | P2 | Reeling hand pinches the air beside the handle rather than holding the knob | Likely: hand target not on the handle's knob | Open | Open |
| 10 | 87 s, facing the sun | P2 | Sky and deck wash out white round the sun | Likely: bloom and haze strength towards a low sun | Open | Open |
| 11 | Whole recording | P2 | Picture looks dim and grey throughout, menus included | Probably the phone's own setting (e.g. Reduce White Point), since the menus are dimmed too | Ask Aaron | Open |
| 12 | Beside the Pier Hotel | P2 | Generic buildings too big next to the hotel | Likely: map heights missing, defaults too tall | Open | Open |
| 13 | Pier root photo | P2 | White building with green domes not identified | Needs Aaron | Ask Aaron | Blocked |
| 14 | Harbour overview, rain | P2 | White streak at top left | Unknown | Open | Open |

Not covered from here: Blender work (on Aaron's PC), testing on a real iPhone, audio.
