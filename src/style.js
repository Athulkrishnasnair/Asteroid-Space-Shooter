// src/style.js
// Behavior layer for the intro / transmission cinematic defined in index.html.
// Pure DOM + Canvas2D — deliberately kept separate from PixiJS. Nothing here
// touches Game.js. Call `startIntro({ onComplete })` once from main.js.

import { voice } from "./services/voice.js";
import { commentary } from "./services/commentary.js";

// ---------------------------------------------------------------------
// Centralized placeholder asset config.
// When the art team's spritesheet lands, point these at the real files
// and swap the .placeholder-ship DOM node (or this module) for a PixiJS
// Sprite / AnimatedSprite — do NOT rewrite the sequencing logic below to
// do it, just change what gets rendered at the "ship" mount point.
// ---------------------------------------------------------------------
export const ASSET_PATHS = {
  shipIdle: "/assets/ship/placeholder.png", // future: replace with real atlas frame
  shipSheet: null, // future: e.g. "/assets/ship/ship.json" (atlas) once provided
};

const DIALOGUE_PART_1 = [
  "Attention, unauthorized spacecraft.",
  "You have entered the forbidden superlative space of Central Vienium, a region so dangerously classified that even our paperwork is classified.",
  "By order of the Celestial Custody Authority, you are hereby placed under immediate custody.",
  "You have two options.",
];

const DIALOGUE_PART_2 = ["Interesting.", "You chose incorrectly.", "Prepare for interception."];

const TYPE_SPEED_MS = 22; // per character
const SIGNAL_LINE_DELAY_MS = 700;

function qs(id) {
  return document.getElementById(id);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolves once the user clicks the panel or presses Space/Enter.
function waitForAdvance(panelEl) {
  return new Promise((resolve) => {
    const onKey = (e) => {
      if (e.code === "Space" || e.code === "Enter") {
        cleanup();
        resolve();
      }
    };
    const onClick = () => {
      cleanup();
      resolve();
    };
    function cleanup() {
      window.removeEventListener("keydown", onKey);
      panelEl.removeEventListener("click", onClick);
    }
    window.addEventListener("keydown", onKey);
    panelEl.addEventListener("click", onClick);
  });
}

async function typeLine(targetEl, text) {
  targetEl.textContent = "";
  targetEl.classList.add("is-typing");
  for (let i = 0; i < text.length; i++) {
    targetEl.textContent += text[i];
    // eslint-disable-next-line no-await-in-loop
    await wait(TYPE_SPEED_MS);
  }
  targetEl.classList.remove("is-typing");
}

// ---------------------------------------------------------------------
// Starfield — three parallax layers of drifting pixels. Lightweight,
// no dependencies, runs on a plain canvas underneath the DOM UI.
// ---------------------------------------------------------------------
function initStarfield(canvas) {
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let rafId = null;

  const layers = [
    { count: 60, speed: 0.15, size: 1, color: "#3d4652" },
    { count: 40, speed: 0.35, size: 1.5, color: "#e8e1d3" },
    { count: 20, speed: 0.6, size: 2, color: "#4a8b8b" },
  ].map((cfg) => ({
    ...cfg,
    stars: [],
  }));

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function seed() {
    for (const layer of layers) {
      layer.stars = Array.from({ length: layer.count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
      }));
    }
  }

  function tick() {
    ctx.clearRect(0, 0, width, height);
    for (const layer of layers) {
      ctx.fillStyle = layer.color;
      for (const star of layer.stars) {
        star.y += layer.speed;
        if (star.y > height) {
          star.y = 0;
          star.x = Math.random() * width;
        }
        ctx.fillRect(star.x, star.y, layer.size, layer.size);
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  resize();
  seed();
  tick();

  window.addEventListener("resize", () => {
    resize();
    seed();
  });

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}

// ---------------------------------------------------------------------
// Occasional CRT glitch burst — toggles a class for ~150ms at random
// intervals. Restrained: not a constant effect.
// ---------------------------------------------------------------------
function startGlitchLoop(rootEl) {
  let timeoutId = null;
  let stopped = false;

  function scheduleNext() {
    const delay = 2500 + Math.random() * 4000;
    timeoutId = setTimeout(() => {
      if (stopped) return;
      rootEl.classList.add("is-glitching");
      setTimeout(() => rootEl.classList.remove("is-glitching"), 120 + Math.random() * 100);
      scheduleNext();
    }, delay);
  }

  scheduleNext();

  return () => {
    stopped = true;
    if (timeoutId) clearTimeout(timeoutId);
  };
}

// ---------------------------------------------------------------------
// Modal wiring (vessel database + control scheme) — usable throughout
// the whole intro, closable via button or Escape.
// ---------------------------------------------------------------------
function wireModal({ openBtn, modalEl, closeBtn }) {
  function open() {
    modalEl.hidden = false;
    modalEl.setAttribute("aria-hidden", "false");
  }
  function close() {
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden", "true");
  }
  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && !modalEl.hidden) close();
  });
  return { open, close, isOpen: () => !modalEl.hidden };
}

