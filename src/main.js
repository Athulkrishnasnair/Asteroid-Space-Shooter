import { Game } from "./game/Game.js";
import { FaceTracker } from "./cv/FaceTracker.js";
import { SceneManager } from "./game/SceneManager.js";
import { startIntro } from "./style.js";
import { voice } from "./services/voice.js";

const game = new Game();

// Face Tracking
const faceTracker = new FaceTracker({
    onResults: (result) => {
        if (!result.offline && result.faceCount > 0) {
            // Debug metrics for testing
        }
    }
});

// Scene State Machine
const sceneManager = new SceneManager({
    game,
    faceTracker,
});

// Start camera/tracking and verify backend early during intro
faceTracker.start();
voice.checkHealth().then((online) => {
    console.log(`[Alien Game] Central Vienium Backend is ${online ? "ONLINE" : "OFFLINE (Local Fallback Active)"}`);
});

// Intro transmission leads directly into Pixi gameplay
startIntro({
    onComplete: async () => {
        await game.start();
        sceneManager.init();
        sceneManager.changeScene("LEVEL1");
    }
});