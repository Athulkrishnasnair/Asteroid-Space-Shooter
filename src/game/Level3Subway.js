// src/game/Level3Subway.js
// Level 3 — Alien Subway Pursuit
// 3-lane pixel runner controlled by Whisper voice commands (LEFT, RIGHT, JUMP, DUCK)
// with loudness modulation, full keyboard fallback, animated alien police officer face,
// and escalating difficulty leading to capture by Central Vienium Transit Police.

import { Container, Graphics, Sprite, AnimatedSprite, Text } from "pixi.js";
import { voice } from "../services/voice.js";
import { commentary } from "../services/commentary.js";

export class Level3Subway {
    constructor({ app, input, soundManager, textures, onComplete }) {
        this.app = app;
        this.input = input;
        this.soundManager = soundManager;
        this.textures = textures || {};
        this.onComplete = onComplete || (() => {});

        this.container = new Container();
        this.trackLayer = new Container();
        this.obstacleLayer = new Container();
        this.playerLayer = new Container();
        this.policeLayer = new Container();
        this.uiLayer = new Container();

        this.container.addChild(this.trackLayer);
        this.container.addChild(this.obstacleLayer);
        this.container.addChild(this.playerLayer);
        this.container.addChild(this.policeLayer);
        this.container.addChild(this.uiLayer);

        this.fontFamily = "'Press Start 2P', monospace";

        // Subway 3 Lanes Setup
        this.laneSpacing = 110;
        this.currentLane = 0; // -1 = Left, 0 = Center, 1 = Right
        this.playerBaseY = 0;

        // Player physics & actions
        this.player = {
            lane: 0,
            x: 0,
            y: 0,
            targetX: 0,
            radius: 22,
            isJumping: false,
            jumpY: 0,
            jumpVel: 0,
            gravity: 0.72,
            jumpStrength: 13,
            isDucking: false,
            duckTimer: 0,
            duckDuration: 0.7,
            sprite: new Container(),
            aura: null,
            score: 0,
        };

        // Track progression and speed
        this.speed = 5.2; // Ramps up from 5.2 to 10.0
        this.runTimer = 0;
        this.captureTriggered = false;
        this.maxRunTime = 62; // Eventual capture at ~60s

        // Obstacles array
        this.obstacles = [];
        this.spawnTimer = 0;
        this.spawnInterval = 2.4; // Decreases as speed increases

        // Audio and Mic Loudness input
        this.currentVolume = 0;
        this.lastRecognizedCommand = "NONE";
        this.commandFeedbackTimer = 0;

        // Commentary timers
        this.roastCooldown = 2.5;
        this.escalationStages = [20, 40, 52];

        this.initVisuals();
        this.initPlayer();
        this.initAlienOfficer();
        this.initHUD();
        this.recalculateLayout();

        // Start Voice Command Recognition via Whisper + Web Audio API
        this.initVoiceCommands();
    }

    recalculateLayout() {
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        this.centerX = sw / 2;
        this.playerBaseY = sh * 0.72;
        this.laneSpacing = Math.min(130, Math.max(80, sw * 0.16));

        this.player.targetX = this.centerX + this.player.lane * this.laneSpacing;
        this.player.x = this.player.targetX;
        this.player.y = this.playerBaseY;

        this.drawTrack();
    }

    initVisuals() {
        this.trackGraphics = new Graphics();
        this.trackLayer.addChild(this.trackGraphics);
    }

    drawTrack() {
        this.trackGraphics.clear();
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;

        // Dark underground subway tunnel backdrop
        this.trackGraphics.rect(0, 0, sw, sh);
        this.trackGraphics.fill({ color: 0x070b12 });

        const trackWidth = this.laneSpacing * 3.4;
        const leftBound = this.centerX - trackWidth / 2;
        const rightBound = this.centerX + trackWidth / 2;

        // Subway rails bed
        this.trackGraphics.rect(leftBound, 0, trackWidth, sh);
        this.trackGraphics.fill({ color: 0x0f172a });
        this.trackGraphics.stroke({ color: 0x334155, width: 3 });

        // 3 Lane divider stripes
        const laneX1 = this.centerX - this.laneSpacing / 2;
        const laneX2 = this.centerX + this.laneSpacing / 2;

        for (let y = 0; y < sh; y += 36) {
            this.trackGraphics.rect(laneX1 - 2, y, 4, 18);
            this.trackGraphics.fill({ color: 0x38bdf8, alpha: 0.4 });

            this.trackGraphics.rect(laneX2 - 2, y, 4, 18);
            this.trackGraphics.fill({ color: 0x38bdf8, alpha: 0.4 });
        }
    }

