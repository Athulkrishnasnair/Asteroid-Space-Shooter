import { Container, AnimatedSprite, Graphics } from "pixi.js";

export class Alien {
    constructor(x, y, textures = null) {
        this.sprite = new Container();
        this.sprite.x = x;
        this.sprite.y = y;

        // Radius for collision detection
        this.radius = 20;

        // Alien visual view (AnimatedSprite or fallback Graphics)
        this.alienView = null;

        if (textures && textures.length > 0) {
            this.setTextures(textures);
        } else {
            this.createFallbackGraphic();
        }

        // Speed
        this.speed = 2;

        // Direction modifier for orbit/flanking in final life (-1 or 1)
        this.orbitDirection = Math.random() < 0.5 ? 1 : -1;
    }

    createFallbackGraphic() {
        if (this.alienView) {
            this.sprite.removeChild(this.alienView);
            this.alienView.destroy();
        }
        const g = new Graphics();
        g.rect(
            -this.radius,
            -this.radius,
            this.radius * 2,
            this.radius * 2,
        );
        g.fill("#EF4444");
        this.alienView = g;
        this.sprite.addChild(this.alienView);
    }

    setTextures(textures) {
        if (!textures || textures.length === 0) return;
        if (this.alienView) {
            this.sprite.removeChild(this.alienView);
            this.alienView.destroy();
        }

        const anim = new AnimatedSprite(textures);
        anim.anchor.set(0.5);
        anim.animationSpeed = 0.08; // ~5 fps tentacle squirm and blink
        anim.play();

        // Scale to match collision radius (diameter ~54px)
        anim.width = 54;
        anim.height = 54;

        this.alienView = anim;
        this.sprite.addChild(this.alienView);
    }

    update(player, deltaTime) {
        //  Make the alien chase the player.
        // Find the difference in position between the alien and the player
        const dx = player.sprite.x - this.sprite.x;
        const dy = player.sprite.y - this.sprite.y;
        
        // Calculate the distance between the alien and the player
        // We use the Pythagorean theorem to calculate the distance between two points in 2D space
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Avoid division by zero
        // If alien is already at the player's position, we don't need to move it
        if (distance === 0) {
            return;
        }

        // Normalize the direction
        // Turns the dir into a value whose length is 1, so we can multiply it by the speed to get the movement vector
        const directionX = dx / distance;
        const directionY = dy / distance;

        // Calculate the movement based on speed and deltaTime
        const movement = this.speed * deltaTime;

        // Update the aliens position
        this.sprite.x += directionX * movement;
        this.sprite.y += directionY * movement;
    }

    // Separate final-life movement: never chases into player, orbits menacingly, guarantees distance >= safeDistance
    updateFinalLife(player, deltaTime, safeDistance) {
        const dx = this.sprite.x - player.sprite.x;
        const dy = this.sprite.y - player.sprite.y;
        const distance = Math.hypot(dx, dy);
        const movement = this.speed * deltaTime;

        // If alien is at the exact position of player, push outward immediately
        if (distance === 0) {
            const angle = Math.random() * Math.PI * 2;
            this.sprite.x = player.sprite.x + Math.cos(angle) * safeDistance;
            this.sprite.y = player.sprite.y + Math.sin(angle) * safeDistance;
            return;
        }

        // Outward unit vector from player to alien
        const outwardX = dx / distance;
        const outwardY = dy / distance;

        // Tangential unit vector for circling / orbiting movement around player
        const tangentX = -outwardY * this.orbitDirection;
        const tangentY = outwardX * this.orbitDirection;

        if (distance < safeDistance) {
            // Player moved rapidly into the safe zone:
            // Immediately push alien outward to safe distance plus tangential evasion
            this.sprite.x = player.sprite.x + outwardX * safeDistance + tangentX * movement;
            this.sprite.y = player.sprite.y + outwardY * safeDistance + tangentY * movement;
        } else if (distance > safeDistance + 50) {
            // Far away: approach toward the safe perimeter while blending tangent
            const approachX = -outwardX * 0.7 + tangentX * 0.3;
            const approachY = -outwardY * 0.7 + tangentY * 0.3;
            const approachLen = Math.hypot(approachX, approachY);

            const nextX = this.sprite.x + (approachX / approachLen) * movement;
            const nextY = this.sprite.y + (approachY / approachLen) * movement;

            // Check if next position would enter safe distance
            const nextDist = Math.hypot(nextX - player.sprite.x, nextY - player.sprite.y);
            if (nextDist < safeDistance) {
                const angle = Math.atan2(nextY - player.sprite.y, nextX - player.sprite.x);
                this.sprite.x = player.sprite.x + Math.cos(angle) * safeDistance;
                this.sprite.y = player.sprite.y + Math.sin(angle) * safeDistance;
            } else {
                this.sprite.x = nextX;
                this.sprite.y = nextY;
            }
        } else {
            // In the menacing orbit zone: circle around the player
            const nextX = this.sprite.x + tangentX * movement;
            const nextY = this.sprite.y + tangentY * movement;

            const nextDist = Math.hypot(nextX - player.sprite.x, nextY - player.sprite.y);
            const angle = Math.atan2(nextY - player.sprite.y, nextX - player.sprite.x);
            const clampedDist = Math.max(safeDistance, nextDist);

            this.sprite.x = player.sprite.x + Math.cos(angle) * clampedDist;
            this.sprite.y = player.sprite.y + Math.sin(angle) * clampedDist;
        }

        // Strict guarantee: distance(player, alien) >= safeDistance for every frame
        const finalDx = this.sprite.x - player.sprite.x;
        const finalDy = this.sprite.y - player.sprite.y;
        const finalDist = Math.hypot(finalDx, finalDy);
        if (finalDist < safeDistance) {
            const angle = finalDist > 0 ? Math.atan2(finalDy, finalDx) : Math.random() * Math.PI * 2;
            this.sprite.x = player.sprite.x + Math.cos(angle) * safeDistance;
            this.sprite.y = player.sprite.y + Math.sin(angle) * safeDistance;
        }
    }
}

