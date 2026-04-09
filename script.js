let G = 6.67430e-11;
let ME = 5.972e24, RE = 6371000;
let MM = 7.342e22, RM = 1737400, DM = 384400000;
let SOI_MOON = 66183000;

let imgEarth = new Image(); imgEarth.src = 'earth.png';
let imgMoon = new Image(); imgMoon.src = 'moon.png';
let imgRocket = new Image(); imgRocket.src = 'rocket.png';
let imgBg = new Image(); imgBg.src = 'background.png';
let MODE = { NONE: 0, CUSTOM: 1, IRL: 2 };
let PHASE = {
    BOOT: 'BOOT', MODE_SELECT: 'MODE_SELECT', TUTORIAL: 'TUTORIAL', LEO: 'LEO', PLANNING: 'PLANNING', COASTING: 'COASTING', IRL_ACTIVE: 'IRL_ACTIVE', WIN: 'WIN', LOSE: 'LOSE'
};

let gMode = MODE.NONE;
let phase = PHASE.BOOT;
let missionName = 'ARTEMIS II';
let isPaused = false;
let warp = 1;
let sT = 0;
let rT = 0;
let tracking = true;
let musicEnabled = true;
let earth = { x: 0, y: 0, mass: ME, r: RE };

let moonV0 = Math.sqrt((G * ME) / DM);
let moon = { x: DM, y: 0, vx: 0, vy: moonV0, mass: MM, r: RM, trail: [] };

let CUSTOM_ALT = 400000;
let IRL_PERIGEE = 185000;
let IRL_APOGEE = 2222000;
let rAlt = CUSTOM_ALT;
let rocket;

function initRocket(perigeeAlt, apogeeAlt) {
    let rp = RE + perigeeAlt;
    let ra = RE + (apogeeAlt || perigeeAlt);
    let a = (rp + ra) / 2;
    let v = Math.sqrt(G * ME * (2 / rp - 1 / a));
    rocket = { x: 0, y: -rp, vx: v, vy: 0, trail: [] };
}
function resetMoon() {
    moon = { x: DM, y: 0, vx: 0, vy: moonV0, mass: MM, r: RM, trail: [] };
}
initRocket(CUSTOM_ALT);
let minDistM = Infinity;
let maxEarthDist = 0;
let passedM = false;
let cTime = 0;
let C_LIGHT = 299792458;
let srDilationUsec = 0;
let grDilationUsec = 0;
let tAcc = [0, 0];
let hypeActive = false;
let hypeTriggered = false;
let predMain = [], predPlus = [], predMinus = [], predMoonTrail = [];
let predMinDist = Infinity;
let predClosestPt = null;
let irlPredComputed = false;
let irlMinMoonDist = Infinity;
let irlApproachingMoon = true;
window.irlPRMDone = false;
window.irlTLIDone = false;

function resetAllState() {
    sT = 0; rT = 0; warp = 1;
    isPaused = false; cTime = 0;
    tAcc = [0, 0];
    minDistM = Infinity; maxEarthDist = 0;
    passedM = false; hypeTriggered = false;
    predMain = []; predPlus = []; predMinus = []; predMoonTrail = [];
    srDilationUsec = 0;
    grDilationUsec = 0;
    irlPredComputed = false;
    window.irlPRMDone = false;
    window.irlTLIDone = false;
    irlMinMoonDist = Infinity;
    irlApproachingMoon = true;
    userCamOverride = false;
    document.getElementById('time-warp-label').textContent = '1×';
    document.getElementById('elapsed-time').textContent = 'T+ 00:00:00';
    document.getElementById('v-vel').textContent = '0.00 km/s';
    document.getElementById('v-alt').textContent = '0 km';
    document.getElementById('v-closest').textContent = '—';
    document.getElementById('result-overlay').style.display = 'none';
    document.getElementById('btn-open-planner').style.display = 'block';
    document.getElementById('tel-time-control').style.display = 'flex';
    document.getElementById('tel-time-control').style.pointerEvents = 'auto';
    document.getElementById('time-slider').value = 0;
    document.getElementById('irl-overlay').style.display = 'none';
    document.getElementById('irl-phase-bar').style.display = 'none';

    setTracking(false);
    document.getElementById('gravity-overlay').style.display = 'none';
}
function grav(px, py, bodies) {
    let ax = 0, ay = 0;
    for (let i = 0; i < bodies.length; i++) {
        let b = bodies[i];
        let dx = b.x - px, dy = b.y - py;
        let r2 = dx * dx + dy * dy;
        let r = Math.sqrt(r2);
        let a = (G * b.mass) / r2;
        ax += (dx / r) * a;
        ay += (dy / r) * a;
    }
    return [ax, ay];
}


function stepVerlet(dt) {
    let earthBody = { x: earth.x, y: earth.y, mass: ME };
    let moonBody = { x: moon.x, y: moon.y, mass: MM };
    let am0 = grav(moon.x, moon.y, [earthBody]);
    let ar0 = grav(rocket.x, rocket.y, [earthBody, moonBody]);
    ar0[0] += tAcc[0]; ar0[1] += tAcc[1];
    let dt2h = 0.5 * dt * dt;
    moon.x += moon.vx * dt + am0[0] * dt2h;
    moon.y += moon.vy * dt + am0[1] * dt2h;
    rocket.x += rocket.vx * dt + ar0[0] * dt2h;
    rocket.y += rocket.vy * dt + ar0[1] * dt2h;
    let moonBody2 = { x: moon.x, y: moon.y, mass: MM };
    let am1 = grav(moon.x, moon.y, [earthBody]);
    let ar1 = grav(rocket.x, rocket.y, [earthBody, moonBody2]);
    ar1[0] += tAcc[0]; ar1[1] += tAcc[1];
    let hdt = 0.5 * dt;
    moon.vx += (am0[0] + am1[0]) * hdt;
    moon.vy += (am0[1] + am1[1]) * hdt;
    rocket.vx += (ar0[0] + ar1[0]) * hdt;
    rocket.vy += (ar0[1] + ar1[1]) * hdt;
    let dE = Math.sqrt(rocket.x * rocket.x + rocket.y * rocket.y);
    let dmx = moon.x - rocket.x, dmy = moon.y - rocket.y;
    let dM = Math.sqrt(dmx * dmx + dmy * dmy);

    if (dE <= RE) return 'CRASH_EARTH';
    if (dM <= RM) return 'CRASH_MOON';
    return 'OK';
}
function getPhysicsStep(r, m) {
    let dE = Math.sqrt(r.x * r.x + r.y * r.y);
    let dM = Math.hypot(m.x - r.x, m.y - r.y);
    let nearest = Math.min(dE, dM);
    if (nearest < RE * 2) return 10;
    if (nearest < SOI_MOON * 0.5) return 60;
    return 300;
}
function stepPred(r, m, dt) {
    let eb = { x: 0, y: 0, mass: ME };
    let mb = { x: m.x, y: m.y, mass: MM };
    let am0 = grav(m.x, m.y, [eb]);
    let ar0 = grav(r.x, r.y, [eb, mb]);
    let dt2h = 0.5 * dt * dt;
    m.x += m.vx * dt + am0[0] * dt2h;
    m.y += m.vy * dt + am0[1] * dt2h;
    r.x += r.vx * dt + ar0[0] * dt2h;
    r.y += r.vy * dt + ar0[1] * dt2h;
    let mb2 = { x: m.x, y: m.y, mass: MM };
    let am1 = grav(m.x, m.y, [eb]);
    let ar1 = grav(r.x, r.y, [eb, mb2]);
    let hdt = 0.5 * dt;
    m.vx += (am0[0] + am1[0]) * hdt;
    m.vy += (am0[1] + am1[1]) * hdt;
    r.vx += (ar0[0] + ar1[0]) * hdt;
    r.vy += (ar0[1] + ar1[1]) * hdt;
    let dE = Math.sqrt(r.x * r.x + r.y * r.y);
    let dx = m.x - r.x, dy = m.y - r.y;
    let dM = Math.sqrt(dx * dx + dy * dy);
    if (dE <= RE) return 'CRASH_EARTH';
    if (dM <= RM) return 'CRASH_MOON';
    return 'OK';
}


function clone(o) { return { x: o.x, y: o.y, vx: o.vx, vy: o.vy }; }

