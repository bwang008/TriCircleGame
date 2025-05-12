document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const mainCanvas = document.getElementById('mainCanvas');
    const mainCtx = mainCanvas.getContext('2d');
    const zoomCanvas = document.getElementById('zoomCanvas');
    const zoomCtx = zoomCanvas.getContext('2d');
    const timerDisplay = document.getElementById('timer');
    const resultDisplay = document.getElementById('result');
    const zoomInfoDisplay = document.getElementById('zoomInfo');
    const bankrollDisplay = document.getElementById('bankrollDisplay');
    const betInButton = document.getElementById('betInButton');
    const betOutButton = document.getElementById('betOutButton');
    const chipsContainer = document.getElementById('chipsContainer');
    const currentBetDisplay = document.getElementById('currentBetDisplay');
    const clearBetButton = document.getElementById('clearBetButton');
    const payoutInfoDisplay = document.getElementById('payoutInfo');
    const betMessageDisplay = document.getElementById('betMessage');

    // --- Configuration ---
    const MAIN_CANVAS_SIZE = 400;
    const ZOOM_CANVAS_SIZE = 200;
    const CENTER_X = MAIN_CANVAS_SIZE / 2;
    const CENTER_Y = MAIN_CANVAS_SIZE / 2;
    const ORBIT_RADIUS = 150;
    const CENTER_DOT_RADIUS = 5;
    const ORBITING_DOT_RADIUS = 8;
    const COUNTDOWN_SECONDS = 5; // Start countdown from 5
    const STOP_DELAY_MS = 500;
    const MIN_SPEED = 0.7;
    const MAX_SPEED = 1.5;
    const LOCK_BETS_THRESHOLD = 1.0; // Seconds remaining to lock bets
    const INITIAL_BANKROLL = 1000;
    const ODDS = { in: 1.95, out: 1.95 }; // Payout multiplier (win $1.95 for every $1 bet)

    const BASE_DOT_CONFIG = [ { color: '#ff5733' }, { color: '#33ff57' }, { color: '#3357ff' } ];

    // --- State Variables ---
    let animationFrameId = null;
    let bankroll = INITIAL_BANKROLL;
    let currentBetAmount = 0;
    let selectedBetType = null; // 'in', 'out', or null
    let betsLocked = false;
    let countdownValue = COUNTDOWN_SECONDS; // Current value for display logic
    let startTime = null; // For animation timing
    let timerStartTime = null; // For countdown logic start time
    let currentDotData = [];
    let stoppedDots = [];
    let stopTimeouts = [];
    let gameState = 'idle'; // idle, running, stopping, stopped, result
    let finalTrianglePoints = [];
    let closestLineInfo = null;
    let lastTimestamp = 0; // For animation delta time

    // --- Utility Functions ---
    function formatCurrency(amount) {
        return `$${amount.toFixed(2)}`;
    }

    function updateBankrollDisplay() {
        bankrollDisplay.textContent = `Bankroll: ${formatCurrency(bankroll)}`;
    }

    function updateBetDisplay() {
        currentBetDisplay.textContent = `Bet: ${formatCurrency(currentBetAmount)}`;
    }

     function showBetMessage(message, isError = false) {
        betMessageDisplay.textContent = message;
        betMessageDisplay.style.color = isError ? '#ff5733' : '#4CAF50'; // Red for error, green for info
        // Clear message after a delay
        setTimeout(() => {
             if (betMessageDisplay.textContent === message) { // Avoid clearing newer messages
                 betMessageDisplay.textContent = '';
             }
        }, 3000);
     }

    function setBettingControlsEnabled(isEnabled) {
        betsLocked = !isEnabled;
        betInButton.disabled = !isEnabled;
        betOutButton.disabled = !isEnabled;
        clearBetButton.disabled = !isEnabled;
        const chips = chipsContainer.querySelectorAll('.chip');
        chips.forEach(chip => {
            if (isEnabled) {
                chip.classList.remove('disabled');
            } else {
                chip.classList.add('disabled');
            }
        });

        // Adjust visual opacity/stippling if needed (already handled by .disabled class)
        if (!isEnabled) {
            console.log("Bets Locked!");
        } else {
            console.log("Bets Open!");
        }
    }


    // --- Drawing Functions (Mostly unchanged) ---
    function drawCircle(ctx, x, y, radius, color, strokeColor = null, lineWidth = 1) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (color) { ctx.fillStyle = color; ctx.fill(); }
        if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = lineWidth; ctx.stroke(); }
    }
    function drawLine(ctx, x1, y1, x2, y2, color, lineWidth = 1) {
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
    }
    // drawMainScene, drawZoomScene, crossProduct, isInsideTriangle,
    // distancePointLineSegment, findClosestLineToCenter remain the same as previous version
    // ... (Include the full drawing and geometry functions from the previous answer here) ...
     function drawMainScene() {
        mainCtx.fillStyle = '#282828'; mainCtx.fillRect(0, 0, MAIN_CANVAS_SIZE, MAIN_CANVAS_SIZE);
        drawCircle(mainCtx, CENTER_X, CENTER_Y, ORBIT_RADIUS, null, '#555555', 1);
        drawCircle(mainCtx, CENTER_X, CENTER_Y, CENTER_DOT_RADIUS, '#ffffff');
        if (gameState === 'running' || gameState === 'stopping') {
            currentDotData.forEach((dot, index) => {
                if (gameState === 'stopping' && stoppedDots.some(d => d.configIndex === index)) return;
                const angleRad = dot.angle * Math.PI / 180;
                const x = CENTER_X + ORBIT_RADIUS * Math.cos(angleRad);
                const y = CENTER_Y + ORBIT_RADIUS * Math.sin(angleRad);
                drawCircle(mainCtx, x, y, ORBITING_DOT_RADIUS, dot.color);
            });
        }
         if (['stopping', 'stopped', 'result'].includes(gameState)) {
            stoppedDots.forEach(dot => {
                 if(currentDotData[dot.configIndex]) { // Check if data exists
                     drawCircle(mainCtx, dot.x, dot.y, ORBITING_DOT_RADIUS, currentDotData[dot.configIndex].color);
                 }
            });
        }
        if (['stopped', 'result'].includes(gameState) && finalTrianglePoints.length === 3) {
             drawLine(mainCtx, finalTrianglePoints[0].x, finalTrianglePoints[0].y, finalTrianglePoints[1].x, finalTrianglePoints[1].y, '#aaaaaa', 2);
             drawLine(mainCtx, finalTrianglePoints[1].x, finalTrianglePoints[1].y, finalTrianglePoints[2].x, finalTrianglePoints[2].y, '#aaaaaa', 2);
             drawLine(mainCtx, finalTrianglePoints[2].x, finalTrianglePoints[2].y, finalTrianglePoints[0].x, finalTrianglePoints[0].y, '#aaaaaa', 2);
        }
    }
    function drawZoomScene() {
        zoomCtx.fillStyle = '#333333'; zoomCtx.fillRect(0, 0, ZOOM_CANVAS_SIZE, ZOOM_CANVAS_SIZE);
        zoomInfoDisplay.textContent = '';
        if (gameState !== 'result' || !closestLineInfo) {
             zoomInfoDisplay.textContent = 'Waiting for result...'; return;
        }
        const { line, distance, closestPointOnLine, p1, p2, p3 } = closestLineInfo;
        const center = { x: CENTER_X, y: CENTER_Y };
        const baseScaleUnits = ZOOM_CANVAS_SIZE * 0.3;
        const minEffectiveDistance = 5;
        const effectiveDistance = Math.max(distance, minEffectiveDistance);
        let scale = baseScaleUnits / effectiveDistance;
        scale = Math.min(scale, 15); scale = Math.max(scale, 0.5);
        zoomCtx.save();
        const viewCenterX = (center.x + closestPointOnLine.x) / 2;
        const viewCenterY = (center.y + closestPointOnLine.y) / 2;
        zoomCtx.translate(ZOOM_CANVAS_SIZE / 2, ZOOM_CANVAS_SIZE / 2);
        zoomCtx.scale(scale, scale);
        zoomCtx.translate(-viewCenterX, -viewCenterY);
        drawLine(zoomCtx, line.p1.x, line.p1.y, line.p2.x, line.p2.y, '#aaaaaa', 2 / scale);
        drawCircle(zoomCtx, center.x, center.y, CENTER_DOT_RADIUS / Math.sqrt(scale), '#ffffff');
        const dx = line.p2.x - line.p1.x; const dy = line.p2.y - line.p1.y;
        const nx = -dy; const ny = dx; const len = Math.sqrt(nx * nx + ny * ny);
        if (len === 0) { zoomCtx.restore(); return; }
        const unx = nx / len; const uny = ny / len;
        const midX = (line.p1.x + line.p2.x) / 2; const midY = (line.p1.y + line.p2.y) / 2;
        const vecMidToP3 = { x: p3.x - midX, y: p3.y - midY };
        const dotP3Normal = vecMidToP3.x * nx + vecMidToP3.y * ny;
        let inSideNormalMultiplier = Math.sign(dotP3Normal) !== 0 ? Math.sign(dotP3Normal) : 1;
        const textOffset = 20 / scale;
        zoomCtx.font = `${Math.max(8, 12 / scale)}px Arial`; zoomCtx.textAlign = 'center'; zoomCtx.textBaseline = 'middle';
        zoomCtx.fillStyle = 'lightgreen';
        zoomCtx.fillText('IN', midX + unx * textOffset * inSideNormalMultiplier, midY + uny * textOffset * inSideNormalMultiplier);
        zoomCtx.fillStyle = 'lightcoral';
        zoomCtx.fillText('OUT', midX - unx * textOffset * inSideNormalMultiplier, midY - uny * textOffset * inSideNormalMultiplier);
        zoomCtx.restore();
        zoomInfoDisplay.innerHTML = `Dist: ${distance.toFixed(2)}px<br>Scale: ${scale.toFixed(2)}x`;
    }
     function crossProduct(p1, p2, p3) { return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x); }
     function isInsideTriangle(pt, v1, v2, v3) {
        const d1 = crossProduct(pt, v1, v2); const d2 = crossProduct(pt, v2, v3); const d3 = crossProduct(pt, v3, v1);
        const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0); const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        return !(has_neg && has_pos);
     }
     function distancePointLineSegment(p, a, b) {
        const l2 = (b.x - a.x)**2 + (b.y - a.y)**2; if (l2 === 0) return { distance: Math.sqrt((p.x - a.x)**2 + (p.y - a.y)**2), closestPoint: a };
        let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2; t = Math.max(0, Math.min(1, t));
        const closestPoint = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        const dx = p.x - closestPoint.x; const dy = p.y - closestPoint.y; const dist = Math.sqrt(dx*dx + dy*dy);
        return { distance: dist, closestPoint: closestPoint };
     }
     function findClosestLineToCenter(center, p1, p2, p3) {
        const lines = [ { p1: p1, p2: p2, p3: p3 }, { p1: p2, p2: p3, p3: p1 }, { p1: p3, p2: p1, p3: p2 } ];
        let minDistance = Infinity; let closestLineData = null;
        lines.forEach(line => {
            const {distance, closestPoint} = distancePointLineSegment(center, line.p1, line.p2);
            if (distance < minDistance) {
                minDistance = distance;
                closestLineData = { line: { p1: line.p1, p2: line.p2 }, p3: line.p3, distance: distance, closestPointOnLine: closestPoint };
            }
        });
        return closestLineData;
     }


    // --- Animation Loop ---
    function animate(timestamp) {
        if (!lastTimestamp) lastTimestamp = timestamp;
        const deltaTime = (timestamp - lastTimestamp) / 1000 || 0;
        lastTimestamp = timestamp;

        if (gameState === 'running') {
            // Update dot angles
            currentDotData.forEach((dot) => {
                dot.angle = (dot.angle + dot.speed * deltaTime * 360) % 360;
            });

            // Update timer
            const elapsedTimer = (performance.now() - timerStartTime) / 1000;
            const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsedTimer);
            countdownValue = remaining; // Update global countdown value
            timerDisplay.textContent = `${remaining.toFixed(2)} Seconds remaining`;

            // Lock bets check
            if (remaining <= LOCK_BETS_THRESHOLD && !betsLocked) {
                setBettingControlsEnabled(false);
                 showBetMessage("Bets are locked!");
            }

            // Stop sequence trigger
            if (remaining <= 0) {
                timerDisplay.textContent = `0.00 Seconds remaining`;
                stopSequence();
            }
        }

        drawMainScene();
        if (gameState === 'result') { drawZoomScene(); }
        else {
            zoomCtx.fillStyle = '#333333'; zoomCtx.fillRect(0, 0, ZOOM_CANVAS_SIZE, ZOOM_CANVAS_SIZE);
            if (gameState !== 'idle') zoomInfoDisplay.textContent = 'Waiting for result...';
        }

        if (gameState === 'running' || gameState === 'stopping') {
            animationFrameId = requestAnimationFrame(animate);
        }
    }

    // --- Timer Logic ---
    function startTimer() {
        timerStartTime = performance.now();
        countdownValue = COUNTDOWN_SECONDS; // Reset countdown value
        timerDisplay.textContent = `${countdownValue.toFixed(2)} Seconds remaining`;
    }

    // --- Stop Sequence (Mostly unchanged) ---
     function stopSequence() {
        if (gameState !== 'running') return;
        gameState = 'stopping'; console.log("Stopping sequence initiated");
        lastTimestamp = 0;
        stopTimeouts.forEach(clearTimeout); stopTimeouts = []; stoppedDots = [];

        currentDotData.forEach((dot, index) => {
            const timeoutId = setTimeout(() => {
                 if (gameState !== 'stopping') return;
                const angleRad = dot.angle * Math.PI / 180;
                const x = CENTER_X + ORBIT_RADIUS * Math.cos(angleRad);
                const y = CENTER_Y + ORBIT_RADIUS * Math.sin(angleRad);
                stoppedDots.push({ x, y, configIndex: index });
                console.log(`Dot ${index} stopped at (${x.toFixed(2)}, ${y.toFixed(2)})`);
                 drawMainScene();
                if (stoppedDots.length === currentDotData.length) {
                    console.log("All dots stopped."); gameState = 'stopped'; finalizeResult();
                }
            }, index * STOP_DELAY_MS);
            stopTimeouts.push(timeoutId);
        });
    }

    // --- Result and Payout Logic ---
    function finalizeResult() {
        if (gameState !== 'stopped' || stoppedDots.length !== BASE_DOT_CONFIG.length) return;

        stoppedDots.sort((a, b) => a.configIndex - b.configIndex);
        finalTrianglePoints = stoppedDots.map(dot => ({ x: dot.x, y: dot.y }));

        const centerPoint = { x: CENTER_X, y: CENTER_Y };
        const [p1, p2, p3] = finalTrianglePoints;

        const actualOutcomeIsInside = isInsideTriangle(centerPoint, p1, p2, p3);
        const actualOutcomeType = actualOutcomeIsInside ? 'in' : 'out';

        resultDisplay.textContent = actualOutcomeType.toUpperCase();
        resultDisplay.className = actualOutcomeIsInside ? 'result-in' : 'result-out';

        // Calculate Payout
        let payout = 0;
        let win = false;
        if (selectedBetType && currentBetAmount > 0) {
            if (selectedBetType === actualOutcomeType) {
                // Win
                win = true;
                payout = currentBetAmount * ODDS[selectedBetType];
                bankroll += payout; // Add winnings (includes original bet)
                 payoutInfoDisplay.textContent = `You WIN ${formatCurrency(payout - currentBetAmount)}!`;
                 payoutInfoDisplay.style.color = '#4CAF50'; // Green
                 console.log(`Win! Bet: ${currentBetAmount}, Payout: ${payout}, New Bankroll: ${bankroll}`);
            } else {
                // Loss - bet amount was already deducted, no payout
                 payoutInfoDisplay.textContent = `You lost ${formatCurrency(currentBetAmount)}.`;
                 payoutInfoDisplay.style.color = '#ff5733'; // Red
                 console.log(`Loss. Bet: ${currentBetAmount}, Bankroll: ${bankroll}`);
            }
        } else {
             payoutInfoDisplay.textContent = "No bet placed.";
             payoutInfoDisplay.style.color = '#cccccc'; // Neutral color
        }

        // Reset bet for next round *after* calculating payout
        currentBetAmount = 0;
        updateBetDisplay();
        updateBankrollDisplay();

        // Prepare for next round (controls will be enabled by startGame)
        selectedBetType = null; // Reset selection
        betInButton.classList.remove('selected');
        betOutButton.classList.remove('selected');

        closestLineInfo = findClosestLineToCenter(centerPoint, p1, p2, p3);
        gameState = 'result'; // Keep state as result until next start
        console.log(`Result: ${actualOutcomeType.toUpperCase()}`);

        drawMainScene();
        drawZoomScene();

         // Check for bankruptcy
        if (bankroll <= 0 && currentBetAmount <= 0) {
            showBetMessage("Game Over - You are out of money!", true);
            // Optionally disable starting a new game
        } else {
             // Re-enable controls *only if* game requires click to restart
            // setBettingControlsEnabled(true); // Enable for next round *IF* not auto-restarting
             resultDisplay.textContent += ' (Click to play again)';
        }
    }

    // --- Game Control ---
    function startGame() {
        if (bankroll <= 0) {
             showBetMessage("Cannot start: Insufficient funds.", true);
             return;
        }
        console.log("Starting game...");
        gameState = 'running';
        lastTimestamp = 0;
        stoppedDots = []; finalTrianglePoints = []; closestLineInfo = null; currentDotData = [];
        payoutInfoDisplay.textContent = ""; // Clear previous payout message
        resultDisplay.textContent = ""; // Clear previous result
        resultDisplay.className = "";
         betMessageDisplay.textContent = ""; // Clear betting messages


        // Randomize dots
        BASE_DOT_CONFIG.forEach(baseConfig => {
            const randomAngle = Math.random() * 360;
            const randomSpeed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
            currentDotData.push({ color: baseConfig.color, speed: randomSpeed, angle: randomAngle });
        });
        console.log("Randomized Dots:", currentDotData);

        // Reset betting state (keep current bet amount if player didn't clear)
        // currentBetAmount = 0; // Reset bet amount automatically? Or let player keep it? Let's keep it.
        // selectedBetType = null; // Keep selected bet type? Let's keep it.
        // updateBetDisplay();
        // betInButton.classList.remove('selected'); // Don't reset selection visually unless bet type reset
        // betOutButton.classList.remove('selected');

        stopTimeouts.forEach(clearTimeout); stopTimeouts = [];
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        setBettingControlsEnabled(true); // Enable betting
        startTimer();
        animationFrameId = requestAnimationFrame(animate);
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        // Bet Type Selection
        [betInButton, betOutButton].forEach(button => {
            button.addEventListener('click', () => {
                if (betsLocked) return;
                const betType = button.dataset.betType;

                if (selectedBetType === betType) {
                    // Deselect
                    selectedBetType = null;
                    button.classList.remove('selected');
                } else {
                    // Select this one
                    selectedBetType = betType;
                    betInButton.classList.remove('selected');
                    betOutButton.classList.remove('selected');
                    button.classList.add('selected');
                }
                 console.log("Selected bet type:", selectedBetType);
            });
        });

        // Chips Interaction (using event delegation)
        chipsContainer.addEventListener('click', (event) => {
            if (betsLocked) return;
            const chip = event.target.closest('.chip');
            if (chip && !chip.classList.contains('disabled')) {
                const value = parseInt(chip.dataset.value, 10);
                if (bankroll >= value) {
                    bankroll -= value;
                    currentBetAmount += value;
                    updateBankrollDisplay();
                    updateBetDisplay();
                    showBetMessage(""); // Clear any previous error message
                } else {
                     showBetMessage("Insufficient funds!", true);
                }
            }
        });

        // Clear Bet Button
        clearBetButton.addEventListener('click', () => {
            if (betsLocked || currentBetAmount === 0) return;
            bankroll += currentBetAmount; // Return bet to bankroll
            currentBetAmount = 0;
            updateBankrollDisplay();
            updateBetDisplay();
             showBetMessage(""); // Clear any previous error message
        });

        // Start Game Listener (changed from body to game-area for less accidental starts)
        document.body.addEventListener('click', (event) => {
             // Start if idle or after result, and not clicking on controls
             const clickedOnControls = event.target.closest('.betting-controls') || event.target.closest('.bet-button') || event.target.closest('.chip');
            if ((gameState === 'idle' || gameState === 'result') && !clickedOnControls) {
                 startGame();
            } else if (gameState === 'running' && !betsLocked && !clickedOnControls) {
                console.log("Game already running. Click bet type or chips.");
            }
        });
    }


    // --- Initial Setup ---
    function initializeGame() {
        updateBankrollDisplay();
        updateBetDisplay();
        // Update button text with odds initially
        betInButton.textContent = `Bet Center IN (${ODDS.in.toFixed(2)})`;
        betOutButton.textContent = `Bet Center OUT (${ODDS.out.toFixed(2)})`;

        setBettingControlsEnabled(false); // Controls disabled until game starts
        timerDisplay.textContent = `${COUNTDOWN_SECONDS.toFixed(2)} Seconds remaining`;
        resultDisplay.textContent = 'Click Screen to Start'; // Prompt user
        payoutInfoDisplay.textContent = '';
         betMessageDisplay.textContent = '';
        drawMainScene(); // Initial static draw
        drawZoomScene(); // Initial empty zoom draw
        setupEventListeners();
        gameState = 'idle'; // Ensure initial state is idle
    }

    initializeGame(); // Run initial setup

}); // End DOMContentLoaded