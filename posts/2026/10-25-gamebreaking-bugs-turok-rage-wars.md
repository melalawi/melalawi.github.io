---
title: "gamebreaking bugs in turok: rage wars"
date: 2026-10-25
tags: [decomp, N64, Rage Wars]
summary: "two bugs from the turok: rage wars decompilation: the frag tag trial that can't be won, and a cheats menu freeze."
---

i [decompiled turok: rage wars](https://github.com/AbuN64/ragewars-decomp) for the n64, and i'm cataloguing
the bugs and quirks that turn up in its code.

## the frag tag trial can't be won

on the first north american release, the two-player frag tag trial
[can't be passed](https://www.cbr.com/turok-rage-wars-rarest-n64-game/). you can win the match and the
results screen will still say you failed, so the medal never unlocks. acclaim later fixed it in a revised
build that shipped on a grey cartridge.

```media clip: the trial won on the black cartridge, then the failed results screen
```

the match itself ends correctly on the tag limit. the problem starts when the results screen works out
why the match ended, because it asks the score-limit check before it asks the frag tag check:

```c https://github.com/AbuN64/ragewars-decomp/blob/53cf682164c1470e7866a5e6e6166754b5edb163/src/game/FRONTEND/80423280_12.CPP#L226-L247 Frontend_GetMatchEndReason
if (Weapons_CheckScoreLimit((World *)&D_80145040) != 0) {
    return MATCH_END_SCORE_LIMIT;           /* asked first */
}
switch (D_8014DD98.kind) {
...
case 1:                                     /* frag tag */
    if (Weapons_CheckTotalScoreWin((World *)&D_80145040) != 0) {
        return MATCH_END_TAG_LIMIT;         /* never reached */
    }
```

frag tag has no score limit, so it stores 0 to mean "no limit". on the black cartridge the score-limit
check only treats 0 that way for team games. in a solo match it walks the players, and `0 <= score` is
true for the first one it sees. the list is built newest first, so that player is a bot, and the check
records that a human did not win:

```c https://github.com/AbuN64/ragewars-decomp/blob/53cf682164c1470e7866a5e6e6166754b5edb163/src/game/WEAPONS/80225D10_4.CPP#L641-L704 Weapons_CheckScoreLimit
for (player = round->players; player != 0;
     player = player->next) {
    /* limit 0: true for every player */
    if (gameStatus()->mode <= player->scores->score) {
        mode = currentGame()->controllerMode;
        if (mode != 0) {
            if (player->kind < 4) {         /* human */
                gameStatus()->humanWon = 1;
                return 1;
            }
            gameStatus()->humanWon = 0;     /* a bot */
```

the results screen then only passes the trial when `humanWon` is 1:

```c https://github.com/AbuN64/ragewars-decomp/blob/53cf682164c1470e7866a5e6e6166754b5edb163/src/game/FRONTEND/CODE_8042B398.CPP#L465-L474 Frontend_OpenResultsScreen
case 2:                                     /* trial */
    if (game->humanWon == 1) {
        D_800E53C0->mode = 0;               /* passed */
        ...
    } else D_800E53C0->mode = 1;            /* failed */
```

acclaim's fix was to move the zero check to the top of the function, so 0 means "no limit" in every
mode. it went into the grey north american revision and all three european builds, and the black
cartridge's version is the `VERSION_US` side:

```c https://github.com/AbuN64/ragewars-decomp/blob/53cf682164c1470e7866a5e6e6166754b5edb163/src/game/WEAPONS/80225D10_4.CPP#L641-L663 Weapons_CheckScoreLimit
if (Camera_IsSequenceActive() || Camera_IsSequenceInWindow()
#if !defined(VERSION_US)
    || gameStatus()->mode == 0      /* fixed: any match */
#endif
) {
    return 0;
}
if (gameStatus()->teams != 0) {
#if defined(VERSION_US)
    if (gameStatus()->mode == 0) {  /* black: teams only */
        return 0;
    }
#endif
```

that fixes the symptom, but the score-limit check still writes who won, and the results screen still runs
it again after the match is over.

the cleaner fix here would be to record the result once when the match ends, and keep the checks
read-only so asking them again can't change anything:

```c
/* when the match ends, remember why and who won */
void Match_End(MatchEndReason reason, Player *winner) {
    match.endReason = reason;
    match.humanWon  = Player_IsHuman(winner);
    ...
}

/* the limit checks only answer, they don't write */
Player *Match_ScoreLimitReached(Round *round);
Player *Match_TagLimitReached(Round *round);

/* the results screen just reads what the match recorded */
trialPassed = match.humanWon;
```

## the cheats menu freezes the game

if you open the cheats panel on the main menu, select go back, and then press down and a while the panel
is still closing, the game freezes. i found this one by replaying controller input against the native
port, and i haven't checked it on hardware yet.

```media clip: the presses and the freeze on the main menu
```

the panel's button handler only checks whether the panel has opened, and never whether it is closing, so
the credits button still works during the close animation:

```c https://github.com/AbuN64/ragewars-decomp/blob/53cf682164c1470e7866a5e6e6166754b5edb163/src/game/MENU_2/80420E90_10.CPP#L6-L22 func_80421E70_eu
if (D_800E4400->open == 0) {
    func_8042177C_de();
} else {
    switch (func_80299A08_de()) {
    case 0x3AC:                     /* go back: close */
        func_8041A430_de(D_800E4400->dialog, 2);
        func_804210E8_de();
        break;
    case 0x3B6:                     /* credits */
        func_804213DC_de();
        break;
    }
}
```

by that point the animation has scaled the panel's width down to 0, so the credits scroller gets a clip
rectangle that is zero pixels wide, and the text routine divides by that width when it clips each line:

```c https://github.com/AbuN64/ragewars-decomp/blob/53cf682164c1470e7866a5e6e6166754b5edb163/src/game/MENU/GFX/80414430_20.CPP#L273-L297 func_80417B20_de
if (var_s1 < sp24) {
    temp_fv0f = var_fs1f - var_fs0f;
    /* var_fs2 is the clip width: -0.0f */
    temp_fv0f = scaleClip(temp_fv0f,
                          ((f32) (sp24 - var_s1) / var_fs2));
```

the game turns on the fpu's divide-by-zero exception at boot, so `1 / -0.0` raises an exception instead of
producing infinity, and the exception handler stops the thread.

acclaim never fixed this one. the quick fix here would be to introduce a closing flag on the panel and
ignore the buttons while it is set:

```c
if (D_800E4400->open == 0) {
    func_8042177C_de();
} else if (!D_800E4400->closing) {   /* no input mid-close */
    switch (func_80299A08_de()) {
    ...
```

the cleaner fix would be to give every panel one shared check for whether it takes input, and to have the
clipping code skip empty rectangles:

```c
/* one place decides whether a panel takes input */
s32 Panel_TakesInput(Panel *panel) {
    return panel->state == PANEL_OPEN;   /* not opening, not closing */
}

/* each handler starts with it */
if (!Panel_TakesInput(panel)) {
    return 0;
}

/* and clipping gives up on an empty rectangle */
if (clipWidth <= 0.0f) {
    return;                             /* nothing to draw */
}
```
