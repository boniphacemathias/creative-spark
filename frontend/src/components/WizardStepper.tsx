import { WIZARD_STEPS } from "@/types/campaign";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardStepperProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

export function WizardStepper({ currentStep, onStepClick }: WizardStepperProps) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex items-center min-w-max gap-0">
        {WIZARD_STEPS.map((step, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={i} className="flex items-center">
              <button
                onClick={() => onStepClick(i)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm whitespace-nowrap",
                  isCurrent && "bg-primary/10 border-glow",
                  !isCurrent && "hover:bg-secondary"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                  isCurrent && "bg-primary text-primary-foreground shadow-amber",
                  isCompleted && "bg-primary/20 text-primary",
                  !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
                )}>
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <div className="text-left">
                  <div className={cn(
                    "font-medium leading-tight",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}>{step.label}</div>
                  <div className="text-[10px] text-muted-foreground/60 leading-tight hidden sm:block">{step.description}</div>
                </div>
              </button>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={cn(
                  "w-6 h-px mx-1",
                  i < currentStep ? "bg-primary/40" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
