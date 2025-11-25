const World = {
    // Store height data for physics to check collisions
    heightMap: [],

    generate: function(scene) {
        console.log("Generating Terrain...");
        
        const geometry = new THREE.BoxGeometry(CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE);
        const material = new THREE.MeshLambertMaterial({ color: 0x228B22 }); // Grass Green
        
        // Pseudo-random number generator (Deterministic)
        let seed = 12345;
        const rnd = () => { var x = Math.sin(seed++) * 10000; return x - Math.floor(x); }

        // Initialize empty map
        this.heightMap = [];

        for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
            this.heightMap[x] = [];
            for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
                // Generate random height (1 to 4 blocks high)
                let h = Math.floor(rnd() * 3) + 1; 
                
                // Store height for physics (Real world Y coordinate)
                this.heightMap[x][z] = h * CONFIG.BLOCK_SIZE;

                // Stack blocks visually
                for(let y = 0; y < h; y++) {
                    const cube = new THREE.Mesh(geometry, material);
                    cube.position.set(
                        x * CONFIG.BLOCK_SIZE, 
                        y * CONFIG.BLOCK_SIZE, 
                        z * CONFIG.BLOCK_SIZE
                    );
                    scene.add(cube);
                }
            }
        }
    },

    // Helper to get ground height at specific grid coordinates
    getGroundHeight: function(x, z) {
        if (x < 0 || x >= CONFIG.WORLD_SIZE || z < 0 || z >= CONFIG.WORLD_SIZE) {
            return -999; // Out of bounds (Fall)
        }
        return (this.heightMap[x][z] || 0);
    }
};