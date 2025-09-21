import React, { useRef, useEffect } from 'react';
// Fix: Removed DisplayObject from pixi.js import as it is not an exported member.
import { Application, Graphics, Container, Text } from 'pixi.js';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_Y_OFFSET,
  BALL_RADIUS,
  BLOCK_WIDTH,
  BLOCK_HEIGHT,
  MAX_BALL_SPEED,
} from '../constants';

interface GameProps {
  onScoreUpdate: (scorer: 'player' | 'ai') => void;
  initialBallSpeed: number;
  speedIncrease: number;
}

// --- Sound Engine ---
// Placed outside the component to manage a single AudioContext instance for the app.
let audioContext: AudioContext | null = null;
const sounds: { [key: string]: () => void } = {};

const initAudio = () => {
  // Initialize only once.
  if (audioContext) return;
  try {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const createSound = (freq: number, type: OscillatorType, duration: number) => {
      return () => {
        // Resume context on user interaction if it was suspended.
        if (!audioContext || audioContext.state === 'suspended') {
            audioContext?.resume();
        }
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
        
        // Simple ADSR-like envelope for a less harsh sound.
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01); // Attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration); // Decay/Release

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      };
    };

    // Define game sounds
    sounds.paddleHit = createSound(440, 'square', 0.1);      // A4, sharp hit
    sounds.blockHit = createSound(220, 'sawtooth', 0.15);   // A3, duller hit
    sounds.playerScore = createSound(659.25, 'triangle', 0.3); // E5, positive score
    sounds.aiScore = createSound(164.81, 'sine', 0.4);      // E3, negative score

  } catch (e) {
    console.error("Web Audio API is not supported in this browser.", e);
  }
};


