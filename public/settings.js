// Global Configuration
const CONFIG = {
    // World
    WORLD_SIZE: 60,
    BLOCK_SIZE: 5,
    
    // Spawn point (center of world, above ground)
    get SPAWN_X() { return (this.WORLD_SIZE * this.BLOCK_SIZE) / 2; },
    get SPAWN_Z() { return (this.WORLD_SIZE * this.BLOCK_SIZE) / 2; },
    SPAWN_Y_OFFSET: 20, // Extra height above ground at spawn
    
    // Rendering
    VIEW_DISTANCE: 250,
    FOG_NEAR: 100,
    FOG_FAR: 250,
    FOG_COLOR: 0xcccccc,
    
    // Physics
    GRAVITY: 0.03,
    JUMP_FORCE: 0.6,
    SPEED: 0.6,
    
    // Player
    PLAYER_HEIGHT: 8,
    PLAYER_WIDTH: 4,
    
    // Terrain generation (Perlin noise)
    TERRAIN_SCALE: 0.08,      // Lower = smoother, larger features
    TERRAIN_HEIGHT: 4,        // Max height in blocks
    TERRAIN_OCTAVES: 3,       // Detail levels
    TERRAIN_PERSISTENCE: 0.5, // How much each octave contributes
    
    // Mouse sensitivity
    MOUSE_SENSITIVITY: 0.002
};
