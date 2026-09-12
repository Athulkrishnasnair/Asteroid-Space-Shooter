// src/game/TrackingHUD.js
// Pixel-art styled biometric observation HUD for 2 players.
// Samples from the FaceTracker webcam stream without creating duplicate streams.
// Implements instant fallback if vision is offline or players are not detected.

export class TrackingHUD {
    constructor({ faceTracker, onManualOverride }) {
        this.faceTracker = faceTracker;
        this.onManualOverride = onManualOverride || (() => {});
        this.container = null;
        this.canvas1 = null;
        this.canvas2 = null;
        this.ctx1 = null;
        this.ctx2 = null;
        this.statusText = null;
        this.facingBadge = null;
        this.p1Badge = null;
        this.p2Badge = null;
        this.syncBar = null;
        this.syncContainer = null;

        this.latestResults = {
            faceCount: 0,
            player1: { visible: false, direction: "CENTER" },
            player2: { visible: false, direction: "CENTER" },
            facingEachOther: false,
            offline: false,
        };

        this.syncProgress = 0; // 0 to 1
        this.rafId = null;
        this.mount();
    }

    mount() {
        if (document.getElementById("alien-tracking-hud")) return;

        const hud = document.createElement("div");
        hud.id = "alien-tracking-hud";
        hud.className = "tracking-hud pixel-border";
        hud.setAttribute("role", "region");
        hud.setAttribute("aria-label", "Alien Observation Panel");

        hud.innerHTML = `
            <div class="tracking-hud__header">
                <span class="tracking-hud__title">ALIEN OBSERVATION // BIOMETRIC LINK</span>
                <span class="tracking-hud__vision-state" id="hud-vision-state">VISION: INITIALIZING</span>
            </div>

            <div class="tracking-hud__panels">
                <!-- Player 1 Observation Box -->
                <div class="tracking-card">
                    <div class="tracking-card__header">
                        <span>P1: PILOT [WASD]</span>
                        <span class="tracking-card__dir" id="hud-p1-dir">CENTER</span>
                    </div>
                    <div class="tracking-card__viewport">
                        <canvas id="hud-canvas-p1" width="140" height="105" class="tracking-canvas"></canvas>
                        <div class="tracking-card__overlay-grid"></div>
                        <div class="tracking-card__status" id="hud-p1-status">SEARCHING...</div>
                    </div>
                </div>

                <!-- Player 2 Observation Box -->
                <div class="tracking-card">
                    <div class="tracking-card__header">
                        <span>P2: GUNNER [ARROWS]</span>
                        <span class="tracking-card__dir" id="hud-p2-dir">CENTER</span>
                    </div>
                    <div class="tracking-card__viewport">
                        <canvas id="hud-canvas-p2" width="140" height="105" class="tracking-canvas"></canvas>
                        <div class="tracking-card__overlay-grid"></div>
                        <div class="tracking-card__status" id="hud-p2-status">SEARCHING...</div>
                    </div>
                </div>
            </div>

            <!-- Facing State & Exit Sync Indicator -->
            <div class="tracking-hud__footer">
                <div class="tracking-facing" id="hud-facing-badge">
                    <span class="tracking-facing__icon">◉</span>
                    <span class="tracking-facing__text" id="hud-facing-text">AWAITING FACING SYNCHRONIZATION</span>
                </div>
                <div class="tracking-sync" id="hud-sync-container" style="display: none;">
                    <span class="tracking-sync__label">GATEWAY SYNC:</span>
                    <div class="tracking-sync__bar">
                        <div class="tracking-sync__fill" id="hud-sync-fill" style="width: 0%;"></div>
                    </div>
                    <span class="tracking-sync__percent" id="hud-sync-percent">0%</span>
                </div>
            </div>
        `;

        document.body.appendChild(hud);

        this.container = hud;
        this.canvas1 = document.getElementById("hud-canvas-p1");
        this.canvas2 = document.getElementById("hud-canvas-p2");
        this.ctx1 = this.canvas1.getContext("2d");
        this.ctx2 = this.canvas2.getContext("2d");

        this.statusText = document.getElementById("hud-vision-state");
        this.facingBadge = document.getElementById("hud-facing-badge");
        this.facingText = document.getElementById("hud-facing-text");
        this.p1Dir = document.getElementById("hud-p1-dir");
        this.p2Dir = document.getElementById("hud-p2-dir");
        this.p1Status = document.getElementById("hud-p1-status");
        this.p2Status = document.getElementById("hud-p2-status");
        this.syncContainer = document.getElementById("hud-sync-container");
        this.syncFill = document.getElementById("hud-sync-fill");
        this.syncPercent = document.getElementById("hud-sync-percent");

        this.startRenderLoop();
    }

