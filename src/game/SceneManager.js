// src/game/SceneManager.js
// Lightweight scene and state manager coordinating gameplay progression:
// INTRO -> LEVEL1 -> TRANSITION -> LEVEL2 -> VICTORY

import { Container, Graphics, Text, Sprite } from "pixi.js";
import { Level2Maze } from "./Level2Maze.js";
import { TrackingHUD } from "./TrackingHUD.js";
import { voice } from "../services/voice.js";

export class SceneManager {
    constructor({ game, faceTracker }) {
        this.game = game;
        this.faceTracker = faceTracker;
        this.currentScene = "INTRO"; // INTRO, LEVEL1, TRANSITION, LEVEL2, VICTORY

        this.app = game.app;
        this.trackingHud = null;
        this.level2 = null;
        this.transitionContainer = null;
        this.victoryContainer = null;
        this.fontFamily = "'Press Start 2P', monospace";
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // Overlay containers for Transition and Victory
        this.transitionContainer = new Container();
        this.victoryContainer = new Container();

        this.app.stage.addChild(this.transitionContainer);
        this.app.stage.addChild(this.victoryContainer);

        this.transitionContainer.visible = false;
        this.victoryContainer.visible = false;

        // Listen for Level 1 complete
        this.game.onLevelComplete = () => {
            this.changeScene("TRANSITION");
        };

        // Wire FaceTracker callbacks
        this.initFaceTracking();

        // Add main update loop for scenes
        this.app.ticker.add((ticker) => {
            this.update(ticker.deltaTime);
        });

        // Window resize
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

        // Forward FaceTracker data to HUD and active Level 2 scene
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
        console.log(`[SceneManager] Changing scene: ${this.currentScene} -> ${newScene}`);
        this.currentScene = newScene;

        if (newScene === "LEVEL1") {
            this.transitionContainer.visible = false;
            this.victoryContainer.visible = false;
            if (this.trackingHud) this.trackingHud.hide();
            if (this.level2) {
                this.level2.destroy();
                this.level2 = null;
            }
            this.game.show();
            this.game.restart();
            voice.commentate("LEVEL1_START");
        } else if (newScene === "TRANSITION") {
            this.game.hide();
            if (this.trackingHud) this.trackingHud.hide();
            this.playTransitionCutscene();
        } else if (newScene === "LEVEL2") {
            this.transitionContainer.visible = false;
            this.victoryContainer.visible = false;
            this.game.hide();

            // Mount and show Level 2 Maze
            this.mountLevel2();
            if (this.trackingHud) this.trackingHud.show();
        } else if (newScene === "VICTORY") {
            if (this.trackingHud) this.trackingHud.hide();
            if (this.level2) {
                this.level2.destroy();
                this.level2 = null;
            }
            this.mountVictoryScreen();
        }
    }

