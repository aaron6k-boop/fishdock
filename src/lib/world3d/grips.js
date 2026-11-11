// ---- grips made in Blender ----
// The two grips you see most, posed on the arms model itself in Blender and closed there onto the shapes they hold
// (a 29 mm handle with the reel's stem under it; the reel's knob, 20 mm across and 26 mm long). Made by
// source-assets/blender/grips/make_grips.py; do not edit by hand, run that again.
//   side: which hand ("r" or "l"); Ph: the wrist in the grip's frame (metres); Qh: the hand's frame in the grip's
//   frame [x, y, z, w]; bones: each finger bone's turn from rest, in the hand's own frame (x across the knuckles, y along the fingers).
// The grip's frame: "seat" has its origin on the rod's axis at the reel's stem, z to the rod's tip, y up (the reel
// hangs below); "crank" has it at the middle of the knob, x along the knob out from the handle's arm.
export const AUTHORED = {
 "seat": {
  "side": "r",
  "Ph": [
   -0.05921,
   0.07137,
   -0.03742
  ],
  "Qh": [
   -0.64941,
   -0.27949,
   -0.70692,
   0.02033
  ],
  "bones": {
   "index_01_r": [
    0.204961,
    -0.034778,
    -0.059787,
    0.976323
   ],
   "index_02_r": [
    0.907479,
    -0.154262,
    -0.024178,
    0.39
   ],
   "index_03_r": [
    0.94766,
    -0.161101,
    -0.017166,
    0.275121
   ],
   "middle_01_r": [
    0.541596,
    0.057492,
    -0.043908,
    0.83752
   ],
   "middle_02_r": [
    0.979315,
    0.103872,
    -0.009115,
    0.173406
   ],
   "middle_03_r": [
    0.984745,
    0.104446,
    -0.007311,
    0.138978
   ],
   "ring_01_r": [
    0.457546,
    0.160256,
    0.045895,
    0.87342
   ],
   "ring_02_r": [
    0.93213,
    0.326586,
    0.008432,
    0.156217
   ],
   "ring_03_r": [
    0.934565,
    0.327439,
    0.00753,
    0.13898
   ],
   "pinky_01_r": [
    0.657218,
    0.346841,
    0.052811,
    0.667066
   ],
   "pinky_02_r": [
    0.861698,
    0.454819,
    0.018057,
    0.224255
   ],
   "pinky_03_r": [
    0.865038,
    0.456584,
    0.016722,
    0.207268
   ],
   "thumb_01_r": [
    -0.227716,
    0.143631,
    0.171387,
    0.947704
   ],
   "thumb_02_r": [
    -0.243987,
    0.145226,
    0.174955,
    0.942746
   ],
   "thumb_03_r": [
    -0.342519,
    0.13631,
    0.152501,
    0.916975
   ]
  }
 },
 "crank": {
  "side": "l",
  "Ph": [
   0.02384,
   0.07498,
   -0.10682
  ],
  "Qh": [
   0.81823,
   -0.02597,
   0.01827,
   0.57401
  ],
  "bones": {
   "index_01_l": [
    0.25733,
    0.027724,
    7.3e-05,
    0.965926
   ],
   "index_02_l": [
    0.715201,
    0.077053,
    0.000202,
    0.694658
   ],
   "index_03_l": [
    0.908289,
    0.097856,
    0.000257,
    0.406736
   ],
   "middle_01_l": [
    0.288729,
    -0.046009,
    -1e-05,
    0.956305
   ],
   "middle_02_l": [
    0.837483,
    -0.133451,
    -3e-05,
    0.529918
   ],
   "middle_03_l": [
    0.965961,
    -0.153924,
    -3.4e-05,
    0.207911
   ],
   "ring_01_l": [
    0.465301,
    -0.136145,
    -9e-05,
    0.874619
   ],
   "ring_02_l": [
    0.896013,
    -0.262169,
    -0.000174,
    0.358368
   ],
   "ring_03_l": [
    0.957422,
    -0.280137,
    -0.000186,
    -0.069757
   ],
   "pinky_01_l": [
    0.50012,
    -0.215666,
    -0.00018,
    0.83867
   ],
   "pinky_02_l": [
    0.886971,
    -0.382486,
    -0.000318,
    0.258819
   ],
   "pinky_03_l": [
    0.901388,
    -0.388703,
    -0.000324,
    -0.190809
   ],
   "thumb_01_l": [
    -0.363595,
    0.099759,
    -0.104083,
    0.920333
   ],
   "thumb_02_l": [
    -0.482153,
    0.069701,
    -0.073762,
    0.870183
   ],
   "thumb_03_l": [
    -0.650163,
    0.019532,
    -0.022133,
    0.759221
   ]
  }
 }
};
