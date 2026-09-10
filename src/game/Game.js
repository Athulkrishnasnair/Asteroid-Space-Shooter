import { Application, Container, Text, Assets, Sprite, Texture, Rectangle, Graphics } from "pixi.js";
import { Player } from "../entities/Player.js";
import { Input } from "./Input.js";
import { Alien } from "../entities/Alien.js";
import { Bullet } from "../entities/Bullet.js";

export class Game {
    constructor() {
        this.app = new Application();
        this.input = new Input();

        this.world = new Container();
        this.player = new Player();

        // Adding alien to the game world
        this.aliens = [];

        this.aliens.push(new Alien(100, 200));
        this.aliens.push(new Alien(400, 300));
        this.aliens.push(new Alien(600, 100));
    
        // Adding bullets to the game world
        this.bullets = [];

        // Adding a score property to keep track of the player's score
        this.score = 0;
        this.scoreText = new Text({
                    text: "Score: 0",
                    style: {
                        fontSize: 24,
                        fill: "white",
                    },
                });
        
        // Spawn Timer for aliens
        this.spawnTimer = 0;
        this.spawnTimerMax = 2; // Spawn a new alien every 2 seconds
           
        // Game over 
        this.gameOver = false;
        this.gameOverText = new Text({
            text: "GAME OVER\n Press R to restart",
            style: {
                fontSize: 50,
                fill: "white",
                align: "center",
            }
        });
    
        // Anchor the text
        this.gameOverText.anchor.set(0.5);
        this.gameOverText.visible = false;

        // Crosshair
        this.mouse = {
            x: 0,
            y: 0,
        }
    }

    async start() {
        await this.app.init({
            resizeTo: window,
            background: "#111827",
        });

        // Bg
        // const characterSheet = await Assets.load("/src/assets/ch.png")

        // const charTex = new Texture({
        //     source: characterSheet.source,
        //     frame: {
        //         x: 0,
        //         y: 0,
        //         width: 8,
        //         height: 8,
        //     }
        // })

        // this.testChar = new Sprite(charTex)
        // this.testChar.x = 100;
        // this.testChar.y = 100;

        // // Visible
        // this.testChar.scale.set(8);

        // this.app.stage.addChild(this.testChar);

        document.body.appendChild(this.app.canvas);

        // Mouse crosshair
        this.app.canvas.addEventListener("mousemove", (e) => {
            const rect = this.app.canvas.getBoundingClientRect();
            
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        })

        // Croshbar
        this.crosshair = new Graphics();
        this.crosshair.circle(0, 0, 10);
        this.crosshair.stroke({
            color: 0xffffff,
            with: 2
        })

        this.app.stage.addChild(this.crosshair);
        this.app.stage.addChild(this.world);
        this.app.stage.addChild(this.scoreText);

        this.setupPlayer();
        this.setupAlien();

        // Game over
         this.app.stage.addChild(this.gameOverText);
         this.gameOverText.x = this.app.screen.width / 2;
         this.gameOverText.y = this.app.screen.height / 2;        

        this.app.ticker.add((ticker) => {
            this.update(ticker.deltaTime);
        });
    }

    // Initialize the player and add it to the game world
    setupPlayer() {
        this.player.sprite.x = this.app.screen.width / 2;
        this.player.sprite.y = this.app.screen.height / 2;

        this.world.addChild(this.player.sprite);
    }

    // Iniialize the alien and add it to the game world
    setupAlien() {
        for (const alien of this.aliens) {
            this.world.addChild(alien.sprite);
        }
    }

    // Shoot a bullet from the player's position
    shoot() {
        const bullet = new Bullet(
            this.player.sprite.x,
            this.player.sprite.y,
            this.mouse.x,
            this.mouse.y
        );

        this.bullets.push(bullet);

        this.world.addChild(bullet.sprite);
    }

    // Remove a bullet from the game world and the bullets array
    removeBullet(bullet) {

        // Remoce the bullet's sprite from the world
        this.world.removeChild(bullet.sprite);;

        // Destroy the bullet's sprite to free up resources
        bullet.sprite.destroy();

        // Remove the bullet from the bullets array
        const index = this.bullets.indexOf(bullet);
        if (index !== -1) {
             this.bullets.splice(index, 1);
     }        
    }