const LANDING_REMARKS = [
  "Ah. Two humans. Your compatibility evaluation has been scheduled.",
  "Scanning emotional synchronization... Suspicious levels of confidence detected.",
  "Two players. One spaceship. Highly questionable tactical decisions.",
  "Central Vienium recommends trying not to embarrass yourselves immediately.",
  "I have absolutely no confidence in this cooperation.",
];

// ---------------------------------------------------------------------
// Main sequence
// ---------------------------------------------------------------------
export async function startIntro({ onComplete }) {
  const intro = qs("intro");
  const starfieldCanvas = qs("starfield");
  const landingHero = qs("landing-hero");
  const landingAlienText = qs("landing-alien-text");
  const btnStartMission = qs("btn-start-mission");
  const signal = qs("signal");
  const hud = qs("hud");
  const dialoguePanel = qs("dialogue-panel");
  const dialogueText = qs("dialogue-text");
  const advancePrompt = qs("advance-prompt");
  const choicePanel = qs("choice-panel");
  const btnSurrender = qs("btn-surrender");
  const btnFight = qs("btn-fight");
  const utilityBar = qs("utility-bar");
  const fadeVeil = qs("fade-veil");

  const stopStars = initStarfield(starfieldCanvas);
  const stopGlitch = startGlitchLoop(intro);

  const databaseModal = wireModal({
    openBtn: qs("open-database"),
    modalEl: qs("database-modal"),
    closeBtn: qs("close-database"),
  });
  const controlsModal = wireModal({
    openBtn: qs("open-controls"),
    modalEl: qs("controls-modal"),
    closeBtn: qs("close-controls"),
  });

  // Rotate alien landing remarks
  let remarkIdx = 0;
  const remarkInterval = setInterval(() => {
    if (!landingAlienText || landingHero.hidden) return;
    remarkIdx = (remarkIdx + 1) % LANDING_REMARKS.length;
    landingAlienText.textContent = `"${LANDING_REMARKS[remarkIdx]}"`;
  }, 4200);

  const startLabel = btnStartMission.querySelector(".decree-btn__label");
  const startDesc = btnStartMission.querySelector(".decree-btn__desc");
  startLabel.textContent = "[ CLICK TO ESTABLISH ALIEN COMMUNICATION ]";
  startDesc.textContent = "Allow Central Vienium audio before the mission begins.";

  await new Promise((resolve) => {
    btnStartMission.addEventListener("click", () => {
      clearInterval(remarkInterval);
      voice.unlockAudio();
      startLabel.textContent = "[ START MISSION ]";
      startDesc.textContent = "Submit vessel to Central Vienium custody evaluation.";
      landingHero.style.display = "none";
      signal.hidden = false;

      // Alien speaks first greeting through Piper
      commentary.say("Ah. Two humans. Central Vienium has reviewed your application. Unfortunately, your application is suspicious. Proceed.", { force: true });
      resolve();
    }, { once: true });
  });

  // 1. Signal acquisition
  const signalLines = [qs("signal-line-1"), qs("signal-line-2"), qs("signal-line-3")];
  for (const line of signalLines) {
    line.classList.add("is-visible");
    // eslint-disable-next-line no-await-in-loop
    await wait(SIGNAL_LINE_DELAY_MS);
  }
  await wait(400);
  signal.style.display = "none";
  hud.hidden = false;
  utilityBar.hidden = false;
  const placeholderShip = qs("placeholder-ship");
  if (placeholderShip) placeholderShip.hidden = false;


  // 2. Dialogue part 1
  dialoguePanel.hidden = false;
  for (const line of DIALOGUE_PART_1) {
    // Speak line through Piper
    commentary.say(line, { force: true });
    // eslint-disable-next-line no-await-in-loop
    await typeLine(dialogueText, line);
    advancePrompt.classList.add("is-visible");
    // eslint-disable-next-line no-await-in-loop
    await waitForAdvance(dialoguePanel);
    advancePrompt.classList.remove("is-visible");
  }
  dialoguePanel.hidden = true;

  // 3. Choice — both options intentionally converge on the same outcome
  choicePanel.hidden = false;
  await new Promise((resolve) => {
    const finish = () => {
      btnSurrender.removeEventListener("click", finish);
      btnFight.removeEventListener("click", finish);
      resolve();
    };
    btnSurrender.addEventListener("click", finish);
    btnFight.addEventListener("click", finish);
  });
  choicePanel.hidden = true;

  // 4. Twist dialogue
  dialoguePanel.hidden = false;
  for (const line of DIALOGUE_PART_2) {
    // Speak line through Piper
    commentary.say(line, { force: true });
    // eslint-disable-next-line no-await-in-loop
    await typeLine(dialogueText, line);
    advancePrompt.classList.add("is-visible");
    // eslint-disable-next-line no-await-in-loop
    await waitForAdvance(dialoguePanel);
    advancePrompt.classList.remove("is-visible");
  }

  // 5. Transition into gameplay
  utilityBar.hidden = true;
  if (databaseModal.isOpen()) databaseModal.close();
  if (controlsModal.isOpen()) controlsModal.close();

  fadeVeil.classList.add("is-active");
  await wait(1000);

  stopStars();
  stopGlitch();
  intro.style.display = "none";

  if (typeof onComplete === "function") onComplete();
}