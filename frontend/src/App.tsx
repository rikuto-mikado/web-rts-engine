import { useEffect, useState } from "react";
import { api } from "./api/client";
import type { GameContent } from "./game/types";
import { GameScreen, type Match } from "./ui/GameScreen";
import { MainMenu } from "./ui/MainMenu";
import { RotateHint } from "./ui/RotateHint";

export default function App() {
  const [content, setContent] = useState<GameContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [matchNo, setMatchNo] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .content()
      .then((c) => !cancelled && setContent(c))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [retry]);

  if (match)
    return (
      <>
        <GameScreen key={matchNo} match={match} onExit={() => setMatch(null)} />
        <RotateHint />
      </>
    );
  return (
    <>
      <RotateHint />
      <MainMenu
        content={content}
        error={error}
        onRetry={() => setRetry((r) => r + 1)}
        onStart={(m) => {
          setMatchNo((n) => n + 1);
          setMatch(m);
        }}
      />
    </>
  );
}