    initPlayer() {
        this.player.sprite.removeChildren();

        // Runner vessel sprite
        if (this.textures.playerFrames && this.textures.playerFrames.length > 0) {
            const spr = new Sprite(this.textures.playerFrames[0]);
            spr.anchor.set(0.5);
            spr.width = this.player.radius * 2.5;
            spr.height = this.player.radius * 2.5;
            this.player.shipSpr = spr;
            this.player.sprite.addChild(spr);
        } else {
            const g = new Graphics();
            g.circle(0, 0, this.player.radius);
            g.fill({ color: 0x22c55e });
            g.stroke({ color: 0xffffff, width: 2 });
            this.player.sprite.addChild(g);
        }

        // Action shadow indicator
        this.player.shadow = new Graphics();
        this.player.shadow.ellipse(0, this.player.radius + 2, this.player.radius, 6);
        this.player.shadow.fill({ color: 0x000000, alpha: 0.5 });
        this.player.sprite.addChildAt(this.player.shadow, 0);

        this.playerLayer.addChild(this.player.sprite);
    }

    initAlienOfficer() {
        // Alien Transit Police Face in Top-Right Corner
        this.alienCard = new Container();

        const cardW = 160;
        const cardH = 110;
        const cardBg = new Graphics();
        cardBg.roundRect(0, 0, cardW, cardH, 4);
        cardBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        cardBg.stroke({ color: 0x38bdf8, width: 2 });
        this.alienCard.addChild(cardBg);

        const cardTitle = new Text({
            text: "TRANSIT POLICE //",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 8,
                fill: "#38BDF8",
            },
        });
        cardTitle.x = 8;
        cardTitle.y = 8;
        this.alienCard.addChild(cardTitle);

        // Animated alien sprite face
        if (this.textures.alienFrames && this.textures.alienFrames.length > 0) {
            this.alienFace = new AnimatedSprite(this.textures.alienFrames);
            this.alienFace.anchor.set(0.5);
            this.alienFace.x = cardW / 2;
            this.alienFace.y = 56;
            this.alienFace.width = 62;
            this.alienFace.height = 62;
            this.alienFace.animationSpeed = 0.08;
            this.alienFace.play();
            this.alienCard.addChild(this.alienFace);
        } else {
            const g = new Graphics();
            g.circle(cardW / 2, 56, 26);
            g.fill({ color: 0xef4444 });
            this.alienCard.addChild(g);
        }

