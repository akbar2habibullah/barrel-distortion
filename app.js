// WebGL setup
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });

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
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = (vTexCoord - center) * uZoom;
        float dist = length(coord);
        float factor = 1.0 + uDistortion * dist * dist;
        vec2 distortedCoord = coord * factor;
        distortedCoord = distortedCoord / uZoom + center;
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
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);

// Create texture
function createTexture() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return texture;
}

const texture = createTexture();

// Create offscreen canvas for text rendering
const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');

textCanvas.width = 512;
textCanvas.height = 512;
canvas.width = textCanvas.width;
canvas.height = textCanvas.height;
gl.viewport(0, 0, canvas.width, canvas.height);

// === NEW: Helper function to convert hex color to WebGL-friendly RGB ===
function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
}

// Function to wrap text
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

// === MODIFIED: Function to render text to canvas now uses color inputs ===
function renderText(text, fontSize, lineSpacing) {
    // Clear canvas with selected background color
    textCtx.fillStyle = bgColorInput.value;
    textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
    
    // Configure text with selected font color
    textCtx.fillStyle = fontColorInput.value;
    textCtx.font = `bold ${fontSize}px 'Times New Roman'`;
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    
    textCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    textCtx.shadowBlur = 4;
    textCtx.shadowOffsetX = 2;
    textCtx.shadowOffsetY = 2;
    
    const rawLines = text.split('\n');
    const wrappedLines = [];
    const maxWidth = textCanvas.width * 0.9;
    
    rawLines.forEach(line => {
        if (textCtx.measureText(line).width > maxWidth && line.includes(' ')) {
            const wrapped = wrapText(textCtx, line, maxWidth);
            wrappedLines.push(...wrapped);
        } else {
            wrappedLines.push(line);
        }
    });
    
    const lineHeight = fontSize * lineSpacing;
    const totalHeight = (wrappedLines.length - 1) * lineHeight;
    const startY = (textCanvas.height - totalHeight) / 2;
    
    wrappedLines.forEach((line, i) => {
        textCtx.fillText(line, textCanvas.width / 2, startY + i * lineHeight);
    });
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    
    render();
}

// === MODIFIED: Render function now uses background color ===
function render() {
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
    gl.uniform1f(programInfo.uniformLocations.distortion, parseFloat(distortionInput.value));
    gl.uniform1f(programInfo.uniformLocations.zoom, parseFloat(zoomInput.value));
    
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
// === NEW: Get new control elements ===
const fontColorInput = document.getElementById('fontColor');
const bgColorInput = document.getElementById('bgColor');
const toUpperButton = document.getElementById('toUpper');
const toLowerButton = document.getElementById('toLower');

// Event Listeners for original controls
distortionInput.addEventListener('input', render);
zoomInput.addEventListener('input', render);
fontSizeInput.addEventListener('input', () => renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value));
lineSpacingInput.addEventListener('input', () => renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value));
updateButton.addEventListener('click', () => renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value));

// === NEW: Event listeners for new controls ===
fontColorInput.addEventListener('input', () => renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value));

bgColorInput.addEventListener('input', () => {
    document.body.style.backgroundColor = bgColorInput.value;
    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});

toUpperButton.addEventListener('click', () => {
    textInput.value = textInput.value.toUpperCase();
    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});

toLowerButton.addEventListener('click', () => {
    textInput.value = textInput.value.toLowerCase();
    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});

// === MODIFIED: Reset button now resets new controls too ===
resetButton.addEventListener('click', () => {
    textInput.value = "BUT AT\nLEAST\nYOU'LL";
    fontSizeInput.value = 80;
    lineSpacingInput.value = 1.2;
    distortionInput.value = 2;
    zoomInput.value = 1.5;
    // Reset colors
    fontColorInput.value = '#FFFFFF';
    bgColorInput.value = '#000000';
    document.body.style.backgroundColor = bgColorInput.value;

    renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);
});

// Event listener for exporting to PNG
function exportToPNG() {
    render(); // Ensure canvas is up-to-date
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'barrel-distortion-effect.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
exportButton.addEventListener('click', exportToPNG);

// Initial setup and render
document.body.style.backgroundColor = bgColorInput.value;
renderText(textInput.value, fontSizeInput.value, lineSpacingInput.value);