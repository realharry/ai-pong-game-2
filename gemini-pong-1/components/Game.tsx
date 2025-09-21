import React, { useRef, useEffect } from 'react';
// Fix: Removed DisplayObject from pixi.js import as it is not an exported member.
import { Application, Graphics, Container } from 'pixi.js';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
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
  paddleWidth: number;
  paddleHeight: number;
  isPaused: boolean;
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

    // Define game sounds (Refined for better feel)
    sounds.paddleHit = createSound(880, 'sine', 0.08);        // A5, clean "ping"
    sounds.blockHit = createSound(200, 'sawtooth', 0.15);     // G#2, deeper "thud"
    sounds.playerScore = createSound(783.99, 'triangle', 0.3); // G5, positive score
    sounds.aiScore = createSound(130.81, 'sawtooth', 0.4);    // C3, lower score tone

  } catch (e) {
    console.error("Web Audio API is not supported in this browser.", e);
  }
};


const Game: React.FC<GameProps> = ({ onScoreUpdate, initialBallSpeed, speedIncrease, paddleWidth, paddleHeight, isPaused }) => {
  const gameCanvasRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<Application | null>(null);
  
  // Effect to control the ticker based on the isPaused prop from the parent
  useEffect(() => {
    if (pixiAppRef.current && pixiAppRef.current.ticker) {
      if (isPaused) {
        pixiAppRef.current.ticker.stop();
      } else {
        pixiAppRef.current.ticker.start();
      }
    }
  }, [isPaused]);

  useEffect(() => {
    let isMounted = true;
    let gameActive = true;

    // A unified cleanup function to be used in all scenarios.
    const cleanupPixiApp = (app: Application) => {
        // A single, comprehensive destroy call is the most robust way to prevent resource leaks.
        // It ensures the canvas, stage children, and their associated textures are all removed.
        // Fix: The `stageOptions` property for `app.destroy` is from older PixiJS versions. In modern PixiJS, options like `children`, `texture`, and `baseTexture` are top-level properties in the destroy options object.
        app.destroy({
            removeView: true,
            children: true,
            texture: true,
            baseTexture: true,
        });
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
          .drawRoundedRect(0, 0, paddleWidth, paddleHeight, 8);
        paddle.x = (GAME_WIDTH - paddleWidth) / 2;
        paddle.y = y;
        app.stage.addChild(paddle);
        return paddle;
      };
      
      const playerPaddle = createPaddle(GAME_HEIGHT - paddleHeight - PADDLE_Y_OFFSET, 0xFF007F); // Pink
      
      // --- AI Paddle with Glow Effect ---
      const aiPaddleContainer = new Container();
      aiPaddleContainer.x = (GAME_WIDTH - paddleWidth) / 2;
      aiPaddleContainer.y = PADDLE_Y_OFFSET;

      const aiPaddleGlow = new Graphics()
          .fill({ color: 0x00FFFF, alpha: 0.3 })
          .drawRoundedRect(-2, -2, paddleWidth + 4, paddleHeight + 4, 10); // Subtle glow

      const aiPaddleGraphic = new Graphics()
          .fill(0x00FFFF)
          .drawRoundedRect(0, 0, paddleWidth, paddleHeight, 8);

      aiPaddleContainer.addChild(aiPaddleGlow, aiPaddleGraphic);
      app.stage.addChild(aiPaddleContainer);
      const aiPaddle = aiPaddleContainer; // The container is now the main AI paddle object

      const ball = new Graphics()
        .fill(0xFFFFFF) // White
        .circle(0, 0, BALL_RADIUS);
      app.stage.addChild(ball);

      // --- Breakable Blocks Setup ---
      const BLOCK_MAX_HEALTH = 3;
      type Block = Graphics & { health: number };
      const allBlocks: Block[] = [];

      const blockPositions = [
          {x: GAME_WIDTH / 4 - BLOCK_WIDTH / 2, y: GAME_HEIGHT / 2 - BLOCK_HEIGHT * 1.5},
          {x: GAME_WIDTH * 3/4 - BLOCK_WIDTH / 2, y: GAME_HEIGHT / 2 - BLOCK_HEIGHT * 1.5},
          {x: GAME_WIDTH / 2 - BLOCK_WIDTH / 2, y: GAME_HEIGHT / 2 + BLOCK_HEIGHT * 0.5},
      ];

      const resetBlocks = () => {
        allBlocks.forEach(block => {
          block.health = BLOCK_MAX_HEALTH;
          block.alpha = 1.0;
          block.visible = true;
        });
      };

      blockPositions.forEach(pos => {
          const block = new Graphics()
            .fill(0x4A5568) // Gray
            .drawRoundedRect(0, 0, BLOCK_WIDTH, BLOCK_HEIGHT, 5);
          block.x = pos.x;
          block.y = pos.y;
          (block as Block).health = BLOCK_MAX_HEALTH;
          app.stage.addChild(block);
          allBlocks.push(block as Block);
      });

      // --- Center Line ---
      const centerLine = new Graphics();
      for (let i = 0; i < GAME_WIDTH; i += 20) {
        centerLine.rect(i, GAME_HEIGHT / 2 - 1, 10, 2).fill({ color: 0x4A5568, alpha: 0.5 });
      }
      app.stage.addChild(centerLine);

      // --- Game State ---
      let ballVelocity = { x: 0, y: 0 };
      let currentBallSpeed = initialBallSpeed;

      const resetBall = (direction: number) => {
        resetBlocks(); // Reset blocks on score
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
        const halfPaddleWidth = paddleWidth / 2;
        if (newX < halfPaddleWidth) newX = halfPaddleWidth;
        if (newX > GAME_WIDTH - halfPaddleWidth) newX = GAME_WIDTH - halfPaddleWidth;
        playerPaddle.x = newX - halfPaddleWidth;
      });
      
      // --- Collision Detection ---
      const checkCollision = (objA: Graphics | Container, objB: Graphics | Container) => {
          const a = objA.getBounds();
          const b = objB.getBounds();
          return a.x + a.width > b.x && a.x < b.x + b.width && a.y + a.height > b.y && a.y < b.y + b.height;
      }

      // --- Game Loop & Particle Effects Setup ---
      const TRAIL_MAX_LIFE = 20;
      type TrailParticle = Graphics & { life: number };
      const trailParticles: TrailParticle[] = [];

      const EXPLOSION_MAX_LIFE = 70; // Increased life for a bigger explosion
      type ExplosionParticle = Graphics & { 
        life: number; 
        startLife: number; // For accurate fading and scaling
        velocity: { x: number; y: number } 
      };
      const explosionParticles: ExplosionParticle[] = [];

      let glowCounter = 0; // For AI paddle glow animation
      const GRAVITY = 0.05; // A little gravity for explosion particles

      // Enhanced explosion to be more visually impactful
      const createExplosion = (x: number, y: number, color: number) => {
        const particleCount = 40; // More particles for a bigger burst
        const accentColor1 = 0x00FFFF; // Cyan
        const accentColor2 = 0xFFFFFF; // White flash for a brighter pop

        for (let i = 0; i < particleCount; i++) {
            const particleSize = Math.random() * 6 + 2; // Slightly larger, more varied pieces
            
            // Color variation for a more dynamic explosion
            const rand = Math.random();
            const particleColor = rand < 0.7 ? color : (rand < 0.9 ? accentColor1 : accentColor2);
            
            // Use rectangles for a "shattered block" effect
            const particle = new Graphics()
                .fill(particleColor)
                .rect(0, 0, particleSize, particleSize);
            
            particle.pivot.set(particleSize / 2, particleSize / 2); // Set pivot for rotation
            particle.rotation = Math.random() * Math.PI * 2;
            particle.x = x;
            particle.y = y;
            
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2; // More explosive speed
            const life = Math.random() * EXPLOSION_MAX_LIFE + (EXPLOSION_MAX_LIFE * 0.5);

            (particle as ExplosionParticle).velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            (particle as ExplosionParticle).life = life;
            (particle as ExplosionParticle).startLife = life; // Store initial life

            app.stage.addChild(particle);
            explosionParticles.push(particle as ExplosionParticle);
        }
      };


      app.ticker.add((ticker) => {
        if (!gameActive) return;
        
        const delta = ticker.deltaTime;
        
        // Animate AI Paddle Glow
        glowCounter += 0.05 * delta;
        const pulse = (Math.sin(glowCounter) + 1) / 2; // Oscillates between 0 and 1
        aiPaddleGlow.alpha = 0.2 + pulse * 0.4; // Pulsates alpha between 0.2 and 0.6

        // Ball movement
        ball.x += ballVelocity.x * delta;
        ball.y += ballVelocity.y * delta;

        // --- All Collision Logic ---
        let shouldNormalize = false;

        // Wall collision
        if (ball.x - BALL_RADIUS < 0 || ball.x + BALL_RADIUS > GAME_WIDTH) {
          ballVelocity.x *= -1;
          shouldNormalize = true; // Ensure consistent speed even after wall bounce
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
          if (checkCollision(ball, paddle as Graphics | Container)) {
              sounds.paddleHit?.();
              ballVelocity.y *= -1;
              // Prevent sticking by moving ball outside paddle
              if (paddle === playerPaddle) {
                ball.y = paddle.y - BALL_RADIUS;
              } else {
                ball.y = paddle.y + paddleHeight + BALL_RADIUS;
              }
              
              // Influence x velocity based on where it hit the paddle
              const hitPoint = ball.x - (paddle.x + paddleWidth / 2);
              ballVelocity.x += (hitPoint / (paddleWidth / 2)) * 2;
              
              // Increase speed
              currentBallSpeed = Math.min(currentBallSpeed + speedIncrease, MAX_BALL_SPEED);
              shouldNormalize = true;
          }
        });

        // Block collision with breakable logic
        for (const block of allBlocks) {
            if (!block.visible) continue;

            const ballCenterX = ball.x;
            const ballCenterY = ball.y;
            const blockCenterX = block.x + BLOCK_WIDTH / 2;
            const blockCenterY = block.y + BLOCK_HEIGHT / 2;
            const dx = ballCenterX - blockCenterX;
            const dy = ballCenterY - blockCenterY;
            const combinedHalfWidths = BALL_RADIUS + BLOCK_WIDTH / 2;
            const combinedHalfHeights = BALL_RADIUS + BLOCK_HEIGHT / 2;

            if (Math.abs(dx) < combinedHalfWidths && Math.abs(dy) < combinedHalfHeights) {
                const overlapX = combinedHalfWidths - Math.abs(dx);
                const overlapY = combinedHalfHeights - Math.abs(dy);
                
                // Max bounce angle (e.g., 75 degrees)
                const MAX_BOUNCE_ANGLE = (5 * Math.PI) / 12;

                if (overlapY < overlapX) { // Vertical collision
                    // Push ball out of block to prevent sticking
                    ball.y += dy > 0 ? overlapY : -overlapY;
                    
                    const normalizedHitPointX = (ball.x - blockCenterX) / (BLOCK_WIDTH / 2);
                    const bounceAngle = normalizedHitPointX * MAX_BOUNCE_ANGLE;
                    
                    // The direction of the bounce is determined by which side was hit
                    const direction = Math.sign(dy);
                    
                    ballVelocity.x = currentBallSpeed * Math.sin(bounceAngle);
                    ballVelocity.y = currentBallSpeed * Math.cos(bounceAngle) * direction;

                } else { // Horizontal collision
                    // Push ball out of block to prevent sticking
                    ball.x += dx > 0 ? overlapX : -overlapX;
                    
                    const normalizedHitPointY = (ball.y - blockCenterY) / (BLOCK_HEIGHT / 2);
                    const bounceAngle = normalizedHitPointY * MAX_BOUNCE_ANGLE;
                    
                    // The direction of the bounce is determined by which side was hit
                    const direction = Math.sign(dx);
                    
                    ballVelocity.y = currentBallSpeed * Math.sin(bounceAngle);
                    ballVelocity.x = currentBallSpeed * Math.cos(bounceAngle) * direction;
                }

                sounds.blockHit?.();
                // No need to set shouldNormalize, speed is preserved by the angle calculation.

                // Handle breakable blocks
                block.health -= 1;
                if (block.health <= 0) {
                    block.visible = false;
                    createExplosion(blockCenterX, blockCenterY, 0x4A5568);
                } else {
                    block.alpha = 0.3 + (block.health / BLOCK_MAX_HEALTH) * 0.7;
                }
                
                break; // Handle only one block collision per frame
            }
        }

        // Re-normalize the ball's speed after any collision to maintain consistency
        if (shouldNormalize) {
            const magnitude = Math.sqrt(ballVelocity.x**2 + ballVelocity.y**2);
            if (magnitude > 0) {
                ballVelocity.x = (ballVelocity.x / magnitude) * currentBallSpeed;
                ballVelocity.y = (ballVelocity.y / magnitude) * currentBallSpeed;
            }
        }

        // --- Ball Trail Effect ---
        const trailParticle = new Graphics()
            .fill(0x00FFFF)
            .circle(0, 0, BALL_RADIUS);
        trailParticle.x = ball.x;
        trailParticle.y = ball.y;
        trailParticle.alpha = 0.5;
        (trailParticle as TrailParticle).life = TRAIL_MAX_LIFE;
        app.stage.addChild(trailParticle);
        trailParticles.push(trailParticle as TrailParticle);

        for (let i = trailParticles.length - 1; i >= 0; i--) {
            const particle = trailParticles[i];
            particle.life -= 1 * delta;

            if (particle.life <= 0) {
                app.stage.removeChild(particle);
                particle.destroy();
                trailParticles.splice(i, 1);
            } else {
                const lifeRatio = particle.life / TRAIL_MAX_LIFE;
                particle.alpha = lifeRatio * 0.5;
                particle.scale.set(lifeRatio);
            }
        }
        
        // --- Explosion particle update ---
        for (let i = explosionParticles.length - 1; i >= 0; i--) {
            const particle = explosionParticles[i];
            particle.life -= 1 * delta;

            if (particle.life <= 0) {
                app.stage.removeChild(particle);
                particle.destroy();
                explosionParticles.splice(i, 1);
            } else {
                particle.velocity.y += GRAVITY * delta; // Apply gravity for a more realistic arc
                particle.x += particle.velocity.x * delta;
                particle.y += particle.velocity.y * delta;
                const lifeRatio = particle.life / particle.startLife;
                particle.alpha = lifeRatio;
                particle.scale.set(lifeRatio);
                particle.rotation += 0.05 * delta; // Add a slow spin
            }
        }

        // --- AI Movement (Refined) ---
        let aiTargetX = aiPaddle.x + paddleWidth / 2;

        if (ballVelocity.y < 0) {
            const timeToReachPaddle = (aiPaddle.y + paddleHeight - ball.y) / -ballVelocity.y;
            let predictedX = ball.x + ballVelocity.x * timeToReachPaddle;

            if (predictedX < BALL_RADIUS) {
                predictedX = BALL_RADIUS + (BALL_RADIUS - predictedX);
            } else if (predictedX > GAME_WIDTH - BALL_RADIUS) {
                predictedX = (GAME_WIDTH - BALL_RADIUS) - (predictedX - (GAME_WIDTH - BALL_RADIUS));
            }
            
            const maxError = paddleWidth / 3 * (1 - speedIncrease);
            const error = (Math.random() - 0.5) * maxError;
            aiTargetX = predictedX + error;
        } else {
            aiTargetX = GAME_WIDTH / 2;
        }
        
        const targetXForPaddle = aiTargetX - paddleWidth / 2;
        let newAiX = aiPaddle.x + (targetXForPaddle - aiPaddle.x) * aiReactionSpeed * delta;
        
        if (newAiX < 0) newAiX = 0;
        if (newAiX > GAME_WIDTH - paddleWidth) newAiX = GAME_WIDTH - paddleWidth;
        aiPaddle.x = newAiX;
      });
    };

    initPixiApp();

    return () => {
      isMounted = false;
      gameActive = false;
      // Cleanup PIXI app
      if (pixiAppRef.current) {
        cleanupPixiApp(pixiAppRef.current);
        pixiAppRef.current = null;
      }
      // Cleanup Audio Context for robust resource management
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once

  return <div ref={gameCanvasRef} style={{ width: GAME_WIDTH, height: GAME_HEIGHT }} />;
};

export default Game;