document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const zoomCanvas = document.getElementById('zoomCanvas'); // New canvas
    const zoomCtx = zoomCanvas.getContext('2d'); // New context
    const startButton = document.getElementById('startButton');
    const resultDisplay = document.getElementById('resultDisplay');
    const timerElement = document.getElementById('countdownTimer');
    const bankrollDisplay = document.getElementById('bankrollDisplay');
    const betInButton = document.getElementById('betInButton');
    const betOutButton = document.getElementById('betOutButton');
    const currentBetDisplay = document.getElementById('currentBetDisplay');
    const chipsContainer = document.querySelector('.chips-container');
    const clearBetButton = document.getElementById('clearBetButton');
    const payoutMessageDisplay = document.getElementById('payoutMessage');
    const resetBankrollButton = document.getElementById('resetBankrollButton');
    const historyTableBody = document.getElementById('historyTable').querySelector('tbody'); // History table body

    // --- Canvas and Simulation Constants ---
    const simCenterX = canvas.width / 2; // Renamed for clarity
    const simCenterY = canvas.height / 2;
    const radius = canvas.width / 2 - 30;
    const dotRadius = 5;
    const TOTAL_DOTS = 3;
    const COUNTDOWN_DURATION = 10000;

    // --- Betting Constants ---
    const ODDS_IN = 4.0;
    const ODDS_OUT = 4.0 / 3.0;
    const CHIP_VALUES = [1, 5, 10, 25, 100];
    const STARTING_BANKROLL = 1000.00;

    // --- Simulation State Variables ---
    let dots = [];
    let animationFrameId;
    let stoppedDotsCount = 0;
    let countdownInterval;
    let timeLeft = COUNTDOWN_DURATION;
    let stopSchedulingTimeout;
    let simulationRunning = false; // Track if simulation is active

    // --- Betting State Variables ---
    let bankroll = STARTING_BANKROLL;
    let currentBetAmount = 0.00;
    let selectedBetType = null; // Persistent
    let bettingLocked = false; // Locks betting ONLY when timer <= 1s

    // --- History State ---
    let history = [];
    let roundCounter = 0;

    // --- Initialization and Setup ---
    function initDots() {
        dots = [];
        for (let i = 0; i < TOTAL_DOTS; i++) {
            dots.push({
                id: i, angle: Math.random() * 2 * Math.PI,
                speed: (Math.random() * 0.04 + 0.01) * (Math.random() < 0.5 ? 1 : -1),
                color: `hsl(${Math.random() * 360}, 80%, 60%)`,
                isStopped: false, isStopping: false, angleToStopAt: null, finalAngle: null, x: 0, y: 0
            });
        }
        stoppedDotsCount = 0;
        resultDisplay.textContent = 'Result: ---';
        resultDisplay.className = 'default';
        payoutMessageDisplay.textContent = '';
        payoutMessageDisplay.className = 'payout-message';

        timeLeft = COUNTDOWN_DURATION;
        updateTimerDisplay();
        resetForNewRound(); // Resets only round-specific things
    }

    function initializeGlobalBettingState() {
        bankroll = STARTING_BANKROLL;
        currentBetAmount = 0.00;
        selectedBetType = null;
        bettingLocked = false; // Start unlocked
        simulationRunning = false;

        updateBankrollDisplay();
        updateCurrentBetDisplay();
        updateBetSelectionButtons();
        updateChipStates();
        clearBetButton.disabled = (currentBetAmount === 0);
        updateHistoryTable(); // Initial empty table
        clearZoomCanvas(); // Initial clear
    }

    function resetForNewRound() {
        // Bet amount and selection persist, only unlock controls
        bettingLocked = false; // Unlock betting for the new round setup phase
        simulationRunning = false;
        startButton.disabled = false; // Ensure start button is enabled
        updateChipStates();
        clearBetButton.disabled = bettingLocked || currentBetAmount === 0;
        betInButton.disabled = bettingLocked;
        betOutButton.disabled = bettingLocked;
        payoutMessageDisplay.textContent = ''; // Clear previous messages
        payoutMessageDisplay.className = 'payout-message';
        clearZoomCanvas(); // Clear zoom view for new round
    }

    // --- Drawing Functions ---
    function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    function drawCircle() {
        ctx.beginPath(); ctx.arc(simCenterX, simCenterY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#888e99'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(simCenterX, simCenterY, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#bdc3c7'; ctx.fill();
    }
    function drawDot(dot) {
        const currentAngle = dot.isStopped ? dot.finalAngle : dot.angle;
        dot.x = simCenterX + radius * Math.cos(currentAngle); dot.y = simCenterY + radius * Math.sin(currentAngle);
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dotRadius, 0, 2 * Math.PI);
        ctx.fillStyle = dot.color; ctx.fill();
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.stroke();
    }
    function drawTriangle() {
        if (stoppedDotsCount < TOTAL_DOTS) return;
        const stoppedPoints = getStoppedPoints();
        if (!stoppedPoints) return;

        ctx.beginPath(); ctx.moveTo(stoppedPoints[0].x, stoppedPoints[0].y);
        ctx.lineTo(stoppedPoints[1].x, stoppedPoints[1].y); ctx.lineTo(stoppedPoints[2].x, stoppedPoints[2].y);
        ctx.closePath(); ctx.strokeStyle = 'rgba(0, 191, 255, 0.8)'; ctx.lineWidth = 2; ctx.stroke();

        // Draw zoom view only after triangle is finalized
        drawZoomView(stoppedPoints);
    }

    // --- Zoom View Drawing ---
    function clearZoomCanvas() {
        zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        zoomCtx.fillStyle = '#1e2127'; // Match background
        zoomCtx.fillRect(0, 0, zoomCanvas.width, zoomCanvas.height);
         // Optional: Draw placeholder text
        zoomCtx.fillStyle = '#555';
        zoomCtx.font = '12px Inter';
        zoomCtx.textAlign = 'center';
        zoomCtx.fillText('Zoom view appears after result', zoomCanvas.width / 2, zoomCanvas.height / 2);
    }

    function drawZoomView(points) {
        clearZoomCanvas();
        if (!points || points.length < 3) return;

        const center = { x: simCenterX, y: simCenterY };
        let minDistSq = Infinity;
        let closestLine = null; // { p1: {x,y}, p2: {x,y}, distSq: num }
        let closestPointOnLine = null;

        // Find closest line segment to the center
        for (let i = 0; i < 3; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % 3];
            const lenSq = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
            if (lenSq === 0) continue; // Avoid division by zero for coincident points

            // Project center onto the line defined by p1, p2
            const t = ((center.x - p1.x) * (p2.x - p1.x) + (center.y - p1.y) * (p2.y - p1.y)) / lenSq;
            let currentClosestPoint;
            let distSq;

            if (t < 0) { // Closest point is p1
                currentClosestPoint = p1;
                distSq = (center.x - p1.x)**2 + (center.y - p1.y)**2;
            } else if (t > 1) { // Closest point is p2
                currentClosestPoint = p2;
                distSq = (center.x - p2.x)**2 + (center.y - p2.y)**2;
            } else { // Closest point is projection onto the segment
                currentClosestPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
                distSq = (center.x - currentClosestPoint.x)**2 + (center.y - currentClosestPoint.y)**2;
            }

            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestLine = { p1, p2 };
                closestPointOnLine = currentClosestPoint;
            }
        }

        if (!closestLine) return;

        const minDist = Math.sqrt(minDistSq);

        // --- Dynamic Scaling ---
        const baseViewSize = 50; // How many simulation pixels the zoom view should roughly represent initially
        const minAllowedDist = 1; // Prevent extreme zoom / division by zero
        const effectiveDist = Math.max(minDist, minAllowedDist);
        const scale = Math.min(zoomCanvas.width / baseViewSize, 150 / effectiveDist); // Adjust max scale factor as needed

        zoomCtx.save();
        // Translate origin to center of zoom canvas
        zoomCtx.translate(zoomCanvas.width / 2, zoomCanvas.height / 2);
        // Scale
        zoomCtx.scale(scale, scale);
        // Translate so the simulation center (0,0 relative) is at the canvas center
        // The simulation center needs to be mapped to the view center.
        // We want the view centered around the simulation's center point.
        zoomCtx.translate(-center.x, -center.y);


        // --- Draw Elements ---
        // Draw closest line segment
        zoomCtx.beginPath();
        zoomCtx.moveTo(closestLine.p1.x, closestLine.p1.y);
        zoomCtx.lineTo(closestLine.p2.x, closestLine.p2.y);
        zoomCtx.strokeStyle = 'rgba(255, 193, 7, 0.9)'; // Amber line
        zoomCtx.lineWidth = 2 / scale; // Keep line width visually consistent
        zoomCtx.stroke();

        // Draw center point
        zoomCtx.beginPath();
        zoomCtx.arc(center.x, center.y, 3 / scale, 0, 2 * Math.PI); // Scale dot size too
        zoomCtx.fillStyle = '#e0e0e0';
        zoomCtx.fill();

        // --- Draw IN/OUT Labels ---
        // Determine which side is "IN" relative to the line segment p1 -> p2
        // Use cross product: (p2.x-p1.x)*(cy-p1.y) - (p2.y-p1.y)*(cx-p1.x)
        // The sign tells us which side the center is on relative to the directed line.
        // We need a point known to be inside the triangle (if possible) or outside.
        // For simplicity, let's use the line normal.
        const dx = closestLine.p2.x - closestLine.p1.x;
        const dy = closestLine.p2.y - closestLine.p1.y;
        // Normal vector (dy, -dx) points "left" of the direction p1->p2
        // Normal vector (-dy, dx) points "right"
        // We need to know if the center point is "inside" or "outside"
        // Let's check the orientation relative to the *closest point* on the line
        const normX = center.x - closestPointOnLine.x;
        const normY = center.y - closestPointOnLine.y;
        const labelDist = 15 / scale; // Distance labels from line

        // Position labels relative to the closest point on the line, along the normal from line to center
        const labelPosX = closestPointOnLine.x + normX * 0.5; // Position labels halfway between line and center
        const labelPosY = closestPointOnLine.y + normY * 0.5;
        const labelOutPosX = closestPointOnLine.x - normX * 0.5;
        const labelOutPosY = closestPointOnLine.y - normY * 0.5;


        zoomCtx.font = `${12 / scale}px Inter`;
        zoomCtx.textAlign = 'center';
        zoomCtx.textBaseline = 'middle';

        // Determine IN/OUT based on actual result
        const resultIsIn = isCenterInTriangleLogic();

        // Label the side the center is on
        zoomCtx.fillStyle = resultIsIn ? '#28a745' : '#dc3545'; // Green if center is IN, Red if OUT
        zoomCtx.fillText(resultIsIn ? 'IN' : 'OUT', labelPosX, labelPosY);

        // Label the opposite side
        zoomCtx.fillStyle = !resultIsIn ? '#28a745' : '#dc3545'; // Red if center is IN, Green if OUT
        zoomCtx.fillText(!resultIsIn ? 'IN' : 'OUT', labelOutPosX, labelOutPosY);


        zoomCtx.restore(); // Restore original context state
    }


    // --- Animation and Stopping Logic ---
    function updateDots() {
        if (!simulationRunning) return; // Don't update if not running
        dots.forEach(dot => {
            if (!dot.isStopped && !dot.isStopping) {
                dot.angle += dot.speed;
                if (dot.angle > 2 * Math.PI) dot.angle -= 2 * Math.PI; if (dot.angle < 0) dot.angle += 2 * Math.PI;
            } else if (dot.isStopping && !dot.isStopped) {
                dot.angle = dot.angleToStopAt;
            }
        });
    }
    function scheduleNextStop() {
        clearTimeout(stopSchedulingTimeout);
        const nonStoppingDots = dots.filter(d => !d.isStopping && !d.isStopped);
        if (simulationRunning && nonStoppingDots.length > 0 && stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            const dotsRemainingToSchedule = TOTAL_DOTS - dots.filter(d => d.isStopping || d.isStopped).length;
            const avgTimePerRemainingStop = timeLeft / Math.max(1, dotsRemainingToSchedule);
            const randomDelay = Math.random() * (avgTimePerRemainingStop * 0.6) + (avgTimePerRemainingStop * 0.1);
            stopSchedulingTimeout = setTimeout(() => { stopOneDot(); }, Math.max(50, Math.min(randomDelay, timeLeft - 100)));
        }
    }
    function stopOneDot() {
        if (!simulationRunning || stoppedDotsCount >= TOTAL_DOTS || timeLeft <= 0) return;
        const availableDots = dots.filter(d => !d.isStopping && !d.isStopped);
        if (availableDots.length === 0) return;
        const dotToStop = availableDots[Math.floor(Math.random() * availableDots.length)];
        dotToStop.isStopping = true; dotToStop.angleToStopAt = dotToStop.angle;
        const freezeDelay = Math.random() * 700 + 100;
        setTimeout(() => {
            // Check simulationRunning as well, in case it was stopped externally
            if (simulationRunning && timeLeft > 0 && !dotToStop.isStopped) {
                dotToStop.finalAngle = dotToStop.angleToStopAt; dotToStop.isStopped = true; stoppedDotsCount++;
                if (stoppedDotsCount === TOTAL_DOTS) { finalizeSimulation(); } else { scheduleNextStop(); }
            }
        }, Math.min(freezeDelay, timeLeft - 50));
    }
    function forceStopRemainingDots() {
        if (!simulationRunning) return; // Don't force stop if not running
        let changed = false;
        dots.forEach(dot => {
            if (!dot.isStopped) {
                dot.finalAngle = dot.angle; dot.isStopped = true; dot.isStopping = true; dot.angleToStopAt = dot.angle;
                stoppedDotsCount++; changed = true;
            }
        });
        if (changed || stoppedDotsCount === TOTAL_DOTS) { finalizeSimulation(); }
    }

    // --- Betting UI Update Functions ---
    function updateBankrollDisplay() { bankrollDisplay.textContent = `Bankroll: $${bankroll.toFixed(2)}`; }
    function updateCurrentBetDisplay() { currentBetDisplay.textContent = `Current Bet: $${currentBetAmount.toFixed(2)}`; }
    function updateBetSelectionButtons() {
        betInButton.classList.toggle('selected', selectedBetType === 'in');
        betOutButton.classList.toggle('selected', selectedBetType === 'out');
        betInButton.textContent = `Bet Center In (${ODDS_IN.toFixed(2)}x)`;
        betOutButton.textContent = `Bet Center Out (${ODDS_OUT.toFixed(2)}x)`;
    }
    function updateChipStates() {
        const chipElements = chipsContainer.querySelectorAll('.chip');
        chipElements.forEach(chip => {
            const chipValue = parseFloat(chip.dataset.value);
            chip.disabled = bettingLocked || bankroll < chipValue || simulationRunning; // Also disable chips if sim is running
        });
        clearBetButton.disabled = bettingLocked || currentBetAmount === 0 || simulationRunning;
        betInButton.disabled = bettingLocked || simulationRunning;
        betOutButton.disabled = bettingLocked || simulationRunning;
    }

    // --- Betting Logic Functions ---
    function handleBetSelection(event) {
        if (bettingLocked || simulationRunning) return;
        const newBetType = event.target.dataset.betType;
        selectedBetType = (selectedBetType === newBetType) ? null : newBetType;
        updateBetSelectionButtons();
    }
    function handleChipClick(event) {
        if (bettingLocked || simulationRunning) return;
        const chipValue = parseFloat(event.target.dataset.value);
        if (bankroll >= chipValue) {
            bankroll -= chipValue; currentBetAmount += chipValue;
            updateBankrollDisplay(); updateCurrentBetDisplay(); updateChipStates();
        } else {
            payoutMessageDisplay.textContent = "Not enough bankroll!";
            payoutMessageDisplay.className = 'payout-message lose';
            setTimeout(() => { if (payoutMessageDisplay.textContent === "Not enough bankroll!") { payoutMessageDisplay.textContent = ''; payoutMessageDisplay.className = 'payout-message'; } }, 2000);
        }
    }
    function handleClearBet() {
        if (bettingLocked || simulationRunning) return;
        if (currentBetAmount > 0) {
            bankroll += currentBetAmount; currentBetAmount = 0;
            updateBankrollDisplay(); updateCurrentBetDisplay(); updateChipStates();
        }
    }
    function handleResetBankroll() {
        if (simulationRunning) { // Prevent reset during active simulation
            payoutMessageDisplay.textContent = "Cannot reset while simulation is running.";
            payoutMessageDisplay.className = 'payout-message lose';
             setTimeout(() => { if (payoutMessageDisplay.textContent === "Cannot reset while simulation is running.") { payoutMessageDisplay.textContent = ''; payoutMessageDisplay.className = 'payout-message'; } }, 2000);
            return;
        }
        bankroll = STARTING_BANKROLL; currentBetAmount = 0; // Reset bet too
        bettingLocked = false; selectedBetType = null; // Reset selection
        updateBankrollDisplay(); updateCurrentBetDisplay(); updateChipStates();
        updateBetSelectionButtons();
        payoutMessageDisplay.textContent = "Bankroll reset to $1000.00";
        payoutMessageDisplay.className = 'payout-message no-bet';
        history = []; roundCounter = 0; // Clear history
        updateHistoryTable();
        clearZoomCanvas();
    }

    // --- History Table Function ---
    function updateHistoryTable() {
        historyTableBody.innerHTML = ''; // Clear existing rows
        // Display latest results first (optional, could reverse loop)
        const displayHistory = history.slice(-10).reverse(); // Show last 10, newest first

        displayHistory.forEach(entry => {
            const row = historyTableBody.insertRow();
            row.insertCell().textContent = entry.round;
            row.insertCell().textContent = entry.result;
            row.insertCell().textContent = entry.betType || '-';
            row.insertCell().textContent = `$${entry.betAmount.toFixed(2)}`;

            const payoutCell = row.insertCell();
            let payoutText = '-';
            let payoutClass = '';
            if (entry.payout !== null) {
                const profit = entry.payout - entry.betAmount;
                 if (profit > 0) {
                    payoutText = `+$${profit.toFixed(2)}`;
                    payoutClass = 'win';
                } else if (profit < 0) {
                    payoutText = `-$${Math.abs(profit).toFixed(2)}`;
                    payoutClass = 'lose';
                 } else if (entry.betAmount > 0) { // Bet returned (e.g. no type selected)
                    payoutText = '$0.00';
                    payoutClass = 'no-bet';
                 } else { // No bet placed
                     payoutText = '$0.00';
                     payoutClass = 'no-bet';
                 }
            }
             payoutCell.textContent = payoutText;
             if(payoutClass) payoutCell.classList.add(payoutClass);
        });
    }


    // --- Simulation Finalization and Payout ---
    function finalizeSimulation() {
        simulationRunning = false; // Mark simulation as ended
        clearTimeout(stopSchedulingTimeout);
        clearInterval(countdownInterval);
        if (timeLeft > 0) { timeLeft = 0; }
        updateTimerDisplay(); // Final timer update

        bettingLocked = true; // Keep locked briefly during payout/display
        updateChipStates();

        processPayout(); // Process bets
        checkIfCenterIsInTriangle(); // Update IN/OUT display
        updateHistoryTable(); // Add result to history

        // Unlock betting AFTER results are processed and displayed
        bettingLocked = false;
        updateChipStates(); // Re-enable controls for next round setup
        startButton.disabled = false; // Ensure start button is enabled
    }

    function processPayout() {
        roundCounter++;
        const resultIsTrue = isCenterInTriangleLogic();
        const resultText = resultIsTrue ? 'IN' : 'OUT';
        let payoutAmount = null; // Store the total amount returned/won
        let message = "No bet placed.";
        let messageClass = 'no-bet';

        if (selectedBetType && currentBetAmount > 0) {
            let playerWon = (selectedBetType === 'in' && resultIsTrue) || (selectedBetType === 'out' && !resultIsTrue);

            if (playerWon) {
                const payoutMultiplier = selectedBetType === 'in' ? ODDS_IN : ODDS_OUT;
                payoutAmount = currentBetAmount * payoutMultiplier; // Total return
                const profit = payoutAmount - currentBetAmount;
                bankroll += payoutAmount;
                message = `You won $${profit.toFixed(2)}! (Payout: $${payoutAmount.toFixed(2)})`;
                messageClass = 'win';
            } else {
                payoutAmount = 0; // Lost the bet
                message = `You lost $${currentBetAmount.toFixed(2)}.`;
                messageClass = 'lose';
            }
        } else if (currentBetAmount > 0 && !selectedBetType) {
             message = `No bet type selected. Bet of $${currentBetAmount.toFixed(2)} returned.`;
             messageClass = 'no-bet';
             bankroll += currentBetAmount; // Return the unplaced bet
             payoutAmount = currentBetAmount; // Returned amount
        } else {
             payoutAmount = 0; // No bet placed, no payout
        }

        // Add to history BEFORE resetting currentBetAmount
         history.push({
             round: roundCounter,
             result: resultText,
             betType: selectedBetType || '-',
             betAmount: currentBetAmount, // Log the bet that was just resolved
             payout: payoutAmount
         });

        // Update display
        payoutMessageDisplay.textContent = message;
        payoutMessageDisplay.className = `payout-message ${messageClass}`;
        updateBankrollDisplay();

        // Reset bet amount ONLY if clear bet is pressed (persistent bet)
        // currentBetAmount = 0; // REMOVED - Bet persists until cleared
        updateCurrentBetDisplay(); // Reflect the persistent bet amount
    }

    // --- Timer Functions ---
    function updateTimerDisplay() {
        if (!timerElement) return;
        let displayTime = Math.max(0, timeLeft);
        let seconds = Math.floor(displayTime / 1000);
        let milliseconds = displayTime % 1000;
        timerElement.textContent = `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;

        // Lock betting only when timer is low
        const shouldLock = (timeLeft <= 1000 && timeLeft > 0); // Lock only in the last second before 0
        if (shouldLock !== bettingLocked) {
            bettingLocked = shouldLock;
            updateChipStates();
        }
    }
    function startCountdown() {
        timeLeft = COUNTDOWN_DURATION;
        bettingLocked = false; // Ensure betting is unlocked at start
        simulationRunning = true; // Mark simulation as active
        updateChipStates(); // Disable controls during sim run
        updateTimerDisplay();

        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            timeLeft -= 10;
            if (timeLeft <= 0) {
                timeLeft = 0;
                clearInterval(countdownInterval);
                if (simulationRunning && stoppedDotsCount < TOTAL_DOTS) { // Check if still running
                    forceStopRemainingDots();
                }
            }
            updateTimerDisplay(); // Update display every 10ms
        }, 10);
    }

    // --- Game Loop ---
    function gameLoop() {
        // Only run the loop if the simulation is marked as running
        if (!simulationRunning) {
             cancelAnimationFrame(animationFrameId);
             return;
        }
        clearCanvas(); drawCircle(); updateDots(); dots.forEach(drawDot); drawTriangle();
        // Check conditions to continue
        if (stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            animationFrameId = requestAnimationFrame(gameLoop);
        } else {
             cancelAnimationFrame(animationFrameId);
             // Final draw might happen in finalizeSimulation if forced stop,
             // but ensure one last draw if loop terminates naturally.
             if (stoppedDotsCount === TOTAL_DOTS) {
                 clearCanvas(); drawCircle(); dots.forEach(drawDot); drawTriangle();
             }
             // FinalizeSimulation is called by stopOneDot or forceStopRemainingDots
        }
    }

    // --- Core Logic: Is Center in Triangle? ---
    function getStoppedPoints() {
         if (stoppedDotsCount < TOTAL_DOTS) return null;
         const points = dots.filter(d => d.isStopped && d.finalAngle !== null).map(d => ({
            x: simCenterX + radius * Math.cos(d.finalAngle),
            y: simCenterY + radius * Math.sin(d.finalAngle)
         }));
         return points.length === 3 ? points : null;
    }

    function isCenterInTriangleLogic() {
        const finalAngles = dots.filter(d => d.isStopped && d.finalAngle !== null)
                               .map(d => d.finalAngle).sort((a, b) => a - b);
        if (finalAngles.length < 3) return false;
        const arc1 = finalAngles[1] - finalAngles[0];
        const arc2 = finalAngles[2] - finalAngles[1];
        const arc3 = (2 * Math.PI) - (finalAngles[2] - finalAngles[0]);
        // Epsilon added to comparison to handle floating point inaccuracies near PI
        const epsilon = 1e-9;
        return (arc1 < Math.PI - epsilon && arc2 < Math.PI - epsilon && arc3 < Math.PI - epsilon && arc1 > epsilon && arc2 > epsilon && arc3 > epsilon);
    }

    function checkIfCenterIsInTriangle() {
        const resultIsTrue = isCenterInTriangleLogic();
        const pointsAvailable = getStoppedPoints() !== null;

        if (!pointsAvailable && stoppedDotsCount === TOTAL_DOTS) { // Check if points failed but should be there
             resultDisplay.textContent = 'Result: Error'; resultDisplay.className = 'out';
             console.error("Error calculating final positions.");
        } else if (pointsAvailable) {
            resultDisplay.textContent = resultIsTrue ? 'Result: IN' : 'Result: OUT';
            resultDisplay.className = resultIsTrue ? 'in' : 'out';
        } else {
             resultDisplay.textContent = 'Result: ---'; // Not finalized yet
             resultDisplay.className = 'default';
        }
        // Don't re-enable start button here, done in finalizeSimulation
    }


    // --- Event Listeners ---
    startButton.addEventListener('click', () => {
        if (currentBetAmount > 0 && !selectedBetType) {
             payoutMessageDisplay.textContent = "Please select 'Bet Center In' or 'Bet Center Out'.";
             payoutMessageDisplay.className = 'payout-message lose';
             return;
        }
        if (simulationRunning) return; // Prevent starting if already running

        startButton.disabled = true; // Disable immediately
        simulationRunning = true; // Set flag
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        clearTimeout(stopSchedulingTimeout); clearInterval(countdownInterval);

        initDots(); // Prepare dots and reset round state (keeps bet amount/type)
        startCountdown(); // Start timer (locks betting during run)
        scheduleNextStop();
        gameLoop();
    });

    betInButton.addEventListener('click', handleBetSelection);
    betOutButton.addEventListener('click', handleBetSelection);
    chipsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('chip') && !event.target.disabled) {
            handleChipClick(event);
        }
    });
    clearBetButton.addEventListener('click', handleClearBet);
    resetBankrollButton.addEventListener('click', handleResetBankroll);

    // --- Initial Page Load ---
    initializeGlobalBettingState(); // Set up bankroll, betting state once
    initDots(); // Set up initial dots
    clearCanvas(); drawCircle(); dots.forEach(drawDot); // Initial draw
    updateBetSelectionButtons(); // Ensure odds are displayed
});