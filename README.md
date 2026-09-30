# AeroSense — breath-based drug screening

**Team Nostromo · Sri Krishna College of Engineering and Technology (SKCET)**
**Smart India Hackathon 2026 · Problem Statement SIH26230**

**Live site:** https://nostromo-mauve.vercel.app
**Project video (4 min):** https://youtu.be/PgWyJ9FsXK0
**Live IoT dashboard:** https://aero-sense-application.vercel.app
**This repository:** the source of the site above. Its three pages explain the device, show it in 3D, and break down every component.

---

## The problem statement (SIH26230)

> **Breath-Based Detection Device for Drug Consumption**
> Ministry of Home Affairs · Narcotics Control Bureau · Hardware · MedTech / BioTech / HealthTech

A breathalyzer tells police in seconds whether someone has been drinking. There is nothing like it for drugs. Today, suspected drug use means a urine or blood sample, a trip to a lab and a wait of days. SIH26230 asks for a portable, non-invasive device that screens for recent drug use at the point of testing and gives a clear **positive / negative / inconclusive** result. It is meant as a **proof-of-concept prototype** that shows technical feasibility.

## Our answer: AeroSense

A handheld reader that goes from **one breath to one number**.

1. **Catch the droplets, don't sniff the gas.** Most drugs aren't volatile, so they don't leave the body as a gas the way alcohol does. They ride out in tiny breath droplets. AeroSense sends the breath through a narrow slit (a Venturi nozzle) that speeds it into a jet. The droplets are too heavy to follow the air when it turns, so they land on the sensor. This is inertial impaction.
2. **A wet circuit, waiting for a sample.** The droplets land on a **pre-cast hydrogel pad**. It contains agarose to hold the water, saline to carry the current, and a redox probe, and it sits on a screen-printed carbon electrode. Nothing is added at the roadside; the pad is sealed until use.
3. **Read it electrochemically.** A small potentiostat sweeps the electrode. Drug molecules settle on the carbon and block electron transfer, so the current drops. A second reference electrode cancels background effects such as humidity.
4. **Classify on the device.** An on-device **Random Forest** turns the curve into **Normal / Retest / Flag for lab**. If the trees don't agree strongly enough, it says so instead of guessing.
5. **Touch mode as a backup.** If someone can't or won't blow, a cover slides open and they hold a fingertip on the same pad for 5–10 s. Sweat carries the same compounds, the same electrode reads it, and the same model classifies it.

It's a **screen, not a verdict.** Every positive goes to a lab for confirmation. The roadside test only decides who needs one.

| | Today | AeroSense (targets) |
|---|---|---|
| Sample | Urine / blood (invasive) | One breath, or a fingertip |
| Time to answer | Hours to days (lab) | < 45 s at the roadside |
| Cost per test | Lab test | ₹35–50 cartridge (projected) |
| Result | Lab report | Normal / Retest / Flag for lab |

## Where we are

- **Phase 1:** an MQ gas-sensor "e-nose" on an ESP32 with an ML classifier. It taught us that gas sensors are the wrong tool for non-volatile drugs, so we moved to catching droplets.
- **Phase 2 (built):** a breath-chamber prototype on an ESP32 rig with a purge fan and red/yellow/green result LEDs.
- **Design:** the full reader and the clear cartridge are modelled in SolidWorks, shown in the video.
- **Next:** a two-week sprint to add aerosol capture and the hydrogel electrode using off-the-shelf modules.

Figures marked target or projected on the site are design goals, not measured results. Surrogate chemistry is used for demos.

## What's on the site (and in this repo)

| Page | File | What you'll find |
|---|---|---|
| **Home** `/` | `index.html` | The team, the flagship build with an interactive 3D reader, the project video, field work (police station visit, pulmonologist consult, SKCET internal hackathon) and the full SIH26230 problem statement (click **SIH26230** anywhere) |
| **AeroSense** `/aerosense` | `aerosense.html` | The science, step by step: why droplets, a **live inertial-impaction simulator**, the hydrogel pad in 3D, touch mode, a scroll-driven teardown of the device, and an explorer with exploded view and part hotspots |
| **Components** `/components` | `components.html` | Every hardware part and what it does, the signal path from breath to answer, the four software layers, and the ML plan (Random Forest now, 1D-CNN once the data exists) |

**Code map**

- `site.js`: shared behaviour. Smooth scrolling, page transitions, the problem-statement popup, the video player, the scroll animations.
- `device3d.js`, `showcase.js`: the 3D AeroSense reader (three.js).
- `gel3d.js`: the 3D hydrogel pad with droplets landing and touch mode.
- `main.js`: the 2D inertial-impaction particle simulator (jet speed and nozzle width sliders).
- `styles.css`: all styling. `img/`: photos, renders, team portraits.

It's a plain HTML/CSS/JS site with no build step, deployed on Vercel.

## Team Nostromo

| Name | Year & branch |
|---|---|
| [Hariz Rahman](https://www.linkedin.com/in/hariz-rahman-6203bb330/) | III Year · B.E. EEE |
| [Rohit R](https://www.linkedin.com/in/rohit-r-14b371326/) | III Year · B.E. EEE |
| [Jyothi Anu Raagga](https://www.linkedin.com/in/jyothi-anu-raagga-443ba921a/) | III Year · B.E. CSE |
| [Sarveshvar S](https://www.linkedin.com/in/sarveshvar-s-218715277/) | III Year · B.Tech IT |
| [Muthu Ezhil M](https://www.linkedin.com/in/muthu-ezhil-929463276/) | IV Year · B.E. EEE |
| [Pubeshvaran S G](https://www.linkedin.com/in/pubeshvaran-s-g-9a26b7318/) | IV Year · B.E. EEE |

---

<details>
<summary><b>Run it locally / deploy</b></summary>

```bash
npx serve .            # open http://localhost:3000 (needs internet for three.js and fonts)
# or: python -m http.server  (then open /aerosense.html, since clean URLs are a Vercel feature)
```

Vercel: import the repo, Framework Preset **Other**, no build command. `vercel.json` turns on clean URLs (`/aerosense`) and long image caching.

</details>
