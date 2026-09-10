import { Graphics } from "pixi.js";

export class Bullet {
    constructor(x, y, tarX, tarY) {
        
        // Radius for collision detection
        this.radius = 5;

        this.sprite = new Graphics();
        this.sprite.circle(0, 0, this.radius);
        this.sprite.fill("#FBBF24");

        this.sprite.x = x;
        this.sprite.y = y;

        // Speed
        this.speed = 8;

        // Direction toward mouse
        const dx = tarX - x;
        const dy = tarY - y;

        const distance = Math.sqrt(dx * dx + dy * dy);

        this.directionX = dx / distance;
        this.directionY = dy / distance;

      
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