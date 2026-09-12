import { Container, Sprite, Graphics } from "pixi.js";

export class Bullet {
    constructor(x, y, tarX, tarY, texture = null) {
        // Radius for collision detection
        this.radius = 5;

        this.sprite = new Container();
        this.sprite.x = x;
        this.sprite.y = y;

        // Speed
        this.speed = 8;

        // Direction toward mouse
        const dx = tarX - x;
        const dy = tarY - y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        this.directionX = dx / distance;
        this.directionY = dy / distance;

        // Visual view (glowing energy sprite or fallback Graphics circle)
        if (texture) {
            const s = new Sprite(texture);
            s.anchor.set(0.5);
            s.width = 16;
            s.height = 16;
            s.rotation = Math.atan2(this.directionY, this.directionX);
            this.sprite.addChild(s);
        } else {
            const g = new Graphics();
            g.circle(0, 0, this.radius);
            g.fill("#FBBF24");
            this.sprite.addChild(g);
        }
    }

    // Check collision with another object (like an alien)
    isColliding(other) {
        const dx = this.sprite.x - other.sprite.x;;
        const dy = this.sprite.y - other.sprite.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        return distance < this.radius + other.radius;
    }

    update(deltaTime) {
        // Move the bullet upwards
        const movement = this.speed * deltaTime;

        // mouse
        this.sprite.x += this.directionX * movement;
        this.sprite.y += this.directionY * movement;
    }
}