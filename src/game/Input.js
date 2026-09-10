export class Input {
    constructor() {
        // Keys will be stored in a Set for efficient lookup
        this.keys = new Set();

        // Keys pressed during the current frame will be stored in a separate Set
        this.justPressedKeys = new Set();

        // Add event listeners for keydown and keyup events
        window.addEventListener('keydown', (event) => {
           
            // Only add the key to justPressedKeys if it wasn't already pressed
            if (!this.keys.has(event.key)) {
                this.justPressedKeys.add(event.key);
            }
           
            this.keys.add(event.key)
        });

        // Keyup event listener to remove keys from the pressed set when they are released
        window.addEventListener('keyup', (event) => {
            this.keys.delete(event.key)
        })
    }

    // Method to check if a key is currently pressed
    isDown(key) {
        return this.keys.has(key);
    }

    // Method to check if a key was just pressed during the current frame
    wasPressed(key) {
        return this.justPressedKeys.has(key);
    }

    // Method to clear the justPressedKeys set at the end of each frame
    update() {
        this.justPressedKeys.clear();
    }
}