function simTrajectory(dv, ttiSec, out, isMain) {
    let sr = clone(rocket), sm = clone(moon);
    let coastT = 0;
    while (coastT < ttiSec) {
        let step = getPhysicsStep(sr, sm);
        if (coastT + step > ttiSec) step = ttiSec - coastT;
        stepPred(sr, sm, step);
        coastT += step;
    }
    let spd = Math.sqrt(sr.vx * sr.vx + sr.vy * sr.vy);
    if (spd > 0) { sr.vx += (sr.vx / spd) * dv; sr.vy += (sr.vy / spd) * dv; }

    let minDist = Infinity;
    let lastTx = sr.x, lastTy = sr.y;
    let tMax = 8 * 86400;
    let t = 0;

    while (t < tMax) {
        let dx = sm.x - sr.x, dy = sm.y - sr.y;
        let dRM = Math.sqrt(dx * dx + dy * dy);

        let step = getPhysicsStep(sr, sm);
        let status = stepPred(sr, sm, step);

        if (isMain) {
            if (dRM < minDist) { minDist = dRM; predClosestPt = { rx: sr.x, ry: sr.y, mx: sm.x, my: sm.y }; }
            if (Math.floor(t / 3600) != Math.floor((t + step) / 3600)) predMoonTrail.push({ x: sm.x, y: sm.y });
        }

        let tdx = sr.x - lastTx, tdy = sr.y - lastTy;
        if (tdx * tdx + tdy * tdy > 1.5e6 * 1.5e6) {
            out.push({ x: sr.x, y: sr.y });
            lastTx = sr.x; lastTy = sr.y;
        }

        if (status != 'OK') break;
        let dE = Math.sqrt(sr.x * sr.x + sr.y * sr.y);
        if (dE > DM * 2.5) break;

        t += step;
    }
    return minDist;
}


function calcPred() {
    if (phase != PHASE.PLANNING) return;
    predMain = []; predPlus = []; predMinus = []; predMoonTrail = [];
    predMinDist = Infinity; predClosestPt = null;

    let ttiSec = parseFloat(document.getElementById('tti-slider').value) * 60;
    let dv = parseFloat(document.getElementById('dv-slider').value);

    if (dv > 0) {
        predMinDist = simTrajectory(dv, ttiSec, predMain, true);
        simTrajectory(dv + 5, ttiSec, predPlus, false);
        simTrajectory(dv - 5, ttiSec, predMinus, false);
    }

    let closestEl = document.getElementById('v-closest');
    if (predMinDist < 1e9) {
        let altKm = Math.max(0, (predMinDist - RM) / 1000);
        closestEl.textContent = altKm.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' km';
    } else { closestEl.textContent = '—'; }
    syncFD();
}
let canvas = document.getElementById('simCanvas');
let ctx = canvas.getContext('2d');
canvas.width = window.innerWidth; canvas.height = window.innerHeight;

let cam = {
    x: 0, y: 0, scale: 0.000015, tx: 0, ty: 0, tScale: 0.000015, speed: 0.04
};

function w2s(wx, wy) {
    return {
        x: (wx - cam.x) * cam.scale + canvas.width / 2, y: (wy - cam.y) * cam.scale + canvas.height / 2
    };
}

function updateCamera() {
    if (tracking && rocket) {
        cam.tx = rocket.x;
        cam.ty = rocket.y;
    }
    cam.x += (cam.tx - cam.x) * cam.speed;
    cam.y += (cam.ty - cam.y) * cam.speed;
    cam.scale = cam.scale * Math.pow(cam.tScale / cam.scale, cam.speed);
}

function setCam(x, y, scale, speed) {
    cam.tx = x; cam.ty = y; cam.tScale = scale;
    if (speed != undefined) cam.speed = speed;
}
function setCamInstant(x, y, scale) {
    cam.x = cam.tx = x; cam.y = cam.ty = y; cam.scale = cam.tScale = scale;
}
let audioMain = document.getElementById('audio-interstellar');
let audioHype = document.getElementById('audio-hype');
audioMain.volume = 0;
audioHype.volume = 0;
let audioStarted = false;
let mainVolTarget = 0.22;
let hypeVolTarget = 0;


function startAudio() {
    if (!musicEnabled) return;
    audioMain.play().catch(() => { });
    audioMain.onended = () => {
        if (musicEnabled && phase != PHASE.WIN && phase != PHASE.LOSE) {
            audioMain.currentTime = 0;
            audioMain.play().catch(() => { });
        }
    };
    audioStarted = true;
}

function stopAllAudio() {
    mainVolTarget = 0;
    hypeVolTarget = 0;
}

function triggerHypeMusic() {
    if (!musicEnabled || hypeActive || hypeTriggered) return;
    hypeActive = true;
    hypeTriggered = true;
    audioMain.pause();
    mainVolTarget = 0;
    hypeVolTarget = 0.30;
    audioHype.currentTime = 0;
    audioHype.play().catch(() => { });
    audioHype.onended = () => {
        hypeActive = false;
        mainVolTarget = 0.22;
        hypeVolTarget = 0;
        audioMain.play().catch(() => { });
    };
}

function updateAudio(dt) {
    if (!musicEnabled) return;
    let rate = Math.min(2 * dt, 0.1);
    audioMain.volume = Math.max(0, Math.min(1, audioMain.volume + (mainVolTarget - audioMain.volume) * rate));
    if (hypeActive) {
        audioHype.volume = Math.max(0, Math.min(1, audioHype.volume + (hypeVolTarget - audioHype.volume) * rate));
    } else if (audioHype.volume > 0.005) {
        audioHype.volume = Math.max(0, audioHype.volume * 0.95);
    }
    if (audioMain.volume < 0.005 && mainVolTarget == 0) audioMain.pause();
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    document.getElementById('btn-music').textContent = musicEnabled ? '♫ MUSIC' : '♫ MUTED';
    if (musicEnabled) {
        mainVolTarget = 0.15;
        audioMain.volume = 0;
        audioMain.play().catch(() => { });
    } else {
        mainVolTarget = 0; hypeVolTarget = 0;
        audioMain.pause(); audioHype.pause();
    }
}
let fdEl = document.getElementById('fd-text');
let lastFdMsg = '';

function setFd(html) {
    if (html == lastFdMsg) return;
    lastFdMsg = html;
    fdEl.style.opacity = 0;
    setTimeout(() => { fdEl.innerHTML = html; fdEl.style.opacity = 1; }, 200);
}
fdEl.style.transition = 'opacity 0.2s ease';

function syncFD() {
    if (phase == PHASE.LEO) {
        let v = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
        setFd(`<strong class="hl">SYSTEMS NOMINAL — LEO</strong><br><br>` +
            `The spacecraft orbits at <strong>${(v / 1000).toFixed(1)} km/s</strong>. ` +
            `According to General Relativity,gravity isn't a force — it's the curvature of spacetime. ` +
            `The rocket follows a straight line through curved space.<br><br>` +
            `In Newtonian terms: the rocket is <em>falling</em> at ${(v / 1000).toFixed(1)} km/s sideways,` +
            `so fast that Earth's surface curves away beneath it. Centripetal acceleration perfectly matches gravitational pull.<br><br>` +
            `<em>Open the Maneuver Planner when ready.</em>`);
    } else if (phase == PHASE.PLANNING) {
        if (predMinDist == Infinity || predMinDist > 1e12) {
            setFd(`<strong>TLI COMPUTER ACTIVE</strong><br>` +
                `Set your Delta-V and Time to Ignition. Watch the three trajectories diverge — ` +
                `this is why NASA needs sub-meter-per-second precision.` +
                `<br><br><span style="font-size:0.85em; opacity:0.85"><strong style="color:#ef4444">RED (+5s)</strong>: Late ignition.<br><strong style="color:#3b82f6">BLUE (-5s)</strong>: Early ignition.<br><strong style="color:#f59e0b">YELLOW/ORANGE</strong>: Planned nominal route.</span>`);
        } else if (predMinDist > SOI_MOON) {
            setFd(`<strong class="warn">WARNING:</strong> Trajectory misses the lunar Sphere of Influence. ` +
                `Increase Delta-V or adjust timing.`);
        } else if (predMinDist > RM) {
            let altKm = ((predMinDist - RM) / 1000).toFixed(0);
            setFd(`<strong class="hl">LUNAR ENCOUNTER PREDICTED</strong><br>` +
                `Closest approach: <strong>${Number(altKm).toLocaleString()} km</strong> above the surface.<br><br>` +
                `You're inside the Moon's gravity well. Fine-tune your parameters. ` +
                `Notice how the <span class="bad">Red</span> and <span style="color:var(--blue)">Blue</span> error lines ` +
                `diverge wildly — a 5 m/s error (0.15%) can mean missing the Moon by tens of thousands of km.`);
        } else {
            setFd(`<strong class="bad">IMPACT WARNING</strong><br>Trajectory intersects the lunar surface. Reduce Delta-V or adjust timing.`);
        }
    } else if (phase == PHASE.COASTING) {
        let dM = Math.hypot(moon.x - rocket.x, moon.y - rocket.y);
        if (dM < SOI_MOON) {
            setFd(`<strong class="hl">LUNAR SOI ENTERED</strong><br>` +
                `The Moon's gravity is now the dominant force. Distance: <strong>${(dM / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km</strong>`);
        } else {
            let dE = Math.sqrt(rocket.x * rocket.x + rocket.y * rocket.y);
            setFd(`<strong>TLI BURN EXECUTED — COASTING</strong><br>` +
                `Distance from Earth: ${((dE - RE) / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km<br>` +
                `Use time warp to accelerate the transit.`);
        }
    }
}

