// src/game/SceneManager.js
// Scene state machine:
// INTRO -> LEVEL1 -> TRANSITION -> LEVEL2 -> TRANSITION_2_3 -> LEVEL3 -> ENDING

import { Container, Graphics, Text, Sprite } from "pixi.js";
import { Level2Maze } from "./Level2Maze.js";
import { Level3Subway } from "./Level3Subway.js";
import { TrackingHUD } from "./TrackingHUD.js";
import { voice } from "../services/voice.js";
import { commentary } from "../services/commentary.js";

export class SceneManager {
    constructor({ game, faceTracker }) {
        this.game = game;
        this.faceTracker = faceTracker;
        this.currentScene = "INTRO";

        this.app = game.app;
        this.trackingHud = null;
        this.level2 = null;
        this.level3 = null;
        this.transitionContainer = null;
        this.transition23Container = null;
        this.endingContainer = null;
        this.fontFamily = "'Press Start 2P', monospace";
        this.initialized = false;
        this._sceneChanging = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.transitionContainer = new Container();
        this.transition23Container = new Container();
        this.endingContainer = new Container();

        this.app.stage.addChild(this.transitionContainer);
        this.app.stage.addChild(this.transition23Container);
        this.app.stage.addChild(this.endingContainer);

        this.transitionContainer.visible = false;
        this.transition23Container.visible = false;
        this.endingContainer.visible = false;

        // Listen for Level 1 complete
        this.game.onLevelComplete = () => {
            this.changeScene("TRANSITION");
        };

        this.initFaceTracking();

        this.app.ticker.add((ticker) => {
            this.update(ticker.deltaTime);
        });

        window.addEventListener("resize", () => {
            if (this.currentScene === "LEVEL2" && this.level2) {
                this.level2.recalculateLayout();
            }
        });
    }

    initFaceTracking() {
        this.trackingHud = new TrackingHUD({
            faceTracker: this.faceTracker,
        });
        this.trackingHud.hide();

        if (this.faceTracker) {
            const originalOnResults = this.faceTracker.onResults;
            this.faceTracker.onResults = (results) => {
                if (typeof originalOnResults === "function") {
                    originalOnResults(results);
                }
                if (this.trackingHud) {
                    this.trackingHud.updateResults(results);
                }
                if (this.currentScene === "LEVEL2" && this.level2) {
                    this.level2.updateTracking(results);
                }
            };
        }
    }

    changeScene(newScene) {
        console.log(`[SceneManager] ${this.currentScene} -> ${newScene}`);
        this.currentScene = newScene;

        // Hide all overlay layers first
        this.transitionContainer.visible = false;
        this.transition23Container.visible = false;
        this.endingContainer.visible = false;

        if (newScene === "LEVEL1") {
            if (this.trackingHud) this.trackingHud.hide();
            this._destroyLevel2();
            this._destroyLevel3();
            this.game.show();
            this.game.restart();
            voice.commentate("LEVEL1_START");

        } else if (newScene === "TRANSITION") {
            this.game.hide();
            if (this.trackingHud) this.trackingHud.hide();
            this.playTransitionCutscene();

        } else if (newScene === "LEVEL2") {
            this.game.hide();
            this.mountLevel2();
            if (this.trackingHud) this.trackingHud.show();

        } else if (newScene === "TRANSITION_2_3") {
            if (this.trackingHud) this.trackingHud.hide();
            this._destroyLevel2();
            this.playTransition23Cutscene();

        } else if (newScene === "LEVEL3") {
            this.mountLevel3();

        } else if (newScene === "ENDING") {
            this._destroyLevel3();
            this.mountEndingScreen();
        }
    }

    _destroyLevel2() {
        if (this.level2) {
            this.level2.destroy();
            this.level2 = null;
        }
    }

    _destroyLevel3() {
        if (this.level3) {
            this.level3.destroy();
            this.level3 = null;
        }
    }

    // ─── LEVEL 1 → LEVEL 2 Transition Cutscene ───────────────────────────────

