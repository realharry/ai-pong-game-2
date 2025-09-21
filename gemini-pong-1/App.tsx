import React, { useState, useCallback, useEffect } from 'react';
import { GameState, Score } from './types';
import Game from './components/Game';
import { WINNING_SCORE, GAME_WIDTH, GAME_HEIGHT, INITIAL_BALL_SPEED, DEFAULT_SPEED_INCREASE } from './constants';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Slider } from './components/ui/Slider';
import { Label } from './components/ui/Label';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.Start);
  const [score, setScore] = useState<Score>({ player: 0, ai: 0 });
  const [winner, setWinner] = useState<string | null>(null);

  // Gameplay settings
  const [initialBallSpeed, setInitialBallSpeed] = useState(INITIAL_BALL_SPEED);
  const [speedIncrease, setSpeedIncrease] = useState(DEFAULT_SPEED_INCREASE);

  const handleScoreUpdate = useCallback((scorer: 'player' | 'ai') => {
    setScore(prevScore => ({
      ...prevScore,
      [scorer]: prevScore[scorer] + 1
    }));
  }, []);

  // useEffect to handle the side effect of a score change
  useEffect(() => {
    if (score.player >= WINNING_SCORE) {
      setWinner('You');
      setGameState(GameState.GameOver);
    } else if (score.ai >= WINNING_SCORE) {
      setWinner('AI');
      setGameState(GameState.GameOver);
    }
  }, [score]);


  const resetGame = () => {
    setScore({ player: 0, ai: 0 });
    setWinner(null);
  };
  
  const handleStartGame = () => {
    resetGame();
    setGameState(GameState.Playing);
  };

  const handlePlayAgain = () => {
    resetGame();
    setGameState(GameState.Playing);
  };
  
  const handleGoToMenu = () => {
    resetGame();
    setGameState(GameState.Start);
  };

  const renderContent = () => {
    switch (gameState) {
      case GameState.Start:
        return (
          <Card className="w-96">
            <h1 className="text-5xl font-bold text-cyan-400 tracking-wider">AI PONG</h1>
            <p className="text-slate-400 mt-2">An air-hockey style game against an AI.</p>
            
            <div className="w-full mt-8 space-y-6">
              <div className="space-y-2 text-left">
                <Label htmlFor="initial-speed">
                  Initial Ball Speed: <span className="font-bold text-cyan-400">{initialBallSpeed.toFixed(1)}</span>
                </Label>
                <Slider 
                  id="initial-speed"
                  min={2}
                  max={10}
                  step={0.5}
                  value={initialBallSpeed}
                  onValueChange={(value) => setInitialBallSpeed(value[0])}
                />
              </div>
              <div className="space-y-2 text-left">
                <Label htmlFor="speed-increase">
                  Speed Increase & AI Difficulty: <span className="font-bold text-cyan-400">{speedIncrease.toFixed(2)}</span>
                </Label>
                <Slider 
                  id="speed-increase"
                  min={0}
                  max={1}
                  step={0.05}
                  value={speedIncrease}
                  onValueChange={(value) => setSpeedIncrease(value[0])}
                />
              </div>
            </div>

            <Button onClick={handleStartGame} className="mt-8">
              Start Game
            </Button>
          </Card>
        );
      case GameState.GameOver:
        return (
          <Card>
            <h1 className="text-4xl font-bold text-white tracking-wider">Game Over</h1>
            <p className="text-2xl text-cyan-400 mt-4">{winner} Win!</p>
            <div className="flex space-x-4 mt-8">
              <Button onClick={handlePlayAgain}>Play Again</Button>
              <Button onClick={handleGoToMenu} variant="secondary">Main Menu</Button>
            </div>
          </Card>
        );
      case GameState.Playing:
        return <Game 
                 onScoreUpdate={handleScoreUpdate} 
                 initialBallSpeed={initialBallSpeed}
                 speedIncrease={speedIncrease}
               />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 font-sans p-4">
      <div 
        className="relative bg-black shadow-2xl shadow-cyan-500/20 border-2 border-slate-700"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
      >
        {gameState === GameState.Playing && (
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between text-white font-bold text-4xl pointer-events-none z-10">
            <span className="text-cyan-400">{score.ai}</span>
            <span className="text-pink-500">{score.player}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
            {renderContent()}
        </div>
      </div>
      <footer className="text-slate-500 mt-4 text-sm">
        Use your mouse to control the bottom paddle. First to {WINNING_SCORE} points wins.
      </footer>
    </div>
  );
};

export default App;