let PHYSICS_STEP = 10;
let IRL_TIME_PRM = 5400;
let PRM_DV = 2200;
let IRL_TIME_TLI = 91800;
let IRL_BURN_DURATION = 350;
let IRL_DV = 450;
let IRL_MOON_ANGLE = 37 * Math.PI / 180;

let ephemerisNodes = [];

function scoreTraj(deg, dv) {
    let angle = deg * Math.PI / 180;
    let r0 = RE + IRL_PERIGEE;
    let ra = RE + IRL_APOGEE;
    let sma = (r0 + ra) / 2;
    let v0 = Math.sqrt(G * ME * (2 / r0 - 1 / sma));
    let sr = { x: 0, y: -r0, vx: v0, vy: 0 };
    let sm = {
        x: DM * Math.cos(angle), y: DM * Math.sin(angle), vx: -moonV0 * Math.sin(angle), vy: moonV0 * Math.cos(angle)
    };
    let t = 0;
    let ephem = [];
    let prevRdv = sr.x * sr.vx + sr.y * sr.vy;
    while (t < 20000) {
        let step = getPhysicsStep(sr, sm);
        stepPred(sr, sm, step);
        t += step;
        let rdv = sr.x * sr.vx + sr.y * sr.vy;
        if (prevRdv < 0 && rdv >= 0 && t > 3000) break;
        prevRdv = rdv;
    }
    let prmTime = t;
    ephem.push({ x: sr.x, y: sr.y, label: "PRM BURN" });
    let spdPRM = Math.sqrt(sr.vx * sr.vx + sr.vy * sr.vy);
    sr.vx += (sr.vx / spdPRM) * PRM_DV;
    sr.vy += (sr.vy / spdPRM) * PRM_DV;
    prevRdv = sr.x * sr.vx + sr.y * sr.vy;
    while (true) {
        let step = getPhysicsStep(sr, sm);
        stepPred(sr, sm, step);
        t += step;
        let rdv = sr.x * sr.vx + sr.y * sr.vy;
        if (prevRdv < 0 && rdv >= 0) break;
        prevRdv = rdv;
        if (t > prmTime + 120000) break;
    }
    let tliTime = t;
    ephem.push({ x: sr.x, y: sr.y, label: "TLI BURN" });
    let rate = dv / IRL_BURN_DURATION;
    let burnT = 0;
    while (burnT < IRL_BURN_DURATION) {
        let step = getPhysicsStep(sr, sm);
        let spd = Math.sqrt(sr.vx * sr.vx + sr.vy * sr.vy);
        sr.vx += (sr.vx / spd) * rate * step;
        sr.vy += (sr.vy / spd) * rate * step;
        stepPred(sr, sm, step);
        burnT += step;
    }
    let minMoonDist = Infinity, minEarthReturn = Infinity, passedMoon = false;
    let closestPt = null;
    let coastT = 0;
    while (coastT < 12 * 86400) {
        let step = getPhysicsStep(sr, sm);
        stepPred(sr, sm, step);
        coastT += step;
        let dE = Math.sqrt(sr.x * sr.x + sr.y * sr.y);
        let dM = Math.hypot(sm.x - sr.x, sm.y - sr.y);
        if (dM < minMoonDist) {
            minMoonDist = dM;
            closestPt = { x: sr.x, y: sr.y };
        }
        if (minMoonDist < SOI_MOON) passedMoon = true;
        if (passedMoon && dE < minEarthReturn) minEarthReturn = dE;
        if (dE < RE || dM < RM) {
            if (dE < RE && passedMoon) ephem.push({ x: sr.x, y: sr.y, label: "SPLASHDOWN" });
            break;
        }
    }
    if (closestPt && minMoonDist < SOI_MOON) ephem.push({ x: closestPt.x, y: closestPt.y, label: "LUNAR FLYBY" });

    let targetDist = RM + 7400000;
    let approachErr = Math.abs(minMoonDist - targetDist) / 1e6;
    let returnPenalty = passedMoon ? Math.max(0, (minEarthReturn - RE - 500000) / 1e7) : 1000;
    let crashPenalty = (minMoonDist < RM * 1.1) ? 100 : 0;

    return { score: approachErr + returnPenalty * 50 + crashPenalty, ephem, prmTime, tliTime };
}

function calibrateIrlTrajectory() {
    let bestAngle = 35, bestDv = 450, bestScore = Infinity;
    let bestEphem = [];
    let bestPrmTime = 5400, bestTliTime = 91800;

    for (let deg = 0; deg <= 355; deg += 6) {
        for (let dv = 200; dv <= 800; dv += 25) {
            let s = scoreTraj(deg, dv);
            if (s.score < bestScore) {
                bestScore = s.score; bestAngle = deg; bestDv = dv;
                bestEphem = s.ephem; bestPrmTime = s.prmTime; bestTliTime = s.tliTime;
            }
        }
    }
    let a0 = bestAngle, d0 = bestDv;
    for (let deg = a0 - 5; deg <= a0 + 5; deg += 1) {
        for (let dv = d0 - 60; dv <= d0 + 60; dv += 3) {
            let s = scoreTraj(deg, dv);
            if (s.score < bestScore) {
                bestScore = s.score; bestAngle = deg; bestDv = dv;
                bestEphem = s.ephem; bestPrmTime = s.prmTime; bestTliTime = s.tliTime;
            }
        }
    }

    IRL_MOON_ANGLE = bestAngle * Math.PI / 180;
    IRL_DV = bestDv;
    IRL_TIME_PRM = bestPrmTime;
    IRL_TIME_TLI = bestTliTime;
    ephemerisNodes.length = 0;
    ephemerisNodes.push(...bestEphem);
    console.log("IRL calibrated: angle=" + bestAngle.toFixed(1) +
        ",dv=" + bestDv + " m/s,prmT=" + bestPrmTime.toFixed(0) +
        "s,tliT=" + bestTliTime.toFixed(0) + "s,score=" + bestScore.toFixed(2));
}
let tutSteps = [
    {
        msg: '<strong>ORBITAL MECHANICS INITIALIZATION</strong><br>Spacecraft is currently in Low Earth Orbit (LEO) at 400 km altitude. State vector velocity: 7.8 km/s.', cam: () => setCam(0, 0, 0.000025, 0.03), dur: 5000
    }, {
        msg: '<strong>TRACKING ACTIVATED</strong><br>Green reticle indicates spacecraft position. Centripetal acceleration currently matches gravitational pull,maintaining stable orbit.', cam: () => { setCam(rocket.x, rocket.y, 0.00006, 0.04); tracking = true; }, dur: 5000
    }, {
        msg: '<strong>EVALUATING LUNAR TARGET</strong><br>Primary objective: The Moon. Distance: 384,400 km. A precise Trans-Lunar Injection (TLI) burn is required to intercept.', cam: () => { setCam(DM * 0.45, 0, 0.0000012, 0.02); tracking = false; }, dur: 5500
    }, {
        msg: '<strong>INITIALIZE MANEUVER PLANNER</strong><br>Access the planner to input Δv (Delta-V) and Ignition Time parameters. The onboard computer will compute 3 parallel trajectories tracking nominal and error bounds.', cam: () => {
            setCam(rocket.x, rocket.y, 0.000035, 0.035); tracking = true;
            document.getElementById('btn-open-planner').classList.add('glow-hint');
        }, dur: 5000
    },];
let tutStep = 0;
let tutTimer = 0;

function startTutorial() {
    tutStep = 0; tutTimer = 0;
    document.getElementById('tutorial-overlay').style.display = 'block';
    showTutStep();
}
function showTutStep() {
    if (tutStep >= tutSteps.length) { endTutorial(); return; }
    let s = tutSteps[tutStep];
    document.getElementById('tut-msg').innerHTML = s.msg;
    s.cam();
    tutTimer = 0;
}
function advanceTut() {
    tutStep++;
    if (tutStep >= tutSteps.length) endTutorial();
    else showTutStep();
}
function endTutorial() {
    document.getElementById('tutorial-overlay').style.display = 'none';
    phase = PHASE.LEO;
    setTracking(true);
    setCam(rocket.x, rocket.y, 0.000035, 0.04);
    showPanel('telemetry');
    showPanel('flight-director');
    syncFD();
}


let irlPI = 0;
let irlPT = 0;
let irlCharIdx = 0;
let irlNarIdx = 0;
let irlBurnApplied = 0;
let userCamOverride = false;