    // Remove an alien from the game world and the aliens array
    removeAlien(alien) {
        // Remove the alien's sprite from the world
        this.world.removeChild(alien.sprite);

        // Destroy the alien's sprite to free up resources
        alien.sprite.destroy();

        // Remove the aliens array
        const index = this.aliens.indexOf(alien);
        if (index !== -1) {
            this.aliens.splice(index, 1);
        }

    }

    // Spwan alien
    spawnAlien() {
        // const x = Math.random() * this.app.screen.width;
        // const y = Math.random() * this.app.screen.height;

        let x;
        let y;

        const side = Math.floor(Math.random() * 4);

        if (side === 0) {
            // Top
            x = Math.random() * this.app.screen.width;
            y = -50
        } else if (side === 1) {
        // Right
        x = this.app.screen.width + 50;
        y = Math.random() * this.app.screen.height;
        } else if (side === 2) {
            // Bottom
            x = Math.random() * this.app.screen.width;
            y = this.app.screen.height + 50;
        } else {
            // Left
            x = -50;
            y = Math.random() * this.app.screen.height;
        }

        const alien = new Alien(x, y);

        this.aliens.push(alien);
        this.world.addChild(alien.sprite);
    }

    // Restart Game
    restart() {
        this.gameOver = false;
        this.score = 0;
        this.scoreText.text = "Score: 0";
        
        this.gameOverText.visible = false;

        // Put player back in center
        this.player.sprite.x = this.app.screen.width / 2;
        this.player.sprite.y = this.app.screen.height / 2;

        // Remove existing aliens
        for (const alien of [...this.aliens]) {
            this.removeAlien(alien);
        }

        // Remove Bullets
        for (const bullet of [...this.bullets]) {
            this.removeBullet(bullet);
        }
        // Reset spawn timer
        this.spawnTimer = 0;

        // Add a few starting aliens
         this.aliens.push(new Alien(-100, 200));
            this.aliens.push(new Alien(400, 300));
            this.aliens.push(new Alien(600, 100));

        this.setupAlien();
    }

    // Game logic update method, called every frame by the ticker
    // Take the Player object stored in my Game's player property, and call its update method
    update(deltaTime) {
        // Restart game
        if (this.gameOver) {
            if (this.input.wasPressed("r")) {
                this.restart();
            }
            
            return;
        }

        // Checking game over state
        if (this.gameOver) {
            return;
        }


        // Croshari
        this.crosshair.x = this.mouse.x;
        this.crosshair.y = this.mouse.y;

         // Update the spawn timer
            this.spawnTimer += deltaTime;

            if (this.spawnTimer > 120) {
                this.spawnAlien();
                this.spawnTimer = 0;
            }


        // Update the player based on input and deltaTime
        this.player.update(this.input, deltaTime);

        this.player.clampToScreen(
            this.app.screen.width,
            this.app.screen.height
        );

        // Shoot a bullet when the spacebar is pressed
        if (this.input.wasPressed(" ")) {
            this.shoot();
        }
       for (const alien of this.aliens) {
        // Move alien towards the player
            alien.update(this.player, deltaTime);

            // Check for collision between the player and the alien
            if (this.player.isColliding(alien)) {
                // console.log("Collision detected!",
                //     "COLLISION",
                //     "player:", this.player.sprite.x, this.player.sprite.y,
                //     "alien:", alien.sprite.x, alien.sprite.y
                // );

                this.gameOver = true;
                this.gameOverText.visible = true;
        }
        }
       
        // Bullets
        for (const bullet of [...this.bullets]) {
            
            // Move bullet upwards
            bullet.update(deltaTime);
            
            // Check for collision between the bullet and each alien
            for (const alien of [...this.aliens]) {
                if (bullet.isColliding(alien)) {
                    console.log("Bullet hit alien!");

                    this.score += 100;
                    this.scoreText.text = `Score: ${this.score}`;
                    // Remove the alien and bullet from the game world
                    this.removeAlien(alien);
                    this.removeBullet(bullet);

                    // Break the loop since the bullet is removed
                    break;
                }
            }
        
        
        }

       

        // Clear the justPressedKeys set at the end of each frame
        this.input.update();
}

   

}
