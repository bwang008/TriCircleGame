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
    const resetBankrollButton = document.getElementById('resetBankrollButton'); // New Button


    // --- Canvas and Simulation Constants ---
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 30;
    const dotRadius = 5;
    const TOTAL_DOTS = 3;
    const COUNTDOWN_DURATION = 10000;

    // --- Betting Constants ---
    const ODDS_IN = 4.0;
    const ODDS_OUT = 4.0 / 3.0;
    const CHIP_VALUES = [1, 5, 10, 25, 100];
    const STARTING_BANKROLL = 1000.00; // Define starting bankroll

    // --- Simulation State Variables ---
    let dots = [];
    let animationFrameId;
    let stoppedDotsCount = 0;
    let countdownInterval;
    let timeLeft = COUNTDOWN_DURATION;
    let stopSchedulingTimeout;

    // --- Betting State Variables ---
    let bankroll = STARTING_BANKROLL;
    let currentBetAmount = 0.00;
    let selectedBetType = null; // 'in', 'out', or null - NOW PERSISTENT
    let bettingLocked = false; // Locks betting when timer is low or sim running

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
        // Don't init betting system here, it's initialized once on load
        // and updated as needed. Reset only specific things for a new round.
        resetForNewRound();
    }

    /**
     * Initializes the betting system state ONCE on page load.
     */
    function initializeGlobalBettingState() {
        bankroll = STARTING_BANKROLL;
        currentBetAmount = 0.00;
        selectedBetType = null; // Start with no selection
        bettingLocked = false; // Betting starts unlocked

        updateBankrollDisplay();
        updateCurrentBetDisplay();
        updateBetSelectionButtons();
        updateChipStates();
        clearBetButton.disabled = (currentBetAmount === 0); // Initial state
    }

    /**
     * Resets only the necessary states for starting a new simulation round.
     * Keeps bankroll and selectedBetType persistent.
     */
    function resetForNewRound() {
        // Return any unresolved bet from previous round if simulation was started without placing it
        if (currentBetAmount > 0 && !bettingLocked) {
             // This scenario is less likely now betting is allowed before start,
             // but keep as safety net.
             bankroll += currentBetAmount;
             currentBetAmount = 0;
             updateBankrollDisplay();
             updateCurrentBetDisplay();
        }
        // Betting lock is handled by the timer now. Ensure it starts unlocked.
        bettingLocked = false;
        updateChipStates(); // Enable chips/buttons
        clearBetButton.disabled = bettingLocked || currentBetAmount === 0;
        betInButton.disabled = bettingLocked;
        betOutButton.disabled = bettingLocked;
        payoutMessageDisplay.textContent = ''; // Clear previous messages
        payoutMessageDisplay.className = 'payout-message';
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
            // Disable chips if betting is locked OR bankroll is less than chip value
            chip.disabled = bettingLocked || bankroll < chipValue;
        });
        // Disable clear button if betting locked OR no bet placed
        clearBetButton.disabled = bettingLocked || currentBetAmount === 0;
        // Disable bet selection buttons only if betting is locked
        betInButton.disabled = bettingLocked;
        betOutButton.disabled = bettingLocked;
    }

    // --- Betting Logic Functions ---
    function handleBetSelection(event) {
        if (bettingLocked) return; // Check if betting is locked by timer/sim
        const newBetType = event.target.dataset.betType;
        if (selectedBetType === newBetType) {
            selectedBetType = null; // Toggle off if clicking the selected one
        } else {
            selectedBetType = newBetType; // Select the new one
        }
        updateBetSelectionButtons(); // Update visual state
    }

    function handleChipClick(event) {
        if (bettingLocked) return; // Check if betting is locked
        const chipValue = parseFloat(event.target.dataset.value);
        if (bankroll >= chipValue) {
            bankroll -= chipValue;
            currentBetAmount += chipValue;
            updateBankrollDisplay();
            updateCurrentBetDisplay();
            updateChipStates(); // Re-evaluate if player can afford more chips
        } else {
            // Feedback for insufficient funds
            payoutMessageDisplay.textContent = "Not enough bankroll for this chip!";
            payoutMessageDisplay.className = 'payout-message lose';
            setTimeout(() => {
                 if (payoutMessageDisplay.textContent === "Not enough bankroll for this chip!") {
                    payoutMessageDisplay.textContent = '';
                    payoutMessageDisplay.className = 'payout-message';
                 }
            }, 2000);
        }
    }

    function handleClearBet() {
        if (bettingLocked) return; // Check if betting is locked
        if (currentBetAmount > 0) {
            bankroll += currentBetAmount; // Return the bet amount to bankroll
            currentBetAmount = 0; // Reset bet amount
            updateBankrollDisplay();
            updateCurrentBetDisplay();
            updateChipStates(); // Re-enable chips if bankroll allows
        }
    }

    function handleResetBankroll() {
        // Confirmation might be good in a real app, but for simplicity:
        bankroll = STARTING_BANKROLL;
        // If there's a current bet, return it before resetting
        currentBetAmount = 0; // Reset current bet as well
        bettingLocked = false; // Ensure betting is unlocked

        updateBankrollDisplay();
        updateCurrentBetDisplay();
        updateChipStates(); // Update chip availability based on new bankroll
        payoutMessageDisplay.textContent = "Bankroll reset to $1000.00";
        payoutMessageDisplay.className = 'payout-message no-bet';

        // If simulation is running, this reset might be confusing, but allow it.
        // Consider disabling reset during active simulation if needed.
    }


    // --- Simulation Finalization and Payout ---
    function finalizeSimulation() {
        clearTimeout(stopSchedulingTimeout);
        clearInterval(countdownInterval);
        if (timeLeft > 0) { timeLeft = 0; }
        updateTimerDisplay(); // Final timer update to 00.000

        bettingLocked = true; // Ensure betting remains locked after sim ends
        updateChipStates(); // Visually disable controls

        processPayout(); // Process bets based on the outcome
        checkIfCenterIsInTriangle(); // Update the IN/OUT result display
        // Betting remains locked until 'Start Simulation' is pressed again
        // Start button is re-enabled in checkIfCenterIsInTriangle
    }

    function processPayout() {
        if (selectedBetType && currentBetAmount > 0) {
            const resultIsIn = isCenterInTriangleLogic();
            let playerWon = (selectedBetType === 'in' && resultIsIn) || (selectedBetType === 'out' && !resultIsIn);

            if (playerWon) {
                const payoutMultiplier = selectedBetType === 'in' ? ODDS_IN : ODDS_OUT;
                const winnings = currentBetAmount * payoutMultiplier; // Total return
                const profit = winnings - currentBetAmount;
                bankroll += winnings; // Add total return to bankroll
                payoutMessageDisplay.textContent = `You won $${profit.toFixed(2)}! (Payout: $${winnings.toFixed(2)})`;
                payoutMessageDisplay.className = 'payout-message win';
            } else {
                // Bet amount was already subtracted from bankroll
                payoutMessageDisplay.textContent = `You lost $${currentBetAmount.toFixed(2)}.`;
                payoutMessageDisplay.className = 'payout-message lose';
            }
        } else if (currentBetAmount > 0 && !selectedBetType) {
             payoutMessageDisplay.textContent = `No bet type selected. Bet of $${currentBetAmount.toFixed(2)} returned.`;
             payoutMessageDisplay.className = 'payout-message no-bet';
             bankroll += currentBetAmount; // Return the unplaced bet
        } else {
            // No bet was placed
            payoutMessageDisplay.textContent = "No bet placed for this round.";
            payoutMessageDisplay.className = 'payout-message no-bet';
        }

        currentBetAmount = 0; // Reset bet amount for the next round
        // selectedBetType persists
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

        // Lock betting when timer is at 1 second or less, if not already locked
        if (timeLeft <= 1000 && !bettingLocked) {
            bettingLocked = true;
            updateChipStates(); // Disable chips and buttons
            // Optionally show a message, but it might overwrite win/loss message too soon
            // payoutMessageDisplay.textContent = "Betting closed!";
            // payoutMessageDisplay.className = 'payout-message no-bet';
        }
        // Note: bettingLocked is reset to false in startCountdown
    }
    function startCountdown() {
        timeLeft = COUNTDOWN_DURATION;
        bettingLocked = false; // UNLOCK betting at start of new countdown
        updateChipStates(); // Re-enable controls based on bankroll
        updateTimerDisplay();
        // Clear previous payout message *only if* it wasn't just set by payout logic
        // This is tricky, maybe clear it in resetForNewRound instead.
        // payoutMessageDisplay.textContent = '';
        // payoutMessageDisplay.className = 'payout-message';

        clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            timeLeft -= 10;
            if (timeLeft <= 0) {
                timeLeft = 0;
                clearInterval(countdownInterval);
                // Only force stop if simulation hasn't naturally finished
                if (stoppedDotsCount < TOTAL_DOTS) {
                    forceStopRemainingDots();
                }
            }
            updateTimerDisplay(); // Update display every 10ms
        }, 10);
    }

    // --- Game Loop ---
    function gameLoop() {
        clearCanvas(); drawCircle(); updateDots(); dots.forEach(drawDot); drawTriangle();
        if (stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            animationFrameId = requestAnimationFrame(gameLoop);
        } else {
            cancelAnimationFrame(animationFrameId);
            // Ensure final state is drawn if loop terminates early
            clearCanvas(); drawCircle(); dots.forEach(drawDot); drawTriangle();
        }
    }

    // --- Core Logic: Is Center in Triangle? ---
    function isCenterInTriangleLogic() {
        const finalAngles = dots.filter(d => d.isStopped && d.finalAngle !== null)
                               .map(d => d.finalAngle).sort((a, b) => a - b);
        if (finalAngles.length < 3) return false;
        const arc1 = finalAngles[1] - finalAngles[0];
        const arc2 = finalAngles[2] - finalAngles[1];
        const arc3 = (2 * Math.PI) - (finalAngles[2] - finalAngles[0]);
        return (arc1 < Math.PI && arc2 < Math.PI && arc3 < Math.PI && arc1 > 0 && arc2 > 0 && arc3 > 0);
    }

    function checkIfCenterIsInTriangle() {
        const resultIsTrue = isCenterInTriangleLogic();
        if (dots.filter(d => d.isStopped && d.finalAngle !== null).length < 3) {
            resultDisplay.textContent = 'Result: Error'; resultDisplay.className = 'out';
        } else if (resultIsTrue) {
            resultDisplay.textContent = 'Result: IN'; resultDisplay.className = 'in';
        } else {
            resultDisplay.textContent = 'Result: OUT'; resultDisplay.className = 'out';
        }
        startButton.disabled = false; // Re-enable start button
    }


    // --- Event Listeners ---
    startButton.addEventListener('click', () => {
        // Ensure a bet type is selected if a bet amount exists
        if (currentBetAmount > 0 && !selectedBetType) {
             payoutMessageDisplay.textContent = "Please select 'Bet Center In' or 'Bet Center Out'.";
             payoutMessageDisplay.className = 'payout-message lose'; // Use 'lose' style for warning
             return; // Prevent starting simulation
        }

        startButton.disabled = true;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        clearTimeout(stopSchedulingTimeout); clearInterval(countdownInterval);

        initDots(); // Prepare dots and reset round state
        startCountdown(); // Start timer (also unlocks betting initially)
        scheduleNextStop(); // Start dot stopping sequence
        gameLoop(); // Start animation
    });

    betInButton.addEventListener('click', handleBetSelection);
    betOutButton.addEventListener('click', handleBetSelection);
    chipsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('chip') && !event.target.disabled) { // Check if chip and not disabled
            handleChipClick(event);
        }
    });
    clearBetButton.addEventListener('click', handleClearBet);
    resetBankrollButton.addEventListener('click', handleResetBankroll); // Listener for new button

    // --- Initial Page Load ---
    initializeGlobalBettingState(); // Set up bankroll, betting state once
    initDots(); // Set up initial dots
    clearCanvas(); drawCircle(); dots.forEach(drawDot); // Initial draw
    updateBetSelectionButtons(); // Ensure odds are displayed
});