let IRL_P = [
    {
        id: 'LEO', title: 'EARTH ORBIT INSERTION', narration: [
            "Orion and the ICPS upper stage are in a parking orbit: 185 \u00d7 2,222 km. Perigee velocity: <strong class='hl'>8.3 km/s</strong>.", "The crew runs system checks before the first engine burn."
        ], warp: 50, camTarget: 'rocket', camScale: 0.00003, camSpeed: 0.03
    }, {
        id: 'PRM_APPROACH', title: 'PRM COUNTDOWN', narration: [
            "Approaching perigee. The ICPS engine is armed for the Perigee Raise Maneuver.", "<strong class='warn'>T-MINUS 30 SECONDS.</strong>"
        ], warp: 2, camTarget: 'rocket', camScale: 0.00008, camSpeed: 0.04
    }, {
        id: 'PRM_BURN', title: 'PRM BURN', narration: [
            "<strong class='bad'>IGNITION.</strong> The RL10B-2 engine fires a 2,200 m/s impulse.", "Apogee climbs from 2,222 km to roughly 64,000 km. Orion is now in High Earth Orbit."
        ], warp: 1, camTarget: 'rocket', camScale: 0.00005, camSpeed: 0.05
    }, {
        id: 'HEO_COAST', title: 'HIGH EARTH ORBIT COAST', narration: [
            "Orion coasts out to 64,000 km — passing through the Van Allen radiation belts.", "The crew spends 24 hours testing life support,navigation,and deep space comms before committing to the Moon."
        ], warp: 1500, camTarget: 'earth', camScale: 0.000008, camSpeed: 0.025, showGravity: true
    }, {
        id: 'TLI_APPROACH', title: 'TLI COUNTDOWN', narration: [
            "Orion falls back to perigee after 24 hours — now at peak velocity from the Oberth effect.", "<strong class='warn'>T-MINUS 30 SECONDS.</strong> Trans-Lunar Injection vector is locked."
        ], warp: 5, camTarget: 'rocket', camScale: 0.00008, camSpeed: 0.04
    }, {
        id: 'TLI_BURN', title: 'TLI BURN', narration: [
            "<strong class='bad'>TLI IGNITION.</strong> The engine fires for 5 minutes 50 seconds.", "This final push adds the remaining velocity to escape Earth's gravity well and coast to the Moon."
        ], warp: 20, camTarget: 'rocket', camScale: 0.00005, camSpeed: 0.05
    }, {
        id: 'OUTBOUND', title: 'OUTBOUND COAST', narration: [
            "Engine cutoff. Orion is coasting uphill against Earth's gravity — speed drops every second.", "By the time it reaches the Moon,velocity will have fallen from 10.8 km/s to under 1 km/s. All of that kinetic energy has been traded for altitude."
        ], camTarget: 'rocket', camScale: 0.0000015, camSpeed: 0.06, showGravity: true
    }, {
        id: 'SOI_ENTRY', title: 'LUNAR SPHERE OF INFLUENCE', narration: [
            "Crossing into the Moon's gravitational domain. Earth is no longer the dominant force.", "Orion accelerates toward the lunar surface — falling into a new gravity well."
        ], camTarget: 'moon', camScale: 0.00001, camSpeed: 0.03, showGravity: true
    }, {
        id: 'FLYBY', title: 'LUNAR FLYBY', narration: [
            "<strong class='hl'>CLOSEST APPROACH.</strong> Altitude: ~7,400 km above the far side.", "The Moon's gravity bends Orion's trajectory by roughly 60\u00b0 — a gravitational slingshot that aims the capsule back at Earth. No engine required."
        ], camTarget: 'moon', camScale: 0.00001, camSpeed: 0.03, showGravity: true
    }, {
        id: 'RETURN', title: 'TRANS-EARTH COAST', narration: [
            "No engines fired. The free-return trajectory is doing the work — gravity is the only pilot now.", "Orion picks up speed as it falls back down Earth's gravity well."
        ], camTarget: 'rocket', camScale: 0.0000012, camSpeed: 0.015, showGravity: true
    }, {
        id: 'EARTH_APPROACH', title: 'REENTRY APPROACH', narration: [
            "Velocity: <strong class='bad'>11 km/s</strong>. Mach 32. The heat shield will hit 2,760\u00b0C.", "The service module separates. Orion flips heat-shield-forward and aims for a 25-mile-wide reentry corridor at -6.5\u00b0."
        ], camTarget: 'earth', camScale: 0.000005, camSpeed: 0.02
    }, {
        id: 'COMPLETE', title: 'SPLASHDOWN', narration: [
            "<strong class='hl'>SPLASHDOWN.</strong> Pacific Ocean,west of San Diego.", "USS Portland recovery crews secure the capsule. Artemis II is complete."
        ], camTarget: 'earth', camScale: 0.00002, camSpeed: 0.03
    }
];

function initIrlMode() {
    initRocket(IRL_PERIGEE, IRL_APOGEE);
    moon.x = DM * Math.cos(IRL_MOON_ANGLE);
    moon.y = DM * Math.sin(IRL_MOON_ANGLE);
    moon.vx = -moonV0 * Math.sin(IRL_MOON_ANGLE);
    moon.vy = moonV0 * Math.cos(IRL_MOON_ANGLE);
    moon.trail = [];

    irlPI = 0; irlPT = 0;
    irlCharIdx = 0; irlNarIdx = 0;
    irlBurnApplied = 0;
    window.irlPRMDone = false;
    window.irlTLIDone = false;
    irlPredComputed = false;
    sT = 0; rT = 0;
    minDistM = Infinity;
    hypeTriggered = false;

    let pips = document.getElementById('phase-pips');
    pips.innerHTML = '';
    for (let i = 0; i < IRL_P.length; i++) {
        let pip = document.createElement('div');
        pip.className = 'phase-pip';
        pips.appendChild(pip);
    }
    document.getElementById('btn-open-planner').style.display = 'none';
    document.getElementById('tel-time-control').style.display = 'none';
    document.getElementById('tel-time-control').style.pointerEvents = 'none';
    document.getElementById('irl-phase-bar').style.display = 'block';
    document.getElementById('irl-overlay').style.display = 'block';
    showPanel('telemetry');
    hidePanel('flight-director');

    setCamInstant(rocket.rx || rocket.x, rocket.ry || rocket.y, 0.00015);
    updateIrlUI();
}

function updateIrlUI() {
    let p = IRL_P[irlPI];
    document.getElementById('irl-phase-label').textContent = `PHASE ${irlPI + 1}/${IRL_P.length}`;
    document.getElementById('irl-phase-title').textContent = p.title;
    document.querySelectorAll('.phase-pip').forEach((pip, i) => {
        pip.className = 'phase-pip' + (i < irlPI ? ' done' : i == irlPI ? ' active' : '');
    });
}

function advanceIrlPhase() {
    irlPI++;
    if (irlPI >= IRL_P.length) { irlPI = IRL_P.length - 1; return; }
    irlPT = 0; irlCharIdx = 0; irlNarIdx = 0;
    updateIrlUI();
}

