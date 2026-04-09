Artemis II Flight Dynamics Simulator

A mathematically rigorous, 1:1 scale N-body physics simulation of NASA's Artemis II mission, built from scratch using Vanilla JavaScript and HTML5 Canvas.

![Physics](https://img.shields.io/badge/Physics-N--Body%20Symplectic-blue)
![Language](https://img.shields.io/badge/Language-Vanilla%20JS-yellow)
![Accuracy](https://img.shields.io/badge/Accuracy-Deterministic-green)

🚀 Project Overview
This project is a high-fidelity orbital mechanics simulator designed to visualize the terrifying precision required for deep space flight. It recreates the entire Artemis II mission profile—from Low Earth Orbit (LEO) through the 24-hour High Earth Orbit (HEO) testing phase, to the Trans-Lunar Injection (TLI) and the free-return lunar flyby.

Key Features
**Symplectic Physics Engine:** Uses a 2nd-order Velocity Verlet integrator to ensure conservation of orbital energy over long time scales.
**The Butterfly Effect:** A maneuver planner that computes three parallel realities simultaneously (Nominal, +5m/s error, and -5m/s error) to demonstrate how tiny perturbations result in mission failure.
**Relativistic Time Dilation:** Real-time calculation of Special Relativity (velocity) and General Relativity (gravitational) time dilation for the crew relative to Earth observers.
**NASA AROW Integration:** Features visual ephemeris nodes based on the official NASA Artemis Real-time Orbit Website (AROW).
**Deterministic Adaptive Stepping:** A custom physics-lock system that synchronizes the high-speed prediction engine with the live simulation to prevent mathematical divergence.

🛠 Technical Deep Dive

1. The Physics Integrator
Most browser games use simple Euler integration (`pos += vel`). This fails in orbital mechanics due to energy drift. This simulator implements a Symplectic Velocity Verlet Integrator, which calculates acceleration based on the cumulative gravitational pull of the Earth and Moon simultaneously.

2. Relativistic Calculations
The simulator tracks time dilation using:
* **Special Relativity:** `Δt' = Δt√(1 - v²/c²)` (clocks slow down as velocity increases).
* **General Relativity:** `Δt' = Δt√(1 - 2GM/rc²)` (based on the difference in gravitational potential between the spacecraft and an observer on Earth's surface).

3. Mission Profile Accuracy
Unlike Apollo missions, Artemis II follows a unique "High Earth Orbit" profile. The engine accurately simulates:
* **LEO Insertion:** 185 km x 2,222 km.
* **PRM Burn:** Raising apogee to 74,000 km.
* **HEO Coast:** A 24-hour lap for ECLSS testing.
* **TLI Burn:** Firing at perigee with the Oberth effect to reach the Moon with optimal efficiency.

🕹 How to Run

Clone the repository:
```bash
git clone [https://github.com/dlowzzxx/artemis-ii-orbital-sim.git](https://github.com/dlowzzxx/artemis-ii-orbital-sim.git)
```
Open index.html in any modern web browser.

Note: Ensure interstellar.mp3 and notimeforcaution.mp3 are in the root directory for the cinematic audio experience.

🧠 Author
Erin Krasniqi
17-year-old Physics & Software Engineering enthusiast.

I built this project to bridge the gap between abstract theoretical physics and intuitive visual simulation. The goal was to prove that complex 3-body problems can be made accessible through clean code and interactive design.

📜 License
MIT License - feel free to use the physics core for your own orbital projects.