    updateResults(results) {
        if (!results) return;
        this.latestResults = results;

        // Update Vision state tag
        if (results.offline) {
            this.statusText.textContent = "VISION: OFFLINE (MANUAL MODE)";
            this.statusText.className = "tracking-hud__vision-state tracking-hud__vision-state--offline";
            this.facingBadge.className = "tracking-facing tracking-facing--offline";
            this.facingText.textContent = "VISION LINK UNSTABLE — MANUAL NAVIGATION ENABLED";
            this.p1Status.textContent = "MANUAL";
            this.p2Status.textContent = "MANUAL";
            return;
        }

        this.statusText.textContent = "VISION: ONLINE";
        this.statusText.className = "tracking-hud__vision-state tracking-hud__vision-state--online";

        // Update Player 1 tags
        if (results.player1 && results.player1.visible) {
            this.p1Dir.textContent = results.player1.direction || "CENTER";
            this.p1Status.textContent = "LOCKED";
            this.p1Status.className = "tracking-card__status tracking-card__status--locked";
        } else {
            this.p1Dir.textContent = "---";
            this.p1Status.textContent = "NOT DETECTED";
            this.p1Status.className = "tracking-card__status tracking-card__status--lost";
        }

        // Update Player 2 tags
        if (results.player2 && results.player2.visible) {
            this.p2Dir.textContent = results.player2.direction || "CENTER";
            this.p2Status.textContent = "LOCKED";
            this.p2Status.className = "tracking-card__status tracking-card__status--locked";
        } else {
            this.p2Dir.textContent = "---";
            this.p2Status.textContent = results.faceCount === 1 ? "PLAYER 2 NOT DETECTED" : "NOT DETECTED";
            this.p2Status.className = "tracking-card__status tracking-card__status--lost";
        }

        // Update Consensus / Facing State
        if (results.facingEachOther) {
            this.facingBadge.className = "tracking-facing tracking-facing--active";
            this.facingText.textContent = "◉ MUTUAL EYE CONTACT // GATEWAY SYNCHRONIZING";
        } else if (results.agreedDirection === "DISAGREED") {
            this.facingBadge.className = "tracking-facing tracking-facing--warning";
            this.facingText.textContent = `▲ DISAGREEMENT: STOPPED [P1: ${results.player1.direction || "?"} | P2: ${results.player2.direction || "?"}]`;
        } else if (results.agreedDirection && results.agreedDirection !== "CENTER") {
            this.facingBadge.className = "tracking-facing tracking-facing--active";
            this.facingText.textContent = `◉ CONSENSUS: [${results.agreedDirection}] // STEERING SHARED VESSEL`;
        } else if (results.faceCount < 2) {
            this.facingBadge.className = "tracking-facing tracking-facing--searching";
            this.facingText.textContent = "◎ POSITION BOTH PLAYERS IN WEBCAM VIEW";
        } else {
            this.facingBadge.className = "tracking-facing tracking-facing--searching";
            this.facingText.textContent = "● TURN HEADS TOGETHER TO STEER (OR USE WASD / ARROWS)";
        }
    }


