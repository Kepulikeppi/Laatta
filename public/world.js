// Perlin Noise implementation
const Noise = {
    // Permutation table
    p: [],
    
    init: function(seed) {
        // Initialize permutation table with seed
        const perm = [];
        for (let i = 0; i < 256; i++) perm[i] = i;
        
        // Shuffle using seed
        let s = seed || 12345;
        const random = () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
        
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        
        // Duplicate for overflow
        this.p = new Array(512);
        for (let i = 0; i < 512; i++) {
            this.p[i] = perm[i & 255];
        }
    },
    
    fade: function(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    },
    
    lerp: function(a, b, t) {
        return a + t * (b - a);
    },
    
    grad: function(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    },
    
    perlin2D: function(x, y) {
        // Find unit square
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        
        // Relative position in square
        x -= Math.floor(x);
        y -= Math.floor(y);
        
        // Fade curves
        const u = this.fade(x);
        const v = this.fade(y);
        
        // Hash corners
        const A = this.p[X] + Y;
        const B = this.p[X + 1] + Y;
        
        // Blend
        return this.lerp(
            this.lerp(this.grad(this.p[A], x, y), this.grad(this.p[B], x - 1, y), u),
            this.lerp(this.grad(this.p[A + 1], x, y - 1), this.grad(this.p[B + 1], x - 1, y - 1), u),
            v
        );
    },
    
    // Fractal Brownian Motion - multiple octaves of noise
    fbm: function(x, y, octaves, persistence) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            total += this.perlin2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        
        return total / maxValue;
    }
};