function stepIRL(realDt) {

    let p = IRL_P[irlPI];
    if (!p) return;
    let dMoon = Math.hypot(((moon.mx || moon.x)) - ((rocket.rx || rocket.x)), ((moon.my || moon.y)) - ((rocket.ry || rocket.y)));
    let dEarth = Math.sqrt((rocket.rx || rocket.x) * (rocket.rx || rocket.x) + (rocket.ry || rocket.y) * (rocket.ry || rocket.y));
    irlPT += realDt;
    let narText = p.narration[irlNarIdx] || '';
    if (irlCharIdx < narText.length) {
        irlCharIdx += realDt * 50;
    } else if (irlNarIdx < p.narration.length - 1) {
        if (irlCharIdx > narText.length + 80) {
            irlNarIdx++; irlCharIdx = 0;
        } else { irlCharIdx += realDt * 50; }
    }
    let displayText = '';
    for (let i = 0; i <= irlNarIdx && i < p.narration.length; i++) {
        let full = p.narration[i];
        if (i < irlNarIdx) displayText += full + '<br><br>';
        else displayText += full.substring(0, Math.min(Math.floor(irlCharIdx), full.length));
    }
    document.getElementById('irl-narration-text').innerHTML = displayText;
    if (p.warp != undefined && irlPI <= 5) {
        if (irlPI == 0) {
            if (sT >= IRL_TIME_PRM - 100) warp = 5;
            else if (irlPT > 3) warp = p.warp * 10;
            else warp = p.warp;
        }
        else if (irlPI == 3 && sT >= IRL_TIME_TLI - 100) warp = 5;
        else warp = p.warp;
    }
    if (!userCamOverride) {
        if (tracking) { cam.tx = rocket.rx || rocket.x; cam.ty = rocket.ry || rocket.y; }
        else if (p.camTarget == 'earth') { cam.tx = 0; cam.ty = 0; }
        else if (p.camTarget == 'moon') { cam.tx = moon.mx || moon.x; cam.ty = moon.my || moon.y; }
        else if (p.camTarget == 'rocket') { cam.tx = rocket.rx || rocket.x; cam.ty = rocket.ry || rocket.y; }
    }
    if (document.getElementById('gravity-overlay').style.display == 'block') {
        updateGravityOverlay();
    }
    if (window.irlTLIDone && !irlPredComputed) {
        irlPredComputed = true;
        predMain = []; predPlus = []; predMinus = []; predMoonTrail = [];
        let savedR = clone(rocket), savedM = clone(moon);
        predMinDist = simTrajectory(0, 0, predMain, true);

        let sr5 = clone(savedR), sm5 = clone(savedM);
        let spd5 = Math.sqrt(sr5.vx * sr5.vx + sr5.vy * sr5.vy);
        sr5.vx += (sr5.vx / spd5) * 5; sr5.vy += (sr5.vy / spd5) * 5;
        let lastX = sr5.x, lastY = sr5.y;
        let t5 = 0;
        while (t5 < 8 * 86400) {
            let s = getPhysicsStep(sr5, sm5);
            stepPred(sr5, sm5, s);
            t5 += s;
            let tdx = sr5.x - lastX, tdy = sr5.y - lastY;
            if (tdx * tdx + tdy * tdy > 2e6 * 2e6) { predPlus.push({ x: sr5.x, y: sr5.y }); lastX = sr5.x; lastY = sr5.y; }
        }
        let sr6 = clone(savedR), sm6 = clone(savedM);
        sr6.vx -= (sr6.vx / spd5) * 5; sr6.vy -= (sr6.vy / spd5) * 5;
        lastX = sr6.x; lastY = sr6.y;
        let t6 = 0;
        while (t6 < 8 * 86400) {
            let s = getPhysicsStep(sr6, sm6);
            stepPred(sr6, sm6, s);
            t6 += s;
            let tdx = sr6.x - lastX, tdy = sr6.y - lastY;
            if (tdx * tdx + tdy * tdy > 2e6 * 2e6) { predMinus.push({ x: sr6.x, y: sr6.y }); lastX = sr6.x; lastY = sr6.y; }
        }
    }
    let targetPhase = 0;
    if (sT >= IRL_TIME_PRM - 30) targetPhase = 1;
    if (sT >= IRL_TIME_PRM) targetPhase = 2;
    if (window.irlPRMDone && sT >= IRL_TIME_PRM + 10) targetPhase = 3;
    if (sT >= IRL_TIME_TLI - 30 && window.irlPRMDone) targetPhase = 4;
    if (sT >= IRL_TIME_TLI) targetPhase = 5;
    if (window.irlTLIDone) {
        targetPhase = 6;

        if (dMoon < irlMinMoonDist) irlMinMoonDist = dMoon;
        if (dMoon < SOI_MOON) {
            let rx = (rocket.rx || rocket.x) - (moon.mx || moon.x);
            let ry = (rocket.ry || rocket.y) - (moon.my || moon.y);
            let vx = rocket.vx - moon.vx;
            let vy = rocket.vy - moon.vy;
            irlApproachingMoon = (rx * vx + ry * vy < 0);
        } else if (irlMinMoonDist < SOI_MOON && dMoon > SOI_MOON) {
            irlApproachingMoon = false;
        }
        let dynWarp = 3500;
        if (targetPhase == 6 && irlPT < 10) {
            dynWarp = 20 + (irlPT / 10) * (3500 - 20);
        }
        if (dMoon < SOI_MOON) {
            targetPhase = 7;
            dynWarp = 1500;
        }
        if (!irlApproachingMoon && dMoon < SOI_MOON) {
            targetPhase = 8;
            dynWarp = 1750;
        }
        if (!irlApproachingMoon && dMoon > SOI_MOON * 0.8) {
            targetPhase = 9;
            dynWarp = 5000;
        }
        if (targetPhase == 9 && dEarth < DM * 0.15 && dEarth < maxEarthDist * 0.5) {
            targetPhase = 10;
            dynWarp = Math.max(100, Math.min(750, dEarth / 10000));
        }
        if (dEarth < RE + 300000 && targetPhase >= 9) {
            targetPhase = 11;
            dynWarp = 1;
            isPaused = true;
            let vel = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
            let card = document.getElementById('result-card');
            card.className = 'result-card win';
            document.getElementById('result-title').textContent = 'ARTEMIS II — MISSION COMPLETE';
            document.getElementById('result-msg').innerHTML =
                'Orion splashes down in the Pacific Ocean. USS Portland recovery crews secure the capsule.<br><br>' +
                '<span style="font-size:0.7em; opacity:0.7">The free-return trajectory worked. No corrective burns were needed for the return trip.</span>';
            document.getElementById('result-stats').innerHTML =
                `<div class="tel-row"><span class="tel-label">FLIGHT DURATION</span><span class="tel-val mono">${(sT / 86400).toFixed(1)} days</span></div>` +
                `<div class="tel-row"><span class="tel-label">CLOSEST LUNAR APPROACH</span><span class="tel-val mono">${((irlMinMoonDist - RM) / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km</span></div>` +
                `<div class="tel-row"><span class="tel-label">REENTRY VELOCITY</span><span class="tel-val mono">${(vel / 1000).toFixed(2)} km/s</span></div>` +
                `<div class="tel-row"><span class="tel-label">TIME DILATION (NET)</span><span class="tel-val mono">${(srDilationUsec + Math.abs(grDilationUsec)).toFixed(3)} \u00b5s</span></div>`;
            document.getElementById('result-overlay').style.display = 'flex';
            document.getElementById('btn-result-sandbox').style.display = 'block';
            triggerHypeMusic();
        }

        warp = Math.floor(dynWarp);
    }
    if (targetPhase > irlPI) {
        irlPI = targetPhase;
        irlPT = 0; irlCharIdx = 0; irlNarIdx = 0;
        userCamOverride = false;
        updateIrlUI();
        let nextP = IRL_P[targetPhase];
        if (nextP && nextP.camScale) {
            cam.tScale = nextP.camScale;
            cam.speed = nextP.camSpeed;
        }
        if (nextP) {
            if (nextP.camTarget == 'rocket') { setTracking(true); }
            else { setTracking(false); }
            if (nextP.showGravity) {
                document.getElementById('gravity-overlay').style.display = 'block';
            }
        }
    }

    if (dEarth > maxEarthDist) maxEarthDist = dEarth;
}

function updateGravityOverlay() {
    let dE = Math.sqrt((rocket.rx || rocket.x) * (rocket.rx || rocket.x) + (rocket.ry || rocket.y) * (rocket.ry || rocket.y));
    let dM = Math.hypot(((moon.mx || moon.x)) - ((rocket.rx || rocket.x)), ((moon.my || moon.y)) - ((rocket.ry || rocket.y)));
    let fE = (G * ME) / (dE * dE);
    let fM = (G * MM) / (dM * dM);
    let total = fE + fM;
    let pctE = (fE / total * 100).toFixed(1);
    let pctM = (fM / total * 100).toFixed(1);

    document.getElementById('grav-formula-text').innerHTML =
        `F<sub>earth</sub>=GM/r²=<span class="val">${fE.toExponential(2)} m/s²</span> &nbsp;|&nbsp; ` +
        `F<sub>moon</sub>=GM/r²=<span class="val">${fM.toExponential(2)} m/s²</span>`;
    document.getElementById('grav-earth-bar').style.width = pctE + '%';
    document.getElementById('grav-moon-bar').style.width = pctM + '%';
}
function checkWinLose() {
    if (phase != PHASE.COASTING || gMode != MODE.CUSTOM) return;

    let dM = Math.hypot(((moon.mx || moon.x)) - ((rocket.rx || rocket.x)), ((moon.my || moon.y)) - ((rocket.ry || rocket.y)));
    let dE = Math.sqrt((rocket.rx || rocket.x) * (rocket.rx || rocket.x) + (rocket.ry || rocket.y) * (rocket.ry || rocket.y));
    let altMoon = dM - RM;

    if (altMoon < minDistM) minDistM = altMoon;
    if (minDistM < 50000000 && passedM && dE < RE + 200000) {
        triggerResult('win');
        return;
    }
    if (dM < SOI_MOON) passedM = true;
    let v2 = rocket.vx * rocket.vx + rocket.vy * rocket.vy;
    let specificE = 0.5 * v2 - (G * ME) / dE;
    let radialV = ((rocket.rx || rocket.x) * rocket.vx + (rocket.ry || rocket.y) * rocket.vy) / dE;
    if (dE > DM * 2.5 && specificE > 0 && radialV > 0) {
        triggerResult('lose', 'ESCAPE TRAJECTORY', 'The spacecraft has exceeded escape velocity and will never return to Earth. Mission failed.');
        return;
    }
    cTime += 0;
    if (cTime > 20 * 86400 && minDistM > SOI_MOON) {
        triggerResult('lose', 'MISSION TIMEOUT', 'The spacecraft missed the Moon entirely and is drifting in deep space. 20 days elapsed with no lunar encounter.');
        return;
    }
}

