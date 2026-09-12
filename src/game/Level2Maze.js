// src/game/Level2Maze.js
// Level 2 — Simplified Co-op Maze with SINGLE Shared Player Avatar
// Both players steer the SAME vessel using their head directions (MediaPipe CV).
// Agreement drives the ship; disagreement halts it.
// Win Condition: Reach the exit pad and face each other for 1.8 seconds.

import { Container, Graphics, Sprite, Text } from "pixi.js";
import { commentary } from "../services/commentary.js";

// Simplified 12 columns x 8 rows maze
// 1 = Wall, 0 = Corridor, 2 = Exit Chamber
const MAZE_GRID = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 2, 2, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 2, 2, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export class Level2Maze {
    constructor({ app, input, soundManager, textures, trackingHud, onComplete }) {
        this.app = app;
        this.input = input;
        this.soundManager = soundManager;
        this.textures = textures || {};
        this.trackingHud = trackingHud;
        this.onComplete = onComplete || (() => {});

        this.container = new Container();
        this.mazeLayer = new Container();
        this.exitLayer = new Container();
        this.playerLayer = new Container();
        this.uiLayer = new Container();

        this.container.addChild(this.mazeLayer);
        this.container.addChild(this.exitLayer);
        this.container.addChild(this.playerLayer);
        this.container.addChild(this.uiLayer);

        this.cols = MAZE_GRID[0].length;
        this.rows = MAZE_GRID.length;
        this.tileSize = 56;
        this.offsetX = 0;
        this.offsetY = 0;

        // SINGLE shared player avatar
        this.player = {
            x: 0,
            y: 0,
            radius: 20,
            speed: 3.2,
            sprite: new Container(),
            aura: null,
            disagreeIcon: null,
            animTimer: 0,
        };

        // Exit chamber zone
        this.exitArea = {
            tileX: 7.5,
            tileY: 3.5,
            radius: 65,
            x: 0,
            y: 0,
        };

        // Head tracking consensus state
        this.p1Dir = "CENTER";
        this.p2Dir = "CENTER";
        this.facingState = false;
        this.visionOffline = false;
        this.consensusDir = "CENTER";
        this.isDisagreed = false;
        this.disagreeTimer = 0;

        // Exit sync timer (1.8s required)
        this.syncTimeRequired = 1.8;
        this.syncTimer = 0;
        this.levelCompleted = false;

        // Alien roast cooldowns
        this.roastCooldown = 3.0;
        this.wallBumpCooldown = 0;
        this.stuckTimer = 0;

        this.initVisuals();
        this.initPlayer();
        this.initHUD();
        this.recalculateLayout();

        // Initial tutorial voice commentary
        setTimeout(() => {
            commentary.roast("MAZE_START", {}, { force: true });
        }, 600);
    }

    recalculateLayout() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        // Reserve 165px at bottom for Tracking HUD
        const playableH = Math.max(300, sh - 175);

        const tileW = Math.floor(sw / (this.cols + 1));
        const tileH = Math.floor(playableH / (this.rows + 0.5));
        this.tileSize = Math.max(38, Math.min(64, Math.min(tileW, tileH)));

        this.offsetX = Math.floor((sw - this.cols * this.tileSize) / 2);
        this.offsetY = Math.floor((playableH - this.rows * this.tileSize) / 2) + 10;

        this.exitArea.x = this.offsetX + this.exitArea.tileX * this.tileSize;
        this.exitArea.y = this.offsetY + this.exitArea.tileY * this.tileSize;

        // Place player at start tile [1, 1]
        this.player.x = this.offsetX + 1.5 * this.tileSize;
        this.player.y = this.offsetY + 1.5 * this.tileSize;

        this.drawMaze();
    }

    initVisuals() {
        this.exitBeacon = new Graphics();
        this.exitLayer.addChild(this.exitBeacon);
    }

    drawMaze() {
        this.mazeLayer.removeChildren();
        const g = new Graphics();

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = MAZE_GRID[r][c];
                const px = this.offsetX + c * this.tileSize;
                const py = this.offsetY + r * this.tileSize;

                if (cell === 1) {
                    // Solid Wall Slab
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x1f2937 });
                    g.stroke({ color: 0x4b5563, width: 2 });

                    // Inner panel accent
                    g.rect(px + 4, py + 4, this.tileSize - 8, this.tileSize - 8);
                    g.fill({ color: 0x111827 });
                } else if (cell === 2) {
                    // Exit chamber floor
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x064e3b, alpha: 0.65 });
                    g.stroke({ color: 0x10b981, width: 1.5 });
                } else {
                    // Corridor floor
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x0f172a, alpha: 0.9 });
                    g.stroke({ color: 0x1e293b, width: 1 });

                    // Center dot
                    g.circle(px + this.tileSize / 2, py + this.tileSize / 2, 2);
                    g.fill({ color: 0x334155, alpha: 0.4 });
                }
            }
        }

        this.mazeLayer.addChild(g);
    }

    initPlayer() {
        this.player.sprite.removeChildren();

        // Shared ship sprite (blends pilot green & gunner gold)
        if (this.textures.playerFrames && this.textures.playerFrames.length > 0) {
            const spr = new Sprite(this.textures.playerFrames[0]);
            spr.anchor.set(0.5);
            spr.width = this.player.radius * 2.4;
            spr.height = this.player.radius * 2.4;
            this.player.shipSpr = spr;
            this.player.sprite.addChild(spr);
        } else {
            const g = new Graphics();
            g.circle(0, 0, this.player.radius);
            g.fill({ color: 0x38bdf8 });
            g.stroke({ color: 0xffffff, width: 2 });
            this.player.sprite.addChild(g);
        }

        // Shared aura ring (green when agreed, amber when disagreed)
        this.player.aura = new Graphics();
        this.player.aura.circle(0, 0, this.player.radius + 8);
        this.player.aura.stroke({ color: 0x34d399, width: 3 });
        this.player.sprite.addChild(this.player.aura);

        // Disagreement icon above ship
        this.player.disagreeIcon = new Text({
            text: "⚠️ DISAGREED",
            style: {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                fill: "#F87171",
            },
        });
        this.player.disagreeIcon.anchor.set(0.5, 1);
        this.player.disagreeIcon.y = -this.player.radius - 8;
        this.player.disagreeIcon.visible = false;
        this.player.sprite.addChild(this.player.disagreeIcon);

        // Shared vessel badge
        const badge = new Text({
            text: "SHARED VESSEL [P1+P2]",
            style: {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                fill: "#38BDF8",
            },
        });
        badge.anchor.set(0.5, 0);
        badge.y = this.player.radius + 6;
        this.player.sprite.addChild(badge);

        this.playerLayer.addChild(this.player.sprite);
    }

    initHUD() {
        this.fontFamily = "'Press Start 2P', monospace";

        // Top objective banner
        this.headerText = new Text({
            text: "LEVEL 2: CO-OP MAZE // STEER TOGETHER WITH HEAD TURNS",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 11,
                fill: "#9CA3AF",
                letterSpacing: 1,
            },
        });
        this.headerText.x = 20;
        this.headerText.y = 14;
        this.uiLayer.addChild(this.headerText);

        // Subtitle dialogue box
        this.dialogueBox = new Container();
        this.dialogueBg = new Graphics();
        this.dialogueBox.addChild(this.dialogueBg);

        this.dialogueText = new Text({
            text: "",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 11,
                fill: "#E5E7EB",
                wordWrap: true,
                wordWrapWidth: 620,
            },
        });
        this.dialogueText.x = 16;
        this.dialogueText.y = 12;
        this.dialogueBox.addChild(this.dialogueText);
        this.dialogueBox.visible = false;
        this.uiLayer.addChild(this.dialogueBox);

        this.dialogueTimer = 0;

        // Register subtitle listener with central commentary manager
        this.unsubscribeCommentary = commentary.onDialogue((text, duration) => {
            this.showDialogue(text, duration);
        });
    }

    showDialogue(text, duration = 4.0) {
        if (!text) return;
        this.dialogueText.text = `"${text}"`;
        const width = this.app.screen.width;
        const boxW = Math.min(640, width - 36);
        const boxH = 50;

        this.dialogueBg.clear();
        this.dialogueBg.roundRect(0, 0, boxW, boxH, 4);
        this.dialogueBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        this.dialogueBg.stroke({ color: 0x38bdf8, width: 2 });

        this.dialogueBox.x = (width - boxW) / 2;
        this.dialogueBox.y = Math.max(42, this.offsetY - boxH - 6);
        this.dialogueBox.visible = true;
        this.dialogueBox.alpha = 1;
        this.dialogueTimer = duration;

        if (this.soundManager) {
            this.soundManager.playDialogue();
        }
    }

    updateTracking(results) {
        if (!results) return;
        this.visionOffline = !!results.offline;
        this.facingState = !!results.facingEachOther;

        if (results.player1 && results.player1.visible) {
            this.p1Dir = results.player1.direction || "CENTER";
        } else {
            this.p1Dir = "CENTER";
        }

        if (results.player2 && results.player2.visible) {
            this.p2Dir = results.player2.direction || "CENTER";
        } else {
            this.p2Dir = "CENTER";
        }

        if (this.trackingHud) {
            this.trackingHud.updateResults(results);
        }
    }

    update(deltaTime) {
        if (this.levelCompleted) return;

        const dtSec = deltaTime / 60;
        this.player.animTimer += dtSec;

        if (this.roastCooldown > 0) this.roastCooldown -= dtSec;
        if (this.wallBumpCooldown > 0) this.wallBumpCooldown -= dtSec;

        // 1. Process Steering (CV Cooperative Agreement + Manual Fallback)
        this.handleSteering(deltaTime, dtSec);

        // 2. Check Exit Pad & Mutual Facing Condition
        this.handleExitCheck(dtSec);

        // 3. Dialogue fading
        if (this.dialogueTimer > 0) {
            this.dialogueTimer -= dtSec;
            if (this.dialogueTimer <= 0.5) {
                this.dialogueBox.alpha = Math.max(0, this.dialogueTimer / 0.5);
            }
            if (this.dialogueTimer <= 0) {
                this.dialogueBox.visible = false;
            }
        }

        // 4. Update player sprite transform
        this.player.sprite.x = this.player.x;
        this.player.sprite.y = this.player.y;
    }

    handleSteering(deltaTime, dtSec) {
        let vx = 0;
        let vy = 0;
        const step = this.player.speed * (deltaTime / 1.0);

        // Check for manual keyboard input first (WASD or Arrow Keys)
        let manualActive = false;
        let mX = 0;
        let mY = 0;

        // Player 1 WASD
        if (this.input.isDown("w") || this.input.isDown("W")) mY -= 1;
        if (this.input.isDown("s") || this.input.isDown("S")) mY += 1;
        if (this.input.isDown("a") || this.input.isDown("A")) mX -= 1;
        if (this.input.isDown("d") || this.input.isDown("D")) mX += 1;

        // Player 2 Arrow Keys
        if (this.input.isDown("ArrowUp")) mY -= 1;
        if (this.input.isDown("ArrowDown")) mY += 1;
        if (this.input.isDown("ArrowLeft")) mX -= 1;
        if (this.input.isDown("ArrowRight")) mX += 1;

        if (mX !== 0 || mY !== 0) {
            manualActive = true;
            const len = Math.hypot(mX, mY) || 1;
            vx = (mX / len) * step;
            vy = (mY / len) * step;
            this.isDisagreed = false;
            this.player.disagreeIcon.visible = false;
            this.player.aura.stroke({ color: 0x38bdf8, width: 2 });
        } else if (!this.visionOffline) {
            // --- Computer Vision Cooperative Head Steering ---
            // When both agree:
            // LEFT + LEFT = Left
            // RIGHT + RIGHT = Right
            // CENTER + CENTER = Up / Forward
            // DOWN + DOWN = Down / Back
            if (this.p1Dir === this.p2Dir) {
                this.isDisagreed = false;
                this.player.disagreeIcon.visible = false;
                this.player.aura.stroke({ color: 0x34d399, width: 3 });

                if (this.p1Dir === "LEFT") {
                    vx = -step;
                } else if (this.p1Dir === "RIGHT") {
                    vx = step;
                } else if (this.p1Dir === "DOWN") {
                    vy = step;
                } else if (this.p1Dir === "CENTER") {
                    // Both looking forward moves avatar upward / forward through maze
                    vy = -step * 0.9;
                }
            } else {
                // Disagreement: Stop the ship!
                vx = 0;
                vy = 0;
                this.isDisagreed = true;
                this.player.disagreeIcon.visible = true;
                this.player.aura.stroke({ color: 0xf87171, width: 3 });

                // Subtle wobble animation when in disagreement
                this.player.sprite.rotation = Math.sin(this.player.animTimer * 12) * 0.08;

                if (this.roastCooldown <= 0) {
                    this.roastCooldown = 5.0;
                    commentary.roast("MAZE_DISAGREE");
                }
            }
        }

        if (vx !== 0 || vy !== 0) {
            this.player.sprite.rotation = 0;
            this.moveAndSlide(vx, vy);
        }
    }

    moveAndSlide(vx, vy) {
        // Independent X and Y collision allows smooth sliding along walls
        const nextX = this.player.x + vx;
        if (!this.isCollidingWithWall(nextX, this.player.y, this.player.radius)) {
            this.player.x = nextX;
        } else if (this.wallBumpCooldown <= 0) {
            this.wallBumpCooldown = 4.0;
            if (this.soundManager) this.soundManager.playCrash();
            commentary.roast("MAZE_WALL", {}, { textOnly: true });
        }

        const nextY = this.player.y + vy;
        if (!this.isCollidingWithWall(this.player.x, nextY, this.player.radius)) {
            this.player.y = nextY;
        }
    }

    isCollidingWithWall(x, y, radius) {
        const minCol = Math.floor((x - radius - this.offsetX) / this.tileSize);
        const maxCol = Math.floor((x + radius - this.offsetX) / this.tileSize);
        const minRow = Math.floor((y - radius - this.offsetY) / this.tileSize);
        const maxRow = Math.floor((y + radius - this.offsetY) / this.tileSize);

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
                    return true;
                }
                if (MAZE_GRID[r][c] === 1) {
                    const tileX = this.offsetX + c * this.tileSize;
                    const tileY = this.offsetY + r * this.tileSize;
                    const closestX = Math.max(tileX, Math.min(x, tileX + this.tileSize));
                    const closestY = Math.max(tileY, Math.min(y, tileY + this.tileSize));
                    const dx = x - closestX;
                    const dy = y - closestY;
                    if (dx * dx + dy * dy < radius * radius) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    handleExitCheck(dtSec) {
        const dist = Math.hypot(this.player.x - this.exitArea.x, this.player.y - this.exitArea.y);
        const insideExit = dist <= this.exitArea.radius;

        // Pulse beacon animation
        this.exitBeacon.clear();
        const pulse = Math.sin(Date.now() * 0.006);
        this.exitBeacon.circle(this.exitArea.x, this.exitArea.y, this.exitArea.radius + pulse * 4);
        this.exitBeacon.stroke({ color: insideExit ? 0x10b981 : 0x059669, width: 3 });
        this.exitBeacon.fill({ color: 0x10b981, alpha: insideExit ? 0.4 : 0.15 });

        // Win condition:
        // Inside exit AND (facingEachOther OR visionOffline manual override) for 1.8s
        const canSync = insideExit && (this.visionOffline || this.facingState);

        if (canSync) {
            this.syncTimer += dtSec;
            const progress = Math.min(1.0, this.syncTimer / this.syncTimeRequired);

            if (this.trackingHud) {
                this.trackingHud.setSyncProgress(progress, true);
            }

            // Fill exit beacon progress circle
            this.exitBeacon.circle(this.exitArea.x, this.exitArea.y, this.exitArea.radius * progress);
            this.exitBeacon.fill({ color: 0x34d399, alpha: 0.55 });

            if (this.syncTimer >= this.syncTimeRequired) {
                this.completeLevel();
            }
        } else {
            this.syncTimer = Math.max(0, this.syncTimer - dtSec * 1.5);
            if (this.trackingHud) {
                this.trackingHud.setSyncProgress(this.syncTimer / this.syncTimeRequired, insideExit);
            }
        }
    }

    completeLevel() {
        if (this.levelCompleted) return;
        this.levelCompleted = true;

        console.log("LEVEL 2 CO-OP MAZE COMPLETED!");

        if (this.soundManager) {
            this.soundManager.playLevelComplete();
        }

        commentary.say("Against all available evidence... you coordinated. Central Vienium is deeply confused. Mission accepted.", { force: true });

        // Advance to Level 3 Transit Police cutscene
        setTimeout(() => {
            this.onComplete();
        }, 3200);
    }

    destroy() {
        if (this.unsubscribeCommentary) this.unsubscribeCommentary();
        this.container.destroy({ children: true });
    }
}