    playTransitionCutscene() {
        this.transitionContainer.removeChildren();
        this.transitionContainer.visible = true;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x05070a, alpha: 0.95 });
        this.transitionContainer.addChild(bg);

        // Warp streaks
        const streaks = [];
        for (let i = 0; i < 40; i++) {
            const streak = new Graphics();
            streak.rect(0, 0, 3, 20 + Math.random() * 50);
            streak.fill({ color: 0x38bdf8, alpha: 0.4 + Math.random() * 0.5 });
            streak.x = Math.random() * w;
            streak.y = Math.random() * h;
            streak.speed = 12 + Math.random() * 18;
            this.transitionContainer.addChild(streak);
            streaks.push(streak);
        }

        let shipSpr = null;
        if (this.game.textures.playerFrames && this.game.textures.playerFrames.length > 0) {
            shipSpr = new Sprite(this.game.textures.playerFrames[0]);
            shipSpr.anchor.set(0.5);
            shipSpr.width = 72;
            shipSpr.height = 72;
            shipSpr.x = w / 2;
            shipSpr.y = h * 0.65;
            this.transitionContainer.addChild(shipSpr);
        }

        const bannerBox = new Container();
        const bannerBg = new Graphics();
        bannerBg.roundRect(0, 0, Math.min(640, w - 40), 120, 6);
        bannerBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        bannerBg.stroke({ color: 0xf59e0b, width: 2 });
        bannerBox.addChild(bannerBg);

        const subTitle = new Text({
            text: "INCOMING TRANSMISSION // SECTOR CV-08",
            style: { fontFamily: this.fontFamily, fontSize: 12, fill: "#F59E0B" },
        });
        subTitle.x = 20;
        subTitle.y = 16;
        bannerBox.addChild(subTitle);

        const bodyText = new Text({
            text: "SECTOR CV-07 CLEARED.\nINITIATING BIOMETRIC CUSTODY GRID...\nMAINTAIN PARTNER EYE CONTACT.",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#E5E7EB", lineHeight: 24 },
        });
        bodyText.x = 20;
        bodyText.y = 44;
        bannerBox.addChild(bodyText);

        bannerBox.x = (w - Math.min(640, w - 40)) / 2;
        bannerBox.y = 60;
        this.transitionContainer.addChild(bannerBox);

        voice.commentate("LEVEL1_COMPLETE");

        const startTime = Date.now();
        const tickerFunc = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            for (const s of streaks) {
                s.y += s.speed;
                if (s.y > h) s.y = -60;
            }
            if (shipSpr) {
                shipSpr.y -= 1.8;
                shipSpr.scale.x = 1.0 + Math.sin(Date.now() * 0.01) * 0.05;
                shipSpr.scale.y = 1.0 + Math.sin(Date.now() * 0.01) * 0.05;
            }
            if (elapsed >= 3.2) {
                this.app.ticker.remove(tickerFunc);
                this.changeScene("LEVEL2");
            }
        };
        this.app.ticker.add(tickerFunc);
    }

    // ─── LEVEL 2 → LEVEL 3 Transition Cutscene ───────────────────────────────

    playTransition23Cutscene() {
        this.transition23Container.removeChildren();
        this.transition23Container.visible = true;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x030508, alpha: 1 });
        this.transition23Container.addChild(bg);

        // Red siren flicker overlay
        const sirenFlash = new Graphics();
        sirenFlash.rect(0, 0, w, h);
        sirenFlash.fill({ color: 0xef4444, alpha: 0.0 });
        this.transition23Container.addChild(sirenFlash);

        const lines = [];
        const CUTSCENE_LINES = [
            "CONGRATULATIONS.",
            "YOU HAVE ESCAPED THE MAZE.",
            "UNFORTUNATELY...",
            "YOU ARE NOW UNDER ARREST!",
            "WELCOME TO THE CENTRAL VIENIUM TRANSIT AUTHORITY.",
            "",
            "TO MOVE LEFT — SAY: LEFT",
            "TO MOVE RIGHT — SAY: RIGHT",
            "TO JUMP — SAY: JUMP",
            "TO DUCK — SAY: DUCK",
            "",
            "OR USE KEYBOARD: A/D/W/S",
        ];

        let curLine = 0;

        CUTSCENE_LINES.forEach((txt, i) => {
            const t = new Text({
                text: txt,
                style: {
                    fontFamily: this.fontFamily,
                    fontSize: i < 5 ? 13 : 10,
                    fill: i === 3 ? "#EF4444" : i >= 6 && i <= 9 ? "#38BDF8" : "#E5E7EB",
                    letterSpacing: 1,
                },
            });
            t.anchor.set(0.5, 0);
            t.x = w / 2;
            t.y = h * 0.12 + i * 38;
            t.alpha = 0;
            this.transition23Container.addChild(t);
            lines.push(t);
        });

        // Siren sound + commentary
        if (this.game.soundManager) {
            this.game.soundManager.playGoldenSpawn();
        }
        commentary.say("Congratulations. You escaped the maze. Unfortunately... you are now under arrest! Welcome to the Central Vienium Transit Authority.", { force: true });

        const startTime = Date.now();
        let sirenToggle = false;

        const tickerFunc = () => {
            const elapsed = (Date.now() - startTime) / 1000;

            // Siren flash effect
            sirenFlash.alpha = (Math.sin(elapsed * 8) > 0) ? 0.06 : 0;

            // Reveal lines one by one
            const targetLine = Math.min(lines.length - 1, Math.floor(elapsed / 0.45));
            for (let i = 0; i <= targetLine; i++) {
                if (lines[i].alpha < 1) {
                    lines[i].alpha = Math.min(1, lines[i].alpha + 0.08);
                }
            }

            // After 5.5s move to Level 3, or on spacebar/click
            if (elapsed >= 5.5) {
                this.app.ticker.remove(tickerFunc);
                this._startLevel3();
            }
        };

        // Allow skip with spacebar or click
        const skipHandler = (e) => {
            if (e.type === "keydown" && e.code !== "Space") return;
            window.removeEventListener("keydown", skipHandler);
            window.removeEventListener("pointerup", skipHandler);
            this.app.ticker.remove(tickerFunc);
            this._startLevel3();
        };
        window.addEventListener("keydown", skipHandler);
        window.addEventListener("pointerup", skipHandler);

        this.app.ticker.add(tickerFunc);
    }

    _startLevel3() {
        this.transition23Container.visible = false;
        this.changeScene("LEVEL3");
    }

    // ─── Mount Level 2 ────────────────────────────────────────────────────────

    mountLevel2() {
        this._destroyLevel2();

        this.level2 = new Level2Maze({
            app: this.app,
            input: this.game.input,
            soundManager: this.game.soundManager,
            textures: this.game.textures,
            trackingHud: this.trackingHud,
            onComplete: () => {
                this.changeScene("TRANSITION_2_3");
            },
        });

        this.app.stage.addChild(this.level2.container);
    }

    // ─── Mount Level 3 ────────────────────────────────────────────────────────

    mountLevel3() {
        this._destroyLevel3();

        this.level3 = new Level3Subway({
            app: this.app,
            input: this.game.input,
            soundManager: this.game.soundManager,
            textures: this.game.textures,
            onComplete: () => {
                this.changeScene("ENDING");
            },
        });

        this.app.stage.addChild(this.level3.container);
        commentary.roast("SUBWAY_START", {}, { force: true });
    }

    // ─── Ending Screen (Transit Police Custody Report) ────────────────────────

    mountEndingScreen() {
        this.endingContainer.removeChildren();
        this.endingContainer.visible = true;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x05070a, alpha: 0.97 });
        this.endingContainer.addChild(bg);

        // Animated red siren blips
        const siren1 = new Graphics();
        siren1.circle(w * 0.3, h * 0.22, 18);
        siren1.fill({ color: 0xef4444, alpha: 0.8 });
        this.endingContainer.addChild(siren1);

        const siren2 = new Graphics();
        siren2.circle(w * 0.7, h * 0.22, 18);
        siren2.fill({ color: 0x3b82f6, alpha: 0.8 });
        this.endingContainer.addChild(siren2);

        const cardW = Math.min(720, w - 40);
        const cardH = 360;
        const cardX = (w - cardW) / 2;
        const cardY = (h - cardH) / 2 - 20;

        const cardBg = new Graphics();
        cardBg.roundRect(cardX, cardY, cardW, cardH, 8);
        cardBg.fill({ color: 0x0a0e14, alpha: 0.98 });
        cardBg.stroke({ color: 0xef4444, width: 3 });
        this.endingContainer.addChild(cardBg);

        const title = new Text({
            text: "CENTRAL VIENIUM TRANSIT POLICE",
            style: { fontFamily: this.fontFamily, fontSize: 13, fill: "#EF4444", letterSpacing: 1 },
        });
        title.anchor.set(0.5, 0);
        title.x = w / 2;
        title.y = cardY + 20;
        this.endingContainer.addChild(title);

        const sub = new Text({
            text: "CUSTODY REPORT // INCIDENT CV-08-TRANSIT",
            style: { fontFamily: this.fontFamily, fontSize: 9, fill: "#F59E0B" },
        });
        sub.anchor.set(0.5, 0);
        sub.x = w / 2;
        sub.y = cardY + 50;
        this.endingContainer.addChild(sub);

        const verdict = new Text({
            text: "SUBJECTS: CAUGHT BY TRANSIT POLICE\nCHARGE: UNLAWFUL SUBWAY OPERATION\nSENTENCE: MANDATORY COMPATIBILITY REVIEW",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#EF4444", lineHeight: 26 },
        });
        verdict.anchor.set(0.5, 0);
        verdict.x = w / 2;
        verdict.y = cardY + 82;
        this.endingContainer.addChild(verdict);

        const desc = new Text({
            text: "The evaluation is complete. Central Vienium has determined\nthat the two subjects demonstrated adequate survival instincts,\nquestionable communication, and suspicious coordination.\n\nThey have been issued a joint custody certificate.\nFuture interstellar travel will require triplicate paperwork.",
            style: {
                fontFamily: "'VT323', monospace",
                fontSize: 20,
                fill: "#E5E7EB",
                lineHeight: 26,
                align: "center",
            },
        });
        desc.anchor.set(0.5, 0);
        desc.x = w / 2;
        desc.y = cardY + 168;
        this.endingContainer.addChild(desc);

        // Restart button
        const btnBox = new Container();
        const btnBg = new Graphics();
        btnBg.roundRect(0, 0, 300, 46, 4);
        btnBg.fill({ color: 0x1f2937 });
        btnBg.stroke({ color: 0x38bdf8, width: 2 });
        btnBox.addChild(btnBg);

        const btnText = new Text({
            text: "[ RE-RUN PROTOCOL ]",
            style: { fontFamily: this.fontFamily, fontSize: 11, fill: "#38BDF8" },
        });
        btnText.anchor.set(0.5);
        btnText.x = 150;
        btnText.y = 23;
        btnBox.addChild(btnText);

        btnBox.x = (w - 300) / 2;
        btnBox.y = cardY + cardH - 62;
        btnBox.eventMode = "static";
        btnBox.cursor = "pointer";

        btnBox.on("pointerover", () => { btnBg.tint = 0xaabbcc; });
        btnBox.on("pointerout", () => { btnBg.tint = 0xffffff; });
        btnBox.on("pointertap", () => {
            this.endingContainer.visible = false;
            this.changeScene("LEVEL1");
        });

        this.endingContainer.addChild(btnBox);

        // Siren blink animation
        const sirenTicker = () => {
            const t = Date.now() * 0.006;
            siren1.alpha = (Math.sin(t) > 0) ? 0.85 : 0.2;
            siren2.alpha = (Math.sin(t) > 0) ? 0.2 : 0.85;
        };
        this.app.ticker.add(sirenTicker);
        // Store so we can remove if needed
        this._endingSirenTicker = sirenTicker;

        commentary.roast("SUBWAY_CAUGHT", {}, { force: true });
    }

    // ─── Main Update Loop ────────────────────────────────────────────────────

    update(deltaTime) {
        if (this.currentScene === "LEVEL2" && this.level2) {
            this.level2.update(deltaTime);
        }
        if (this.currentScene === "LEVEL3" && this.level3) {
            this.level3.update(deltaTime);
        }
    }
}
