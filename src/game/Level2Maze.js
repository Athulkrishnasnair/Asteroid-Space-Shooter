// src/game/Level2Maze.js
// Level 2 — Face-to-Face Cooperative Maze
// Two players navigate a pixel-art labyrinth while computer vision tracks eye contact.
// Features robust wall collision, grace-period facing penalties, and sync win condition.

import { Container, Graphics, Sprite, Text } from "pixi.js";
import { voice } from "../services/voice.js";

// 20 columns x 13 rows grid layout
// 1 = Solid Wall, 0 = Corridor, 2 = Exit Chamber, 3 = Obstacle/Hazard
const MAZE_GRID = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 1, 0, 1, 2, 2, 1, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
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
        this.linkLayer = new Graphics();
        this.playerLayer = new Container();
        this.uiLayer = new Container();

        this.container.addChild(this.mazeLayer);
        this.container.addChild(this.exitLayer);
        this.container.addChild(this.linkLayer);
        this.container.addChild(this.playerLayer);
        this.container.addChild(this.uiLayer);

        // Dimensions and Grid Setup
        this.cols = MAZE_GRID[0].length;
        this.rows = MAZE_GRID.length;
        this.tileSize = 44;
        this.offsetX = 0;
        this.offsetY = 0;

        // Player 1 (Pilot - Green)
        this.p1 = {
            x: 0,
            y: 0,
            radius: 16,
            baseSpeed: 3.6,
            sprite: new Container(),
            lastX: 0,
            lastY: 0,
        };

        // Player 2 (Gunner - Gold)
        this.p2 = {
            x: 0,
            y: 0,
            radius: 16,
            baseSpeed: 3.6,
            sprite: new Container(),
            lastX: 0,
            lastY: 0,
        };

        // Exit zone center in world pixels
        this.exitArea = {
            tileX: 9.5,
            tileY: 5.5,
            radius: 54,
            x: 0,
            y: 0,
        };

        // Facing mechanic state & grace period
        this.facingState = false;
        this.notFacingTimer = 0; // seconds without facing
        this.gracePeriod = 1.0; // 0-1s: no penalty
        this.warningPeriod = 3.0; // 1-3s: warning aura
        this.isPenaltyActive = false; // 3s+: 50% slow
        this.visionOffline = false;

        // Win condition: both at exit + facing for 2.0 seconds
        this.syncTimeRequired = 2.0;
        this.syncTimer = 0;
        this.levelCompleted = false;

        // Alien commentary timers
        this.commentaryCooldown = 3.0;
        this.stuckTimer = 0;
        this.lastCommentaryTime = 0;

        this.initVisuals();
        this.initPlayers();
        this.initHUD();
        this.recalculateLayout();

        // Initial welcome commentary
        setTimeout(() => {
            voice.commentate("MAZE_START").then((text) => {
                this.showDialogue(text);
            });
        }, 800);
    }

    recalculateLayout() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        // Reserve 160px at bottom for Tracking HUD
        const playableH = Math.max(300, sh - 170);

        // Compute best fit tile size
        const tileW = Math.floor(sw / (this.cols + 1));
        const tileH = Math.floor(playableH / (this.rows + 0.5));
        this.tileSize = Math.max(28, Math.min(48, Math.min(tileW, tileH)));

        this.offsetX = Math.floor((sw - this.cols * this.tileSize) / 2);
        this.offsetY = Math.floor((playableH - this.rows * this.tileSize) / 2) + 12;

        this.exitArea.x = this.offsetX + this.exitArea.tileX * this.tileSize;
        this.exitArea.y = this.offsetY + this.exitArea.tileY * this.tileSize;

        this.drawMaze();
    }

    initVisuals() {
        // Exit zone graphics
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
                    // Solid Wall: sci-fi metallic slab with pixel borders
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x1f2937 });
                    g.stroke({ color: 0x4b5563, width: 2 });

                    // Inner decorative panel
                    g.rect(px + 4, py + 4, this.tileSize - 8, this.tileSize - 8);
                    g.fill({ color: 0x111827 });
                } else if (cell === 2) {
                    // Exit chamber floor
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x064e3b, alpha: 0.6 });
                    g.stroke({ color: 0x10b981, width: 1 });
                } else {
                    // Corridor floor tile
                    g.rect(px, py, this.tileSize, this.tileSize);
                    g.fill({ color: 0x0f172a, alpha: 0.85 });
                    g.stroke({ color: 0x1e293b, width: 1 });

                    // Small center floor dot
                    g.circle(px + this.tileSize / 2, py + this.tileSize / 2, 1.5);
                    g.fill({ color: 0x334155, alpha: 0.5 });
                }
            }
        }

        this.mazeLayer.addChild(g);
    }

    initPlayers() {
        // Player 1: Green Pilot (spawn near top-left corridor)
        const p1SpawnX = this.offsetX + 1.5 * this.tileSize;
        const p1SpawnY = this.offsetY + 1.5 * this.tileSize;
        this.p1.x = p1SpawnX;
        this.p1.y = p1SpawnY;

        // Player 2: Golden Gunner (spawn near bottom-left corridor)
        const p2SpawnX = this.offsetX + 1.5 * this.tileSize;
        const p2SpawnY = this.offsetY + (this.rows - 2.5) * this.tileSize;
        this.p2.x = p2SpawnX;
        this.p2.y = p2SpawnY;

        // Visual containers
        this.createPlayerVisual(this.p1, 0x22c55e, "P1", this.textures.playerFrames);
        this.createPlayerVisual(this.p2, 0xfbbf24, "P2", this.textures.goldFrames);

        this.playerLayer.addChild(this.p1.sprite);
        this.playerLayer.addChild(this.p2.sprite);
    }

    createPlayerVisual(playerObj, color, label, textures) {
        playerObj.sprite.removeChildren();

        // Ship sprite or fallback graphics
        if (textures && textures.length > 0) {
            const spr = new Sprite(textures[0]);
            spr.anchor.set(0.5);
            spr.width = playerObj.radius * 2.2;
            spr.height = playerObj.radius * 2.2;
            playerObj.shipSpr = spr;
            playerObj.sprite.addChild(spr);
        } else {
            const g = new Graphics();
            g.circle(0, 0, playerObj.radius);
            g.fill({ color });
            g.stroke({ color: 0xffffff, width: 2 });
            playerObj.sprite.addChild(g);
        }

        // Facing / Co-op aura ring
        playerObj.aura = new Graphics();
        playerObj.aura.circle(0, 0, playerObj.radius + 6);
        playerObj.aura.stroke({ color: 0x22c55e, width: 2 });
        playerObj.aura.visible = false;
        playerObj.sprite.addChild(playerObj.aura);

        // Small retro player label
        const txt = new Text({
            text: label,
            style: {
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 9,
                fill: color === 0x22c55e ? "#86EFAC" : "#FDE047",
            },
        });
        txt.anchor.set(0.5, 1);
        txt.y = -playerObj.radius - 4;
        playerObj.sprite.addChild(txt);
    }

    initHUD() {
        this.fontFamily = "'Press Start 2P', monospace";

        // Level title & instructions header
        this.headerText = new Text({
            text: "LEVEL 2: CO-OP MAZE // MAINTAIN EYE CONTACT",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 12,
                fill: "#9CA3AF",
                letterSpacing: 1,
            },
        });
        this.headerText.x = 24;
        this.headerText.y = 16;
        this.uiLayer.addChild(this.headerText);

        // Dialogue Box (bottom center above tracking HUD)
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
    }

    showDialogue(text, duration = 4.0) {
        if (!text) return;
        this.dialogueText.text = `"${text}"`;
        const width = this.app.screen.width;
        const boxW = Math.min(660, width - 40);
        const boxH = 50;

        this.dialogueBg.clear();
        this.dialogueBg.roundRect(0, 0, boxW, boxH, 4);
        this.dialogueBg.fill({ color: 0x0f172a, alpha: 0.95 });
        this.dialogueBg.stroke({ color: 0x38bdf8, width: 2 });

        this.dialogueBox.x = (width - boxW) / 2;
        this.dialogueBox.y = Math.max(48, this.offsetY - boxH - 8);
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

        if (this.trackingHud) {
            this.trackingHud.updateResults(results);
        }
    }

    update(deltaTime) {
        if (this.levelCompleted) return;

        const dtSec = deltaTime / 60;

        // 1. Process Facing Mechanics & Grace Period
        this.handleFacingMechanic(dtSec);

        // 2. Handle 2-Player Movement
        this.handleMovement(deltaTime);

        // 3. Update Exit Chamber Beacon & Win Condition Check
        this.handleExitObjective(dtSec);

        // 4. Update Dialogue Banner Timer
        if (this.dialogueTimer > 0) {
            this.dialogueTimer -= dtSec;
            if (this.dialogueTimer <= 0.5) {
                this.dialogueBox.alpha = Math.max(0, this.dialogueTimer / 0.5);
            }
            if (this.dialogueTimer <= 0) {
                this.dialogueBox.visible = false;
            }
        }

        // 5. Render Co-op Beam Linking Both Players
        this.renderCoopLink();

        // 6. Update Player Sprite Transforms
        this.p1.sprite.x = this.p1.x;
        this.p1.sprite.y = this.p1.y;
        this.p2.sprite.x = this.p2.x;
        this.p2.sprite.y = this.p2.y;
    }

    handleFacingMechanic(dtSec) {
        if (this.commentaryCooldown > 0) {
            this.commentaryCooldown -= dtSec;
        }

        if (this.visionOffline) {
            // Manual Mode: full speed, no penalty
            this.isPenaltyActive = false;
            this.notFacingTimer = 0;
            this.p1.aura.visible = false;
            this.p2.aura.visible = false;
            return;
        }

        if (this.facingState) {
            // Both facing each other: reward state
            this.notFacingTimer = 0;
            this.isPenaltyActive = false;

            // Green positive aura around ships
            this.p1.aura.visible = true;
            this.p2.aura.visible = true;
            this.p1.aura.tint = 0x22c55e;
            this.p2.aura.tint = 0x22c55e;
            this.p1.aura.alpha = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
            this.p2.aura.alpha = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;

            // Occasional positive commentary
            if (this.commentaryCooldown <= 0 && Math.random() < 0.15) {
                this.commentaryCooldown = 7.0;
                voice.commentate("FACING_GOOD").then((text) => this.showDialogue(text));
            }
        } else {
            // Not facing each other
            this.notFacingTimer += dtSec;

            if (this.notFacingTimer < this.gracePeriod) {
                // 0-1s: Grace period, no visual distraction
                this.p1.aura.visible = false;
                this.p2.aura.visible = false;
                this.isPenaltyActive = false;
            } else if (this.notFacingTimer < this.warningPeriod) {
                // 1-3s: Subtle amber warning
                this.isPenaltyActive = false;
                this.p1.aura.visible = true;
                this.p2.aura.visible = true;
                this.p1.aura.tint = 0xf59e0b;
                this.p2.aura.tint = 0xf59e0b;
                this.p1.aura.alpha = 0.5 + Math.sin(Date.now() * 0.015) * 0.4;
                this.p2.aura.alpha = 0.5 + Math.sin(Date.now() * 0.015) * 0.4;
            } else {
                // 3s+: Penalty active (speed slowed to 55%)
                this.isPenaltyActive = true;
                this.p1.aura.visible = true;
                this.p2.aura.visible = true;
                this.p1.aura.tint = 0xef4444;
                this.p2.aura.tint = 0xef4444;
                this.p1.aura.alpha = 0.8 + Math.sin(Date.now() * 0.02) * 0.2;
                this.p2.aura.alpha = 0.8 + Math.sin(Date.now() * 0.02) * 0.2;

                if (this.commentaryCooldown <= 0) {
                    this.commentaryCooldown = 6.0;
                    voice.commentate("FACING_WRONG").then((text) => this.showDialogue(text));
                }
            }
        }
    }

    handleMovement(deltaTime) {
        const speedMultiplier = this.isPenaltyActive ? 0.55 : 1.0;
        const moveStepP1 = this.p1.baseSpeed * speedMultiplier * (deltaTime / 1.0);
        const moveStepP2 = this.p2.baseSpeed * speedMultiplier * (deltaTime / 1.0);

        // --- Player 1 Controls (WASD) ---
        let p1Vx = 0;
        let p1Vy = 0;
        if (this.input.isDown("w") || this.input.isDown("W")) p1Vy -= moveStepP1;
        if (this.input.isDown("s") || this.input.isDown("S")) p1Vy += moveStepP1;
        if (this.input.isDown("a") || this.input.isDown("A")) p1Vx -= moveStepP1;
        if (this.input.isDown("d") || this.input.isDown("D")) p1Vx += moveStepP1;

        if (p1Vx !== 0 || p1Vy !== 0) {
            this.moveAndSlide(this.p1, p1Vx, p1Vy);
        }

        // --- Player 2 Controls (Arrow Keys) ---
        let p2Vx = 0;
        let p2Vy = 0;
        if (this.input.isDown("ArrowUp")) p2Vy -= moveStepP2;
        if (this.input.isDown("ArrowDown")) p2Vy += moveStepP2;
        if (this.input.isDown("ArrowLeft")) p2Vx -= moveStepP2;
        if (this.input.isDown("ArrowRight")) p2Vx += moveStepP2;

        if (p2Vx !== 0 || p2Vy !== 0) {
            this.moveAndSlide(this.p2, p2Vx, p2Vy);
        }
    }

    moveAndSlide(player, vx, vy) {
        // Axis-independent collision resolution allows smooth sliding along walls
        const nextX = player.x + vx;
        if (!this.isCollidingWithWall(nextX, player.y, player.radius)) {
            player.x = nextX;
        }

        const nextY = player.y + vy;
        if (!this.isCollidingWithWall(player.x, nextY, player.radius)) {
            player.y = nextY;
        }
    }

    isCollidingWithWall(x, y, radius) {
        // Convert world bounds to grid cells
        const minCol = Math.floor((x - radius - this.offsetX) / this.tileSize);
        const maxCol = Math.floor((x + radius - this.offsetX) / this.tileSize);
        const minRow = Math.floor((y - radius - this.offsetY) / this.tileSize);
        const maxRow = Math.floor((y + radius - this.offsetY) / this.tileSize);

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
                    return true; // Screen boundary is solid
                }
                if (MAZE_GRID[r][c] === 1) {
                    // Test Circle against Wall Tile Rect
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

    handleExitObjective(dtSec) {
        // Calculate distances of both players to the exit chamber center
        const p1Dist = Math.hypot(this.p1.x - this.exitArea.x, this.p1.y - this.exitArea.y);
        const p2Dist = Math.hypot(this.p2.x - this.exitArea.x, this.p2.y - this.exitArea.y);

        const bothInsideExit = p1Dist <= this.exitArea.radius && p2Dist <= this.exitArea.radius;

        // Render pulsing exit beacon
        this.exitBeacon.clear();
        const pulse = Math.sin(Date.now() * 0.005);
        this.exitBeacon.circle(this.exitArea.x, this.exitArea.y, this.exitArea.radius + pulse * 4);
        this.exitBeacon.stroke({ color: bothInsideExit ? 0x10b981 : 0x059669, width: 3 });
        this.exitBeacon.fill({ color: 0x10b981, alpha: bothInsideExit ? 0.35 : 0.15 });

        // Win condition:
        // If vision online: both inside exit AND facing each other for 2.0s
        // If vision offline: both inside exit for 2.0s
        const meetsCondition = bothInsideExit && (this.visionOffline || this.facingState);

        if (meetsCondition) {
            this.syncTimer += dtSec;
            const progress = Math.min(1.0, this.syncTimer / this.syncTimeRequired);

            if (this.trackingHud) {
                this.trackingHud.setSyncProgress(progress, true);
            }

            // Draw progress circle on the exit beacon
            this.exitBeacon.circle(this.exitArea.x, this.exitArea.y, this.exitArea.radius * progress);
            this.exitBeacon.fill({ color: 0x34d399, alpha: 0.5 });

            if (this.syncTimer >= this.syncTimeRequired) {
                this.triggerLevelComplete();
            }
        } else {
            // Reset sync timer smoothly if they walk away or stop facing
            this.syncTimer = Math.max(0, this.syncTimer - dtSec * 1.5);
            if (this.trackingHud) {
                this.trackingHud.setSyncProgress(this.syncTimer / this.syncTimeRequired, bothInsideExit);
            }
        }
    }

    renderCoopLink() {
        this.linkLayer.clear();

        const dx = this.p2.x - this.p1.x;
        const dy = this.p2.y - this.p1.y;
        const dist = Math.hypot(dx, dy);

        // If facing each other or in close range, draw a subtle glowing link line
        if (this.facingState || dist < 120) {
            const alpha = this.facingState ? 0.45 : 0.2;
            const color = this.facingState ? 0x22c55e : 0x38bdf8;
            this.linkLayer.moveTo(this.p1.x, this.p1.y);
            this.linkLayer.lineTo(this.p2.x, this.p2.y);
            this.linkLayer.stroke({ color, width: 2, alpha });
        }
    }

    triggerLevelComplete() {
        if (this.levelCompleted) return;
        this.levelCompleted = true;

        console.log("LEVEL 2 MAZE COMPLETED!");

        if (this.soundManager) {
            this.soundManager.playLevelComplete();
        }

        // Alien victory commentary + Piper voice
        voice.commentate("MAZE_COMPLETE").then((text) => {
            this.showDialogue(text, 5.0);
        });

        // Notify SceneManager after a brief celebration
        setTimeout(() => {
            this.onComplete();
        }, 3200);
    }

    destroy() {
        this.container.destroy({ children: true });
    }
}
