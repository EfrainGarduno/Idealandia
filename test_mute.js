const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

// Setup mocks
window.targetMouthScaleY = 1;
window.avatarAnalyser = { getByteTimeDomainData: (arr) => arr.fill(200) }; // High amplitude
window.micAnalyser = { getByteTimeDomainData: (arr) => arr.fill(128) }; // Silence
window.isMicMuted = false;

// Mock elements
const wrapper = document.createElement('div');
wrapper.id = 'avatar-visual-wrapper';
document.body.appendChild(wrapper);

// Extract the function from HTML string to test it directly
const funcMatch = html.match(/function globalAnimateAvatar\(\) \{([\s\S]*?window\.animationFrameId = requestAnimationFrame\(globalAnimateAvatar\);\n                        \})/);
if (!funcMatch) {
    console.error("Function not found");
    process.exit(1);
}

const funcBody = funcMatch[1].replace('window.animationFrameId = requestAnimationFrame(globalAnimateAvatar);', '');
const globalAnimateAvatar = new Function('window', 'document', `
    const prefersReducedMotion = false;
    let smoothedAverage = 0;
    let outDataArray = new Uint8Array(256);
    let micDataArray = new Uint8Array(256);
    return function() {
        ${funcBody.replace(/isMicMuted/g, 'window.isMicMuted')}
    };
`)(window, document);


console.log("Initial scale:", window.targetMouthScaleY);

// 1. Idealita starts speaking
wrapper.classList.add('state-speaking');
globalAnimateAvatar();
console.log("Scale while speaking (Mic ON):", window.targetMouthScaleY);

// 2. User mutes microphone
window.isMicMuted = true;
globalAnimateAvatar();
console.log("Scale while speaking (Mic OFF):", window.targetMouthScaleY);

// 3. Idealita stops speaking
wrapper.classList.remove('state-speaking');
globalAnimateAvatar();
console.log("Scale after speaking (Mic OFF):", window.targetMouthScaleY);

// 4. Verify mute doesn't break logic
if (window.targetMouthScaleY === 1) {
    console.log("Test Passed: Muting mic during speech doesn't interfere, and finishes at rest.");
} else {
    console.log("Test Failed.");
}