        // Police status tag
        this.officerTag = new Text({
            text: "STATUS: IN PURSUIT",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 7,
                fill: "#F87171",
            },
        });
        this.officerTag.anchor.set(0.5, 0);
        this.officerTag.x = cardW / 2;
        this.officerTag.y = 92;
        this.alienCard.addChild(this.officerTag);

        this.uiLayer.addChild(this.alienCard);

        // Synchronize alien mouth flapping during speech
        this.unsubscribeMouth = commentary.onMouthFlap((isTalking) => {
            if (this.alienFace) {
                this.alienFace.animationSpeed = isTalking ? 0.22 : 0.06;
            }
        });
    }

    initHUD() {
        // Level Title & Voice Command Legend
        this.titleText = new Text({
            text: "LEVEL 3: ALIEN SUBWAY PURSUIT // SAY: LEFT | RIGHT | JUMP | DUCK",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 10,
                fill: "#9CA3AF",
                letterSpacing: 1,
            },
        });
        this.titleText.x = 18;
        this.titleText.y = 16;
        this.uiLayer.addChild(this.titleText);

        // Voice Command Recognition HUD Tag
        this.cmdBadge = new Text({
            text: "VOICE INPUT: LISTENING... [KEYBOARD OVERRIDE ACTIVE]",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 9,
                fill: "#34D399",
            },
        });
        this.cmdBadge.x = 18;
        this.cmdBadge.y = 38;
        this.uiLayer.addChild(this.cmdBadge);

        // Score & Speed meters
        this.statsText = new Text({
            text: "DISTANCE: 0M // SPEED: 100%",
            style: {
                fontFamily: this.fontFamily,
                fontSize: 9,
                fill: "#FBBF24",
            },
        });
        this.statsText.x = 18;
        this.statsText.y = 58;
        this.uiLayer.addChild(this.statsText);

        // Subtitle dialogue box (bottom center)
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

        this.unsubscribeCommentary = commentary.onDialogue((text, duration) => {
            this.showDialogue(text, duration);
        });
    }

    showDialogue(text, duration = 3.5) {
        if (!text) return;
        this.dialogueText.text = `"${text}"`;
        const width = this.app.screen.width;
        const boxW = Math.min(640, width - 36);
        const boxH = 50;

        this.dialogueBg.clear();
        this.dialogueBg.roundRect(0, 0, boxW, boxH, 4);
        this.dialogueBg.fill({ color: 0x0a0e14, alpha: 0.95 });
        this.dialogueBg.stroke({ color: 0xf59e0b, width: 2 });

        this.dialogueBox.x = (width - boxW) / 2;
        this.dialogueBox.y = this.app.screen.height - boxH - 18;
        this.dialogueBox.visible = true;
        this.dialogueBox.alpha = 1;
        this.dialogueTimer = duration;

        if (this.soundManager) {
            this.soundManager.playDialogue();
        }
    }

    initVoiceCommands() {
        // Start Whisper voice command listening
        this.stopVoice = voice.startCommandRecognition({
            onCommand: (cmd, rawTranscript) => {
                this.handleActionCommand(cmd, rawTranscript);
            },
            onVolume: (vol) => {
                this.currentVolume = vol;
            },
            onError: () => {
                this.cmdBadge.text = "VOICE INPUT: STANDBY // KEYBOARD OVERRIDE READY [A/D/W/S]";
                this.cmdBadge.style.fill = "#F87171";
            },
        });
    }

    handleActionCommand(cmd, rawTranscript = "") {
        console.log(`[Level 3 Voice] Command recognized: ${cmd} (raw: "${rawTranscript}")`);
        this.lastRecognizedCommand = cmd;
        this.commandFeedbackTimer = 1.2;

        this.cmdBadge.text = `COMMAND RECOGNIZED: [${cmd}]`;
        this.cmdBadge.style.fill = "#38BDF8";

        if (this.soundManager) {
            this.soundManager.playSelect();
        }

        if (cmd === "LEFT") {
            this.changeLane(-1);
        } else if (cmd === "RIGHT") {
            this.changeLane(1);
        } else if (cmd === "JUMP") {
            this.performJump();
        } else if (cmd === "DUCK") {
            this.performDuck();
        }
    }

    changeLane(direction) {
        // direction: -1 (left), 1 (right)
        const nextLane = Math.max(-1, Math.min(1, this.player.lane + direction));
        if (nextLane !== this.player.lane) {
            this.player.lane = nextLane;
            this.player.targetX = this.centerX + this.player.lane * this.laneSpacing;
        }
    }

    performJump() {
        if (this.player.isJumping) return;
        this.player.isJumping = true;
        // Louder voice command produces higher jump boost
        const boost = Math.min(6, this.currentVolume * 8);
        this.player.jumpVel = -(this.player.jumpStrength + boost);

        if (this.soundManager) {
            this.soundManager.playJump();
        }
    }

    performDuck() {
        if (this.player.isJumping) return;
        this.player.isDucking = true;
        this.player.duckTimer = this.player.duckDuration;

        if (this.soundManager) {
            this.soundManager.playDuck();
        }
    }

    spawnObstacle() {
        const types = ["LOW", "HIGH", "WALL_LEFT", "WALL_RIGHT", "WALL_CENTER"];
        const chosenType = types[Math.floor(Math.random() * types.length)];

        let lane = 0;
        if (chosenType === "WALL_LEFT") lane = -1;
        else if (chosenType === "WALL_RIGHT") lane = 1;
        else if (chosenType === "WALL_CENTER") lane = 0;
        else lane = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1

        const obs = {
            type: chosenType,
            lane: lane,
            y: -60,
            width: this.laneSpacing * 0.85,
            height: 38,
            passed: false,
            sprite: new Container(),
        };

        const g = new Graphics();
        if (chosenType === "LOW") {
            // Low barrier: transit crate (jump over)
            g.roundRect(-obs.width / 2, -14, obs.width, 28, 4);
            g.fill({ color: 0xd97706 });
            g.stroke({ color: 0xfef08a, width: 2 });
            const tag = new Text({
                text: "JUMP",
                style: { fontFamily: this.fontFamily, fontSize: 8, fill: "#000" },
            });
            tag.anchor.set(0.5);
            g.addChild(tag);
        } else if (chosenType === "HIGH") {
            // High overhead barrier: laser gate (duck under)
            g.rect(-obs.width / 2, -18, obs.width, 16);
            g.fill({ color: 0xef4444, alpha: 0.85 });
            g.stroke({ color: 0xfca5a5, width: 2 });
            const tag = new Text({
                text: "DUCK",
                style: { fontFamily: this.fontFamily, fontSize: 8, fill: "#FFF" },
            });
            tag.anchor.set(0.5);
            g.addChild(tag);
        } else {
            // Solid barrier blocking a lane
            g.roundRect(-obs.width / 2, -20, obs.width, 40, 4);
            g.fill({ color: 0x475569 });
            g.stroke({ color: 0x94a3b8, width: 2 });
            const tag = new Text({
                text: "BARRIER",
                style: { fontFamily: this.fontFamily, fontSize: 7, fill: "#FFF" },
            });
            tag.anchor.set(0.5);
            g.addChild(tag);
        }

        obs.sprite.addChild(g);
        this.obstacles.push(obs);
        this.obstacleLayer.addChild(obs.sprite);
    }

    update(deltaTime) {
        const dtSec = deltaTime / 60;
        this.runTimer += dtSec;

        // Position Alien Officer HUD card in top right
        this.alienCard.x = this.app.screen.width - 176;
        this.alienCard.y = 14;

        // 1. Process Keyboard Fallbacks (WASD / Arrow Keys)
        this.handleKeyboardInput();

        // 2. Player horizontal lane lerp
        this.player.x += (this.player.targetX - this.player.x) * 0.22;

        // 3. Player Jump physics
        if (this.player.isJumping) {
            this.player.jumpY += this.player.jumpVel * (deltaTime / 1.0);
            this.player.jumpVel += this.player.gravity * (deltaTime / 1.0);

            if (this.player.jumpY >= 0) {
                this.player.jumpY = 0;
                this.player.jumpVel = 0;
                this.player.isJumping = false;
            }
        }

        // 4. Player Duck state
        if (this.player.isDucking) {
            this.player.duckTimer -= dtSec;
            this.player.sprite.scale.set(1.1, 0.55);
            if (this.player.duckTimer <= 0) {
                this.player.isDucking = false;
                this.player.sprite.scale.set(1.0, 1.0);
            }
        } else if (!this.player.isJumping) {
            this.player.sprite.scale.set(1.0, 1.0);
        }

        // 5. Speed and Difficulty Escalation
        this.speed = Math.min(10.5, 5.2 + (this.runTimer / 12.0));
        this.spawnInterval = Math.max(1.1, 2.4 - (this.runTimer / 30.0));

        // 6. Spawn Obstacles
        this.spawnTimer += dtSec;
        if (!this.captureTriggered && this.spawnTimer >= this.spawnInterval) {
            this.spawnObstacle();
            this.spawnTimer = 0;
        }

        // 7. Update Obstacles and Check Collisions
        this.updateObstacles(deltaTime, dtSec);

        // 8. Eventual Capture Progression (~60s)
        this.handleCaptureProgression(dtSec);

        // 9. Update HUD labels
        this.player.score += Math.round(this.speed);
        this.statsText.text = `DISTANCE: ${this.player.score}M // SPEED: ${Math.round((this.speed / 5.2) * 100)}%`;

        if (this.commandFeedbackTimer > 0) {
            this.commandFeedbackTimer -= dtSec;
            if (this.commandFeedbackTimer <= 0) {
                this.cmdBadge.text = "VOICE INPUT: LISTENING... [KEYBOARD OVERRIDE ACTIVE]";
                this.cmdBadge.style.fill = "#34D399";
            }
        }

        // 10. Dialogue Timer
        if (this.dialogueTimer > 0) {
            this.dialogueTimer -= dtSec;
            if (this.dialogueTimer <= 0.4) {
                this.dialogueBox.alpha = Math.max(0, this.dialogueTimer / 0.4);
            }
            if (this.dialogueTimer <= 0) {
                this.dialogueBox.visible = false;
            }
        }

        // 11. Render Player Transform
        this.player.sprite.x = this.player.x;
        this.player.sprite.y = this.playerBaseY + this.player.jumpY;
    }

    handleKeyboardInput() {
        // Keyboard fallback allows full play without voice
        if (this.input.wasPressed("a") || this.input.wasPressed("A") || this.input.wasPressed("ArrowLeft")) {
            this.handleActionCommand("LEFT", "keyboard");
        }
        if (this.input.wasPressed("d") || this.input.wasPressed("D") || this.input.wasPressed("ArrowRight")) {
            this.handleActionCommand("RIGHT", "keyboard");
        }
        if (this.input.wasPressed("w") || this.input.wasPressed("W") || this.input.wasPressed("ArrowUp")) {
            this.handleActionCommand("JUMP", "keyboard");
        }
        if (this.input.wasPressed("s") || this.input.wasPressed("S") || this.input.wasPressed("ArrowDown")) {
            this.handleActionCommand("DUCK", "keyboard");
        }
    }

    updateObstacles(deltaTime, dtSec) {
        const moveStep = this.speed * (deltaTime / 1.0);

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.y += moveStep;

            const obsX = this.centerX + obs.lane * this.laneSpacing;
            obs.sprite.x = obsX;
            obs.sprite.y = obs.y;

            // Collision check with player
            const dy = Math.abs(obs.y - this.playerBaseY);
            if (dy < 24 && !obs.passed) {
                if (obs.lane === this.player.lane) {
                    let hit = false;
                    if (obs.type === "LOW" && (!this.player.isJumping || this.player.jumpY > -20)) {
                        hit = true;
                    } else if (obs.type === "HIGH" && !this.player.isDucking) {
                        hit = true;
                    } else if (obs.type.startsWith("WALL")) {
                        hit = true;
                    }

                    if (hit) {
                        obs.passed = true;
                        if (this.soundManager) this.soundManager.playCrash();
                        commentary.roast("SUBWAY_CRASH", {}, { textOnly: true });
                        // Flash red visual effect
                        this.player.sprite.alpha = 0.4;
                        setTimeout(() => { this.player.sprite.alpha = 1.0; }, 180);
                    }
                }
            }

            if (obs.y > this.app.screen.height + 60) {
                obs.passed = true;
                this.obstacleLayer.removeChild(obs.sprite);
                obs.sprite.destroy();
                this.obstacles.splice(i, 1);
            }
        }
    }

    handleCaptureProgression(dtSec) {
        if (this.roastCooldown > 0) this.roastCooldown -= dtSec;

        // Escalating dialogue milestones
        if (this.runTimer >= 20 && this.escalationStages.includes(20)) {
            this.escalationStages = this.escalationStages.filter((s) => s !== 20);
            commentary.say("You are doing surprisingly well. Transit speed increasing.", { force: true });
        } else if (this.runTimer >= 40 && this.escalationStages.includes(40)) {
            this.escalationStages = this.escalationStages.filter((s) => s !== 40);
            commentary.say("You appear to be improving... I dislike this development.", { force: true });
        } else if (this.runTimer >= 52 && this.escalationStages.includes(52)) {
            this.escalationStages = this.escalationStages.filter((s) => s !== 52);
            commentary.say("Warning: Maximum municipal speed reached. Dispatch intercepting.", { force: true });
        }

        // Eventual Capture at ~60s
        if (!this.captureTriggered && this.runTimer >= this.maxRunTime) {
            this.triggerCaptureEnding();
        }
    }

    triggerCaptureEnding() {
        this.captureTriggered = true;
        console.log("LEVEL 3 CAPTURED BY CENTRAL VIENIUM TRANSIT POLICE!");

        // Spawn Police Cruiser dropping in from above
        this.policeShip = new Container();
        const g = new Graphics();
        g.roundRect(-42, -26, 84, 52, 6);
        g.fill({ color: 0x1e293b });
        g.stroke({ color: 0x38bdf8, width: 3 });

        // Siren lights
        const siren = new Graphics();
        siren.circle(-16, -24, 6);
        siren.fill({ color: 0xef4444 });
        siren.circle(16, -24, 6);
        siren.fill({ color: 0x3b82f6 });
        g.addChild(siren);

        const policeText = new Text({
            text: "TRANSIT POLICE",
            style: { fontFamily: this.fontFamily, fontSize: 7, fill: "#38BDF8" },
        });
        policeText.anchor.set(0.5);
        g.addChild(policeText);

        this.policeShip.addChild(g);
        this.policeShip.x = this.player.x;
        this.policeShip.y = -80;
        this.policeLayer.addChild(this.policeShip);

        if (this.soundManager) {
            this.soundManager.playGoldenSpawn();
        }

        commentary.say("Enough. Central Vienium Transit Police has intercepted the runners!", { force: true });

        // Animate cruiser swooping down over player
        let t = 0;
        const catchAnim = () => {
            t += 0.04;
            this.policeShip.y += 6;
            this.policeShip.x += (this.player.x - this.policeShip.x) * 0.1;

            if (this.policeShip.y >= this.playerBaseY - 10) {
                this.app.ticker.remove(catchAnim);

                if (this.soundManager) {
                    this.soundManager.playLevelComplete();
                }

                setTimeout(() => {
                    this.onComplete();
                }, 2400);
            }
        };

        this.app.ticker.add(catchAnim);
    }

    destroy() {
        if (this.stopVoice) this.stopVoice();
        if (this.unsubscribeCommentary) this.unsubscribeCommentary();
        if (this.unsubscribeMouth) this.unsubscribeMouth();
        this.container.destroy({ children: true });
    }
}
