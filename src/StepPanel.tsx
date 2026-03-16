import React from "react";
import type { FlowStep } from "./App";

interface Props {
  steps: FlowStep[];
}

const statusIcons: Record<string, string> = {
  pending: "○",
  active: "◉",
  done: "✓",
  error: "✗",
};

export function StepPanel({ steps }: Props) {
  return (
    <div className="step-panel">
      {steps.map((step) => (
        <div key={step.id} className={`step-card step-${step.status}`}>
          <div className="step-header">
            <span className={`step-icon step-icon-${step.status}`}>
              {statusIcons[step.status]}
            </span>
            <h3>{step.title}</h3>
          </div>
          <p className="step-desc">{step.description}</p>
          {step.status === "active" && (
            <div className="step-spinner">
              <div className="spinner" />
              <span>Изпълнява се...</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
