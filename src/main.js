import { Game } from "./game/Game.js";
import { FaceTracker } from "./cv/FaceTracker.js";
import { startIntro } from "./style.js";

const game = new Game();

// Face Tracking
// Facetracker now sends faceCount, player direction, visible
const faceTracker = new FaceTracker({
    onResults: (result) => {
        console.log("Face count:", result.faceCount);
        console.log("Player 1:", result.player1.direction);
        console.log("Player 2:", result.player2.direction);
        console.log("Facing each other:", result.facingEachOther);
    }
});

// Start the camera/tracking immediately so it's warmed up by the time
// the intro finishes. Gameplay itself only starts once the intro
// transmission sequence completes (either choice leads here).
faceTracker.start();

startIntro({
    onComplete: () => {
        game.start();
    }
});