import { Graphics } from "pixi.js";

export class Player {
    constructor() {
        this.sprite = new Graphics();

         // Giving player a radius
        this.radius = 30;
        this.sprite.circle(0, 0, this.radius);
        this.sprite.fill("#22C55E")

        // Speed
        this.speed = 30;

       
    }

    // Update is a method that will be called every frame to update the player's position based on input
    update(input, deltaTime) {
        // Movement = speed * Time

        const movement = this.speed * deltaTime;

        // Move player based on input
        if (input.isDown("w")) {
            this.sprite.y -= movement;
        }

        if (input.isDown("s")) {
            this.sprite.y += movement;
        }

        if (input.isDown("a")) {
            this.sprite.x -= movement;
        }

        if (input.isDown("d")) {
            this.sprite.x += movement;
        }
    }

    clampToScreen(screenWidth, screenHeight) {
        // const radius = 30; // Assuming the player is a circle with a radius of 30

        this.sprite.x = Math.max(
            this.radius, 
            Math.min(this.sprite.x, screenWidth - this.radius)
        );

        this.sprite.y = Math.max(
            this.radius, 
            Math.min(this.sprite.y, screenHeight - this.radius)
        );
    }

    // Collision detection method to check if the player collides with an alien
    isColliding(other) {
        // Distance between the centers of the player and the other object
        const dx = this.sprite.x - other.sprite.x;
        const dy = this.sprite.y - other.sprite.y;

        // Pythagorean theorem to calculate the distance between two points in 2D space
        const distance = Math.sqrt(dx * dx + dy * dy);

         console.log(
        "distance:", distance,
        "player radius:", this.radius,
        "alien radius:", other.radius,
        "allowed:", this.radius + other.radius
    );
        // Check if the distance is less than the sum of the radii of the player and the other object
        return distance < this.radius + other.radius;
    }
}
