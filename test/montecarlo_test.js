function isCenterInTriangle(angles) {
    angles.sort((a, b) => a - b);
    const arc1 = angles[1] - angles[0];
    const arc2 = angles[2] - angles[1];
    const arc3 = (2 * Math.PI) - (angles[2] - angles[0]);
    const epsilon = 1e-9;
    return (
        arc1 < Math.PI - epsilon &&
        arc2 < Math.PI - epsilon &&
        arc3 < Math.PI - epsilon &&
        arc1 > epsilon && arc2 > epsilon && arc3 > epsilon
    );
}

let inCount = 0, outCount = 0, N = 1000000;
for (let i = 0; i < N; i++) {
    const angles = [
        Math.random() * 2 * Math.PI,
        Math.random() * 2 * Math.PI,
        Math.random() * 2 * Math.PI
    ];
    if (isCenterInTriangle(angles)) inCount++;
    else outCount++;
}
console.log(`IN: ${(inCount/N*100).toFixed(2)}% (${inCount})`);
console.log(`OUT: ${(outCount/N*100).toFixed(2)}% (${outCount})`);