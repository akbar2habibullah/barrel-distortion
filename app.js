// WebGL setup
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });

if (!gl) {
    alert('WebGL not supported');
}

// Vertex shader source (unchanged)
const vsSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    
    void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
    }
`;

// === MODIFIED: Fragment shader with CRT effects ===
const fsSource = `
    precision mediump float;
    uniform sampler2D uSampler;
    uniform float uDistortion;
    uniform float uZoom;
    
    // CRT Uniforms
    uniform float uTime;
    uniform float uNoiseAmount;
    uniform float uScanlineIntensity;
    uniform float uScanlineFrequency;

    varying vec2 vTexCoord;

    // Pseudo-random number generator
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }
    
    void main() {
        // --- 1. Barrel Distortion ---
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = (vTexCoord - center) * uZoom;
        float dist = length(coord);
        float factor = 1.0 + uDistortion * dist * dist;
        vec2 distortedCoord = coord * factor;
        distortedCoord = distortedCoord / uZoom + center;
        
        // --- 2. Sample the texture ---
        vec4 color = texture2D(uSampler, distortedCoord);

        // If the pixel is outside the texture bounds due to distortion, don't apply effects
        if (distortedCoord.x < 0.0 || distortedCoord.x > 1.0 || distortedCoord.y < 0.0 || distortedCoord.y > 1.0) {
            // Let the background color from gl.clearColor show through
        } else {
            // --- 3. Apply CRT Effects ---
            
            // a. Scanlines - Darken pixels on alternating lines
            float scanline = sin(distortedCoord.y * uScanlineFrequency) * uScanlineIntensity;
            color.rgb -= scanline;

            // b. Noise - Add random, time-varying grain
            float noise = (random(vTexCoord + uTime) - 0.5) * uNoiseAmount;
            color.rgb += noise;
        }

        // --- 4. Final Output ---
        gl_FragColor = color;
    }