const World = {
    // Store height data for physics
    heightMap: [],
    
    // Store mesh for cleanup
    terrainMesh: null,
    
    generate: function(scene) {
        console.log("Generating Terrain with Perlin noise...");
        
        // Initialize noise
        Noise.init(12345);
        
        // Initialize height map
        this.heightMap = [];
        
        // Count total blocks needed
        let totalBlocks = 0;
        const blockHeights = [];
        
        for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
            this.heightMap[x] = [];
            blockHeights[x] = [];
            
            for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
                // Generate height using Perlin noise
                const noiseValue = Noise.fbm(
                    x * CONFIG.TERRAIN_SCALE,
                    z * CONFIG.TERRAIN_SCALE,
                    CONFIG.TERRAIN_OCTAVES,
                    CONFIG.TERRAIN_PERSISTENCE
                );
                
                // Convert noise (-1 to 1) to block height (1 to TERRAIN_HEIGHT)
                const normalizedNoise = (noiseValue + 1) / 2; // 0 to 1
                const blockHeight = Math.floor(normalizedNoise * CONFIG.TERRAIN_HEIGHT) + 1;
                
                blockHeights[x][z] = blockHeight;
                this.heightMap[x][z] = blockHeight * CONFIG.BLOCK_SIZE;
                totalBlocks += blockHeight;
            }
        }
        
        console.log(`Total blocks: ${totalBlocks}`);
        
        // Create instanced mesh for performance
        const geometry = new THREE.BoxGeometry(CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE, CONFIG.BLOCK_SIZE);
        
        // Create material with vertex colors
        const material = new THREE.MeshLambertMaterial({ 
            vertexColors: false,
            color: 0x228B22
        });
        
        // Use merged geometry for better performance
        const mergedGeometry = new THREE.BufferGeometry();
        const positions = [];
        const normals = [];
        const colors = [];
        
        // Color palette for different heights
        const grassColor = new THREE.Color(0x228B22);  // Green
        const dirtColor = new THREE.Color(0x8B4513);   // Brown
        const stoneColor = new THREE.Color(0x808080); // Gray
        
        for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
            for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
                const maxHeight = blockHeights[x][z];
                
                for (let y = 0; y < maxHeight; y++) {
                    const worldX = x * CONFIG.BLOCK_SIZE;
                    const worldY = y * CONFIG.BLOCK_SIZE;
                    const worldZ = z * CONFIG.BLOCK_SIZE;
                    
                    // Determine color based on layer
                    let color;
                    if (y === maxHeight - 1) {
                        color = grassColor; // Top layer is grass
                    } else if (y >= maxHeight - 3) {
                        color = dirtColor;  // Next 2 layers are dirt
                    } else {
                        color = stoneColor; // Everything below is stone
                    }
                    
                    // Add cube faces (only visible ones for optimization)
                    this.addCube(positions, normals, colors, worldX, worldY, worldZ, color, x, y, z, blockHeights);
                }
            }
        }
        
        mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        mergedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const mergedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
        this.terrainMesh = new THREE.Mesh(mergedGeometry, mergedMaterial);
        scene.add(this.terrainMesh);
        
        console.log("Terrain generation complete!");
    },
    
    // Add only visible faces of a cube
    addCube: function(positions, normals, colors, x, y, z, color, gx, gy, gz, blockHeights) {
        const s = CONFIG.BLOCK_SIZE / 2;
        
        // Check neighbors to determine which faces to render
        const hasBlockAbove = gy < blockHeights[gx][gz] - 1;
        const hasBlockBelow = gy > 0;
        const hasBlockLeft = gx > 0 && gy < blockHeights[gx - 1][gz];
        const hasBlockRight = gx < CONFIG.WORLD_SIZE - 1 && gy < blockHeights[gx + 1][gz];
        const hasBlockFront = gz < CONFIG.WORLD_SIZE - 1 && gy < blockHeights[gx][gz + 1];
        const hasBlockBack = gz > 0 && gy < blockHeights[gx][gz - 1];
        
        // Top face (if no block above)
        if (!hasBlockAbove) {
            this.addFace(positions, normals, colors,
                x - s, y + s, z + s,  x + s, y + s, z + s,  x + s, y + s, z - s,  x - s, y + s, z - s,
                0, 1, 0, color
            );
        }
        
        // Bottom face (if no block below)
        if (!hasBlockBelow) {
            this.addFace(positions, normals, colors,
                x - s, y - s, z - s,  x + s, y - s, z - s,  x + s, y - s, z + s,  x - s, y - s, z + s,
                0, -1, 0, color
            );
        }
        
        // Front face (if no block in front)
        if (!hasBlockFront) {
            this.addFace(positions, normals, colors,
                x - s, y - s, z + s,  x + s, y - s, z + s,  x + s, y + s, z + s,  x - s, y + s, z + s,
                0, 0, 1, color
            );
        }
        
        // Back face (if no block behind)
        if (!hasBlockBack) {
            this.addFace(positions, normals, colors,
                x + s, y - s, z - s,  x - s, y - s, z - s,  x - s, y + s, z - s,  x + s, y + s, z - s,
                0, 0, -1, color
            );
        }
        
        // Right face (if no block to right)
        if (!hasBlockRight) {
            this.addFace(positions, normals, colors,
                x + s, y - s, z + s,  x + s, y - s, z - s,  x + s, y + s, z - s,  x + s, y + s, z + s,
                1, 0, 0, color
            );
        }
        
        // Left face (if no block to left)
        if (!hasBlockLeft) {
            this.addFace(positions, normals, colors,
                x - s, y - s, z - s,  x - s, y - s, z + s,  x - s, y + s, z + s,  x - s, y + s, z - s,
                -1, 0, 0, color
            );
        }
    },
    
    addFace: function(positions, normals, colors, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, nx, ny, nz, color) {
        // Triangle 1
        positions.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);
        // Triangle 2
        positions.push(x1, y1, z1, x3, y3, z3, x4, y4, z4);
        
        // Normals for both triangles (6 vertices)
        for (let i = 0; i < 6; i++) {
            normals.push(nx, ny, nz);
            colors.push(color.r, color.g, color.b);
        }
    },
    
    // Get ground height at world coordinates
    getGroundHeight: function(worldX, worldZ) {
        const gx = Math.round(worldX / CONFIG.BLOCK_SIZE);
        const gz = Math.round(worldZ / CONFIG.BLOCK_SIZE);
        
        if (gx < 0 || gx >= CONFIG.WORLD_SIZE || gz < 0 || gz >= CONFIG.WORLD_SIZE) {
            return -999; // Out of bounds
        }
        return this.heightMap[gx][gz] || 0;
    },
    
    // Get spawn height (at center of world)
    getSpawnHeight: function() {
        const centerX = Math.floor(CONFIG.WORLD_SIZE / 2);
        const centerZ = Math.floor(CONFIG.WORLD_SIZE / 2);
        return (this.heightMap[centerX]?.[centerZ] || 0) + CONFIG.SPAWN_Y_OFFSET;
    }
};
