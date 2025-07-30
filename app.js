// WebGL setup
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    alert('WebGL not supported');
}

// Vertex shader source
const vsSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    
    void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
    }
`;

// Fragment shader source
const fsSource = `
    precision mediump float;
    uniform sampler2D uSampler;
    uniform float uDistortion;
    uniform float uZoom;
    varying vec2 vTexCoord;
    
    void main() {
        // Center coordinates and normalize to [-1,1]
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = (vTexCoord - center) * uZoom;
        
        // Calculate distance from center
        float dist = length(coord);
        
        // Apply barrel distortion formula
        float factor = 1.0 + uDistortion * dist * dist;
        vec2 distortedCoord = coord * factor;
        
        // Convert back to texture coordinates
        distortedCoord = distortedCoord / uZoom + center;
        
        // Sample texture with new coordinates
        gl_FragColor = texture2D(uSampler, distortedCoord);
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

// Get attribute/uniform locations
const programInfo = {
    attribLocations: {
        position: gl.getAttribLocation(shaderProgram, 'aPosition'),
        texCoord: gl.getAttribLocation(shaderProgram, 'aTexCoord'),
    },
    uniformLocations: {
        sampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
        distortion: gl.getUniformLocation(shaderProgram, 'uDistortion'),
        zoom: gl.getUniformLocation(shaderProgram, 'uZoom'),
    },
};

// Create buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1, 1,   1, -1,   1, 1
]), gl.STATIC_DRAW);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 1,  1, 1,  0, 0,
    0, 0,  1, 1,  1, 0
]), gl.STATIC_DRAW);

// Create texture
function createTexture() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    
    return texture;
}

const texture = createTexture();

// Create offscreen canvas for text rendering
const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');

// Set canvas dimensions
textCanvas.width = screen.availWidth;
textCanvas.height = screen.availHeight;
canvas.width = textCanvas.width;
canvas.height = textCanvas.height;
gl.viewport(0, 0, canvas.width, canvas.height);

// Function to wrap text
function wrapText(context, text, maxWidth, fontSize) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

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

// Function to render text to canvas
function renderText(text, fontSize, lineSpacing) {
    // Clear canvas
    textCtx.fillStyle = '#000';
    textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
    
    // Configure text
    textCtx.fillStyle = '#fff';
    textCtx.font = `bold ${fontSize}px Times New Roman`;
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    
    // Add text shadow for better visibility
    textCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    textCtx.shadowBlur = 4;
    textCtx.shadowOffsetX = 2;
    textCtx.shadowOffsetY = 2;
    
    // Split text into lines
    const rawLines = text.split('\n');
    const wrappedLines = [];
    
    // Wrap each line if it's too long
    const maxWidth = textCanvas.width * 0.9; // 90% of canvas width
    rawLines.forEach(line => {
        if (textCtx.measureText(line).width > maxWidth) {
            const wrapped = wrapText(textCtx, line, maxWidth, fontSize);
            wrappedLines.push(...wrapped);
        } else {
            wrappedLines.push(line);
        }
    });
    
    // Calculate line height and total height
    const lineHeight = fontSize * lineSpacing;
    const totalHeight = wrappedLines.length * lineHeight;
    const startY = (textCanvas.height - totalHeight) / 2 + fontSize / 2;
    
    // Draw each line
    wrappedLines.forEach((line, i) => {
        textCtx.fillText(line, textCanvas.width / 2, startY + i * lineHeight);
    });
    
    // Update WebGL texture
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    
    // Render WebGL scene
    render();
}

// Render function
function render() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.useProgram(shaderProgram);
    
    // Set position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.position);
    
    // Set texture coordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.texCoord);
    
    // Set uniforms
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    gl.uniform1f(programInfo.uniformLocations.distortion, parseFloat(distortionInput.value));
    gl.uniform1f(programInfo.uniformLocations.zoom, parseFloat(zoomInput.value));
    
    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Event listeners
const distortionInput = document.getElementById('distortion');
const zoomInput = document.getElementById('zoom');
const fontSizeInput = document.getElementById('fontSize');
const lineSpacingInput = document.getElementById('lineSpacing');
const textInput = document.getElementById('textInput');
const updateButton = document.getElementById('updateText');
const resetButton = document.getElementById('resetText');

distortionInput.addEventListener('input', render);
zoomInput.addEventListener('input', render);
fontSizeInput.addEventListener('input', () => {
    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});
lineSpacingInput.addEventListener('input', () => {
    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});
updateButton.addEventListener('click', () => {
    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});
resetButton.addEventListener('click', () => {
    textInput.value = "Barrel Distortion\nText Effect\nWebGL Demo";
    fontSizeInput.value = 60;
    lineSpacingInput.value = 1.2;
    distortionInput.value = 0.3;
    zoomInput.value = 1;
    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});

// Initial render
renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);