function triggerResult(type, title, msg) {
    phase = type == 'win' ? PHASE.WIN : PHASE.LOSE;
    isPaused = true;
    let card = document.getElementById('result-card');
    card.className = 'result-card ' + (type == 'win' ? 'win' : 'lose');
    document.getElementById('result-title').textContent = title || 'MISSION SUCCESS';
    if (type == 'win') {
        let v = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
        document.getElementById('result-msg').textContent = 'Outstanding. You achieved a free-return lunar flyby — exactly what NASA did with Artemis II.';
        document.getElementById('result-stats').innerHTML =
            `<div class="tel-row"><span class="tel-label">CLOSEST APPROACH</span><span class="tel-val mono">${(minDistM / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km</span></div>` +
            `<div class="tel-row"><span class="tel-label">FLIGHT DURATION</span><span class="tel-val mono">${(sT / 86400).toFixed(1)} days</span></div>` +
            `<div class="tel-row"><span class="tel-label">MAX VELOCITY</span><span class="tel-val mono">${(v / 1000).toFixed(2)} km/s</span></div>`;
        mainVolTarget = 0;
        triggerHypeMusic();
    } else {
        document.getElementById('result-msg').innerHTML = `${msg}<br><br><span style="font-size:0.6em; opacity:0.8; color:var(--bad)">[SIMULATION HALTED]</span>`;
        document.getElementById('result-stats').innerHTML = '';
        stopAllAudio();
    }
    document.getElementById('result-overlay').style.display = 'flex';
    setTracking(false);
}
function showPanel(id) { document.getElementById(id).classList.remove('hidden'); }
function hidePanel(id) { document.getElementById(id).classList.add('hidden'); }
document.getElementById('btn-boot').addEventListener('click', () => {
    startAudio();
    document.getElementById('boot-screen').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('boot-screen').style.display = 'none';
        document.getElementById('mode-select').style.display = 'flex';
        phase = PHASE.MODE_SELECT;
    }, 1500);
});

function setTracking(state) {
    tracking = state;
    document.getElementById('btn-track').classList.toggle('active', tracking);
    if (tracking) { document.getElementById('ptr-rocket').style.display = 'none'; }
    else { document.getElementById('ptr-rocket').style.display = 'block'; }
}

document.getElementById('btn-track').addEventListener('click', () => {
    if (gMode == MODE.IRL) userCamOverride = true;
    setTracking(!tracking);
});
document.getElementById('btn-gravity').addEventListener('click', () => {
    let el = document.getElementById('gravity-overlay');
    let isVisible = el.style.display == 'block';
    el.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) updateGravityOverlay();
});
document.getElementById('card-irl').addEventListener('click', () => {
    let cardEl = document.getElementById('card-irl');
    let originalContent = cardEl.innerHTML;
    cardEl.innerHTML = '<div style="flex:1; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px;">' +
        '<div class="spinner"></div>' +
        '<strong style="color:var(--primary); letter-spacing:2px;">CALIBRATING NASA TRAJECTORY...</strong>' +
        '<span style="font-size:0.75rem; opacity:0.6;">Solving 3-Body Equations</span></div>';
    setTimeout(() => {
        calibrateIrlTrajectory();
        cardEl.innerHTML = originalContent;

        startAudio();
        gMode = MODE.IRL;
        missionName = 'ARTEMIS II — LIVE MISSION';
        document.getElementById('mission-label').textContent = missionName;
        document.getElementById('mode-select').classList.add('fade-out');
        setTimeout(() => {
            document.getElementById('mode-select').style.display = 'none';
            document.getElementById('top-bar').style.display = 'flex';
            document.getElementById('bottom-bar').style.display = 'flex';
            document.getElementById('credits').style.display = 'flex';

            resetAllState();
            initIrlMode();
            phase = PHASE.IRL_ACTIVE;
        }, 1000);
    }, 100);
});
document.getElementById('mission-name').addEventListener('click', (e) => {
    e.stopPropagation();
});
document.getElementById('btn-result-sandbox').addEventListener('click', () => {
    document.getElementById('result-overlay').style.display = 'none';
    document.getElementById('btn-result-sandbox').style.display = 'none';

    gMode = MODE.CUSTOM;
    missionName = 'SANDBOX-1';
    document.getElementById('mission-label').textContent = missionName;
    resetAllState();
    initCustomMode();

    phase = PHASE.TUTORIAL;
    startTutorial();
});

function initCustomMode() {
    initRocket(CUSTOM_ALT);
    resetMoon();
    setCamInstant(0, 0, 0.000025);
    document.getElementById('btn-open-planner').style.display = 'block';
    document.getElementById('tel-time-control').style.display = 'flex';
    document.getElementById('tel-time-control').style.pointerEvents = 'auto';
    document.getElementById('irl-phase-bar').style.display = 'none';
    document.getElementById('irl-overlay').style.display = 'none';
    showPanel('telemetry');
    showPanel('flight-director');
    syncFD();
}
document.getElementById('card-custom').addEventListener('click', () => {
    startAudio();
    gMode = MODE.CUSTOM;
    let nameInput = document.getElementById('mission-name').value.trim();
    missionName = nameInput.length > 0 ? nameInput.toUpperCase() : 'CUSTOM-1';
    document.getElementById('mission-label').textContent = missionName;
    document.getElementById('mode-select').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('mode-select').style.display = 'none';
        document.getElementById('top-bar').style.display = 'flex';
        document.getElementById('bottom-bar').style.display = 'flex';
        document.getElementById('credits').style.display = 'flex';

        resetAllState();
        initCustomMode();
        phase = PHASE.TUTORIAL;
        startTutorial();
    }, 1000);
});
document.getElementById('tutorial-overlay').addEventListener('click', advanceTut);
document.getElementById('btn-open-planner').addEventListener('click', () => {
    if (gMode != MODE.CUSTOM) return;
    phase = PHASE.PLANNING; isPaused = true;
    showPanel('planner'); calcPred();
    document.getElementById('btn-open-planner').classList.remove('glow-hint');
});
document.getElementById('btn-cancel').addEventListener('click', () => {
    phase = PHASE.LEO; isPaused = false;
    hidePanel('planner');
    document.getElementById('v-closest').textContent = '—';
    syncFD();
});
document.getElementById('btn-execute').addEventListener('click', () => {
    let tti = parseFloat(document.getElementById('tti-slider').value) * 60;
    let dv = parseFloat(document.getElementById('dv-slider').value);
    if (dv <= 0) return;
    let steps = Math.floor(tti / 10);
    for (let i = 0; i < steps; i++) stepVerlet(10);
    let rem = tti - steps * 10;
    if (rem > 0) stepVerlet(rem);
    let spd = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
    if (spd > 0) { rocket.vx += (rocket.vx / spd) * dv; rocket.vy += (rocket.vy / spd) * dv; }
    rocket.trail = []; moon.trail = [];
    phase = PHASE.COASTING; isPaused = false; cTime = 0;
    hidePanel('planner');
    syncFD();
});
['tti', 'dv'].forEach(id => {
    document.getElementById(id + '-slider').addEventListener('input', e => {
        document.getElementById(id + '-readout').textContent = e.target.value + (id == 'tti' ? ' min' : ' m/s');
        calcPred();
    });
});
document.getElementById('time-slider').addEventListener('input', e => {
    let p = parseFloat(e.target.value);
    warp = Math.pow(10, p);
    document.getElementById('time-readout').textContent = p < 0.1 ? '1×' : Math.round(warp).toLocaleString() + '×';
});
document.getElementById('btn-track').addEventListener('click', () => {
    tracking = !tracking;
    document.getElementById('btn-track').classList.toggle('active', tracking);
    if (tracking) setCam(rocket.rx || rocket.x, rocket.ry || rocket.y, cam.tScale, 0.05);
});
document.getElementById('btn-reset').addEventListener('click', () => {
    if (gMode == MODE.CUSTOM) {
        resetAllState();
        initCustomMode();
        phase = PHASE.LEO;
        hidePanel('planner');
    } else if (gMode == MODE.IRL) {
        resetAllState();
        initIrlMode();
    }
});
document.getElementById('btn-music').addEventListener('click', toggleMusic);

document.getElementById('btn-menu').addEventListener('click', () => {
    document.getElementById('result-overlay').style.display = 'none';
    hidePanel('planner');
    hidePanel('telemetry');
    hidePanel('flight-director');
    document.getElementById('top-bar').style.display = 'none';
    document.getElementById('bottom-bar').style.display = 'none';
    document.getElementById('credits').style.display = 'none';
    document.getElementById('irl-phase-bar').style.display = 'none';
    document.getElementById('irl-overlay').style.display = 'none';
    document.getElementById('tutorial-overlay').style.display = 'none';
    document.getElementById('mode-select').classList.remove('fade-out');
    document.getElementById('mode-select').style.display = 'flex';
    document.getElementById('gravity-overlay').style.display = 'none';
    phase = PHASE.MODE_SELECT;
    isPaused = true;
});

