import { Graphics } from "pixi.js";

export class Alien {
    constructor(x, y) {
        // Setup the alien's sprite using PIXI Graphics

        // Alien placeholder
        this.sprite = new Graphics();

        // Radius for collision detection
        this.radius = 20;

        this.sprite.rect(
            -this.radius,
            -this.radius,
            this.radius * 2,
            this.radius * 2,
        );

        this.sprite.fill("#EF4444");

        this.sprite.x = x;
        this.sprite.y = y;

        // Speed
        this.speed = 2;

        
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
}