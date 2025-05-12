document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
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


    // --- Canvas and Simulation Constants ---
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 30;
    const dotRadius = 5;
    const TOTAL_DOTS = 3;
    const COUNTDOWN_DURATION = 10000;

    // --- Betting Constants ---
    const ODDS_IN = 4.0; // Payout multiplier if center is IN
    const ODDS_OUT = 4.0 / 3.0; // Payout multiplier if center is OUT (approx 1.333)
    const CHIP_VALUES = [1, 5, 10, 25, 100];

    // --- Simulation State Variables ---
    let dots = [];
    let animationFrameId;
    let stoppedDotsCount = 0;
    let countdownInterval;
    let timeLeft = COUNTDOWN_DURATION;
    let stopSchedulingTimeout;

    // --- Betting State Variables ---
    let bankroll = 1000.00;
    let currentBetAmount = 0.00;
    let selectedBetType = null; // 'in', 'out', or null
    let bettingLocked = false;

    // --- Initialization and Setup ---
    function initDots() {
        dots = [];
        for (let i = 0; i < TOTAL_DOTS; i++) {
            dots.push({
                id: i,
                angle: Math.random() * 2 * Math.PI,
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
        initBettingSystem(); // Initialize betting system for new round
    }

    function initBettingSystem() {
        updateBankrollDisplay();
        // currentBetAmount is reset after payout or on clear bet, not necessarily every round start if bet wasn't resolved.
        // However, for a new game, it makes sense to clear pending unresolved bets.
        if (currentBetAmount > 0) { // Return unresolved bet to bankroll
            bankroll += currentBetAmount;
            currentBetAmount = 0;
        }
        updateCurrentBetDisplay();
        selectedBetType = null;
        updateBetSelectionButtons();
        bettingLocked = false;
        updateChipStates();
        clearBetButton.disabled = false;
        betInButton.disabled = false;
        betOutButton.disabled = false;
    }


    // --- Drawing Functions (canvas related - unchanged) ---
    function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
    function drawCircle() {
        ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#888e99'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#bdc3c7'; ctx.fill();
    }
    function drawDot(dot) {
        const currentAngle = dot.isStopped ? dot.finalAngle : dot.angle;
        dot.x = centerX + radius * Math.cos(currentAngle); dot.y = centerY + radius * Math.sin(currentAngle);
        ctx.beginPath(); ctx.arc(dot.x, dot.y, dotRadius, 0, 2 * Math.PI);
        ctx.fillStyle = dot.color; ctx.fill();
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1; ctx.stroke();
    }
    function drawTriangle() {
        if (stoppedDotsCount < TOTAL_DOTS) return;
        const stoppedPoints = dots.filter(d => d.isStopped && d.finalAngle !== null).map(d => ({
            x: centerX + radius * Math.cos(d.finalAngle), y: centerY + radius * Math.sin(d.finalAngle)
        }));
        if (stoppedPoints.length < 3) return;
        ctx.beginPath(); ctx.moveTo(stoppedPoints[0].x, stoppedPoints[0].y);
        ctx.lineTo(stoppedPoints[1].x, stoppedPoints[1].y); ctx.lineTo(stoppedPoints[2].x, stoppedPoints[2].y);
        ctx.closePath(); ctx.strokeStyle = 'rgba(0, 191, 255, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
    }

    // --- Animation and Stopping Logic (canvas related - largely unchanged) ---
    function updateDots() {
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
        if (nonStoppingDots.length > 0 && stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            const dotsRemainingToSchedule = TOTAL_DOTS - dots.filter(d => d.isStopping || d.isStopped).length;
            const avgTimePerRemainingStop = timeLeft / Math.max(1, dotsRemainingToSchedule);
            const randomDelay = Math.random() * (avgTimePerRemainingStop * 0.6) + (avgTimePerRemainingStop * 0.1);
            stopSchedulingTimeout = setTimeout(() => { stopOneDot(); }, Math.max(50, Math.min(randomDelay, timeLeft - 100)));
        }
    }
    function stopOneDot() {
        if (stoppedDotsCount >= TOTAL_DOTS || timeLeft <= 0) return;
        const availableDots = dots.filter(d => !d.isStopping && !d.isStopped);
        if (availableDots.length === 0) return;
        const dotToStop = availableDots[Math.floor(Math.random() * availableDots.length)];
        dotToStop.isStopping = true; dotToStop.angleToStopAt = dotToStop.angle;
        const freezeDelay = Math.random() * 700 + 100;
        setTimeout(() => {
            if (timeLeft > 0 && !dotToStop.isStopped) {
                dotToStop.finalAngle = dotToStop.angleToStopAt; dotToStop.isStopped = true; stoppedDotsCount++;
                if (stoppedDotsCount === TOTAL_DOTS) { finalizeSimulation(); } else { scheduleNextStop(); }
            }
        }, Math.min(freezeDelay, timeLeft - 50));
    }
    function forceStopRemainingDots() {
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
    function updateBankrollDisplay() {
        bankrollDisplay.textContent = `Bankroll: $${bankroll.toFixed(2)}`;
    }
    function updateCurrentBetDisplay() {
        currentBetDisplay.textContent = `Current Bet: $${currentBetAmount.toFixed(2)}`;
    }
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
            chip.disabled = bettingLocked || bankroll < chipValue;
        });
        clearBetButton.disabled = bettingLocked || currentBetAmount === 0;
        betInButton.disabled = bettingLocked;
        betOutButton.disabled = bettingLocked;

    }

    // --- Betting Logic Functions ---
    function handleBetSelection(event) {
        if (bettingLocked) return;
        const newBetType = event.target.dataset.betType;
        if (selectedBetType === newBetType) {
            selectedBetType = null; // Toggle off
        } else {
            selectedBetType = newBetType;
        }
        updateBetSelectionButtons();
    }

    function handleChipClick(event) {
        if (bettingLocked) return;
        const chipValue = parseFloat(event.target.dataset.value);
        if (bankroll >= chipValue) {
            bankroll -= chipValue;
            currentBetAmount += chipValue;
            updateBankrollDisplay();
            updateCurrentBetDisplay();
            updateChipStates(); // Re-evaluate chip disabled states
        } else {
            // Optionally, provide feedback that bankroll is too low
            payoutMessageDisplay.textContent = "Not enough bankroll for this chip!";
            payoutMessageDisplay.className = 'payout-message lose'; // Use 'lose' style for error
            setTimeout(() => {
                 if (payoutMessageDisplay.textContent === "Not enough bankroll for this chip!") {
                    payoutMessageDisplay.textContent = '';
                    payoutMessageDisplay.className = 'payout-message';
                 }
            }, 2000);
        }
    }

    function handleClearBet() {
        if (bettingLocked) return;
        if (currentBetAmount > 0) {
            bankroll += currentBetAmount;
            currentBetAmount = 0;
            updateBankrollDisplay();
            updateCurrentBetDisplay();
            updateChipStates();
        }
    }


    // --- Simulation Finalization and Payout ---
    function finalizeSimulation() {
        clearTimeout(stopSchedulingTimeout);
        clearInterval(countdownInterval);
        if (timeLeft > 0) { timeLeft = 0; } // Ensure timer shows 0 if ended early
        updateTimerDisplay(); // Final timer update
        processPayout(); // Process bets before checking triangle for display
        checkIfCenterIsInTriangle(); // This will update resultDisplay
        // Betting is unlocked in initDots for the next round via startButton
    }

    function processPayout() {
        if (selectedBetType && currentBetAmount > 0) {
            const resultIsIn = isCenterInTriangleLogic(); // Get the actual outcome
            let playerWon = false;
            if (selectedBetType === 'in' && resultIsIn) {
                playerWon = true;
            } else if (selectedBetType === 'out' && !resultIsIn) {
                playerWon = true;
            }

            if (playerWon) {
                const payoutMultiplier = selectedBetType === 'in' ? ODDS_IN : ODDS_OUT;
                const winnings = currentBetAmount * payoutMultiplier;
                bankroll += winnings; // Add total return (stake + profit)
                payoutMessageDisplay.textContent = `You won $${(winnings - currentBetAmount).toFixed(2)}! (Total: $${winnings.toFixed(2)})`;
                payoutMessageDisplay.className = 'payout-message win';
            } else {
                payoutMessageDisplay.textContent = `You lost $${currentBetAmount.toFixed(2)}.`;
                payoutMessageDisplay.className = 'payout-message lose';
                // Bankroll was already reduced when bet was placed.
            }
        } else if (currentBetAmount > 0 && !selectedBetType) {
             payoutMessageDisplay.textContent = `No bet type selected. Bet of $${currentBetAmount.toFixed(2)} returned.`;
             payoutMessageDisplay.className = 'payout-message no-bet';
             bankroll += currentBetAmount; // Return unplaced bet
        } else {
            payoutMessageDisplay.textContent = "No bet placed for this round.";
            payoutMessageDisplay.className = 'payout-message no-bet';
        }

        currentBetAmount = 0; // Reset bet amount for next round
        // selectedBetType is reset in initBettingSystem or if player clicks off
        updateBankrollDisplay();
        updateCurrentBetDisplay();
    }

    // --- Timer Functions ---
    function updateTimerDisplay() {
        if (!timerElement) return;
        let displayTime = Math.max(0, timeLeft);
        let seconds = Math.floor(displayTime / 1000);
        let milliseconds = displayTime % 1000;
        timerElement.textContent = `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;

        // Lock betting when timer is at 1 second or less
        if (timeLeft <= 1000 && !bettingLocked) {
            bettingLocked = true;
            updateChipStates();
            payoutMessageDisplay.textContent = "Betting closed!";
            payoutMessageDisplay.className = 'payout-message no-bet';
        } else if (timeLeft > 1000 && bettingLocked) {
            // This case might not be hit if bettingLocked is only set once per round start
            // bettingLocked = false; // Potentially unlock if timer resets upwards (not current logic)
            // updateChipStates();
        }
    }
    function startCountdown() {
        timeLeft = COUNTDOWN_DURATION;
        bettingLocked = false; // Unlock betting at start of new countdown
        updateChipStates();
        updateTimerDisplay();
        payoutMessageDisplay.textContent = ''; // Clear previous payout message
        payoutMessageDisplay.className = 'payout-message';


        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            timeLeft -= 10;
            if (timeLeft <= 0) {
                timeLeft = 0;
                clearInterval(countdownInterval);
                forceStopRemainingDots();
            }
            updateTimerDisplay();
        }, 10);
    }

    // --- Game Loop ---
    function gameLoop() {
        clearCanvas(); drawCircle(); updateDots(); dots.forEach(drawDot); drawTriangle();
        if (stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            animationFrameId = requestAnimationFrame(gameLoop);
        } else {
            cancelAnimationFrame(animationFrameId);
            clearCanvas(); drawCircle(); dots.forEach(drawDot); drawTriangle();
        }
    }

    // --- Core Logic: Is Center in Triangle? ---
    // This function now returns a boolean for payout logic and also updates display
    function isCenterInTriangleLogic() {
        const finalAngles = dots.filter(d => d.isStopped && d.finalAngle !== null)
                               .map(d => d.finalAngle).sort((a, b) => a - b);
        if (finalAngles.length < 3) return false; // Default to out if error
        const arc1 = finalAngles[1] - finalAngles[0];
        const arc2 = finalAngles[2] - finalAngles[1];
        const arc3 = (2 * Math.PI) - (finalAngles[2] - finalAngles[0]);
        return (arc1 < Math.PI && arc2 < Math.PI && arc3 < Math.PI && arc1 > 0 && arc2 > 0 && arc3 > 0);
    }

    function checkIfCenterIsInTriangle() {
        const resultIsTrue = isCenterInTriangleLogic(); // Get the boolean result

        if (dots.filter(d => d.isStopped && d.finalAngle !== null).length < 3) {
            resultDisplay.textContent = 'Result: Error';
            resultDisplay.className = 'out';
        } else if (resultIsTrue) {
            resultDisplay.textContent = 'Result: IN';
            resultDisplay.className = 'in';
        } else {
            resultDisplay.textContent = 'Result: OUT';
            resultDisplay.className = 'out';
        }
        startButton.disabled = false; // Re-enable start button for another run
    }


    // --- Event Listeners ---
    startButton.addEventListener('click', () => {
        startButton.disabled = true;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        clearTimeout(stopSchedulingTimeout); clearInterval(countdownInterval);

        initDots(); // This now also calls initBettingSystem
        startCountdown();
        scheduleNextStop();
        gameLoop();
    });

    betInButton.addEventListener('click', handleBetSelection);
    betOutButton.addEventListener('click', handleBetSelection);
    chipsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('chip')) {
            handleChipClick(event);
        }
    });
    clearBetButton.addEventListener('click', handleClearBet);

    // --- Initial Page Load ---
    initDots(); // Initial setup
    clearCanvas(); drawCircle(); dots.forEach(drawDot); // Initial draw
    // Ensure bet selection buttons show correct odds initially
    updateBetSelectionButtons();
});