`;

// Compile shader
function compileShader(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Create shader program
const vertexShader = compileShader(vsSource, gl.VERTEX_SHADER);
const fragmentShader = compileShader(fsSource, gl.FRAGMENT_SHADER);
const shaderProgram = gl.createProgram();
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);

if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error('Shader program link error');
}

// === MODIFIED: Get new uniform locations ===
const programInfo = {
    attribLocations: {
        position: gl.getAttribLocation(shaderProgram, 'aPosition'),
        texCoord: gl.getAttribLocation(shaderProgram, 'aTexCoord'),
    },
    uniformLocations: {
        sampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
        distortion: gl.getUniformLocation(shaderProgram, 'uDistortion'),
        zoom: gl.getUniformLocation(shaderProgram, 'uZoom'),
        // New CRT uniforms
        time: gl.getUniformLocation(shaderProgram, 'uTime'),
        noiseAmount: gl.getUniformLocation(shaderProgram, 'uNoiseAmount'),
        scanlineIntensity: gl.getUniformLocation(shaderProgram, 'uScanlineIntensity'),
        scanlineFrequency: gl.getUniformLocation(shaderProgram, 'uScanlineFrequency'),
    },
};

// Create buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);

const texture = createTexture();
function createTexture() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return texture;
}

const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');
textCanvas.width = 512; // Increased resolution for better quality
textCanvas.height = 512;
canvas.width = textCanvas.width;
canvas.height = textCanvas.height;
gl.viewport(0, 0, canvas.width, canvas.height);

function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
}

function wrapText(context, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0] || '';
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = context.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function renderText() {
    // We only need to redraw the text texture, not the whole WebGL scene.
    // The animation loop will handle rendering the WebGL canvas.
    textCtx.fillStyle = bgColorInput.value;
    textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
    
    textCtx.fillStyle = fontColorInput.value;
    textCtx.font = `bold ${fontSizeInput.value}px 'Times New Roman'`;
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    
    textCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    textCtx.shadowBlur = 4;
    textCtx.shadowOffsetX = 2;
    textCtx.shadowOffsetY = 2;
    
    const rawLines = textInput.value.split('\n');
    const wrappedLines = [];
    const maxWidth = textCanvas.width * 0.9;
    
    rawLines.forEach(line => {
        if (textCtx.measureText(line).width > maxWidth && line.includes(' ')) {
            wrappedLines.push(...wrapText(textCtx, line, maxWidth));
        } else {
            wrappedLines.push(line);
        }
    });
    
    const lineHeight = parseFloat(fontSizeInput.value) * parseFloat(lineSpacingInput.value);
    const totalHeight = (wrappedLines.length - 1) * lineHeight;
    const startY = (textCanvas.height - totalHeight) / 2;
    
    wrappedLines.forEach((line, i) => {
        textCtx.fillText(line, textCanvas.width / 2, startY + i * lineHeight);
    });
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
}

// === MODIFIED: The main render function, now part of the animation loop ===
function render(time) {
    time *= 0.001; // convert time to seconds

    const bgColor = hexToRgb(bgColorInput.value);
    gl.clearColor(bgColor.r, bgColor.g, bgColor.b, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.useProgram(shaderProgram);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.texCoord);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    
    // Set lens uniforms
    gl.uniform1f(programInfo.uniformLocations.distortion, parseFloat(distortionInput.value));
    gl.uniform1f(programInfo.uniformLocations.zoom, parseFloat(zoomInput.value));
    
    // === NEW: Set CRT uniforms on every frame ===
    gl.uniform1f(programInfo.uniformLocations.time, time);
    gl.uniform1f(programInfo.uniformLocations.noiseAmount, parseFloat(noiseAmountInput.value));
    gl.uniform1f(programInfo.uniformLocations.scanlineIntensity, parseFloat(scanlineIntensityInput.value));
    // Set scanline frequency based on canvas height for a consistent look
    gl.uniform1f(programInfo.uniformLocations.scanlineFrequency, canvas.height * 1.5);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Get all control elements
const distortionInput = document.getElementById('distortion');
const zoomInput = document.getElementById('zoom');
const fontSizeInput = document.getElementById('fontSize');
const lineSpacingInput = document.getElementById('lineSpacing');
const textInput = document.getElementById('textInput');
const updateButton = document.getElementById('updateText');
const resetButton = document.getElementById('resetText');
const exportButton = document.getElementById('exportPng');
const fontColorInput = document.getElementById('fontColor');
const bgColorInput = document.getElementById('bgColor');
const toUpperButton = document.getElementById('toUpper');
const toLowerButton = document.getElementById('toLower');
// === NEW: Get CRT control elements ===
const noiseAmountInput = document.getElementById('noiseAmount');
const scanlineIntensityInput = document.getElementById('scanlineIntensity');

// === MODIFIED: Event listeners now just call renderText, not the full render ===
fontSizeInput.addEventListener('input', renderText);
lineSpacingInput.addEventListener('input', renderText);
updateButton.addEventListener('click', renderText);
fontColorInput.addEventListener('input', renderText);
bgColorInput.addEventListener('input', () => {
    document.body.style.backgroundColor = bgColorInput.value;
    renderText();
});
toUpperButton.addEventListener('click', () => {
    textInput.value = textInput.value.toUpperCase();
    renderText();
});
toLowerButton.addEventListener('click', () => {
    textInput.value = textInput.value.toLowerCase();
    renderText();
});

resetButton.addEventListener('click', () => {
    // Lens
    distortionInput.value = 2;
    zoomInput.value = 1.5;
    // Text
    textInput.value = "BUT AT\nLEAST\nYOU'LL";
    fontSizeInput.value = 80;
    lineSpacingInput.value = 1.2;
    // Color
    fontColorInput.value = '#FFFFFF';
    bgColorInput.value = '#000000';
    // === NEW: Reset CRT controls ===
    noiseAmountInput.value = 0.05;
    scanlineIntensityInput.value = 0.15;
    
    document.body.style.backgroundColor = bgColorInput.value;
    renderText();
});

function exportToPNG() {
    // The animation loop is already rendering, so we just grab the buffer
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'crt-distortion-effect.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
exportButton.addEventListener('click', exportToPNG);

// === NEW: Animation Loop ===
function animate(time) {
    render(time); // The main render function is called every frame
    requestAnimationFrame(animate); // Loop forever
}

// Initial setup
document.body.style.backgroundColor = bgColorInput.value;
renderText(); // Create the initial text texture
requestAnimationFrame(animate); // Start the animation loop
