import { Container, AnimatedSprite, Graphics } from "pixi.js";

export class Player {
    constructor(textures = null) {
        this.sprite = new Container();

        // Giving player a collision radius
        this.radius = 30;

        // Visual ship view (AnimatedSprite or fallback Graphics)
        this.shipView = null;

        // Visual effect for power-up
        this.powerUpAura = new Graphics();
        this.powerUpAura.circle(0, 0, this.radius + 8);
        this.powerUpAura.stroke({ color: 0x38BDF8, width: 3 });
        this.powerUpAura.visible = false;

        if (textures && textures.length > 0) {
            this.setTextures(textures);
        } else {
            this.createFallbackGraphic();
        }

        this.sprite.addChild(this.powerUpAura);

        // Speed
        this.baseSpeed = 30;
        this.speed = this.baseSpeed;

        // Power-up state
        this.isPoweredUp = false;
    }

    createFallbackGraphic() {
        if (this.shipView) {
            this.sprite.removeChild(this.shipView);
            this.shipView.destroy();
        }
        const g = new Graphics();
        g.circle(0, 0, this.radius);
        g.fill("#22C55E");
        this.shipView = g;
        this.sprite.addChildAt(this.shipView, 0);
    }

    setTextures(textures) {
        if (!textures || textures.length === 0) return;
        if (this.shipView) {
            this.sprite.removeChild(this.shipView);
            this.shipView.destroy();
        }

        const anim = new AnimatedSprite(textures);
        anim.anchor.set(0.5);
        anim.animationSpeed = 0.12; // ~7 fps thruster flicker
        anim.play();

        // Scale to match collision radius (diameter ~68px)
        anim.width = 68;
        anim.height = 68;

        this.shipView = anim;
        this.sprite.addChildAt(this.shipView, 0);
    }

    // Update is a method that will be called every frame to update the player's position based on input
    update(input, deltaTime) {
        // Movement = speed * Time
        const movement = this.speed * deltaTime;

        // Player 1 Level 1 specific controls:
        // W = forward/up
        // A = left
        // ArrowDown = down
        // ArrowRight = right
        // Note: ArrowLeft is explicitly excluded from this layout.
        if (input.isDown("w") || input.isDown("W")) {
            this.sprite.y -= movement; // forward / up
        }

        if (input.isDown("ArrowDown")) {
            this.sprite.y += movement; // down
        }

        if (input.isDown("a") || input.isDown("A")) {
            this.sprite.x -= movement; // left
        }

        if (input.isDown("ArrowRight")) {
            this.sprite.x += movement; // right
        }

        // Pulse visual aura while power-up is active
        if (this.isPoweredUp) {
            this.powerUpAura.alpha = 0.7 + Math.sin(Date.now() * 0.008) * 0.3;
        }
    }


    // Temporary speed boost power-up
    activatePowerUp() {
        this.isPoweredUp = true;
        this.speed = this.baseSpeed * 1.75;
        this.powerUpAura.visible = true;
    }

    // Restore base speed and hide visual effect
    deactivatePowerUp() {
        this.isPoweredUp = false;
        this.speed = this.baseSpeed;
        this.powerUpAura.visible = false;
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

        // Check if the distance is less than the sum of the radii of the player and the other object
        return distance < this.radius + other.radius;
    }
}