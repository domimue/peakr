import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QuizRunner } from '../quiz/quiz-runner';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const saveQuizProgress = vi.fn(async () => true);
vi.mock('../quiz-actions', () => ({
  saveQuizProgress: (...args: unknown[]) => saveQuizProgress(...(args as [])),
}));

beforeEach(() => {
  push.mockReset();
  saveQuizProgress.mockClear();
  window.scrollTo = vi.fn();
});

describe('QuizRunner', () => {
  it('starts with the intro and walks through a step with its insight', async () => {
    const user = userEvent.setup();
    render(<QuizRunner initial={null} signedIn={false} />);
    await user.click(screen.getByRole('button', { name: 'Start the quiz' }));

    expect(screen.getByText('What’s your goal?')).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toHaveProperty('disabled', true);

    await user.click(screen.getByLabelText(/5 km race/));
    await user.click(next);
    // The race insight comes between the goal and the next step.
    expect(screen.getByText(/weeks of preparation are recommended/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Which sports do you want to train?')).toBeTruthy();
    expect(saveQuizProgress).toHaveBeenCalledWith(
      expect.objectContaining({ answers: { goal: '5k' }, stepId: 'sports', finished: false }),
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-label')).toMatch(/^Step 2 of \d+$/);
  });

  it('resumes saved answers and goes back to the intro from the first step', async () => {
    const user = userEvent.setup();
    render(
      <QuizRunner
        initial={{ answers: { goal: 'fitness' }, stepId: 'sports', finished: false }}
        signedIn
      />,
    );
    expect(screen.queryByText('Already have Peakr?')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Continue where I stopped' }));
    expect(screen.getByText('Which sports do you want to train?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('What’s your goal?')).toBeTruthy();
    expect(screen.getByLabelText(/Get fitter|fitter/i)).toHaveProperty('checked', true);
  });
});
