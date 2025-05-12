document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const startButton = document.getElementById('startButton');
    const resultDisplay = document.getElementById('resultDisplay');
    const timerElement = document.getElementById('countdownTimer');

    // --- Canvas and Simulation Constants ---
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 30; // Circle radius with padding
    const dotRadius = 5; // Visual radius of the dots
    const TOTAL_DOTS = 3;
    const COUNTDOWN_DURATION = 10000; // 10 seconds in milliseconds

    // --- Simulation State Variables ---
    let dots = []; // Array to hold dot objects
    let animationFrameId; // For managing the animation loop
    let stoppedDotsCount = 0; // Counter for stopped dots
    let countdownInterval; // For managing the timer interval
    let timeLeft = COUNTDOWN_DURATION; // Current time left on the countdown
    let stopSchedulingTimeout; // Timeout ID for staggering dot stop calls

    // --- Initialization and Setup ---

    /**
     * Initializes or resets the dots for the simulation.
     * Each dot gets a random starting angle, speed, and color.
     * Resets counters and the result display.
     */
    function initDots() {
        dots = []; // Clear existing dots
        for (let i = 0; i < TOTAL_DOTS; i++) {
            dots.push({
                id: i,
                angle: Math.random() * 2 * Math.PI, // Random starting angle (0 to 2PI)
                speed: (Math.random() * 0.04 + 0.01) * (Math.random() < 0.5 ? 1 : -1), // Random speed and direction
                color: `hsl(${Math.random() * 360}, 80%, 60%)`, // Random vibrant color
                isStopped: false,       // True if the dot has officially stopped
                isStopping: false,      // True if the dot has been selected to stop (angle captured)
                angleToStopAt: null,    // The angle at which the dot will stop (captured when isStopping is true)
                finalAngle: null,       // The confirmed angle after stopping
                x: 0, y: 0              // Current x, y coordinates on canvas (updated in drawDot)
            });
        }
        stoppedDotsCount = 0; // Reset counter
        resultDisplay.textContent = 'Result: ---'; // Reset result text
        resultDisplay.className = 'default'; // Reset result style

        // Reset timer display and value
        timeLeft = COUNTDOWN_DURATION;
        updateTimerDisplay(); // Show initial timer value
    }

    // --- Drawing Functions ---

    /**
     * Clears the entire canvas.
     */
    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Draws the main circle outline and a center point.
     */
    function drawCircle() {
        // Draw the main circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#888e99'; // Light grey for circle line on dark theme
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw a small dot at the center of the circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#bdc3c7'; // Light color for center dot
        ctx.fill();
    }

    /**
     * Draws a single dot on the canvas.
     * @param {object} dot - The dot object to draw.
     */
    function drawDot(dot) {
        // Determine the angle to use: finalAngle if stopped, current angle otherwise
        const currentAngle = dot.isStopped ? dot.finalAngle : dot.angle;
        dot.x = centerX + radius * Math.cos(currentAngle); // Calculate x position
        dot.y = centerY + radius * Math.sin(currentAngle); // Calculate y position

        // Draw the dot
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotRadius, 0, 2 * Math.PI);
        ctx.fillStyle = dot.color; // Use the dot's assigned color
        ctx.fill();
        ctx.strokeStyle = '#e0e0e0'; // Light border for the dot
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /**
     * Draws the triangle connecting the three stopped dots.
     * Only draws if all three dots have stopped.
     */
    function drawTriangle() {
        if (stoppedDotsCount < TOTAL_DOTS) return; // Don't draw if not all dots are stopped

        // Get the coordinates of the stopped dots
        const stoppedPoints = dots.filter(d => d.isStopped && d.finalAngle !== null).map(d => ({ // Ensure finalAngle is not null
            x: centerX + radius * Math.cos(d.finalAngle),
            y: centerY + radius * Math.sin(d.finalAngle)
        }));

        if (stoppedPoints.length < 3) return; // Safety check

        // Draw the triangle lines
        ctx.beginPath();
        ctx.moveTo(stoppedPoints[0].x, stoppedPoints[0].y);
        ctx.lineTo(stoppedPoints[1].x, stoppedPoints[1].y);
        ctx.lineTo(stoppedPoints[2].x, stoppedPoints[2].y);
        ctx.closePath(); // Connect back to the first point
        ctx.strokeStyle = 'rgba(0, 191, 255, 0.8)'; // Bright blue for triangle lines
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // --- Animation and Stopping Logic ---

    /**
     * Updates the angles of dots that are still moving.
     */
    function updateDots() {
        dots.forEach(dot => {
            // Only update angle if the dot is not stopped and not in the process of stopping
            if (!dot.isStopped && !dot.isStopping) {
                dot.angle += dot.speed;
                // Keep angle within 0 to 2PI range
                if (dot.angle > 2 * Math.PI) dot.angle -= 2 * Math.PI;
                if (dot.angle < 0) dot.angle += 2 * Math.PI;
            } else if (dot.isStopping && !dot.isStopped) {
                // If chosen to stop but not yet officially stopped, fix its angle
                // This ensures that if there's a delay in the 'freezeDelay' timeout,
                // the dot doesn't continue to drift visually from its 'angleToStopAt'.
                dot.angle = dot.angleToStopAt;
            }
        });
    }

    /**
     * Schedules the next dot to be selected for stopping.
     * Introduces a random delay to stagger the stops.
     */
    function scheduleNextStop() {
        clearTimeout(stopSchedulingTimeout); // Clear any previous schedule

        const nonStoppingDots = dots.filter(d => !d.isStopping && !d.isStopped);
        // Proceed if there are dots to stop, all dots haven't stopped yet, and time is left
        if (nonStoppingDots.length > 0 && stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            // Calculate a random delay for the next stop.
            // The delay is somewhat proportional to the average time left per remaining dot.
            const dotsRemainingToSchedule = TOTAL_DOTS - dots.filter(d => d.isStopping || d.isStopped).length;
            const avgTimePerRemainingStop = timeLeft / Math.max(1, dotsRemainingToSchedule); // Avoid division by zero
            const randomDelay = Math.random() * (avgTimePerRemainingStop * 0.6) + (avgTimePerRemainingStop * 0.1); // 10% to 70% of avg segment

            stopSchedulingTimeout = setTimeout(() => {
                stopOneDot(); // Call function to pick and stop a dot
            }, Math.max(50, Math.min(randomDelay, timeLeft - 100))); // Ensure delay is positive and stop is scheduled before timer strictly ends
        }
    }

    /**
     * Selects a random moving dot, captures its current angle, and sets it to stop after a short delay.
     */
    function stopOneDot() {
        if (stoppedDotsCount >= TOTAL_DOTS || timeLeft <= 0) return; // Exit if all stopped or time up

        const availableDots = dots.filter(d => !d.isStopping && !d.isStopped);
        if (availableDots.length === 0) return; // No available dots to stop

        const dotToStop = availableDots[Math.floor(Math.random() * availableDots.length)];

        dotToStop.isStopping = true; // Mark as being in the process of stopping
        dotToStop.angleToStopAt = dotToStop.angle; // CRITICAL: Capture current angle immediately

        // Short random delay before the dot is officially marked "isStopped"
        const freezeDelay = Math.random() * 700 + 100; // 0.1 to 0.8 seconds

        setTimeout(() => {
            // Check conditions again in case timer ran out or dot was force-stopped
            if (timeLeft > 0 && !dotToStop.isStopped) { // Ensure dot wasn't already stopped (e.g., by forceStop)
                dotToStop.finalAngle = dotToStop.angleToStopAt; // Set final angle from captured one
                dotToStop.isStopped = true;
                stoppedDotsCount++;

                if (stoppedDotsCount === TOTAL_DOTS) {
                    finalizeSimulation(); // All dots have stopped naturally
                } else {
                    scheduleNextStop(); // Schedule the next dot to be chosen
                }
            }
        }, Math.min(freezeDelay, timeLeft - 50)); // Ensure freeze happens before timer strictly ends, with a small buffer
    }

    /**
     * Forces any remaining moving dots to stop immediately.
     * Called when the countdown timer reaches zero.
     */
    function forceStopRemainingDots() {
        let changed = false; // Flag to see if any dot was actually force-stopped
        dots.forEach(dot => {
            if (!dot.isStopped) {
                dot.finalAngle = dot.angle; // Capture current angle at moment of force stop
                dot.isStopped = true;
                dot.isStopping = true; // Ensure consistency
                dot.angleToStopAt = dot.angle; // Ensure consistency
                stoppedDotsCount++;
                changed = true;
            }
        });
        // If any dot was force-stopped or if all dots are now confirmed stopped
        if (changed || stoppedDotsCount === TOTAL_DOTS) { // Check if any dot was actually force-stopped or if all are now stopped
             finalizeSimulation();
        }
    }

    /**
     * Handles the end of the simulation (all dots stopped or timer up).
     * Clears timers, updates display, and checks the triangle.
     */
    function finalizeSimulation() {
        clearTimeout(stopSchedulingTimeout); // Stop any pending stop schedules
        clearInterval(countdownInterval);   // Stop the main countdown

        if (timeLeft > 0) { // If simulation ended before timer ran out
            timeLeft = 0; // Set timer to 0
        }
        updateTimerDisplay(); // Ensure timer display shows 00.000
        checkIfCenterIsInTriangle(); // Determine and display IN/OUT result
        // The game loop will stop itself based on stoppedDotsCount or timeLeft.
        // The startButton is re-enabled in checkIfCenterIsInTriangle.
    }


    // --- Timer Functions ---

    /**
     * Updates the countdown timer display on the webpage.
     */
    function updateTimerDisplay() {
        if (!timerElement) return;
        let displayTime = Math.max(0, timeLeft); // Prevent negative display
        let seconds = Math.floor(displayTime / 1000);
        let milliseconds = displayTime % 1000;
        // Format as SS.mmm (e.g., 09.500)
        timerElement.textContent = `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    /**
     * Starts the 10-second countdown timer.
     */
    function startCountdown() {
        timeLeft = COUNTDOWN_DURATION; // Reset time
        updateTimerDisplay(); // Show initial time

        clearInterval(countdownInterval); // Clear any existing timer
        countdownInterval = setInterval(() => {
            timeLeft -= 10; // Decrement by 10ms for smooth millisecond display

            if (timeLeft <= 0) {
                timeLeft = 0; // Clamp to zero
                clearInterval(countdownInterval); // Stop this interval
                forceStopRemainingDots(); // Timer ended, force stop any moving dots
            }
            updateTimerDisplay(); // Update display every 10ms
        }, 10);
    }

    // --- Game Loop ---

    /**
     * The main animation loop. Clears canvas, updates and draws elements.
     */
    function gameLoop() {
        clearCanvas();
        drawCircle();
        updateDots(); // Update dot positions/angles
        dots.forEach(drawDot); // Draw each dot
        drawTriangle(); // Draw triangle if applicable

        // Continue animation if not all dots are stopped AND there's time left
        if (stoppedDotsCount < TOTAL_DOTS && timeLeft > 0) {
            animationFrameId = requestAnimationFrame(gameLoop);
        } else {
            // Animation stops
            cancelAnimationFrame(animationFrameId);
            // Ensure final state is drawn, especially if forceStopRemainingDots was called
            // or if loop terminated due to timer/all dots stopped.
            clearCanvas();
            drawCircle();
            dots.forEach(drawDot); // Ensure dots are drawn at their final positions
            drawTriangle();
            // The startButton is re-enabled in finalizeSimulation via checkIfCenterIsInTriangle.
        }
    }

    // --- Core Logic: Is Center in Triangle? ---

    /**
     * Checks if the center of the circle is inside the triangle formed by the three stopped dots.
     * Updates the result display.
     */
    function checkIfCenterIsInTriangle() {
        // Get sorted final angles of the stopped dots
        const finalAngles = dots.filter(d => d.isStopped && d.finalAngle !== null) // Ensure finalAngle is not null
                               .map(d => d.finalAngle)
                               .sort((a, b) => a - b);

        // Ensure we have three valid angles
        if (finalAngles.length < 3) {
            console.error("Error: Less than 3 valid final angles for triangle check.", dots);
            resultDisplay.textContent = 'Result: Error';
            resultDisplay.className = 'out'; // Use 'out' style for error or create a new one
            startButton.disabled = false; // Re-enable start button
            return;
        }

        // Calculate the lengths of the three arcs formed by the points
        const arc1 = finalAngles[1] - finalAngles[0];
        const arc2 = finalAngles[2] - finalAngles[1];
        const arc3 = (2 * Math.PI) - (finalAngles[2] - finalAngles[0]); // Arc from last point back to first

        // The center is inside if and only if all arc lengths are less than PI (180 degrees)
        if (arc1 < Math.PI && arc2 < Math.PI && arc3 < Math.PI && arc1 > 0 && arc2 > 0 && arc3 > 0) { // Added check for positive arc lengths
            resultDisplay.textContent = 'Result: IN';
            resultDisplay.className = 'in';
        } else {
            resultDisplay.textContent = 'Result: OUT';
            resultDisplay.className = 'out';
        }
        startButton.disabled = false; // Re-enable start button for another run
    }

    // --- Event Listeners ---

    /**
     * Handles the click event for the "Start Simulation" button.
     */
    startButton.addEventListener('click', () => {
        startButton.disabled = true; // Disable button during simulation

        // Clear any existing animation frames and timeouts/intervals
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        clearTimeout(stopSchedulingTimeout);
        clearInterval(countdownInterval);

        initDots(); // Initialize dot states and timer
        startCountdown(); // Start the 10-second timer
        scheduleNextStop(); // Start the process of stopping dots one by one
        gameLoop(); // Start the animation loop
    });

    // --- Initial Page Load ---
    initDots(); // Set up initial state (dots are static)
    // Perform an initial draw of the static scene
    clearCanvas();
    drawCircle();
    dots.forEach(drawDot);
});