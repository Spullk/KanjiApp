// Runs the optimizer off the main thread so the page stays responsive.

import { optimize, type History, type Progress, type Result } from "./optimizer";

export type Request = { hs: History[]; start: number[] };
export type Reply = { progress: Progress } | { result: Result };

const ctx = self as unknown as { onmessage: (e: MessageEvent<Request>) => void; postMessage: (m: Reply) => void };

ctx.onmessage = (e) => {
  const result = optimize(e.data.hs, e.data.start, (progress) => {
    if (progress.step % 5 === 0) ctx.postMessage({ progress });
  });
  ctx.postMessage({ result });
};
