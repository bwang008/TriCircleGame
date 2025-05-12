document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const zoomCanvas = document.getElementById('zoomCanvas');
    const zoomCtx = zoomCanvas.getContext('2d');
    const startButton = document.getElementById('startButton');
    const simulate10xButton = document.getElementById('simulate10xButton');
    const cancelSimulationButton = document.getElementById('cancelSimulationButton'); // New Button
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
    const COUNTDOWN_DURATION = 5000; // 5 seconds

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
    let currentBetAmount = 0.00; // Amount currently staged for betting
    let activeBetAmount = 0.00; // Amount actually deducted and used for payout calc
    let selectedBetType = null; // Persistent
    let bettingLocked = false; // Locks betting ONLY when timer <= 1s

    // --- History & Multi-run State ---
    let history = [];
    let roundCounter = 0;
    let isMultiRunning = false;
    let multiRunRemaining = 0;
    let multiRunCancelRequested = false; // Flag for cancel button

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

        timeLeft = COUNTDOWN_DURATION;
        updateTimerDisplay();
        resetForNewRound();
    }

    function initializeGlobalBettingState() {
        bankroll = STARTING_BANKROLL;
        currentBetAmount = 0.00;
        activeBetAmount = 0.00;
        selectedBetType = null;
        bettingLocked = false;
        simulationRunning = false;
        isMultiRunning = false;
        multiRunRemaining = 0;
        multiRunCancelRequested = false;

        updateBankrollDisplay();
        updateCurrentBetDisplay();
        updateBetSelectionButtons();
        updateChipStates();
        clearBetButton.disabled = (currentBetAmount === 0);
        cancelSimulationButton.style.display = 'none'; // Hide cancel initially
        updateHistoryTable();
        clearZoomCanvas();
    }

    function resetForNewRound() {
        bettingLocked = false;
        simulationRunning = false;
        activeBetAmount = 0.00; // Reset active bet for the new round

        // Only enable start buttons if a multi-run is NOT active or has been cancelled
        if (!isMultiRunning || multiRunCancelRequested) {
            startButton.disabled = false;
            simulate10xButton.disabled = false;
            cancelSimulationButton.style.display = 'none'; // Hide cancel button
        } else {
            cancelSimulationButton.style.display = 'block'; // Show cancel during multi-run
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
        if (stoppedDotsCount < TOTAL_DOTS) return;
        const stoppedPoints = getStoppedPoints();
        if (!stoppedPoints) return;

        ctx.beginPath(); ctx.moveTo(stoppedPoints[0].x, stoppedPoints[0].y);
        ctx.lineTo(stoppedPoints[1].x, stoppedPoints[1].y); ctx.lineTo(stoppedPoints[2].x, stoppedPoints[2].y);
        ctx.closePath(); ctx.strokeStyle = 'rgba(0, 191, 255, 0.8)'; ctx.lineWidth = 2; ctx.stroke();

        drawZoomView(stoppedPoints);
    }

    // --- Zoom View Drawing ---
    function clearZoomCanvas() {
        zoomCtx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        zoomCtx.fillStyle = '#1e2127';
        zoomCtx.fillRect(0, 0, zoomCanvas.width, zoomCanvas.height);
        // Only draw placeholder if simulation is NOT running and NOT finalized
        if (!simulationRunning && resultDisplay.textContent === 'Result: ---') {
             zoomCtx.fillStyle = '#555';
             zoomCtx.font = '12px Inter';
             zoomCtx.textAlign = 'center';
             zoomCtx.fillText('Zoom view appears after result', zoomCanvas.width / 2, zoomCanvas.height / 2);
        }
    }

    function drawZoomView(points) {
        clearZoomCanvas(); // Clear placeholder text before drawing
        if (!points || points.length < 3) return;

        const center = { x: simCenterX, y: simCenterY };
        let minDistSq = Infinity;
        let closestLine = null;
        let closestPointOnLine = null;

        for (let i = 0; i < 3; i++) {
            const p1 = points[i]; const p2 = points[(i + 1) % 3];
            const lenSq = (p2.x - p1.x)**2 + (p2.y - p1.y)**2;
            if (lenSq < 1e-9) continue;
            const t = ((center.x - p1.x) * (p2.x - p1.x) + (center.y - p1.y) * (p2.y - p1.y)) / lenSq;
            let currentClosestPoint, distSq;
            if (t < 0) { currentClosestPoint = p1; }
            else if (t > 1) { currentClosestPoint = p2; }
            else { currentClosestPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }; }
            distSq = (center.x - currentClosestPoint.x)**2 + (center.y - currentClosestPoint.y)**2;
            if (distSq < minDistSq) { minDistSq = distSq; closestLine = { p1, p2 }; closestPointOnLine = currentClosestPoint; }
        }

        if (!closestLine || !closestPointOnLine) return;

        const minDist = Math.sqrt(minDistSq);
        const baseViewSize = 50;
        const minAllowedDist = 0.5;
        const effectiveDist = Math.max(minDist, minAllowedDist);
        const scale = Math.min(zoomCanvas.width / baseViewSize, zoomCanvas.width / (2 * effectiveDist + 10) );

        zoomCtx.save();
        zoomCtx.translate(zoomCanvas.width / 2, zoomCanvas.height / 2);
        zoomCtx.scale(scale, scale);
        zoomCtx.translate(-center.x, -center.y);

        zoomCtx.beginPath();
        zoomCtx.moveTo(closestLine.p1.x, closestLine.p1.y);
        zoomCtx.lineTo(closestLine.p2.x, closestLine.p2.y);
        zoomCtx.strokeStyle = 'rgba(255, 193, 7, 0.9)';
        zoomCtx.lineWidth = 2 / scale;
        zoomCtx.stroke();

        zoomCtx.beginPath();
        zoomCtx.arc(center.x, center.y, 3 / scale, 0, 2 * Math.PI);
        zoomCtx.fillStyle = '#e0e0e0';
        zoomCtx.fill();

        const normX = center.x - closestPointOnLine.x;
        const normY = center.y - closestPointOnLine.y;
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
        zoomCtx.fillStyle = resultIsTrue ? '#28a745' : '#dc3545';
        zoomCtx.fillText(resultIsTrue ? 'IN' : 'OUT', labelPosX, labelPosY);
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
            const avgTimePerRemainingStop = timeLeft / Math.max(1, dotsRemainingToSchedule);
            const randomDelay = Math.random() * (avgTimePerRemainingStop * 0.7) + (avgTimePerRemainingStop * 0.1);
            stopSchedulingTimeout = setTimeout(() => { stopOneDot(); }, Math.max(50, Math.min(randomDelay, timeLeft - 100)));
        }
    }
    function stopOneDot() {
        if (!simulationRunning || stoppedDotsCount >= TOTAL_DOTS || timeLeft <= 0) return;
        const availableDots = dots.filter(d => !d.isStopping && !d.isStopped);
        if (availableDots.length === 0) return;
        const dotToStop = availableDots[Math.floor(Math.random() * availableDots.length)];
        dotToStop.isStopping = true; dotToStop.angleToStopAt = dotToStop.angle;
        const freezeDelay = Math.random() * 400 + 50;
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
        if (stoppedDotsCount === TOTAL_DOTS) { finalizeSimulation(); }
        else if (changed) { console.warn("Force stop issue."); finalizeSimulation(); }
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
        const disableControls = bettingLocked || simulationRunning || isMultiRunning;
        chipElements.forEach(chip => {
            const chipValue = parseFloat(chip.dataset.value);
            chip.disabled = disableControls || bankroll < chipValue; // Can't add chips if bankroll is too low, even if not deducted yet
        });
        clearBetButton.disabled = disableControls || currentBetAmount === 0;
        betInButton.disabled = disableControls;
        betOutButton.disabled = disableControls;
        startButton.disabled = simulationRunning || isMultiRunning;
        simulate10xButton.disabled = simulationRunning || isMultiRunning;
        cancelSimulationButton.style.display = isMultiRunning ? 'block' : 'none'; // Show/hide cancel button
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
        // Only check if bankroll can COVER the CURRENT bet + new chip, not deduct yet
        if (bankroll >= (currentBetAmount + chipValue)) {
             // Don't deduct from bankroll here
             currentBetAmount += chipValue;
             updateCurrentBetDisplay();
             updateChipStates(); // Re-evaluate chip states based on potential bet size vs bankroll
        } else {
            payoutMessageDisplay.textContent = "Bankroll too low to increase bet!";
            payoutMessageDisplay.className = 'payout-message lose';
            setTimeout(() => { if (payoutMessageDisplay.textContent === "Bankroll too low to increase bet!") { payoutMessageDisplay.textContent = ''; payoutMessageDisplay.className = 'payout-message'; } }, 2000);
        }
    }
    function handleClearBet() {
        if (bettingLocked || simulationRunning || isMultiRunning) return;
        if (currentBetAmount > 0) {
            // Don't add back to bankroll, just reset the staged bet
            currentBetAmount = 0;
            updateCurrentBetDisplay();
            updateChipStates();
        }
    }
    function handleResetBankroll() {
        if (simulationRunning || isMultiRunning) {
            payoutMessageDisplay.textContent = "Cannot reset while simulation is running.";
            payoutMessageDisplay.className = 'payout-message lose';
             setTimeout(() => { if (payoutMessageDisplay.textContent === "Cannot reset while simulation is running.") { payoutMessageDisplay.textContent = ''; payoutMessageDisplay.className = 'payout-message'; } }, 2000);
            return;
        }
        bankroll = STARTING_BANKROLL; currentBetAmount = 0; activeBetAmount = 0;
        bettingLocked = false; selectedBetType = null;
        updateBankrollDisplay(); updateCurrentBetDisplay(); updateChipStates();
        updateBetSelectionButtons();
        payoutMessageDisplay.textContent = "Bankroll reset to $1000.00";
        payoutMessageDisplay.className = 'payout-message no-bet';
        history = []; roundCounter = 0;
        updateHistoryTable();
        clearZoomCanvas();
    }
    function handleCancelSimulation() {
        if (isMultiRunning) {
            multiRunCancelRequested = true; // Set flag to stop after current run
            payoutMessageDisplay.textContent = "Cancelling multi-run after this round...";
            payoutMessageDisplay.className = 'payout-message info';
            cancelSimulationButton.disabled = true; // Prevent multiple clicks
        }
    }

    // --- History Table Function ---
    function updateHistoryTable() {
        historyTableBody.innerHTML = '';
        const displayHistory = history.slice(-10).reverse();
        displayHistory.forEach(entry => {
            const row = historyTableBody.insertRow();
            row.insertCell().textContent = entry.round;
            row.insertCell().textContent = entry.result;
            row.insertCell().textContent = entry.betType || '-';
            row.insertCell().textContent = `$${entry.betAmount.toFixed(2)}`; // Use activeBetAmount for history
            const payoutCell = row.insertCell();
            let payoutText = '-'; let payoutClass = '';
            if (entry.payout !== null) {
                const profit = entry.payout - entry.betAmount; // Profit = Payout - Stake
                 if (entry.payout > entry.betAmount) { payoutText = `+$${profit.toFixed(2)}`; payoutClass = 'win'; } // Win
                 else if (entry.payout === 0 && entry.betAmount > 0) { payoutText = `-$${entry.betAmount.toFixed(2)}`; payoutClass = 'lose'; } // Loss
                 else if (entry.payout === entry.betAmount && entry.betAmount > 0) { payoutText = '$0.00'; payoutClass = 'no-bet'; } // Push/Return
                 else { payoutText = '$0.00'; payoutClass = 'no-bet'; } // No bet placed
            }
             payoutCell.textContent = payoutText;
             if(payoutClass) payoutCell.classList.add(payoutClass);
        });
    }


    // --- Simulation Finalization and Payout ---
    function finalizeSimulation() {
        simulationRunning = false;
        clearTimeout(stopSchedulingTimeout);
        clearInterval(countdownInterval);
        if (timeLeft > 0) { timeLeft = 0; }
        updateTimerDisplay();

        clearCanvas(); drawCircle(); dots.forEach(drawDot); drawTriangle(); // Ensure final draw

        processPayout(); // Process bets
        checkIfCenterIsInTriangle(); // Update result display
        updateHistoryTable(); // Update history

        // Check multi-run status OR if cancel was requested
        if (isMultiRunning && multiRunRemaining > 0 && !multiRunCancelRequested) {
             // Bankroll check moved to startSingleSimulationCycle
             setTimeout(startSingleSimulationCycle, 1000); // 1 second delay
        } else {
            // End of single run, multi-run, or cancelled multi-run
            if (isMultiRunning) {
                 payoutMessageDisplay.textContent = multiRunCancelRequested ? `Multi-run cancelled. ${payoutMessageDisplay.textContent}` : `Simulate 10x complete. ${payoutMessageDisplay.textContent}`;
                 isMultiRunning = false;
                 multiRunRemaining = 0;
                 multiRunCancelRequested = false; // Reset cancel flag
            }
            bettingLocked = false; // Unlock betting
            updateChipStates(); // Re-enable controls
            startButton.disabled = false;
            simulate10xButton.disabled = false;
            cancelSimulationButton.style.display = 'none'; // Hide cancel button
        }
    }

    function processPayout() {
        roundCounter++;
        const resultIsTrue = isCenterInTriangleLogic();
        const resultText = resultIsTrue ? 'IN' : 'OUT';
        let payoutAmount = 0; // Payout is 0 by default (loss or no bet)
        let message = "No bet placed.";
        let messageClass = 'no-bet';
        const betPlaced = activeBetAmount > 0 && selectedBetType; // Use activeBetAmount

        if (betPlaced) {
            let playerWon = (selectedBetType === 'in' && resultIsTrue) || (selectedBetType === 'out' && !resultIsTrue);
            if (playerWon) {
                const payoutMultiplier = selectedBetType === 'in' ? ODDS_IN : ODDS_OUT;
                payoutAmount = activeBetAmount * payoutMultiplier; // Total return (stake + profit)
                const profit = payoutAmount - activeBetAmount;
                bankroll += payoutAmount; // Add total return to bankroll
                message = `Won $${profit.toFixed(2)}! (Payout: $${payoutAmount.toFixed(2)})`;
                messageClass = 'win';
            } else {
                // Loss: payoutAmount remains 0, bet was already deducted
                message = `Lost $${activeBetAmount.toFixed(2)}.`;
                messageClass = 'lose';
            }
        } else if (activeBetAmount > 0 && !selectedBetType) {
             // This case should be less likely if start button checks selection
             message = `Bet of $${activeBetAmount.toFixed(2)} returned (no type selected).`;
             messageClass = 'no-bet';
             bankroll += activeBetAmount; // Return deducted bet
             payoutAmount = activeBetAmount; // Payout equals returned stake
        }
        // If !betPlaced and activeBetAmount is 0, message remains "No bet placed."

         history.push({
             round: roundCounter, result: resultText, betType: selectedBetType || '-',
             betAmount: activeBetAmount, // Log the bet amount that was active for this round
             payout: payoutAmount // Log the actual payout received (0 for loss, stake+profit for win)
         });

        payoutMessageDisplay.textContent = message;
        payoutMessageDisplay.className = `payout-message ${messageClass}`;
        updateBankrollDisplay();
        // Don't reset currentBetAmount here - it persists
        updateCurrentBetDisplay();
        activeBetAmount = 0; // Reset active bet amount after processing
    }

    // --- Timer Functions ---
    function updateTimerDisplay() {
        if (!timerElement) return;
        let displayTime = Math.max(0, timeLeft);
        let seconds = Math.floor(displayTime / 1000);
        let milliseconds = displayTime % 1000;
        timerElement.textContent = `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;

        const shouldLock = (timeLeft <= 1000 && timeLeft > 0) && simulationRunning;
        if (shouldLock !== bettingLocked) {
            bettingLocked = shouldLock;
            updateChipStates();
        }
    }
    function startCountdown() {
        timeLeft = COUNTDOWN_DURATION;
        bettingLocked = false; // Ensure unlocked at start
        simulationRunning = true;
        updateChipStates(); // Disable controls during run
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
        if (stoppedDotsCount === TOTAL_DOTS) { drawTriangle(); } // Draw triangle if stopped
        if (stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            animationFrameId = requestAnimationFrame(gameLoop);
        } else { cancelAnimationFrame(animationFrameId); }
    }

    // --- Core Logic: Is Center in Triangle? ---
    function getStoppedPoints() {
         if (stoppedDotsCount < TOTAL_DOTS) return null;
         const points = dots.filter(d => d.isStopped && d.finalAngle !== null).map(d => ({
            x: simCenterX + radius * Math.cos(d.finalAngle), y: simCenterY + radius * Math.sin(d.finalAngle)
         }));
         if (points.length === 3 && points.every(p => !isNaN(p.x) && !isNaN(p.y))) { return points; }
         console.error("Failed to get valid stopped points:", points); return null;
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
        // Moved bankroll check here
        if (bankroll < currentBetAmount && currentBetAmount > 0) {
            payoutMessageDisplay.textContent = `Multi-run stopped. Insufficient bankroll ($${bankroll.toFixed(2)}) for bet ($${currentBetAmount.toFixed(2)}).`;
            payoutMessageDisplay.className = 'payout-message lose';
            isMultiRunning = false; multiRunRemaining = 0; multiRunCancelRequested = false;
            startButton.disabled = false; simulate10xButton.disabled = false; cancelSimulationButton.style.display = 'none';
            updateChipStates(); return;
        }
        // Cancel check
        if (!isMultiRunning || multiRunRemaining <= 0 || multiRunCancelRequested) {
            isMultiRunning = false; multiRunRemaining = 0; multiRunCancelRequested = false;
            updateChipStates(); // Re-enable controls
            startButton.disabled = false; simulate10xButton.disabled = false; cancelSimulationButton.style.display = 'none';
            if (multiRunCancelRequested) { // Show cancelled message if applicable
                 payoutMessageDisplay.textContent = `Multi-run cancelled. ${payoutMessageDisplay.textContent}`;
            }
            return;
        }

        multiRunRemaining--;
        payoutMessageDisplay.textContent = `Running simulation ${10 - multiRunRemaining} of 10...`;
        payoutMessageDisplay.className = 'payout-message info';

        // --- Deduct Bet at the START of the cycle ---
        if (currentBetAmount > 0) {
            activeBetAmount = currentBetAmount; // Set the active bet for this round
            bankroll -= activeBetAmount; // Deduct from bankroll
            updateBankrollDisplay();
        } else {
            activeBetAmount = 0; // Ensure active bet is 0 if no current bet
        }
        // ---

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        clearTimeout(stopSchedulingTimeout); clearInterval(countdownInterval);

        initDots(); startCountdown(); scheduleNextStop(); gameLoop();
    }


    // --- Event Listeners ---
    function setupEventListeners() {
        startButton.addEventListener('click', () => {
            if (currentBetAmount > 0 && !selectedBetType) {
                 payoutMessageDisplay.textContent = "Please select 'Bet Center In' or 'Bet Center Out'.";
                 payoutMessageDisplay.className = 'payout-message lose'; return;
            }
            // Check bankroll sufficient for the *current* bet amount
            if (bankroll < currentBetAmount && currentBetAmount > 0) {
                 payoutMessageDisplay.textContent = `Insufficient bankroll ($${bankroll.toFixed(2)}) for bet ($${currentBetAmount.toFixed(2)}).`;
                 payoutMessageDisplay.className = 'payout-message lose'; return;
            }
            if (simulationRunning || isMultiRunning) return;

            startButton.disabled = true; simulate10xButton.disabled = true;
            simulationRunning = true;
            updateChipStates(); // Disable betting controls

            resultDisplay.textContent = 'Result: ---'; resultDisplay.className = 'default';
            payoutMessageDisplay.textContent = ''; payoutMessageDisplay.className = 'payout-message';
            clearZoomCanvas();

            // --- Deduct Bet on Start ---
            if (currentBetAmount > 0) {
                activeBetAmount = currentBetAmount;
                bankroll -= activeBetAmount;
                updateBankrollDisplay();
            } else {
                activeBetAmount = 0;
            }
            // ---

            initDots(); startCountdown(); scheduleNextStop(); gameLoop();
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
             // Initial bankroll check for the first bet of the sequence
             if (bankroll < currentBetAmount) {
                 payoutMessageDisplay.textContent = `Insufficient bankroll ($${bankroll.toFixed(2)}) for bet ($${currentBetAmount.toFixed(2)}).`;
                 payoutMessageDisplay.className = 'payout-message lose'; return;
             }
             if (simulationRunning || isMultiRunning) return;

             isMultiRunning = true;
             multiRunRemaining = 10;
             multiRunCancelRequested = false; // Reset cancel flag
             startButton.disabled = true; simulate10xButton.disabled = true;
             cancelSimulationButton.style.display = 'block'; // Show cancel button
             cancelSimulationButton.disabled = false; // Ensure cancel is enabled
             updateChipStates(); // Disable betting controls

             startSingleSimulationCycle(); // Start the sequence
        });

        cancelSimulationButton.addEventListener('click', handleCancelSimulation); // Listener for cancel

        betInButton.addEventListener('click', handleBetSelection);
        betOutButton.addEventListener('click', handleBetSelection);
        chipsContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('chip') && !event.target.disabled) {
                handleChipClick(event);
            }
        });
        clearBetButton.addEventListener('click', handleClearBet);
        resetBankrollButton.addEventListener('click', handleResetBankroll);
    }

    // --- Initial Page Load ---
    initializeGlobalBettingState();
    initDots();
    clearCanvas(); drawCircle(); dots.forEach(drawDot);
    updateBetSelectionButtons();
    setupEventListeners(); // Set up listeners after initial setup
});