const Game: React.FC<GameProps> = ({ onScoreUpdate, initialBallSpeed, speedIncrease }) => {
  const gameCanvasRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<Application | null>(null);
  
  useEffect(() => {
    let isMounted = true;
    let gameActive = true;
    let isPaused = false;
    let pauseContainer: Container | null = null;

    // A unified cleanup function to be used in all scenarios.
    const cleanupPixiApp = (app: Application) => {
        app.stage.destroy({
            children: true,
        });
        app.destroy({
            removeView: true,
        });
    };
    
    const handleKeyDown = (event: KeyboardEvent) => {
        if (!pixiAppRef.current || !pauseContainer) return;
        if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
            isPaused = !isPaused;
            pauseContainer.visible = isPaused;
            if (isPaused) {
                pixiAppRef.current.ticker.stop();
            } else {
                pixiAppRef.current.ticker.start();
            }
        }
    };

    // PIXI.js v8 requires an async initialization.
    const initPixiApp = async () => {
      if (!gameCanvasRef.current || pixiAppRef.current) {
        return;
      }
      
      const app = new Application();
      await app.init({
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: 0x0A0F1A, // Dark blue-ish background
        antialias: true,
      });

      if (!isMounted || !gameCanvasRef.current) {
        cleanupPixiApp(app);
        return;
      }
      
      pixiAppRef.current = app;
      gameCanvasRef.current.appendChild(app.canvas);

      // --- Initialize Audio ---
      // This is safe because the Game component only mounts after a user click ("Start Game")
      initAudio();

      // --- AI Difficulty ---
      // Map speedIncrease (0 to 1) to an AI reaction speed (e.g., 0.05 to 0.20)
      const AI_MIN_REACTION = 0.05; // Slower, easier AI
      const AI_MAX_REACTION = 0.20; // Faster, harder AI
      const aiReactionSpeed = AI_MIN_REACTION + (AI_MAX_REACTION - AI_MIN_REACTION) * speedIncrease;

      // --- Game Objects ---
      const createPaddle = (y: number, color: number) => {
        const paddle = new Graphics()
          .fill(color)
          .drawRoundedRect(0, 0, PADDLE_WIDTH, PADDLE_HEIGHT, 8);
        paddle.x = (GAME_WIDTH - PADDLE_WIDTH) / 2;
        paddle.y = y;
        app.stage.addChild(paddle);
        return paddle;
      };
      
      const playerPaddle = createPaddle(GAME_HEIGHT - PADDLE_HEIGHT - PADDLE_Y_OFFSET, 0xFF007F); // Pink
      const aiPaddle = createPaddle(PADDLE_Y_OFFSET, 0x00FFFF); // Cyan

      const ball = new Graphics()
        .fill(0xFFFFFF) // White
        .circle(0, 0, BALL_RADIUS);
      app.stage.addChild(ball);

      const blocks: Graphics[] = [];
      const blockPositions = [
          {x: GAME_WIDTH / 4 - BLOCK_WIDTH / 2, y: GAME_HEIGHT / 2 - BLOCK_HEIGHT * 1.5},
          {x: GAME_WIDTH * 3/4 - BLOCK_WIDTH / 2, y: GAME_HEIGHT / 2 - BLOCK_HEIGHT * 1.5},
          {x: GAME_WIDTH / 2 - BLOCK_WIDTH / 2, y: GAME_HEIGHT / 2 + BLOCK_HEIGHT * 0.5},
      ];

      blockPositions.forEach(pos => {
          const block = new Graphics()
            .fill(0x4A5568) // Gray
            .drawRoundedRect(0, 0, BLOCK_WIDTH, BLOCK_HEIGHT, 5);
          block.x = pos.x;
          block.y = pos.y;
          app.stage.addChild(block);
          blocks.push(block);
      });

      // --- Center Line ---
      const centerLine = new Graphics();
      for (let i = 0; i < GAME_WIDTH; i += 20) {
        centerLine.rect(i, GAME_HEIGHT / 2 - 1, 10, 2).fill({ color: 0x4A5568, alpha: 0.5 });
      }
      app.stage.addChild(centerLine);

      // --- Pause UI ---
      pauseContainer = new Container();
      pauseContainer.visible = false;
      app.stage.addChild(pauseContainer);

      const pauseOverlay = new Graphics()
        .fill({ color: 0x000000, alpha: 0.6 })
        .rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      pauseContainer.addChild(pauseOverlay);

      const pauseText = new Text({
        text: 'PAUSED',
        style: {
            fontFamily: 'sans-serif',
            fontSize: 72,
            fontWeight: 'bold',
            fill: 0x00FFFF, // Cyan
            align: 'center',
            stroke: { color: 0xFFFFFF, width: 2 },
            dropShadow: {
                color: '#00FFFF',
                blur: 15,
                alpha: 0.7,
                distance: 0,
            },
        },
      });
      pauseText.anchor.set(0.5);
      pauseText.x = GAME_WIDTH / 2;
      pauseText.y = GAME_HEIGHT / 2;
      pauseContainer.addChild(pauseText);

      // --- Game State ---
      let ballVelocity = { x: 0, y: 0 };
      let currentBallSpeed = initialBallSpeed;

      const resetBall = (direction: number) => {
        currentBallSpeed = initialBallSpeed;
        ball.x = GAME_WIDTH / 2;
        ball.y = GAME_HEIGHT / 2;
        const angle = Math.random() * (Math.PI / 2) - Math.PI / 4; // -45 to +45 deg
        ballVelocity = {
          x: Math.sin(angle) * currentBallSpeed,
          y: Math.cos(angle) * currentBallSpeed * direction,
        };
      };

      resetBall(Math.random() > 0.5 ? 1 : -1);

      // --- Mouse Control ---
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      app.stage.on('pointermove', (event) => {
        let newX = event.global.x;
        // Clamp paddle position to stay within game bounds
        const halfPaddleWidth = PADDLE_WIDTH / 2;
        if (newX < halfPaddleWidth) newX = halfPaddleWidth;
        if (newX > GAME_WIDTH - halfPaddleWidth) newX = GAME_WIDTH - halfPaddleWidth;
        playerPaddle.x = newX - halfPaddleWidth;
      });
      
      // --- Collision Detection ---
      const checkCollision = (objA: Graphics, objB: Graphics) => {
          const a = objA.getBounds();
          const b = objB.getBounds();
          return a.x + a.width > b.x && a.x < b.x + b.width && a.y + a.height > b.y && a.y < b.y + b.height;
      }

      // --- Game Loop & Trail Effect Setup ---
      const TRAIL_MAX_LIFE = 20;
      type TrailParticle = Graphics & { life: number };
      const trailParticles: TrailParticle[] = [];

      app.ticker.add((ticker) => {
        if (!gameActive) return;
        
        const delta = ticker.deltaTime;

        // Ball movement
        ball.x += ballVelocity.x * delta;
        ball.y += ballVelocity.y * delta;

        // Wall collision
        if (ball.x - BALL_RADIUS < 0 || ball.x + BALL_RADIUS > GAME_WIDTH) {
          ballVelocity.x *= -1;
        }

        // Score
        if (ball.y - BALL_RADIUS < 0) {
          sounds.playerScore?.();
          onScoreUpdate('player');
          resetBall(1); // Serve towards player
        } else if (ball.y + BALL_RADIUS > GAME_HEIGHT) {
          sounds.aiScore?.();
          onScoreUpdate('ai');
          resetBall(-1); // Serve towards AI
        }
        
        // Paddle collision
        const paddles = [playerPaddle, aiPaddle];
        paddles.forEach(paddle => {
          if (checkCollision(ball, paddle)) {
              sounds.paddleHit?.();
              ballVelocity.y *= -1;
              // Prevent sticking by moving ball outside paddle
              if (paddle === playerPaddle) {
                ball.y = paddle.y - BALL_RADIUS;
              } else {
                ball.y = paddle.y + PADDLE_HEIGHT + BALL_RADIUS;
              }
              
              // Influence x velocity based on where it hit the paddle
              const hitPoint = ball.x - (paddle.x + PADDLE_WIDTH / 2);
              ballVelocity.x += (hitPoint / (PADDLE_WIDTH / 2)) * 2;
              
              // Increase speed and apply it
              currentBallSpeed = Math.min(currentBallSpeed + speedIncrease, MAX_BALL_SPEED);
              const magnitude = Math.sqrt(ballVelocity.x**2 + ballVelocity.y**2);
              if (magnitude > 0) {
                  ballVelocity.x = (ballVelocity.x / magnitude) * currentBallSpeed;
                  ballVelocity.y = (ballVelocity.y / magnitude) * currentBallSpeed;
              }
          }
        });

        // Block collision
        blocks.forEach(block => {
            const ballCenterX = ball.x;
            const ballCenterY = ball.y;
            const blockCenterX = block.x + BLOCK_WIDTH / 2;
            const blockCenterY = block.y + BLOCK_HEIGHT / 2;

            const dx = ballCenterX - blockCenterX;
            const dy = ballCenterY - blockCenterY;

            const combinedHalfWidths = BALL_RADIUS + BLOCK_WIDTH / 2;
            const combinedHalfHeights = BALL_RADIUS + BLOCK_HEIGHT / 2;

            if (Math.abs(dx) < combinedHalfWidths && Math.abs(dy) < combinedHalfHeights) {
                sounds.blockHit?.();
                
                const overlapX = combinedHalfWidths - Math.abs(dx);
                const overlapY = combinedHalfHeights - Math.abs(dy);

                if (overlapX >= overlapY) {
                    // Collision is vertical (top or bottom)
                    ballVelocity.y *= -1;
                    // Nudge ball out of block to prevent sticking
                    ball.y += dy > 0 ? overlapY : -overlapY;
                } else {
                    // Collision is horizontal (left or right)
                    ballVelocity.x *= -1;
                    // Nudge ball out of block
                    ball.x += dx > 0 ? overlapX : -overlapX;
                }
            }
        });

        // --- Ball Trail Effect ---
        // Create a new particle at the ball's position
        const trailParticle = new Graphics()
            .fill(0x00FFFF) // A cyan glow
            .circle(0, 0, BALL_RADIUS);
        trailParticle.x = ball.x;
        trailParticle.y = ball.y;
        trailParticle.alpha = 0.5; // Start semi-transparent
        (trailParticle as TrailParticle).life = TRAIL_MAX_LIFE;
        app.stage.addChild(trailParticle);
        trailParticles.push(trailParticle as TrailParticle);

        // Update and remove old particles. Iterate backwards for safe removal.
        for (let i = trailParticles.length - 1; i >= 0; i--) {
            const particle = trailParticles[i];
            particle.life -= 1 * delta; // Frame-rate independent decay

            if (particle.life <= 0) {
                app.stage.removeChild(particle);
                particle.destroy(); // Free up WebGL resources
                trailParticles.splice(i, 1);
            } else {
                // Fade and shrink the particle over its lifetime
                const lifeRatio = particle.life / TRAIL_MAX_LIFE;
                particle.alpha = lifeRatio * 0.5;
                particle.scale.set(lifeRatio);
            }
        }

        // --- AI Movement (Refined) ---
        let aiTargetX = aiPaddle.x + PADDLE_WIDTH / 2;

        // Only predict and move if the ball is moving towards the AI.
        if (ballVelocity.y < 0) {
            // Predict where the ball will be at the paddle's y-level
            const timeToReachPaddle = (aiPaddle.y + PADDLE_HEIGHT - ball.y) / -ballVelocity.y;
            let predictedX = ball.x + ballVelocity.x * timeToReachPaddle;

            // Simple prediction of one wall bounce
            if (predictedX < BALL_RADIUS) {
                predictedX = BALL_RADIUS + (BALL_RADIUS - predictedX);
            } else if (predictedX > GAME_WIDTH - BALL_RADIUS) {
                predictedX = (GAME_WIDTH - BALL_RADIUS) - (predictedX - (GAME_WIDTH - BALL_RADIUS));
            }
            
            // Add a slight "imperfection" to make it more human-like.
            // Higher difficulty (higher speedIncrease) results in less error.
            const maxError = PADDLE_WIDTH / 3 * (1 - speedIncrease);
            const error = (Math.random() - 0.5) * maxError;
            aiTargetX = predictedX + error;
        } else {
            // If the ball is moving away, drift back to the center defensively.
            aiTargetX = GAME_WIDTH / 2;
        }
        
        // The target for the paddle's top-left corner
        const targetXForPaddle = aiTargetX - PADDLE_WIDTH / 2;

        // Move paddle towards the calculated target position
        let newAiX = aiPaddle.x + (targetXForPaddle - aiPaddle.x) * aiReactionSpeed * delta;
        
        // Clamp AI paddle position to stay within game bounds
        if (newAiX < 0) newAiX = 0;
        if (newAiX > GAME_WIDTH - PADDLE_WIDTH) newAiX = GAME_WIDTH - PADDLE_WIDTH;
        aiPaddle.x = newAiX;
      });

      window.addEventListener('keydown', handleKeyDown);
    };

    initPixiApp();

    return () => {
      isMounted = false;
      gameActive = false;
      window.removeEventListener('keydown', handleKeyDown);
      // Cleanup PIXI app
      if (pixiAppRef.current) {
        cleanupPixiApp(pixiAppRef.current);
        pixiAppRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once

  return <div ref={gameCanvasRef} style={{ width: GAME_WIDTH, height: GAME_HEIGHT }} />;
};

export default Game;
