document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const zoomCanvas = document.getElementById('zoomCanvas');
    const zoomCtx = zoomCanvas.getContext('2d');
    const startButton = document.getElementById('startButton');
    const simulate10xButton = document.getElementById('simulate10xButton'); // New button
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
    const historyTableBody = document.getElementById('historyTable').querySelector('tbody');

    // --- Canvas and Simulation Constants ---
    const simCenterX = canvas.width / 2;
    const simCenterY = canvas.height / 2;
    const radius = canvas.width / 2 - 30;
    const dotRadius = 5;
    const TOTAL_DOTS = 3;
    const COUNTDOWN_DURATION = 5000; // Changed to 5 seconds

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
    let simulationRunning = false;

    // --- Betting State Variables ---
    let bankroll = STARTING_BANKROLL;
    let currentBetAmount = 0.00;
    let selectedBetType = null; // Persistent
    let bettingLocked = false; // Locks betting ONLY when timer <= 1s

    // --- History & Multi-run State ---
    let history = [];
    let roundCounter = 0;
    let isMultiRunning = false;
    let multiRunRemaining = 0;

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
        // Don't clear payout message here, cleared in resetForNewRound

        timeLeft = COUNTDOWN_DURATION;
        updateTimerDisplay();
        resetForNewRound(); // Resets only round-specific things
    }

    function initializeGlobalBettingState() {
        bankroll = STARTING_BANKROLL;
        currentBetAmount = 0.00;
        selectedBetType = null;
        bettingLocked = false;
        simulationRunning = false;
        isMultiRunning = false;
        multiRunRemaining = 0;

        updateBankrollDisplay();
        updateCurrentBetDisplay();
        updateBetSelectionButtons();
        updateChipStates();
        clearBetButton.disabled = (currentBetAmount === 0);
        updateHistoryTable();
        clearZoomCanvas();
    }

    function resetForNewRound() {
        bettingLocked = false;
        simulationRunning = false;
        // Only disable start buttons if a multi-run is NOT in progress
        if (!isMultiRunning) {
            startButton.disabled = false;
            simulate10xButton.disabled = false;
        }
        updateChipStates();
        clearBetButton.disabled = bettingLocked || currentBetAmount === 0;
        betInButton.disabled = bettingLocked;
        betOutButton.disabled = bettingLocked;
        payoutMessageDisplay.textContent = '';
        payoutMessageDisplay.className = 'payout-message';
        clearZoomCanvas();
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
        // Draw triangle only if simulation has finished (all dots stopped)
        if (stoppedDotsCount < TOTAL_DOTS) return;
        const stoppedPoints = getStoppedPoints();
        if (!stoppedPoints) {
            // console.error("Trying to draw triangle but points are invalid");
            return; // Don't draw if points aren't ready
        }

        ctx.beginPath(); ctx.moveTo(stoppedPoints[0].x, stoppedPoints[0].y);
        ctx.lineTo(stoppedPoints[1].x, stoppedPoints[1].y); ctx.lineTo(stoppedPoints[2].x, stoppedPoints[2].y);
        ctx.closePath(); ctx.strokeStyle = 'rgba(0, 191, 255, 0.8)'; ctx.lineWidth = 2; ctx.stroke();

        // Call zoom view draw AFTER triangle is confirmed drawable
        drawZoomView(stoppedPoints);
    }

    // --- Zoom View Drawing ---
    function clearZoomCanvas() {
        zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        zoomCtx.fillStyle = '#1e2127';
        zoomCtx.fillRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        zoomCtx.fillStyle = '#555';
        zoomCtx.font = '12px Inter';
        zoomCtx.textAlign = 'center';
        zoomCtx.fillText('Zoom view appears after result', zoomCanvas.width / 2, zoomCanvas.height / 2);
    }

    function drawZoomView(points) {
        clearZoomCanvas(); // Start fresh
        if (!points || points.length < 3) return;

        const center = { x: simCenterX, y: simCenterY };
        let minDistSq = Infinity;
        let closestLine = null;
        let closestPointOnLine = null;

        // Find closest line segment
        for (let i = 0; i < 3; i++) {
            const p1 = points[i]; const p2 = points[(i + 1) % 3];
            const lenSq = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
            if (lenSq < 1e-9) continue; // Skip if points are virtually identical

            const t = ((center.x - p1.x) * (p2.x - p1.x) + (center.y - p1.y) * (p2.y - p1.y)) / lenSq;
            let currentClosestPoint, distSq;
            if (t < 0) { currentClosestPoint = p1; }
            else if (t > 1) { currentClosestPoint = p2; }
            else { currentClosestPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }; }
            distSq = (center.x - currentClosestPoint.x)**2 + (center.y - currentClosestPoint.y)**2;

            if (distSq < minDistSq) {
                minDistSq = distSq; closestLine = { p1, p2 }; closestPointOnLine = currentClosestPoint;
            }
        }

        if (!closestLine || !closestPointOnLine) return; // Safety check

        const minDist = Math.sqrt(minDistSq);
        const baseViewSize = 50;
        const minAllowedDist = 0.5; // Reduced min distance
        const effectiveDist = Math.max(minDist, minAllowedDist);
        // Adjust scale calculation for potentially closer distances
        const scale = Math.min(zoomCanvas.width / baseViewSize, zoomCanvas.width / (2 * effectiveDist + 10) ); // Ensure some padding

        zoomCtx.save();
        zoomCtx.translate(zoomCanvas.width / 2, zoomCanvas.height / 2);
        zoomCtx.scale(scale, scale);
        // Center the view on the simulation's center point
        zoomCtx.translate(-center.x, -center.y);

        // Draw closest line segment
        zoomCtx.beginPath();
        zoomCtx.moveTo(closestLine.p1.x, closestLine.p1.y);
        zoomCtx.lineTo(closestLine.p2.x, closestLine.p2.y);
        zoomCtx.strokeStyle = 'rgba(255, 193, 7, 0.9)'; // Amber line
        zoomCtx.lineWidth = 2 / scale;
        zoomCtx.stroke();

        // Draw center point
        zoomCtx.beginPath();
        zoomCtx.arc(center.x, center.y, 3 / scale, 0, 2 * Math.PI);
        zoomCtx.fillStyle = '#e0e0e0';
        zoomCtx.fill();

        // Draw IN/OUT Labels
        const normX = center.x - closestPointOnLine.x;
        const normY = center.y - closestPointOnLine.y;
        // Place labels slightly offset from the line towards/away from center
        const labelOffsetFactor = 15 / scale;
        const normLen = Math.sqrt(normX*normX + normY*normY);
        const unitNormX = normLen > 1e-6 ? normX / normLen : 0;
        const unitNormY = normLen > 1e-6 ? normY / normLen : 0;

        const labelPosX = closestPointOnLine.x + unitNormX * labelOffsetFactor;
        const labelPosY = closestPointOnLine.y + unitNormY * labelOffsetFactor;
        const labelOutPosX = closestPointOnLine.x - unitNormX * labelOffsetFactor;
        const labelOutPosY = closestPointOnLine.y - unitNormY * labelOffsetFactor;

        zoomCtx.font = `${12 / scale}px Inter`;
        zoomCtx.textAlign = 'center';
        zoomCtx.textBaseline = 'middle';

        const resultIsTrue = isCenterInTriangleLogic();
        // Label side where center is
        zoomCtx.fillStyle = resultIsTrue ? '#28a745' : '#dc3545';
        zoomCtx.fillText(resultIsTrue ? 'IN' : 'OUT', labelPosX, labelPosY);
        // Label opposite side
        zoomCtx.fillStyle = !resultIsTrue ? '#28a745' : '#dc3545';
        zoomCtx.fillText(!resultIsTrue ? 'IN' : 'OUT', labelOutPosX, labelOutPosY);

        zoomCtx.restore();
    }

    // --- Animation and Stopping Logic ---
    function updateDots() {
        if (!simulationRunning) return;
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
            // Adjust timing for 5s duration - make stops happen a bit quicker on average
            const avgTimePerRemainingStop = timeLeft / Math.max(1, dotsRemainingToSchedule);
            const randomDelay = Math.random() * (avgTimePerRemainingStop * 0.7) + (avgTimePerRemainingStop * 0.1); // 10% to 80%
            stopSchedulingTimeout = setTimeout(() => { stopOneDot(); }, Math.max(50, Math.min(randomDelay, timeLeft - 100)));
        }
    }
    function stopOneDot() {
        if (!simulationRunning || stoppedDotsCount >= TOTAL_DOTS || timeLeft <= 0) return;
        const availableDots = dots.filter(d => !d.isStopping && !d.isStopped);
        if (availableDots.length === 0) return;
        const dotToStop = availableDots[Math.floor(Math.random() * availableDots.length)];
        dotToStop.isStopping = true; dotToStop.angleToStopAt = dotToStop.angle;
        // Shorter freeze delay to fit within 5s
        const freezeDelay = Math.random() * 400 + 50; // 0.05s to 0.45s
        setTimeout(() => {
            if (simulationRunning && timeLeft > 0 && !dotToStop.isStopped) {
                dotToStop.finalAngle = dotToStop.angleToStopAt; dotToStop.isStopped = true; stoppedDotsCount++;
                if (stoppedDotsCount === TOTAL_DOTS) { finalizeSimulation(); } else { scheduleNextStop(); }
            }
        }, Math.min(freezeDelay, timeLeft - 50));
    }
    function forceStopRemainingDots() {
        if (!simulationRunning) return;
        let changed = false;
        dots.forEach(dot => {
            if (!dot.isStopped) {
                dot.finalAngle = dot.angle; dot.isStopped = true; dot.isStopping = true; dot.angleToStopAt = dot.angle;
                stoppedDotsCount++; changed = true;
            }
        });
        // Ensure finalizeSimulation is called even if no dots were *newly* stopped
        // but the condition (timer end) requires finalization.
        if (stoppedDotsCount === TOTAL_DOTS) {
             finalizeSimulation();
        } else if (changed) {
             // This case shouldn't happen if logic is right, but as safety:
             console.warn("Force stop called, but not all dots were stopped.");
             finalizeSimulation(); // Still finalize
        }
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
        const disableControls = bettingLocked || simulationRunning || isMultiRunning; // Combined condition
        chipElements.forEach(chip => {
            const chipValue = parseFloat(chip.dataset.value);
            chip.disabled = disableControls || bankroll < chipValue;
        });
        clearBetButton.disabled = disableControls || currentBetAmount === 0;
        betInButton.disabled = disableControls;
        betOutButton.disabled = disableControls;
        // Also disable start buttons if multi-run is active
        startButton.disabled = simulationRunning || isMultiRunning;
        simulate10xButton.disabled = simulationRunning || isMultiRunning;
    }

    // --- Betting Logic Functions ---
    function handleBetSelection(event) {
        if (bettingLocked || simulationRunning || isMultiRunning) return;
        const newBetType = event.target.dataset.betType;
        selectedBetType = (selectedBetType === newBetType) ? null : newBetType;
        updateBetSelectionButtons();
    }
    function handleChipClick(event) {
        if (bettingLocked || simulationRunning || isMultiRunning) return;
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
        if (bettingLocked || simulationRunning || isMultiRunning) return;
        if (currentBetAmount > 0) {
            bankroll += currentBetAmount; currentBetAmount = 0;
            updateBankrollDisplay(); updateCurrentBetDisplay(); updateChipStates();
        }
    }
    function handleResetBankroll() {
        if (simulationRunning || isMultiRunning) {
            payoutMessageDisplay.textContent = "Cannot reset while simulation is running.";
            payoutMessageDisplay.className = 'payout-message lose';
             setTimeout(() => { if (payoutMessageDisplay.textContent === "Cannot reset while simulation is running.") { payoutMessageDisplay.textContent = ''; payoutMessageDisplay.className = 'payout-message'; } }, 2000);
            return;
        }
        bankroll = STARTING_BANKROLL; currentBetAmount = 0;
        bettingLocked = false; selectedBetType = null;
        updateBankrollDisplay(); updateCurrentBetDisplay(); updateChipStates();
        updateBetSelectionButtons();
        payoutMessageDisplay.textContent = "Bankroll reset to $1000.00";
        payoutMessageDisplay.className = 'payout-message no-bet';
        history = []; roundCounter = 0;
        updateHistoryTable();
        clearZoomCanvas();
    }

    // --- History Table Function ---
    function updateHistoryTable() {
        historyTableBody.innerHTML = '';
        const displayHistory = history.slice(-10).reverse(); // Show last 10, newest first
        displayHistory.forEach(entry => {
            const row = historyTableBody.insertRow();
            row.insertCell().textContent = entry.round;
            row.insertCell().textContent = entry.result;
            row.insertCell().textContent = entry.betType || '-';
            row.insertCell().textContent = `$${entry.betAmount.toFixed(2)}`;
            const payoutCell = row.insertCell();
            let payoutText = '-'; let payoutClass = '';
            if (entry.payout !== null) {
                const profit = entry.payout - entry.betAmount;
                 if (profit > 0) { payoutText = `+$${profit.toFixed(2)}`; payoutClass = 'win'; }
                 else if (profit < 0) { payoutText = `-$${Math.abs(profit).toFixed(2)}`; payoutClass = 'lose'; }
                 else if (entry.betAmount > 0) { payoutText = '$0.00'; payoutClass = 'no-bet'; }
                 else { payoutText = '$0.00'; payoutClass = 'no-bet'; }
            }
             payoutCell.textContent = payoutText;
             if(payoutClass) payoutCell.classList.add(payoutClass);
        });
         // Scroll to bottom (optional, maybe better to show newest at top)
        // const container = document.querySelector('.history-table-container');
        // container.scrollTop = container.scrollHeight;
    }


    // --- Simulation Finalization and Payout ---
    function finalizeSimulation() {
        simulationRunning = false; // Mark simulation as ended
        clearTimeout(stopSchedulingTimeout);
        clearInterval(countdownInterval);
        if (timeLeft > 0) { timeLeft = 0; }
        updateTimerDisplay(); // Final timer update

        // Ensure final state is drawn before payout/history update
        clearCanvas(); drawCircle(); dots.forEach(drawDot); drawTriangle();

        processPayout(); // Process bets based on the outcome
        checkIfCenterIsInTriangle(); // Update the IN/OUT result display
        updateHistoryTable(); // Add result to history

        // Check if we are in a multi-run sequence
        if (isMultiRunning && multiRunRemaining > 0) {
            // Check bankroll BEFORE starting next run
            if (bankroll < currentBetAmount && currentBetAmount > 0) {
                payoutMessageDisplay.textContent = `Multi-run stopped. Insufficient bankroll ($${bankroll.toFixed(2)}) for bet ($${currentBetAmount.toFixed(2)}).`;
                payoutMessageDisplay.className = 'payout-message lose';
                isMultiRunning = false;
                multiRunRemaining = 0;
                startButton.disabled = false; // Re-enable buttons
                simulate10xButton.disabled = false;
                updateChipStates(); // Update based on final state
            } else {
                // Delay slightly before starting next run
                setTimeout(startSingleSimulationCycle, 200); // 200ms delay
            }
        } else {
            // End of single run or multi-run
            if (isMultiRunning) { // If it was the end of a multi-run
                 payoutMessageDisplay.textContent = `Simulate 10x complete. ${payoutMessageDisplay.textContent}`; // Append previous message
                 isMultiRunning = false;
                 multiRunRemaining = 0;
            }
            bettingLocked = false; // Unlock betting for next round setup
            updateChipStates(); // Re-enable controls
            startButton.disabled = false; // Ensure start button is enabled
            simulate10xButton.disabled = false;
        }
    }

    function processPayout() {
        roundCounter++;
        const resultIsTrue = isCenterInTriangleLogic();
        const resultText = resultIsTrue ? 'IN' : 'OUT';
        let payoutAmount = null;
        let message = "No bet placed.";
        let messageClass = 'no-bet';

        if (selectedBetType && currentBetAmount > 0) {
            let playerWon = (selectedBetType === 'in' && resultIsTrue) || (selectedBetType === 'out' && !resultIsTrue);
            if (playerWon) {
                const payoutMultiplier = selectedBetType === 'in' ? ODDS_IN : ODDS_OUT;
                payoutAmount = currentBetAmount * payoutMultiplier;
                const profit = payoutAmount - currentBetAmount;
                bankroll += payoutAmount;
                message = `Won $${profit.toFixed(2)}! (Payout: $${payoutAmount.toFixed(2)})`;
                messageClass = 'win';
            } else {
                payoutAmount = 0;
                message = `Lost $${currentBetAmount.toFixed(2)}.`;
                messageClass = 'lose';
            }
        } else if (currentBetAmount > 0 && !selectedBetType) {
             message = `Bet of $${currentBetAmount.toFixed(2)} returned.`;
             messageClass = 'no-bet';
             bankroll += currentBetAmount;
             payoutAmount = currentBetAmount;
        } else {
             payoutAmount = 0;
        }

         history.push({
             round: roundCounter, result: resultText, betType: selectedBetType || '-',
             betAmount: currentBetAmount, payout: payoutAmount
         });

        payoutMessageDisplay.textContent = message;
        payoutMessageDisplay.className = `payout-message ${messageClass}`;
        updateBankrollDisplay();
        updateCurrentBetDisplay(); // Bet persists
    }

    // --- Timer Functions ---
    function updateTimerDisplay() {
        if (!timerElement) return;
        let displayTime = Math.max(0, timeLeft);
        let seconds = Math.floor(displayTime / 1000);
        let milliseconds = displayTime % 1000;
        timerElement.textContent = `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;

        const shouldLock = (timeLeft <= 1000 && timeLeft > 0) && simulationRunning; // Lock only in last second *during* simulation
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
                if (simulationRunning && stoppedDotsCount < TOTAL_DOTS) {
                    forceStopRemainingDots();
                }
            }
            updateTimerDisplay();
        }, 10);
    }

    // --- Game Loop ---
    function gameLoop() {
        if (!simulationRunning) { cancelAnimationFrame(animationFrameId); return; }
        clearCanvas(); drawCircle(); updateDots(); dots.forEach(drawDot);
        // Attempt to draw triangle continuously if stopped, fixes potential timing issue
        if (stoppedDotsCount === TOTAL_DOTS) {
            drawTriangle();
        }
        if (stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            animationFrameId = requestAnimationFrame(gameLoop);
        } else {
             cancelAnimationFrame(animationFrameId);
             // Final draw ensured in finalizeSimulation
        }
    }

    // --- Core Logic: Is Center in Triangle? ---
    function getStoppedPoints() {
         if (stoppedDotsCount < TOTAL_DOTS) return null;
         const points = dots.filter(d => d.isStopped && d.finalAngle !== null).map(d => ({
            x: simCenterX + radius * Math.cos(d.finalAngle),
            y: simCenterY + radius * Math.sin(d.finalAngle)
         }));
         // Add extra check for valid numbers, though unlikely needed if logic is sound
         if (points.length === 3 && points.every(p => !isNaN(p.x) && !isNaN(p.y))) {
             return points;
         }
         console.error("Failed to get valid stopped points:", points);
         return null;
    }

    function isCenterInTriangleLogic() {
        const finalAngles = dots.filter(d => d.isStopped && d.finalAngle !== null)
                               .map(d => d.finalAngle).sort((a, b) => a - b);
        if (finalAngles.length < 3) return false;
        const arc1 = finalAngles[1] - finalAngles[0];
        const arc2 = finalAngles[2] - finalAngles[1];
        const arc3 = (2 * Math.PI) - (finalAngles[2] - finalAngles[0]);
        const epsilon = 1e-9;
        return (arc1 < Math.PI - epsilon && arc2 < Math.PI - epsilon && arc3 < Math.PI - epsilon && arc1 > epsilon && arc2 > epsilon && arc3 > epsilon);
    }

    function checkIfCenterIsInTriangle() {
        const resultIsTrue = isCenterInTriangleLogic();
        const pointsAvailable = getStoppedPoints() !== null;
        if (!pointsAvailable && stoppedDotsCount === TOTAL_DOTS) {
             resultDisplay.textContent = 'Result: Error'; resultDisplay.className = 'out';
        } else if (pointsAvailable) {
            resultDisplay.textContent = resultIsTrue ? 'Result: IN' : 'Result: OUT';
            resultDisplay.className = resultIsTrue ? 'in' : 'out';
        } else {
             resultDisplay.textContent = 'Result: ---'; resultDisplay.className = 'default';
        }
    }

    // --- Multi-run Logic ---
    function startSingleSimulationCycle() {
        if (!isMultiRunning || multiRunRemaining <= 0) {
            isMultiRunning = false; // Ensure state is correct
            updateChipStates(); // Re-enable controls if needed
            return;
        }
         // Bankroll check before starting the cycle
        if (bankroll < currentBetAmount && currentBetAmount > 0) {
            payoutMessageDisplay.textContent = `Multi-run stopped. Insufficient bankroll ($${bankroll.toFixed(2)}) for bet ($${currentBetAmount.toFixed(2)}).`;
            payoutMessageDisplay.className = 'payout-message lose';
            isMultiRunning = false;
            multiRunRemaining = 0;
            startButton.disabled = false;
            simulate10xButton.disabled = false;
            updateChipStates();
            return;
        }


        multiRunRemaining--;
        payoutMessageDisplay.textContent = `Running simulation ${10 - multiRunRemaining} of 10...`;
        payoutMessageDisplay.className = 'payout-message info'; // Use info style

        // Reset necessary states for a new simulation run
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        clearTimeout(stopSchedulingTimeout); clearInterval(countdownInterval);

        initDots(); // Prepare dots
        startCountdown(); // Start timer
        scheduleNextStop(); // Start stopping sequence
        gameLoop(); // Start animation
    }


    // --- Event Listeners ---
    startButton.addEventListener('click', () => {
        if (currentBetAmount > 0 && !selectedBetType) {
             payoutMessageDisplay.textContent = "Please select 'Bet Center In' or 'Bet Center Out'.";
             payoutMessageDisplay.className = 'payout-message lose'; return;
        }
        if (simulationRunning || isMultiRunning) return;

        startButton.disabled = true; simulate10xButton.disabled = true; // Disable both
        simulationRunning = true;
        updateChipStates(); // Disable betting controls

        // Clear previous results before starting
        resultDisplay.textContent = 'Result: ---'; resultDisplay.className = 'default';
        payoutMessageDisplay.textContent = ''; payoutMessageDisplay.className = 'payout-message';
        clearZoomCanvas();

        initDots();
        startCountdown();
        scheduleNextStop();
        gameLoop();
    });

    simulate10xButton.addEventListener('click', () => {
         if (currentBetAmount > 0 && !selectedBetType) {
             payoutMessageDisplay.textContent = "Please select 'Bet Center In' or 'Bet Center Out'.";
             payoutMessageDisplay.className = 'payout-message lose'; return;
         }
         if (currentBetAmount === 0) {
              payoutMessageDisplay.textContent = "Please place a bet first.";
              payoutMessageDisplay.className = 'payout-message lose'; return;
         }
         if (bankroll < currentBetAmount) {
             payoutMessageDisplay.textContent = `Insufficient bankroll ($${bankroll.toFixed(2)}) for bet ($${currentBetAmount.toFixed(2)}).`;
             payoutMessageDisplay.className = 'payout-message lose'; return;
         }
         if (simulationRunning || isMultiRunning) return; // Don't start if already running

         isMultiRunning = true;
         multiRunRemaining = 10; // Set counter for 10 runs
         startButton.disabled = true; // Disable both start buttons
         simulate10xButton.disabled = true;
         updateChipStates(); // Disable betting controls

         startSingleSimulationCycle(); // Start the first run of the sequence
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
    initializeGlobalBettingState();
    initDots(); // Set up initial dots but don't start simulation
    clearCanvas(); drawCircle(); dots.forEach(drawDot); // Initial static draw
    updateBetSelectionButtons();
});