document.getElementById('btn-result-menu').addEventListener('click', () => {
    document.getElementById('result-overlay').style.display = 'none';
    document.getElementById('btn-menu').click();
});

document.getElementById('btn-result-restart').addEventListener('click', () => {
    document.getElementById('result-overlay').style.display = 'none';
    document.getElementById('btn-reset').click();
});
let dragging = false, lastMouse = { x: 0, y: 0 };
window.addEventListener('mousedown', e => {
    if (e.target == canvas) { dragging = true; lastMouse = { x: e.clientX, y: e.clientY }; }
});
window.addEventListener('mousemove', e => {
    if (!dragging) return;
    tracking = false;
    document.getElementById('btn-track').classList.remove('active');
    cam.x -= (e.clientX - lastMouse.x) / cam.scale;
    cam.y -= (e.clientY - lastMouse.y) / cam.scale;
    cam.tx = cam.x; cam.ty = cam.y;
    lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('wheel', e => {
    let factor = e.deltaY > 0 ? 0.9 : 1.1;
    let next = cam.scale * factor;
    if (next < 1e-8 || next > 0.05) return;
    let mx = cam.x + (e.clientX - canvas.width / 2) / cam.scale;
    let my = cam.y + (e.clientY - canvas.height / 2) / cam.scale;
    cam.scale = next; cam.tScale = next;
    cam.x = mx - (e.clientX - canvas.width / 2) / cam.scale;
    cam.y = my - (e.clientY - canvas.height / 2) / cam.scale;
    cam.tx = cam.x; cam.ty = cam.y;
});
function drawBody(bx, by, br, img, haloColor, haloAlpha, imgScale) {
    let s = w2s(bx, by);
    let r = br * cam.scale;
    let haloR = Math.max(r * 6, 18);
    ctx.strokeStyle = haloColor;
    ctx.globalAlpha = haloAlpha || 0.25;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, haloR, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (haloAlpha || 0.25) * 0.3;
    ctx.beginPath(); ctx.arc(s.x, s.y, haloR * 1.8, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    if (img && img.complete && img.naturalHeight > 0) {
        let scale = imgScale || 1;
        let dr = Math.max(r, 3) * scale;
        ctx.drawImage(img, s.x - dr, s.y - dr, dr * 2, dr * 2);
    } else {
        ctx.fillStyle = haloColor; ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(r, 3), 0, Math.PI * 2); ctx.fill();
    }
    return s;
}

function drawTrail(trail, color, dash, lineW) {
    if (trail.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = lineW || 1.5; ctx.setLineDash(dash || []);
    ctx.beginPath();
    let p0 = w2s(trail[0].x, trail[0].y); ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < trail.length; i++) {
        let p = w2s(trail[i].x, trail[i].y);
        ctx.lineTo(p.x, p.y);
    }
    ctx.stroke(); ctx.setLineDash([]);
}

function drawGravVectors() {
    if (gMode != MODE.IRL) return;
    let p = IRL_P[irlPI];
    if (!p || !p.showGravity) return;
    let sR = w2s(rocket.x, rocket.y);
    let dE = Math.sqrt(rocket.x * rocket.x + rocket.y * rocket.y);
    let dM = Math.hypot(moon.x - rocket.x, moon.y - rocket.y);
    let fE = (G * ME) / (dE * dE);
    let fM = (G * MM) / (dM * dM);
    let maxF = Math.max(fE, fM);
    let aE = Math.atan2(-rocket.y, -rocket.x);
    let lenE = Math.min(80, 80 * (fE / maxF));
    drawArrow(sR.x, sR.y, aE, lenE, 'rgba(59,130,246,0.6)', Math.max(1, 3 * fE / maxF));
    let aM = Math.atan2(moon.y - rocket.y, moon.x - rocket.x);
    let lenM = Math.min(80, 80 * (fM / maxF));
    drawArrow(sR.x, sR.y, aM, lenM, 'rgba(232,236,241,0.6)', Math.max(1, 3 * fM / maxF));
}

function drawArrow(x, y, angle, len, color, width) {
    let ex = x + Math.cos(angle) * len, ey = y + Math.sin(angle) * len;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    let hs = 6;
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(angle - 0.4) * hs, ey - Math.sin(angle - 0.4) * hs);
    ctx.lineTo(ex - Math.cos(angle + 0.4) * hs, ey - Math.sin(angle + 0.4) * hs);
    ctx.closePath(); ctx.fill();
}

function drawRocketSprite() {
    let rx = rocket.rx != undefined ? rocket.rx : rocket.x;
    let ry = rocket.ry != undefined ? rocket.ry : rocket.y;
    let sR = w2s(rx, ry);
    let now = performance.now();
    let pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
    let ringR = 16 + pulse * 4;
    ctx.strokeStyle = `rgba(0,229,160,${0.3 + pulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sR.x, sR.y, ringR, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(0,229,160,${0.15 + pulse * 0.15})`;
    ctx.lineWidth = 1;
    let cLen = ringR + 6;
    ctx.beginPath();
    ctx.moveTo(sR.x - cLen, sR.y); ctx.lineTo(sR.x - ringR - 2, sR.y);
    ctx.moveTo(sR.x + ringR + 2, sR.y); ctx.lineTo(sR.x + cLen, sR.y);
    ctx.moveTo(sR.x, sR.y - cLen); ctx.lineTo(sR.x, sR.y - ringR - 2);
    ctx.moveTo(sR.x, sR.y + ringR + 2); ctx.lineTo(sR.x, sR.y + cLen);
    ctx.stroke();
    let grd = ctx.createRadialGradient(sR.x, sR.y, 0, sR.x, sR.y, 12);
    grd.addColorStop(0, `rgba(0,229,160,${0.15 + pulse * 0.1})`);
    grd.addColorStop(1, 'rgba(0,229,160,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(sR.x, sR.y, 12, 0, Math.PI * 2); ctx.fill();
    if (imgRocket.complete && imgRocket.naturalHeight > 0) {
        let sz = Math.max(100000 * cam.scale, 6);
        ctx.drawImage(imgRocket, sR.x - sz, sR.y - sz, sz * 2, sz * 2);
    } else {
        ctx.fillStyle = '#00E5A0'; ctx.beginPath(); ctx.arc(sR.x, sR.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (gMode == MODE.IRL && sT >= IRL_TIME_TLI && sT <= IRL_TIME_TLI + IRL_BURN_DURATION) {
        ctx.fillStyle = `rgba(245,158,11,${0.3 + Math.random() * 0.3})`;
        let spd = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
        let bx = sR.x - (rocket.vx / spd) * 14;
        let by = sR.y - (rocket.vy / spd) * 14;
        ctx.beginPath(); ctx.arc(bx, by, 4 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
    }
    return sR;
}

function updatePointer(sx, sy, id) {
    let ptr = document.getElementById(id);
    if (sx < -20 || sx > canvas.width + 20 || sy < -20 || sy > canvas.height + 20) {
        ptr.style.display = 'block';
        let ang = Math.atan2(sy - canvas.height / 2, sx - canvas.width / 2);
        let rad = Math.min(canvas.width, canvas.height) / 2 - 40;
        ptr.style.left = (canvas.width / 2 + Math.cos(ang) * rad) + 'px';
        ptr.style.top = (canvas.height / 2 + Math.sin(ang) * rad) + 'px';
    } else { ptr.style.display = 'none'; }
}

function draw() {
    ctx.fillStyle = '#030508';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (imgBg.complete && imgBg.naturalHeight > 0) {
        ctx.save();
        let ptrn = ctx.createPattern(imgBg, 'repeat');
        ctx.fillStyle = ptrn;
        let ox = (canvas.width / 2 - cam.x * cam.scale * 0.008) % imgBg.width;
        let oy = (canvas.height / 2 - cam.y * cam.scale * 0.008) % imgBg.height;
        ctx.translate(ox, oy);
        ctx.fillRect(-canvas.width * 2, -canvas.height * 2, canvas.width * 4, canvas.height * 4);
        ctx.restore();
    }
    drawTrail(rocket.trail, 'rgba(0,229,160,0.4)', []);
    drawTrail(moon.trail, 'rgba(255,255,255,0.12)', []);
    if (phase == PHASE.PLANNING || (gMode == MODE.IRL && irlPredComputed)) {
        drawTrail(predPlus, 'rgba(239,68,68,0.5)', [3, 5]);
        drawTrail(predMinus, 'rgba(59,130,246,0.5)', [3, 5]);
        drawTrail(predMain, '#F59E0B', [5, 7], 2);
        drawTrail(predMoonTrail, 'rgba(107,122,153,0.3)', [2, 6]);
    }
    if (gMode == MODE.IRL) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 10px "Inter",sans-serif';
        ctx.textAlign = 'left';
        ephemerisNodes.forEach(node => {
            let sn = w2s(node.x, node.y);
            ctx.beginPath();
            ctx.arc(sn.x, sn.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillText(node.label, sn.x + 8, sn.y + 3);
        });
    }
    let mx = moon.mx != undefined ? moon.mx : moon.x;
    let my = moon.my != undefined ? moon.my : moon.y;
    let sE = drawBody(earth.x, earth.y, RE, imgEarth, '#3B82F6', 0.2, 1.28);
    let sM = drawBody(mx, my, RM, imgMoon, '#E8ECF1', 0.15);
    let sR = drawRocketSprite();
    drawGravVectors();
    if (phase != PHASE.BOOT && phase != PHASE.MODE_SELECT) {
        let spd = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
        if (spd > 0) {
            let vAng = Math.atan2(rocket.vy, rocket.vx);
            let vLen = Math.min(30, spd / 300);
            ctx.strokeStyle = 'rgba(0,229,160,0.35)'; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sR.x, sR.y);
            ctx.lineTo(sR.x + Math.cos(vAng) * vLen, sR.y + Math.sin(vAng) * vLen);
            ctx.stroke();
        }
    }
    updatePointer(sM.x, sM.y, 'ptr-moon');
    updatePointer(sE.x, sE.y, 'ptr-earth');
    if (!tracking) updatePointer(sR.x, sR.y, 'ptr-rocket');
    else document.getElementById('ptr-rocket').style.display = 'none';
}
let lastFrameTime = performance.now();
let trailAccum = 0;

let simAcc = 0;

function loop(now) {
    let dt = (now - lastFrameTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastFrameTime = now;

    let running = !isPaused &&
        (phase == PHASE.LEO || phase == PHASE.COASTING || phase == PHASE.IRL_ACTIVE || phase == PHASE.TUTORIAL);

    if (running) {
        let simLeftTotal = dt * warp;

        simAcc += simLeftTotal;
        let stepSize = getPhysicsStep(rocket, moon);
        if (simAcc > stepSize * 200) simAcc = stepSize * 200;

        let dM = Math.hypot(moon.x - rocket.x, moon.y - rocket.y);
        let dE = Math.sqrt(rocket.x * rocket.x + rocket.y * rocket.y);
        let nearestBody = Math.min(dM, dE);

        while (simAcc >= stepSize) {
            let step = stepSize;
            if (gMode == MODE.IRL && phase == PHASE.IRL_ACTIVE) {
                let nextSimTime = sT + step;
                if (sT < IRL_TIME_PRM && nextSimTime >= IRL_TIME_PRM) {
                    let spd = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
                    if (spd > 0) {
                        rocket.vx += (rocket.vx / spd) * PRM_DV;
                        rocket.vy += (rocket.vy / spd) * PRM_DV;
                        window.irlPRMDone = true;
                    }
                }
                if (sT >= IRL_TIME_TLI && sT < IRL_TIME_TLI + IRL_BURN_DURATION) {
                    let rate = IRL_DV / IRL_BURN_DURATION;
                    let spd = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
                    if (spd > 0) {
                        let ax = (rocket.vx / spd) * rate;
                        let ay = (rocket.vy / spd) * rate;
                        rocket.vx += ax * step;
                        rocket.vy += ay * step;
                    }
                }
                tAcc[0] = 0; tAcc[1] = 0;
                if (!window.irlTLIDone && sT >= IRL_TIME_TLI + IRL_BURN_DURATION) {
                    window.irlTLIDone = true;
                }
                if (sT >= IRL_TIME_TLI - 10 && !hypeTriggered) {
                    triggerHypeMusic();
                }
            } else {
                tAcc[0] = 0; tAcc[1] = 0;
            }

            let result = stepVerlet(step);

            if (result != 'OK') {
                if (gMode == MODE.CUSTOM) {
                    triggerResult('lose', result == 'CRASH_EARTH' ? 'SURFACE IMPACT — EARTH' : 'SURFACE IMPACT — MOON', `Telemetry lost. Vehicle impacted ${result == 'CRASH_EARTH' ? 'Earth' : 'lunar'} surface at ${(Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy) / 1000).toFixed(1)} km/s.`
                    );
                }
                break;
            }

            simAcc -= step;
            sT += step;
            stepSize = getPhysicsStep(rocket, moon);
            if (phase == PHASE.COASTING) cTime += step;
            trailAccum += step;
            let trailLimit = (nearestBody < RE * 3) ? 60 : 1000;
            if (trailAccum > trailLimit) {
                rocket.trail.push({ x: rocket.x, y: rocket.y });
                moon.trail.push({ x: moon.x, y: moon.y });
                if (rocket.trail.length > 1000) rocket.trail.shift();
                if (moon.trail.length > 1000) moon.trail.shift();
                trailAccum = 0;
            }
        }
        rocket.rx = rocket.x + rocket.vx * simAcc;
        rocket.ry = rocket.y + rocket.vy * simAcc;
        moon.mx = moon.x + moon.vx * simAcc;
        moon.my = moon.y + moon.vy * simAcc;

        rT += dt;
        let vel = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
        let alt = Math.sqrt(rocket.x * rocket.x + rocket.y * rocket.y) - RE;
        let altMoon = Math.hypot(moon.x - rocket.x, moon.y - rocket.y) - RM;

        document.getElementById('v-vel').textContent = (vel / 1000).toFixed(2) + ' km/s';
        document.getElementById('v-alt').textContent = (alt / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' km';

        let amEl = document.getElementById('v-alt-moon');
        if (amEl) {
            if (altMoon > 0) amEl.textContent = (altMoon / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' km';
            else amEl.textContent = '--';
        }
        let h = Math.floor(sT / 3600);
        let m = Math.floor((sT % 3600) / 60);
        let s = Math.floor(sT % 60);
        document.getElementById('elapsed-time').textContent =
            `T+ ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        let v2_c2 = (vel * vel) / (C_LIGHT * C_LIGHT);
        let srFactor = 0.5 * v2_c2;
        let grFactor = (G * ME) / (alt + RE) / (C_LIGHT * C_LIGHT);
        let refGrFactor = (G * ME) / RE / (C_LIGHT * C_LIGHT);
        let grDeltaStr = (grFactor - refGrFactor);

        srDilationUsec -= srFactor * (simLeftTotal) * 1e6;
        grDilationUsec -= grDeltaStr * (simLeftTotal) * 1e6;

        document.getElementById('td-sr').textContent = srDilationUsec.toFixed(3) + ' μs';
        document.getElementById('td-gr').textContent = '+' + Math.abs(grDilationUsec).toFixed(3) + ' μs';
        let netDilation = srDilationUsec + Math.abs(grDilationUsec);
        document.getElementById('td-net').textContent = (netDilation >= 0 ? '+' : '') + netDilation.toFixed(3) + ' μs';
        let ke = 0.5 * vel * vel / 1e6;
        let pe = -(G * ME) / (alt + RE) / 1e6;
        let netE = ke + pe;
        if (document.getElementById('nrg-ke')) {
            document.getElementById('nrg-ke').textContent = ke.toFixed(2) + ' MJ/kg';
            document.getElementById('nrg-pe').textContent = pe.toFixed(2) + ' MJ/kg';
            document.getElementById('nrg-net').textContent = netE.toFixed(2) + ' MJ/kg';
            document.getElementById('nrg-net').style.color = netE >= 0 ? 'var(--hl)' : 'var(--text)';
        }
        document.getElementById('time-warp-label').textContent =
            warp < 1.5 ? '1×' : Math.round(warp).toLocaleString() + '×';
        if (phase == PHASE.IRL_ACTIVE) stepIRL(dt);
        if (phase == PHASE.COASTING) checkWinLose();
        let dot = document.getElementById('status-dot');
        if (phase == PHASE.COASTING || phase == PHASE.IRL_ACTIVE) {
            let dM = Math.hypot(moon.x - rocket.x, moon.y - rocket.y);
            dot.className = dM < SOI_MOON ? 'status-dot warning' : 'status-dot';
        } else {
            dot.className = 'status-dot';
        }
        if (gMode == MODE.CUSTOM && phase == PHASE.COASTING) {
            let dM = Math.hypot(moon.x - rocket.x, moon.y - rocket.y);
            if (dM < SOI_MOON * 0.5 && !hypeTriggered) {
                triggerHypeMusic();
            }
        }
    }
    if (phase == PHASE.TUTORIAL) {
        tutTimer += dt * 1000;
        if (tutTimer >= tutSteps[tutStep].dur) advanceTut();
    }

    updateCamera();
    updateAudio(dt);
    draw();
    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

