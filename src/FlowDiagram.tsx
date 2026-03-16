import React from "react";
import type { FlowStep } from "./App";

interface Props {
  steps: FlowStep[];
  participants: string[];
}

const stepArrows: Record<string, [number, number]> = {
  "reg-1": [0, 1],  // Browser -> Server
  "reg-2": [1, 0],  // Server -> Browser
  "reg-3": [0, 2],  // Browser -> Authenticator
  "reg-4": [0, 1],  // Browser -> Server
  "auth-1": [0, 1],
  "auth-2": [1, 0],
  "auth-3": [0, 2],
  "auth-4": [0, 1],
};

export function FlowDiagram({ steps, participants }: Props) {
  return (
    <div className="flow-diagram">
      {/* Participant headers */}
      <div className="flow-participants">
        {participants.map((p, i) => (
          <div key={i} className="participant">
            <div className="participant-icon">
              {i === 0 ? "🌐" : i === 1 ? "🖥️" : "🔑"}
            </div>
            <span>{p}</span>
          </div>
        ))}
      </div>

      {/* Vertical lines */}
      <div className="flow-lines">
        {steps.map((step) => {
          const [from, to] = stepArrows[step.id] || [0, 1];
          const left = from < to;
          return (
            <div
              key={step.id}
              className={`flow-arrow flow-arrow-${step.status}`}
            >
              <div
                className="arrow-line"
                style={{
                  gridColumn: `${Math.min(from, to) + 1} / ${Math.max(from, to) + 2}`,
                }}
              >
                <div className={`arrow-body ${left ? "arrow-right" : "arrow-left"}`}>
                  <span className="arrow-label">{step.title}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