    setSyncProgress(progress, visible = true) {
        this.syncProgress = Math.max(0, Math.min(1, progress));
        if (this.syncContainer) {
            this.syncContainer.style.display = visible ? "flex" : "none";
            const pct = Math.round(this.syncProgress * 100);
            this.syncFill.style.width = `${pct}%`;
            this.syncPercent.textContent = `${pct}%`;
        }
    }

    startRenderLoop() {
        const render = () => {
            this.drawViewports();
            this.rafId = requestAnimationFrame(render);
        };
        this.rafId = requestAnimationFrame(render);
    }

    drawViewports() {
        const video = this.faceTracker ? this.faceTracker.getVideoElement() : null;
        const p1 = this.latestResults.player1;
        const p2 = this.latestResults.player2;

        this.renderPlayerCanvas(this.ctx1, this.canvas1, video, p1, 0, "#22C55E");
        this.renderPlayerCanvas(this.ctx2, this.canvas2, video, p2, 1, "#FBBF24");
    }

    renderPlayerCanvas(ctx, canvas, video, player, index, themeColor) {
        if (!ctx || !canvas) return;

        const w = canvas.width;
        const h = canvas.height;

        ctx.fillStyle = "#0a0e14";
        ctx.fillRect(0, 0, w, h);

        const hasVideo = video && video.readyState >= 2 && !this.latestResults.offline;

        if (hasVideo) {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;

            if (player && player.visible && player.box) {
                // Smooth crop around the player's detected face box
                const b = player.box;
                const padX = b.width * 0.45;
                const padY = b.height * 0.45;
                const srcX = Math.max(0, (b.minX - padX) * vw);
                const srcY = Math.max(0, (b.minY - padY) * vh);
                const srcW = Math.min(vw - srcX, (b.width + padX * 2) * vw);
                const srcH = Math.min(vh - srcY, (b.height + padY * 2) * vh);

                ctx.save();
                ctx.imageSmoothingEnabled = false; // Pixel-art aesthetic
                ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, w, h);
                ctx.restore();

                // Draw pixel-art targeting bracket around face
                ctx.strokeStyle = themeColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(8, 8, w - 16, h - 16);

                // Small crosshair tick marks
                ctx.beginPath();
                ctx.moveTo(w / 2 - 6, h / 2);
                ctx.lineTo(w / 2 + 6, h / 2);
                ctx.moveTo(w / 2, h / 2 - 6);
                ctx.lineTo(w / 2, h / 2 + 6);
                ctx.stroke();
            } else {
                // Face not detected yet: show mirrored half of video or static
                const halfW = vw / 2;
                const startX = index === 0 ? 0 : halfW;
                ctx.save();
                ctx.filter = "grayscale(80%) brightness(0.6)";
                ctx.drawImage(video, startX, 0, halfW, vh, 0, 0, w, h);
                ctx.restore();

                // Draw scanning line
                const scanY = (Date.now() / 15) % h;
                ctx.fillStyle = "rgba(74, 139, 139, 0.3)";
                ctx.fillRect(0, scanY, w, 2);
            }
        } else {
            // Retro radar / offline static screen
            this.drawNoise(ctx, w, h);
            ctx.fillStyle = "#EF4444";
            ctx.font = "10px 'Press Start 2P', monospace";
            ctx.textAlign = "center";
            ctx.fillText(
                this.latestResults.offline ? "MANUAL" : "NO SIGNAL",
                w / 2,
                h / 2
            );
        }
    }

    drawNoise(ctx, w, h) {
        const imgData = ctx.createImageData(w, h);
        const buffer = new Uint32Array(imgData.data.buffer);
        for (let i = 0; i < buffer.length; i++) {
            if (Math.random() < 0.08) {
                buffer[i] = 0xff3d4652;
            } else {
                buffer[i] = 0xff05070a;
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    show() {
        if (this.container) this.container.style.display = "flex";
    }

    hide() {
        if (this.container) this.container.style.display = "none";
    }

    destroy() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        if (this.container) this.container.remove();
        this.container = null;
    }
}
