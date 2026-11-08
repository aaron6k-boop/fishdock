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
| 6 | 60-66 s, releasing the fish | P1 | Looking straight down, both forearms float in from the top edge of the screen, upside down, with no rope to the net | The rope hands were placed out to the left at eye height, which is above the top of the picture when looking straight down | Hands on the rope just below the eye, on the line of sight to the net and to the left: the hands, the rope and the fish swimming off are all in view | Fixed (A4) |
| 7 | 48 s after landing; start of a release | P1 | A sleeve filled a third to a half of the screen as the net was lifted over the rail; picking the net off the deck showed two long straight sleeves | The hands held the hoop's rim wherever it was, up to two metres from the shoulder, and in first person nobody stooped to the deck, so the arms were drawn that long | Hands hold the rope at arm's reach when the hoop is further; you stoop and step towards a fish or net on the deck | Fixed (A6) |
| 8 | 31 s, 44 s, reeling | - | Two lines along the rod | Checked in a tone-mapped frame and a close render: one is the line through the rings, the other the line from the tip down to the water, as it hangs in life | None | Not a defect |
| 9 | 22-39 s, reeling | P2 | Reeling hand looked as if it pinched the air beside the handle | Measured in filmed play: the fingers are within 2.4 cm of the knob (target 2 cm); in close renders the hand is on the knob | None for now | Checked |
| 10 | 87 s, facing the sun | P2 | Sky and deck wash out round the sun | Rechecked on tone-mapped frames: a soft sun disc and glare on the deck, as a low morning sun gives | None | Checked |
| 11 | Whole recording | - | Picture looked dim and grey, menus included | Not the game: the recordings are HDR (PQ, BT.2020) and the frames were pulled out without converting them, so white came out at 60%. Aaron confirmed Reduce White Point is off | Frames for evidence must be tone-mapped | Not a defect |
| 12 | Beside the Pier Hotel | P2 | Generic buildings too big next to the hotel | Buildings with no height in the map default to 7 m, including the Pier Head Public Toilets and the sheds on the quay | Open: needs a visual check before changing the defaults | Open |
| 13 | Pier root photo | P2 | White building with green domes not identified | Needs Aaron | Ask Aaron | Blocked |
| 15 | Landing, hauling the drop net up (first person) | P2 | While hauling hand over hand, the upper arms came in from the top-left corner of the screen | Same cause as 6: hauling hands out to the left at eye height while you look down | Once the net is past the rail the hands go on your line of sight to it | Fixed (A7) |
| 14 | Harbour overview, rain | P2 | White streak at top left | Unknown | Open | Open |

## Measured load per graphics preset

Gorleston, first person at the fishing spot, 430 x 860 phone-sized view. Measured in a software renderer in a cloud
browser, so frame times are not phone figures; draw calls and triangles are the same on any device.

| Preset | Pixel ratio | Post-processing | Draw calls | Triangles | Textures |
|---|---|---|---|---|---|
| Low | 1 | off | 88 | 753,079 | 65 |
| Medium (and Auto's starting point) | 1 | on | 200 | 1,615,562 | 82 |
| High | 1.75 | on, ambient occlusion | 379 | 3,381,557 | 90 |
| Ultra | 2 | on, finer ambient occlusion | 445 | 4,177,346 | 90 |

Frame rate on an iPhone: not measured (needs the phone).

Not covered from here: Blender work (on Aaron's PC), testing on a real iPhone, audio.