export class GoldenAlien {
    constructor(x, y, textures = null) {
        this.sprite = new Container();
        this.sprite.x = x;
        this.sprite.y = y;

        this.radius = 25;
        this.goldView = null;

        if (textures && textures.length > 0) {
            this.setTextures(textures);
        } else {
            this.createFallbackGraphic();
        }

        this.time = 0;
        this.speed = 1.2; // Speed multiplier for predictable smooth path
    }

    createFallbackGraphic() {
        if (this.goldView) {
            this.sprite.removeChild(this.goldView);
            this.goldView.destroy();
        }
        const g = new Graphics();
        g.circle(0, 0, this.radius);
        g.fill("#D4AF37");
        g.stroke({ color: 0xFFFBEB, width: 3 });
        this.goldView = g;
        this.sprite.addChild(this.goldView);
    }

    setTextures(textures) {
        if (!textures || textures.length === 0) return;
        if (this.goldView) {
            this.sprite.removeChild(this.goldView);
            this.goldView.destroy();
        }

        const anim = new AnimatedSprite(textures);
        anim.anchor.set(0.5);
        anim.animationSpeed = 0.08; // ~5 fps alien pilot expression and blue flame
        anim.play();

        // Scale to match collision radius (diameter ~68px)
        anim.width = 68;
        anim.height = 68;

        this.goldView = anim;
        this.sprite.addChild(this.goldView);
    }

    update(deltaTime, player, screenWidth, screenHeight) {
        // Increment time in seconds for framerate independence
        this.time += deltaTime / 60;

        // Deliberate, predictable Lissajous / figure-8 pattern across the playable area
        const centerX = screenWidth / 2;
        const centerY = Math.min(220, screenHeight * 0.3);
        const rangeX = Math.max(120, screenWidth * 0.35);
        const rangeY = 65;

        let targetX = centerX + Math.sin(this.time * this.speed) * rangeX;
        let targetY = centerY + Math.sin(this.time * this.speed * 2) * rangeY;

        // Keep away from directly overlapping the player
        if (player && player.sprite) {
            const dx = targetX - player.sprite.x;
            const dy = targetY - player.sprite.y;
            const dist = Math.hypot(dx, dy);
            const minSafeDist = this.radius + player.radius + 35;

            if (dist < minSafeDist && dist > 0) {
                targetX = player.sprite.x + (dx / dist) * minSafeDist;
                targetY = player.sprite.y + (dy / dist) * minSafeDist;
            }
        }

        // Clamp to screen bounds
        this.sprite.x = Math.max(this.radius, Math.min(targetX, screenWidth - this.radius));
        this.sprite.y = Math.max(this.radius, Math.min(targetY, screenHeight - this.radius));
    }

    destroy() {
        this.sprite.destroy();
    }
}