    playTransitionCutscene() {
        this.transitionContainer.removeChildren();
        this.transitionContainer.visible = true;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        // Dark sci-fi backdrop with speed streaks
        const bg = new Graphics();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x05070a, alpha: 0.95 });
        this.transitionContainer.addChild(bg);

        // Warp speed streaks
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

        // Floating player ship moving forward
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

        // Cinematic Transmission Banner
        const bannerBox = new Container();
        const bannerBg = new Graphics();
        bannerBg.roundRect(0, 0, Math.min(640, w - 40), 120, 6);
        bannerBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        bannerBg.stroke({ color: 0xf59e0b, width: 2 });
        bannerBox.addChild(bannerBg);

        const subTitle = new Text({
            text: "INCOMING TRANSMISSION // SECTOR CV-08",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 12,
                fill: "#F59E0B",
            },
        });
        subTitle.x = 20;
        subTitle.y = 16;
        bannerBox.addChild(subTitle);

        const bodyText = new Text({
            text: "SECTOR CV-07 CLEARED.\nINITIATING BIOMETRIC CUSTODY GRID...\nMAINTAIN PARTNER EYE CONTACT.",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 11,
                fill: "#E5E7EB",
                lineHeight: 24,
            },
        });
        bodyText.x = 20;
        bodyText.y = 44;
        bannerBox.addChild(bodyText);

        bannerBox.x = (w - Math.min(640, w - 40)) / 2;
        bannerBox.y = 60;
        this.transitionContainer.addChild(bannerBox);

        // Alien voice announcement
        voice.commentate("LEVEL1_COMPLETE");

        // Animate cutscene for 3 seconds then seamlessly enter Level 2
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

    mountLevel2() {
        if (this.level2) {
            this.level2.destroy();
            this.level2 = null;
        }

        this.level2 = new Level2Maze({
            app: this.app,
            input: this.game.input,
            soundManager: this.game.soundManager,
            textures: this.game.textures,
            trackingHud: this.trackingHud,
            onComplete: () => {
                this.changeScene("VICTORY");
            },
        });

        this.app.stage.addChild(this.level2.container);
    }

    mountVictoryScreen() {
        this.victoryContainer.removeChildren();
        this.victoryContainer.visible = true;

        const w = this.app.screen.width;
        const h = this.app.screen.height;

        const bg = new Graphics();
        bg.rect(0, 0, w, h);
        bg.fill({ color: 0x05070a, alpha: 0.96 });
        this.victoryContainer.addChild(bg);

        // Retro Report Terminal
        const cardW = Math.min(680, w - 40);
        const cardH = 340;
        const cardX = (w - cardW) / 2;
        const cardY = (h - cardH) / 2 - 20;

        const cardBg = new Graphics();
        cardBg.roundRect(cardX, cardY, cardW, cardH, 8);
        cardBg.fill({ color: 0x0a0e14, alpha: 0.98 });
        cardBg.stroke({ color: 0x22c55e, width: 3 });
        this.victoryContainer.addChild(cardBg);

        const title = new Text({
            text: "CENTRAL VIENIUM CUSTODY PROTOCOL",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 14,
                fill: "#FBBF24",
                letterSpacing: 1,
            },
        });
        title.x = cardX + 24;
        title.y = cardY + 24;
        this.victoryContainer.addChild(title);

        const verdict = new Text({
            text: "EVALUATION: PASSABLE\nCOOPERATION: CERTIFIED\nRISK ASSESSMENT: MARGINAL",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 12,
                fill: "#22C55E",
                lineHeight: 28,
            },
        });
        verdict.x = cardX + 24;
        verdict.y = cardY + 68;
        this.victoryContainer.addChild(verdict);

        const desc = new Text({
            text: "Against all available evidence, both test subjects\nmaintained sufficient synchronization to escape Sector CV-08.\n\nCustody has been deferred pending future paperwork.\nYou are legally permitted to tolerate each other.",
            style: {
                fontFamily: "'VT323', monospace",
                fontSize: 20,
                fill: "#E5E7EB",
                lineHeight: 26,
            },
        });
        desc.x = cardX + 24;
        desc.y = cardY + 160;
        this.victoryContainer.addChild(desc);

        // Restart button
        const btnBox = new Container();
        const btnBg = new Graphics();
        btnBg.roundRect(0, 0, 280, 44, 4);
        btnBg.fill({ color: 0x1f2937 });
        btnBg.stroke({ color: 0x38bdf8, width: 2 });
        btnBox.addChild(btnBg);

        const btnText = new Text({
            text: "[ RE-RUN EVALUATION ]",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 11,
                fill: "#38BDF8",
            },
        });
        btnText.anchor.set(0.5);
        btnText.x = 140;
        btnText.y = 22;
        btnBox.addChild(btnText);

        btnBox.x = cardX + (cardW - 280) / 2;
        btnBox.y = cardY + cardH - 64;
        btnBox.eventMode = "static";
        btnBox.cursor = "pointer";

        btnBox.on("pointerover", () => {
            btnBg.fill({ color: 0x374151 });
        });
        btnBox.on("pointerout", () => {
            btnBg.fill({ color: 0x1f2937 });
        });
        btnBox.on("pointertap", () => {
            this.changeScene("LEVEL1");
        });

        this.victoryContainer.addChild(btnBox);

        voice.commentate("MAZE_COMPLETE");
    }

    update(deltaTime) {
        if (this.currentScene === "LEVEL2" && this.level2) {
            this.level2.update(deltaTime);
        }
    }
}
